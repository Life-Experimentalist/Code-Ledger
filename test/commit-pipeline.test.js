/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Integration tests for the commit pipeline.
 *
 * These drive the real GitHubHandler against a fake GitHub API, so they cover
 * the sequence that actually lands a user's solution — resolve HEAD, build the
 * tree, create the commit, advance the ref — including the failure modes that
 * previously lost commits silently.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GitHubHandler } from "../src/handlers/git/github/index.js";
import { Storage } from "../src/core/storage.js";
import { buildTreeItems, buildCommitPayload } from "../src/handlers/git/github/commit-builder.js";

/* ── Fake GitHub ──────────────────────────────────────────────────────────── */

/**
 * A minimal in-memory GitHub. `overrides` maps "METHOD /path-suffix" to either a
 * Response-shaped object or a function, letting a test bend one endpoint while
 * every other call still behaves.
 */
function fakeGitHub(overrides = {}) {
  const calls = [];
  const state = { repoExists: true, refSha: "a".repeat(40), createdRepo: null, treeItems: null };

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const handler = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const path = new URL(url).pathname;
    const key = `${method} ${path}`;
    calls.push({ method, path, body: init.body ? JSON.parse(init.body) : null });

    for (const [pattern, impl] of Object.entries(overrides)) {
      const [m, suffix] = pattern.split(" ");
      if (m === method && path.endsWith(suffix)) {
        return typeof impl === "function" ? impl(calls.at(-1), state, json) : impl;
      }
    }

    if (key === "GET /user") return json({ login: "octocat", name: "Octo Cat" });

    if (method === "GET" && path.includes("/git/ref/heads/")) {
      return state.repoExists
        ? json({ object: { sha: state.refSha } })
        : json({ message: "Not Found" }, 404);
    }
    if (method === "POST" && (path === "/user/repos" || path.endsWith("/repos"))) {
      state.createdRepo = calls.at(-1).body;
      state.repoExists = true;
      return json({ name: state.createdRepo.name, owner: { login: "octocat" } });
    }
    if (method === "GET" && path.includes("/git/commits/")) {
      return json({ tree: { sha: "t".repeat(40) } });
    }
    if (method === "POST" && path.endsWith("/git/trees")) {
      state.treeItems = calls.at(-1).body.tree;
      return json({ sha: "n".repeat(40) });
    }
    if (method === "POST" && path.endsWith("/git/commits")) {
      return json({ sha: "c".repeat(40) });
    }
    if (method === "PATCH" && path.includes("/git/refs/heads/")) {
      state.refSha = calls.at(-1).body.sha;
      return json({ object: { sha: state.refSha } });
    }
    if (method === "PATCH" || method === "PUT" || method === "POST") return json({});

    return json({ message: "unhandled: " + key }, 404);
  };

  return { handler, calls, state };
}

/* ── Harness ──────────────────────────────────────────────────────────────── */

let realFetch;
let realGetSettings;
let realGetAuthToken;
let realSetTimeout;

function useSettings(settings) {
  Storage.getSettings = async () => settings;
}

beforeEach(() => {
  realFetch = globalThis.fetch;
  realGetSettings = Storage.getSettings;
  realGetAuthToken = Storage.getAuthToken;
  realSetTimeout = globalThis.setTimeout;
  // The handler's backoff waits are real seconds. They are the thing under test
  // only in that they happen at all, so collapse them and keep the suite fast.
  globalThis.setTimeout = (fn) => realSetTimeout(fn, 0);
  Storage.getAuthToken = async () => "gho_testtoken";
  useSettings({ github_repo: "CodeLedger-Sync" });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.setTimeout = realSetTimeout;
  Storage.getSettings = realGetSettings;
  Storage.getAuthToken = realGetAuthToken;
});

/** Installs the fake and returns it. */
function install(overrides) {
  const gh = fakeGitHub(overrides);
  globalThis.fetch = gh.handler;
  return gh;
}

const FILES = [{ path: "problems/lc-two-sum/lc-two-sum.py", content: "print(1)" }];

/* ── Tests ────────────────────────────────────────────────────────────────── */

describe("commit pipeline — happy path", () => {
  test("performs the Trees API sequence and advances the branch", async () => {
    const gh = install();
    const sha = await new GitHubHandler().commit(FILES, "Solved Two Sum", "CodeLedger-Sync", {
      skipInfra: true,
    });

    assert.equal(sha, "c".repeat(40));
    const sequence = gh.calls.map((c) => `${c.method} ${c.path.split("/").pop()}`);
    assert.ok(sequence.includes("POST trees"), "must create a tree");
    assert.ok(sequence.includes("POST commits"), "must create a commit");
    assert.equal(gh.state.refSha, "c".repeat(40), "branch must point at the new commit");
  });

  test("sends the solution file as tree content", async () => {
    const gh = install();
    await new GitHubHandler().commit(FILES, "msg", "CodeLedger-Sync", { skipInfra: true });
    const item = gh.state.treeItems.find((t) => t.path === FILES[0].path);
    assert.ok(item, "the solution file must reach the tree");
    assert.equal(item.content, "print(1)");
    assert.equal(item.mode, "100644");
  });

  test("uses the legacy gitRepo key when github_repo is unset", async () => {
    useSettings({ gitRepo: "Legacy-Repo" });
    const gh = install();
    await new GitHubHandler().commit(FILES, "msg", null, { skipInfra: true });
    assert.ok(
      gh.calls.some((c) => c.path.includes("/Legacy-Repo/")),
      "a legacy user's commits must not be redirected to the default repo name",
    );
  });
});

describe("commit pipeline — repository auto-creation", () => {
  test("creates a public repository by default", async () => {
    const gh = fakeGitHub();
    gh.state.repoExists = false;
    globalThis.fetch = gh.handler;

    await new GitHubHandler().commit(FILES, "msg", "New-Repo", { skipInfra: true });

    assert.equal(gh.state.createdRepo.name, "New-Repo");
    // public_repo — the default OAuth scope — cannot create a private repo.
    assert.equal(gh.state.createdRepo.private, false);
  });

  test("creates a private repository only when explicitly enabled", async () => {
    useSettings({ github_repo: "New-Repo", github_repo_private: true });
    const gh = fakeGitHub();
    gh.state.repoExists = false;
    globalThis.fetch = gh.handler;

    await new GitHubHandler().commit(FILES, "msg", "New-Repo", { skipInfra: true });
    assert.equal(gh.state.createdRepo.private, true);
  });

  test("bootstraps an externally created empty repository with a root commit", async () => {
    // The repo exists on github.com but has no commits: the ref lookup 404s
    // and createRepository 422s "name already exists". Before the root-commit
    // path existed this combination failed every commit forever.
    const gh = install({
      "POST /user/repos": (_c, _s, json) =>
        json({ message: "name already exists on this account" }, 422),
    });
    gh.state.repoExists = false;

    const sha = await new GitHubHandler().commit(FILES, "msg", "CodeLedger-Sync", {
      skipInfra: true,
    });
    assert.equal(sha, "c".repeat(40));

    const commitCall = gh.calls.find((c) => c.method === "POST" && c.path.endsWith("/git/commits"));
    assert.deepEqual(commitCall.body.parents, [], "a root commit has no parents");
    const treeCall = gh.calls.find((c) => c.method === "POST" && c.path.endsWith("/git/trees"));
    assert.ok(!("base_tree" in treeCall.body), "a root tree carries no base_tree");
    assert.ok(
      gh.calls.some((c) => c.method === "POST" && c.path.endsWith("/git/refs")),
      "the branch must be created, not patched",
    );
  });

  test("a non-422 repository-creation failure still propagates", async () => {
    const gh = install({
      "POST /user/repos": (_c, _s, json) => json({ message: "Forbidden" }, 403),
    });
    gh.state.repoExists = false;
    await assert.rejects(
      () => new GitHubHandler().commit(FILES, "msg", "CodeLedger-Sync", { skipInfra: true }),
      /403/,
    );
  });

  test("a failure to apply cosmetic repo settings does not lose the commit", async () => {
    const gh = fakeGitHub({
      "PATCH /CodeLedger-Sync": () =>
        new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 }),
    });
    gh.state.repoExists = false;
    globalThis.fetch = gh.handler;

    const sha = await new GitHubHandler().commit(FILES, "msg", "CodeLedger-Sync", {
      skipInfra: true,
    });
    assert.equal(sha, "c".repeat(40));
  });
});

describe("commit pipeline — failures surface, they do not vanish", () => {
  test("a 401 propagates to the caller", async () => {
    install({
      "GET /user": () => new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }),
    });
    await assert.rejects(
      () => new GitHubHandler().commit(FILES, "msg", "CodeLedger-Sync", { skipInfra: true }),
      /401/,
    );
  });

  test("an unauthenticated handler refuses to commit", async () => {
    Storage.getAuthToken = async () => "";
    install();
    await assert.rejects(
      () => new GitHubHandler().commit(FILES, "msg", "CodeLedger-Sync", { skipInfra: true }),
      /Not authenticated/,
    );
  });

  test("falls back to the settings PAT when no OAuth token is stored", async () => {
    // The documented contract: OAuth first, then settings.github_token.
    Storage.getAuthToken = async () => "";
    useSettings({ github_repo: "CodeLedger-Sync", github_token: "ghp_manualpat" });
    install();
    const sha = await new GitHubHandler().commit(FILES, "msg", "CodeLedger-Sync", {
      skipInfra: true,
    });
    assert.equal(sha, "c".repeat(40));
  });

  test("retries a non-fast-forward ref update instead of dropping the commit", async () => {
    let refAttempts = 0;
    const gh = install({
      "PATCH /main": (_call, state, json) => {
        refAttempts += 1;
        if (refAttempts === 1) return json({ message: "Update is not a fast forward" }, 422);
        state.refSha = "c".repeat(40);
        return json({ object: { sha: state.refSha } });
      },
    });

    const sha = await new GitHubHandler().commit(FILES, "msg", "CodeLedger-Sync", {
      skipInfra: true,
    });
    assert.equal(sha, "c".repeat(40));
    assert.equal(refAttempts, 2, "the second attempt must rebuild on a fresh parent");
    assert.equal(gh.calls.filter((c) => c.path.endsWith("/git/trees")).length, 2);
  });

  test("gives up after three non-fast-forward attempts rather than looping", async () => {
    install({
      "PATCH /main": (_c, _s, json) => json({ message: "Update is not a fast forward" }, 422),
    });
    await assert.rejects(
      () => new GitHubHandler().commit(FILES, "msg", "CodeLedger-Sync", { skipInfra: true }),
      /422/,
    );
  });
});

describe("commit payload assembly", () => {
  test("omits parents for a root commit so an empty repo can be initialised", () => {
    const payload = buildCommitPayload("init", "t1", null);
    assert.deepEqual(payload.parents, []);
  });

  test("an unparseable scraped timestamp does not abort the commit", () => {
    const payload = buildCommitPayload("msg", "t1", "p1", { date: "not a date" });
    assert.equal(payload.author, undefined, "no author block rather than a thrown RangeError");
    assert.deepEqual(payload.parents, ["p1"]);
  });

  test("backdates author and committer together", () => {
    const payload = buildCommitPayload("msg", "t1", "p1", { date: "2024-01-02T03:04:05Z" }, {
      login: "octocat",
    });
    assert.equal(payload.author.date, "2024-01-02T03:04:05.000Z");
    assert.deepEqual(payload.committer, payload.author);
  });

  test("represents deletions as sha:null", () => {
    const items = buildTreeItems([], ["problems/old/file.py"]);
    assert.equal(items.length, 1);
    assert.equal(items[0].sha, null);
    assert.equal(items[0].content, undefined);
  });

  test("prefers an existing blob sha over inline content", () => {
    const items = buildTreeItems([{ path: "a.py", content: "x", sha: "b".repeat(40) }]);
    assert.equal(items[0].sha, "b".repeat(40));
    assert.equal(items[0].content, undefined);
  });

  test("rejects a file with no usable content instead of building a doomed tree", () => {
    // undefined content produced a tree entry with neither `content` nor `sha`,
    // which GitHub rejects with a bare 422 far from the real cause.
    assert.throws(() => buildTreeItems([{ path: "a.py" }]), /Invalid commit file: "a\.py"/);
    assert.throws(() => buildTreeItems([{ content: "x" }]), /Invalid commit file/);
    assert.throws(() => buildTreeItems([{ path: "", content: "x" }]), /Invalid commit file/);
  });
});
