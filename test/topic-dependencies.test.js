/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for src/core/topic-dependencies.js.
 *
 * `now` is always passed explicitly, for the reason topic-taxonomy.test.js
 * gives: mastery decays with wall-clock time, so a suite that lets it default to
 * Date.now() drifts as the numbers age and eventually fails for reasons
 * unrelated to the code.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { normalizeTag } from "../src/core/topic-resolver.js";
import { BUILT_IN_KINDS, KIND } from "../src/core/topic-taxonomy.js";
import {
  TIER,
  REFERENCE_TOPICS,
  EXCLUDED_TOPICS,
  TOPIC_ORDER,
  orderIndex,
  assertReferenceVocabulary,
  topicReadiness,
  nextTopics,
  absentTopics,
  referenceCoverage,
} from "../src/core/topic-dependencies.js";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 10, 12, 0, 0);

/** A problem record with only the fields the taxonomy reads. */
function solve({ tags, difficulty = "Medium", daysAgo = 1 }) {
  return { tags, platform: "leetcode", difficulty, timestamp: NOW - daysAgo * DAY };
}

/** `n` solves of one topic, spread over recent days so recency stays high. */
function reps(tag, n, { daysAgo = 1, difficulty = "Medium" } = {}) {
  return Array.from({ length: n }, (_, i) =>
    solve({ tags: [tag], difficulty, daysAgo: daysAgo + i }),
  );
}

const OPTS = { now: NOW };

/* ------------------------------------------------------------------ */
/* The vocabulary trap                                                 */
/* ------------------------------------------------------------------ */

test("every reference topic survives normalizeTag unchanged", () => {
  // The bug this guards is real and shipped once: template slugs were compared
  // against display tags, so every multi-word milestone scored zero for the
  // life of the feature. A reference topic whose name normalizeTag rewrites can
  // never match a stored tag, so it would read as permanently absent and nag
  // forever about something unreachable.
  assert.deepEqual(assertReferenceVocabulary(), []);
});

test("a plausible-looking wrong name would be caught", () => {
  // Proves the check has teeth rather than passing vacuously: these are the
  // spellings someone would reach for, and each one normalizes to something
  // else, so each would be unreachable.
  for (const wrong of ["heap-priority-queue", "dfs", "Dynamic programming", "hash table"]) {
    assert.notEqual(normalizeTag(wrong), wrong, `${wrong} should not survive normalization`);
  }
});

test("the topics people look for and cannot find are documented, not just missing", () => {
  const named = EXCLUDED_TOPICS.map((e) => e.name);
  assert.ok(named.includes("Intervals"));

  for (const entry of EXCLUDED_TOPICS) {
    assert.ok(!(entry.name in REFERENCE_TOPICS), `${entry.name} must not be a reference topic`);
    assert.ok(entry.reason.length > 20, `${entry.name} needs a reason worth showing`);
    // The fold target has to be a real reference topic, or the explanation
    // sends the user to look somewhere that does not exist.
    assert.ok(entry.foldedInto in REFERENCE_TOPICS, `${entry.foldedInto} should be a real topic`);
  }
});

test("Monotonic Stack and Monotonic Queue survive normalization now", () => {
  // These were excluded topics for as long as the resolver folded them into
  // their parents. The fold is gone — containment moved to topic-hierarchy.js,
  // which rolls the count up without rewriting the name — so both are reachable
  // reference topics, and this test fails if anyone re-adds the alias.
  assert.equal(normalizeTag("Monotonic Stack"), "Monotonic Stack");
  assert.equal(normalizeTag("monotonic-stack"), "Monotonic Stack");
  assert.equal(normalizeTag("monotonic queue"), "Monotonic Queue");
  assert.ok("Monotonic Stack" in REFERENCE_TOPICS);
  assert.ok("Monotonic Queue" in REFERENCE_TOPICS);
});

/* ------------------------------------------------------------------ */
/* The graph                                                           */
/* ------------------------------------------------------------------ */

test("every prerequisite names a topic that exists", () => {
  for (const [topic, entry] of Object.entries(REFERENCE_TOPICS)) {
    for (const p of entry.prereqs) {
      assert.ok(p in REFERENCE_TOPICS, `${topic} depends on unknown topic ${p}`);
      assert.notEqual(p, topic, `${topic} depends on itself`);
    }
  }
});

test("TOPIC_ORDER is a valid topological sort", () => {
  assert.equal(TOPIC_ORDER.length, Object.keys(REFERENCE_TOPICS).length);
  for (const topic of TOPIC_ORDER) {
    for (const p of REFERENCE_TOPICS[topic].prereqs) {
      assert.ok(
        orderIndex(p) < orderIndex(topic),
        `${p} must come before ${topic} (${orderIndex(p)} vs ${orderIndex(topic)})`,
      );
    }
  }
});

test("the ordering is dependency-shaped, not frequency- or alphabet-shaped", () => {
  // The stated requirement: Binary Search before Sliding Window before Heap
  // before Graph. Frequency ordering would put Array and Dynamic Programming
  // near the front; alphabetical would open with Array, Backtracking, Binary
  // Search Tree. Neither produces this sequence.
  const seq = ["Binary Search", "Sliding Window", "Heap (Priority Queue)", "Graph"];
  for (let i = 1; i < seq.length; i++) {
    assert.ok(
      orderIndex(seq[i - 1]) < orderIndex(seq[i]),
      `${seq[i - 1]} should precede ${seq[i]}`,
    );
  }

  // Dynamic Programming is the single most-tagged interview technique and it is
  // deliberately late, because Recursion gates it.
  assert.ok(orderIndex("Recursion") < orderIndex("Dynamic Programming"));
  assert.ok(orderIndex("Array") < orderIndex("Dynamic Programming"));

  // Traversal is learned on a tree before it is transferred to a graph.
  assert.ok(orderIndex("Binary Tree") < orderIndex("Depth-First Search"));
  assert.ok(orderIndex("Depth-First Search") < orderIndex("Graph"));
  assert.ok(orderIndex("Graph") < orderIndex("Shortest Path"));
});

test("a topic outside the reference set sorts last rather than first", () => {
  // orderIndex returning 0 or -1 for an unknown topic would silently promote
  // every unrecognised tag to the front of any list sorted by it.
  assert.equal(orderIndex("Reservoir Sampling"), Infinity);
  assert.equal(orderIndex(""), Infinity);
  assert.ok(orderIndex("Array") < orderIndex("nonsense"));
});

test("reference topics are algorithms or structures, never the Other bucket", () => {
  // A reference set containing Database or Shell would tell someone preparing
  // for an algorithm interview to go and learn SQL.
  for (const topic of Object.keys(REFERENCE_TOPICS)) {
    const kind = BUILT_IN_KINDS[topic];
    if (!kind) continue; // heuristic-classified; nothing to assert
    assert.notEqual(kind, KIND.DOMAIN, `${topic} is in the Other bucket and is not interview work`);
  }
});

/* ------------------------------------------------------------------ */
/* Readiness                                                           */
/* ------------------------------------------------------------------ */

test("a topic whose prerequisites are missing is blocked, and names the blocker", () => {
  // Someone who has done nothing but arrays. Dynamic Programming is weak, which
  // is true and useless — what they need to hear is "Recursion first".
  const rows = topicReadiness(reps("Array", 30), OPTS);
  const dp = rows.find((r) => r.topic === "Dynamic Programming");

  assert.equal(dp.state, "blocked");
  assert.deepEqual(dp.blockedBy, ["Recursion"]);
  // Array is held, so it is not also reported as the blocker.
  assert.ok(!dp.blockedBy.includes("Array"));
});

test("a topic with everything upstream held is ready even with zero solves", () => {
  const problems = [...reps("Array", 20), ...reps("Sorting", 20)];
  const rows = topicReadiness(problems, OPTS);

  const binarySearch = rows.find((r) => r.topic === "Binary Search");
  assert.equal(binarySearch.count, 0);
  assert.equal(binarySearch.state, "ready");
  assert.deepEqual(binarySearch.blockedBy, []);

  // And the one behind it is still blocked, by the one in front.
  const bst = rows.find((r) => r.topic === "Binary Search Tree");
  assert.equal(bst.state, "blocked");
  assert.ok(bst.blockedBy.includes("Binary Search"));
});

test("a held topic still reports a shaky prerequisite", () => {
  // Hiding the edge because the downstream topic looks fine would make the
  // graph read as sound when the foundation under it is not.
  const problems = [
    ...reps("Array", 25),
    ...reps("Sorting", 25),
    ...reps("Heap (Priority Queue)", 25, { daysAgo: 400 }),
  ];
  const rows = topicReadiness(problems, { ...OPTS, halfLifeDays: 30 });
  const heap = rows.find((r) => r.topic === "Heap (Priority Queue)");

  assert.ok(heap.mastery < 0.7, "a topic last touched over a year ago should have decayed");
  assert.deepEqual(heap.blockedBy, [], "Sorting is fresh, so nothing upstream is missing");
});

test("volume alone does not make a topic held once it has gone stale", () => {
  const fresh = topicReadiness(reps("Array", 30, { daysAgo: 1 }), OPTS);
  const stale = topicReadiness(reps("Array", 30, { daysAgo: 500 }), OPTS);

  assert.equal(fresh.find((r) => r.topic === "Array").state, "held");
  assert.notEqual(stale.find((r) => r.topic === "Array").state, "held");
});

test("nextTopics offers only ready topics, earliest-unlocking first", () => {
  const problems = [...reps("Array", 20), ...reps("String", 20), ...reps("Recursion", 20)];
  const next = nextTopics(problems, { ...OPTS, limit: 4 });

  assert.ok(next.length > 0);
  for (const t of next) {
    assert.equal(t.state, "ready");
    assert.deepEqual(t.blockedBy, []);
  }
  // Dependency order, not weakness order — all four are equally weak at zero.
  const positions = next.map((t) => orderIndex(t.topic));
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
  );

  // Nothing downstream of an unmet topic sneaks in.
  assert.ok(!next.some((t) => t.topic === "Graph"));
});

/* ------------------------------------------------------------------ */
/* The defect this module exists to fix                                */
/* ------------------------------------------------------------------ */

test("absent topics are ranked by what the zero costs, not by table order", () => {
  // The shape of the reported ledger: a great deal of Array, a little of a few
  // things, and nothing at all in several places that matter.
  const problems = [
    ...reps("Array", 133, { daysAgo: 2 }),
    ...reps("Binary Search", 2),
    ...reps("Sliding Window", 2),
    ...reps("Graph", 4),
    ...reps("Depth-First Search", 1),
  ];
  const absent = absentTopics(problems, OPTS);
  const names = absent.map((a) => a.topic);

  // The three real zeros from that ledger are all present...
  for (const t of ["Heap (Priority Queue)", "Backtracking", "Trie"]) {
    assert.ok(names.includes(t), `${t} should be reported absent`);
  }

  // ...and, the actual bug, they are not buried under contest material.
  // topicGaps() slices the first twelve of BUILT_IN_KINDS in literal order,
  // which spends slots on Suffix Array, Data Stream and Iterator before it
  // reaches any of these.
  for (const noise of ["Suffix Array", "Max Flow", "Eulerian Circuit", "Data Stream", "Iterator"]) {
    assert.ok(!names.includes(noise), `${noise} is not an interview gap`);
  }

  // Foundations outrank differentiators whatever their position in the table.
  const heap = names.indexOf("Heap (Priority Queue)");
  const trie = names.indexOf("Trie");
  assert.ok(heap < trie, "a core zero outranks a differentiator zero");
});

test("contest topics are reported only when asked for", () => {
  const problems = reps("Array", 10);
  assert.ok(!absentTopics(problems, OPTS).some((a) => a.tier === TIER.COMPETITIVE));

  const withContest = absentTopics(problems, { ...OPTS, maxTier: TIER.COMPETITIVE });
  assert.ok(withContest.some((a) => a.topic === "Max Flow"));
  // Still last, even when included.
  const firstContest = withContest.findIndex((a) => a.tier === TIER.COMPETITIVE);
  const lastNormal = withContest.map((a) => a.tier).lastIndexOf(TIER.DIFFERENTIATOR);
  assert.ok(firstContest > lastNormal);
});

test("an empty ledger reports every reference topic as absent, foundations first", () => {
  const absent = absentTopics([], OPTS);
  assert.equal(absent.length, absent.filter((a) => a.count === 0).length);
  assert.equal(absent[0].tier, TIER.FOUNDATION);
  // Nothing is blocked on an empty ledger's behalf in a way that hides the
  // starting point: the roots are ready.
  assert.ok(absent.some((a) => a.state === "ready"));
});

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

test("coverage is reported per tier, not as one number", () => {
  const problems = [...reps("Array", 20), ...reps("String", 10), ...reps("Graph", 3)];
  const cov = referenceCoverage(problems, OPTS);

  const foundation = cov.byTier.find((t) => t.tier === TIER.FOUNDATION);
  assert.equal(foundation.met, 2, "Array and String");
  assert.ok(foundation.total >= 10);
  assert.ok(foundation.absent.includes("Hash Table"));

  // A single overall percentage would move mostly with how many contest topics
  // sit in the denominator; per tier it says something.
  assert.equal(cov.met, 3);
  assert.ok(cov.total > cov.met);
  assert.ok(!cov.byTier.some((t) => t.tier === TIER.COMPETITIVE));
});

test("held counts only the topics that are actually solid", () => {
  const problems = [...reps("Array", 25, { daysAgo: 1 }), ...reps("String", 1, { daysAgo: 300 })];
  const cov = referenceCoverage(problems, OPTS);
  const foundation = cov.byTier.find((t) => t.tier === TIER.FOUNDATION);

  assert.equal(foundation.met, 2, "both were met at some point");
  assert.equal(foundation.held, 1, "only one of them is still held");
});
