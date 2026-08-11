/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * takeuforward page detection.
 *
 * Two kinds of page matter, and they serve different people:
 *
 *   PROBLEM — /plus/dsa/problems/{slug}. The TUF+ editor and judge. Behind the
 *     subscription; only a subscriber ever reaches it, and only there can a
 *     solve be detected.
 *
 *   SHEET — /dsa/{sheet-slug}, e.g. strivers-a2z-sheet-learn-dsa-a-to-z. Free
 *     and public, and where most people actually work: the sheet lists each
 *     problem with a link out to LeetCode. Nothing is solved here, so nothing
 *     is committed here — CodeLedger only marks the rows it has already seen
 *     solved elsewhere.
 *
 * takeuforward is a Next.js app router site and navigates client-side, so this
 * runs again on every history change.
 */

import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("TUFPageDetector");

export const PAGE_TYPES = {
  PROBLEM: "problem",
  SHEET: "sheet",
  UNKNOWN: "unknown",
};

/**
 * @param {string} pathname
 * @returns {{type: string, slug?: string, sheet?: string}}
 */
export function detectPage(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "");

  const problem = path.match(/^\/plus\/dsa\/problems\/([^/]+)/);
  if (problem) {
    dbg.log(`TUF+ problem: ${problem[1]}`);
    return { type: PAGE_TYPES.PROBLEM, slug: problem[1] };
  }

  // Every published sheet lives directly under /dsa/. The two-segment check
  // keeps deeper article routes out.
  const sheet = path.match(/^\/dsa\/([^/]+)$/);
  if (sheet) {
    dbg.log(`Sheet: ${sheet[1]}`);
    return { type: PAGE_TYPES.SHEET, sheet: sheet[1] };
  }

  return { type: PAGE_TYPES.UNKNOWN };
}

/** Only the TUF+ editor can produce a submission. */
export function isSolveCapablePage(pathname) {
  return detectPage(pathname).type === PAGE_TYPES.PROBLEM;
}
