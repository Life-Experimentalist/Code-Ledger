/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from '../../lib/debug.js';

export class BasePlatformHandler {
  constructor(id, name, config) {
    this.id = id;
    this.name = name;
    this.config = config;
    this.dbg = createDebugger(`${name}Handler`);
  }

  /**
   * Safe query selector with fallbacks.
   */
  safeQuery(selectors, scope = document) {
    if (typeof selectors === 'string') {
      return scope.querySelector(selectors);
    }
    
    // If it's an array of selectors, try them in order
    if (Array.isArray(selectors)) {
      for (const s of selectors) {
        const el = scope.querySelector(s);
        if (el) return el;
      }
      return null;
    }

    return null;
  }

  /**
   * Extracts text from an element found via selector.
   */
  extractText(selector, scope = document) {
    const el = this.safeQuery(selector, scope);
    return el ? el.textContent.trim() : '';
  }

  // To be implemented by subclasses
  async detectSubmission() { throw new Error('Not implemented'); }
  async getProblemMetadata() { throw new Error('Not implemented'); }
  async getSolutionCode() { throw new Error('Not implemented'); }
}
