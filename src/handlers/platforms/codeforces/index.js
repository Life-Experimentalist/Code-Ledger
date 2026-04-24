/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasePlatformHandler } from '../../_base/BasePlatformHandler.js';
import { SELECTORS } from './dom-selectors.js';
import { detectPage } from './page-detector.js';

export class CodeforcesHandler extends BasePlatformHandler {
  constructor() {
    super('codeforces', 'Codeforces', {});
  }

  async init() {
    this.dbg.log('Initializing Codeforces handler');
    // Polling based submission tracker for codeforces since UI is dynamic heavily on a separate submissions tab usually.
  }
}
