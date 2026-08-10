/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Whether the two optional halves of the extension — AI review and
 * gamification — are showing right now.
 *
 * Every surface that renders AI or streak UI asks here rather than reading a
 * settings key of its own. One import means a toggle actually hides everything,
 * instead of leaving a stray panel behind in the corner of some view nobody
 * remembered to update.
 */

import { CONSTANTS } from "./constants.js";

/**
 * The AI switch is derived, not stored.
 *
 * A master toggle that had to be flipped by hand would be wrong twice: on for a
 * fresh install with no provider configured, and off for a user who has just
 * pasted their first API key. So the answer is "is any provider switched on",
 * and the stored key exists only to record an explicit *no* — a user who has
 * keys saved but wants the whole feature out of the way.
 *
 * `aiEnabled: false` therefore beats everything. Any other value defers to the
 * providers.
 *
 * @param {Record<string, any>} [settings]
 * @returns {boolean}
 */
export function isAIActive(settings) {
  if (!settings || typeof settings !== "object") return false;
  if (settings.aiEnabled === false) return false;
  return countEnabledAIProviders(settings) > 0;
}

/**
 * How many AI providers are switched on.
 *
 * @param {Record<string, any>} [settings]
 * @returns {number}
 */
export function countEnabledAIProviders(settings) {
  if (!settings || typeof settings !== "object") return 0;
  let n = 0;
  for (const id of Object.keys(CONSTANTS.AI_PROVIDERS || {})) {
    if (settings[`${id}_enabled`] === true) n++;
  }
  return n;
}

/**
 * Whether the master AI switch should even be offered.
 *
 * With no provider configured there is nothing to switch off, and a dead toggle
 * reads as a broken feature.
 *
 * @param {Record<string, any>} [settings]
 * @returns {boolean}
 */
export function canToggleAI(settings) {
  return countEnabledAIProviders(settings) > 0;
}

/**
 * Gamification is on unless the user turned it off.
 *
 * The opposite default to AI, and deliberately so: AI needs a key, a network
 * call and someone else's terms of service before it can do anything, while
 * streaks and points work out of the box from data the extension already has.
 *
 * @param {Record<string, any>} [settings]
 * @returns {boolean}
 */
export function isGamificationActive(settings) {
  if (!settings || typeof settings !== "object") return true;
  return settings.gamificationEnabled !== false;
}

/**
 * Whether the streak surfaces should show the AI-flavoured extras — recall
 * prompts written by the model, review-quality achievements — rather than the
 * plain ledger-derived ones.
 *
 * @param {Record<string, any>} [settings]
 * @returns {boolean}
 */
export function isCombinedActive(settings) {
  return isAIActive(settings) && isGamificationActive(settings);
}
