/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The review metadata contract — the WEAK_AREAS line.
 *
 * These labels are the only thing the AI writes back into the behaviour bank,
 * and the aggregate profile is built by counting how many distinct problems
 * share a label. That makes the parser load-bearing in a way a metadata parser
 * usually is not: a model that answers with a sentence, or with slightly
 * different capitalisation each time, would either fill the profile with
 * one-count noise or silently fail to recognise a repeat.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildReviewPrompt, parseWeakAreas } from "../src/core/ai-prompts.js";

describe("buildReviewPrompt — the metadata block", () => {
  test("asks for WEAK_AREAS inside the block the parser reads", () => {
    const prompt = buildReviewPrompt({ platform: "leetcode", title: "Two Sum" }, "code");
    const block = prompt.slice(prompt.indexOf("METADATA"));
    assert.match(block, /WEAK_AREAS:/);
    assert.ok(
      block.indexOf("WEAK_AREAS:") < block.indexOf("END_METADATA"),
      "WEAK_AREAS must fall inside the block, or the parser never sees it",
    );
  });

  test("tells the model to reuse wording, since repeats are what make a profile", () => {
    const prompt = buildReviewPrompt({ platform: "leetcode" }, "code");
    assert.match(prompt, /Reuse the same wording/i);
  });

  test("still returns the caller's prompt untouched in raw mode", () => {
    assert.equal(buildReviewPrompt({ _rawPrompt: true }, "verbatim"), "verbatim");
  });
});

describe("parseWeakAreas", () => {
  test("splits a comma list into lowercase labels", () => {
    assert.deepEqual(parseWeakAreas("Off-by-one, Edge Cases"), ["off-by-one", "edge cases"]);
  });

  test("strips trailing punctuation so a label matches its next occurrence", () => {
    assert.deepEqual(parseWeakAreas("edge cases."), ["edge cases"]);
  });

  test("drops the ways a model says there was nothing wrong", () => {
    for (const empty of ["", "none", "N/A", "nothing", "-", "  "]) {
      assert.deepEqual(
        parseWeakAreas(empty),
        [],
        `expected no labels for ${JSON.stringify(empty)}`,
      );
    }
  });

  test("drops prose rather than truncating it into a label nothing will match", () => {
    const prose =
      "the solution does not handle the case where the input array is empty which would throw";
    assert.deepEqual(parseWeakAreas(`off-by-one, ${prose}`), ["off-by-one"]);
  });

  test("deduplicates labels that differ only in case or spacing", () => {
    assert.deepEqual(parseWeakAreas("Edge Cases, edge cases ,  EDGE CASES"), ["edge cases"]);
  });

  test("caps the count so one review cannot dominate the profile", () => {
    const many = Array.from({ length: 12 }, (_, i) => `flag-${i}`).join(", ");
    assert.equal(parseWeakAreas(many).length, 6);
  });

  test("survives a missing argument", () => {
    assert.deepEqual(parseWeakAreas(), []);
  });
});
