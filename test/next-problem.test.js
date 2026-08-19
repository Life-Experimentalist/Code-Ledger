/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the next-problem suggestion engine.
 *
 * The engine is a pure function of (problems, roadmapSummary), so every case
 * here builds a small ledger and asserts on the ranking that comes out. What
 * matters is the contract the Solutions bar renders from: solved and paid
 * problems never come back, recent solves outrank old ones, the roadmap
 * milestone bends the ranking, and the fallbacks appear exactly when the
 * primary signal runs dry.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { suggestNextProblems } from "../src/core/next-problem.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-03-15T12:00:00Z");

/** A solved ledger record with a similar-problems list. */
function solved(slug, daysAgo, extra = {}) {
  return {
    title: extra.title || slug,
    titleSlug: slug,
    difficulty: extra.difficulty || "Medium",
    timestamp: NOW - daysAgo * DAY,
    tags: extra.tags || [],
    similar: extra.similar || [],
    ...extra,
  };
}

/** A similar-question entry as the LeetCode handler stores it. */
function sim(slug, extra = {}) {
  return {
    title: extra.title || slug,
    titleSlug: slug,
    difficulty: extra.difficulty || "Medium",
    isPaidOnly: extra.isPaidOnly || false,
  };
}

describe("suggestNextProblems", () => {
  test("empty inputs produce no suggestions, not an error", () => {
    assert.deepEqual(suggestNextProblems([], null, { now: NOW }), []);
    assert.deepEqual(suggestNextProblems(null, null, { now: NOW }), []);
  });

  test("suggests unsolved similars of a recent solve", () => {
    const problems = [solved("two-sum", 1, { similar: [sim("three-sum"), sim("four-sum")] })];
    const out = suggestNextProblems(problems, null, { now: NOW });
    assert.deepEqual(
      out.filter((s) => s.kind === "similar").map((s) => s.titleSlug),
      ["three-sum", "four-sum"],
    );
    assert.equal(out[0].url, "https://leetcode.com/problems/three-sum/");
    assert.match(out[0].reason, /Follows “two-sum”/);
    assert.match(out[0].reason, /yesterday/);
  });

  test("never suggests a problem already solved, by slug or canonical id", () => {
    const problems = [
      solved("two-sum", 1, { similar: [sim("three-sum"), sim("contains-duplicate")] }),
      solved("3sum-on-gfg", 2, { canonical: { id: "three-sum" } }),
      solved("contains-duplicate", 3),
    ];
    const out = suggestNextProblems(problems, null, { now: NOW });
    assert.ok(!out.some((s) => s.titleSlug === "three-sum"), "canonical id counts as solved");
    assert.ok(!out.some((s) => s.titleSlug === "contains-duplicate"));
  });

  test("never suggests a paid-only problem", () => {
    const problems = [
      solved("two-sum", 1, {
        similar: [sim("locked-one", { isPaidOnly: true }), sim("open-one")],
      }),
    ];
    const out = suggestNextProblems(problems, null, { now: NOW });
    assert.ok(!out.some((s) => s.titleSlug === "locked-one"));
    assert.ok(out.some((s) => s.titleSlug === "open-one"));
  });

  test("a similar named by the newest solve outranks one from an older solve", () => {
    const problems = [
      solved("old-solve", 10, { similar: [sim("from-old")] }),
      solved("new-solve", 0, { similar: [sim("from-new")] }),
    ];
    const out = suggestNextProblems(problems, null, { now: NOW });
    assert.equal(out[0].titleSlug, "from-new");
  });

  test("a candidate named by several solves outranks a single mention", () => {
    const problems = [
      solved("a", 3, { similar: [sim("popular")] }),
      solved("b", 2, { similar: [sim("popular")] }),
      solved("c", 1, { similar: [sim("one-off")] }),
    ];
    const out = suggestNextProblems(problems, null, { now: NOW });
    assert.equal(out[0].titleSlug, "popular");
    assert.match(out[0].reason, /and 1 more/);
  });

  test("the roadmap milestone boosts similars of solves that serve it", () => {
    const summary = {
      next: { topic: "Dynamic Programming", subtopics: [], difficulty: "", target: 10, solved: 4 },
    };
    const problems = [
      // Newer solve, but off-milestone.
      solved("array-thing", 0, { tags: ["Array"], similar: [sim("array-next")] }),
      // Older solve whose tags serve the milestone (display-name tag, slug topic).
      solved("dp-thing", 5, { tags: ["Dynamic Programming"], similar: [sim("dp-next")] }),
    ];
    const out = suggestNextProblems(problems, summary, { now: NOW });
    assert.equal(out[0].titleSlug, "dp-next", "milestone relevance beats recency");
    assert.match(out[0].reason, /milestone/);
  });

  test("an active roadmap always contributes a practise-the-milestone entry", () => {
    const summary = {
      next: {
        topic: "Graphs",
        subtopics: ["breadth-first-search"],
        difficulty: "Medium",
        target: 8,
        solved: 2,
      },
    };
    const out = suggestNextProblems([solved("two-sum", 1)], summary, { now: NOW });
    const entry = out.find((s) => s.kind === "roadmap");
    assert.ok(entry);
    assert.equal(entry.title, "Practise Graphs");
    assert.match(entry.url, /topicSlugs=breadth-first-search/);
    assert.match(entry.reason, /2\/8/);
  });

  test("with five or more solves the least-practised tag becomes a gap entry", () => {
    const problems = [
      solved("a1", 1, { tags: ["Array"] }),
      solved("a2", 2, { tags: ["Array"] }),
      solved("a3", 3, { tags: ["Array"] }),
      solved("a4", 4, { tags: ["Array"] }),
      solved("g1", 5, { tags: ["Greedy"] }),
    ];
    const out = suggestNextProblems(problems, null, { now: NOW });
    const gap = out.find((s) => s.kind === "gap");
    assert.ok(gap);
    assert.equal(gap.title, "Revisit Greedy");
    assert.match(gap.reason, /only 1 solve\b/);
  });

  test("the gap entry is skipped when the weak tag is already the milestone", () => {
    const summary = {
      next: { topic: "Greedy", subtopics: [], difficulty: "", target: 5, solved: 1 },
    };
    const problems = [
      solved("a1", 1, { tags: ["Array"] }),
      solved("a2", 2, { tags: ["Array"] }),
      solved("a3", 3, { tags: ["Array"] }),
      solved("a4", 4, { tags: ["Array"] }),
      solved("g1", 5, { tags: ["Greedy"] }),
    ];
    const out = suggestNextProblems(problems, summary, { now: NOW });
    assert.ok(!out.some((s) => s.kind === "gap"), "milestone already covers the weak tag");
  });

  test("respects the limit", () => {
    const problems = [
      solved("hub", 0, {
        similar: [sim("s1"), sim("s2"), sim("s3"), sim("s4"), sim("s5"), sim("s6")],
      }),
    ];
    assert.equal(suggestNextProblems(problems, null, { now: NOW, limit: 2 }).length, 2);
  });
});
