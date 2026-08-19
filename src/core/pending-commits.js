/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * One reading of "how many solves are stuck, and when is the next retry" for
 * every surface that shows it — the library banner and the popup. Both used to
 * derive their own numbers (or none), which is how the banner could claim a
 * retry "every 10 minutes" while never noticing that a retry had run.
 */

import { Storage } from "./storage.js";
import { CONSTANTS } from "./constants.js";
import { alarms } from "../lib/browser-compat.js";

/**
 * @returns {Promise<{ total: number, stale: number, nextRetryAt: number|null }>}
 *   total — every uncommitted solve, including ones a commit is in flight for;
 *   stale — the ones older than the automatic-retry window, i.e. worth a banner;
 *   nextRetryAt — epoch ms of the next MAINTENANCE_COMMIT alarm, if readable.
 */
export async function pendingCommitStatus() {
  const map = await Storage.getPendingProblemKeys().catch(() => ({}));
  const marks = Object.values(map || {})
    .map(Number)
    .filter(Number.isFinite);
  const staleBefore = Date.now() - CONSTANTS.PENDING_COMMIT_STALE_MS;

  let nextRetryAt = null;
  try {
    const alarm = await alarms?.get?.("MAINTENANCE_COMMIT");
    if (alarm && Number.isFinite(alarm.scheduledTime)) nextRetryAt = alarm.scheduledTime;
  } catch {
    // Not an extension page, or no alarms permission — the counts still work.
  }

  return {
    total: marks.length,
    stale: marks.filter((t) => t < staleBefore).length,
    nextRetryAt,
  };
}

/**
 * "in 4m", "in about 1m", "any moment now" — the phrasing a countdown line
 * wants. Alarms can fire late (Chrome batches them), so a past scheduledTime
 * is reported as imminent rather than as a negative number.
 *
 * @param {number|null} nextRetryAt epoch ms
 * @returns {string|null} null when there is nothing to say
 */
export function formatRetryEta(nextRetryAt) {
  if (!Number.isFinite(nextRetryAt)) return null;
  const msLeft = nextRetryAt - Date.now();
  if (msLeft <= 15 * 1000) return "any moment now";
  const mins = Math.ceil(msLeft / 60000);
  return mins <= 1 ? "in about a minute" : `in about ${mins} minutes`;
}
