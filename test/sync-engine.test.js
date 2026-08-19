/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for cross-device sync.
 *
 * performSync() wraps its whole body in one try/catch that logs and swallows.
 * That hid a ReferenceError for a long time: sync reported failure on runs
 * that had in fact imported everything correctly, and the chat import never
 * ran at all. So these tests assert on what the engine *did* — which handler
 * calls it made — rather than on whether it threw.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { Storage } from "../src/core/storage.js";
import { registry } from "../src/core/handler-registry.js";
import { importFromRepo, SyncEngine } from "../src/background/sync-engine.js";

/** btoa is not global in Node's module scope until we put it there. */
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

/**
 * A git handler recording every getContents path it was asked for.
 * `files` maps a repo path to the string content served for it.
 */
function fakeGit(files = {}) {
  const asked = [];
  return {
    asked,
    async getToken() {
      return "gho_test";
    },
    async getContents(_owner, _repo, path) {
      asked.push(path);
      if (!(path in files)) {
        const err = new Error(`404 ${path}`);
        // @ts-ignore — the handlers attach status this way
        err.status = 404;
        throw err;
      }
      return { content: b64(files[path]) };
    },
  };
}

const problem = (over = {}) => ({
  id: "lc-two-sum",
  platform: "leetcode",
  titleSlug: "two-sum",
  title: "Two Sum",
  difficulty: "Easy",
  code: "return [];",
  lang: { name: "Python3", ext: "py", slug: "python3" },
  tags: [],
  ...over,
});

let real = {};

beforeEach(() => {
  real = {
    getAllProblems: Storage.getAllProblems,
    saveProblem: Storage.saveProblem,
    addScheduledBackup: Storage.addScheduledBackup,
    getSettings: Storage.getSettings,
    setSettings: Storage.setSettings,
    updateSettings: Storage.updateSettings,
    getGitProvider: registry.getGitProvider,
    fetch: globalThis.fetch,
  };
  // The raw.githubusercontent fallback must never reach the network in tests.
  globalThis.fetch = async () => ({ ok: false, text: async () => "" });
  Storage.getAllProblems = async () => [];
  Storage.saveProblem = async () => {};
  Storage.addScheduledBackup = async () => {};
  Storage.getSettings = async () => ({});
  Storage.setSettings = async () => {};
  Storage.updateSettings = async () => ({});
});

afterEach(() => {
  Storage.getAllProblems = real.getAllProblems;
  Storage.saveProblem = real.saveProblem;
  Storage.addScheduledBackup = real.addScheduledBackup;
  Storage.getSettings = real.getSettings;
  Storage.setSettings = real.setSettings;
  Storage.updateSettings = real.updateSettings;
  registry.getGitProvider = real.getGitProvider;
  globalThis.fetch = real.fetch;
});

describe("importFromRepo", () => {
  test("reports a remote problem the device does not have", async () => {
    const git = fakeGit({ "index.json": JSON.stringify({ problems: [problem()] }) });
    const { remoteOnly, conflicts } = await importFromRepo("o", "r", git);
    assert.equal(remoteOnly.length, 1);
    assert.equal(remoteOnly[0].id, "lc-two-sum");
    assert.deepEqual(conflicts, []);
  });

  test("an identical problem is neither new nor a conflict", async () => {
    Storage.getAllProblems = async () => [problem()];
    const git = fakeGit({ "index.json": JSON.stringify({ problems: [problem()] }) });
    const { remoteOnly, conflicts } = await importFromRepo("o", "r", git);
    assert.deepEqual(remoteOnly, []);
    assert.deepEqual(conflicts, []);
  });

  test("a differing field on the same problem is a conflict", async () => {
    Storage.getAllProblems = async () => [problem({ code: "local version" })];
    const git = fakeGit({
      "index.json": JSON.stringify({ problems: [problem({ code: "remote version" })] }),
    });
    const { remoteOnly, conflicts } = await importFromRepo("o", "r", git);
    assert.deepEqual(remoteOnly, []);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].local.code, "local version");
    assert.equal(conflicts[0].remote.code, "remote version");
  });

  test("the same problem in another language is a separate entry, not a conflict", async () => {
    Storage.getAllProblems = async () => [problem()];
    const remote = problem({
      id: "lc-two-sum",
      code: "return {};",
      lang: { name: "Java", ext: "java", slug: "java" },
    });
    const git = fakeGit({ "index.json": JSON.stringify({ problems: [remote] }) });
    const { remoteOnly, conflicts } = await importFromRepo("o", "r", git);
    assert.equal(
      remoteOnly.length,
      1,
      "the Java solve is new work, not a rewrite of the Python one",
    );
    assert.deepEqual(conflicts, []);
  });

  test("a conflict already resolved locally is not raised again before the push", async () => {
    // Realistic epoch values: anything under 1e10 is treated as Unix seconds
    // and normalized to ms before the comparison.
    Storage.getAllProblems = async () => [
      problem({ code: "resolved", _conflictResolvedAt: 1_700_000_005_000 }),
    ];
    const git = fakeGit({
      "index.json": JSON.stringify({
        problems: [problem({ code: "stale", timestamp: 1_700_000_000_000 })],
      }),
    });
    const { conflicts } = await importFromRepo("o", "r", git);
    assert.deepEqual(conflicts, [], "the local resolution is newer than the remote copy");
  });

  test("a seconds-unit remote timestamp is normalized before the resolved-at comparison", async () => {
    // Codeforces records timestamps in Unix seconds. Comparing 1.7e9 (seconds)
    // against a ms resolved-at made the remote lose every comparison, so its
    // conflicts were suppressed forever after a single resolution.
    Storage.getAllProblems = async () => [
      problem({ code: "resolved", _conflictResolvedAt: 1_700_000_005_000 }),
    ];
    const git = fakeGit({
      "index.json": JSON.stringify({
        // 1_700_000_100 s → 1_700_000_100_000 ms: newer than the resolution,
        // so this IS a live conflict and must be raised.
        problems: [problem({ code: "newer remote", timestamp: 1_700_000_100 })],
      }),
    });
    const { conflicts } = await importFromRepo("o", "r", git);
    assert.equal(conflicts.length, 1, "a remote edit newer than the resolution must surface");
  });

  test("a field the older record simply never had is not a conflict", async () => {
    // Every one of these is the same statement written two ways. Comparing the
    // raw values called all of them disagreements, so a library that had never
    // been touched on a second device could report that every problem in it
    // needed manual review — the "86 conflicts detected" with nothing to fix.
    Storage.getAllProblems = async () => [
      problem({ tags: [], isDuplicate: false, duplicateOf: null, notes: "", aiReview: undefined }),
    ];
    const remote = problem();
    delete remote.tags;
    const git = fakeGit({ "index.json": JSON.stringify({ problems: [remote] }) });
    const { remoteOnly, conflicts } = await importFromRepo("o", "r", git);
    assert.deepEqual(remoteOnly, []);
    assert.deepEqual(conflicts, []);
  });

  test("a flag that is genuinely set is still a conflict", async () => {
    Storage.getAllProblems = async () => [problem({ isDuplicate: true, duplicateOf: "lc-3sum" })];
    const git = fakeGit({ "index.json": JSON.stringify({ problems: [problem()] }) });
    const { conflicts } = await importFromRepo("o", "r", git);
    assert.equal(conflicts.length, 1);
  });

  test("a non-empty tag list is still compared", async () => {
    Storage.getAllProblems = async () => [problem({ tags: ["array"] })];
    const git = fakeGit({
      "index.json": JSON.stringify({ problems: [problem({ tags: ["dp"] })] }),
    });
    const { conflicts } = await importFromRepo("o", "r", git);
    assert.equal(conflicts.length, 1);
  });

  test("trailing whitespace on a field is not a disagreement", async () => {
    Storage.getAllProblems = async () => [problem({ notes: "check the edge case\n" })];
    const git = fakeGit({
      "index.json": JSON.stringify({ problems: [problem({ notes: "check the edge case" })] }),
    });
    const { conflicts } = await importFromRepo("o", "r", git);
    assert.deepEqual(conflicts, []);
  });

  test("a remote entry missing a platform-scoped id gets one", async () => {
    const legacy = { ...problem(), id: "two-sum" };
    const git = fakeGit({ "index.json": JSON.stringify({ problems: [legacy] }) });
    const { remoteOnly } = await importFromRepo("o", "r", git);
    assert.equal(remoteOnly[0].id, "lc-two-sum");
  });

  test("an unparseable index.json is treated as an empty remote", async () => {
    const git = fakeGit({ "index.json": "{not json" });
    const { remoteOnly, conflicts } = await importFromRepo("o", "r", git);
    assert.deepEqual(remoteOnly, []);
    assert.deepEqual(conflicts, []);
  });

  test("a repo with no index.json yet imports nothing instead of throwing", async () => {
    const { remoteOnly } = await importFromRepo("o", "r", fakeGit({}));
    assert.deepEqual(remoteOnly, []);
  });
});

describe("SyncEngine.performSync", () => {
  /** Runs a sync against a repo containing `files`, returning the fake handler. */
  async function run(files, settings = {}) {
    const git = fakeGit(files);
    registry.getGitProvider = () => git;
    Storage.getSettings = async () => ({
      github_owner: "octocat",
      github_repo: "CodeLedger-Sync",
      ...settings,
    });
    await SyncEngine.performSync();
    return git;
  }

  test("reads index.json and then the chats directory", async () => {
    const git = await run({ "index.json": JSON.stringify({ problems: [] }) });
    assert.ok(git.asked.includes("index.json"), "must read the problem index");
    assert.ok(
      git.asked.includes("chats"),
      "must go on to import chats — this call was unreachable while `getContents` was an undefined name",
    );
  });

  test("saves nothing and skips the chat pass when git is turned off", async () => {
    const git = await run(
      { "index.json": JSON.stringify({ problems: [] }) },
      { gitEnabled: false },
    );
    assert.deepEqual(git.asked, []);
  });

  test("does not import when the repo is not configured", async () => {
    const git = await run({ "index.json": "{}" }, { github_owner: "", github_repo: "" });
    assert.deepEqual(git.asked, []);
  });

  test("records the conflict count for the settings UI instead of importing", async () => {
    let written = null;
    Storage.getAllProblems = async () => [problem({ code: "local" })];
    Storage.updateSettings = async (patch) => {
      written = patch;
      return patch;
    };
    const saved = [];
    Storage.saveProblem = async (p) => {
      saved.push(p);
    };
    await run({ "index.json": JSON.stringify({ problems: [problem({ code: "remote" })] }) });
    assert.equal(written?._pendingConflicts, 1);
    assert.deepEqual(saved, [], "conflicting work must wait for the user, not overwrite silently");
  });
});
