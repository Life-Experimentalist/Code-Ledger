/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the GitHub health check.
 *
 * The case that matters most is the one that got the extension rejected: a
 * GitHub App token, which reports no scopes and cannot create a repository.
 * The check must say so in words a person can act on, and must not claim to
 * know things it has not observed.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runHealthCheck, overallStatus } from "../src/core/health-check.js";

/** Builds a fetch stub from a map of URL substring → response descriptor. */
function stubFetch(routes) {
  return async (url) => {
    const hit = Object.keys(routes).find((k) => String(url).includes(k));
    if (!hit) throw new Error(`unstubbed request: ${url}`);
    const { status = 200, body = {}, scopes } = routes[hit];
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (name) =>
          name.toLowerCase() === "x-oauth-scopes" && scopes !== undefined ? scopes : null,
      },
      json: async () => body,
    };
  };
}

const OK_USER = { login: "octocat" };
const OK_REPO = { permissions: { push: true }, private: false };
const OK_COMMITS = [
  {
    commit: {
      message: "[solved] Two Sum (Python3) — Arrays\n\nbody",
      committer: { date: "2026-08-10T10:00:00Z" },
    },
  },
];

function byId(results, id) {
  return results.find((r) => r.id === id);
}

describe("runHealthCheck", () => {
  test("no token fails the first check and skips the rest", async () => {
    const results = await runHealthCheck({ fetchImpl: stubFetch({}) });
    assert.equal(byId(results, "token").status, "fail");
    for (const id of ["scopes", "repo", "commit"]) {
      assert.equal(byId(results, id).status, "skipped");
    }
  });

  test("a healthy classic OAuth token passes everything", async () => {
    const results = await runHealthCheck({
      token: "t",
      owner: "octocat",
      repo: "ledger",
      fetchImpl: stubFetch({
        "/user": { body: OK_USER, scopes: "public_repo, workflow" },
        "/repos/octocat/ledger/commits": { body: OK_COMMITS },
        "/repos/octocat/ledger": { body: OK_REPO },
      }),
    });
    assert.equal(overallStatus(results), "ok");
    assert.match(byId(results, "scopes").detail, /public_repo/);
    assert.match(byId(results, "commit").detail, /Two Sum/);
    // The first line of the message only — a commit body is not a status line.
    assert.doesNotMatch(byId(results, "commit").detail, /body/);
  });

  test("a token reporting no scopes is a warning, not a failure", async () => {
    // A GitHub App token and a fine-grained PAT are indistinguishable here.
    // Calling it a failure would be wrong for one of them.
    const results = await runHealthCheck({
      token: "t",
      owner: "octocat",
      repo: "ledger",
      fetchImpl: stubFetch({
        "/user": { body: OK_USER },
        "/repos/octocat/ledger/commits": { body: OK_COMMITS },
        "/repos/octocat/ledger": { body: OK_REPO },
      }),
    });
    const scopes = byId(results, "scopes");
    assert.equal(scopes.status, "warn");
    assert.match(scopes.detail, /GitHub App/);
    assert.match(scopes.detail, /403/);
  });

  test("a missing workflow scope is called out without failing the run", async () => {
    const results = await runHealthCheck({
      token: "t",
      owner: "octocat",
      repo: "ledger",
      fetchImpl: stubFetch({
        "/user": { body: OK_USER, scopes: "public_repo" },
        "/repos/octocat/ledger/commits": { body: OK_COMMITS },
        "/repos/octocat/ledger": { body: OK_REPO },
      }),
    });
    assert.equal(byId(results, "scopes").status, "warn");
    assert.match(byId(results, "scopes").fix, /workflow/);
    assert.equal(overallStatus(results), "warn");
  });

  test("an expired token fails and says to reconnect", async () => {
    const results = await runHealthCheck({
      token: "t",
      owner: "octocat",
      repo: "ledger",
      fetchImpl: stubFetch({
        "/user": { status: 401 },
        "/repos/octocat/ledger/commits": { body: OK_COMMITS },
        "/repos/octocat/ledger": { body: OK_REPO },
      }),
    });
    assert.equal(byId(results, "scopes").status, "fail");
    assert.match(byId(results, "scopes").fix, /connect again/i);
  });

  test("the owner falls back to the signed-in user when settings have none", async () => {
    const results = await runHealthCheck({
      token: "t",
      repo: "ledger",
      fetchImpl: stubFetch({
        "/user": { body: OK_USER, scopes: "repo,workflow" },
        "/repos/octocat/ledger/commits": { body: OK_COMMITS },
        "/repos/octocat/ledger": { body: OK_REPO },
      }),
    });
    assert.equal(byId(results, "repo").status, "ok");
    assert.match(byId(results, "repo").detail, /octocat\/ledger/);
  });

  test("no repository set fails the repo check and skips the commit check", async () => {
    const results = await runHealthCheck({
      token: "t",
      fetchImpl: stubFetch({ "/user": { body: OK_USER, scopes: "repo,workflow" } }),
    });
    assert.equal(byId(results, "repo").status, "fail");
    assert.equal(byId(results, "commit").status, "skipped");
  });

  test("a 404 on the repository does not claim the repository is missing", async () => {
    // It is equally likely that the token cannot see it, and telling someone to
    // recreate a repository they already have is the worse of the two errors.
    const results = await runHealthCheck({
      token: "t",
      owner: "octocat",
      repo: "ledger",
      fetchImpl: stubFetch({
        "/user": { body: OK_USER, scopes: "public_repo,workflow" },
        "/repos/octocat/ledger": { status: 404 },
      }),
    });
    assert.equal(byId(results, "repo").status, "fail");
    assert.match(byId(results, "repo").detail, /does not exist, or this token cannot read it/);
    assert.equal(byId(results, "commit").status, "skipped");
  });

  test("a readable but unwritable repository fails", async () => {
    const results = await runHealthCheck({
      token: "t",
      owner: "someone-else",
      repo: "ledger",
      fetchImpl: stubFetch({
        "/user": { body: OK_USER, scopes: "public_repo,workflow" },
        "/repos/someone-else/ledger/commits": { body: OK_COMMITS },
        "/repos/someone-else/ledger": { body: { permissions: { push: false } } },
      }),
    });
    assert.equal(byId(results, "repo").status, "fail");
    assert.equal(overallStatus(results), "fail");
  });

  test("an empty repository is a warning with a way out", async () => {
    const results = await runHealthCheck({
      token: "t",
      owner: "octocat",
      repo: "ledger",
      fetchImpl: stubFetch({
        "/user": { body: OK_USER, scopes: "public_repo,workflow" },
        "/repos/octocat/ledger/commits": { status: 409 },
        "/repos/octocat/ledger": { body: OK_REPO },
      }),
    });
    assert.equal(byId(results, "commit").status, "warn");
    assert.match(byId(results, "commit").fix, /Force sync/);
  });

  test("a network failure is reported as unknown, not as a broken account", async () => {
    const results = await runHealthCheck({
      token: "t",
      owner: "octocat",
      repo: "ledger",
      fetchImpl: async () => {
        throw new Error("Failed to fetch");
      },
    });
    assert.equal(byId(results, "scopes").status, "warn");
    assert.match(byId(results, "scopes").detail, /Failed to fetch/);
    assert.notEqual(overallStatus(results), "fail");
  });
});

describe("overallStatus", () => {
  test("the worst result wins", () => {
    assert.equal(overallStatus([{ status: "ok" }, { status: "warn" }, { status: "fail" }]), "fail");
    assert.equal(overallStatus([{ status: "ok" }, { status: "warn" }]), "warn");
    assert.equal(overallStatus([{ status: "ok" }]), "ok");
  });

  test("a skipped check never decides the headline", () => {
    assert.equal(overallStatus([{ status: "ok" }, { status: "skipped" }]), "ok");
  });
});
