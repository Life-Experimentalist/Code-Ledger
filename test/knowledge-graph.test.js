/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The graph builder's mastery pass.
 *
 * The interesting property is that a topic node carries two different counts:
 * `count` sizes the node and includes the unsolved suggestions hanging off the
 * topic, while `solveCount` says how much work the user actually did. Colouring
 * by mastery is only honest if it reads the second one.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildKnowledgeGraph } from "../src/core/knowledge-graph.js";

const DAY = 86_400_000;

/** A solved problem in the shape the graph builder expects. */
function solve(titleSlug, tags, daysAgo) {
  return {
    titleSlug,
    title: titleSlug,
    platform: "leetcode",
    difficulty: "Easy",
    tags,
    timestamp: Date.now() - daysAgo * DAY,
  };
}

const topicNode = (graph, label) =>
  graph.nodes.find((n) => n.type === "topic" && n.label === label);

describe("buildKnowledgeGraph mastery", () => {
  it("attaches a score, a band and a recency to every topic node", () => {
    const graph = buildKnowledgeGraph([solve("a", ["Array"], 1), solve("b", ["Array"], 3)]);
    const array = topicNode(graph, "Array");

    assert.ok(array, "the topic node exists");
    assert.equal(array.solveCount, 2);
    assert.ok(array.mastery > 0 && array.mastery <= 1);
    assert.equal(array.band, "shaky");
    assert.equal(array.daysSince, 1);
  });

  it("ranks a fresh, heavily-solved topic above a stale, thin one", () => {
    const problems = [
      ...Array.from({ length: 12 }, (_, i) => solve(`fresh-${i}`, ["Dynamic Programming"], i)),
      solve("stale", ["Trie"], 400),
    ];
    const graph = buildKnowledgeGraph(problems);

    assert.equal(topicNode(graph, "Dynamic Programming").band, "strong");
    assert.ok(topicNode(graph, "Trie").mastery < topicNode(graph, "Dynamic Programming").mastery);
  });

  it("does not count unsolved suggestions as solves", () => {
    const graph = buildKnowledgeGraph([
      {
        ...solve("solved-one", ["Graph"], 0),
        similar: [
          { titleSlug: "ghost-a", title: "Ghost A", difficulty: "Hard", topicTags: ["Graph"] },
          { titleSlug: "ghost-b", title: "Ghost B", difficulty: "Hard", topicTags: ["Graph"] },
        ],
      },
    ]);
    const graphTopic = topicNode(graph, "Graph");

    // Three problems hang off the topic, but only one of them was solved.
    assert.equal(graphTopic.count, 3);
    assert.equal(graphTopic.solveCount, 1);
  });

  it("leaves a topic reached only by suggestions at zero", () => {
    const graph = buildKnowledgeGraph([
      {
        ...solve("solved-one", ["Array"], 0),
        similar: [{ titleSlug: "ghost", title: "Ghost", difficulty: "Hard", topicTags: ["Trie"] }],
      },
    ]);
    const trie = topicNode(graph, "Trie");

    assert.equal(trie.solveCount, 0);
    assert.equal(trie.mastery, 0);
    assert.equal(trie.band, "untouched");
    assert.equal(trie.daysSince, null);
  });

  it("follows a user's alias mapping when counting", () => {
    const graph = buildKnowledgeGraph([solve("a", ["arrays"], 0), solve("b", ["Array"], 0)], {
      arrays: "Array",
    });

    assert.equal(topicNode(graph, "Array").solveCount, 2);
    assert.equal(topicNode(graph, "arrays"), undefined);
  });
});
