/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The failover ladder decides where a solve is committed when the primary
 * repository refuses. It used to include every entry of `git_mirrors`, while the
 * replication pass that runs after it skipped the ones marked `enabled: false` —
 * and the settings panel creates every mirror in exactly that state.
 *
 * So a mirror the user typed in and never switched on was a live commit
 * destination, and a permanent failure on the primary (404 after a rename or a
 * delete) promoted it to `git_active_primary`, making it the target for good.
 *
 * These tests pin the ladder's answer, not the promotion logic that consumes it.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  targetKey,
  isMirrorEnabled,
  normalizeGitTarget,
  getDefaultPrimaryTarget,
  getOrderedTargets,
} from "../src/core/git-targets.js";

const repos = (settings) => getOrderedTargets(settings).map((t) => t.repo);

describe("isMirrorEnabled", () => {
  test("only an explicit false is off", () => {
    assert.equal(isMirrorEnabled({ enabled: false }), false);
    assert.equal(isMirrorEnabled({ enabled: true }), true);
    // No flag at all: a mirror saved before the toggle existed. Treated as on,
    // which is what pushToMirrors has always done.
    assert.equal(isMirrorEnabled({}), true);
    assert.equal(isMirrorEnabled(undefined), true);
  });
});

describe("normalizeGitTarget", () => {
  test("returns null without a repo", () => {
    assert.equal(normalizeGitTarget(null), null);
    assert.equal(normalizeGitTarget({ owner: "me" }), null);
  });

  test("defaults the provider and squashes whitespace in the repo name", () => {
    assert.deepEqual(normalizeGitTarget({ owner: "me", repo: "my notes" }), {
      provider: "github",
      owner: "me",
      repo: "my-notes",
    });
  });
});

describe("getDefaultPrimaryTarget", () => {
  test("prefers github_repo but accepts the legacy gitRepo", () => {
    assert.equal(getDefaultPrimaryTarget({ github_repo: "new", gitRepo: "old" }).repo, "new");
    assert.equal(getDefaultPrimaryTarget({ gitRepo: "old" }).repo, "old");
    assert.equal(getDefaultPrimaryTarget({}), null);
  });

  test("falls back through the owner names", () => {
    assert.equal(getDefaultPrimaryTarget({ github_repo: "r", github_username: "u" }).owner, "u");
  });
});

describe("getOrderedTargets", () => {
  const base = { github_owner: "me", github_repo: "solutions" };

  test("primary alone when nothing else is configured", () => {
    assert.deepEqual(repos(base), ["solutions"]);
    assert.deepEqual(getOrderedTargets({}), []);
  });

  test("a disabled mirror is not a failover destination", () => {
    const settings = {
      ...base,
      git_mirrors: [
        { owner: "me", repo: "backup", enabled: false },
        { owner: "me", repo: "live", enabled: true },
      ],
    };
    assert.deepEqual(repos(settings), ["solutions", "live"]);
  });

  test("a mirror with no enabled flag still counts — legacy entries stay on", () => {
    const settings = { ...base, git_mirrors: [{ owner: "me", repo: "legacy" }] };
    assert.deepEqual(repos(settings), ["solutions", "legacy"]);
  });

  test("the active primary leads the ladder", () => {
    const settings = {
      ...base,
      git_active_primary: { owner: "me", repo: "live" },
      git_mirrors: [{ owner: "me", repo: "live", enabled: true }],
    };
    assert.deepEqual(repos(settings), ["live", "solutions"]);
  });

  test("disabling a mirror that was already promoted takes it out of the ladder", () => {
    // The state the bug produced: failover promoted `backup`, storing only
    // {provider, owner, repo}, so the enabled flag does not travel with it.
    const settings = {
      ...base,
      git_active_primary: { owner: "me", repo: "backup" },
      git_mirrors: [{ owner: "me", repo: "backup", enabled: false }],
    };
    assert.deepEqual(repos(settings), ["solutions"]);
  });

  test("a disabled mirror under a different owner does not silence the active primary", () => {
    const settings = {
      ...base,
      git_active_primary: { owner: "me", repo: "backup" },
      git_mirrors: [{ owner: "someone-else", repo: "backup", enabled: false }],
    };
    assert.deepEqual(getOrderedTargets(settings).map(targetKey), [
      "github:me/backup",
      "github:me/solutions",
    ]);
  });

  test("de-duplicates, keeping first position", () => {
    const settings = {
      ...base,
      git_active_primary: { owner: "me", repo: "solutions" },
      git_mirrors: [{ owner: "me", repo: "solutions", enabled: true }],
    };
    assert.deepEqual(repos(settings), ["solutions"]);
  });

  test("survives junk in git_mirrors", () => {
    const settings = { ...base, git_mirrors: [null, {}, { owner: "me", repo: "ok" }] };
    assert.deepEqual(repos(settings), ["solutions", "ok"]);
    assert.deepEqual(repos({ ...base, git_mirrors: "not an array" }), ["solutions"]);
  });
});
