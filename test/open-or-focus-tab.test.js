/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * `openOrFocusTab` is the reason clicking "Complete setup" three times leaves
 * one welcome tab rather than three. The interesting cases are the ones where
 * it must NOT reuse a tab (nothing open, query unavailable) and the one where
 * reuse also has to raise the window — a tab that goes active in a background
 * window looks exactly like a button that did nothing.
 *
 * browser-compat binds `tabs`/`windows` off `globalThis.chrome` at module load,
 * so the stub is installed before the dynamic import and mutated per test
 * instead of being replaced.
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

const calls = { query: [], update: [], create: [], winUpdate: [] };
let queryResult = [];
let queryThrows = false;

globalThis.chrome = {
  runtime: { getURL: (p) => `chrome-extension://abc/${p}` },
  tabs: {
    query: async (info) => {
      calls.query.push(info);
      if (queryThrows) throw new Error("no tabs permission");
      return queryResult;
    },
    update: async (id, props) => {
      calls.update.push({ id, props });
      return { id, ...props };
    },
    create: async (props) => {
      calls.create.push(props);
      return { id: 99 };
    },
  },
  windows: {
    update: async (id, props) => {
      calls.winUpdate.push({ id, props });
    },
  },
};

const { openOrFocusTab } = await import("../src/lib/browser-compat.js");

const WELCOME = "chrome-extension://abc/welcome/welcome.html";

beforeEach(() => {
  calls.query.length = 0;
  calls.update.length = 0;
  calls.create.length = 0;
  calls.winUpdate.length = 0;
  queryResult = [];
  queryThrows = false;
});

describe("openOrFocusTab", () => {
  test("creates a tab when nothing matching is open", async () => {
    const id = await openOrFocusTab(WELCOME);

    assert.equal(calls.create.length, 1);
    assert.equal(calls.create[0].url, WELCOME);
    assert.equal(calls.update.length, 0);
    assert.equal(id, 99);
  });

  test("queries on the bare path with a trailing wildcard", async () => {
    // A match pattern's path is compared against the path AND the query string,
    // so without the `*` a page carrying params never matches itself.
    await openOrFocusTab("chrome-extension://abc/library/library.html?tab=git#top");

    assert.deepEqual(calls.query, [{ url: "chrome-extension://abc/library/library.html*" }]);
  });

  test("focuses an open tab instead of opening a second one", async () => {
    queryResult = [{ id: 7, windowId: 3, url: WELCOME }];

    const id = await openOrFocusTab(WELCOME);

    assert.equal(calls.create.length, 0);
    assert.deepEqual(calls.update, [{ id: 7, props: { active: true } }]);
    assert.equal(id, 7);
  });

  test("raises the window the reused tab lives in", async () => {
    queryResult = [{ id: 7, windowId: 3, url: WELCOME }];

    await openOrFocusTab(WELCOME);

    assert.deepEqual(calls.winUpdate, [{ id: 3, props: { focused: true } }]);
  });

  test("re-points an open tab when the query string differs", async () => {
    const open = "chrome-extension://abc/library/library.html?tab=solutions";
    const wanted = "chrome-extension://abc/library/library.html?tab=settings&settingsTab=git";
    queryResult = [{ id: 7, windowId: 3, url: open }];

    await openOrFocusTab(wanted);

    assert.equal(calls.create.length, 0);
    assert.deepEqual(calls.update, [{ id: 7, props: { active: true, url: wanted } }]);
  });

  test("falls back to creating a tab when the query fails", async () => {
    queryThrows = true;

    await openOrFocusTab(WELCOME);

    assert.equal(calls.create.length, 1);
    assert.equal(calls.update.length, 0);
  });

  test("ignores a match with no tab id rather than updating nothing", async () => {
    queryResult = [{ url: WELCOME }];

    await openOrFocusTab(WELCOME);

    assert.equal(calls.update.length, 0);
    assert.equal(calls.create.length, 1);
  });
});
