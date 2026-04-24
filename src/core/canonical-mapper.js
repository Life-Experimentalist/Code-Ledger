/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CONSTANTS } from './constants.js';
import { storage } from '../lib/browser-compat.js';
import { createDebugger } from '../lib/debug.js';
const dbg = createDebugger('CanonicalMapper');

class CanonicalMapper {
  constructor() {
    this.map = new Map();
    this.lastFetch = 0;
  }

  async loadMap() {
    const cached = await storage.local.get([CONSTANTS.SK.CANONICAL_MAP_CACHE, CONSTANTS.SK.CANONICAL_MAP_ETAG]);
    const etag = cached[CONSTANTS.SK.CANONICAL_MAP_ETAG];
    const data = cached[CONSTANTS.SK.CANONICAL_MAP_CACHE];

    if (data && (Date.now() - this.lastFetch < CONSTANTS.CANONICAL_CACHE_TTL_MS)) {
      this.populate(data);
      return;
    }

    try {
      const headers = etag ? { 'If-None-Match': etag } : {};
      const res = await fetch(CONSTANTS.URLS.CANONICAL_MAP_RAW, { headers });
      
      if (res.status === 304 && data) {
        this.lastFetch = Date.now();
        return;
      }

      if (res.ok) {
        const json = await res.json();
        const newEtag = res.headers.get('ETag');
        await storage.local.set({
          [CONSTANTS.SK.CANONICAL_MAP_CACHE]: json,
          [CONSTANTS.SK.CANONICAL_MAP_ETAG]: newEtag
        });
        this.populate(json);
        this.lastFetch = Date.now();
      }
    } catch (err) {
      dbg.error('Failed to fetch canonical map', err);
      if (data) this.populate(data);
    }
  }

  populate(json) {
    this.map.clear();
    for (const entry of json) {
      this.map.set(entry.canonicalId, entry);
      if (entry.aliases) {
        for (const [platform, slug] of Object.entries(entry.aliases)) {
          this.map.set(`${platform}:${slug}`, entry);
        }
      }
    }
  }

  /**
   * Resolves a platform-specific problem to its canonical identity.
   */
  resolve(platform, slug) {
    return this.map.get(`${platform}:${slug}`) || null;
  }

  getById(id) {
    return this.map.get(id) || null;
  }
}

export const canonicalMapper = new CanonicalMapper();
