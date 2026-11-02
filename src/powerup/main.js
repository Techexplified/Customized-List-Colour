/* global TrelloPowerUp */
import { isAuthorized } from "../lib/auth.js";
import { detectCardPriorities } from "../lib/trelloApi.js";

const ICON_URL =
  typeof window !== "undefined"
    ? new URL("./icons/icon.svg", window.location.href).href
    : "./icons/icon.svg";

TrelloPowerUp.initialize({
  // Capability: Check authorization status
  "authorization-status": async function (t) {
    const authorized = await isAuthorized(t);
    return { authorized };
  },

  // Capability: Show authorization popup
  "show-authorization": function (t) {
    return t.popup({
      title: "Authorize Conditional List Colors",
      url: "./auth.html",
      height: 380,
    });
  },

  // Capability: Show Power-Up settings
  "show-settings": function (t) {
    return t.popup({
      title: "Conditional List Colors Settings",
      url: "./settings.html",
      height: 380,
    });
  },

  // Capability: Board header button for opening List Colors manager
  "board-buttons": function () {
    return [
      {
        icon: {
          dark: ICON_URL,
          light: ICON_URL,
        },
        text: "List Colors",
        callback: async function (t) {
          const authorized = await isAuthorized(t);
          if (!authorized) {
            return t.popup({
              title: "Authorize Conditional List Colors",
              url: "./auth.html",
              height: 380,
            });
          }

          let listNames = [];
          try {
            const boardLists = await t.lists("all");
            if (Array.isArray(boardLists) && boardLists.length > 0) {
              listNames = boardLists.map((l) => l.name).filter(Boolean);
            }
          } catch (err) {
            // Silently fall back if lists query is restricted in this context
          }

          const query =
            listNames.length > 0
              ? `?lists=${encodeURIComponent(JSON.stringify(listNames))}`
              : "";

          return t.modal({
            url: `./rules.html${query}`,
            accentColor: "#22272b",
            fullscreen: false,
            height: 640,
            width: 1020,
            title: "Conditional List Color Rule Studio",
          });
        },
      },
    ];
  },

  // Capability: List action dropdown item
  "list-actions": function (t) {
    return [
      {
        text: "Configure List Colors…",
        callback: async function (t) {
          const authorized = await isAuthorized(t);
          if (!authorized) {
            return t.popup({
              title: "Authorize Conditional List Colors",
              url: "./auth.html",
              height: 380,
            });
          }

          let listNames = [];
          try {
            const boardLists = await t.lists("all");
            if (Array.isArray(boardLists) && boardLists.length > 0) {
              listNames = boardLists.map((l) => l.name).filter(Boolean);
            }
          } catch (err) {
            // Silently fall back if lists query is restricted in this context
          }

          const query =
            listNames.length > 0
              ? `?lists=${encodeURIComponent(JSON.stringify(listNames))}`
              : "";

          return t.modal({
            url: `./rules.html${query}`,
            accentColor: "#22272b",
            fullscreen: false,
            height: 640,
            width: 1020,
            title: "Conditional List Color Rule Studio",
          });
        },
      },
    ];
  },

  // Capability: Show Priority badge on front of card on board
  "card-badges": async function (t) {
    try {
      const card = await t.card("name", "labels", "due", "dueComplete");
      const priorities = detectCardPriorities(card);
      if (!priorities || priorities.length === 0) return [];

      const topPriority = priorities[0];
      const badgeConfig = {
        Urgent: { text: "⚡ Urgent", color: "red" },
        High: { text: "🔥 High", color: "orange" },
        Medium: { text: "🟡 Med", color: "yellow" },
        Low: { text: "🟢 Low", color: "green" },
      };

      const cfg = badgeConfig[topPriority];
      if (!cfg) return [];

      return [
        {
          text: cfg.text,
          color: cfg.color,
        },
      ];
    } catch (e) {
      return [];
    }
  },

  // Capability: Show Priority badge on back of card (inside card detail modal)
  "card-detail-badges": async function (t) {
    try {
      const card = await t.card("name", "labels", "due", "dueComplete");
      const priorities = detectCardPriorities(card);

      if (!priorities || priorities.length === 0) {
        return [
          {
            title: "Priority",
            text: "Normal / None",
            color: "light-gray",
            callback: function (context) {
              return context.modal({
                url: "./rules.html",
                accentColor: "#22272b",
                height: 640,
                width: 1020,
                title: "Conditional List Color Rule Studio",
              });
            },
          },
        ];
      }

      const topPriority = priorities[0];
      const isOverdue =
        card.due &&
        !card.dueComplete &&
        new Date(card.due).getTime() < Date.now();

      const detailText =
        isOverdue && topPriority === "Urgent"
          ? "⚡ Urgent (Overdue)"
          : `${topPriority} Priority`;

      const colorMap = {
        Urgent: "red",
        High: "orange",
        Medium: "yellow",
        Low: "green",
      };

      return [
        {
          title: "Detected Priority",
          text: detailText,
          color: colorMap[topPriority] || "blue",
          callback: function (context) {
            return context.modal({
              url: "./rules.html",
              accentColor: "#22272b",
              height: 640,
              width: 1020,
              title: "Conditional List Color Rule Studio",
            });
          },
        },
      ];
    } catch (e) {
      return [];
    }
  },
});
