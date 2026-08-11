/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Getting stranded API keys out of the settings map.
 *
 * The provider card used to write the API-key box through to
 * `settings.{provider}_keys` on every keystroke and only move it to `ai.keys`
 * on Save. Anyone who typed a key and navigated away is left with a plaintext
 * credential in a settings key nothing reads. The migration folds it into
 * `ai.keys` rather than dropping it, because a key somebody meant to keep is
 * not ours to throw away, and then removes it.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

/**
 * `browser-compat.js` falls back to a `localStorage`-backed mock whenever
 * `chrome.storage.local` is absent, which is the situation in Node. Making that
 * fallback real runs the whole storage layer unmodified.
 */
const backing = new Map();
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: (k) => backing.delete(k),
};

const { Storage } = await import("../src/core/storage.js");
const { migrateStrandedAIKeys } = await import("../src/background/migration-manager.js");

const MARKER = "cl.migration.strandedAIKeys.v1";

beforeEach(() => backing.clear());

describe("migrateStrandedAIKeys", () => {
  it("moves a stranded key into ai.keys and removes it from settings", async () => {
    await Storage.updateSettings({ openai_keys: "sk-stranded", openai_enabled: true });

    await migrateStrandedAIKeys();

    assert.deepEqual((await Storage.getAIKeys()).openai, ["sk-stranded"]);
    const settings = await Storage.getSettings();
    assert.equal("openai_keys" in settings, false, "the plaintext key must be gone from settings");
    assert.equal(settings.openai_enabled, true, "unrelated provider settings are left alone");
  });

  it("splits a comma-separated list the way the box accepted it", async () => {
    await Storage.updateSettings({ claude_keys: "one, two ,three" });

    await migrateStrandedAIKeys();

    assert.deepEqual((await Storage.getAIKeys()).claude, ["one", "two", "three"]);
  });

  it("merges alongside already-saved keys without duplicating them", async () => {
    await Storage.setAIKeys({ gemini: ["already-saved", "shared"] });
    await Storage.updateSettings({ gemini_keys: "shared, brand-new" });

    await migrateStrandedAIKeys();

    assert.deepEqual((await Storage.getAIKeys()).gemini, ["already-saved", "shared", "brand-new"]);
  });

  it("handles every provider in one pass", async () => {
    await Storage.updateSettings({
      openai_keys: "a",
      claude_keys: "b",
      deepseek_keys: "c",
      openrouter_keys: "d",
    });

    await migrateStrandedAIKeys();

    const all = await Storage.getAIKeys();
    assert.deepEqual(
      [all.openai, all.claude, all.deepseek, all.openrouter],
      [["a"], ["b"], ["c"], ["d"]],
    );
    const settings = await Storage.getSettings();
    assert.equal(
      Object.keys(settings).some((k) => k.endsWith("_keys")),
      false,
    );
  });

  it("ignores a blank box rather than writing an empty provider", async () => {
    await Storage.updateSettings({ openai_keys: "   " });

    await migrateStrandedAIKeys();

    assert.deepEqual(await Storage.getAIKeys(), {});
    assert.equal((await Storage.getSettings())[MARKER], true);
  });

  it("does not run twice", async () => {
    await Storage.updateSettings({ openai_keys: "sk-one" });
    await migrateStrandedAIKeys();

    // A key deleted from ai.keys after the migration must stay deleted: a second
    // run reading a settings key that no longer exists would resurrect nothing,
    // but a marker that did not stick would.
    await Storage.setAIKeys({});
    await Storage.updateSettings({ openai_keys: "sk-typed-again" });
    await migrateStrandedAIKeys();

    assert.deepEqual(await Storage.getAIKeys(), {});
    assert.equal((await Storage.getSettings()).openai_keys, "sk-typed-again");
  });

  it("marks itself done on an install that has nothing to migrate", async () => {
    await migrateStrandedAIKeys();

    assert.equal((await Storage.getSettings())[MARKER], true);
  });
});
