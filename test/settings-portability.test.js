/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * What may leave the device.
 *
 * `isPortableSetting` decides what gets written into the user's repository, in
 * plaintext, in a file that is usually world-readable and whose history nobody
 * can rewrite. Every one of these is a regression test for a way that decision
 * has been or could be got wrong.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isPortableSetting, PORTABLE_SETTINGS } from "../src/core/settings-sync.js";

/** Every AI provider whose settings keys the prefix rule waves through. */
const AI_PROVIDERS = ["openai", "claude", "gemini", "deepseek", "ollama", "openrouter"];

describe("isPortableSetting", () => {
  it("never lets an AI provider's API keys out", () => {
    for (const p of AI_PROVIDERS) {
      assert.equal(
        isPortableSetting(`${p}_keys`),
        false,
        `${p}_keys must never be written to the repo`,
      );
    }
  });

  it("still lets that provider's harmless settings out", () => {
    for (const p of AI_PROVIDERS) {
      assert.equal(isPortableSetting(`${p}_enabled`), true);
      assert.equal(isPortableSetting(`${p}_model`), true);
    }
  });

  it("never lets an endpoint override travel in either direction", () => {
    // Not a secret, but it decides where the solution and the API key are
    // posted. The pull path runs this same test, so `false` here is what stops
    // a line added to sync.json by anyone with write access to the repo from
    // redirecting every AI review to a server they control.
    for (const p of AI_PROVIDERS) {
      assert.equal(isPortableSetting(`${p}_endpoint`), false, `${p}_endpoint must stay local`);
    }
    assert.equal(isPortableSetting("aiEndpoint"), false);
  });

  it("never lets a git credential out", () => {
    for (const k of [
      "github_token",
      "gitlab_token",
      "bitbucket_token",
      "auth",
      "auth.tokens",
      "ai.keys",
    ]) {
      assert.equal(isPortableSetting(k), false, `${k} must never be written to the repo`);
    }
  });

  it("rejects anything that looks like a credential by name", () => {
    for (const k of [
      "someprovider_secret",
      "someprovider_password",
      "someprovider_apiKey",
      "someprovider_api_key",
      "leetcode_token",
    ]) {
      assert.equal(isPortableSetting(k), false, `${k} must never be written to the repo`);
    }
  });

  it("does not carry internal bookkeeping into the repo", () => {
    for (const k of [
      "_defaultsApplied",
      "_pendingConflicts",
      "settings._pending_commit",
      "settings._last_committed_hash",
      "git_active_primary",
      "incognitoExpiry",
    ]) {
      assert.equal(isPortableSetting(k), false, `${k} is local bookkeeping, not a preference`);
    }
  });

  it("carries the preferences a user would expect to survive a reinstall", () => {
    for (const k of [
      "theme_preset",
      "darkMode",
      "gamificationEnabled",
      "dailyTargetPoints",
      "partyFriends",
      "telemetryOptIn",
      "autoCommit",
      "github_coauthor_trailer",
    ]) {
      assert.equal(isPortableSetting(k), true, `${k} should travel between devices`);
    }
  });

  it("survives a key that is not a string", () => {
    for (const k of [undefined, null, "", 0, {}]) {
      assert.equal(isPortableSetting(/** @type {any} */ (k)), false);
    }
  });

  it("holds a list that does not contradict its own exclusions", () => {
    for (const key of PORTABLE_SETTINGS) {
      assert.equal(
        isPortableSetting(key),
        true,
        `${key} is listed as portable but an exclusion rule rejects it`,
      );
    }
  });
});
