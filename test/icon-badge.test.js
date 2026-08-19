/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from "node:test";
import assert from "node:assert/strict";

import { iconBadge, DEFAULT_TITLE } from "../src/core/icon-badge.js";

/** A snapshot with the four fields the badge actually reads. */
const snap = (over = {}) => ({
  currentStreak: 7,
  effectiveTarget: 20,
  todayPoints: 12,
  todayDone: false,
  vacationActive: false,
  rescue: null,
  ...over,
});

test("the streak is the badge text", () => {
  assert.equal(iconBadge(snap(), {}).text, "7");
});

test("no streak means no badge at all", () => {
  // A "0" on the icon of a fresh install is noise about a feature the user has
  // not started using yet.
  assert.equal(iconBadge(snap({ currentStreak: 0 }), {}).text, "");
});

test("a four-digit streak says so rather than being clipped", () => {
  assert.equal(iconBadge(snap({ currentStreak: 1000 }), {}).text, "999+");
  assert.equal(iconBadge(snap({ currentStreak: 999 }), {}).text, "999");
});

test("the colour answers one question: is today paid for", () => {
  assert.equal(iconBadge(snap({ todayDone: true }), {}).color, "#10b981");
  assert.equal(iconBadge(snap({ todayDone: false }), {}).color, "#f59e0b");
});

test("a vacation day counts as paid for", () => {
  // It is the day the user told us not to count. Showing it as owed would be
  // nagging them about the thing they explicitly switched off.
  const badge = iconBadge(snap({ todayDone: false, vacationActive: true }), {});
  assert.equal(badge.color, "#10b981");
  assert.match(badge.title, /vacation day/);
});

test("a streak that can still be rescued turns the badge red", () => {
  const badge = iconBadge(
    snap({
      rescue: { kind: "penalty", requiredPoints: 30, remaining: 18, restoresDay: "2026-08-10" },
    }),
    {},
  );
  assert.equal(badge.color, "#ef4444");
  assert.match(badge.title, /18 more restores 2026-08-10/);
});

test("a rescue already paid off is not still red", () => {
  const badge = iconBadge(
    snap({ todayDone: true, rescue: { remaining: 0, restoresDay: "2026-08-10" } }),
    {},
  );
  assert.equal(badge.color, "#10b981");
  assert.doesNotMatch(badge.title, /restores/);
});

test("switching gamification off empties the badge and the tooltip", () => {
  const badge = iconBadge(snap(), { gamificationEnabled: false });
  assert.equal(badge.text, "");
  assert.equal(badge.title, DEFAULT_TITLE);
});

test("a missing snapshot says nothing instead of guessing", () => {
  assert.deepEqual(iconBadge(null, {}), { text: "", color: "#10b981", title: DEFAULT_TITLE });
});

test("stuck commits outrank the streak", () => {
  const badge = iconBadge(snap(), {}, 3);
  assert.equal(badge.text, "!");
  assert.equal(badge.color, "#ef4444");
  assert.match(badge.title, /3 solves saved locally but not on GitHub yet/);
});

test("stuck commits show even with gamification off", () => {
  // The badge is the only place a user finds out without opening the library.
  const badge = iconBadge(null, { gamificationEnabled: false }, 1);
  assert.equal(badge.text, "!");
  assert.match(badge.title, /1 solve saved locally/);
});

test("zero or garbage pending counts change nothing", () => {
  assert.equal(iconBadge(snap(), {}, 0).text, "7");
  assert.equal(iconBadge(snap(), {}, -2).text, "7");
  assert.equal(iconBadge(snap(), {}, NaN).text, "7");
});

test("the tooltip carries what the badge has no room for", () => {
  assert.equal(iconBadge(snap(), {}).title, "CodeLedger — 7 day streak · 12/20 points today");
  assert.equal(
    iconBadge(snap({ todayDone: true, todayPoints: 25 }), {}).title,
    "CodeLedger — 7 day streak · today's 20 points are in",
  );
  assert.equal(
    iconBadge(snap({ currentStreak: 0, todayPoints: 0 }), {}).title,
    "CodeLedger — no streak yet · 0/20 points today",
  );
});
