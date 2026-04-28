/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from '../../../lib/debug.js';
const dbg = createDebugger('LeetCodePageDetector');

export const PAGE_TYPES = {
  PROBLEM:     'problem',
  SUBMISSION:  'submission',
  CONTEST:     'contest',
  EXPLORE:     'explore',
  DISCUSS:     'discuss',
  PROFILE:     'profile',
  HOME:        'home',
  UNKNOWN:     'unknown',
};

export function detectPage(pathname) {
  const clean = pathname.replace(/\/$/, '');

  // Modern LeetCode URL: /problems/{slug}/submissions/{id}
  // Must be checked before the generic problem match so the submission ID isn't lost.
  const problemSubmissionMatch = clean.match(/^\/problems\/([^/]+)\/submissions\/(\d+)/);
  if (problemSubmissionMatch) {
    return { type: PAGE_TYPES.SUBMISSION, slug: problemSubmissionMatch[1], submissionId: problemSubmissionMatch[2] };
  }

  const problemMatch = clean.match(/^\/problems\/([^/]+)/);
  if (problemMatch) {
    const slug = problemMatch[1];
    return { type: PAGE_TYPES.PROBLEM, slug };
  }

  // Legacy LeetCode URL: /submissions/detail/{id}
  const submissionMatch = clean.match(/^\/submissions\/detail\/(\d+)/);
  if (submissionMatch) {
    return { type: PAGE_TYPES.SUBMISSION, submissionId: submissionMatch[1] };
  }

  if (clean.startsWith('/contest'))   return { type: PAGE_TYPES.CONTEST };
  if (clean.startsWith('/explore'))   return { type: PAGE_TYPES.EXPLORE };
  if (clean.startsWith('/discuss'))   return { type: PAGE_TYPES.DISCUSS };
  if (clean === '' || clean === '/') return { type: PAGE_TYPES.HOME };

  const profileMatch = clean.match(/^\/(u\/)?([^/]+)\/?$/);
  if (profileMatch) return { type: PAGE_TYPES.PROFILE, username: profileMatch[2] };

  return { type: PAGE_TYPES.UNKNOWN };
}

export function isSolveCapablePage(pathname) {
  const { type } = detectPage(pathname);
  return type === PAGE_TYPES.PROBLEM || type === PAGE_TYPES.SUBMISSION;
}
