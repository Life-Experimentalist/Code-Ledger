/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  TOPIC_PARENTS,
  FAMILY_ROOTS,
  SYNTHETIC_TOPICS,
  DEFAULT_PARENT,
  resolveParents,
  parentOf,
  ancestorsOf,
  familyOf,
  childrenOf,
  descendantsOf,
  topicForest,
  rollupCounts,
  assertHierarchy,
} from "../src/core/topic-hierarchy.js";
import { normalizeTag, RAW_MAPPINGS, getKnownTopics } from "../src/core/topic-resolver.js";
import { BUILT_IN_KINDS } from "../src/core/topic-taxonomy.js";

/* ------------------------------------------------------------------ */
/* The vocabulary                                                      */
/* ------------------------------------------------------------------ */

test("every topic name is exactly what normalizeTag emits", () => {
  // Same trap as topic-dependencies: a parent named "Heap" instead of
  // "Heap (Priority Queue)" would never match a stored tag, and the branch would
  // sit there permanently empty while looking correct in the source.
  for (const topic of Object.keys(TOPIC_PARENTS)) {
    assert.equal(normalizeTag(topic), topic, `${topic} does not survive normalization`);
  }
});

test("the built-in forest is structurally sound", () => {
  assert.deepEqual(assertHierarchy(), []);
});

test("assertHierarchy has teeth", () => {
  // Passing vacuously would be worse than not having the check.
  assert.ok(assertHierarchy({ A: "B" }).length, "an unknown parent should be caught");
  assert.ok(assertHierarchy({ Stack: "Queue", Queue: "Stack" }).length, "a cycle should be caught");
  assert.ok(assertHierarchy({ Stack: "Stack" }).length, "self-parenting should be caught");
  assert.ok(
    assertHierarchy({ "hash table": null }).length,
    "a name normalizeTag rewrites should be caught",
  );
});

test("every canonical topic the rest of the codebase knows has a home", () => {
  // The point of the file is exhaustiveness. A tag with no parent is a tag the
  // user cannot find in the tree, which makes the tree a lie rather than a map.
  const placed = new Set(Object.keys(TOPIC_PARENTS));
  for (const topic of Object.keys(BUILT_IN_KINDS)) {
    assert.ok(placed.has(topic), `${topic} is classified but has no place in the hierarchy`);
  }
  for (const topic of Object.keys(RAW_MAPPINGS)) {
    assert.ok(
      placed.has(topic),
      `${topic} is a canonical alias target but is not in the hierarchy`,
    );
  }
  for (const topic of getKnownTopics()) {
    assert.ok(
      placed.has(topic),
      `${topic} is weighted for folder naming but is not in the hierarchy`,
    );
  }
});

test("it is a forest — one parent each, every node under exactly one root", () => {
  for (const topic of Object.keys(TOPIC_PARENTS)) {
    const root = familyOf(topic);
    assert.ok(FAMILY_ROOTS.includes(root), `${topic} does not reach a root (got ${root})`);
  }
  const fromRoots = new Set(FAMILY_ROOTS.flatMap((r) => [r, ...descendantsOf(r)]));
  assert.equal(
    fromRoots.size,
    Object.keys(TOPIC_PARENTS).length,
    "walking down from the roots must reach every topic exactly once",
  );
});

test("the invented headings are declared as such", () => {
  // Nothing is ever tagged "Ad Hoc". A count shown against one of these is
  // entirely rolled up, and a UI needs to be able to say so.
  for (const name of SYNTHETIC_TOPICS) {
    assert.ok(name in TOPIC_PARENTS, `${name} is claimed synthetic but is not a topic`);
  }
  assert.ok(SYNTHETIC_TOPICS.includes(DEFAULT_PARENT), "unknown tags should land under a heading");
});

/* ------------------------------------------------------------------ */
/* The edges that motivated the file                                   */
/* ------------------------------------------------------------------ */

test("the monotonic topics sit under their structures instead of being erased", () => {
  assert.equal(parentOf("Monotonic Stack"), "Stack");
  assert.equal(parentOf("Monotonic Queue"), "Queue");
  assert.equal(familyOf("Monotonic Stack"), "Stack");
});

test("the tree families run as deep as the topics do", () => {
  assert.deepEqual(ancestorsOf("Binary Search Tree"), ["Binary Tree", "Tree"]);
  assert.deepEqual(ancestorsOf("Reservoir Sampling"), ["Randomized", "Probability", "Math"]);
  assert.deepEqual(ancestorsOf("Matrix"), ["Array"]);
  assert.deepEqual(ancestorsOf("Array"), []);
});

test("Tree is not filed under Graph", () => {
  // Tempting, and wrong twice over: it inverts the learning order — the whole
  // point of the prerequisite graph is that traversal is learned on a tree first
  // — and it would absorb every tree solve into Graph, hiding the Graph zero
  // that the gap report exists to surface.
  assert.equal(parentOf("Tree"), null);
  assert.ok(!descendantsOf("Graph").includes("Tree"));
});

/* ------------------------------------------------------------------ */
/* Roll-up counting                                                    */
/* ------------------------------------------------------------------ */

const solve = (...tags) => ({ tags });

test("a child's solves count towards its parent without losing the child", () => {
  const counts = rollupCounts([solve("Monotonic Stack"), solve("Stack"), solve("Monotonic Stack")]);

  assert.equal(counts["Monotonic Stack"].own, 2);
  assert.equal(counts["Monotonic Stack"].total, 2);
  assert.equal(counts.Stack.own, 1, "the parent keeps its own tally separate");
  assert.equal(counts.Stack.total, 3, "and the rolled-up total is additive");
});

test("a problem is counted once per topic however many of its tags land there", () => {
  // Without this, a well-tagged problem inflates its family and the tree stops
  // being comparable to the flat counts everywhere else in the app.
  const counts = rollupCounts([solve("Binary Search Tree", "Binary Tree", "Tree")]);
  assert.equal(counts.Tree.total, 1);
  assert.equal(counts.Tree.own, 1);
  assert.equal(counts["Binary Tree"].total, 1);
});

test("roll-up reaches all the way to the root", () => {
  const counts = rollupCounts([solve("Reservoir Sampling")]);
  assert.equal(counts.Math.total, 1);
  assert.equal(counts.Math.own, 0);
  assert.equal(counts.Probability.total, 1);
});

test("rollupCounts falls back to the topic field and survives junk", () => {
  const counts = rollupCounts([
    { topic: "Matrix" },
    { tags: [] },
    { tags: [null, "", "   "] },
    null,
  ]);
  assert.equal(counts.Matrix.own, 1);
  assert.equal(counts.Array.total, 1);
});

test("rollupCounts honours the user's own alias mappings", () => {
  const counts = rollupCounts([solve("my-weird-tag")], { mappings: { "my-weird-tag": "Trie" } });
  assert.equal(counts.Trie.own, 1);
  assert.equal(counts.Tree.total, 1);
});

/* ------------------------------------------------------------------ */
/* The user's corrections                                              */
/* ------------------------------------------------------------------ */

test("an override re-parents a topic and the roll-up follows", () => {
  const overrides = { "Monotonic Stack": "Two Pointers" };
  assert.equal(parentOf("Monotonic Stack", resolveParents(overrides)), "Two Pointers");

  const counts = rollupCounts([solve("Monotonic Stack")], { overrides });
  assert.equal(counts["Two Pointers"].total, 1);
  assert.equal(counts.Stack, undefined, "the old parent no longer collects it");
});

test("the three ways of saying no parent all make a root", () => {
  for (const value of ["", null, "Monotonic Stack"]) {
    const parents = resolveParents({ "Monotonic Stack": value });
    assert.equal(
      parentOf("Monotonic Stack", parents),
      null,
      `${JSON.stringify(value)} should root`,
    );
  }
});

test("an override may invent a topic the built-in map has never heard of", () => {
  const parents = resolveParents({ "Sqrt Decomposition": "Array" });
  assert.equal(parentOf("Sqrt Decomposition", parents), "Array");
  assert.ok(childrenOf("Array", parents).includes("Sqrt Decomposition"));
});

test("a cycle in user settings costs an answer, not the tab", () => {
  // settings.topicParents is user data, and AI healing writes to it too. A walk
  // that trusted it would spin forever the first time somebody swapped two
  // topics round.
  const parents = resolveParents({ Stack: "Queue", Queue: "Stack" });
  assert.deepEqual(ancestorsOf("Stack", parents), ["Queue"]);
  assert.ok(descendantsOf("Stack", parents).includes("Queue"));
  assert.ok(assertHierarchy(parents).some((p) => p.includes("cycle")));
});

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

test("topicForest nests every topic under its root", () => {
  const forest = topicForest();
  assert.equal(forest.length, FAMILY_ROOTS.length);

  const count = (nodes) => nodes.reduce((n, node) => n + 1 + count(node.children), 0);
  assert.equal(count(forest), Object.keys(TOPIC_PARENTS).length);

  const stack = forest.find((n) => n.topic === "Stack");
  assert.equal(stack.depth, 0);
  assert.deepEqual(
    stack.children.map((c) => c.topic),
    ["Monotonic Stack"],
  );
  assert.equal(stack.children[0].depth, 1);
});

test("a topic only the ledger knows about is still rendered, so it can be re-parented", () => {
  const forest = topicForest({ extraTopics: ["Sqrt Decomposition"] });
  const adHoc = forest.find((n) => n.topic === DEFAULT_PARENT);
  const found = adHoc.children.find((c) => c.topic === "Sqrt Decomposition");
  assert.ok(found, "an unplaced tag must be visible or the override map cannot reach it");
  assert.equal(found.known, false);
});

test("topicForest does not double-place a ledger topic it already knows", () => {
  const forest = topicForest({ extraTopics: ["Trie", "trie", "Monotonic Stack"] });
  const adHoc = forest.find((n) => n.topic === DEFAULT_PARENT);
  assert.ok(!adHoc.children.some((c) => c.topic === "Trie"));
  assert.equal(parentOf("Trie"), "Tree");
});
