/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from '../../../lib/debug.js';
const dbg = createDebugger('CodeforcesPageDetector');

export const PAGE_TYPES = {
  PROBLEM:     'problem',
  SUBMISSION:  'submission',
  UNKNOWN:     'unknown',
};

export function detectPage(pathname) {
  const clean = pathname;

  if (clean.includes('/problemset/problem/') || clean.includes('/contest/')) {
    if (!clean.includes('/submit')) {
      const matches = clean.match(/problem\/([A-Za-z0-9]+)/) || clean.match(/contest\/\d+\/problem\/([A-Za-z0-9]+)/);
      if (matches) {
        dbg.log(`Problem page detected: ${matches[1]}`);
        return { type: PAGE_TYPES.PROBLEM, slug: matches[1] };
      }
    }
  }

  return { type: PAGE_TYPES.UNKNOWN };
}

export function isSolveCapablePage(pathname) {
  return detectPage(pathname).type === PAGE_TYPES.PROBLEM;
}
