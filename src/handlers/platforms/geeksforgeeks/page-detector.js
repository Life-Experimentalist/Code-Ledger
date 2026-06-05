/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../../../lib/debug.js";
const dbg = createDebugger("GFGPageDetector");

export const PAGE_TYPES = {
  PROBLEM: "problem",
  SUBMISSION: "submission",
  PROFILE: "profile",
  HOME: "home",
  UNKNOWN: "unknown",
};

export function detectPage(pathname) {
  const clean = pathname.replace(/\/$/, "");

  if (clean.includes("/problems/")) {
    const parts = clean.split("/problems/");
    const slug = parts[1]?.split("/")[0] || "";
    dbg.log(`Problem page detected: ${slug}`);
    return { type: PAGE_TYPES.PROBLEM, slug };
  }

  // GFG profile: /user/{username}
  if (/^\/user\/[^/]+$/.test(clean)) {
    const username = clean.split("/user/")[1] || "";
    dbg.log(`Profile page detected: ${username}`);
    return { type: PAGE_TYPES.PROFILE, username };
  }

  return { type: PAGE_TYPES.UNKNOWN };
}

export function isSolveCapablePage(pathname) {
  const { type } = detectPage(pathname);
  return type === PAGE_TYPES.PROBLEM;
}
