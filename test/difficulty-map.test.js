/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression tests for the shared difficulty counter.
 *
 * Four separate call sites — the index.json builder, the historical rebuild,
 * the backup snapshot and the popup — each counted difficulties by comparing
 * to the literal string "Easy". GeeksForGeeks grades School and Basic,
 * Codeforces gives numeric ratings, and settings.difficultyMap can rename
 * anything, so a repository full of solves published 0 / 0 / 0 to its stats
 * page and its badges. These tests pin the behaviour of the one function they
 * all now share.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildUserDifficultyMap,
  countByDifficulty,
  normalizeDifficulty,
} from "../src/core/difficulty-map.js";

describe("buildUserDifficultyMap", () => {
  test("inverts per-platform alias maps into raw → canonical", () => {
    const map = buildUserDifficultyMap({
      geeksforgeeks_difficultyMap: { Easy: "School", Medium: "Moderate" },
      codeforces_difficultyMap: { Hard: "Div1-C" },
    });
    assert.deepEqual(map, { School: "Easy", Moderate: "Medium", "Div1-C": "Hard" });
  });

  test("the explicit global difficultyMap wins on conflict", () => {
    const map = buildUserDifficultyMap({
      geeksforgeeks_difficultyMap: { Easy: "Peculiar" },
      difficultyMap: { Peculiar: "Hard" },
    });
    assert.equal(map.Peculiar, "Hard");
  });

  test("ignores blank aliases, non-canonical levels and junk values", () => {
    const map = buildUserDifficultyMap({
      geeksforgeeks_difficultyMap: { Easy: "  ", Bizarre: "School", Medium: 3 },
      leetcode_difficultyMap: null,
      difficultyMap: { School: "Easy" },
    });
    assert.deepEqual(map, { School: "Easy" });
  });

  test("survives no settings at all", () => {
    assert.deepEqual(buildUserDifficultyMap(), {});
    assert.deepEqual(buildUserDifficultyMap(null), {});
  });
});

describe("countByDifficulty", () => {
  test("counts the canonical labels", () => {
    const counts = countByDifficulty([
      { difficulty: "Easy" },
      { difficulty: "Medium" },
      { difficulty: "Medium" },
      { difficulty: "Hard" },
    ]);
    assert.deepEqual(counts, { easy: 1, medium: 2, hard: 1, unknown: 0 });
  });

  test("counts GeeksForGeeks School and Basic as Easy", () => {
    const counts = countByDifficulty([
      { difficulty: "School" },
      { difficulty: "Basic" },
      { difficulty: "Easy" },
    ]);
    assert.equal(counts.easy, 3, "School and Basic are the GFG names for Easy");
    assert.equal(counts.unknown, 0);
  });

  test("is case-insensitive", () => {
    const counts = countByDifficulty([{ difficulty: "easy" }, { difficulty: "HARD" }]);
    assert.equal(counts.easy, 1);
    assert.equal(counts.hard, 1);
  });

  test("applies a user difficulty map over the built-ins", () => {
    const counts = countByDifficulty([{ difficulty: "Div2-A" }, { difficulty: "Div1-C" }], {
      "Div2-A": "Easy",
      "Div1-C": "Hard",
    });
    assert.deepEqual(counts, { easy: 1, medium: 0, hard: 1, unknown: 0 });
  });

  test("an unclassifiable label is reported as unknown, not folded into Easy", () => {
    // A Codeforces rating is a number. Filing it under Easy would misreport the
    // split; counting it as unknown admits the gap and keeps the total honest.
    const counts = countByDifficulty([{ difficulty: "1600" }, { difficulty: "" }, {}]);
    assert.deepEqual(counts, { easy: 0, medium: 0, hard: 0, unknown: 3 });
  });

  test("every problem lands in exactly one bucket", () => {
    const problems = [
      { difficulty: "Easy" },
      { difficulty: "School" },
      { difficulty: "Medium" },
      { difficulty: "Hard" },
      { difficulty: "1900" },
    ];
    const c = countByDifficulty(problems);
    assert.equal(c.easy + c.medium + c.hard + c.unknown, problems.length);
  });

  test("survives no arguments and a null list", () => {
    assert.deepEqual(countByDifficulty(), { easy: 0, medium: 0, hard: 0, unknown: 0 });
    assert.deepEqual(countByDifficulty(null), { easy: 0, medium: 0, hard: 0, unknown: 0 });
  });

  test("counts a per-platform alias written by the Platforms panel", () => {
    // The panel stores canonical → alias ({ Easy: "Div2-A" }); the merger
    // inverts it so the raw label the platform reports lands in the bucket.
    const map = buildUserDifficultyMap({ codeforces_difficultyMap: { Easy: "Div2-A" } });
    const counts = countByDifficulty([{ difficulty: "Div2-A" }], map);
    assert.deepEqual(counts, { easy: 1, medium: 0, hard: 0, unknown: 0 });
  });

  test("agrees with normalizeDifficulty on every input", () => {
    for (const raw of ["Easy", "School", "Basic", "Moderate", "Very Hard", "expert", "1600", ""]) {
      const c = countByDifficulty([{ difficulty: raw }]);
      const bucket = { Easy: "easy", Medium: "medium", Hard: "hard" }[normalizeDifficulty(raw)];
      assert.equal(c[bucket || "unknown"], 1, `${raw || "(empty)"} landed in the wrong bucket`);
    }
  });
});
