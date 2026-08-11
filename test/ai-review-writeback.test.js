/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * What an AI review may overwrite on a solved problem.
 *
 * These values are committed to the learner's own public repository and drive
 * every chart the library draws, so the interesting cases are not the ones
 * where the model is right — they are the ones where letting it win would
 * destroy something the platform stated, or would present a model's guess as
 * the platform's own words.
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

// browser-compat falls back to a localStorage-backed mock when chrome.storage
// is absent, which is the situation in node. The behaviour-bank memo this
// module fires therefore runs for real rather than against a stub.
const backing = new Map();
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: (k) => backing.delete(k),
};

const { applyInferredMetadata, metadataChanges, hasStatement } =
  await import("../src/core/ai-review-metadata.js");
const { getProblemStats, clearBehaviorBank } = await import("../src/core/behavior-bank.js");

const PROBLEM = { titleSlug: "watermelon", platform: "codeforces", title: "Watermelon" };

/** The memo is fire-and-forget, so give its promise chain a turn to land. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  backing.clear();
  await clearBehaviorBank();
});

describe("applyInferredMetadata — tags", () => {
  test("merges with the platform's tags rather than replacing them", () => {
    const out = applyInferredMetadata(
      { ...PROBLEM, tags: ["Math"] },
      { tags: ["Brute Force", "Math"] },
    );
    assert.deepEqual(out.tags, ["Math", "Brute Force"]);
  });

  test("replaces the Untagged placeholder, which is not a tag", () => {
    const out = applyInferredMetadata({ ...PROBLEM, tags: ["Untagged"] }, { tags: ["Math"] });
    assert.deepEqual(out.tags, ["Math"]);
  });

  test("an empty tag list from the model leaves the existing tags alone", () => {
    const out = applyInferredMetadata({ ...PROBLEM, tags: ["Math"] }, { tags: [] });
    assert.deepEqual(out.tags, ["Math"]);
  });
});

describe("applyInferredMetadata — difficulty", () => {
  test("accepts one of the three real values in any casing", () => {
    for (const [given, expected] of [
      ["easy", "Easy"],
      ["MEDIUM", "Medium"],
      ["Hard", "Hard"],
    ]) {
      assert.equal(applyInferredMetadata(PROBLEM, { difficulty: given }).difficulty, expected);
    }
  });

  test("refuses anything else rather than inventing a fourth bucket", () => {
    for (const bogus of ["Very Hard", "1900", "Insane", "medium-hard"]) {
      const out = applyInferredMetadata({ ...PROBLEM, difficulty: "Easy" }, { difficulty: bogus });
      assert.equal(out.difficulty, "Easy", `expected "${bogus}" to be refused`);
    }
  });
});

describe("applyInferredMetadata — the AI-written statement summary", () => {
  const SUMMARY = "Decide whether an even weight splits into two even positive parts.";

  test("fills the gap when the record has no statement", () => {
    const out = applyInferredMetadata(PROBLEM, { statementSummary: SUMMARY });
    assert.equal(out.aiStatementSummary, SUMMARY);
    assert.equal(typeof out.aiStatementSummaryAt, "number");
  });

  test("never lands in the field the real statement uses", () => {
    const out = applyInferredMetadata(PROBLEM, { statementSummary: SUMMARY });
    assert.equal(out.problemStatement, undefined);
    assert.equal(out.description, undefined);
  });

  test("does not overwrite a statement that already exists", () => {
    for (const field of ["problemStatement", "description"]) {
      const out = applyInferredMetadata(
        { ...PROBLEM, [field]: "One integer w on a single line." },
        { statementSummary: SUMMARY },
      );
      assert.equal(out.aiStatementSummary, undefined, `expected no summary alongside ${field}`);
      assert.equal(out[field], "One integer w on a single line.");
    }
  });

  test("a statement of nothing but whitespace is not a statement", () => {
    const out = applyInferredMetadata(
      { ...PROBLEM, problemStatement: "  \n " },
      { statementSummary: SUMMARY },
    );
    assert.equal(out.aiStatementSummary, SUMMARY);
  });
});

describe("applyInferredMetadata — the record it leaves behind", () => {
  test("memos only the fields that actually changed", async () => {
    await applyInferredMetadata(
      { ...PROBLEM, difficulty: "Easy", tags: ["Math"], pattern: "Brute Force" },
      // Difficulty and pattern are restated, not changed. Only the topic moves.
      { difficulty: "Easy", pattern: "Brute Force", topic: "Math", tags: ["Math"] },
    );
    await settle();

    const entry = await getProblemStats("watermelon", "codeforces");
    assert.deepEqual(entry.aiMetadataEdits[0].fields, ["topic"]);
  });

  test("writes nothing at all when the review agreed with everything", async () => {
    applyInferredMetadata({ ...PROBLEM, difficulty: "Easy" }, { difficulty: "easy" });
    await settle();

    assert.equal(await getProblemStats("watermelon", "codeforces"), null);
  });

  test("counts the AI-written summary as an edit, since it reaches the commit", async () => {
    applyInferredMetadata(PROBLEM, { statementSummary: "a".repeat(50) });
    await settle();

    const entry = await getProblemStats("watermelon", "codeforces");
    assert.deepEqual(entry.aiMetadataEdits[0].fields, ["aiStatementSummary"]);
  });
});

describe("applyInferredMetadata — the shape of the call", () => {
  test("returns the record untouched when the model emitted no block", () => {
    assert.equal(applyInferredMetadata(PROBLEM, null), PROBLEM);
    assert.equal(applyInferredMetadata(PROBLEM, undefined), PROBLEM);
  });

  test("never mutates the record it was given", () => {
    const before = { ...PROBLEM, tags: ["Math"], difficulty: "Easy" };
    const snapshot = JSON.stringify(before);
    applyInferredMetadata(before, { tags: ["Greedy"], difficulty: "Hard", topic: "Greedy" });
    assert.equal(JSON.stringify(before), snapshot);
  });
});

describe("metadataChanges", () => {
  test("re-ordering a tag list counts, since the committed file shows the order", () => {
    assert.deepEqual(metadataChanges({ tags: ["a", "b"] }, { tags: ["b", "a"] }), ["tags"]);
  });

  test("re-spacing a tag does not count", () => {
    assert.deepEqual(metadataChanges({ tags: [" a "] }, { tags: ["a"] }), []);
  });

  test("an absent field and an empty one are the same absence", () => {
    assert.deepEqual(metadataChanges({}, { topic: "" }), []);
    assert.deepEqual(metadataChanges({ topic: null }, {}), []);
  });

  test("reports every changed field, not just the first", () => {
    assert.deepEqual(
      metadataChanges({ topic: "Math" }, { topic: "Greedy", pattern: "Two Pointers" }),
      ["topic", "pattern"],
    );
  });
});

describe("hasStatement", () => {
  test("either field counts", () => {
    assert.equal(hasStatement({ problemStatement: "x" }), true);
    assert.equal(hasStatement({ description: "x" }), true);
  });

  test("empty, whitespace and missing do not", () => {
    for (const p of [{}, { problemStatement: "" }, { description: "   \n" }, null, undefined]) {
      assert.equal(hasStatement(p), false, `expected false for ${JSON.stringify(p)}`);
    }
  });
});
