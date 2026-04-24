/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from '../../../lib/debug.js';
const dbg = createDebugger('GFGPageDetector');

export const PAGE_TYPES = {
  PROBLEM:     'problem',
  SUBMISSION:  'submission',
  HOME:        'home',
  UNKNOWN:     'unknown',
};

export function detectPage(pathname) {
  const clean = pathname.replace(/\/$/, '');

  if (clean.includes('/problems/')) {
    const slug = clean.split('/').pop();
    dbg.log(`Problem page detected: ${slug}`);
    return { type: PAGE_TYPES.PROBLEM, slug };
  }

  return { type: PAGE_TYPES.UNKNOWN };
}

export function isSolveCapablePage(pathname) {
  const { type } = detectPage(pathname);
  return type === PAGE_TYPES.PROBLEM;
}
