/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The three repo-maintenance operations rebuild the remote repository from
 * local storage and delete whatever the rebuild does not produce.
 *
 * That is safe only while local storage holds the solves. It does not on a
 * second device: link an existing repository, and until the first sync pull
 * lands, IndexedDB is empty. "Rebuild from local" then means "delete every
 * solution in the repository and commit nothing back", and the repository was
 * the only copy.
 *
 * `forceRebuildRepo` was the worst of the three, because its clear is a
 * separate commit issued *before* it read local storage — so the wipe landed
 * first and anything that threw afterwards had nothing to restore.
 *
 * These tests pin the refusal, and pin that it does not fire when there is
 * nothing to delete (a fresh repository must still be buildable from nothing).
 */

import { describe, it, beforeEach, before, after } from "node:test";
import assert from "node:assert/strict";

// browser-compat falls back to a localStorage-backed mock when chrome.storage
// is absent, which lets the module graph import under Node.
const backing = new Map();
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: (k) => backing.delete(k),
};

const { Storage } = await import("../src/core/storage.js");
const { registry } = await import("../src/core/handler-registry.js");
const { migrateRepo, resetRepo, forceRebuildRepo } =
  await import("../src/background/migration-manager.js");

// Problem storage is IndexedDB, which Node does not have. Stub the surface the
// three operations use, the way sync-engine.test.js does.
const real = {
  getAllProblems: Storage.getAllProblems,
  getSettings: Storage.getSettings,
  updateSettings: Storage.updateSettings,
};

/** Every write the fake provider was asked to make, in order. */
let commits;
/** What Storage.getAllProblems() returns for the test in hand. */
let stored;

function installGit(treePaths) {
  commits = [];
  registry.registerGitProvider("github", {
    getToken: async () => "t0ken",
    apiFetch: async (path) => {
      if (path === "/user") return { login: "tester" };
      if (path.includes("/git/trees/")) {
        return { tree: treePaths.map((p) => ({ path: p, type: "blob" })) };
      }
      throw new Error(`unexpected apiFetch: ${path}`);
    },
    commit: async (files, message, repo, opts) => {
      commits.push({ files, message, repo, deletes: opts?.deletes || [] });
      return { ok: true };
    },
    commitHistorical: async (list) => {
      commits.push({ historical: list.length });
      return { ok: true };
    },
  });
}

const SOLVES = ["problems/two-sum/leetcode/lc-two-sum.py", "index.json"];

before(() => {
  Storage.getAllProblems = async () => stored;
  Storage.getSettings = async () => ({ github_repo: "dsa", github_owner: "tester" });
  Storage.updateSettings = async () => ({});
});

after(() => {
  Storage.getAllProblems = real.getAllProblems;
  Storage.getSettings = real.getSettings;
  Storage.updateSettings = real.updateSettings;
});

beforeEach(() => {
  stored = [];
});

describe("repo maintenance refuses to run against an empty local store", () => {
  it("resetRepo does not commit when it would delete solves and re-commit nothing", async () => {
    installGit(SOLVES);

    await assert.rejects(() => resetRepo(), /no problems are stored on this device/);
    assert.equal(commits.length, 0, "nothing may be committed");
  });

  it("forceRebuildRepo refuses BEFORE issuing its clear commit", async () => {
    installGit(SOLVES);

    await assert.rejects(() => forceRebuildRepo(), /no problems are stored on this device/);
    // The regression this pins: the clear used to be committed before local
    // storage was ever read, so the repo was wiped and nothing restored it.
    assert.equal(commits.length, 0, "the clear commit must not have been issued");
  });

  it("migrateRepo does not delete old-layout files with nothing to replace them", async () => {
    installGit(["topics/arrays/two-sum/solution.py", "index.json"]);

    await assert.rejects(() => migrateRepo(), /no problems are stored on this device/);
    assert.equal(commits.length, 0);
  });

  it("names the file count so the message is actionable", async () => {
    installGit(SOLVES);

    await assert.rejects(() => resetRepo(), /would delete 1 file\(s\)/);
  });
});

describe("the guard does not block legitimate work", () => {
  it("an empty store against an empty repo still commits — nothing is at risk", async () => {
    installGit([]);

    const res = await resetRepo();

    assert.equal(commits.length, 1, "a fresh repo must still be buildable from nothing");
    assert.deepEqual(commits[0].deletes, []);
    assert.equal(res.deleted, 0);
  });

  it("a populated store rebuilds and deletes strays as before", async () => {
    installGit(["problems/stale/leetcode/lc-stale.py", "index.json"]);
    stored = [
      {
        id: "lc-two-sum",
        titleSlug: "two-sum",
        title: "Two Sum",
        platform: "leetcode",
        difficulty: "Easy",
        lang: { name: "Python", ext: "py", slug: "python" },
        code: "print(1)",
        timestamp: 1,
      },
    ];

    const res = await resetRepo();

    assert.equal(commits.length, 1);
    assert.ok(res.committed >= 1, "the stored problem is committed");
    assert.ok(
      commits[0].deletes.includes("problems/stale/leetcode/lc-stale.py"),
      "a stray file is still deleted when the store is non-empty",
    );
  });
});
