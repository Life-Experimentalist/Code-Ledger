/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class CanonicalMap {
  static _map = null;

  static _normalizeEntries(json) {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.entries)) return json.entries;
    return [];
  }

  static _normalizeAliases(entry) {
    if (!entry || typeof entry !== "object") return [];

    if (Array.isArray(entry.aliases)) {
      return entry.aliases.filter((alias) => alias?.platform && alias?.slug);
    }

    if (entry.platforms && typeof entry.platforms === "object") {
      return Object.entries(entry.platforms)
        .filter(([, slug]) => !!slug)
        .map(([platform, slug]) => ({ platform, slug }));
    }

    if (entry.aliases && typeof entry.aliases === "object") {
      return Object.entries(entry.aliases)
        .filter(([, slug]) => !!slug)
        .map(([platform, slug]) => ({ platform, slug }));
    }

    return [];
  }

  /**
   * Loads the canonical map internally.
   */
  static async load() {
    if (this._map) return this._map;
    try {
      const url = chrome.runtime.getURL('data/canonical-map.json');
      const res = await fetch(url);
      this._map = this._normalizeEntries(await res.json());
    } catch (err) {
      if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
        const res = await fetch('/data/canonical-map.json');
        this._map = this._normalizeEntries(await res.json());
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
    return map.find((item) =>
      this._normalizeAliases(item).some(
        (alias) => alias.platform === platform && alias.slug === slug,
      ),
    ) || null;
  }
}
