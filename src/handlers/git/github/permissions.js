/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * permissions.js — what a GitHub token is allowed to do, and what to say when
 * it isn't allowed to do it.
 *
 * A classic OAuth token reports its granted scopes in the `X-OAuth-Scopes`
 * response header of every API call. Reading that up front lets the UI offer
 * only the options the token can actually complete, instead of letting the user
 * pick something that fails with a bare "permission denied" three screens later.
 */

/**
 * Parses an `X-OAuth-Scopes` header into a set.
 * The header is a comma-separated list with optional spaces; an empty or absent
 * header means no scopes were granted (or the token is not an OAuth token).
 *
 * @param {string|null|undefined} header
 * @returns {Set<string>}
 */
export function parseScopes(header) {
  return new Set(
    String(header || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Reads the scopes GitHub actually granted this token.
 *
 * Returns null when the scopes cannot be determined — a GitHub App
 * user-to-server token omits the header entirely, as does a fine-grained PAT.
 * Callers must treat null as "unknown", not as "no permissions": guessing wrong
 * in that direction would hide options that work.
 *
 * @param {string} token
 * @returns {Promise<Set<string>|null>}
 */
export async function fetchTokenScopes(token) {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) return null;
  const header = res.headers.get("X-OAuth-Scopes");
  return header === null ? null : parseScopes(header);
}

/**
 * True when the token may create a private repository.
 *
 * `public_repo` deliberately excludes private repositories — creating one with
 * only that scope fails with a 403 that reads like an account problem. Unknown
 * scopes (null) return true so the option stays available; the request itself
 * remains the real check.
 *
 * @param {Set<string>|null} scopes
 */
export function canCreatePrivateRepo(scopes) {
  if (!scopes) return true;
  return scopes.has("repo");
}

/**
 * True when the token may push the Pages deploy workflow.
 * Committing any file under .github/workflows/ requires the `workflow` scope.
 *
 * @param {Set<string>|null} scopes
 */
export function canWriteWorkflows(scopes) {
  if (!scopes) return true;
  return scopes.has("workflow");
}

/** The scope string to request when the user wants private repositories. */
export const PRIVATE_SCOPE = "repo,workflow";

/** The scope string requested by default — public repositories only. */
export const PUBLIC_SCOPE = "public_repo,workflow";

/**
 * Turns a GitHub API failure into a sentence that names the cause and the fix.
 *
 * GitHub's own messages describe the API's view ("Resource not accessible by
 * integration"), which tells a user nothing about what to do next. Every branch
 * here ends in an action the user can take.
 *
 * @param {{status?: number, message?: string, body?: any}} err
 * @param {{action?: string, owner?: string, isPrivate?: boolean}} [context]
 * @returns {string}
 */
export function describeGitHubError(err, context = {}) {
  const status = err?.status;
  const raw = err?.body?.message || err?.message || "Unknown error";
  const action = context.action || "complete that request";
  const owner = context.owner;

  if (status === 401) {
    return "Your GitHub sign-in has expired. Disconnect and reconnect GitHub, then try again.";
  }

  if (status === 403) {
    // A GitHub App user-to-server token cannot reach the repository-creation
    // endpoints at all, whatever the user's account permissions are.
    if (/not accessible by integration/i.test(raw)) {
      return (
        "This GitHub connection was authorised as a GitHub App, which is not permitted to " +
        `${action}. Disconnect GitHub and reconnect — CodeLedger will re-authorise it correctly.`
      );
    }
    if (/rate limit/i.test(raw)) {
      return "GitHub's rate limit has been reached. Wait a few minutes and try again.";
    }
    if (context.isPrivate) {
      return (
        "The current GitHub connection only covers public repositories. " +
        "Choose a public repository, or reconnect GitHub and grant access to private repositories."
      );
    }
    return owner
      ? `GitHub refused the request: ${raw}. Check that you can create repositories under "${owner}".`
      : `GitHub refused the request: ${raw}.`;
  }

  if (status === 404) {
    return owner
      ? `GitHub could not find "${owner}". Check the owner name and that your connection has access to it.`
      : `GitHub could not find that resource: ${raw}.`;
  }

  if (status === 422) {
    const detail = err?.body?.errors?.[0]?.message || raw;
    return `GitHub rejected the request: ${detail}`;
  }

  if (status >= 500) {
    return "GitHub is having trouble right now. Wait a moment and try again.";
  }

  return raw;
}
