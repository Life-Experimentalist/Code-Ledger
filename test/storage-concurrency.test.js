/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { withLock, hasWebLocks } from "../src/core/async-lock.js";

/**
 * `browser-compat.js` falls back to a `localStorage`-backed mock whenever
 * `chrome.storage.local` is absent, which is exactly the situation in Node. All
 * this needs to do is make that fallback real, and the whole storage layer runs
 * unmodified — no stubs on `Storage` itself, so the test exercises the code the
 * extension actually ships.
 */
const backing = new Map();
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: (k) => backing.delete(k),
};

const { Storage } = await import("../src/core/storage.js");
const { CONSTANTS } = await import("../src/core/constants.js");

/** Read the settings blob straight out of the backing store. */
function raw() {
  const all = JSON.parse(backing.get("cl_mock_storage") || "{}");
  return all[CONSTANTS.SK.SETTINGS] || {};
}

/**
 * Hide `navigator` for the duration of `fn`, so the promise-chain fallback runs
 * instead of the platform lock. Both paths ship — Firefox has had Web Locks
 * since 96, but a context without it must still serialise — so both are tested.
 */
async function withoutWebLocks(fn) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: undefined, configurable: true });
  try {
    assert.equal(hasWebLocks(), false);
    await fn();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else delete globalThis.navigator;
  }
}

// Node 24 implements Web Locks, so the unqualified runs below take the same
// path the extension takes in Chrome and Firefox.
/** @type {Array<[string, (fn: () => Promise<void>) => Promise<void>]>} */
const LOCK_MODES = [
  ["Web Locks", (fn) => fn()],
  ["fallback chain", withoutWebLocks],
];

for (const [label, wrap] of LOCK_MODES) {
  describe(`withLock (${label})`, () => {
    it("runs callers one at a time, in arrival order", () =>
      wrap(async () => {
        const order = [];
        const task = (id, delay) => async () => {
          order.push(`start:${id}`);
          await new Promise((r) => setTimeout(r, delay));
          order.push(`end:${id}`);
        };
        // The first caller is the slowest. Without the lock its `end` would
        // land after both of the others' `start`s.
        await Promise.all([
          withLock(`${label}:order`, task("a", 20)),
          withLock(`${label}:order`, task("b", 1)),
          withLock(`${label}:order`, task("c", 1)),
        ]);
        assert.deepEqual(order, ["start:a", "end:a", "start:b", "end:b", "start:c", "end:c"]);
      }));

    it("releases the lock when a caller throws", () =>
      wrap(async () => {
        await assert.rejects(
          withLock(`${label}:throw`, async () => {
            throw new Error("boom");
          }),
          /boom/,
        );
        assert.equal(await withLock(`${label}:throw`, async () => "still works"), "still works");
      }));

    it("does not fail a caller because its predecessor failed", () =>
      wrap(async () => {
        const failed = withLock(`${label}:isolate`, async () => {
          throw new Error("first");
        });
        const after = withLock(`${label}:isolate`, async () => "second");
        await assert.rejects(failed, /first/);
        assert.equal(await after, "second");
      }));

    it("keeps separate names independent", () =>
      wrap(async () => {
        let released = () => {};
        const held = withLock(`${label}:one`, () => new Promise((r) => (released = r)));
        // If names shared a queue this would never resolve.
        assert.equal(await withLock(`${label}:two`, async () => "free"), "free");
        released();
        await held;
      }));
  });
}

describe("Storage.updateSettings", () => {
  beforeEach(() => {
    backing.clear();
  });

  it("keeps the keys the caller never mentioned", async () => {
    await Storage.setSettings({
      github_owner: "octocat",
      github_repo: "ledger",
      github_token: "ghp_secret",
    });

    // This is the shape that lost every other setting: one narrow key, written
    // by a UI toggle that has no idea what else is in there.
    await Storage.updateSettings({ "mcp.config": { tools: { search: false } } });

    const after = raw();
    assert.equal(after.github_owner, "octocat");
    assert.equal(after.github_repo, "ledger");
    assert.equal(after.github_token, "ghp_secret");
    assert.deepEqual(after["mcp.config"], { tools: { search: false } });
  });

  it("loses nothing when many contexts patch at once", async () => {
    await Storage.setSettings({ github_repo: "ledger" });

    // Fired without awaiting: every one of these reads before any of them
    // writes, which is precisely the interleaving that used to drop writes.
    const keys = Array.from({ length: 25 }, (_, i) => `key_${i}`);
    await Promise.all(keys.map((k, i) => Storage.updateSettings({ [k]: i })));

    const after = raw();
    assert.equal(after.github_repo, "ledger");
    for (let i = 0; i < keys.length; i++) {
      assert.equal(after[keys[i]], i, `${keys[i]} was dropped`);
    }
  });

  it("sees the previous writer's value when given a function", async () => {
    await Storage.setSettings({ solves: 0 });
    await Promise.all(
      Array.from({ length: 10 }, () =>
        Storage.updateSettings((cur) => ({ solves: (cur.solves || 0) + 1 })),
      ),
    );
    assert.equal(raw().solves, 10);
  });

  it("interleaves safely with a whole-object write", async () => {
    await Storage.setSettings({ a: 1 });
    await Promise.all([
      Storage.updateSettings({ b: 2 }),
      // A caller that legitimately replaces everything still has to queue, or
      // the patch either vanishes or resurrects a key the replace dropped.
      Storage.setSettings({ a: 1, c: 3 }),
      Storage.updateSettings({ d: 4 }),
    ]);
    const after = raw();
    assert.equal(after.c, 3, "the replace must survive");
    assert.equal(after.d, 4, "the patch queued after it must survive");
  });

  it("returns the merged settings to the caller", async () => {
    await Storage.setSettings({ a: 1 });
    const next = await Storage.updateSettings({ b: 2 });
    assert.equal(next.a, 1);
    assert.equal(next.b, 2);
  });

  it("removes a key set to undefined", async () => {
    await Storage.setSettings({ github_repo: "ledger", github_owner: "octocat" });
    await Storage.updateSettings({ github_repo: undefined });
    const after = raw();
    assert.equal("github_repo" in after, false);
    assert.equal(after.github_owner, "octocat");
  });

  it("treats a null or non-object patch as no change", async () => {
    await Storage.setSettings({ a: 1 });
    const unchanged = await Storage.updateSettings(null);
    assert.equal(unchanged.a, 1);
    await Storage.updateSettings(() => undefined);
    assert.equal(raw().a, 1);
  });
});
