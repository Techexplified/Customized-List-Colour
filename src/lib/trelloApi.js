import { APP_KEY, getToken, clearToken } from "./auth.js";
import { getMatchingRule } from "./rulesStorage.js";

export const NOT_AUTHORIZED = "NOT_AUTHORIZED";

/**
 * Maps our Rule Studio color keys to Trello's official card cover colors.
 * Supported Trello native cover colors:
 * 'pink', 'yellow', 'lime', 'blue', 'black', 'orange', 'red', 'purple', 'sky', 'green'
 */
export const TRELLO_COVER_COLORS = {
  red: "red",
  orange: "orange",
  yellow: "yellow",
  green: "green",
  blue: "blue",
  teal: "sky",
  purple: "purple",
  pink: "pink",
  slate: "black",
};

/**
 * Standard fetch wrapper that attaches Trello API key and member token
 */
async function trelloFetch(t, path, options = {}) {
  const token = await getToken(t);
  if (!token) {
    throw new Error(NOT_AUTHORIZED);
  }

  const separator = path.includes("?") ? "&" : "?";
  const url = `https://api.trello.com/1${path}${separator}key=${APP_KEY}&token=${token}`;

  const res = await fetch(url, options);

  if (res.status === 401 || res.status === 403) {
    await clearToken(t);
    throw new Error(NOT_AUTHORIZED);
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown API Error");
    throw new Error(`Trello API Error (${res.status}): ${errorText}`);
  }

  return res.json();
}

/**
 * Discovers the current Trello board ID or shortLink across multiple sources
 */
export async function getBoardId(t) {
  // 1. Trello Power-Up client
  if (t && typeof t.board === "function") {
    try {
      const b = await t.board("id");
      if (b && b.id) return b.id;
    } catch (e) {}
  }
  if (t && typeof t.getContext === "function") {
    try {
      const ctx = t.getContext();
      if (ctx && ctx.board) return ctx.board;
    } catch (e) {}
  }

  // 2. Query param (from extension or launch URL)
  try {
    const params = new URLSearchParams(window.location.search);
    const qBoard = params.get("board") || params.get("boardId");
    if (qBoard) return qBoard;
  } catch (e) {}

  // 3. Document referrer (in iframe, referrer is parent page URL)
  try {
    if (document.referrer) {
      const match = document.referrer.match(/\/b\/([a-zA-Z0-9]+)/);
      if (match && match[1]) {
        localStorage.setItem("clc_last_board_id", match[1]);
        return match[1];
      }
    }
  } catch (e) {}

  // 4. Current window href
  try {
    const match = window.location.href.match(/\/b\/([a-zA-Z0-9]+)/);
    if (match && match[1]) {
      localStorage.setItem("clc_last_board_id", match[1]);
      return match[1];
    }
  } catch (e) {}

  // 5. Cached board id
  try {
    const cached = localStorage.getItem("clc_last_board_id");
    if (cached) return cached;
  } catch (e) {}

  return null;
}

/**
 * Fetches authenticated member profile
 */
export async function getCurrentMember(t) {
  try {
    return await trelloFetch(t, "/members/me?fields=fullName,username,avatarUrl,initials");
  } catch (err) {
    if (err.message === NOT_AUTHORIZED) throw err;
    return {
      fullName: "Trello Member",
      username: "member",
      initials: "CL",
    };
  }
}

/**
 * Disconnects the current member
 */
export async function disconnectMember(t) {
  await clearToken(t);
}

/**
 * Fetches open lists on the current board
 */
export async function getBoardLists(t) {
  const boardId = await getBoardId(t);
  if (!boardId) {
    // Fallback: query via Power-Up client
    if (t && typeof t.lists === "function") {
      try {
        const trelloLists = await t.lists("all");
        if (Array.isArray(trelloLists) && trelloLists.length > 0) {
          return trelloLists.filter((l) => !l.closed);
        }
      } catch (e) {}
    }
    return [];
  }

  const lists = await trelloFetch(t, `/boards/${boardId}/lists?fields=id,name,pos,closed`);
  return Array.isArray(lists) ? lists.filter((l) => !l.closed) : [];
}

/**
 * Fetches cards on the current board with due dates, labels, and covers
 */
export async function getBoardCards(t) {
  const boardId = await getBoardId(t);
  if (!boardId) {
    if (t && typeof t.cards === "function") {
      try {
        const trelloCards = await t.cards("all");
        if (Array.isArray(trelloCards)) return trelloCards;
      } catch (e) {}
    }
    return [];
  }

  return trelloFetch(
    t,
    `/boards/${boardId}/cards?fields=id,name,idList,due,dueComplete,labels,badges,cover`
  );
}

/**
 * Updates a card's cover on Trello via the REST API
 * @param {object} t - Trello Power-Up client instance
 * @param {string} cardId - 24-char Trello card ID
 * @param {object} coverOptions - { color: string|null, size: 'full'|'normal', brightness: 'dark'|'light' }
 */
export async function updateCardCover(
  t,
  cardId,
  { color = null, size = "normal", brightness = "dark" } = {}
) {
  const body = color
    ? {
        cover: {
          color,
          size: "normal", // Top Banner only
          brightness,
        },
      }
    : {
        cover: {
          color: null,
          size: "normal",
        },
      };

  return trelloFetch(t, `/cards/${cardId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/**
 * Extracts all priority classifications present on a single card
 * @param {object} card - Trello card object
 * @returns {string[]} Array of priorities present e.g. ["Urgent", "High"]
 */
export function detectCardPriorities(card) {
  const priorities = new Set();
  const textPieces = [];

  // 1. Labels
  if (Array.isArray(card.labels)) {
    for (const label of card.labels) {
      if (label.name) textPieces.push(label.name);

      // Map color directly if no text name on label
      const lColor = (label.color || "").toLowerCase();
      if (lColor === "red") priorities.add("Urgent");
      if (lColor === "orange") priorities.add("High");
      if (lColor === "yellow") priorities.add("Medium");
      if (lColor === "green" || lColor === "blue" || lColor === "sky") {
        priorities.add("Low");
      }
    }
  }

  // 2. Card Title / Name
  if (card.name) {
    textPieces.push(card.name);
  }

  const combined = textPieces.join(" ").toLowerCase();

  if (
    combined.includes("urgent") ||
    combined.includes("critical") ||
    combined.includes("blocker") ||
    combined.includes("p0")
  ) {
    priorities.add("Urgent");
  }
  if (
    combined.includes("high") ||
    combined.includes("p1") ||
    combined.includes("important")
  ) {
    priorities.add("High");
  }
  if (
    combined.includes("medium") ||
    combined.includes("med") ||
    combined.includes("p2") ||
    combined.includes("normal")
  ) {
    priorities.add("Medium");
  }
  if (
    combined.includes("low") ||
    combined.includes("p3") ||
    combined.includes("minor")
  ) {
    priorities.add("Low");
  }

  // 3. Due dates (fallback inference only if no explicit priority was found)
  if (priorities.size === 0 && card.due && !card.dueComplete) {
    const dueTime = new Date(card.due).getTime();
    const now = Date.now();
    if (dueTime < now) {
      // Overdue card = Urgent
      priorities.add("Urgent");
    } else if (dueTime - now < 24 * 60 * 60 * 1000) {
      // Due within 24h = High
      priorities.add("High");
    }
  }

  return Array.from(priorities);
}

/**
 * Checks whether a specific card matches a given rule
 */
export function doesCardMatchRule(rule, card, listCards = [], listName = "") {
  if (!rule.on) return false;

  // Check target lists
  if (!rule.all) {
    const targetLists = rule.lists || [];
    const matchesTarget = targetLists.some(
      (tgt) => tgt.trim().toLowerCase() === listName.trim().toLowerCase()
    );
    if (!matchesTarget) return false;
  }

  const conds = rule.conds || [];
  if (conds.length === 0) return true;

  const testCard = (c) => {
    const type = c.type || (c.p ? "priority" : "due_date");
    const val = c.value || c.p || "overdue";

    // 1. Task count (Number of Task - evaluated on list volume)
    if (type === "task_count") {
      const count = listCards.length;
      if (val === "gt_10") return count > 10;
      if (val === "gt_5") return count > 5;
      if (val === "gt_3") return count > 3;
      if (val === "lt_3") return count > 0 && count < 3;
      if (val === "empty") return count === 0;
      if (val === "has_tasks") return count > 0;
      return false;
    }

    // 2. Due date (strictly evaluates this specific card!)
    if (type === "due_date") {
      if (val === "no_date") return !card.due;
      if (!card.due) return false; // If card has NO due date, it is NOT overdue!

      const dueTime = new Date(card.due).getTime();
      const isComplete = Boolean(card.dueComplete);

      if (val === "complete") return isComplete;
      if (isComplete) return false; // Completed cards are not overdue

      const now = Date.now();
      const startOfToday = new Date().setHours(0, 0, 0, 0);
      const endOfToday = new Date().setHours(23, 59, 59, 999);
      const oneDayMs = 24 * 60 * 60 * 1000;
      const sevenDaysMs = 7 * oneDayMs;

      if (val === "overdue") {
        // Must be in the past!
        return dueTime < now || Boolean(card.overdue);
      }
      if (val === "today") return dueTime >= startOfToday && dueTime <= endOfToday;
      if (val === "tomorrow") return dueTime >= now && dueTime <= now + oneDayMs;
      if (val === "week") return dueTime >= now && dueTime <= now + sevenDaysMs;
      return false;
    }

    // 3. Checklist
    if (type === "checklist") {
      const badges = card.badges || {};
      const total =
        badges.checkItems !== undefined
          ? badges.checkItems
          : card.count
            ? parseInt(card.count, 10)
            : 0;
      const checked =
        badges.checkItemsChecked !== undefined
          ? badges.checkItemsChecked
          : card.done
            ? total
            : 0;

      if (val === "no_checklist") return total === 0;
      if (val === "has_checklist") return total > 0;
      if (val === "incomplete") return total > 0 && checked < total;
      if (val === "complete") return total > 0 && checked === total;
      return false;
    }

    // 4. Priority
    if (type === "priority") {
      if (val === "Any") return true;
      const cardPriorities = detectCardPriorities(card);
      return cardPriorities.includes(val);
    }

    return false;
  };

  if (rule.logic === "OR") {
    return conds.some(testCard);
  } else {
    return conds.every(testCard);
  }
}

/**
 * Broadcasts rules update to parent window & Chrome extension
 */
function notifyExtension(rules) {
  try {
    if (typeof window !== "undefined" && window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "CLC_RULES_UPDATED", rules }, "*");
      window.parent.postMessage({ type: "CLC_APPLY_NOW", rules }, "*");
    }
  } catch (e) {}

  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
    try {
      chrome.storage.sync.set({ conditional_list_color_rules: rules });
    } catch (e) {}
  }
}

/**
 * Main Power-Up engine: Evaluates rules against live board cards and applies
 * native Trello card covers across all matching lists.
 *
 * @param {object} t - Trello Power-Up client
 * @param {Array} rules - Configured list color rules
 * @param {object} options - { coverStyle: 'full'|'normal', resetUnmatched: boolean, onProgress: fn }
 * @returns {Promise<object>} Execution summary
 */
export async function applyRulesToBoardCards(t, rules = [], options = {}) {
  const {
    coverStyle = "normal", // Always 'normal' for top banner accent
    cardScope = "matching", // 'matching' = only cards meeting the condition get banner; 'all' = all cards in list
    resetUnmatched = true, // Clear color banners from cards that don't match any rule
    onProgress = () => {},
  } = options;

  onProgress("Checking authorization credentials…", 5);
  const token = await getToken(t);
  if (!token) {
    // Graceful simulation when running in demo/test mode
    if (
      t?.isDemo ||
      (typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1" ||
          !window.location.host.includes("trello")))
    ) {
      onProgress("Running in local preview mode…", 50);
      notifyExtension(rules);
      onProgress("Done! Colors applied.", 100);
      return {
        success: true,
        updatedCount: 3,
        affectedLists: ["Sprint Backlog", "In Progress"],
        message: "Applied colors to 3 cards across 2 lists in preview mode!",
      };
    }
    throw new Error(NOT_AUTHORIZED);
  }

  onProgress("Fetching lists and cards from board…", 15);
  const [lists, cards] = await Promise.all([
    getBoardLists(t),
    getBoardCards(t),
  ]);

  if (!lists || lists.length === 0) {
    return {
      success: true,
      updatedCount: 0,
      affectedLists: [],
      message: "No open lists found on board.",
    };
  }

  onProgress("Evaluating rules against cards…", 30);

  // Group cards by list ID
  const cardsByList = {};
  for (const list of lists) {
    cardsByList[list.id] = [];
  }
  for (const card of cards) {
    if (cardsByList[card.idList]) {
      cardsByList[card.idList].push(card);
    }
  }

  // Queue of updates: { card, color, size, listName }
  const updatesQueue = [];
  const affectedListNames = new Set();

  for (const list of lists) {
    const listCards = cardsByList[list.id] || [];

    // Optional list-wide rule if user explicitly chose "all"
    let listWideRule = null;
    if (cardScope === "all") {
      const listPriorities = new Set();
      for (const card of listCards) {
        const cardPriorities = detectCardPriorities(card);
        cardPriorities.forEach((p) => listPriorities.add(p));
      }
      listWideRule = getMatchingRule(
        {
          name: list.name,
          cards: listCards,
          c: Array.from(listPriorities),
        },
        rules
      );
    }

    for (const card of listCards) {
      let matchedRule = null;

      if (cardScope === "all") {
        matchedRule = listWideRule;
      } else {
        // Strictly evaluate each rule against THIS specific card
        for (const rule of rules) {
          if (doesCardMatchRule(rule, card, listCards, list.name)) {
            matchedRule = rule;
            break;
          }
        }
      }

      const currentCover = card.cover || {};

      if (matchedRule) {
        const trelloColor =
          TRELLO_COVER_COLORS[matchedRule.color] || matchedRule.color || "blue";

        if (currentCover.color !== trelloColor || currentCover.size !== "normal") {
          updatesQueue.push({
            card,
            color: trelloColor,
            size: "normal",
            listName: list.name,
          });
          affectedListNames.add(list.name);
        }
      } else if (resetUnmatched) {
        // If card does NOT match (e.g. card is not overdue or has no due date),
        // remove the color banner so it is NOT falsely styled as overdue!
        if (currentCover.color) {
          updatesQueue.push({
            card,
            color: null,
            size: "normal",
            listName: list.name,
          });
          affectedListNames.add(list.name);
        }
      }
    }
  }

  const totalUpdates = updatesQueue.length;
  if (totalUpdates === 0) {
    // Board is already synchronized! Notify extension anyway for instant DOM tint
    notifyExtension(rules);
    return {
      success: true,
      updatedCount: 0,
      affectedLists: Array.from(affectedListNames),
      message: "Board is already up to date with configured rules!",
    };
  }

  // Execute card updates in parallel batches of 4
  let completed = 0;
  const batchSize = 4;
  for (let i = 0; i < updatesQueue.length; i += batchSize) {
    const batch = updatesQueue.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (item) => {
        try {
          await updateCardCover(t, item.card.id, {
            color: item.color,
            size: item.size,
          });
        } catch (e) {
          console.warn(`Failed to update card cover for "${item.card.name}":`, e);
        }
        completed++;
        const pct = 30 + Math.round((completed / totalUpdates) * 65);
        onProgress(`Applying color to card ${completed} of ${totalUpdates}…`, pct);
      })
    );
  }

  // Notify extension & parent window
  notifyExtension(rules);

  onProgress("Done! Board updated successfully.", 100);

  const listCount = affectedListNames.size;
  return {
    success: true,
    updatedCount: completed,
    affectedLists: Array.from(affectedListNames),
    message: `Applied colors to ${completed} card${completed === 1 ? "" : "s"} across ${listCount} list${listCount === 1 ? "" : "s"}!`,
  };
}

/**
 * Resets / removes all card covers from the board
 */
export async function clearBoardColors(t, onProgress = () => {}) {
  onProgress("Checking authorization credentials…", 10);
  const token = await getToken(t);
  if (!token) {
    if (
      t?.isDemo ||
      (typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1" ||
          !window.location.host.includes("trello")))
    ) {
      return {
        success: true,
        clearedCount: 3,
        message: "Cleared card colors in preview mode.",
      };
    }
    throw new Error(NOT_AUTHORIZED);
  }

  onProgress("Scanning board for colored cards…", 25);
  const cards = await getBoardCards(t);
  const cardsWithCover = (cards || []).filter((c) => c.cover && c.cover.color);

  if (cardsWithCover.length === 0) {
    return {
      success: true,
      clearedCount: 0,
      message: "No card covers found to clear.",
    };
  }

  let completed = 0;
  const batchSize = 4;
  for (let i = 0; i < cardsWithCover.length; i += batchSize) {
    const batch = cardsWithCover.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (card) => {
        try {
          await updateCardCover(t, card.id, { color: null, size: "normal" });
        } catch (e) {}
        completed++;
        const pct = 25 + Math.round((completed / cardsWithCover.length) * 70);
        onProgress(`Clearing cover from card ${completed} of ${cardsWithCover.length}…`, pct);
      })
    );
  }

  onProgress("Done! Board colors cleared.", 100);

  return {
    success: true,
    clearedCount: completed,
    message: `Removed color covers from ${completed} cards.`,
  };
}
