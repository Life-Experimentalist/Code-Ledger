/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for src/core/topic-taxonomy.js.
 *
 * `now` is always passed explicitly. Mastery decays with wall-clock time, so a
 * suite that lets it default to Date.now() would drift as the numbers age and
 * eventually fail for reasons unrelated to the code.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { normalizeTag } from "../src/core/topic-resolver.js";
import {
  KIND,
  BUILT_IN_KINDS,
  classifyTopic,
  splitTags,
  masteryScore,
  masteryBand,
  effectiveLastSolved,
  masteryOptsFromSettings,
  topicMastery,
  topicGaps,
  buildTopicGraph,
} from "../src/core/topic-taxonomy.js";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 10, 12, 0, 0); // 2026-08-10T12:00:00Z

/** A problem record with only the fields the taxonomy reads. */
function solve({ tags, platform = "leetcode", difficulty = "Medium", daysAgo = 0 }) {
  return { tags, platform, difficulty, timestamp: NOW - daysAgo * DAY };
}

/* ------------------------------------------------------------------ */
/* classifyTopic — cross-platform merging                              */
/* ------------------------------------------------------------------ */

test("the same topic from three platforms lands on one node", () => {
  // The user's requirement: "dp in leetcode and dp in gfg should show properly
  // like they are same and all problems under dp should come under same node".
  for (const raw of [
    "Dynamic Programming", // LeetCode
    "dynamic programming", // GeeksforGeeks
    "dp", // Codeforces
    "dynamic-programming",
    "DynamicProgramming",
  ]) {
    const c = classifyTopic(raw);
    assert.equal(c.topic, "Dynamic Programming", `${raw} should merge`);
    assert.equal(c.kind, KIND.ALGO);
  }
});

test("platform-specific spellings of a structure merge too", () => {
  assert.equal(classifyTopic("dsu").topic, "Union Find");
  assert.equal(classifyTopic("disjoint set").topic, "Union Find");
  assert.equal(classifyTopic("Union Find").topic, "Union Find");
  assert.equal(classifyTopic("dsu").kind, KIND.DS);

  // "bit magic" is GeeksforGeeks' name for LeetCode's "Bit Manipulation".
  assert.equal(classifyTopic("bit magic").topic, "Bit Manipulation");
  assert.equal(classifyTopic("Bit Manipulation").topic, "Bit Manipulation");
});

/* ------------------------------------------------------------------ */
/* classifyTopic — the axis                                            */
/* ------------------------------------------------------------------ */

test("structures and algorithms land on different axes", () => {
  assert.equal(classifyTopic("Array").kind, KIND.DS);
  assert.equal(classifyTopic("Hash Table").kind, KIND.DS);
  assert.equal(classifyTopic("Trie").kind, KIND.DS);

  assert.equal(classifyTopic("Greedy").kind, KIND.ALGO);
  assert.equal(classifyTopic("Backtracking").kind, KIND.ALGO);
  assert.equal(classifyTopic("Topological Sort").kind, KIND.ALGO);
});

test("Binary Search and Binary Search Tree are not the same kind", () => {
  // One word apart in a tag list, and they say completely different things
  // about what the solver can do.
  assert.equal(classifyTopic("Binary Search").kind, KIND.ALGO);
  assert.equal(classifyTopic("Binary Search Tree").kind, KIND.DS);
  assert.equal(classifyTopic("bst").kind, KIND.DS);
});

test("non-DSA tags get their own bucket rather than being called algorithms", () => {
  assert.equal(classifyTopic("Database").kind, KIND.DOMAIN);
  assert.equal(classifyTopic("Shell").kind, KIND.DOMAIN);
  assert.equal(classifyTopic("Design").kind, KIND.DOMAIN);
  assert.equal(classifyTopic("Concurrency").kind, KIND.DOMAIN);
});

test("umbrella tags are dropped, not bucketed", () => {
  // Some platforms tag literally every problem "DSA" or "Algorithms". Bucketing
  // those would produce the single largest node on the graph, meaning nothing.
  for (const raw of ["dsa", "Algorithms", "Data Structures", "programming"]) {
    const c = classifyTopic(raw);
    assert.equal(c.kind, null, `${raw} should be dropped`);
    assert.equal(c.source, "ignored");
  }
});

/* ------------------------------------------------------------------ */
/* classifyTopic — user editorial                                      */
/* ------------------------------------------------------------------ */

test("a user override beats the built-in table", () => {
  assert.equal(classifyTopic("Sorting").kind, KIND.ALGO);
  const c = classifyTopic("Sorting", { Sorting: KIND.DS });
  assert.equal(c.kind, KIND.DS);
  assert.equal(c.source, "user");
});

test("an override is keyed on the canonical name, so it applies to every alias", () => {
  const overrides = { "Dynamic Programming": KIND.DOMAIN };
  assert.equal(classifyTopic("dp", overrides).kind, KIND.DOMAIN);
  assert.equal(classifyTopic("dynamic-programming", overrides).kind, KIND.DOMAIN);
});

test("a malformed override is ignored rather than corrupting the axis", () => {
  // Settings can hold anything a previous version wrote.
  const c = classifyTopic("Array", { Array: "nonsense" });
  assert.equal(c.kind, KIND.DS);
  assert.equal(c.source, "builtin");
});

/* ------------------------------------------------------------------ */
/* classifyTopic — unknown tags                                        */
/* ------------------------------------------------------------------ */

test("an unknown tag is classified by heuristic where one applies", () => {
  const avl = classifyTopic("AVL Tree");
  assert.equal(avl.kind, KIND.DS);
  assert.equal(avl.source, "heuristic");

  assert.equal(classifyTopic("Cycle Sort Technique").kind, KIND.ALGO);
  assert.equal(classifyTopic("SQL Joins").kind, KIND.DOMAIN);
});

test("the structure heuristic outranks the algorithm heuristic", () => {
  // "Red Black Tree" contains no algorithm word, but "Splay Tree Search" does.
  // Structures have conventional names; checking them first is what stops a
  // structure being filed as a technique.
  assert.equal(classifyTopic("Splay Tree Search").kind, KIND.DS);
});

test("a tag no rule recognises defaults to algorithm", () => {
  const c = classifyTopic("Xylophone Reduction");
  assert.equal(c.kind, KIND.ALGO);
  assert.equal(c.source, "default");
  assert.equal(c.topic, "Xylophone Reduction");
});

test("every built-in key is a name normalizeTag can actually produce", () => {
  // Guards the whole table against a class of silent bug: a key spelled the way
  // English spells it ("Doubly-Linked List", "Meet in the Middle") is never
  // reached, because normalizeTag emits "Doubly Linked List" and
  // "Meet In The Middle". The entry looks right and does nothing.
  for (const key of Object.keys(BUILT_IN_KINDS)) {
    assert.equal(
      normalizeTag(key),
      key,
      `BUILT_IN_KINDS key "${key}" normalizes to "${normalizeTag(key)}" and is unreachable`,
    );
    assert.equal(classifyTopic(key).source, "builtin");
  }
});

/* ------------------------------------------------------------------ */
/* splitTags                                                           */
/* ------------------------------------------------------------------ */

test("splitTags separates one problem's tags onto the axes", () => {
  const out = splitTags(["Array", "Hash Table", "Dynamic Programming", "Design"]);
  assert.deepEqual(out.ds, ["Array", "Hash Table"]);
  assert.deepEqual(out.algo, ["Dynamic Programming"]);
  assert.deepEqual(out.domain, ["Design"]);
});

test("splitTags collapses aliases of the same topic", () => {
  const out = splitTags(["hash map", "hashtable", "Hash Table"]);
  assert.deepEqual(out.ds, ["Hash Table"]);
});

test("splitTags tolerates empty, null and missing input", () => {
  assert.deepEqual(splitTags(null), { ds: [], algo: [], domain: [] });
  assert.deepEqual(splitTags([]), { ds: [], algo: [], domain: [] });
  assert.deepEqual(splitTags(["", null, undefined, "dsa"]), { ds: [], algo: [], domain: [] });
});

/* ------------------------------------------------------------------ */
/* masteryScore                                                        */
/* ------------------------------------------------------------------ */

test("mastery is zero with no solves", () => {
  assert.equal(masteryScore({ count: 0, lastSolved: NOW }, { now: NOW }), 0);
});

test("mastery rises with volume but saturates", () => {
  const one = masteryScore({ count: 1, lastSolved: NOW }, { now: NOW });
  const five = masteryScore({ count: 5, lastSolved: NOW }, { now: NOW });
  const twenty = masteryScore({ count: 20, lastSolved: NOW }, { now: NOW });
  const hundred = masteryScore({ count: 100, lastSolved: NOW }, { now: NOW });

  assert.ok(one < five && five < twenty && twenty < hundred);
  // The tenth problem on a topic teaches far less than the second, so the gain
  // from 20 to 100 must be much smaller than the gain from 1 to 20.
  assert.ok(hundred - twenty < (twenty - one) / 10);
  assert.ok(hundred <= 1);
});

test("mastery decays with time and floors instead of hitting zero", () => {
  const fresh = masteryScore({ count: 20, lastSolved: NOW }, { now: NOW });
  const stale = masteryScore({ count: 20, lastSolved: NOW - 365 * DAY }, { now: NOW });
  const ancient = masteryScore({ count: 20, lastSolved: NOW - 10_000 * DAY }, { now: NOW });

  assert.ok(stale < fresh);
  assert.ok(ancient < stale);
  // You do not entirely forget a topic you did twenty problems on.
  assert.ok(ancient > 0.2, `expected a floor, got ${ancient}`);
});

test("one half-life costs a quarter of the score", () => {
  const fresh = masteryScore({ count: 20, lastSolved: NOW }, { now: NOW, halfLifeDays: 90 });
  const half = masteryScore(
    { count: 20, lastSolved: NOW - 90 * DAY },
    { now: NOW, halfLifeDays: 90 },
  );
  // recency goes 1.0 → 0.625, so the score keeps 62.5% of its value.
  assert.ok(Math.abs(half / fresh - 0.625) < 0.001);
});

test("a topic hammered a year ago and one touched once yesterday are both weak", () => {
  // Weak for opposite reasons: one has volume but no recency, the other the
  // reverse. Multiplying the factors is what catches both — averaging them
  // would score the rusty topic around 0.64 and call it solid.
  const rusty = masteryScore({ count: 40, lastSolved: NOW - 400 * DAY }, { now: NOW });
  const shallow = masteryScore({ count: 1, lastSolved: NOW - DAY }, { now: NOW });

  assert.equal(masteryBand(rusty), "shaky");
  assert.equal(masteryBand(shallow), "shaky");

  const rustyIfAveraged = (1 - Math.exp(-40 / 5) + rusty / (1 - Math.exp(-40 / 5))) / 2;
  assert.ok(rustyIfAveraged > 0.4, "sanity: an average really would call it solid");
  assert.ok(rusty < 0.4, `expected the product to stay weak, got ${rusty}`);
});

test("mastery bands cover the whole range", () => {
  assert.equal(masteryBand(0), "untouched");
  assert.equal(masteryBand(0.1), "shaky");
  assert.equal(masteryBand(0.4), "working");
  assert.equal(masteryBand(0.7), "strong");
  assert.equal(masteryBand(1), "strong");
});

/* ------------------------------------------------------------------ */
/* effectiveLastSolved — the regain bar                                */
/* ------------------------------------------------------------------ */

test("one stray solve does not refresh a rusty topic", () => {
  // 40 solves a year ago, then a single problem yesterday. With the default
  // regain bar of 2, recency is measured from the 2nd-most-recent solve —
  // which is still a year old — so the topic stays rusty.
  const recent = [NOW - DAY, ...Array.from({ length: 5 }, (_, i) => NOW - (365 + i) * DAY)];
  assert.equal(effectiveLastSolved(recent, 2), NOW - 365 * DAY);

  // A second recent solve clears the bar and the topic reads fresh again.
  const regained = [NOW - DAY, NOW - 2 * DAY, NOW - 365 * DAY];
  assert.equal(effectiveLastSolved(regained, 2), NOW - 2 * DAY);
});

test("effectiveLastSolved clamps the bar to what exists", () => {
  assert.equal(effectiveLastSolved([], 2), -Infinity);
  assert.equal(effectiveLastSolved([NOW], 3), NOW); // only one solve → use it
  assert.equal(effectiveLastSolved([NOW, NOW - DAY], 0), NOW); // bar floors at 1
  assert.equal(effectiveLastSolved([NOW, NOW - DAY], NaN), NOW);
});

test("masteryOptsFromSettings clamps to sane ranges with defaults", () => {
  assert.deepEqual(masteryOptsFromSettings(undefined), { halfLifeDays: 90, regainSolves: 2 });
  assert.deepEqual(masteryOptsFromSettings({}), { halfLifeDays: 90, regainSolves: 2 });
  assert.deepEqual(
    masteryOptsFromSettings({ mastery_half_life_days: 30, mastery_regain_solves: 3 }),
    { halfLifeDays: 30, regainSolves: 3 },
  );
  assert.deepEqual(
    masteryOptsFromSettings({ mastery_half_life_days: 1, mastery_regain_solves: 99 }),
    { halfLifeDays: 7, regainSolves: 8 },
  );
  assert.deepEqual(
    masteryOptsFromSettings({ mastery_half_life_days: "not a number", mastery_regain_solves: null }),
    { halfLifeDays: 90, regainSolves: 2 },
  );
});

test("topicMastery honours the regain bar end to end", () => {
  const history = [
    ...Array.from({ length: 10 }, (_, i) => solve({ tags: ["Graph"], daysAgo: 300 + i })),
    solve({ tags: ["Graph"], daysAgo: 1 }),
  ];
  const strict = topicMastery(history, { now: NOW, regainSolves: 2 });
  const lax = topicMastery(history, { now: NOW, regainSolves: 1 });
  assert.ok(
    strict[0].mastery < lax[0].mastery,
    "one fresh solve should not lift mastery when the bar is 2",
  );
  // The displayed staleness still reports the true latest solve.
  assert.equal(strict[0].daysSince, 1);
});

/* ------------------------------------------------------------------ */
/* topicMastery                                                        */
/* ------------------------------------------------------------------ */

test("topicMastery merges the same topic across platforms", () => {
  const out = topicMastery(
    [
      solve({ tags: ["Dynamic Programming"], platform: "leetcode" }),
      solve({ tags: ["dp"], platform: "codeforces" }),
      solve({ tags: ["dynamic programming"], platform: "geeksforgeeks" }),
    ],
    { now: NOW },
  );

  assert.equal(out.length, 1);
  assert.equal(out[0].topic, "Dynamic Programming");
  assert.equal(out[0].count, 3);
  assert.deepEqual(out[0].platforms, ["codeforces", "geeksforgeeks", "leetcode"]);
});

test("topicMastery counts a problem once per topic, not once per alias", () => {
  const out = topicMastery([solve({ tags: ["hash map", "hashtable", "Hash Table"] })], {
    now: NOW,
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].count, 1);
});

test("topicMastery records difficulty spread and staleness", () => {
  const out = topicMastery(
    [
      solve({ tags: ["Greedy"], difficulty: "Easy", daysAgo: 30 }),
      solve({ tags: ["Greedy"], difficulty: "Hard", daysAgo: 5 }),
      solve({ tags: ["Greedy"], difficulty: "Hard", daysAgo: 200 }),
    ],
    { now: NOW },
  );

  assert.deepEqual(out[0].byDifficulty, { Easy: 1, Hard: 2 });
  assert.equal(out[0].daysSince, 5, "staleness uses the most recent solve");
});

test("topicMastery falls back to the topic field when tags are absent", () => {
  const out = topicMastery([{ topic: "Greedy", platform: "leetcode", timestamp: NOW }], {
    now: NOW,
  });
  assert.equal(out[0].topic, "Greedy");
});

test("topicMastery survives malformed records", () => {
  const out = topicMastery(
    [
      null,
      undefined,
      {},
      { tags: [] },
      { tags: ["Greedy"] }, // no timestamp
      solve({ tags: ["Greedy"] }),
    ],
    { now: NOW },
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].count, 2);
  assert.equal(out[0].daysSince, 0, "the dated solve still sets staleness");
});

test("topicMastery is sorted by volume", () => {
  const out = topicMastery(
    [
      solve({ tags: ["Array", "Greedy"] }),
      solve({ tags: ["Array"] }),
      solve({ tags: ["Array"] }),
    ],
    { now: NOW },
  );
  assert.equal(out[0].topic, "Array");
  assert.equal(out[0].count, 3);
  assert.equal(out[1].count, 1);
});

/* ------------------------------------------------------------------ */
/* topicGaps                                                           */
/* ------------------------------------------------------------------ */

/** 20 array-only Easy problems and 2 DP problems — the skew the split fixes. */
function skewedLedger() {
  const list = [];
  for (let i = 0; i < 20; i++) {
    list.push(solve({ tags: ["Array"], difficulty: "Easy", daysAgo: i }));
  }
  list.push(solve({ tags: ["Array", "Dynamic Programming"], difficulty: "Hard", daysAgo: 200 }));
  list.push(solve({ tags: ["Array", "Dynamic Programming"], difficulty: "Hard", daysAgo: 210 }));
  return list;
}

test("algoRatio exposes the grind that a flat topic count hides", () => {
  const g = topicGaps(skewedLedger(), { now: NOW });
  // 22 Array solves against 2 DP solves. A flat chart would say "Array is your
  // top topic" and stop; the ratio says only 8% of the work needed a technique.
  assert.ok(g.summary.algoRatio < 0.1, `expected a low ratio, got ${g.summary.algoRatio}`);
  assert.equal(g.summary.dsTopics, 1);
  assert.equal(g.summary.algoTopics, 1);
});

test("weak structures and weak algorithms are ranked separately", () => {
  const g = topicGaps(skewedLedger(), { now: NOW });
  // Array must never appear in the algorithm ranking, which is the entire point
  // of the split — it would otherwise dominate both lists.
  assert.ok(!g.algo.some((t) => t.topic === "Array"));
  assert.ok(g.ds.some((t) => t.topic === "Array"));
  assert.equal(g.algo[0].topic, "Dynamic Programming");
});

test("the weakest topics come first in each axis", () => {
  const problems = [
    ...Array.from({ length: 15 }, () => solve({ tags: ["Greedy"] })),
    solve({ tags: ["Backtracking"], daysAgo: 300 }),
  ];
  const g = topicGaps(problems, { now: NOW });
  assert.equal(g.algo[0].topic, "Backtracking");
  assert.ok(g.algo[0].mastery < g.algo[1].mastery);
});

test("untouched lists known topics with no solves, and excludes the non-DSA bucket", () => {
  const g = topicGaps([solve({ tags: ["Array"] })], { now: NOW });
  const names = g.untouched.map((t) => t.topic);
  assert.ok(names.includes("Trie"));
  assert.ok(names.includes("Dynamic Programming"));
  assert.ok(!names.includes("Array"), "a solved topic is not a blind spot");
  assert.ok(!names.includes("Shell"), "not having done a shell problem is not a gap");
});

test("topicGaps on an empty ledger reports zero rather than dividing by zero", () => {
  const g = topicGaps([], { now: NOW });
  assert.equal(g.summary.algoRatio, 0);
  assert.deepEqual(g.ds, []);
  assert.deepEqual(g.algo, []);
});

test("topicGaps honours the limit", () => {
  const problems = ["Greedy", "Backtracking", "Recursion", "Sorting", "Math", "Geometry"].map((t) =>
    solve({ tags: [t] }),
  );
  assert.equal(topicGaps(problems, { now: NOW, limit: 3 }).algo.length, 3);
});

/* ------------------------------------------------------------------ */
/* buildTopicGraph                                                     */
/* ------------------------------------------------------------------ */

test("graph nodes carry the axis, the band and every platform", () => {
  const { nodes } = buildTopicGraph(
    [
      solve({ tags: ["Dynamic Programming"], platform: "leetcode" }),
      solve({ tags: ["dp"], platform: "geeksforgeeks" }),
    ],
    { now: NOW },
  );

  assert.equal(nodes.length, 1, "one canonical topic, one node");
  assert.equal(nodes[0].id, "topic:Dynamic Programming");
  assert.equal(nodes[0].kind, KIND.ALGO);
  assert.deepEqual(nodes[0].platforms, ["geeksforgeeks", "leetcode"]);
  assert.equal(nodes[0].band, masteryBand(nodes[0].mastery));
});

test("co-occurring topics are linked, weighted by how often", () => {
  const { links } = buildTopicGraph(
    [
      solve({ tags: ["Array", "Dynamic Programming"] }),
      solve({ tags: ["Array", "Dynamic Programming"] }),
      solve({ tags: ["Array", "Dynamic Programming"] }),
    ],
    { now: NOW },
  );

  assert.equal(links.length, 1);
  assert.equal(links[0].weight, 3);
  assert.deepEqual(
    [links[0].source, links[0].target].sort(),
    ["topic:Array", "topic:Dynamic Programming"],
  );
});

test("a single co-occurrence is noise and is dropped by default", () => {
  const { links } = buildTopicGraph([solve({ tags: ["Array", "Greedy"] })], { now: NOW });
  assert.equal(links.length, 0);
  assert.equal(buildTopicGraph([solve({ tags: ["Array", "Greedy"] })], {
    now: NOW,
    minCoOccurrence: 1,
  }).links.length, 1);
});

test("cross-platform aliases produce one edge, not two", () => {
  const { links } = buildTopicGraph(
    [
      solve({ tags: ["Array", "Dynamic Programming"], platform: "leetcode" }),
      solve({ tags: ["arrays", "dp"], platform: "geeksforgeeks" }),
    ],
    { now: NOW },
  );
  assert.equal(links.length, 1);
  assert.equal(links[0].weight, 2);
});

test("a topic tagged twice under different aliases does not link to itself", () => {
  const { links } = buildTopicGraph(
    [solve({ tags: ["hash map", "hashtable"] }), solve({ tags: ["hash map", "hashtable"] })],
    { now: NOW, minCoOccurrence: 1 },
  );
  assert.equal(links.length, 0);
});

test("buildTopicGraph tolerates an empty ledger", () => {
  const g = buildTopicGraph([], { now: NOW });
  assert.deepEqual(g.nodes, []);
  assert.deepEqual(g.links, []);
});
