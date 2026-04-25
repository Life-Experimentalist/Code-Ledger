/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { storage } from "../lib/browser-compat.js";
import { CONSTANTS } from "./constants.js";
import { createDebugger } from "../lib/debug.js";
const dbg = createDebugger("APIKeyPool");

/**
 * Handles round-robin rotation of API keys with per-key cooldowns.
 */
export class APIKeyPool {
  constructor(providerId) {
    this.providerId = providerId;
    this.cooldowns = new Map();
  }

  async getAllKeys() {
    const { [CONSTANTS.SK.AI_KEYS]: allKeys = {} } = await storage.local.get(
      CONSTANTS.SK.AI_KEYS,
    );
    return (allKeys[this.providerId] || [])
      .map((k) => String(k || "").trim())
      .filter(Boolean);
  }

  async getStrategy() {
    const { [CONSTANTS.SK.SETTINGS]: settings = {} } = await storage.local.get(
      CONSTANTS.SK.SETTINGS,
    );
    return settings[`${this.providerId}_keyStrategy`] || "round-robin";
  }

  async getKeyCount() {
    const keys = await this.getAllKeys();
    return keys.length;
  }

  async getNextKey() {
    const keys = await this.getAllKeys();

    if (keys.length === 0) return null;

    const strategy = await this.getStrategy();

    const available = keys.filter(
      (k) => Date.now() > (this.cooldowns.get(k) || 0),
    );
    if (available.length === 0) {
      dbg.warn(`All keys for ${this.providerId} are in cooldown.`);
      return null;
    }

    if (strategy === "random") {
      const idx = Math.floor(Math.random() * available.length);
      return available[idx];
    }

    if (strategy === "sticky-first") {
      return available[0];
    }

    const { [CONSTANTS.SK.AI_KEY_INDICES]: allIndices = {} } =
      await storage.local.get(CONSTANTS.SK.AI_KEY_INDICES);
    let currentIndex = allIndices[this.providerId] || 0;

    // Find the next available key not in cooldown
    for (let i = 0; i < keys.length; i++) {
      const index = (currentIndex + i) % keys.length;
      const key = keys[index];

      const cooldownUntil = this.cooldowns.get(key) || 0;
      if (Date.now() > cooldownUntil) {
        // Save next index for next time
        await storage.local.set({
          [CONSTANTS.SK.AI_KEY_INDICES]: {
            ...allIndices,
            [this.providerId]: (index + 1) % keys.length,
          },
        });
        return key;
      }
    }

    return null;
  }

  markFailed(key) {
    dbg.log(`Marking key as failed: ${key.substring(0, 8)}...`);
    this.cooldowns.set(key, Date.now() + CONSTANTS.KEY_POOL_RETRY_AFTER_MS);
  }
}
