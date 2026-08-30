/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Which tab a recovery result is allowed to come from.
 *
 * Code recovery opens a background tab and waits for that tab's content script
 * to report back. The reply is saved over the stored problem and queued for
 * commit to the user's repository, so accepting the wrong one writes chosen
 * content into their ledger.
 *
 * The recovery URL carries the problem id in its query string, and the content
 * script reads it from there, so the id in the reply is not a secret — any page
 * on a matched host can be sent a link that produces one. The tab id is the
 * part the page does not choose.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { runtime, tabs } from "../src/lib/browser-compat.js";
import { Storage } from "../src/core/storage.js";
import { triggerCodeRecovery } from "../src/background/code-recovery-handler.js";

const PROBLEM = { id: "two-sum::js", titleSlug: "two-sum", platform: "leetcode" };

let real = {};
/** @type {Function[]} */
let listeners = [];
let saved = null;
let removedTabs = [];

beforeEach(() => {
  real = {
    add: runtime.onMessage.addListener,
    remove: runtime.onMessage.removeListener,
    send: runtime.sendMessage,
    create: tabs.create,
    removeTab: tabs.remove,
    getProblem: Storage.getProblem,
    saveProblem: Storage.saveProblem,
    markPending: Storage.markPendingProblemKey,
  };
  listeners = [];
  saved = null;
  removedTabs = [];

  runtime.onMessage.addListener = (fn) => listeners.push(fn);
  runtime.onMessage.removeListener = (fn) => {
    listeners = listeners.filter((l) => l !== fn);
  };
  runtime.sendMessage = async () => {};
  tabs.create = async () => ({ id: 42 });
  tabs.remove = async (id) => {
    removedTabs.push(id);
  };
  Storage.getProblem = async () => ({ ...PROBLEM, code: "original" });
  Storage.saveProblem = async (p) => {
    saved = p;
  };
  Storage.markPendingProblemKey = async () => {};
});

afterEach(() => {
  runtime.onMessage.addListener = real.add;
  runtime.onMessage.removeListener = real.remove;
  runtime.sendMessage = real.send;
  tabs.create = real.create;
  tabs.remove = real.removeTab;
  Storage.getProblem = real.getProblem;
  Storage.saveProblem = real.saveProblem;
  Storage.markPendingProblemKey = real.markPending;
});

/** Deliver a message to every registered listener, as the runtime would. */
function deliver(msg, sender) {
  for (const fn of [...listeners]) fn(msg, sender);
}

/** Let `tabs.create` resolve so the handler learns its tab id. */
const tabOpened = () => new Promise((r) => setTimeout(r, 0));

describe("triggerCodeRecovery — which sender is believed", () => {
  test("accepts the result from the tab it opened", async () => {
    const pending = triggerCodeRecovery(PROBLEM);
    await tabOpened();
    deliver(
      { type: "CODELEDGER_CODE_FETCHED", problemId: PROBLEM.id, code: "recovered" },
      { tab: { id: 42 } },
    );
    const res = await pending;
    assert.equal(res.ok, true);
    assert.equal(res.code, "recovered");
    assert.equal(saved.code, "recovered");
    assert.deepEqual(removedTabs, [42]);
  });

  test("ignores a result carrying the right id from another tab", async () => {
    const pending = triggerCodeRecovery(PROBLEM);
    await tabOpened();
    deliver(
      { type: "CODELEDGER_CODE_FETCHED", problemId: PROBLEM.id, code: "planted" },
      { tab: { id: 7 } },
    );
    // Nothing is written, and the recovery is still waiting for the real tab.
    assert.equal(saved, null);
    deliver(
      { type: "CODELEDGER_CODE_FETCHED", problemId: PROBLEM.id, code: "recovered" },
      { tab: { id: 42 } },
    );
    const res = await pending;
    assert.equal(res.code, "recovered");
    assert.equal(saved.code, "recovered");
  });

  test("ignores a message with no tab behind it at all", async () => {
    const pending = triggerCodeRecovery(PROBLEM);
    await tabOpened();
    deliver({ type: "CODELEDGER_CODE_FETCHED", problemId: PROBLEM.id, code: "planted" }, {});
    deliver({ type: "CODELEDGER_CODE_FETCHED", problemId: PROBLEM.id, code: "planted" }, undefined);
    assert.equal(saved, null);
    deliver(
      { type: "CODELEDGER_CODE_FETCHED", problemId: PROBLEM.id, code: "recovered" },
      { tab: { id: 42 } },
    );
    await pending;
    assert.equal(saved.code, "recovered");
  });

  test("another tab cannot fail the recovery early either", async () => {
    // The id-missing path resolves the promise too, so it is worth the same
    // check — a stranger should not be able to cancel a recovery in flight.
    const pending = triggerCodeRecovery(PROBLEM);
    await tabOpened();
    deliver({ type: "CODELEDGER_CODE_FETCH_ID_MISSING" }, { tab: { id: 7 } });
    deliver(
      { type: "CODELEDGER_CODE_FETCHED", problemId: PROBLEM.id, code: "recovered" },
      { tab: { id: 42 } },
    );
    const res = await pending;
    assert.equal(res.ok, true);
  });
});
