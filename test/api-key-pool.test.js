/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The API key pool — rotation, and what a cooldown is actually for.
 *
 * The pool locks a key out for a minute when it fails. That is the right
 * response to a quota, and the wrong response to everything else: the caller
 * loops over the whole pool, so one malformed request used to burn every key the
 * user owned and then report "All API keys are currently in cooldown
 * (rate-limited)" — naming the one cause it was not.
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

/** `browser-compat.js` falls back to localStorage when `chrome` is absent. */
const backing = new Map();
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: (k) => backing.delete(k),
};

const { APIKeyPool } = await import("../src/core/api-key-pool.js");
const { CONSTANTS } = await import("../src/core/constants.js");
const { storage } = await import("../src/lib/browser-compat.js");

const KEYS = ["key-aaaa1111", "key-bbbb2222", "key-cccc3333"];

async function seed(keys = KEYS, strategy) {
  await storage.local.set({ [CONSTANTS.SK.AI_KEYS]: { gemini: keys } });
  if (strategy) {
    await storage.local.set({ [CONSTANTS.SK.SETTINGS]: { gemini_keyStrategy: strategy } });
  }
}

beforeEach(() => backing.clear());

describe("rotation", () => {
  test("round-robin walks the pool instead of hammering the first key", async () => {
    await seed();
    const pool = new APIKeyPool("gemini");
    const seen = [await pool.getNextKey(), await pool.getNextKey(), await pool.getNextKey()];
    assert.deepEqual(seen, KEYS);
  });

  test("wraps around rather than running out", async () => {
    await seed();
    const pool = new APIKeyPool("gemini");
    for (let i = 0; i < KEYS.length; i++) await pool.getNextKey();
    assert.equal(await pool.getNextKey(), KEYS[0]);
  });

  test("sticky-first stays put, which is the point of choosing it", async () => {
    await seed(KEYS, "sticky-first");
    const pool = new APIKeyPool("gemini");
    assert.equal(await pool.getNextKey(), KEYS[0]);
    assert.equal(await pool.getNextKey(), KEYS[0]);
  });

  test("returns null for an empty pool rather than an empty string key", async () => {
    await seed([]);
    assert.equal(await new APIKeyPool("gemini").getNextKey(), null);
    assert.equal(await new APIKeyPool("gemini").getKeyCount(), 0);
  });

  test("ignores blank entries left by a trailing comma", async () => {
    await seed(["  ", "key-real", ""]);
    const pool = new APIKeyPool("gemini");
    assert.equal(await pool.getKeyCount(), 1);
    assert.equal(await pool.getNextKey(), "key-real");
  });
});

describe("cooldown", () => {
  test("a rate-limited key is taken out of rotation", async () => {
    await seed();
    const pool = new APIKeyPool("gemini");
    pool.markFailed(KEYS[0], 429);
    const seen = [await pool.getNextKey(), await pool.getNextKey()];
    assert.equal(seen.includes(KEYS[0]), false);
  });

  test("an overloaded model counts too — 503 is 'this key, later'", async () => {
    await seed();
    const pool = new APIKeyPool("gemini");
    pool.markFailed(KEYS[0], 503);
    assert.notEqual(await pool.getNextKey(), KEYS[0]);
  });

  test("a bad request does NOT burn the key — waiting does not fix a 400", async () => {
    await seed();
    const pool = new APIKeyPool("gemini");
    for (const status of [400, 401, 403, 404, 500]) pool.markFailed(KEYS[0], status);
    const seen = [];
    for (let i = 0; i < KEYS.length; i++) seen.push(await pool.getNextKey());
    assert.ok(seen.includes(KEYS[0]), "every key should still be available");
  });

  test("a failure with no status is treated as a rate limit, the safer guess", async () => {
    // A network error has no status. Backing off is the conservative reading.
    await seed();
    const pool = new APIKeyPool("gemini");
    pool.markFailed(KEYS[0]);
    assert.notEqual(await pool.getNextKey(), KEYS[0]);
  });

  test("says so when every key is cooling down", async () => {
    await seed();
    const pool = new APIKeyPool("gemini");
    for (const k of KEYS) pool.markFailed(k, 429);
    assert.equal(await pool.getNextKey(), null);
  });

  test("cooldowns are per pool instance, not shared across providers", async () => {
    await seed();
    await storage.local.set({
      [CONSTANTS.SK.AI_KEYS]: { gemini: KEYS, openai: KEYS },
    });
    const gemini = new APIKeyPool("gemini");
    const openai = new APIKeyPool("openai");
    for (const k of KEYS) gemini.markFailed(k, 429);
    assert.equal(await gemini.getNextKey(), null);
    assert.ok(await openai.getNextKey(), "openai's keys are unrelated to gemini's quota");
  });
});
