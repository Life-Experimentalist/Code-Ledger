/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The provider that answers by asking a person.
 *
 * Two things have to hold for this to be safe rather than a way to hang the
 * extension. It must never be reachable from a context with no human in it —
 * the service worker runs reviews after a solve, possibly with the tab already
 * closed — and when it is reached from one, a cancelled exchange must be an
 * error rather than an empty review written into the repository.
 *
 * So these tests are mostly about the two failure directions, not the happy
 * path: nothing must stall, and nothing empty must be returned as an answer.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { CONSTANTS } from "../src/core/constants.js";
import { Storage } from "../src/core/storage.js";
import {
  setManualPromptResolver,
  resolveManualPrompt,
  isManualAvailable,
} from "../src/core/manual-bridge.js";
import { ManualHandler } from "../src/handlers/ai/manual/index.js";
import { disclosures, privacyTier } from "../src/core/privacy-disclosure.js";

let realGetAIPrompts;

beforeEach(() => {
  realGetAIPrompts = Storage.getAIPrompts;
  Storage.getAIPrompts = async () => ({});
});

afterEach(() => {
  Storage.getAIPrompts = realGetAIPrompts;
  setManualPromptResolver(null);
});

describe("never called where there is nobody to ask", () => {
  test("the automatic fallback chain contains no human-in-the-loop provider", () => {
    // This chain is walked by the service worker on every solve. One entry that
    // waits for a paste would burn its 30s timeout there and answer nothing.
    for (const id of CONSTANTS.AI_FALLBACK_CHAIN) {
      assert.notEqual(
        CONSTANTS.AI_PROVIDERS[id]?.requiresHuman,
        true,
        `${id} is in AI_FALLBACK_CHAIN but requires a human`,
      );
    }
  });

  test("the default primary provider is not one either", () => {
    const primary = CONSTANTS.AI_PROVIDERS[CONSTANTS.AI_DEFAULT_PRIMARY];
    assert.ok(primary, "AI_DEFAULT_PRIMARY names no declared provider");
    assert.notEqual(primary.requiresHuman, true);
  });

  test("with no UI installed the bridge fails immediately rather than waiting", async () => {
    assert.equal(isManualAvailable(), false);
    await assert.rejects(() => resolveManualPrompt("review this"), /only works from a CodeLedger/);
  });

  test("review() fails the same way, so a background call cannot stall", async () => {
    // The service worker filters this provider out before calling it. This is
    // the second line: even if that filter regressed, the call returns at once.
    await assert.rejects(
      () => new ManualHandler().review("code", { title: "Two Sum" }),
      /only works from a CodeLedger/,
    );
  });
});

describe("the exchange itself", () => {
  test("the person is shown the prompt the other providers would have sent", async () => {
    let seen = "";
    setManualPromptResolver(async (prompt) => {
      seen = prompt;
      return "looks fine";
    });
    const answer = await new ManualHandler().review("function f(){}", {
      title: "Two Sum",
      difficulty: "Easy",
      platform: "leetcode",
    });
    assert.equal(answer, "looks fine");
    assert.match(seen, /Two Sum/);
    assert.match(seen, /function f\(\)\{\}/);
  });

  test("chat() passes the already-built prompt through untouched", async () => {
    let seen = "";
    setManualPromptResolver(async (prompt) => {
      seen = prompt;
      return "an answer";
    });
    const out = await new ManualHandler().chat([{ role: "user", content: "why O(n log n)?" }], {
      title: "Sort Colors",
    });
    assert.equal(out, "an answer");
    assert.match(seen, /why O\(n log n\)\?/);
    // Raw mode: chat builds the whole prompt, so the review template must not
    // be wrapped around it a second time.
    assert.ok(!/Analyse the following/i.test(seen));
  });

  test("what the person pasted comes back verbatim, trimmed", async () => {
    setManualPromptResolver(async () => "  # Review\n\nGood.  ");
    assert.equal(await new ManualHandler().review("x", {}), "# Review\n\nGood.");
  });

  test("a cancelled exchange is an error, not an empty review", async () => {
    // Returning "" here would be committed to the repository as that solve's
    // AI review, which is worse than having none.
    setManualPromptResolver(async () => "   ");
    await assert.rejects(() => new ManualHandler().review("x", {}), /No answer was pasted/);
  });

  test("the resolver can be uninstalled again", async () => {
    const uninstall = setManualPromptResolver(async () => "ok");
    assert.equal(isManualAvailable(), true);
    uninstall();
    assert.equal(isManualAvailable(), false);
  });
});

describe("what the privacy disclosure says about it", () => {
  const on = (id) => ({ aiEnabled: true, [`${id}_enabled`]: true });

  test("it is listed as a destination of your clipboard, not of a company", () => {
    for (const [id, meta] of Object.entries(CONSTANTS.AI_PROVIDERS)) {
      if (meta.requiresHuman !== true) continue;
      const row = disclosures(on(id)).find((d) => d.id === `ai:${id}`);
      assert.ok(row, `${id} is not disclosed at all`);
      assert.equal(row.on, true);
      assert.equal(row.tier, "private");
      assert.match(row.what, /Nothing is sent/);
    }
  });

  test("enabling it does not move the headline tier to 'your code goes to an AI provider'", () => {
    // It would be false: the extension makes no request for this provider. What
    // happens after the prompt reaches the clipboard is the user's own doing.
    for (const [id, meta] of Object.entries(CONSTANTS.AI_PROVIDERS)) {
      if (meta.requiresHuman !== true) continue;
      assert.equal(privacyTier(on(id)).tier, "private");
    }
  });
});
