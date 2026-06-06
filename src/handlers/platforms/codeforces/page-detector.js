/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Codeforces page detection.
 *
 * Problem slug format: "${contestId}${letter}" (e.g. "1234A", "gym5678B").
 * This pairs with CONSTANTS.makeProblemId("codeforces", slug) → "cf-1234A".
 *
 * URL patterns supported:
 *   /contest/{id}/problem/{letter}          → PROBLEM
 *   /gym/{id}/problem/{letter}              → PROBLEM  (gym slug: "gym{id}{letter}")
 *   /problemset/problem/{contestId}/{letter} → PROBLEM
 *   /contest/{id}/submission/{submissionId} → SUBMISSION
 *   /contest/{id}/my[/page/{n}]             → MY_SUBMISSIONS
 *   /profile/{handle}                       → PROFILE
 */

import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("CodeforcesPageDetector");

export const PAGE_TYPES = {
  PROBLEM: "problem",
  SUBMISSION: "submission",
  MY_SUBMISSIONS: "mysubmissions",
  PROFILE: "profile",
  UNKNOWN: "unknown",
};

export function detectPage(pathname) {
  // /contest/{id}/problem/{letter}  — check before /contest/{id}/my
  const contestProblem = pathname.match(/\/contest\/(\d+)\/problem\/([A-Za-z0-9]+)/);
  if (contestProblem) {
    const [, contestId, letter] = contestProblem;
    dbg.log(`Contest problem: contestId=${contestId} letter=${letter}`);
    return {
      type: PAGE_TYPES.PROBLEM,
      contestId,
      letter,
      slug: `${contestId}${letter}`,
    };
  }

  // /gym/{id}/problem/{letter}
  const gym = pathname.match(/\/gym\/(\d+)\/problem\/([A-Za-z0-9]+)/);
  if (gym) {
    const [, contestId, letter] = gym;
    dbg.log(`Gym problem: contestId=${contestId} letter=${letter}`);
    return {
      type: PAGE_TYPES.PROBLEM,
      contestId,
      letter,
      slug: `gym${contestId}${letter}`,
      isGym: true,
    };
  }

  // /problemset/problem/{contestId}/{letter}
  const problemset = pathname.match(/\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)/);
  if (problemset) {
    const [, contestId, letter] = problemset;
    dbg.log(`Problemset problem: contestId=${contestId} letter=${letter}`);
    return {
      type: PAGE_TYPES.PROBLEM,
      contestId,
      letter,
      slug: `${contestId}${letter}`,
    };
  }

  // /contest/{id}/submission/{submissionId}
  const submission = pathname.match(/\/contest\/(\d+)\/submission\/(\d+)/);
  if (submission) {
    return {
      type: PAGE_TYPES.SUBMISSION,
      contestId: submission[1],
      submissionId: submission[2],
    };
  }

  // /contest/{id}/my  or  /contest/{id}/my/page/{n}
  const my = pathname.match(/\/contest\/(\d+)\/my/);
  if (my) {
    return { type: PAGE_TYPES.MY_SUBMISSIONS, contestId: my[1] };
  }

  // /profile/{handle}
  const profile = pathname.match(/\/profile\/([^/]+)/);
  if (profile) {
    return { type: PAGE_TYPES.PROFILE, handle: profile[1] };
  }

  return { type: PAGE_TYPES.UNKNOWN };
}

export function isSolveCapablePage(pathname) {
  const t = detectPage(pathname).type;
  return t === PAGE_TYPES.PROBLEM || t === PAGE_TYPES.MY_SUBMISSIONS;
}
