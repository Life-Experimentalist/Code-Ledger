/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Nothing that holds a credential may print one.
 *
 * Two places used to log a prefix of a secret — a truncation, not a redaction.
 * `setAuthToken` printed the first 20 characters of the GitHub OAuth token,
 * which is the `gho_` marker plus sixteen characters of the token itself, and
 * the key pool printed the first eight of whichever AI key it was cooling
 * down. Both were there to answer "did the value actually arrive", and neither
 * needs the value to answer it.
 *
 * The two are not equally bad, and it is worth saying so rather than claiming
 * one fix for both. Sixteen characters of a token is a real disclosure. Eight
 * characters of an AI key is mostly the vendor's own marker — `AIzaSy`,
 * `sk-proj-` — and leaks nearly nothing; it is fixed because the value was
 * never the useful part of that line, not because it was dangerous.
 *
 * A prefix is still worth more to an attacker than it looks: it confirms the
 * provider, it confirms the credential is real, and it turns a full search
 * into a shorter one. Debug logs travel — users paste them into bug reports,
 * and a screenshot of DevTools is the normal way to show that something
 * failed.
 *
 * These tests capture the real console and drive the real code paths, rather
 * than reading the source, so a future log line that reintroduces the value by
 * some other spelling fails too.
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

/** Installed before the imports below, so debug.js binds to it. */
const lines = [];
const capture = (...args) => lines.push(args.map((a) => String(a)).join(" "));
console.log = capture;
console.warn = capture;
console.info = capture;
console.error = capture;

/** `browser-compat.js` falls back to localStorage when `chrome` is absent. */
const backing = new Map();
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: (k) => backing.delete(k),
};

const { setDebug } = await import("../src/lib/debug.js");
const { Storage } = await import("../src/core/storage.js");
const { APIKeyPool } = await import("../src/core/api-key-pool.js");
const { CONSTANTS } = await import("../src/core/constants.js");
const { storage } = await import("../src/lib/browser-compat.js");

// The logs are gated behind the debug flag, so the leak only exists with it on
// — which is exactly when someone is collecting output to send to a stranger.
setDebug(true);

/** No natural language, so a six-character window cannot collide by accident. */
const SECRET = "Zq7X2m9Kd4Tb8Rn1Vp6Ls3Wj5Hc0Ef";

/**
 * The smallest run of the secret that appears in the output, or null.
 * Six characters is well below anything worth calling a redaction and well
 * above the length at which two unrelated strings collide.
 */
function leakedFragment(secret, window = 6) {
  const haystack = lines.join("\n");
  for (let i = 0; i + window <= secret.length; i++) {
    const fragment = secret.slice(i, i + window);
    if (haystack.includes(fragment)) return fragment;
  }
  return null;
}

beforeEach(() => {
  lines.length = 0;
  backing.clear();
});

describe("OAuth tokens", () => {
  const TOKEN = `gho_${SECRET}`;

  test("storing one prints no part of it", async () => {
    await Storage.setAuthToken("github", TOKEN);
    assert.equal(leakedFragment(SECRET), null, `setAuthToken logged the token`);
  });

  test("storing one still says that it happened", async () => {
    await Storage.setAuthToken("github", TOKEN);
    // The line exists to confirm the write reached storage. Redacting the value
    // must not amount to deleting the line — that would trade one debugging
    // problem for another.
    assert.ok(
      lines.some((l) => /setAuthToken\(github\)/.test(l)),
      "no line reports the write",
    );
  });

  test("the token is still stored", async () => {
    await Storage.setAuthToken("github", TOKEN);
    assert.equal(await Storage.getAuthToken("github"), TOKEN);
  });

  test("reading one prints no part of it", async () => {
    await Storage.setAuthToken("github", TOKEN);
    lines.length = 0;
    await Storage.getAuthToken("github");
    assert.equal(leakedFragment(SECRET), null, "getAuthToken logged the token");
  });
});

describe("AI API keys", () => {
  // No vendor prefix. A self-hosted or gateway key can be opaque all the way
  // through, and the rule is about key material, not about how much of it a
  // particular vendor happens to publish in front.
  const KEY = SECRET;

  test("cooling one down prints no part of it", () => {
    new APIKeyPool("gemini").markFailed(KEY, 429);
    assert.equal(leakedFragment(SECRET), null, "markFailed logged the key");
  });

  test("cooling one down still says that it happened", () => {
    new APIKeyPool("gemini").markFailed(KEY, 503);
    assert.ok(
      lines.some((l) => /cooling down/i.test(l)),
      "no line reports the cooldown",
    );
  });

  test("the key is still taken out of rotation", async () => {
    await storage.local.set({ [CONSTANTS.SK.AI_KEYS]: { gemini: [KEY] } });
    const pool = new APIKeyPool("gemini");
    pool.markFailed(KEY, 429);
    assert.equal(await pool.getNextKey(), null);
  });

  test("a non-rate-limit failure prints the status and no key", () => {
    new APIKeyPool("gemini").markFailed(KEY, 400);
    assert.equal(leakedFragment(SECRET), null, "markFailed logged the key");
    assert.ok(
      lines.some((l) => /400/.test(l)),
      "the status is the useful part of that line and is missing",
    );
  });

  test("selecting a key prints no part of it", async () => {
    await storage.local.set({ [CONSTANTS.SK.AI_KEYS]: { gemini: [KEY] } });
    lines.length = 0;
    const pool = new APIKeyPool("gemini");
    for (const strategy of ["round-robin", "random", "sticky-first"]) {
      await storage.local.set({ [CONSTANTS.SK.SETTINGS]: { gemini_keyStrategy: strategy } });
      assert.equal(await pool.getNextKey(), KEY);
    }
    assert.equal(leakedFragment(SECRET), null, "a selection path logged the key");
  });
});
