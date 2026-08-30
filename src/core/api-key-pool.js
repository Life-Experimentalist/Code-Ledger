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
    const { [CONSTANTS.SK.AI_KEYS]: allKeys = {} } = await storage.local.get(CONSTANTS.SK.AI_KEYS);
    const keys = (allKeys[this.providerId] || [])
      .map((k) => String(k || "").trim())
      .filter(Boolean);
    dbg.log(`APIKeyPool(${this.providerId}) keys loaded: ${keys.length}`);
    return keys;
  }

  async getStrategy() {
    const { [CONSTANTS.SK.SETTINGS]: settings = {} } = await storage.local.get(
      CONSTANTS.SK.SETTINGS,
    );
    return settings[`${this.providerId}_keyStrategy`] || "round-robin";
  }

  async getKeyCount() {
    const keys = await this.getAllKeys();
    dbg.log(`APIKeyPool(${this.providerId}) key count: ${keys.length}`);
    return keys.length;
  }

  async getNextKey() {
    const keys = await this.getAllKeys();

    if (keys.length === 0) return null;

    const strategy = await this.getStrategy();

    const available = keys.filter((k) => Date.now() > (this.cooldowns.get(k) || 0));
    if (available.length === 0) {
      dbg.warn(`All keys for ${this.providerId} are in cooldown.`);
      return null;
    }

    if (strategy === "random") {
      const idx = Math.floor(Math.random() * available.length);
      dbg.log(`APIKeyPool(${this.providerId}) selecting random key idx=${idx}`);
      return available[idx];
    }

    if (strategy === "sticky-first") {
      dbg.log(`APIKeyPool(${this.providerId}) selecting sticky-first key`);
      return available[0];
    }

    const { [CONSTANTS.SK.AI_KEY_INDICES]: allIndices = {} } = await storage.local.get(
      CONSTANTS.SK.AI_KEY_INDICES,
    );
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
        dbg.log(`APIKeyPool(${this.providerId}) selected key index=${index}`);
        return key;
      }
    }

    return null;
  }

  /**
   * Take a key out of rotation, but only for the one thing a cooldown fixes.
   *
   * This used to fire on every error. A malformed prompt, a model name with a
   * typo, an empty response — each locked the key out for a minute, and because
   * the caller loops over the whole pool, one 400 burnt every key the user had
   * and produced "All API keys are currently in cooldown (rate-limited)". That
   * sentence names the one cause it was not. Waiting does not fix a 400, and the
   * message sent the user looking for a quota problem they did not have.
   *
   * @param {string} key
   * @param {number} [status] HTTP status, when the failure came from a response
   */
  markFailed(key, status) {
    // 429 is the quota itself; 503 is the model being temporarily out of
    // capacity. Both are "this key, later" — everything else is "this request".
    if (status !== undefined && status !== 429 && status !== 503) {
      dbg.log(`Key failed with ${status}; not a rate limit, leaving it in rotation.`);
      return;
    }
    // No prefix of the key. `getNextKey` already logged which index it handed
    // out, so the preceding line says which key this is without printing any
    // of it.
    dbg.log(
      `Cooling down a key for ${this.providerId}` +
        (status === undefined ? " after a failure with no status." : ` after ${status}.`),
    );
    this.cooldowns.set(key, Date.now() + CONSTANTS.KEY_POOL_RETRY_AFTER_MS);
  }
}
