/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the persistent AI review queue.
 *
 * The queue talks to IndexedDB directly, so these run against a minimal
 * in-memory implementation of the surface `ai-review-queue.js` actually uses:
 * open/onupgradeneeded, a readwrite transaction, get/getAll/put, and getAll on
 * the statusIndex. That is enough to exercise the real code paths — nothing
 * here reimplements queue logic.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// ── A fake IndexedDB, just large enough ───────────────────────────────────────

/** Fire a request's success/error callback on a later tick, as the real API does. */
function settle(req, ok, value) {
  queueMicrotask(() => {
    if (ok) {
      req.result = value;
      req.onsuccess?.({ target: req });
    } else {
      req.error = value;
      req.onerror?.({ target: req });
    }
  });
  return req;
}

function makeStore(rows) {
  const indexes = new Map();
  const store = {
    keyPath: "id",
    createIndex(name, keyPath) {
      indexes.set(name, keyPath);
    },
    index(name) {
      const keyPath = indexes.get(name);
      return {
        getAll(value) {
          const hits = [...rows.values()].filter((r) => r[keyPath] === value);
          return settle({}, true, hits);
        },
      };
    },
    get(id) {
      return settle({}, true, rows.get(id));
    },
    getAll() {
      return settle({}, true, [...rows.values()]);
    },
    put(row) {
      rows.set(row.id, row);
      return settle({}, true, row.id);
    },
    add(row) {
      if (rows.has(row.id)) return settle({}, false, new Error("ConstraintError"));
      rows.set(row.id, row);
      return settle({}, true, row.id);
    },
    delete(id) {
      rows.delete(id);
      return settle({}, true, undefined);
    },
  };
  return store;
}

function installFakeIndexedDB() {
  const rows = new Map();
  const store = makeStore(rows);
  // Start empty so the first open runs onupgradeneeded and registers the real
  // indexes — getNextPendingReview() reads through statusIndex, so a store
  // without them would silently return nothing.
  let created = false;
  const db = {
    objectStoreNames: { contains: () => created },
    createObjectStore: () => {
      created = true;
      return store;
    },
    transaction: () => ({ objectStore: () => store }),
    close() {},
  };
  globalThis.indexedDB = {
    open() {
      const req = {};
      queueMicrotask(() => {
        req.result = db;
        req.onupgradeneeded?.({ target: req });
        req.onsuccess?.({ target: req });
      });
      return req;
    },
  };
  return rows;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const { enqueueReview, getNextPendingReview, markProcessing, markDone, reclaimStaleProcessing } =
  await import("../src/core/ai-review-queue.js");

let rows;
let realIDB;

beforeEach(() => {
  realIDB = globalThis.indexedDB;
  rows = installFakeIndexedDB();
});

afterEach(() => {
  globalThis.indexedDB = realIDB;
});

describe("queue selection", () => {
  test("an item in processing is not handed out again", async () => {
    await enqueueReview("lc-two-sum");
    const item = await getNextPendingReview();
    assert.equal(item.problemId, "lc-two-sum");

    await markProcessing(item.id);
    assert.equal(await getNextPendingReview(), null);
  });

  test("higher priority wins, then oldest first", async () => {
    await enqueueReview("lc-old", 100);
    await enqueueReview("lc-urgent", 1);
    const item = await getNextPendingReview();
    assert.equal(item.problemId, "lc-urgent");
  });
});

describe("reclaimStaleProcessing", () => {
  test("returns an abandoned item to pending so it is retried", async () => {
    // An MV3 service worker evicted mid-review leaves exactly this state:
    // status "processing", never updated again, invisible to the selector.
    await enqueueReview("lc-stranded");
    const item = await getNextPendingReview();
    await markProcessing(item.id);
    rows.get(item.id).updatedAt = Date.now() - 3600000; // an hour ago

    assert.equal(await getNextPendingReview(), null, "precondition: stuck and unreachable");

    assert.equal(await reclaimStaleProcessing(), 1);

    const again = await getNextPendingReview();
    assert.equal(again?.problemId, "lc-stranded");
  });

  test("leaves a review that is still running alone", async () => {
    await enqueueReview("lc-in-flight");
    const item = await getNextPendingReview();
    await markProcessing(item.id);

    assert.equal(await reclaimStaleProcessing(), 0);
    assert.equal(rows.get(item.id).status, "processing");
  });

  test("does not resurrect completed work", async () => {
    await enqueueReview("lc-done");
    const item = await getNextPendingReview();
    await markProcessing(item.id);
    await markDone(item.id);
    rows.get(item.id).updatedAt = Date.now() - 3600000;

    assert.equal(await reclaimStaleProcessing(), 0);
    assert.equal(rows.get(item.id).status, "done");
  });

  test("reclaiming does not consume a retry", async () => {
    await enqueueReview("lc-stranded");
    const item = await getNextPendingReview();
    await markProcessing(item.id);
    rows.get(item.id).updatedAt = Date.now() - 3600000;

    await reclaimStaleProcessing();
    // A lost attempt is not a failure — burning a retry here would eventually
    // exhaust MAX_RETRIES on a review that was never actually attempted.
    assert.equal(rows.get(item.id).retryCount || 0, 0);
    assert.equal(rows.get(item.id).error, null);
  });
});
