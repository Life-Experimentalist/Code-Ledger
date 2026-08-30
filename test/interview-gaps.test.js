/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for src/core/interview-gaps.js.
 *
 * `now` is passed explicitly throughout, for the reason topic-taxonomy.test.js
 * gives: mastery and staleness both decay with wall-clock time, so a suite that
 * lets them default to Date.now() drifts as the numbers age.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  isAlgorithmProblem,
  difficultyMix,
  retentionRisk,
  gapHeadlines,
  headlineSummary,
} from "../src/core/interview-gaps.js";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 10, 12, 0, 0);
const OPTS = { now: NOW };

function solve({ tags, difficulty = "Medium", daysAgo = 1 }) {
  return { tags, platform: "leetcode", difficulty, timestamp: NOW - daysAgo * DAY };
}

function reps(tag, n, { daysAgo = 1, difficulty = "Medium" } = {}) {
  return Array.from({ length: n }, (_, i) =>
    solve({ tags: [tag], difficulty, daysAgo: daysAgo + i }),
  );
}

/** `n` problems at one difficulty, tagged Array so they count as algorithm work. */
function atDifficulty(difficulty, n, daysAgo = 1) {
  return reps("Array", n, { difficulty, daysAgo });
}

/* ------------------------------------------------------------------ */
/* Excluding non-algorithm work                                        */
/* ------------------------------------------------------------------ */

test("a Database-only problem is not algorithm practice", () => {
  assert.equal(isAlgorithmProblem(solve({ tags: ["Database"] })), false);
});

test("Pandas is excluded too — it was defaulting to algorithm", () => {
  // The tag matches none of the classification heuristics, so before Pandas got
  // its own entry in BUILT_IN_KINDS every dataframe problem counted as an
  // algorithm solve and inflated the exact number this module reports on.
  assert.equal(isAlgorithmProblem(solve({ tags: ["Pandas"] })), false);
});

test("a SQL problem that also carries an algorithm tag still counts", () => {
  // The exclusion is for problems that are *only* domain work. One real
  // technique tag is enough to make it interview practice.
  assert.equal(isAlgorithmProblem(solve({ tags: ["Database", "Sorting"] })), true);
});

test("an untagged problem is kept", () => {
  // Absence of tags is a platform failing, not evidence it was a SQL exercise.
  // Dropping these would quietly shrink the denominator on Codeforces.
  assert.equal(isAlgorithmProblem({ tags: [], difficulty: "Medium" }), true);
});

test("difficultyMix reports what it excluded rather than hiding it", () => {
  const mix = difficultyMix([
    ...atDifficulty("Easy", 3),
    ...reps("Database", 4),
    ...reps("Shell", 2),
  ]);
  assert.equal(mix.total, 3);
  assert.equal(mix.excluded, 6);
});

/* ------------------------------------------------------------------ */
/* Difficulty shape                                                    */
/* ------------------------------------------------------------------ */

test("shares are computed over graded problems, not the raw total", () => {
  // Codeforces solves with no rating arrive as Unknown. Dividing by a total
  // that includes them drags every share down, which reads as a finding and is
  // an artefact of the platform.
  const mix = difficultyMix([
    ...atDifficulty("Easy", 10),
    ...atDifficulty("Medium", 10),
    ...reps("Array", 20, { difficulty: "" }),
  ]);
  assert.equal(mix.unknown, 20);
  assert.equal(mix.graded, 20);
  assert.equal(mix.easyShare, 0.5);
});

test("an Easy-heavy ledger is flagged", () => {
  const mix = difficultyMix([...atDifficulty("Easy", 100), ...atDifficulty("Medium", 20)]);
  assert.ok(mix.flags.includes("easy-heavy"));
});

test("a healthy mix raises nothing", () => {
  const mix = difficultyMix([
    ...atDifficulty("Easy", 20),
    ...atDifficulty("Medium", 60),
    ...atDifficulty("Hard", 20),
  ]);
  assert.deepEqual(mix.flags, []);
});

test("a small ledger is not judged at all", () => {
  // Ten Easy problems is someone who started last week, not someone avoiding
  // Medium. Calling that a finding trains people to ignore the report.
  const mix = difficultyMix(atDifficulty("Easy", 10));
  assert.deepEqual(mix.flags, []);
});

test("no Hard problems is only a finding once the ledger is mature", () => {
  const young = difficultyMix([...atDifficulty("Easy", 10), ...atDifficulty("Medium", 20)]);
  assert.ok(!young.flags.includes("hard-absent"));

  const mature = difficultyMix([...atDifficulty("Easy", 20), ...atDifficulty("Medium", 60)]);
  assert.ok(mature.flags.includes("hard-absent"));
});

test("a user difficulty map naming a bucket that does not exist cannot produce NaN", () => {
  const mix = difficultyMix(reps("Array", 5, { difficulty: "Basic" }), {
    userMap: { Basic: "Trivial" },
  });
  assert.equal(mix.unknown, 5);
  assert.equal(mix.total, 5);
  assert.ok(Number.isFinite(mix.easyShare));
});

/* ------------------------------------------------------------------ */
/* Retention risk — the blind spot between "untouched" and "top topics" */
/* ------------------------------------------------------------------ */

test("a topic met once, months ago, is surfaced", () => {
  const problems = [...reps("Array", 40), ...reps("Trie", 1, { daysAgo: 200 })];
  const risk = retentionRisk(problems, OPTS);
  assert.deepEqual(
    risk.map((t) => t.topic),
    ["Trie"],
  );
  assert.equal(risk[0].count, 1);
});

test("a topic met once yesterday is not a retention problem", () => {
  const risk = retentionRisk([...reps("Array", 40), ...reps("Trie", 1, { daysAgo: 1 })], OPTS);
  assert.deepEqual(risk, []);
});

test("a topic solved twenty times months ago is not thin, whatever its decay", () => {
  // Volume and recency are different findings. This one belongs to the mastery
  // view; reporting it here would drown the once-and-never-again case that
  // nothing else catches.
  const risk = retentionRisk(reps("Dynamic Programming", 20, { daysAgo: 200 }), OPTS);
  assert.deepEqual(risk, []);
});

test("retention risk is ranked by tier before age", () => {
  const problems = [
    ...reps("Array", 40),
    ...reps("Segment Tree", 1, { daysAgo: 300 }), // competitive, very old
    ...reps("Binary Search", 1, { daysAgo: 90 }), // foundation, less old
  ];
  const risk = retentionRisk(problems, OPTS);
  assert.equal(risk[0].topic, "Binary Search");
});

/* ------------------------------------------------------------------ */
/* The thirty-second report                                            */
/* ------------------------------------------------------------------ */

test("at most three headlines, however many findings there are", () => {
  // The whole point. A ledger this broken generates six or seven candidates and
  // showing all of them is the wall of charts this module replaces.
  const problems = [
    ...atDifficulty("Easy", 120),
    ...reps("Trie", 1, { daysAgo: 200 }),
    ...reps("Greedy", 1, { daysAgo: 180 }),
  ];
  assert.ok(gapHeadlines(problems, OPTS).length <= 3);
});

test("every headline carries the number behind it", () => {
  const headlines = gapHeadlines([...atDifficulty("Easy", 120)], OPTS);
  assert.ok(headlines.length > 0);
  for (const h of headlines) {
    assert.equal(typeof h.number, "number");
    assert.ok(Number.isFinite(h.number), `${h.id} has no number`);
    assert.ok(h.title.length > 0);
    assert.ok(h.detail.length > 0);
  }
});

test("missing foundations outrank a lopsided difficulty mix", () => {
  // Both are true of an Array-only ledger. Being told to solve Medium problems
  // in topics you have never touched is advice in the wrong order.
  const headlines = gapHeadlines(atDifficulty("Easy", 120), OPTS);
  assert.equal(headlines[0].id, "absent-foundation");
});

test("the user's own ledger produces a report about topics, not about volume", () => {
  // 133 Array solves and near-nothing else. The headline has to be the zeros;
  // a report that leads with "133 problems solved" is the failure mode.
  const problems = [
    ...reps("Array", 133, { difficulty: "Easy" }),
    ...reps("Binary Search", 2, { daysAgo: 120 }),
    ...reps("Sliding Window", 2, { daysAgo: 150 }),
    ...reps("Graph", 4, { daysAgo: 90 }),
    ...reps("Depth-First Search", 1, { daysAgo: 200 }),
  ];
  const headlines = gapHeadlines(problems, OPTS);
  const ids = headlines.map((h) => h.id);
  assert.ok(ids.includes("absent-foundation") || ids.includes("absent-core"));

  const absent = headlines.find((h) => h.id === "absent-core" || h.id === "absent-foundation");
  assert.ok(absent.number > 0);
  // The count is what makes it a finding rather than a mood.
  assert.ok(absent.title.includes(String(absent.number)));
});

test("a well-rounded ledger produces no headlines at all", () => {
  // If the report cannot be empty it is not a report, it is decoration.
  const topics = [
    "Array",
    "String",
    "Hash Table",
    "Stack",
    "Queue",
    "Linked List",
    "Sorting",
    "Two Pointers",
    "Binary Search",
    "Sliding Window",
    "Prefix Sum",
    "Recursion",
    "Tree",
    "Binary Tree",
    "Depth-First Search",
    "Breadth-First Search",
    "Binary Search Tree",
    "Heap (Priority Queue)",
    "Greedy",
    "Backtracking",
    "Matrix",
    "Graph",
    "Bit Manipulation",
    "Monotonic Stack",
  ];
  const problems = topics.flatMap((t, i) =>
    reps(t, 8, { difficulty: i % 4 === 0 ? "Hard" : i % 3 === 0 ? "Easy" : "Medium" }),
  );
  assert.deepEqual(gapHeadlines(problems, { ...OPTS, maxTier: 2 }), []);
  assert.equal(headlineSummary([]), "");
});

test("headlines are ordered worst first", () => {
  const headlines = gapHeadlines(
    [...atDifficulty("Easy", 120), ...reps("Trie", 1, { daysAgo: 200 })],
    OPTS,
  );
  for (let i = 1; i < headlines.length; i++) {
    assert.ok(headlines[i - 1].severity >= headlines[i].severity);
  }
});

test("the summary line is the titles, in order", () => {
  const headlines = gapHeadlines(atDifficulty("Easy", 120), OPTS);
  assert.equal(headlineSummary(headlines), headlines.map((h) => h.title).join(" · "));
});
