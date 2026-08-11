/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * One way to ask "what is the streak right now".
 *
 * computeSnapshot() is pure and takes three separate inputs — the problems, the
 * config derived from settings, and the vacation list. Assembling those three
 * in each caller is how the toolbar icon and the popup would end up disagreeing
 * about the same day. They ask here instead.
 */

import { Storage } from "./storage.js";
import { computeSnapshot, configFromSettings } from "./gamification.js";

/**
 * Read everything the streak is derived from and compute it.
 *
 * @param {Record<string, any>} [settings]  re-read from storage when not supplied
 * @returns {Promise<object>} a computeSnapshot() result
 */
export async function loadSnapshot(settings) {
  const s = settings || (await Storage.getSettings().catch(() => ({})));
  const problems = await Storage.getAllProblems().catch(() => []);
  const { vacations } = await Storage.getGamificationState().catch(() => ({ vacations: [] }));
  return computeSnapshot(problems || [], {
    config: configFromSettings(s),
    vacations,
    // Streaks start the day the extension was installed, so an imported back
    // catalogue contributes its points without inventing a year-long streak
    // the user never lived through.
    streakFloorDay: s?.installDay || undefined,
  });
}
