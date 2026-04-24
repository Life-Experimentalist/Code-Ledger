/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class CanonicalMap {
  static _map = null;

  /**
   * Loads the canonical map internally.
   */
  static async load() {
    if (this._map) return this._map;
    try {
      const url = chrome.runtime.getURL('data/canonical-map.json');
      const res = await fetch(url);
      this._map = await res.json();
    } catch (err) {
      if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
        const res = await fetch('/data/canonical-map.json');
        this._map = await res.json();
      } else {
        this._map = [];
        console.warn('Failed to load canonical map', err);
      }
    }
    return this._map;
  }

  /**
   * Resolves a platform specific problem slug to its canonical entity.
   * @param {string} platform - e.g., 'leetcode', 'geeksforgeeks'
   * @param {string} slug - The problem SLUG on that platform.
   */
  static async resolve(platform, slug) {
    const map = await this.load();
    return map.find(item => item.platforms[platform] === slug) || null;
  }
}
