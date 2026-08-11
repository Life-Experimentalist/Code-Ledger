/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Behaviour profile — the aggregate the AI surfaces read.
 *
 * The prompt block these produce goes straight into a model's context, so the
 * cases that matter are the ones where a wrong number would make the model
 * confidently wrong about the learner: a single flag read as a habit, an
 * unstarted timer read as a fast solve, a thin bank read as a trend.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildBehaviorProfile,
  formatProfileForPrompt,
  MIN_PROBLEMS_FOR_PROFILE,
} from "../src/core/behavior-profile.js";

/** Builds a bank entry with sane defaults so each test states only what it means. */
function entry(slug, over = {}) {
  return {
    slug,
    platform: "leetcode",
    difficulty: "Medium",
    tags: [],
    solves: [{ ts: 1, elapsedSeconds: 0, lang: { name: "Python" } }],
    ...over,
  };
}

/** N filler entries, enough to clear the floor without contributing signal. */
function filler(n, over = {}) {
  return Array.from({ length: n }, (_, i) => entry(`filler-${i}`, over));
}

describe("buildBehaviorProfile — the reporting floor", () => {
  test("says nothing at all below the floor", () => {
    const profile = buildBehaviorProfile(filler(MIN_PROBLEMS_FOR_PROFILE - 1));
    assert.equal(profile.problemCount, 0);
    assert.equal(formatProfileForPrompt(profile), "");
  });

  test("reports once the floor is reached", () => {
    const profile = buildBehaviorProfile(filler(MIN_PROBLEMS_FOR_PROFILE));
    assert.equal(profile.problemCount, MIN_PROBLEMS_FOR_PROFILE);
  });

  test("survives entries with no arrays on them at all", () => {
    const bare = Array.from({ length: 6 }, (_, i) => ({ slug: `s${i}`, platform: "leetcode" }));
    const profile = buildBehaviorProfile(bare);
    assert.equal(profile.problemCount, 6);
    assert.deepEqual(profile.recurringWeakAreas, []);
  });

  test("ignores the __chat_stats__ record, which carries no slug", () => {
    const profile = buildBehaviorProfile([...filler(6), { total: 9, byMode: {} }]);
    assert.equal(profile.problemCount, 6);
  });
});

describe("buildBehaviorProfile — recurring weak areas", () => {
  test("a flag on one problem is that problem, not a pattern", () => {
    const entries = [...filler(5), entry("a", { aiInsights: [{ weakAreas: ["off-by-one"] }] })];
    assert.deepEqual(buildBehaviorProfile(entries).recurringWeakAreas, []);
  });

  test("the same flag on two problems is a pattern", () => {
    const entries = [
      ...filler(5),
      entry("a", { aiInsights: [{ weakAreas: ["off-by-one"] }] }),
      entry("b", { aiInsights: [{ weakAreas: ["off-by-one"] }] }),
    ];
    const [top] = buildBehaviorProfile(entries).recurringWeakAreas;
    assert.equal(top.label, "off-by-one");
    assert.equal(top.problems, 2);
  });

  test("counts distinct problems, not repeats within one problem", () => {
    // Three reviews of the same problem all flagging the same thing is one
    // stubborn problem. Counting occurrences would rank it as a habit.
    const entries = [
      ...filler(5),
      entry("a", {
        aiInsights: [
          { weakAreas: ["edge cases"] },
          { weakAreas: ["edge cases"] },
          { weakAreas: ["edge cases"] },
        ],
      }),
    ];
    assert.deepEqual(buildBehaviorProfile(entries).recurringWeakAreas, []);
  });

  test("treats labels case-insensitively so they do not split", () => {
    const entries = [
      ...filler(5),
      entry("a", { aiInsights: [{ weakAreas: ["Edge Cases"] }] }),
      entry("b", { aiInsights: [{ weakAreas: ["edge cases"] }] }),
    ];
    const areas = buildBehaviorProfile(entries).recurringWeakAreas;
    assert.equal(areas.length, 1);
    assert.equal(areas[0].problems, 2);
  });

  test("ranks by how many problems a flag spans", () => {
    const entries = [
      ...filler(5),
      entry("a", { aiInsights: [{ weakAreas: ["space", "time"] }] }),
      entry("b", { aiInsights: [{ weakAreas: ["space", "time"] }] }),
      entry("c", { aiInsights: [{ weakAreas: ["space"] }] }),
    ];
    const areas = buildBehaviorProfile(entries).recurringWeakAreas;
    assert.equal(areas[0].label, "space");
    assert.equal(areas[0].problems, 3);
    assert.equal(areas[1].label, "time");
  });
});

describe("buildBehaviorProfile — pace", () => {
  test("drops zero-second solves rather than averaging them in", () => {
    // elapsedSeconds is 0 when the floating timer was never started. Counting
    // those would report the learner as improbably fast.
    const timed = (s) => ({ ts: 1, elapsedSeconds: s, lang: { name: "Python" } });
    const entries = [
      ...filler(4),
      entry("a", { difficulty: "Hard", solves: [timed(0), timed(600), timed(0)] }),
      entry("b", { difficulty: "Hard", solves: [timed(1200), timed(1800)] }),
    ];
    const pace = buildBehaviorProfile(entries).paceByDifficulty;
    assert.equal(pace.Hard.samples, 3);
    assert.equal(pace.Hard.medianSeconds, 1200);
  });

  test("withholds a median until there are enough timed solves", () => {
    const timed = (s) => ({ ts: 1, elapsedSeconds: s });
    const entries = [
      ...filler(5),
      entry("a", { difficulty: "Easy", solves: [timed(60), timed(90)] }),
    ];
    assert.equal(buildBehaviorProfile(entries).paceByDifficulty.Easy, undefined);
  });

  test("averages the middle pair on an even sample count", () => {
    const timed = (s) => ({ ts: 1, elapsedSeconds: s });
    const entries = [
      ...filler(5),
      entry("a", { difficulty: "Easy", solves: [timed(10), timed(20), timed(30), timed(40)] }),
    ];
    assert.equal(buildBehaviorProfile(entries).paceByDifficulty.Easy.medianSeconds, 25);
  });
});

describe("buildBehaviorProfile — strain and rates", () => {
  test("a topic counts as strained only where the learner needed help", () => {
    // Ranking tags by raw frequency would surface what they solve most, which
    // is the opposite of what the AI should lean on.
    const entries = [
      ...filler(4, { tags: ["arrays"] }),
      entry("a", { tags: ["dp"], hintViews: 2 }),
      entry("b", { tags: ["dp"], solves: [{ elapsedSeconds: 0 }, { elapsedSeconds: 0 }] }),
    ];
    const strained = buildBehaviorProfile(entries).topicsUnderStrain;
    assert.equal(strained.length, 1);
    assert.equal(strained[0].label, "dp");
    assert.equal(strained[0].problems, 2);
  });

  test("hint and resubmit rates are fractions of all recorded problems", () => {
    const entries = [
      ...filler(6),
      entry("a", { hintViews: 3 }),
      entry("b", { hintViews: 1 }),
      entry("c", { solves: [{ elapsedSeconds: 0 }, { elapsedSeconds: 0 }] }),
    ];
    const profile = buildBehaviorProfile(entries);
    assert.equal(profile.problemCount, 9);
    assert.equal(profile.hintTotal, 4);
    assert.equal(Math.round(profile.hintRate * 100), 22);
    assert.equal(Math.round(profile.resubmitRate * 100), 11);
  });
});

describe("formatProfileForPrompt", () => {
  test("an empty profile produces no block, not an empty heading", () => {
    assert.equal(formatProfileForPrompt(buildBehaviorProfile([])), "");
    assert.equal(formatProfileForPrompt(null), "");
  });

  test("names the recurring flags and tells the model not to recite them", () => {
    const entries = [
      ...filler(5),
      entry("a", { aiInsights: [{ weakAreas: ["off-by-one"] }] }),
      entry("b", { aiInsights: [{ weakAreas: ["off-by-one"] }] }),
    ];
    const text = formatProfileForPrompt(buildBehaviorProfile(entries));
    assert.match(text, /off-by-one \(2 problems\)/);
    assert.match(text, /Do not recite these statistics/);
  });

  test("omits every line it has no data for", () => {
    const text = formatProfileForPrompt(buildBehaviorProfile(filler(6, { lang: null })));
    assert.doesNotMatch(text, /Recurring review flags/);
    assert.doesNotMatch(text, /Typical pace/);
  });
});
