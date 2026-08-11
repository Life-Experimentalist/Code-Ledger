/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The behaviour bank's record of what the AI rewrote.
 *
 * An AI review is allowed to replace a problem's tags, topic, pattern and
 * difficulty, and until this existed it did so with no trace. That is a real
 * gap and not a cosmetic one: a learner looking at their own difficulty
 * breakdown, or at which topics they keep returning to, had no way to tell
 * which of those values the platform stated and which a model decided on. The
 * record is what makes that answerable afterwards.
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

// browser-compat falls back to a localStorage-backed mock when chrome.storage
// is absent, which is the situation in node. Making that fallback real runs the
// whole storage layer unmodified — no stub on Storage itself.
const backing = new Map();
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: (k) => backing.delete(k),
};

const { Storage } = await import("../src/core/storage.js");
const { recordAIMetadataEdit, getProblemStats, clearBehaviorBank } =
  await import("../src/core/behavior-bank.js");

const KEY = { slug: "watermelon", platform: "codeforces" };

beforeEach(async () => {
  backing.clear();
  await clearBehaviorBank();
});

describe("recordAIMetadataEdit", () => {
  test("records which fields the review rewrote", async () => {
    await recordAIMetadataEdit({ ...KEY, fields: ["difficulty", "tags"] });

    const entry = await getProblemStats(KEY.slug, KEY.platform);
    assert.equal(entry.slug, KEY.slug);
    assert.equal(entry.platform, KEY.platform);
    assert.equal(entry.aiMetadataEdits.length, 1);
    assert.deepEqual(entry.aiMetadataEdits[0].fields, ["difficulty", "tags"]);
    assert.equal(typeof entry.aiMetadataEdits[0].ts, "number");
  });

  test("writes nothing when the review changed nothing", async () => {
    // A reviewer restating a difficulty it did not change is not an edit, and
    // recording it would turn every review into a rewrite in the history.
    await recordAIMetadataEdit({ ...KEY, fields: [] });
    await recordAIMetadataEdit({ ...KEY });
    await recordAIMetadataEdit({ ...KEY, fields: /** @type {any} */ (null) });

    assert.equal(await getProblemStats(KEY.slug, KEY.platform), null);
  });

  test("keeps the newest few rather than growing without bound", async () => {
    for (let i = 0; i < 8; i++) {
      await recordAIMetadataEdit({ ...KEY, fields: [`field-${i}`] });
    }

    const { aiMetadataEdits } = await getProblemStats(KEY.slug, KEY.platform);
    assert.equal(aiMetadataEdits.length, 5);
    assert.deepEqual(aiMetadataEdits[0].fields, ["field-3"]);
    assert.deepEqual(aiMetadataEdits[4].fields, ["field-7"]);
  });

  test("adds to an existing entry rather than replacing it", async () => {
    await Storage.setBehaviorBank({
      [`${KEY.platform}::${KEY.slug}`]: { ...KEY, solves: [{ ts: 1, elapsedSeconds: 90 }] },
    });

    await recordAIMetadataEdit({ ...KEY, fields: ["topic"] });

    const entry = await getProblemStats(KEY.slug, KEY.platform);
    assert.equal(entry.solves.length, 1, "the solve history must survive the edit record");
    assert.equal(entry.aiMetadataEdits.length, 1);
  });

  test("honours the behaviour-bank opt-out", async () => {
    await Storage.setSettings({ behaviorBankEnabled: false });

    await recordAIMetadataEdit({ ...KEY, fields: ["difficulty"] });

    assert.equal(await getProblemStats(KEY.slug, KEY.platform), null);
  });

  test("two problems do not share a record", async () => {
    await recordAIMetadataEdit({ ...KEY, fields: ["tags"] });
    await recordAIMetadataEdit({ slug: "two-sum", platform: "leetcode", fields: ["pattern"] });

    assert.deepEqual(
      (await getProblemStats("watermelon", "codeforces")).aiMetadataEdits[0].fields,
      ["tags"],
    );
    assert.deepEqual((await getProblemStats("two-sum", "leetcode")).aiMetadataEdits[0].fields, [
      "pattern",
    ]);
  });
});
