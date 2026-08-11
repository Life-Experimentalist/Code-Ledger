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
import {
  buildReviewPrompt,
  parseWeakAreas,
  parseStatementSummary,
} from "../src/core/ai-prompts.js";

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

describe("buildReviewPrompt — the SUMMARY line", () => {
  const CODEFORCES = { platform: "codeforces", title: "Watermelon" };
  const REAL_SUMMARY =
    "Given an even weight w, decide whether it can be split into two even positive parts.";

  test("is asked for when no statement was recorded", () => {
    const prompt = buildReviewPrompt(CODEFORCES, "code");
    const block = prompt.slice(prompt.indexOf("METADATA"));
    assert.match(block, /SUMMARY:/);
    assert.ok(
      block.indexOf("SUMMARY:") < block.indexOf("END_METADATA"),
      "SUMMARY must fall inside the block, or the parser never sees it",
    );
  });

  test("is not asked for when the real statement is already stored", () => {
    // A model asked to describe a problem will describe one whether or not it
    // can tell what the problem is. There is no reason to run that risk on a
    // record that already has the platform's own words.
    for (const field of ["problemStatement", "description", "statement"]) {
      const prompt = buildReviewPrompt({ ...CODEFORCES, [field]: REAL_SUMMARY }, "code");
      assert.doesNotMatch(prompt, /SUMMARY:/, `expected no SUMMARY request given ${field}`);
    }
  });

  test("a statement of nothing but whitespace does not count as one", () => {
    assert.match(
      buildReviewPrompt({ ...CODEFORCES, problemStatement: "   \n " }, "code"),
      /SUMMARY:/,
    );
  });
});

describe("parseStatementSummary", () => {
  const GOOD =
    "Given an array of integers and a target, return the indices of the two numbers that add to the target. Exactly one such pair exists.";

  test("keeps a real description", () => {
    assert.equal(parseStatementSummary(GOOD), GOOD);
  });

  test("strips the markdown a model adds despite being told not to", () => {
    assert.equal(parseStatementSummary(`**${GOOD}**`), GOOD);
    assert.equal(parseStatementSummary(`## ${GOOD}`), GOOD);
    assert.equal(parseStatementSummary(GOOD.replace("array", "`array`")), GOOD);
  });

  test("unwraps LaTeX so the committed file is not full of backslashes", () => {
    assert.equal(
      parseStatementSummary(
        "Sort the sequence and report the median. The sequence has up to $10^5$ elements so an $O(n \\log n)$ pass is required.",
      ),
      "Sort the sequence and report the median. The sequence has up to 10^5 elements so an O(n log n) pass is required.",
    );
  });

  test("takes only the first line, since the block is line-oriented", () => {
    assert.equal(parseStatementSummary(`${GOOD}\nTAKEAWAY: use a hash map`), GOOD);
  });

  test("drops the ways a model says it has nothing to give", () => {
    for (const empty of ["", "  ", "none", "N/A", "unknown", "Unclear", "-", "—", "nothing"]) {
      assert.equal(
        parseStatementSummary(empty),
        "",
        `expected nothing for ${JSON.stringify(empty)}`,
      );
    }
  });

  test("drops a refusal rather than committing it under a heading", () => {
    for (const refusal of [
      "I cannot determine what this problem asks from the code alone.",
      "I'm unable to summarise this problem without the statement.",
      "I’m unable to summarise this problem without the statement.",
      "I can't tell what this problem asks from the submitted code.",
      "I am unable to describe the problem this solution belongs to.",
      "Sorry, the provided code does not make the problem clear enough to describe.",
      "As an AI language model I do not have access to the original problem text.",
      "Unable to determine the problem from the given information.",
    ]) {
      assert.equal(parseStatementSummary(refusal), "", `expected nothing for: ${refusal}`);
    }
  });

  test("drops a fragment too short to be a description", () => {
    // The committed section says a summary was written. A clause is worse than
    // an absent section, because the absent section makes no claim.
    assert.equal(parseStatementSummary("Two pointers."), "");
    assert.equal(parseStatementSummary("A graph problem about shortest paths."), "");
  });

  test("truncates a model that ignored the length instruction", () => {
    const long = `${"The problem gives you an array and asks for a subarray. ".repeat(30)}`;
    const out = parseStatementSummary(long);
    assert.ok(out.length <= 600, `expected ≤600 chars, got ${out.length}`);
    assert.ok(out.endsWith("…"), "a truncated summary must show that it was cut");
  });

  test("survives a missing argument", () => {
    assert.equal(parseStatementSummary(), "");
  });
});
