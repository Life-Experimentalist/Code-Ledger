/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression tests for the OAuth postMessage trust check.
 *
 * This exact vulnerability shipped twice — once as an explicit `origin !==
 * "null"` allowlist entry, once as a listener with no origin check at all.
 * These tests are the reason it cannot ship a third time.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  trustedAuthOrigins,
  isTrustedAuthMessage,
  isAuthCallbackUrl,
} from "../src/lib/oauth-message.js";

const WORKER = "https://codeledger.vkrishna04.me/api";
const SELF = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const ALLOWED = trustedAuthOrigins(WORKER, SELF);

/** A message that is valid in every respect except where a test overrides it. */
const good = (over = {}) => ({
  origin: "https://codeledger.vkrishna04.me",
  data: { type: "CODELEDGER_AUTH", provider: "github", token: "gho_realtoken", ...over.data },
  ...(over.origin !== undefined ? { origin: over.origin } : {}),
});

describe("trustedAuthOrigins", () => {
  test("derives the worker origin from a URL that carries a path", () => {
    assert.ok(ALLOWED.includes("https://codeledger.vkrishna04.me"));
    assert.ok(!ALLOWED.some((o) => o.includes("/api")));
  });

  test("includes the listening document's own origin", () => {
    assert.ok(ALLOWED.includes(SELF));
  });

  test('never includes "null"', () => {
    assert.ok(!trustedAuthOrigins(WORKER, "null").includes("null"));
  });

  test("a malformed worker URL does not widen the allowlist", () => {
    const origins = trustedAuthOrigins("not a url", SELF);
    assert.deepEqual(origins, [SELF]);
  });
});

describe("isAuthCallbackUrl", () => {
  const CB = "https://codeledger.vkrishna04.me/api/auth/github/callback";

  test("accepts the real callback URL", () => {
    assert.equal(isAuthCallbackUrl(CB), true);
  });

  test("accepts the callback URL with a query string", () => {
    assert.equal(isAuthCallbackUrl(`${CB}?code=abc&state=xyz`), true);
  });

  test("rejects http — an active network attacker can answer for that host", () => {
    assert.equal(isAuthCallbackUrl(CB.replace("https:", "http:")), false);
  });

  // The three substring `includes()` tests this replaced were all satisfied by
  // this URL, which aimed a repeated CL_GET_AUTH_DATA probe at an attacker tab.
  test("rejects a hostile host that puts the expected strings in path and fragment", () => {
    assert.equal(
      isAuthCallbackUrl("https://evil.test/api/auth/x/callback#codeledger.vkrishna04.me"),
      false,
    );
  });

  test("rejects a look-alike host", () => {
    assert.equal(
      isAuthCallbackUrl("https://codeledger.vkrishna04.me.evil.test/api/auth/github/callback"),
      false,
    );
  });

  test("rejects another page on the right origin", () => {
    assert.equal(isAuthCallbackUrl("https://codeledger.vkrishna04.me/privacy"), false);
  });

  test("rejects the auth start route, which carries no token", () => {
    assert.equal(isAuthCallbackUrl("https://codeledger.vkrishna04.me/api/auth/github"), false);
  });

  test("rejects junk without throwing", () => {
    for (const v of [undefined, null, "", "not a url", 42, {}]) {
      assert.equal(isAuthCallbackUrl(/** @type {any} */ (v)), false);
    }
  });
});

describe("isTrustedAuthMessage — origin", () => {
  test("accepts a genuine message from the auth worker", () => {
    assert.equal(isTrustedAuthMessage(good(), ALLOWED, "github"), true);
  });

  test('rejects origin "null" — sandboxed iframes and data:/file: documents', () => {
    assert.equal(isTrustedAuthMessage(good({ origin: "null" }), ALLOWED, "github"), false);
  });

  test("rejects an arbitrary attacker origin", () => {
    assert.equal(isTrustedAuthMessage(good({ origin: "https://evil.test" }), ALLOWED), false);
  });

  test("rejects a look-alike host", () => {
    const near = "https://codeledger.vkrishna04.me.evil.test";
    assert.equal(isTrustedAuthMessage(good({ origin: near }), ALLOWED), false);
  });

  test("rejects the right host on the wrong scheme", () => {
    assert.equal(
      isTrustedAuthMessage(good({ origin: "http://codeledger.vkrishna04.me" }), ALLOWED),
      false,
    );
  });

  test("rejects a message with no origin property at all", () => {
    assert.equal(isTrustedAuthMessage({ data: good().data }, ALLOWED), false);
  });
});

describe("isTrustedAuthMessage — payload", () => {
  test("ignores messages of another type", () => {
    assert.equal(isTrustedAuthMessage(good({ data: { type: "OTHER" } }), ALLOWED), false);
  });

  test("rejects a payload with no token", () => {
    assert.equal(isTrustedAuthMessage(good({ data: { token: undefined } }), ALLOWED), false);
  });

  test("rejects a non-string token", () => {
    assert.equal(isTrustedAuthMessage(good({ data: { token: { a: 1 } } }), ALLOWED), false);
  });

  test("rejects a provider mismatch when one is expected", () => {
    assert.equal(isTrustedAuthMessage(good({ data: { provider: "gitlab" } }), ALLOWED, "github"), false);
  });

  test("tolerates a string payload without throwing", () => {
    assert.equal(isTrustedAuthMessage({ origin: ALLOWED[0], data: "hello" }, ALLOWED), false);
  });

  test("tolerates a null payload without throwing", () => {
    assert.equal(isTrustedAuthMessage({ origin: ALLOWED[0], data: null }, ALLOWED), false);
  });
});
