/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasePlatformHandler } from '../../_base/BasePlatformHandler.js';
import { SELECTORS } from './dom-selectors.js';
import { detectPage } from './page-detector.js';
import { registerPlatformPrompt } from '../../../core/ai-prompts.js';

export class CodeforcesHandler extends BasePlatformHandler {
  constructor() {
    super('codeforces', 'Codeforces', {});
    registerPlatformPrompt('codeforces', this.getDefaultPrompt());
  }

  getDefaultPrompt() {
    return `Review this {language} competitive programming solution for '{title}'.

Provide:
1. Time complexity (Big-O) and space complexity
2. Will it pass within typical CP constraints (10^8 ops/s)?
3. Potential TLE or MLE risks?
4. One optimisation if applicable

Be concise. Max 200 words.`;
  }

  async init() {
    this.dbg.log('Initializing Codeforces handler');
    // Polling based submission tracker for codeforces since UI is dynamic heavily on a separate submissions tab usually.
  }
}
