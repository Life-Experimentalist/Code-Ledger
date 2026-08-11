/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Keeps the toolbar icon's badge in step with the streak.
 *
 * The streak is derived, never stored: every refresh recomputes it from the
 * problems already in IndexedDB. That costs a little more than caching a number
 * would, and it buys the thing that matters — the badge cannot drift from what
 * the library, the popup and the published SVGs say, because all four ask the
 * same function the same question.
 *
 * Refreshes are cheap enough to run on startup, after a solve, and once an hour
 * (the day has to roll over on its own, without anyone visiting a page).
 */

import { action, alarms } from "../lib/browser-compat.js";
import { Storage } from "../core/storage.js";
import { CONSTANTS } from "../core/constants.js";
import { loadSnapshot } from "../core/gamification-state.js";
import { iconBadge } from "../core/icon-badge.js";
import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("GamificationService");

/** The hourly tick that carries the badge across midnight. */
export const BADGE_ALARM = CONSTANTS.ALARM_NAMES.STREAK_CHECK;

/**
 * Recompute and apply the badge.
 *
 * Failure here is silent by design. A badge is a decoration on a toolbar icon;
 * an exception escaping into the service worker's startup path is not.
 *
 * @param {Record<string, any>} [settings]
 * @returns {Promise<{text: string, color: string, title: string}|null>}
 */
export async function refreshIconBadge(settings) {
  if (!action?.setBadgeText) return null;
  try {
    const s = settings || (await Storage.getSettings().catch(() => ({})));
    const snapshot = await loadSnapshot(s);
    const badge = iconBadge(snapshot, s);
    await applyBadge(badge);
    return badge;
  } catch (e) {
    dbg.warn("refreshIconBadge(): skipped (non-fatal):", e?.message);
    return null;
  }
}

/**
 * Push a decided badge at the extension API.
 *
 * Split out so the decision and the four separate API calls it turns into can
 * be reasoned about apart. Firefox's MV3 build has no `setBadgeTextColor`, and
 * an older Chrome may be missing one of the others, so each is guarded rather
 * than assumed.
 *
 * @param {{text: string, color: string, title: string}} badge
 */
async function applyBadge(badge) {
  await action.setBadgeText({ text: badge.text });
  if (badge.text && action.setBadgeBackgroundColor) {
    await action.setBadgeBackgroundColor({ color: badge.color });
  }
  if (badge.text && action.setBadgeTextColor) {
    // The three badge colours are all mid-tone, so white text is the readable
    // choice on every one of them.
    await action.setBadgeTextColor({ color: "#ffffff" });
  }
  if (action.setTitle) await action.setTitle({ title: badge.title });
}

/**
 * Register the hourly refresh.
 *
 * Hourly rather than daily because "daily" would need a time to fire at, and
 * the right time depends on the user's `utcOffsetMinutes`, which they can
 * change. An hourly tick is correct under every offset and costs nothing —
 * the alarm only wakes the worker to read storage and write four strings.
 *
 * @returns {boolean} whether the alarm could be created
 */
export function registerBadgeAlarm() {
  if (!alarms?.create) return false;
  try {
    alarms.create(BADGE_ALARM, { periodInMinutes: 60 });
    return true;
  } catch (e) {
    dbg.warn("registerBadgeAlarm(): failed:", e?.message);
    return false;
  }
}
