/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * health-check.js — answers "what state am I actually in?" for the GitHub side
 * of the extension.
 *
 * This exists because of a store rejection. A reviewer tried to create a
 * repository, got a 403, and had no way to tell whether the problem was their
 * account, their token, the repository name, or the extension. Each of those has
 * a different fix, and the UI said "permission denied" to all four.
 *
 * The checks run in order and stop asking questions that no longer make sense: a
 * missing token makes the repository check meaningless, so it is reported as
 * skipped rather than failed. Every result carries a `fix` when there is
 * something the user can do, and no result invents a cause it has not observed —
 * a token that does not report scopes is `unknown`, not `fail`, because a
 * fine-grained PAT is a legitimate way to run this.
 *
 * Pure apart from the `fetch` it is handed, so the whole thing is testable
 * without a network or a browser.
 */

import { parseScopes } from "../handlers/git/github/permissions.js";
import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("HealthCheck");

/** @typedef {"ok"|"warn"|"fail"|"skipped"} CheckStatus */

/**
 * @typedef {object} CheckResult
 * @property {string} id
 * @property {string} label
 * @property {CheckStatus} status
 * @property {string} detail   What was observed.
 * @property {string} [fix]    What to do about it, when there is something.
 */

const GITHUB_API = "https://api.github.com";

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Runs every check and returns the results in reading order.
 *
 * @param {object} deps
 * @param {string} [deps.token]        The GitHub token to test.
 * @param {string} [deps.tokenSource]  Where it came from, for the user's benefit.
 * @param {string} [deps.owner]        Resolved repository owner.
 * @param {string} [deps.repo]         Resolved repository name.
 * @param {typeof fetch} [deps.fetchImpl]
 * @returns {Promise<CheckResult[]>}
 */
export async function runHealthCheck({
  token = "",
  tokenSource = "",
  owner = "",
  repo = "",
  fetchImpl = fetch,
} = {}) {
  /** @type {CheckResult[]} */
  const results = [];

  if (!token) {
    results.push({
      id: "token",
      label: "GitHub sign-in",
      status: "fail",
      detail: "No GitHub token is stored.",
      fix: "Open Settings → Git and connect GitHub.",
    });
    for (const [id, label] of [
      ["scopes", "Token type and permissions"],
      ["repo", "Repository"],
      ["commit", "Last commit"],
    ]) {
      results.push({
        id,
        label,
        status: "skipped",
        detail: "Not checked — there is no token to check with.",
      });
    }
    return results;
  }

  results.push({
    id: "token",
    label: "GitHub sign-in",
    status: "ok",
    detail: tokenSource ? `A token is stored (${tokenSource}).` : "A token is stored.",
  });

  // ── Token type and scopes ───────────────────────────────────────────────────
  let user = null;
  /** @type {Set<string>|null} */
  let scopes = null;
  try {
    const res = await fetchImpl(`${GITHUB_API}/user`, { headers: ghHeaders(token) });
    if (res.status === 401) {
      results.push({
        id: "scopes",
        label: "Token type and permissions",
        status: "fail",
        detail: "GitHub rejected the token (401). It has expired or been revoked.",
        fix: "Disconnect GitHub in Settings → Git and connect again.",
      });
    } else if (!res.ok) {
      results.push({
        id: "scopes",
        label: "Token type and permissions",
        status: "warn",
        detail: `GitHub answered ${res.status} when asked who this token belongs to.`,
        fix: "If this persists, wait a few minutes — GitHub may be rate-limiting or degraded.",
      });
    } else {
      user = await res.json().catch(() => null);
      const header = res.headers.get("X-OAuth-Scopes");
      scopes = header === null ? null : parseScopes(header);
      if (scopes === null) {
        results.push({
          id: "scopes",
          label: "Token type and permissions",
          status: "warn",
          detail:
            "This token reports no scopes. That means it is a GitHub App token or a " +
            "fine-grained PAT rather than a classic OAuth token. A fine-grained PAT is " +
            "fine if it grants contents write on the repository; a GitHub App token " +
            "cannot create repositories at all and fails with 403.",
          fix: "If repository creation fails, disconnect GitHub and connect again.",
        });
      } else if (scopes.has("repo") || scopes.has("public_repo")) {
        const list = [...scopes].join(", ");
        results.push({
          id: "scopes",
          label: "Token type and permissions",
          status: scopes.has("workflow") ? "ok" : "warn",
          detail: `Classic OAuth token, granted: ${list}.`,
          fix: scopes.has("workflow")
            ? undefined
            : "Without `workflow`, the daily badge-refresh workflow cannot be committed. Reconnect GitHub to grant it.",
        });
      } else {
        results.push({
          id: "scopes",
          label: "Token type and permissions",
          status: "fail",
          detail: `This token grants ${[...scopes].join(", ") || "nothing"} — no repository access.`,
          fix: "Disconnect GitHub in Settings → Git and connect again.",
        });
      }
    }
  } catch (e) {
    dbg.warn("scope check failed:", e?.message || e);
    results.push({
      id: "scopes",
      label: "Token type and permissions",
      status: "warn",
      detail: `Could not reach GitHub: ${e?.message || "network error"}.`,
      fix: "Check your connection and run the check again.",
    });
  }

  // ── Repository ──────────────────────────────────────────────────────────────
  const resolvedOwner = owner || user?.login || "";
  if (!resolvedOwner || !repo) {
    results.push({
      id: "repo",
      label: "Repository",
      status: "fail",
      detail: repo ? `Repository "${repo}" has no owner resolved.` : "No target repository is set.",
      fix: "Open Settings → Git and choose or create a repository.",
    });
    results.push({
      id: "commit",
      label: "Last commit",
      status: "skipped",
      detail: "Not checked — there is no repository to look in.",
    });
    return results;
  }

  const fullName = `${resolvedOwner}/${repo}`;
  let repoData = null;
  try {
    const res = await fetchImpl(`${GITHUB_API}/repos/${fullName}`, { headers: ghHeaders(token) });
    if (res.status === 404) {
      results.push({
        id: "repo",
        label: "Repository",
        status: "fail",
        detail: `GitHub cannot see ${fullName}. Either it does not exist, or this token cannot read it.`,
        fix: "Check the owner and name in Settings → Git. If the repository is private, the connection needs the `repo` scope.",
      });
    } else if (!res.ok) {
      results.push({
        id: "repo",
        label: "Repository",
        status: "warn",
        detail: `GitHub answered ${res.status} for ${fullName}.`,
      });
    } else {
      repoData = await res.json().catch(() => null);
      const writable = repoData?.permissions?.push === true;
      results.push({
        id: "repo",
        label: "Repository",
        status: writable ? "ok" : "fail",
        detail: writable
          ? `${fullName} exists and this token can write to it${repoData?.private ? " (private)" : ""}.`
          : `${fullName} exists but this token cannot push to it.`,
        fix: writable
          ? undefined
          : "Use a repository you own, or reconnect GitHub with access to this one.",
      });
    }
  } catch (e) {
    dbg.warn("repo check failed:", e?.message || e);
    results.push({
      id: "repo",
      label: "Repository",
      status: "warn",
      detail: `Could not reach GitHub: ${e?.message || "network error"}.`,
    });
  }

  // ── Last commit ─────────────────────────────────────────────────────────────
  if (!repoData) {
    results.push({
      id: "commit",
      label: "Last commit",
      status: "skipped",
      detail: "Not checked — the repository could not be read.",
    });
    return results;
  }

  try {
    const res = await fetchImpl(`${GITHUB_API}/repos/${fullName}/commits?per_page=1`, {
      headers: ghHeaders(token),
    });
    if (res.status === 409) {
      // GitHub's answer for an empty repository.
      results.push({
        id: "commit",
        label: "Last commit",
        status: "warn",
        detail: "The repository is empty — nothing has been committed yet.",
        fix: "Solve a problem, or use Force sync in Advanced to push what you already have.",
      });
    } else if (!res.ok) {
      results.push({
        id: "commit",
        label: "Last commit",
        status: "warn",
        detail: `GitHub answered ${res.status} when asked for the latest commit.`,
      });
    } else {
      const [latest] = (await res.json().catch(() => [])) || [];
      const when = latest?.commit?.committer?.date || latest?.commit?.author?.date || "";
      const message = String(latest?.commit?.message || "").split("\n")[0];
      results.push({
        id: "commit",
        label: "Last commit",
        status: latest ? "ok" : "warn",
        detail: latest
          ? `${message || "(no message)"}${when ? ` — ${when}` : ""}`
          : "The repository has no commits yet.",
        fix: latest
          ? undefined
          : "Solve a problem, or use Force sync in Advanced to push what you already have.",
      });
    }
  } catch (e) {
    dbg.warn("commit check failed:", e?.message || e);
    results.push({
      id: "commit",
      label: "Last commit",
      status: "warn",
      detail: `Could not reach GitHub: ${e?.message || "network error"}.`,
    });
  }

  return results;
}

/**
 * The single word for a whole run: the worst thing in it.
 * `skipped` never wins — it describes a check that was not run, and something
 * earlier in the list is already reporting why.
 *
 * @param {CheckResult[]} results
 * @returns {CheckStatus}
 */
export function overallStatus(results = []) {
  if (results.some((r) => r.status === "fail")) return "fail";
  if (results.some((r) => r.status === "warn")) return "warn";
  return results.length ? "ok" : "skipped";
}
