/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for src/data/problem-sets.js.
 *
 * These check shape and vocabulary. They cannot check that a slug is a real
 * LeetCode problem — only the network can, which is what
 * `dev/validate-problem-sets.js` is for.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { normalizeTag } from "../src/core/topic-resolver.js";
import { REFERENCE_TOPICS } from "../src/core/topic-dependencies.js";
import {
  NEETCODE_150,
  NEETCODE_GROUP_TOPICS,
  NEETCODE_BY_TOPIC,
  STRIVER_A2Z_STEPS,
  unsolvedForTopic,
  problemUrl,
} from "../src/data/problem-sets.js";

test("the list is 150 problems", () => {
  assert.equal(NEETCODE_150.length, 150);
});

test("no slug appears twice", () => {
  const slugs = NEETCODE_150.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test("every problem is fully formed", () => {
  for (const p of NEETCODE_150) {
    assert.match(p.slug, /^[a-z0-9-]+$/, `bad slug: ${p.slug}`);
    assert.ok(p.title, `no title: ${p.slug}`);
    assert.ok(["Easy", "Medium", "Hard"].includes(p.difficulty), `bad difficulty: ${p.slug}`);
    assert.ok(NEETCODE_GROUP_TOPICS[p.group], `group has no topic mapping: ${p.group}`);
  }
});

test("every group maps onto topics the rest of the app knows", () => {
  // The vocabulary trap: a group mapped to "heap-priority-queue" or "Trees"
  // would attach its problems to a topic no readiness row has, so the plan
  // would quietly never suggest them.
  for (const [group, topics] of Object.entries(NEETCODE_GROUP_TOPICS)) {
    assert.ok(topics.length, `${group} maps to nothing`);
    for (const t of topics) {
      assert.ok(REFERENCE_TOPICS[t], `${group} maps to unknown topic "${t}"`);
      assert.equal(normalizeTag(t), t, `"${t}" does not survive normalizeTag`);
    }
  }
});

test("Striver's steps are complete and sequential", () => {
  assert.equal(STRIVER_A2Z_STEPS.length, 18);
  STRIVER_A2Z_STEPS.forEach((s, i) => {
    assert.equal(s.step, i + 1);
    assert.ok(s.title);
    assert.ok(s.topics.length);
    for (const t of s.topics)
      assert.ok(REFERENCE_TOPICS[t], `step ${s.step}: unknown topic "${t}"`);
  });
});

test("problems are indexed under every topic their group touches", () => {
  // "Trees" is evidence for Binary Tree and for DFS, and the tags land that way
  // anyway. Filing it under one would make the other look emptier than it is.
  const slugs = (topic) => (NEETCODE_BY_TOPIC[topic] || []).map((p) => p.slug);
  assert.ok(slugs("Binary Tree").includes("invert-binary-tree"));
  assert.ok(slugs("Depth-First Search").includes("invert-binary-tree"));
});

test("each topic's problems run easiest first", () => {
  const rank = { Easy: 0, Medium: 1, Hard: 2 };
  for (const [topic, list] of Object.entries(NEETCODE_BY_TOPIC)) {
    for (let i = 1; i < list.length; i++) {
      assert.ok(
        rank[list[i - 1].difficulty] <= rank[list[i].difficulty],
        `${topic} is out of order at ${list[i].slug}`,
      );
    }
  }
});

test("unsolvedForTopic skips what is already in the ledger", () => {
  const before = unsolvedForTopic("Binary Search");
  const after = unsolvedForTopic("Binary Search", [{ titleSlug: "binary-search" }]);
  assert.equal(after.length, before.length - 1);
  assert.ok(!after.some((p) => p.slug === "binary-search"));
});

test("unsolvedForTopic honours difficulty and limit", () => {
  const easy = unsolvedForTopic("Binary Search", [], { difficulty: "Easy" });
  assert.ok(easy.every((p) => p.difficulty === "Easy"));
  assert.equal(unsolvedForTopic("Graph", [], { limit: 3 }).length, 3);
});

test("an unknown topic yields nothing rather than throwing", () => {
  assert.deepEqual(unsolvedForTopic("Nonexistent Topic", []), []);
});

test("the URL is the one LeetCode actually serves", () => {
  assert.equal(problemUrl({ slug: "two-sum" }), "https://leetcode.com/problems/two-sum/");
});
