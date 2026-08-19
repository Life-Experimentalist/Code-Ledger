/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the gamification engine.
 *
 * These numbers are shown to the user as a claim about their own history — a
 * streak that reads 14 when the truth is 3 is worse than showing nothing, and
 * an off-by-one at a month boundary is a broken streak someone will be upset
 * about. Every rule in the engine (target, freeze, penalty, vacation) gets a
 * case here, and the day arithmetic gets the boundaries specifically.
 *
 * All tests pin `utcOffsetMinutes: 0` and pass an explicit `now`, so a run in
 * Kolkata and a run in CI produce identical results.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  POINTS,
  RECALL_MULTIPLIER,
  DEFAULT_CONFIG,
  LEVELS,
  dayKey,
  addDays,
  daysBetween,
  pointsFor,
  scoreEvents,
  buildDailyPoints,
  isVacationDay,
  detectAwayGap,
  computeStreak,
  levelFor,
  computeSnapshot,
  computeIceBreaker,
  newlyEarned,
  recallCandidates,
  describeStreak,
  configFromSettings,
} from "../src/core/gamification.js";

const UTC = { utcOffsetMinutes: 0 };

/** Epoch ms for midday on a given `YYYY-MM-DD`, so no test sits on a boundary. */
function at(key, hour = 12) {
  return Date.parse(`${key}T00:00:00.000Z`) + hour * 3_600_000;
}

/** A minimal ledger record. */
function solve(key, difficulty = "Medium", extra = {}) {
  return {
    canonicalId: extra.id || `p-${key}-${difficulty}-${Math.random().toString(36).slice(2, 8)}`,
    title: extra.title || "Problem",
    platform: extra.platform || "leetcode",
    difficulty,
    timestamp: at(key, extra.hour ?? 12),
    ...extra,
  };
}

/** N problems on one day, enough to reach `points`. */
function pointsOn(key, points, difficulty = "Easy") {
  const per = POINTS[difficulty];
  const n = Math.ceil(points / per);
  return Array.from({ length: n }, (_, i) => solve(key, difficulty, { id: `${key}-${i}` }));
}

describe("day arithmetic", () => {
  test("dayKey buckets a timestamp into a local calendar day", () => {
    assert.equal(dayKey(Date.parse("2026-03-15T12:00:00Z"), 0), "2026-03-15");
  });

  test("dayKey respects a positive UTC offset across midnight", () => {
    // 23:00 UTC in IST (+330) is already the next calendar day locally.
    const ts = Date.parse("2026-03-15T23:00:00Z");
    assert.equal(dayKey(ts, 0), "2026-03-15");
    assert.equal(dayKey(ts, 330), "2026-03-16");
  });

  test("dayKey respects a negative UTC offset across midnight", () => {
    // 01:00 UTC in New York (-300) is still the previous local day.
    const ts = Date.parse("2026-03-15T01:00:00Z");
    assert.equal(dayKey(ts, -300), "2026-03-14");
  });

  test("dayKey accepts ISO strings and Date objects", () => {
    assert.equal(dayKey("2026-03-15T12:00:00Z", 0), "2026-03-15");
    assert.equal(dayKey(new Date("2026-03-15T12:00:00Z"), 0), "2026-03-15");
  });

  test("dayKey returns empty string for unparseable input", () => {
    assert.equal(dayKey(undefined, 0), "");
    assert.equal(dayKey("not a date", 0), "");
  });

  test("addDays crosses month and year boundaries", () => {
    assert.equal(addDays("2026-01-31", 1), "2026-02-01");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  });

  test("addDays handles a leap day", () => {
    assert.equal(addDays("2028-02-28", 1), "2028-02-29");
    assert.equal(addDays("2028-02-29", 1), "2028-03-01");
  });

  test("daysBetween is signed and inclusive of direction", () => {
    assert.equal(daysBetween("2026-03-01", "2026-03-15"), 14);
    assert.equal(daysBetween("2026-03-15", "2026-03-01"), -14);
    assert.equal(daysBetween("2026-03-01", "2026-03-01"), 0);
  });
});

describe("pointsFor", () => {
  test("scores the three canonical difficulties in ascending order", () => {
    assert.ok(POINTS.Easy < POINTS.Medium);
    assert.ok(POINTS.Medium < POINTS.Hard);
    assert.equal(pointsFor("Easy"), 10);
    assert.equal(pointsFor("Medium"), 25);
    assert.equal(pointsFor("Hard"), 50);
  });

  test("an unrecognised difficulty scores as Easy rather than zero", () => {
    assert.equal(pointsFor("Unknown"), POINTS.Easy);
    assert.equal(pointsFor(undefined), POINTS.Easy);
    assert.equal(pointsFor("School"), POINTS.Easy);
  });

  test("a recall is worth the reduced rate", () => {
    assert.equal(pointsFor("Hard", { recall: true }), Math.round(50 * RECALL_MULTIPLIER));
    assert.ok(pointsFor("Hard", { recall: true }) < pointsFor("Hard"));
    assert.ok(pointsFor("Hard", { recall: true }) > 0);
  });
});

describe("scoreEvents", () => {
  test("scores a first solve at full rate", () => {
    const events = scoreEvents([solve("2026-03-01", "Hard")], UTC);
    assert.equal(events.length, 1);
    assert.equal(events[0].points, 50);
    assert.equal(events[0].recall, false);
  });

  test("scores a later solve of the same problem as a recall", () => {
    const p = solve("2026-03-01", "Medium", {
      id: "two-sum",
      solveHistory: [{ timestamp: at("2026-04-01") }],
    });
    const events = scoreEvents([p], UTC);
    assert.equal(events.length, 2);
    assert.equal(events[0].points, 25);
    assert.equal(events[1].points, 10);
    assert.equal(events[1].recall, true);
  });

  test("ignores a recall inside the cooldown, so resubmitting cannot farm points", () => {
    const p = solve("2026-03-01", "Medium", {
      id: "two-sum",
      solveHistory: [
        { timestamp: at("2026-03-01", 13) },
        { timestamp: at("2026-03-01", 14) },
        { timestamp: at("2026-03-02") },
      ],
    });
    const events = scoreEvents([p], UTC);
    assert.equal(events.length, 1, "only the original solve scores");
  });

  test("allows a recall once the cooldown has elapsed", () => {
    const p = solve("2026-03-01", "Medium", {
      id: "two-sum",
      solveHistory: [{ timestamp: at("2026-03-05") }],
    });
    assert.equal(scoreEvents([p], UTC).length, 2);
  });

  test("skips records with no usable timestamp instead of throwing", () => {
    const events = scoreEvents([{ title: "x" }, null, solve("2026-03-01")], UTC);
    assert.equal(events.length, 1);
  });

  test("tolerates a solveHistory of bare timestamps", () => {
    const p = solve("2026-03-01", "Easy", { id: "a", solveHistory: [at("2026-03-20")] });
    assert.equal(scoreEvents([p], UTC).length, 2);
  });
});

describe("solves the platform never dated", () => {
  /** What a GFG profile import writes when the site publishes no solve date. */
  function undated(id, difficulty = "Medium") {
    return {
      canonicalId: id,
      title: id,
      platform: "geeksforgeeks",
      difficulty,
      timestamp: null,
      importedAt: at("2026-03-01"),
      _solveDateUnknown: true,
    };
  }

  test("scores an undated solve, with no day attached to it", () => {
    const events = scoreEvents([undated("a", "Hard")], UTC);
    assert.equal(events.length, 1);
    assert.equal(events[0].points, 50);
    assert.equal(events[0].day, null);
    assert.equal(events[0].dateUnknown, true);
  });

  test("a record with no timestamp and no marker is still skipped", () => {
    // The marker is what separates "the platform did not say" from "this record
    // is broken". Only the former earns points.
    assert.equal(scoreEvents([{ title: "x", difficulty: "Easy" }], UTC).length, 0);
  });

  test("undated solves land on no calendar day", () => {
    const days = buildDailyPoints([undated("a"), undated("b"), solve("2026-03-01", "Easy")], UTC);
    assert.equal(days.size, 1);
    assert.equal(days.get("2026-03-01").points, 10);
  });

  test("undated solves count toward points and total solves but not the streak", () => {
    // 200 imported problems must not read as 200 solves on one day, which is
    // exactly what stamping the import time used to produce.
    const problems = Array.from({ length: 200 }, (_, i) => undated(`gfg-${i}`, "Easy"));
    const s = computeSnapshot(problems, { ...UTC, now: at("2026-03-01") });
    assert.equal(s.totalPoints, 200 * POINTS.Easy);
    assert.equal(s.totalSolves, 200);
    assert.equal(s.todayPoints, 0, "the import day is not a solve day");
    assert.equal(s.currentStreak, 0);
    assert.equal(s.activeDays, 0);
    assert.equal(s.bestDay, null);
  });

  test("undated events sort ahead of dated ones", () => {
    const events = scoreEvents([solve("2026-03-01", "Easy", { id: "d" }), undated("u")], UTC);
    assert.equal(events[0].day, null);
    assert.equal(events[1].day, "2026-03-01");
  });
});

describe("buildDailyPoints", () => {
  test("sums a day and counts solves separately from recalls", () => {
    const problems = [
      solve("2026-03-01", "Easy", { id: "a" }),
      solve("2026-03-01", "Hard", { id: "b" }),
      solve("2026-01-01", "Medium", { id: "c", solveHistory: [at("2026-03-01")] }),
    ];
    const days = buildDailyPoints(problems, UTC);
    const d = days.get("2026-03-01");
    assert.equal(d.points, 10 + 50 + 10);
    assert.equal(d.solves, 2);
    assert.equal(d.recalls, 1);
    assert.equal(d.byDifficulty.Hard, 1);
  });

  test("returns an empty map for no history", () => {
    assert.equal(buildDailyPoints([], UTC).size, 0);
    assert.equal(buildDailyPoints(undefined, UTC).size, 0);
  });
});

describe("isVacationDay", () => {
  const vacations = [{ start: "2026-03-10", end: "2026-03-14" }];

  test("is inclusive at both ends", () => {
    assert.equal(isVacationDay("2026-03-10", vacations), true);
    assert.equal(isVacationDay("2026-03-14", vacations), true);
    assert.equal(isVacationDay("2026-03-09", vacations), false);
    assert.equal(isVacationDay("2026-03-15", vacations), false);
  });

  test("an open-ended vacation covers everything from the start", () => {
    assert.equal(isVacationDay("2030-01-01", [{ start: "2026-03-10", end: null }]), true);
    assert.equal(isVacationDay("2026-03-09", [{ start: "2026-03-10" }]), false);
  });

  test("ignores malformed entries", () => {
    assert.equal(isVacationDay("2026-03-10", [null, {}, { end: "2026-03-11" }]), false);
  });
});

describe("computeStreak", () => {
  const cfg = { ...DEFAULT_CONFIG, ...UTC, dailyTargetPoints: 25 };

  function streakOf(problems, today, over = {}, vacations = []) {
    const c = { ...cfg, ...over };
    return computeStreak(buildDailyPoints(problems, c), c, vacations, today);
  }

  test("counts consecutive days that reach the target", () => {
    const problems = ["2026-03-01", "2026-03-02", "2026-03-03"].flatMap((d) => pointsOn(d, 25));
    assert.equal(streakOf(problems, "2026-03-03").current, 3);
  });

  test("a day below the target does not count", () => {
    const problems = [...pointsOn("2026-03-01", 25), ...pointsOn("2026-03-02", 10)];
    // 2026-03-02 is today, still in progress — the streak from the 1st stands.
    assert.equal(streakOf(problems, "2026-03-02").current, 1);
  });

  test("today counts as pending, not missed, until midnight", () => {
    const problems = pointsOn("2026-03-01", 25);
    const s = streakOf(problems, "2026-03-02");
    assert.equal(s.current, 1);
    assert.equal(s.brokenAt, null);
    assert.equal(s.timeline.at(-1).status, "pending");
  });

  test("a missed day with no freeze and no penalty resets the streak", () => {
    const problems = [
      ...pointsOn("2026-03-01", 25),
      ...pointsOn("2026-03-02", 25),
      // 03-03 missed entirely
      ...pointsOn("2026-03-04", 25),
    ];
    const s = streakOf(problems, "2026-03-04");
    assert.equal(s.brokenAt, "2026-03-03");
    assert.equal(s.current, 1, "streak restarted on the 4th");
    assert.equal(s.longest, 2);
  });

  test("hitting twice the target banks a freeze", () => {
    const s = streakOf(pointsOn("2026-03-01", 50), "2026-03-01");
    assert.equal(s.freezes, 1);
    assert.equal(s.timeline[0].status, "earned-freeze");
  });

  test("banked freezes are capped", () => {
    const problems = Array.from({ length: 10 }, (_, i) =>
      pointsOn(addDays("2026-03-01", i), 50),
    ).flat();
    const s = streakOf(problems, "2026-03-10", { maxFreezes: 3 });
    assert.equal(s.freezes, 3);
  });

  test("a banked freeze covers a missed day and keeps the streak alive", () => {
    const problems = [
      ...pointsOn("2026-03-01", 50), // earns a freeze
      ...pointsOn("2026-03-02", 25),
      // 03-03 missed — the freeze pays for it
      ...pointsOn("2026-03-04", 25),
    ];
    const s = streakOf(problems, "2026-03-04");
    assert.equal(s.brokenAt, null);
    assert.equal(s.current, 4);
    assert.deepEqual(s.frozenDays, ["2026-03-03"]);
    assert.equal(s.freezes, 0, "the freeze was spent");
    assert.equal(s.freezesSpent, 1);
  });

  test("the penalty buys back a missed day when the next day pays 1.5x", () => {
    const problems = [
      ...pointsOn("2026-03-01", 25),
      // 03-02 missed
      ...pointsOn("2026-03-03", 38), // ceil(1.5 * 25) = 38
    ];
    const s = streakOf(problems, "2026-03-03");
    assert.equal(s.brokenAt, null);
    assert.deepEqual(s.penaltyDays, ["2026-03-02"]);
    assert.equal(s.current, 3);
  });

  test("one point short of the penalty does not buy the day back", () => {
    const problems = [...pointsOn("2026-03-01", 25), ...pointsOn("2026-03-03", 30)];
    const s = streakOf(problems, "2026-03-03");
    assert.equal(s.brokenAt, "2026-03-02");
    assert.deepEqual(s.penaltyDays, []);
  });

  test("the penalty is preferred over spending a freeze", () => {
    // The user did the work; charging a freeze as well would be double billing.
    const problems = [
      ...pointsOn("2026-03-01", 50), // banks a freeze
      // 03-02 missed
      ...pointsOn("2026-03-03", 50), // pays the penalty on its own
    ];
    const s = streakOf(problems, "2026-03-03");
    assert.deepEqual(s.penaltyDays, ["2026-03-02"]);
    assert.deepEqual(s.frozenDays, []);
    assert.ok(s.freezes >= 1, "the freeze is still banked");
  });

  test("a vacation day is neutral: it neither breaks nor extends the streak", () => {
    const problems = [
      ...pointsOn("2026-03-01", 25),
      ...pointsOn("2026-03-02", 25),
      // 03-03..03-05 on vacation, nothing solved
      ...pointsOn("2026-03-06", 25),
    ];
    const s = streakOf(problems, "2026-03-06", {}, [{ start: "2026-03-03", end: "2026-03-05" }]);
    assert.equal(s.brokenAt, null);
    assert.equal(s.current, 3, "three worked days, vacation days not counted");
  });

  test("longest streak survives a later break", () => {
    const problems = [
      ...["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04"].flatMap((d) => pointsOn(d, 25)),
      // 03-05 and 03-06 missed
      ...pointsOn("2026-03-07", 25),
    ];
    const s = streakOf(problems, "2026-03-07");
    assert.equal(s.longest, 4);
    assert.equal(s.current, 1);
  });

  test("an empty history is a zero streak, not a crash", () => {
    const s = streakOf([], "2026-03-01");
    assert.equal(s.current, 0);
    assert.equal(s.longest, 0);
    assert.deepEqual(s.timeline, []);
  });

  test("a custom daily target changes what closes a day", () => {
    const problems = pointsOn("2026-03-01", 50);
    assert.equal(streakOf(problems, "2026-03-01", { dailyTargetPoints: 100 }).current, 0);
    assert.equal(streakOf(problems, "2026-03-01", { dailyTargetPoints: 50 }).current, 1);
  });

  test("a long gap does not produce a huge timeline scan error", () => {
    const problems = [...pointsOn("2026-01-01", 25), ...pointsOn("2026-03-01", 25)];
    const s = streakOf(problems, "2026-03-01");
    assert.equal(s.current, 1);
    assert.equal(s.timeline.length, daysBetween("2026-01-01", "2026-03-01") + 1);
  });
});

describe("levelFor", () => {
  test("starts at level 1", () => {
    assert.equal(levelFor(0).level, 1);
    assert.equal(levelFor(99).level, 1);
  });

  test("crosses at the published threshold", () => {
    assert.equal(levelFor(100).level, 2);
    assert.equal(levelFor(299).level, 2);
    assert.equal(levelFor(300).level, 3);
  });

  test("caps at the last level with full progress", () => {
    const top = LEVELS.at(-1);
    const l = levelFor(top.at + 999999);
    assert.equal(l.level, top.level);
    assert.equal(l.next, null);
    assert.equal(l.progress, 1);
  });

  test("progress is a fraction of the way to the next level", () => {
    const l = levelFor(200); // level 2 spans 100..300
    assert.equal(l.level, 2);
    assert.equal(l.into, 100);
    assert.equal(l.span, 200);
    assert.equal(l.progress, 0.5);
  });

  test("negative or junk input floors at level 1", () => {
    assert.equal(levelFor(-50).level, 1);
    assert.equal(levelFor(NaN).level, 1);
  });

  test("thresholds are strictly ascending", () => {
    for (let i = 1; i < LEVELS.length; i++) assert.ok(LEVELS[i].at > LEVELS[i - 1].at);
  });
});

describe("newlyEarned", () => {
  const list = [
    { id: "first-blood", earned: true },
    { id: "century", earned: true },
    { id: "level-ten", earned: false },
  ];

  test("announces nothing before the seen-list has been seeded", () => {
    // The back catalogue of a user who has been solving for months is not new.
    assert.deepEqual(newlyEarned(list, { seenAchievements: [], achievementsSeeded: false }), []);
    assert.deepEqual(newlyEarned(list, {}), []);
    assert.deepEqual(newlyEarned(list, undefined), []);
  });

  test("announces earned achievements missing from a seeded list", () => {
    const state = { seenAchievements: ["first-blood"], achievementsSeeded: true };
    assert.deepEqual(newlyEarned(list, state), ["century"]);
  });

  test("never announces one that is not earned yet", () => {
    const state = { seenAchievements: [], achievementsSeeded: true };
    assert.deepEqual(newlyEarned(list, state), ["first-blood", "century"]);
    assert.ok(!newlyEarned(list, state).includes("level-ten"));
  });

  test("says nothing when everything earned has been seen", () => {
    const state = { seenAchievements: ["first-blood", "century"], achievementsSeeded: true };
    assert.deepEqual(newlyEarned(list, state), []);
  });

  test("tolerates a missing or ragged list", () => {
    const state = { seenAchievements: [], achievementsSeeded: true };
    assert.deepEqual(newlyEarned(undefined, state), []);
    assert.deepEqual(newlyEarned([null, { earned: true, id: "a" }], state), ["a"]);
  });
});

describe("computeIceBreaker", () => {
  const cfg = { ...DEFAULT_CONFIG, iceBreakerDays: 3 };

  test("is inactive with no vacation history", () => {
    assert.equal(computeIceBreaker([], "2026-03-10", cfg).active, false);
  });

  test("is active for the configured days after a vacation ends", () => {
    const v = [{ start: "2026-03-01", end: "2026-03-05" }];
    assert.equal(computeIceBreaker(v, "2026-03-06", cfg).active, true);
    assert.equal(computeIceBreaker(v, "2026-03-08", cfg).active, true);
    assert.equal(computeIceBreaker(v, "2026-03-09", cfg).active, false);
  });

  test("is inactive on the last vacation day itself", () => {
    const v = [{ start: "2026-03-01", end: "2026-03-05" }];
    assert.equal(computeIceBreaker(v, "2026-03-05", cfg).active, false);
  });

  test("uses the most recent ended vacation", () => {
    const v = [
      { start: "2026-01-01", end: "2026-01-05" },
      { start: "2026-03-01", end: "2026-03-05" },
    ];
    assert.equal(computeIceBreaker(v, "2026-03-06", cfg).endedOn, "2026-03-05");
  });
});

describe("recallCandidates", () => {
  const now = at("2026-06-01");

  test("returns nothing when everything is recent", () => {
    const problems = [solve("2026-05-30"), solve("2026-05-31")];
    assert.deepEqual(recallCandidates(problems, { now }), []);
  });

  test("surfaces the stalest problems first", () => {
    const problems = [
      solve("2026-01-01", "Easy", { id: "old", title: "Old" }),
      solve("2026-04-01", "Easy", { id: "mid", title: "Mid" }),
    ];
    const out = recallCandidates(problems, { now });
    assert.equal(out[0].title, "Old");
  });

  test("weights harder problems as more urgent to revisit", () => {
    // Same staleness; the Hard should outrank the Easy.
    const problems = [
      solve("2026-03-01", "Easy", { id: "e", title: "Easy one" }),
      solve("2026-03-01", "Hard", { id: "h", title: "Hard one" }),
    ];
    assert.equal(recallCandidates(problems, { now })[0].title, "Hard one");
  });

  test("measures staleness from the most recent solve, not the first", () => {
    const p = solve("2026-01-01", "Easy", { id: "a", solveHistory: [at("2026-05-31")] });
    assert.deepEqual(recallCandidates([p], { now }), []);
  });

  test("respects the limit", () => {
    const problems = Array.from({ length: 20 }, (_, i) =>
      solve("2026-01-01", "Easy", { id: `p${i}` }),
    );
    assert.equal(recallCandidates(problems, { now, limit: 3 }).length, 3);
  });
});

describe("computeSnapshot", () => {
  const base = { config: { ...UTC, dailyTargetPoints: 25 } };

  test("an empty ledger produces a valid zeroed snapshot", () => {
    const s = computeSnapshot([], { ...base, now: at("2026-03-01") });
    assert.equal(s.totalPoints, 0);
    assert.equal(s.currentStreak, 0);
    assert.equal(s.level.level, 1);
    assert.equal(s.todayDone, false);
    assert.equal(s.rescue, null);
    assert.equal(s.earnedCount, 0);
  });

  test("totals points, solves and difficulty spread", () => {
    const problems = [
      solve("2026-03-01", "Easy", { id: "a" }),
      solve("2026-03-01", "Medium", { id: "b" }),
      solve("2026-03-01", "Hard", { id: "c" }),
    ];
    const s = computeSnapshot(problems, { ...base, now: at("2026-03-01") });
    assert.equal(s.totalPoints, 85);
    assert.equal(s.totalSolves, 3);
    assert.deepEqual(s.byDifficulty, { Easy: 1, Medium: 1, Hard: 1 });
  });

  test("today's progress and remaining points are reported", () => {
    const s = computeSnapshot(pointsOn("2026-03-01", 10), { ...base, now: at("2026-03-01") });
    assert.equal(s.todayPoints, 10);
    assert.equal(s.todayDone, false);
    assert.equal(s.todayRemaining, 15);
  });

  test("todayDone flips once the target is reached", () => {
    const s = computeSnapshot(pointsOn("2026-03-01", 25), { ...base, now: at("2026-03-01") });
    assert.equal(s.todayDone, true);
    assert.equal(s.todayRemaining, 0);
  });

  test("counts distinct languages, platforms and topics", () => {
    const problems = [
      solve("2026-03-01", "Easy", {
        id: "a",
        platform: "leetcode",
        lang: { name: "Python" },
        tags: ["array", "hash"],
      }),
      solve("2026-03-01", "Easy", {
        id: "b",
        platform: "codeforces",
        lang: { name: "C++" },
        tags: ["array"],
      }),
    ];
    const s = computeSnapshot(problems, { ...base, now: at("2026-03-01") });
    assert.equal(s.languageCount, 2);
    assert.equal(s.platformCount, 2);
    assert.equal(s.topicCount, 2);
  });

  test("offers the penalty rescue when yesterday was missed and no freeze is banked", () => {
    const problems = [...pointsOn("2026-03-01", 25)]; // 03-02 missed, 03-03 is today
    const s = computeSnapshot(problems, { ...base, now: at("2026-03-03") });
    assert.ok(s.rescue, "a rescue should be offered");
    assert.equal(s.rescue.kind, "penalty");
    assert.equal(s.rescue.requiredPoints, 38);
    assert.equal(s.rescue.restoresDay, "2026-03-02");
  });

  test("offers no rescue when a freeze is banked", () => {
    const problems = [...pointsOn("2026-03-01", 50)];
    const s = computeSnapshot(problems, { ...base, now: at("2026-03-03") });
    assert.equal(s.rescue, null);
  });

  test("offers no rescue while on vacation", () => {
    const problems = [...pointsOn("2026-03-01", 25)];
    const s = computeSnapshot(problems, {
      ...base,
      now: at("2026-03-03"),
      vacations: [{ start: "2026-03-02", end: "2026-03-10" }],
    });
    assert.equal(s.rescue, null);
    assert.equal(s.vacationActive, true);
  });

  test("the ice-breaker ramp lowers the effective target", () => {
    const s = computeSnapshot([], {
      ...base,
      now: at("2026-03-06"),
      vacations: [{ start: "2026-03-01", end: "2026-03-05" }],
    });
    assert.equal(s.iceBreaker.active, true);
    assert.equal(s.effectiveTarget, 13); // round(25 * 0.5)
  });

  test("achievements are evaluated and counted", () => {
    const problems = pointsOn("2026-03-01", 10);
    const s = computeSnapshot(problems, { ...base, now: at("2026-03-01") });
    const first = s.achievements.find((a) => a.id === "first-blood");
    assert.equal(first.earned, true);
    assert.equal(s.achievements.find((a) => a.id === "century").earned, false);
    assert.equal(s.earnedCount, s.achievements.filter((a) => a.earned).length);
  });

  test("every achievement has a unique id and a working test", () => {
    const s = computeSnapshot([], { ...base, now: at("2026-03-01") });
    const ids = s.achievements.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const a of s.achievements) assert.equal(typeof a.earned, "boolean");
  });

  test("survives a ledger full of malformed records", () => {
    const s = computeSnapshot([null, undefined, {}, { timestamp: "nonsense" }], {
      ...base,
      now: at("2026-03-01"),
    });
    assert.equal(s.totalPoints, 0);
    assert.equal(s.currentStreak, 0);
  });

  test("respects the disabled flag without throwing", () => {
    const s = computeSnapshot(pointsOn("2026-03-01", 25), {
      config: { ...UTC, enabled: false },
      now: at("2026-03-01"),
    });
    assert.equal(s.enabled, false);
    assert.equal(describeStreak(s), "");
  });

  test("counts the solves that came back with a review on them", () => {
    const problems = [
      solve("2026-03-01", "Easy", { id: "a", aiReview: "Looks fine." }),
      solve("2026-03-01", "Easy", { id: "b", aiReview: "   " }),
      solve("2026-03-01", "Easy", { id: "c" }),
      solve("2026-03-01", "Easy", { id: "d", aiReview: "Consider a set here." }),
    ];
    const s = computeSnapshot(problems, { ...base, now: at("2026-03-01") });
    // Whitespace is not a review.
    assert.equal(s.totalReviews, 2);
    assert.equal(s.totalSolves, 4);
  });

  test("the review achievements are marked as needing a provider", () => {
    const s = computeSnapshot([], { ...base, now: at("2026-03-01") });
    const needs = s.achievements.filter((a) => a.needsAI).map((a) => a.id);
    assert.deepEqual(needs, ["second-opinion", "peer-reviewed"]);
    // Everything else has to stay reachable with AI switched off, or the shelf
    // quietly shortens for someone who never turned AI on in the first place.
    assert.ok(s.achievements.every((a) => a.needsAI || a.needsAI === false));
  });

  test("a review achievement is earned by the reviews, not by the settings", () => {
    const problems = Array.from({ length: 10 }, (_, i) =>
      solve("2026-03-01", "Easy", { id: `r${i}`, aiReview: "ok" }),
    );
    const s = computeSnapshot(problems, { ...base, now: at("2026-03-01") });
    assert.ok(s.achievements.find((a) => a.id === "second-opinion").earned);
    assert.ok(!s.achievements.find((a) => a.id === "peer-reviewed").earned);
  });
});

describe("streak floor (imported history)", () => {
  const base = { config: { ...UTC, dailyTargetPoints: 25 } };

  /** Two years of imported solves, then a fresh install today. */
  function imported() {
    return [
      ...pointsOn("2024-05-01", 50),
      ...pointsOn("2024-05-02", 50),
      ...pointsOn("2025-01-15", 50),
      ...pointsOn("2026-03-01", 50),
    ];
  }

  test("imported history awards points but never a streak the user did not live", () => {
    const withFloor = computeSnapshot(imported(), {
      ...base,
      now: at("2026-03-01"),
      streakFloorDay: "2026-03-01",
    });
    const withoutFloor = computeSnapshot(imported(), { ...base, now: at("2026-03-01") });

    assert.equal(withFloor.totalPoints, withoutFloor.totalPoints, "points are lifetime");
    assert.equal(withFloor.totalSolves, withoutFloor.totalSolves);
    assert.equal(withFloor.currentStreak, 1);
    assert.equal(withFloor.longestStreak, 1, "no historical streak is manufactured");
  });

  test("the floor also suppresses the wall of missed days a gappy import creates", () => {
    const s = computeSnapshot(imported(), {
      ...base,
      now: at("2026-03-01"),
      streakFloorDay: "2026-03-01",
    });
    assert.equal(s.timeline.length, 1);
    assert.ok(!s.timeline.some((t) => t.status === "missed"));
  });

  test("a floor earlier than the first solve changes nothing", () => {
    const problems = pointsOn("2026-03-05", 25);
    const a = computeSnapshot(problems, { ...base, now: at("2026-03-05") });
    const b = computeSnapshot(problems, {
      ...base,
      now: at("2026-03-05"),
      streakFloorDay: "2020-01-01",
    });
    assert.equal(a.currentStreak, b.currentStreak);
    assert.equal(a.timeline.length, b.timeline.length);
  });

  test("solves after the floor still build a real streak", () => {
    const problems = [
      ...pointsOn("2020-01-01", 50),
      ...pointsOn("2026-03-01", 25),
      ...pointsOn("2026-03-02", 25),
      ...pointsOn("2026-03-03", 25),
    ];
    const s = computeSnapshot(problems, {
      ...base,
      now: at("2026-03-03"),
      streakFloorDay: "2026-03-01",
    });
    assert.equal(s.currentStreak, 3);
  });
});

describe("configFromSettings", () => {
  test("picks the tunables out of a flat settings bag", () => {
    const cfg = configFromSettings({
      dailyTargetPoints: 40,
      maxFreezes: 2,
      github_repo: "ledger",
      aiEnabled: true,
    });
    assert.deepEqual(cfg, { dailyTargetPoints: 40, maxFreezes: 2 });
  });

  test("a cleared field falls back to the default instead of poisoning the maths", () => {
    // A schema-driven number input hands back "" when emptied. Passing that
    // through would make every points total NaN.
    const cfg = configFromSettings({ dailyTargetPoints: "", maxFreezes: NaN });
    assert.deepEqual(cfg, {});
  });

  test("the master switch is not a scoring tunable", () => {
    assert.equal("enabled" in configFromSettings({ enabled: 1 }), false);
  });

  test("nothing to read is not an error", () => {
    assert.deepEqual(configFromSettings(undefined), {});
    assert.deepEqual(configFromSettings(null), {});
  });
});

describe("day boundary travels with the snapshot", () => {
  test("the offset used is echoed back so a UTC runner can reproduce it", () => {
    const s = computeSnapshot([], { config: { utcOffsetMinutes: 330 } });
    assert.equal(s.utcOffsetMinutes, 330);
  });
});

describe("describeStreak", () => {
  const base = { config: { ...UTC, dailyTargetPoints: 25 } };

  test("prompts a start when there is no streak", () => {
    const s = computeSnapshot([], { ...base, now: at("2026-03-01") });
    assert.match(describeStreak(s), /No streak yet/);
  });

  test("reports the streak and what is left today", () => {
    const problems = [...pointsOn("2026-03-01", 25), ...pointsOn("2026-03-02", 10)];
    const text = describeStreak(computeSnapshot(problems, { ...base, now: at("2026-03-02") }));
    assert.match(text, /1-day streak/);
    assert.match(text, /15 points to go/);
  });

  test("says the day is done once the target is met", () => {
    const problems = pointsOn("2026-03-01", 25);
    assert.match(
      describeStreak(computeSnapshot(problems, { ...base, now: at("2026-03-01") })),
      /today is done/,
    );
  });

  test("says the streak is paused on vacation", () => {
    const s = computeSnapshot([], {
      ...base,
      now: at("2026-03-03"),
      vacations: [{ start: "2026-03-01", end: "2026-03-10" }],
    });
    assert.match(describeStreak(s), /vacation/);
  });

  test("acknowledges a vacation day where the target was met anyway", () => {
    const s = computeSnapshot(pointsOn("2026-03-03", 25), {
      ...base,
      now: at("2026-03-03"),
      vacations: [{ start: "2026-03-01", end: "2026-03-10" }],
    });
    assert.match(describeStreak(s), /counts anyway/);
  });
});

describe("solving on vacation", () => {
  const base = { config: { ...UTC, dailyTargetPoints: 25 } };
  const vac = [{ start: "2026-03-02", end: "2026-03-05" }];

  test("a vacation day that hits the target extends the streak", () => {
    const problems = [
      ...pointsOn("2026-03-01", 25),
      ...pointsOn("2026-03-03", 25), // mid-vacation solve
      ...pointsOn("2026-03-06", 25),
    ];
    const s = computeSnapshot(problems, { ...base, now: at("2026-03-06"), vacations: vac });
    // 01 complete, 02 neutral, 03 complete, 04–05 neutral, 06 complete = 3.
    assert.equal(s.currentStreak, 3);
    const day = s.timeline.find((t) => t.day === "2026-03-03");
    assert.equal(day.status, "complete");
    assert.equal(day.vacation, true);
  });

  test("a partial vacation day stays neutral, not missed", () => {
    const problems = [...pointsOn("2026-03-01", 25), ...pointsOn("2026-03-03", 10)];
    const s = computeSnapshot(problems, { ...base, now: at("2026-03-06"), vacations: vac });
    assert.equal(s.timeline.find((t) => t.day === "2026-03-03").status, "vacation");
  });

  test("a big vacation day still banks a freeze", () => {
    const problems = [...pointsOn("2026-03-01", 25), ...pointsOn("2026-03-03", 50)];
    const s = computeSnapshot(problems, { ...base, now: at("2026-03-04"), vacations: vac });
    assert.equal(s.freezes, 1);
    assert.equal(s.timeline.find((t) => t.day === "2026-03-03").status, "earned-freeze");
  });

  test("Back In Action is earned by a vacation-day solve", () => {
    const problems = [...pointsOn("2026-03-01", 25), ...pointsOn("2026-03-03", 25)];
    const s = computeSnapshot(problems, { ...base, now: at("2026-03-04"), vacations: vac });
    assert.ok(s.achievements.find((a) => a.id === "back-in-action").earned);
    const without = computeSnapshot(pointsOn("2026-03-01", 25), {
      ...base,
      now: at("2026-03-01"),
    });
    assert.ok(!without.achievements.find((a) => a.id === "back-in-action").earned);
  });
});

describe("away-gap detection", () => {
  const base = { config: { ...UTC, dailyTargetPoints: 25 } };

  test("a three-day silent run ending yesterday is offered as a break", () => {
    const problems = pointsOn("2026-03-01", 25);
    const s = computeSnapshot(problems, { ...base, now: at("2026-03-05") });
    assert.deepEqual(s.awayGap, { start: "2026-03-02", end: "2026-03-04", days: 3 });
  });

  test("a one- or two-day miss is left to freezes and the penalty", () => {
    const problems = pointsOn("2026-03-01", 25);
    const s = computeSnapshot(problems, { ...base, now: at("2026-03-04") });
    assert.equal(s.awayGap, null);
  });

  test("today in progress does not count toward the gap", () => {
    // Solved 03-01; 02, 03, 04 silent; now it is midday on the 4th — only two
    // finished days are silent, today is still live.
    const problems = pointsOn("2026-03-01", 25);
    const gap = detectAwayGap(buildDailyPoints(problems, UTC), [], "2026-03-04");
    assert.equal(gap, null);
  });

  test("declared vacations end the gap instead of counting into it", () => {
    const problems = pointsOn("2026-03-01", 25);
    const s = computeSnapshot(problems, {
      ...base,
      now: at("2026-03-08"),
      vacations: [{ start: "2026-03-02", end: "2026-03-04" }],
    });
    // Only 05, 06, 07 are undeclared — the gap starts after the vacation.
    assert.deepEqual(s.awayGap, { start: "2026-03-05", end: "2026-03-07", days: 3 });
  });

  test("no activity ever means no gap — you cannot be away from nothing", () => {
    const s = computeSnapshot([], { ...base, now: at("2026-03-08") });
    assert.equal(s.awayGap, null);
  });

  test("the gap never reaches past the install-day floor", () => {
    const problems = pointsOn("2026-02-01", 25);
    const s = computeSnapshot(problems, {
      ...base,
      now: at("2026-03-06"),
      streakFloorDay: "2026-03-04",
    });
    // Only 03-04 and 03-05 are inside the floor — too short to be a break.
    assert.equal(s.awayGap, null);
  });

  test("declaring the gap as a vacation restores the streak", () => {
    const problems = [
      ...pointsOn("2026-03-01", 25),
      ...pointsOn("2026-03-02", 25),
      ...pointsOn("2026-03-06", 25),
    ];
    const broken = computeSnapshot(problems, { ...base, now: at("2026-03-06") });
    assert.equal(broken.currentStreak, 1, "the gap broke the streak");
    const gap = broken.awayGap;
    assert.ok(gap);
    const rescued = computeSnapshot(problems, {
      ...base,
      now: at("2026-03-06"),
      vacations: [{ start: gap.start, end: gap.end }],
    });
    assert.equal(rescued.currentStreak, 3, "the break made the gap neutral");
  });
});
