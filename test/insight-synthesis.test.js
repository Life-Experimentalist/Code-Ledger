/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Derived insights — the sentences that fill the Insights tab.
 *
 * These claims are shown to the learner as statements of fact about how they
 * solve, so the failures worth guarding are the ones that make a true-sounding
 * sentence wrong: a count inflated by double-counting one problem, a habit
 * asserted from a single afternoon, or a key that drifts between runs and turns
 * an update into a duplicate.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { deriveInsights, MIN_PROBLEMS_FOR_INSIGHT } from "../src/core/memory/insight-synthesis.js";

/** A bank entry whose review flagged `flags` on every listed problem. */
function flagged(slug, flags, over = {}) {
  return {
    slug,
    platform: "leetcode",
    tags: [],
    solves: [{ ts: 1000, elapsedSeconds: 0 }],
    aiInsights: [{ ts: 1000, weakAreas: flags, summary: "", hasTakeaway: true }],
    ...over,
  };
}

const flagInsights = (entries) => deriveInsights(entries).filter((i) => i.meta.kind === "flag");
const topicInsights = (entries) => deriveInsights(entries).filter((i) => i.meta.kind === "topic");

describe("the threshold", () => {
  test("stays quiet below it — one bad afternoon is not a habit", () => {
    const entries = Array.from({ length: MIN_PROBLEMS_FOR_INSIGHT - 1 }, (_, i) =>
      flagged(`p${i}`, ["edge cases"]),
    );
    assert.equal(flagInsights(entries).length, 0);
  });

  test("writes the insight once the pattern reaches it", () => {
    const entries = Array.from({ length: MIN_PROBLEMS_FOR_INSIGHT }, (_, i) =>
      flagged(`p${i}`, ["edge cases"]),
    );
    const found = flagInsights(entries);
    assert.equal(found.length, 1);
    assert.equal(found[0].meta.problems, MIN_PROBLEMS_FOR_INSIGHT);
  });

  test("an empty bank produces nothing rather than an empty-sounding claim", () => {
    assert.deepEqual(deriveInsights([]), []);
    assert.deepEqual(deriveInsights(), []);
  });
});

describe("counting", () => {
  test("a label flagged twice on one problem still counts as one problem", () => {
    // A problem keeps up to three review snapshots. Two of them naming the same
    // weakness is one problem with that weakness, not two — this is exactly the
    // arithmetic that would quietly inflate every number in the tab.
    const entries = [
      flagged("a", ["edge cases"], {
        aiInsights: [
          { ts: 1, weakAreas: ["edge cases"] },
          { ts: 2, weakAreas: ["edge cases"] },
          { ts: 3, weakAreas: ["edge cases"] },
        ],
      }),
      flagged("b", ["edge cases"]),
    ];
    assert.equal(flagInsights(entries).length, 0, "3 snapshots on 2 problems is still 2 problems");
  });

  test("labels are matched case-insensitively so one habit is not split in two", () => {
    const entries = [
      flagged("a", ["Edge Cases"]),
      flagged("b", ["edge cases"]),
      flagged("c", ["EDGE CASES"]),
    ];
    const found = flagInsights(entries);
    assert.equal(found.length, 1);
    assert.equal(found[0].meta.problems, 3);
  });

  test("blank labels are dropped rather than becoming an unnamed insight", () => {
    const entries = ["a", "b", "c"].map((s) => flagged(s, ["", "  ", null]));
    assert.equal(flagInsights(entries).length, 0);
  });
});

describe("what the sentence says", () => {
  const entries = [
    flagged("two-sum", ["space complexity"], { solves: [{ ts: 300 }] }),
    flagged("lru-cache", ["space complexity"], { solves: [{ ts: 200 }] }),
    flagged("assign-cookies", ["space complexity"], { solves: [{ ts: 100 }] }),
  ];

  test("names the problems, which is the part the statistics block cannot give", () => {
    const [insight] = flagInsights(entries);
    assert.match(insight.content, /two sum/);
    assert.match(insight.content, /lru cache/);
    assert.match(insight.content, /assign cookies/);
  });

  test("names the newest problems first", () => {
    const [insight] = flagInsights(entries);
    assert.deepEqual(
      insight.meta.examples.map((e) => e.slug),
      ["two-sum", "lru-cache", "assign-cookies"],
    );
  });

  test("quotes the same count it stores", () => {
    const [insight] = flagInsights(entries);
    assert.match(insight.content, new RegExp(`\\b${insight.meta.problems}\\b`));
  });
});

describe("keys", () => {
  test("are stable across runs, so a recompute updates instead of duplicating", () => {
    const entries = ["a", "b", "c"].map((s) => flagged(s, ["time complexity"]));
    const first = deriveInsights(entries).map((i) => i.key);
    const second = deriveInsights([...entries].reverse()).map((i) => i.key);
    assert.deepEqual(first.sort(), second.sort());
  });

  test("do not collide between a flag and a topic of the same name", () => {
    const entries = ["a", "b", "c"].map((s) =>
      flagged(s, ["sorting"], { tags: ["sorting"], hintViews: 1 }),
    );
    const keys = deriveInsights(entries).map((i) => i.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  test("every derived insight is marked derived, so the prompt can skip them", () => {
    const entries = ["a", "b", "c"].map((s) => flagged(s, ["time complexity"]));
    assert.ok(deriveInsights(entries).every((i) => i.type === "derived"));
  });
});

describe("topics under strain", () => {
  test("counts a topic only where it actually cost something", () => {
    // Three clean solves in a topic is competence, not strain. Ranking by tag
    // frequency alone would surface the topics they are best at.
    const clean = ["a", "b", "c"].map((s) => ({
      slug: s,
      platform: "leetcode",
      tags: ["array"],
      solves: [{ ts: 1 }],
    }));
    assert.equal(topicInsights(clean).length, 0);
  });

  test("a hint, a resubmit, or a flagged review each count as strain", () => {
    const strained = [
      { slug: "a", tags: ["graph"], hintViews: 2, solves: [{ ts: 1 }] },
      { slug: "b", tags: ["graph"], solves: [{ ts: 1 }, { ts: 2 }] },
      { slug: "c", tags: ["graph"], solves: [{ ts: 1 }], aiInsights: [{ ts: 1, weakAreas: [] }] },
    ];
    const found = topicInsights(strained);
    assert.equal(found.length, 1);
    assert.equal(found[0].meta.problems, 3);
  });
});
