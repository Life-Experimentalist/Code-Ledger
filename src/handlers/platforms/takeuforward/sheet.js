/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Striver sheet marking.
 *
 * The sheets — A2Z, SDE, 79 — are free and public, and are where most people
 * actually work. Nothing is solved on them: each row links out to LeetCode (or
 * to the TUF+ editor for subscribers). So this file never commits anything. It
 * does one thing: put a ✓ on the rows CodeLedger has already recorded a solve
 * for, wherever that solve happened.
 *
 * That is worth doing because the sheet's own checkboxes only know about
 * problems you ticked *on takeuforward*. A problem solved on LeetCode last
 * month shows as untouched. This closes that gap without asking the user to
 * keep two lists.
 *
 * Matching is by problem id, not by fuzzy title. A row exposes at most two
 * slugs — its TUF+ slug and its LeetCode slug — and each becomes a candidate
 * id through `CONSTANTS.makeProblemId`. An id either exists in the ledger or
 * it does not, so a mark is never a guess.
 */

import { SELECTORS, LEGACY_SELECTORS } from "./dom-selectors.js";
import { CONSTANTS } from "../../../core/constants.js";
import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("TUFSheet");

/** Set on a row once marked, so re-scans are idempotent. */
const MARKED_ATTR = "data-codeledger-solved";
const MARK_CLASS = "codeledger-sheet-mark";

/**
 * The slug out of a problem url, or null.
 *
 * LeetCode links on the sheet carry a text fragment — `#:~:text=Two%20Sum` —
 * and some carry a trailing `/description/`. Both have to come off before the
 * slug matches the one the LeetCode handler recorded.
 *
 * @param {string} href
 * @param {string} marker the path segment that precedes the slug
 * @returns {string|null}
 */
export function slugFromHref(href, marker) {
  const url = String(href || "");
  const at = url.indexOf(marker);
  if (at === -1) return null;

  const rest = url.slice(at + marker.length);
  const slug = rest.split(/[/?#]/)[0].trim();
  return slug || null;
}

/**
 * Every problem row on the page, with whatever slugs it exposes.
 *
 * @param {ParentNode} root
 * @returns {Array<{row: Element, tufSlug: string|null, leetcodeSlug: string|null}>}
 */
export function readSheetRows(root) {
  const rows = new Map();

  const collect = (selector, marker, field) => {
    for (const a of root.querySelectorAll(selector)) {
      const row = a.closest(SELECTORS.sheet.row) || a.closest(LEGACY_SELECTORS.sheet.row);
      if (!row) continue;
      const entry = rows.get(row) || { row, tufSlug: null, leetcodeSlug: null };
      if (!entry[field]) entry[field] = slugFromHref(a.getAttribute("href"), marker);
      rows.set(row, entry);
    }
  };

  collect(SELECTORS.sheet.tufLink, "/plus/dsa/problems/", "tufSlug");
  collect(SELECTORS.sheet.leetcodeLink, "leetcode.com/problems/", "leetcodeSlug");

  return [...rows.values()].filter((r) => r.tufSlug || r.leetcodeSlug);
}

/**
 * The problem ids a row could have been solved under.
 *
 * @param {{tufSlug: string|null, leetcodeSlug: string|null}} row
 * @returns {string[]}
 */
export function candidateIds(row) {
  const ids = [];
  if (row.tufSlug) ids.push(CONSTANTS.makeProblemId("takeuforward", row.tufSlug));
  if (row.leetcodeSlug) {
    ids.push(CONSTANTS.makeProblemId("leetcode", row.leetcodeSlug));
    // NeetCode reuses LeetCode's slug for most of the Blind 75, which overlaps
    // the sheets heavily. Cheap to check, and it catches real solves.
    ids.push(CONSTANTS.makeProblemId("neetcode", row.leetcodeSlug));
  }
  return ids;
}

/**
 * Put the mark on every row whose problem is in `solvedIds`.
 *
 * @param {Array<{row: Element, tufSlug: string|null, leetcodeSlug: string|null}>} rows
 * @param {Set<string>} solvedIds
 * @returns {number} rows newly marked
 */
export function markRows(rows, solvedIds) {
  let marked = 0;

  for (const entry of rows) {
    if (entry.row.hasAttribute(MARKED_ATTR)) continue;
    if (!candidateIds(entry).some((id) => solvedIds.has(id))) continue;

    entry.row.setAttribute(MARKED_ATTR, "1");

    const mark = document.createElement("span");
    mark.className = MARK_CLASS;
    mark.textContent = "✓ CodeLedger";
    mark.title = "You have already committed a solution for this problem.";
    mark.style.cssText = [
      "display:inline-block",
      "margin-left:8px",
      "padding:1px 6px",
      "border-radius:999px",
      "font-size:11px",
      "font-weight:600",
      "line-height:1.6",
      "color:#16a34a",
      "background:rgba(22,163,74,0.12)",
      "border:1px solid rgba(22,163,74,0.35)",
      "vertical-align:middle",
    ].join(";");

    // First cell if this is a table row, otherwise the row itself.
    (entry.row.querySelector("td") || entry.row).appendChild(mark);
    marked++;
  }

  return marked;
}

/**
 * Ask the service worker which problems are in the ledger.
 *
 * Content scripts share the page's origin, so their IndexedDB is the page's,
 * not the extension's — `Storage.getAllProblems()` here would read an empty
 * database belonging to takeuforward. The ids have to come from the worker.
 *
 * @returns {Promise<Set<string>>}
 */
export function fetchSolvedIds() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "GET_ALL_PROBLEM_IDS" }, (res) => {
        if (chrome.runtime.lastError || !res?.ok) return resolve(new Set());
        resolve(new Set(res.ids || []));
      });
    } catch (_) {
      resolve(new Set());
    }
  });
}

/**
 * Mark the sheet, and keep marking it as sections are expanded.
 *
 * Rows are added to the DOM when an accordion opens, so a single pass at load
 * would only cover whatever happened to be expanded. The observer is debounced
 * because expanding a section inserts dozens of rows in one frame.
 *
 * @returns {Promise<() => void>} teardown
 */
export async function watchSheet() {
  const solvedIds = await fetchSolvedIds();
  if (!solvedIds.size) {
    dbg.log("No solves recorded yet — nothing to mark");
    return () => {};
  }

  let timer = null;
  const scan = () => {
    const marked = markRows(readSheetRows(document), solvedIds);
    if (marked) dbg.log(`Marked ${marked} solved row(s)`);
  };

  scan();

  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scan, 200);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    clearTimeout(timer);
    observer.disconnect();
  };
}
