/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * What the little label on the toolbar icon should say.
 *
 * The badge has room for about four characters and no room at all for nuance,
 * so it carries exactly one number — the current streak — and one colour that
 * answers one question: is today already paid for. Everything else that might
 * want saying goes in the tooltip, which nobody has to read but anybody can.
 *
 * Pure on purpose. The extension API lives in gamification-service.js; this
 * file only decides, so the decision can be tested without a browser.
 */

import { isGamificationActive } from "./feature-flags.js";

/** Today's points are in. */
const DONE = "#10b981";
/** Today is still owed something. */
const OWED = "#f59e0b";
/** The streak is one day from ending unless today pays the penalty. */
const AT_RISK = "#ef4444";

/** The manifest's `action.default_title`, restored when the badge is cleared. */
export const DEFAULT_TITLE = "CodeLedger";

/**
 * Four characters is the honest limit, so a four-digit streak reports itself as
 * "999+" rather than being silently clipped to something wrong.
 *
 * @param {number} streak
 * @returns {string}
 */
function streakText(streak) {
  const n = Math.max(0, Math.floor(Number(streak) || 0));
  if (n === 0) return "";
  return n > 999 ? "999+" : String(n);
}

/**
 * Decide the badge from a computed snapshot.
 *
 * A missing snapshot is treated the same as the feature being off: an empty
 * badge and the plain title. Guessing would be worse than saying nothing.
 *
 * Stuck commits outrank everything, including the gamification gate: a solve
 * that is saved locally but has repeatedly failed to reach GitHub is the one
 * thing the user cannot find out any other way without opening the library.
 *
 * @param {object|null} snapshot  from computeSnapshot()
 * @param {Record<string, any>} [settings]
 * @param {number} [pendingCommits]  solves stuck uncommitted past the retry window
 * @returns {{ text: string, color: string, title: string }}
 */
export function iconBadge(snapshot, settings, pendingCommits = 0) {
  const pending = Math.max(0, Math.floor(Number(pendingCommits) || 0));
  if (pending > 0) {
    return {
      text: "!",
      color: AT_RISK,
      title:
        `${DEFAULT_TITLE} — ${pending} solve${pending === 1 ? "" : "s"} saved locally ` +
        `but not on GitHub yet — retried automatically every 10 minutes`,
    };
  }

  if (!isGamificationActive(settings) || !snapshot || typeof snapshot !== "object") {
    return { text: "", color: DONE, title: DEFAULT_TITLE };
  }

  const streak = Math.max(0, Math.floor(Number(snapshot.currentStreak) || 0));
  const target = Math.max(1, Math.floor(Number(snapshot.effectiveTarget) || 1));
  const points = Math.max(0, Math.floor(Number(snapshot.todayPoints) || 0));
  // A vacation day is one the user has already told us not to count, so it is
  // done in the only sense the badge means by "done".
  const done = snapshot.todayDone === true || snapshot.vacationActive === true;
  const rescue = snapshot.rescue && snapshot.rescue.remaining > 0 ? snapshot.rescue : null;

  const parts = [streak === 0 ? "no streak yet" : `${streak} day streak`];

  if (snapshot.vacationActive === true) {
    parts.push("vacation day — nothing owed");
  } else if (done) {
    parts.push(`today's ${target} points are in`);
  } else {
    parts.push(`${points}/${target} points today`);
  }

  if (rescue) {
    parts.push(`${rescue.remaining} more restores ${rescue.restoresDay}`);
  }

  return {
    text: streakText(streak),
    color: rescue ? AT_RISK : done ? DONE : OWED,
    title: `${DEFAULT_TITLE} — ${parts.join(" · ")}`,
  };
}
