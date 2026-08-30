/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the backup routes.
 *
 * The thing worth pinning here is failure. Every one of these paths used to
 * catch, log and return normally, so "Backup now" printed "Backup committed to
 * GitHub." whether or not anything had been committed — and the automatic route
 * that runs after a solve could fail for months without saying so. The assertions
 * below are mostly about what happens when the commit does *not* work.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { Storage } from "../src/core/storage.js";
import {
  BACKUP_STATUS_KEY,
  backupFilePath,
  buildSnapshot,
  commitBackupToGitHub,
  fetchBackupSnapshot,
  maybeCommitRollingBackup,
  restoreSnapshot,
  saveLocalSnapshots,
} from "../src/core/backup/backup-manager.js";

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

/** A git handler that records its calls and can be told to fail. */
function fakeGit({ listing = [], commitError = null } = {}) {
  const commits = [];
  return {
    commits,
    async getContents(_owner, _repo, path) {
      if (path === "backups") return listing;
      const err = new Error(`404 ${path}`);
      // @ts-ignore — handlers attach status this way
      err.status = 404;
      throw err;
    },
    async commit(files, message, repo, opts) {
      if (commitError) throw commitError;
      commits.push({ files, message, repo, opts });
      return { ok: true };
    },
  };
}

const backupEntry = (name) => ({ type: "file", name, path: `backups/${name}` });

let real = {};
let settings = {};

beforeEach(() => {
  real = {
    getAllProblems: Storage.getAllProblems,
    getSettings: Storage.getSettings,
    updateSettings: Storage.updateSettings,
    getBehaviorBank: Storage.getBehaviorBank,
    getRoadmaps: Storage.getRoadmaps,
    updateRollingBackup: Storage.updateRollingBackup,
    addScheduledBackup: Storage.addScheduledBackup,
  };
  settings = {};
  Storage.getAllProblems = async () => [{ id: "lc-two-sum", title: "Two Sum" }];
  Storage.getSettings = async () => ({ ...settings });
  Storage.updateSettings = async (patch) => {
    const p = typeof patch === "function" ? patch(settings) : patch;
    settings = { ...settings, ...p };
    return { ...settings };
  };
  Storage.getBehaviorBank = async () => ({});
  Storage.getRoadmaps = async () => [];
  Storage.updateRollingBackup = async () => {};
  Storage.addScheduledBackup = async () => {};
});

afterEach(() => {
  Object.assign(Storage, real);
});

describe("commitBackupToGitHub", () => {
  test("reports what it committed instead of nothing", async () => {
    const git = fakeGit();
    const result = await commitBackupToGitHub("o", "r", git);
    assert.equal(result.problems, 1);
    assert.match(result.path, /^backups\/\d{4}-\d{2}-\d{2}T/);
    assert.equal(git.commits.length, 1);
  });

  test("throws when the commit fails, so a caller cannot claim success", async () => {
    const git = fakeGit({ commitError: new Error("401 Bad credentials") });
    await assert.rejects(() => commitBackupToGitHub("o", "r", git), /401 Bad credentials/);
  });

  test("records the failure where the panel can read it", async () => {
    const git = fakeGit({ commitError: new Error("403 rate limit exceeded") });
    await commitBackupToGitHub("o", "r", git).catch(() => {});
    const status = settings[BACKUP_STATUS_KEY]?.github;
    assert.equal(status.ok, false);
    assert.match(status.detail, /rate limit/);
    assert.ok(status.at > 0);
  });

  test("keeps exactly `keep` backups once the new one lands", async () => {
    // Four already there, keeping three: the new one plus the two newest
    // survivors, so exactly two of the old ones go.
    const listing = [
      "2024-01-01.json",
      "2024-02-01.json",
      "2024-03-01.json",
      "2024-04-01.json",
    ].map(backupEntry);
    const git = fakeGit({ listing });
    await commitBackupToGitHub("o", "r", git, 3);
    const { deletes } = git.commits[0].opts;
    assert.deepEqual(deletes, ["backups/2024-02-01.json", "backups/2024-01-01.json"]);
    assert.equal(listing.length - deletes.length + 1, 3);
  });

  test("prunes nothing when the backups directory does not exist yet", async () => {
    const git = fakeGit({ listing: null });
    await commitBackupToGitHub("o", "r", git);
    assert.deepEqual(git.commits[0].opts.deletes, []);
  });
});

describe("maybeCommitRollingBackup", () => {
  test("fires on the Nth solve, not before", async () => {
    settings = { githubBackupInterval: "3" };
    const git = fakeGit();
    for (let i = 0; i < 2; i++) await maybeCommitRollingBackup("o", "r", git);
    assert.equal(git.commits.length, 0);
    await maybeCommitRollingBackup("o", "r", git);
    assert.equal(git.commits.length, 1);
  });

  test("a failed attempt retries on the next solve rather than waiting a full interval", async () => {
    settings = { githubBackupInterval: "2" };
    const failing = fakeGit({ commitError: new Error("network down") });
    await maybeCommitRollingBackup("o", "r", failing); // 1
    await maybeCommitRollingBackup("o", "r", failing); // 2 — fires, fails, gives the count back
    const working = fakeGit();
    await maybeCommitRollingBackup("o", "r", working); // back to 2 — fires again
    assert.equal(working.commits.length, 1);
  });

  test("never throws into the solve path", async () => {
    settings = { githubBackupInterval: "1" };
    const git = fakeGit({ commitError: new Error("boom") });
    await maybeCommitRollingBackup("o", "r", git); // must resolve
  });

  test("does nothing when the user has switched it off", async () => {
    settings = { githubRollingBackups: false };
    const git = fakeGit();
    await maybeCommitRollingBackup("o", "r", git);
    assert.equal(git.commits.length, 0);
  });
});

describe("saveLocalSnapshots", () => {
  test("builds the snapshot once and files it in both places", async () => {
    const rolling = [];
    const scheduled = [];
    Storage.updateRollingBackup = async (s) => rolling.push(s);
    Storage.addScheduledBackup = async (s, t) => scheduled.push([s, t]);

    const snapshot = await saveLocalSnapshots({ scheduled: true, trigger: "on-solve" });
    assert.equal(rolling.length, 1);
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0][1], "on-solve");
    // The same object, not two independent reads of the whole database.
    assert.equal(rolling[0], scheduled[0][0]);
    assert.equal(rolling[0], snapshot);
  });

  test("a device that is out of room says so instead of failing silently", async () => {
    Storage.updateRollingBackup = async () => {
      throw new Error("QUOTA_BYTES quota exceeded");
    };
    const out = await saveLocalSnapshots();
    assert.equal(out, null);
    const status = settings[BACKUP_STATUS_KEY]?.local;
    assert.equal(status.ok, false);
    assert.match(status.detail, /quota exceeded/);
  });

  test("the status never travels inside a snapshot", async () => {
    // It is underscore-prefixed for this reason: it describes one device, and
    // restoring somebody else's would show a backup that never happened here.
    let captured = null;
    Storage.updateRollingBackup = async (s) => {
      captured = s;
    };
    settings = { [BACKUP_STATUS_KEY]: { local: { ok: true, at: 1, detail: "x" } } };
    await saveLocalSnapshots();
    assert.equal(captured.settings[BACKUP_STATUS_KEY], undefined);
  });
});

describe("fetchBackupSnapshot", () => {
  test("reads a snapshot back with its non-ASCII text intact", async () => {
    // atob alone turns "Café ✓" into mojibake and the mangled version is what
    // gets written back on the next commit, so the damage compounds.
    const snapshot = { version: 2, problems: [{ title: "Café — Nº 1 ✓ 🎯" }] };
    const git = {
      async getContents() {
        return { content: b64(JSON.stringify(snapshot)) };
      },
    };
    const out = await fetchBackupSnapshot("o", "r", "backups/x.json", git);
    assert.equal(out.problems[0].title, "Café — Nº 1 ✓ 🎯");
  });

  test("a missing or unreadable file is null, not a crash", async () => {
    const git = {
      async getContents() {
        return { content: "not base64 @@@" };
      },
    };
    assert.equal(await fetchBackupSnapshot("o", "r", "backups/x.json", git), null);
  });
});

describe("what a snapshot may carry", () => {
  // A backup file lives in the ledger repository and is handed around as a
  // file. Both halves used to run the same denylist — skip `_*`, "token",
  // "key", "secret" — which let two dangerous shapes through: `*_endpoint`,
  // which decides where solutions and API keys are posted, and `*_apiKey`,
  // because `includes("key")` is case-sensitive. Both now go through the
  // portability allow-list, which fails closed.

  test("does not write an endpoint override into the backup", async () => {
    settings = {
      theme_preset: "midnight",
      openai_endpoint: "https://gateway.example/v1",
      aiEndpoint: "https://gateway.example/v1",
    };
    const snap = await buildSnapshot();
    assert.equal(snap.settings.theme_preset, "midnight");
    assert.equal("openai_endpoint" in snap.settings, false);
    assert.equal("aiEndpoint" in snap.settings, false);
  });

  test("does not write a credential the old denylist spelled past", async () => {
    settings = { openai_apiKey: "sk-live-1", openai_keys: "sk-live-2", github_token: "ghp_x" };
    const snap = await buildSnapshot();
    assert.deepEqual(Object.keys(snap.settings), []);
  });

  test("a restored snapshot cannot set an endpoint override", async () => {
    // The attack: hand someone a backup, or edit one in a repo you can write
    // to, and every later AI review posts their code and their key to you.
    settings = {};
    await restoreSnapshot({
      settings: {
        theme_preset: "midnight",
        openai_endpoint: "https://evil.example/v1",
        aiEndpoint: "https://evil.example/v1",
      },
    });
    assert.equal(settings.theme_preset, "midnight");
    assert.equal(settings.openai_endpoint, undefined);
    assert.equal(settings.aiEndpoint, undefined);
  });

  test("a restored snapshot cannot introduce a credential", async () => {
    settings = {};
    await restoreSnapshot({ settings: { github_token: "ghp_evil", openai_keys: "sk-evil" } });
    assert.deepEqual(settings, {});
  });

  test("a restore still carries the preferences it is for", async () => {
    settings = {};
    await restoreSnapshot({
      settings: { theme_preset: "midnight", gamificationEnabled: true, github_repo: "r" },
    });
    assert.deepEqual(settings, {
      theme_preset: "midnight",
      gamificationEnabled: true,
      github_repo: "r",
    });
  });
});

describe("backupFilePath", () => {
  test("names files so a lexicographic sort is a chronological one", () => {
    const early = backupFilePath(new Date("2024-01-02T03:04:05Z"));
    const late = backupFilePath(new Date("2024-11-02T03:04:05Z"));
    assert.equal(early, "backups/2024-01-02T03-04-05.json");
    assert.equal(early.localeCompare(late) < 0, true);
  });
});
