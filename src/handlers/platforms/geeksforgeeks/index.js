/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// @ts-nocheck

import { BasePlatformHandler } from '../../_base/BasePlatformHandler.js';
import { SELECTORS, LEGACY_SELECTORS } from './dom-selectors.js';
import { detectPage } from './page-detector.js';
import { eventBus } from '../../../core/event-bus.js';

export class GFGHandler extends BasePlatformHandler {
  constructor() {
    super('geeksforgeeks', 'GeeksForGeeks', {});
    this.mutationObserver = null;
    this.lastDetectedId = null;
  }

  async init() {
    this.dbg.log('Initializing GFG handler');
    this.setupMutationObserver();
  }

  setupMutationObserver() {
    this.mutationObserver = new MutationObserver(() => {
      this.checkSubmission();
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async checkSubmission() {
    const successEl = this.safeQuery(SELECTORS.submission.successIndicator) || this.safeQuery(LEGACY_SELECTORS['submission.successIndicator']);
    if (!successEl || (successEl.innerText && !successEl.innerText.toLowerCase().includes('correct'))) return;

    const pageInfo = detectPage(window.location.pathname);
    if (pageInfo.slug === this.lastDetectedId) return;

    this.dbg.log('Solve detected!', pageInfo.slug);
    this.lastDetectedId = pageInfo.slug;

    const metadata = await this.getProblemMetadata(pageInfo.slug);
    const submission = await this.getLatestSubmission();

    eventBus.emit('problem:solved', {
      platform: 'geeksforgeeks',
      ...metadata,
      ...submission,
      timestamp: Date.now() / 1000
    });
  }

  async getProblemMetadata(slug) {
    const titleEl = this.safeQuery(SELECTORS.problem.title) || this.safeQuery(LEGACY_SELECTORS['problem.title']);
    const difficultyEl = this.safeQuery(SELECTORS.problem.difficulty);
    
    return {
      titleSlug: slug || 'unknown',
      title: titleEl ? titleEl.innerText.trim() : slug,
      difficulty: difficultyEl ? difficultyEl.innerText.trim() : 'Medium',
    };
  }

  async getLatestSubmission() {
    let codeEl = this.safeQuery(SELECTORS.submission.code);
    if (!codeEl) {
      codeEl = this.safeQuery(LEGACY_SELECTORS['submission.code']);
    }

    const langEl = this.safeQuery(SELECTORS.submission.language);
    
    return {
      code: codeEl ? codeEl.innerText : '// Code extraction failed',
      lang: {
        name: langEl ? langEl.innerText.trim() : 'C++',
        ext: 'cpp' // Fallback deduction would happen here
      }
    };
  }
}
