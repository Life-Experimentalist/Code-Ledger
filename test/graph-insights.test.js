/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The /graph chat command's digest.
 *
 * The digest is what the AI actually sees, so the properties worth pinning are
 * honesty ones: it reports the decay knobs the user configured (not the
 * defaults), it separates solved work from unsolved ghost suggestions, and an
 * empty ledger says so instead of emitting an empty-looking report.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildGraphDigest, isGraphQuestion } from "../src/core/graph-insights.js";

const DAY = 86_400_000;

function solve(titleSlug, tags, daysAgo, extra = {}) {
  return {
    titleSlug,
    title: titleSlug,
    platform: "leetcode",
    difficulty: "Easy",
    tags,
    timestamp: Date.now() - daysAgo * DAY,
    ...extra,
  };
}

describe("buildGraphDigest", () => {
  it("says the graph is empty instead of emitting a hollow report", () => {
    assert.match(buildGraphDigest([]), /empty/i);
    assert.match(buildGraphDigest(null), /empty/i);
  });

  it("reports totals, topics and the mastery model", () => {
    const digest = buildGraphDigest([
      solve("a", ["Array"], 1),
      solve("b", ["Array", "Two Pointers"], 3),
    ]);

    assert.match(digest, /2 solved problems across leetcode/);
    assert.match(digest, /Array — 2 solved/);
    assert.match(digest, /Two Pointers — 1 solved/);
    assert.match(digest, /half-life/);
  });

  it("states the configured decay knobs, not the defaults", () => {
    const digest = buildGraphDigest([solve("a", ["Array"], 1)], {
      mastery_half_life_days: 30,
      mastery_regain_solves: 4,
    });

    assert.match(digest, /30-day half-life/);
    assert.match(digest, /4 recent solves/);
  });

  it("lists unsolved ghost suggestions separately, with their topics", () => {
    const digest = buildGraphDigest([
      solve("a", ["Array"], 1, {
        similar: [{ titleSlug: "ghost", title: "Ghost Problem", difficulty: "Medium" }],
      }),
    ]);

    assert.match(digest, /1 solved problems/);
    assert.match(digest, /Suggested next/);
    assert.match(digest, /Ghost Problem \(Medium\) — Array/);
  });

  it("surfaces a decayed topic as rusty", () => {
    const digest = buildGraphDigest([solve("old", ["Trie"], 400), solve("new", ["Array"], 0)]);

    assert.match(digest, /Rusty/);
    assert.match(digest, /Trie — 1 solved/);
  });
});

describe("isGraphQuestion", () => {
  it("recognises progress and practice questions", () => {
    const positives = [
      "What should I practice next?",
      "where am I weak right now",
      "am I rusty on anything?",
      "I'm rusty on trees, what do you think",
      "how am I doing overall?",
      "what are my weakest topics",
      "show my progress please",
      "suggest problems for the topics I keep failing",
      "what does my knowledge graph say",
      "which topics should I revise this week?",
    ];
    for (const text of positives) {
      assert.equal(isGraphQuestion(text), true, `expected match: ${text}`);
    }
  });

  it("stays out of single-problem conversations", () => {
    const negatives = [
      "explain this problem to me",
      "what should I do to fix this bug?",
      "suggest a better approach for this problem",
      "what's the time complexity of my code?",
      // The optimize prompt-mode prefix, verbatim — prepended to every message
      // in that mode, so a match here would attach the digest to everything.
      "Review my code for performance, readability, and best practices. Be specific.",
      "give me a hint",
      "",
    ];
    for (const text of negatives) {
      assert.equal(isGraphQuestion(text), false, `expected no match: ${text}`);
    }
  });
});
