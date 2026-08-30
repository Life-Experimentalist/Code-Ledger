/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Who is allowed to send which runtime message.
 *
 * The service worker answers roughly fifty message types on two
 * `chrome.runtime.onMessage` listeners, and until now every one of them was
 * reachable by anything that could call `chrome.runtime.sendMessage` — which
 * includes every content script we inject, on five third-party platform
 * domains plus our own site. A content script that gets subverted (a hostile
 * page exploiting a bug in one of the handlers, a malicious userscript sharing
 * the isolated world, a compromised platform) could ask the background to
 * reset the user's repository, restore an arbitrary backup over their data, or
 * pull settings — including AI endpoint URLs — down from a remote source.
 *
 * `externally_connectable` is deliberately not set in either manifest and
 * nothing registers `onMessageExternal`, so an ordinary web page cannot reach
 * these listeners directly today. That is the only reason this was not
 * critical. It is also a property of the manifest rather than of this code,
 * and one line in a future manifest edit would remove it, so the boundary is
 * enforced here as well.
 *
 * The rule: extension pages (library, welcome, popup — anything served from
 * our own chrome-extension:// origin) may send anything. Everyone else may
 * send only the types on the list below, which is exactly what our content
 * scripts are observed to send.
 */

/**
 * Message types our content scripts legitimately send.
 *
 * Each entry is here because a file that runs as a content script sends it:
 *
 *   CODELEDGER_AUTH_RELAY      content/presence-marker.js (further origin-gated)
 *   CODELEDGER_CODE_FETCHED    content/handler-loader.js, leetcode, geeksforgeeks
 *   EB_EMIT                    core/event-bus.js
 *   OPEN_LIBRARY               content/presence-marker.js, ui/floating-ai.js
 *   AI_CHAT, AI_CHAT_UPDATED   ui/floating-ai.js
 *   AI_CHAT_STORE              core/ai-chat-storage.js (via floating-ai)
 *   RECORD_HINT_VIEW           handlers/platforms/leetcode/modal-tabs.js
 *   GET_AI_REVIEW_QUEUE_STATUS,
 *   REGENERATE_AI_REVIEW,
 *   PROCESS_REVIEW_QUEUE_NOW,
 *   GET_QUEUE_STATS,
 *   GET_QUEUE_ITEMS,
 *   REMOVE_QUEUE_ITEM,
 *   CANCEL_AI_REVIEW_QUEUE     library/components/ProblemModal.js and the queue
 *                              UI, which modal-tabs.js renders over the
 *                              LeetCode and GeeksForGeeks pages
 *   REFRESH_METADATA,
 *   REFRESH_METADATA_DONE      ui/components/MissingMetadataModal.js,
 *                              handlers/platforms/codeforces/index.js
 *   GET_ALL_PROBLEM_IDS,
 *   GET_PROBLEMS_BY_IDS,
 *   BULK_IMPORT,
 *   DELETE_PROBLEM,
 *   GFG_VERIFY_SWEEP,
 *   SYNC_PREVIEW               the profile importers, which run as content
 *                              scripts on the user's own profile pages
 *
 * Adding a type here widens what a subverted platform page can ask for. Before
 * adding one, check that the handler cannot destroy or exfiltrate data. In
 * particular do NOT add: RESET_REPO, FORCE_REBUILD_REPO, MIGRATE_REPO,
 * RESTORE_GITHUB_BACKUP, SYNC_SETTINGS_FROM_GITHUB, BACKUP_TO_REPO,
 * RESYNC_ALL, CODELEDGER_RUN_MIGRATIONS or REPO_REPAIR.
 */
export const CONTENT_SCRIPT_ALLOWED = Object.freeze([
  "AI_CHAT",
  "AI_CHAT_STORE",
  "AI_CHAT_UPDATED",
  "BULK_IMPORT",
  "CANCEL_AI_REVIEW_QUEUE",
  "CODELEDGER_AUTH_RELAY",
  "CODELEDGER_CODE_FETCHED",
  "DELETE_PROBLEM",
  "EB_EMIT",
  "GET_AI_REVIEW_QUEUE_STATUS",
  "GET_ALL_PROBLEM_IDS",
  "GET_PROBLEMS_BY_IDS",
  "GET_QUEUE_ITEMS",
  "GET_QUEUE_STATS",
  "GFG_VERIFY_SWEEP",
  "OPEN_LIBRARY",
  "PROCESS_REVIEW_QUEUE_NOW",
  "RECORD_HINT_VIEW",
  "REFRESH_METADATA",
  "REFRESH_METADATA_DONE",
  "REGENERATE_AI_REVIEW",
  "REMOVE_QUEUE_ITEM",
  "SYNC_PREVIEW",
]);

const ALLOWED_SET = new Set(CONTENT_SCRIPT_ALLOWED);

/**
 * Scheme + host of a URL, or "" if it does not parse.
 *
 * Deliberately not `URL.origin`. For a non-special scheme like
 * chrome-extension:// or moz-extension://, browsers return a real origin but
 * Node's WHATWG URL returns the string "null" — so an origin comparison passes
 * in Chrome and fails under node:test, which would leave this guard untestable
 * on the only path that matters. protocol and host are computed identically
 * everywhere.
 *
 * @param {string|undefined|null} url
 */
export function originOf(url) {
  if (typeof url !== "string" || !url) return "";
  try {
    const u = new URL(url);
    return u.host ? `${u.protocol}//${u.host}` : "";
  } catch {
    return "";
  }
}

/**
 * True when the message came from one of our own extension pages.
 *
 * The test is the sender URL's origin, not `sender.tab === undefined`: the
 * library runs in an ordinary tab, so it has a `sender.tab` just like a
 * content script does. `sender.url` is set by the browser, not by the sender,
 * so it cannot be forged from page or content-script script.
 *
 * @param {{url?: string, tab?: {url?: string}}|undefined|null} sender
 * @param {string} extensionOrigin  from originOf(chrome.runtime.getURL(""))
 */
export function isExtensionPageSender(sender, extensionOrigin) {
  if (!extensionOrigin) return false;
  const senderOrigin = originOf(sender?.url);
  return senderOrigin !== "" && senderOrigin === extensionOrigin;
}

/**
 * Whether `type` may be handled for this sender.
 *
 * @param {string} type
 * @param {{url?: string, tab?: {url?: string}}|undefined|null} sender
 * @param {string} extensionOrigin
 */
export function isMessageAllowed(type, sender, extensionOrigin) {
  if (typeof type !== "string" || !type) return false;
  if (isExtensionPageSender(sender, extensionOrigin)) return true;
  return ALLOWED_SET.has(type);
}
