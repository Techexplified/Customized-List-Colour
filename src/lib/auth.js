// Single source of truth for member's Trello authentication token for Conditional List Colors Power-Up.
//
// Stored in Trello's member-scoped private plugin storage:
// `t.set('member', 'private', 'token', token)`.
// It is scoped to that single member on the current board and cannot be read
// by any other board member.

export const APP_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_TRELLO_APP_KEY) ||
  "36aaae2ff57649840580d01a41f456e5";
export const APP_NAME = "Conditional List Colour";

// Shared message tag validated by authorized.js and AuthPopup.jsx
export const AUTH_MESSAGE_SOURCE = "conditional-list-color-auth";
export const BROADCAST_CHANNEL_NAME = "conditional_list_color_auth";

const TOKEN_KEY = "token";

/**
 * Retrieves the stored token from Trello member-private storage.
 * If running in Trello, Trello member-private storage is the authoritative source.
 * When a user removes personal data in Trello, this returns null.
 * @param {object} t - Trello Power-Up client instance
 * @returns {Promise<string|null>}
 */
export async function getToken(t) {
  // 1. Authoritative source: Trello member-scoped private storage
  if (t && typeof t.get === "function") {
    try {
      const token = await t.get("member", "private", TOKEN_KEY);
      if (token) {
        return token;
      }
      // If Trello returned null/undefined, the user has NOT authorized
      // or has clicked "Remove personal data" in Trello.
      // Clean up localStorage to prevent resurrecting deleted credentials:
      try {
        localStorage.removeItem("trello_token");
        localStorage.removeItem("trello_token_time");
      } catch (e) {}
      return null;
    } catch (e) {
      return null;
    }
  }

  // 2. Standalone / local demo fallback (only when 't' is not available)
  try {
    return localStorage.getItem("trello_token") || null;
  } catch (e) {
    return null;
  }
}

/**
 * Saves the authenticated token into Trello member-private storage and localStorage.
 * @param {object} t - Trello Power-Up client instance
 * @param {string} token - Trello member OAuth token
 * @returns {Promise<void>}
 */
export async function saveToken(t, token) {
  try {
    if (token) {
      localStorage.setItem("trello_token", token);
      localStorage.setItem("trello_token_time", Date.now().toString());
    } else {
      localStorage.removeItem("trello_token");
      localStorage.removeItem("trello_token_time");
    }
  } catch (e) {}

  if (t && typeof t.set === "function") {
    try {
      if (token) {
        await t.set("member", "private", TOKEN_KEY, token);
      } else if (typeof t.remove === "function") {
        await t.remove("member", "private", TOKEN_KEY);
      }
    } catch (e) {}
  }
}

/**
 * Clears the stored token from Trello member-private storage and localStorage.
 * @param {object} t - Trello Power-Up client instance
 * @returns {Promise<void>}
 */
export async function clearToken(t) {
  try {
    localStorage.removeItem("trello_token");
    localStorage.removeItem("trello_token_time");
  } catch (e) {}

  if (t && typeof t.remove === "function") {
    try {
      await t.remove("member", "private", TOKEN_KEY);
    } catch (e) {}
  } else if (t && typeof t.set === "function") {
    try {
      await t.set("member", "private", TOKEN_KEY, null);
    } catch (e) {}
  }
}

/**
 * Checks whether the member currently has an authorized token.
 * @param {object} t - Trello Power-Up client instance
 * @returns {Promise<boolean>}
 */
export async function isAuthorized(t) {
  const token = await getToken(t);
  return Boolean(token);
}

/**
 * Constructs the Trello OAuth authorization URL for Conditional List Colour.
 * @param {string} returnUrl - Full URL to authorized.html on the current origin
 * @returns {string} Complete authorization URL
 */
export function buildAuthorizeUrl(returnUrl) {
  const params = new URLSearchParams({
    expiration: "never",
    name: APP_NAME,
    scope: "read,write",
    response_type: "token",
    key: APP_KEY || "",
    return_url: returnUrl,
  });

  return `https://trello.com/1/authorize?${params.toString()}`;
}
