/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The chat store has to know which world it is running in.
 *
 * A content script shares the *page's* origin for IndexedDB, so opening
 * "CodeLedger_AIChats" from a content script opens leetcode.com's database
 * rather than the extension's. The write succeeds and reports success, which is
 * what made this expensive: every conversation held in the floating AI panel
 * was written somewhere nothing would ever read, and nothing ever said so.
 *
 * These tests pin the two directions. On a page, the operation must leave for
 * the service worker and must never reach `indexedDB` — which is checked for
 * free here, since node has no `indexedDB` and touching it throws. On the
 * extension's own origin no message may be sent, because the local database is
 * the correct one there and a round trip through the worker would be a loop.
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

const EXT_BASE = "chrome-extension://abcdefghijklmnopabcdefghijklmnop/";

/** @type {Array<any>} */
let sent = [];
/** @type {(msg: any) => any} */
let respondWith = () => ({ ok: true, result: null });

globalThis.chrome = {
  runtime: {
    getURL: (path = "") => `${EXT_BASE}${path}`,
    sendMessage: async (msg) => {
      sent.push(msg);
      return respondWith(msg);
    },
  },
};

const { saveAIChat, updateAIChat, getChatsByProblem, deleteChat } = await import(
  "../src/core/ai-chat-storage.js"
);

function inPage(href = "https://leetcode.com/problems/two-sum/") {
  globalThis.location = /** @type {any} */ ({ href });
}

function inExtension() {
  globalThis.location = /** @type {any} */ ({ href: `${EXT_BASE}library/library.html` });
}

beforeEach(() => {
  sent = [];
  respondWith = () => ({ ok: true, result: null });
});

describe("ai-chat-storage — page world vs extension world", () => {
  test("saveAIChat from a content script goes to the service worker, not IndexedDB", async () => {
    inPage();
    respondWith = () => ({ ok: true, result: 42 });

    const id = await saveAIChat("two-sum", "https://leetcode.com/problems/two-sum/", [], "leetcode", {
      surface: "floating-panel",
    });

    assert.equal(id, 42);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, "AI_CHAT_STORE");
    assert.equal(sent[0].op, "saveAIChat");
    assert.deepEqual(sent[0].args[0], "two-sum");
    assert.deepEqual(sent[0].args[3], "leetcode");
    assert.deepEqual(sent[0].args[4], { surface: "floating-panel" });
  });

  test("getChatsByProblem returns what the worker read from the real database", async () => {
    inPage();
    const chats = [{ id: 1, problemSlug: "two-sum", messages: [{ role: "user", content: "hi" }] }];
    respondWith = () => ({ ok: true, result: chats });

    assert.deepEqual(await getChatsByProblem("two-sum"), chats);
    assert.equal(sent[0].op, "getChatsByProblem");
    assert.deepEqual(sent[0].args, ["two-sum"]);
  });

  test("updateAIChat and deleteChat are bridged too", async () => {
    inPage();
    await updateAIChat(7, [{ role: "user", content: "x" }], { summary: "s" });
    await deleteChat(7);

    assert.deepEqual(
      sent.map((m) => m.op),
      ["updateAIChat", "deleteChat"],
    );
    assert.equal(sent[0].args[0], 7);
    assert.deepEqual(sent[0].args[2], { summary: "s" });
    assert.deepEqual(sent[1].args, [7]);
  });

  test("a refusal from the worker surfaces as an error rather than a silent no-op", async () => {
    inPage();
    respondWith = () => ({ ok: false, error: "Unknown AI chat store operation: nope" });

    await assert.rejects(() => getChatsByProblem("two-sum"), /Unknown AI chat store operation/);
  });

  test("a worker that answers nothing at all is still an error, not success", async () => {
    inPage();
    respondWith = () => undefined;

    await assert.rejects(() => getChatsByProblem("two-sum"), /failed in the service worker/);
  });

  test("the panel on any host is bridged, not just LeetCode", async () => {
    for (const href of [
      "https://neetcode.io/problems/two-integer-sum",
      "https://takeuforward.org/plus/dsa/problems/two-sum",
      "https://www.geeksforgeeks.org/problems/subarray-with-given-sum/1",
      "https://codeforces.com/problemset/problem/4/A",
    ]) {
      sent = [];
      inPage(href);
      await getChatsByProblem("x");
      assert.equal(sent.length, 1, `expected a bridge for ${href}`);
    }
  });

  test("on the extension's own origin nothing is sent — the local database is the right one", async () => {
    inExtension();

    // There is no `indexedDB` in node, so the local path throws. That is the
    // point: it proves the call went local rather than over the bridge.
    await assert.rejects(() => getChatsByProblem("two-sum"));
    assert.equal(sent.length, 0);
  });
});
