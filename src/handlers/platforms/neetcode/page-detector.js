/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NeetCode page detection.
 *
 * NeetCode is an Angular single-page app, so this is called again on every
 * history change rather than once at load.
 *
 * The editor is not on its own route. `/problems/{slug}` redirects to
 * `/problems/{slug}/question`, and every sibling tab — solution, history,
 * discuss, notes — renders the same split view with the same Monaco instance
 * on the right. So each of them can produce a submission, and all of them are
 * solve-capable; the tab only decides what is shown on the left.
 *
 * The slug is NeetCode's own, not LeetCode's: "duplicate-integer" here is
 * "contains-duplicate" there. The two are reconciled by title through the
 * canonical map, never by slug.
 */

import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("NeetCodePageDetector");

export const PAGE_TYPES = {
  PROBLEM: "problem",
  PRACTICE: "practice",
  ROADMAP: "roadmap",
  UNKNOWN: "unknown",
};

/** Sub-routes of a problem. The editor is present on all of them. */
export const PROBLEM_TABS = ["question", "solution", "history", "discuss", "notes"];

/**
 * @param {string} pathname
 * @returns {{type: string, slug?: string, tab?: string}}
 */
export function detectPage(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "");

  const problem = path.match(/^\/problems\/([^/]+)(?:\/([^/]+))?/);
  if (problem) {
    const [, slug, tail] = problem;
    const tab = tail && PROBLEM_TABS.includes(tail.toLowerCase()) ? tail.toLowerCase() : "question";
    dbg.log(`Problem: slug=${slug} tab=${tab}`);
    return { type: PAGE_TYPES.PROBLEM, slug, tab };
  }

  if (/^\/practice/.test(path)) return { type: PAGE_TYPES.PRACTICE };
  if (/^\/roadmap/.test(path)) return { type: PAGE_TYPES.ROADMAP };

  return { type: PAGE_TYPES.UNKNOWN };
}

export function isSolveCapablePage(pathname) {
  return detectPage(pathname).type === PAGE_TYPES.PROBLEM;
}
