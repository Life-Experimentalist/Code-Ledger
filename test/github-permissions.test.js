/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for GitHub token-scope handling and error explanation.
 *
 * These cover the failure that got CodeLedger rejected from the Chrome Web
 * Store: repository creation returned a bare 403, the UI printed "Permission
 * denied", and the reviewer had no way to tell what to do about it.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseScopes,
  canCreatePrivateRepo,
  canWriteWorkflows,
  canPagesServePrivateRepo,
  readAccountPlan,
  describeGitHubError,
} from "../src/handlers/git/github/permissions.js";

describe("parseScopes", () => {
  test("splits a comma-separated header and trims spaces", () => {
    assert.deepEqual([...parseScopes("public_repo, workflow")], ["public_repo", "workflow"]);
  });

  test("an empty header is no scopes, not one empty scope", () => {
    assert.equal(parseScopes("").size, 0);
    assert.equal(parseScopes(null).size, 0);
  });
});

describe("canCreatePrivateRepo", () => {
  test("public_repo alone cannot create a private repository", () => {
    assert.equal(canCreatePrivateRepo(parseScopes("public_repo,workflow")), false);
  });

  test("repo can", () => {
    assert.equal(canCreatePrivateRepo(parseScopes("repo,workflow")), true);
  });

  test("unknown scopes leave the option open rather than hiding a working feature", () => {
    assert.equal(canCreatePrivateRepo(null), true);
  });
});

describe("canWriteWorkflows", () => {
  test("committing under .github/workflows needs the workflow scope", () => {
    assert.equal(canWriteWorkflows(parseScopes("public_repo")), false);
    assert.equal(canWriteWorkflows(parseScopes("public_repo,workflow")), true);
  });
});

describe("readAccountPlan", () => {
  test("reads and normalises the plan name", () => {
    assert.equal(readAccountPlan({ plan: { name: "Pro" } }), "pro");
    assert.equal(readAccountPlan({ plan: { name: " free " } }), "free");
  });

  test("a body without a plan is unknown, not free", () => {
    // A token that cannot read private profile fields omits `plan` entirely.
    // Reading that as "free" would switch off Pages for paying users.
    assert.equal(readAccountPlan({ login: "octocat" }), null);
    assert.equal(readAccountPlan({ plan: {} }), null);
    assert.equal(readAccountPlan(null), null);
  });
});

describe("canPagesServePrivateRepo", () => {
  test("a free account cannot serve Pages from a private repository", () => {
    assert.equal(canPagesServePrivateRepo("free"), false);
  });

  test("the paid plans can", () => {
    for (const plan of ["pro", "team", "business", "enterprise"]) {
      assert.equal(canPagesServePrivateRepo(plan), true, plan);
    }
  });

  test("an unknown plan leaves the option open, like unknown scopes", () => {
    assert.equal(canPagesServePrivateRepo(null), true);
  });
});

describe("describeGitHubError", () => {
  const err = (status, message, body) => ({ status, message, body });

  test("names the GitHub App misconfiguration and its fix", () => {
    const out = describeGitHubError(
      err(403, "Resource not accessible by integration"),
      { action: "create repositories" },
    );
    assert.match(out, /GitHub App/);
    assert.match(out, /reconnect/i);
    // The raw API wording must not be the whole message.
    assert.ok(out.length > "Resource not accessible by integration".length);
  });

  test("explains a private-repo refusal in terms of the connection, not the account", () => {
    const out = describeGitHubError(err(403, "Forbidden"), { isPrivate: true });
    assert.match(out, /public repositories/);
    assert.match(out, /reconnect/i);
  });

  test("distinguishes a rate limit from a permission problem", () => {
    const out = describeGitHubError(err(403, "API rate limit exceeded for user"));
    assert.match(out, /rate limit/i);
    assert.doesNotMatch(out, /permission/i);
  });

  test("treats 401 as an expired sign-in", () => {
    assert.match(describeGitHubError(err(401, "Bad credentials")), /expired/i);
  });

  test("surfaces the specific 422 validation error, not the generic message", () => {
    const out = describeGitHubError(
      err(422, "Validation Failed", { errors: [{ message: "name already exists on this account" }] }),
    );
    assert.match(out, /name already exists on this account/);
  });

  test("names the owner on a 404 so the user knows what was not found", () => {
    assert.match(describeGitHubError(err(404, "Not Found"), { owner: "acme" }), /"acme"/);
  });

  test("does not blame the user for a GitHub outage", () => {
    assert.match(describeGitHubError(err(503, "Service Unavailable")), /try again/i);
  });

  test("falls through to the raw message for unclassified failures", () => {
    assert.equal(describeGitHubError(err(418, "I'm a teapot")), "I'm a teapot");
  });
});
