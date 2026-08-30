/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * What the pull path is allowed to apply.
 *
 * `sync.json` lives in the user's ledger repository. That repository is often
 * public and may have collaborators, and its contents are exactly as
 * trustworthy as whoever can push to it — which, after a leaked token, is not
 * the user. So the file is untrusted input, and the merge loop is the place
 * where that input becomes local settings.
 *
 * `test/settings-portability.test.js` pins what `isPortableSetting` decides.
 * This file pins that the pull loop actually asks it.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { Storage } from "../src/core/storage.js";
import { registry } from "../src/core/handler-registry.js";
import { syncSettingsFromGitHub } from "../src/core/settings-sync.js";

const b64 = (s) => Buffer.from(JSON.stringify(s), "utf8").toString("base64");

let real = {};
let settings = {};

/** A git handler serving one sync.json and nothing else. */
function fakeGit(remote) {
  return {
    async getToken() {
      return "ghp_test";
    },
    async getContents(_owner, _repo, _path) {
      return { content: b64(remote), sha: "abc" };
    },
  };
}

beforeEach(() => {
  real = {
    getSettings: Storage.getSettings,
    updateSettings: Storage.updateSettings,
    getTheme: Storage.getTheme,
    setTheme: Storage.setTheme,
    getGitProvider: registry.getGitProvider,
  };
  settings = { github_owner: "o", github_repo: "r" };
  Storage.getSettings = async () => ({ ...settings });
  Storage.updateSettings = async (patch) => {
    const p = typeof patch === "function" ? patch(settings) : patch;
    settings = { ...settings, ...p };
    return { ...settings };
  };
  Storage.getTheme = async () => ({});
  Storage.setTheme = async () => {};
});

afterEach(() => {
  Storage.getSettings = real.getSettings;
  Storage.updateSettings = real.updateSettings;
  Storage.getTheme = real.getTheme;
  Storage.setTheme = real.setTheme;
  registry.getGitProvider = real.getGitProvider;
});

describe("syncSettingsFromGitHub", () => {
  test("applies a preference the allow-list accepts", async () => {
    registry.getGitProvider = () => fakeGit({ theme_preset: "midnight" });
    const res = await syncSettingsFromGitHub();
    assert.equal(res.synced, 1);
    assert.equal(settings.theme_preset, "midnight");
  });

  test("refuses an AI endpoint override from the repo", async () => {
    // The exploit this closes: one line in sync.json, and every later AI review
    // posts the user's solution to the attacker's server with the user's API
    // key in the Authorization header. `openai_endpoint` used to be waved
    // through on the strength of its `openai_` prefix.
    registry.getGitProvider = () =>
      fakeGit({
        openai_endpoint: "https://evil.example/v1",
        claude_endpoint: "https://evil.example/v1",
        ollama_endpoint: "http://evil.example/api",
        aiEndpoint: "https://evil.example/v1",
      });
    const res = await syncSettingsFromGitHub();
    assert.equal(res.synced, 0);
    for (const k of ["openai_endpoint", "claude_endpoint", "ollama_endpoint", "aiEndpoint"]) {
      assert.equal(settings[k], undefined, `${k} was accepted from the repo`);
    }
  });

  test("refuses a credential from the repo", async () => {
    registry.getGitProvider = () => fakeGit({ github_token: "ghp_evil", openai_keys: "sk-evil" });
    await syncSettingsFromGitHub();
    assert.equal(settings.github_token, undefined);
    assert.equal(settings.openai_keys, undefined);
  });

  test("refuses to repoint the repository it syncs against", async () => {
    registry.getGitProvider = () => fakeGit({ github_owner: "attacker", github_repo: "loot" });
    await syncSettingsFromGitHub();
    assert.equal(settings.github_owner, "o");
    assert.equal(settings.github_repo, "r");
  });

  test("refuses a key that is on no list at all", async () => {
    registry.getGitProvider = () => fakeGit({ someFutureKey: "x" });
    const res = await syncSettingsFromGitHub();
    assert.equal(res.synced, 0);
    assert.equal("someFutureKey" in settings, false);
  });
});
