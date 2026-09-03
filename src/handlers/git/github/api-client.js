/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * api-client.js — Low-level GitHub REST API wrapper.
 *
 * All functions are pure I/O: they receive a token, make one HTTP call
 * (with automatic retry on rate-limits and transient server errors),
 * and return the parsed JSON or throw with err.status set.
 *
 * @ts-check
 */

import { CONSTANTS } from "../../../core/constants.js";
import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("GitHubAPI");

const API_BASE = CONSTANTS.GIT_PROVIDERS.github.apiBase;

/**
 * Make an authenticated GitHub API call.
 * Retries once on 5xx / 408 (1 s backoff) and on 429 (Retry-After header).
 *
 * @param {string} url     Absolute URL or path relative to API_BASE
 * @param {string} token   OAuth / PAT token
 * @param {object} [opts]  Fetch options (method, body, headers, …)
 * @param {number} [_left] Internal retry counter — do not pass externally
 */
export async function apiFetch(url, token, opts = {}, _left = 2) {
  const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;
  const method = (opts.method || "GET").toUpperCase();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(opts.headers || {}),
  };
  if (["POST", "PATCH", "PUT"].includes(method) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let res;
  try {
    res = await fetch(fullUrl, { ...opts, method, headers });
  } catch (e) {
    dbg.error(`fetch ${method} ${fullUrl} network error:`, e.message);
    throw e;
  }

  // Rate-limit — wait for Retry-After then retry.
  // GitHub signals the secondary limit as 429 but the primary limit as 403 with
  // x-ratelimit-remaining: 0. Without that second check a rate-limited call is
  // indistinguishable from a permissions failure and gets reported as one.
  const exhausted = res.headers.get("x-ratelimit-remaining") === "0";
  if ((res.status === 429 || (res.status === 403 && exhausted)) && _left > 0) {
    const wait = _retryAfterSeconds(res);
    dbg.warn(`rate-limited (${res.status}) — waiting ${wait}s then retrying (${_left} left)`);
    await _sleep(wait * 1000);
    return apiFetch(url, token, opts, _left - 1);
  }

  // Transient server error — one quick retry
  if ((res.status >= 500 || res.status === 408) && _left > 0) {
    dbg.warn(`server error ${res.status} — retrying in 1 s (${_left} left)`);
    await _sleep(1000);
    return apiFetch(url, token, opts, _left - 1);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(`GitHub ${res.status}: ${body.message || res.statusText}`);
    err.status = res.status;
    // The parsed body carries the detail that matters for 422 (body.errors[])
    // and for telling a GitHub App refusal apart from a genuine one. Attaching
    // it lets describeGitHubError() explain the failure instead of echoing it.
    err.body = body;
    dbg.error(`${method} ${fullUrl} → ${res.status}:`, err.message);
    throw err;
  }

  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

/**
 * Seconds to wait before retrying, from Retry-After (delta seconds) or
 * x-ratelimit-reset (absolute epoch seconds). Capped at 60 s: a longer wait
 * would outlive the service worker, and the caller retries anyway.
 */
function _retryAfterSeconds(res) {
  const retryAfter = parseInt(res.headers.get("Retry-After") || "", 10);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter, 60);

  const reset = parseInt(res.headers.get("x-ratelimit-reset") || "", 10);
  if (Number.isFinite(reset)) {
    const delta = Math.ceil(reset - Date.now() / 1000);
    if (delta > 0) return Math.min(delta, 60);
  }
  return 2;
}

function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── User ──────────────────────────────────────────────────────────────────────

/** GET /user — current authenticated user */
export function getCurrentUser(token) {
  return apiFetch("/user", token);
}

// ── Refs / commits / trees ────────────────────────────────────────────────────

/** GET branch ref → { object: { sha } } */
export function getRepoRef(owner, repo, branch, token) {
  return apiFetch(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, token);
}

/** GET a git commit object → { tree: { sha } } */
export function getCommit(owner, repo, sha, token) {
  return apiFetch(`/repos/${owner}/${repo}/git/commits/${sha}`, token);
}

/** POST /git/trees → { sha } */
export function createTree(owner, repo, treeItems, baseTreeSha, token) {
  // A root commit has no base tree, and GitHub rejects an explicit null —
  // the field must be absent entirely.
  const body = baseTreeSha ? { base_tree: baseTreeSha, tree: treeItems } : { tree: treeItems };
  return apiFetch(`/repos/${owner}/${repo}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** POST /git/commits → { sha } */
export function createCommit(owner, repo, payload, token) {
  return apiFetch(`/repos/${owner}/${repo}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** PATCH /git/refs/heads/{branch} → advance branch pointer */
export function updateRef(owner, repo, branch, sha, token) {
  return apiFetch(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, {
    method: "PATCH",
    body: JSON.stringify({ sha }),
  });
}

/** POST /git/refs — create a branch that does not exist yet (root commit path).
 *  PATCH 404s on an empty repository because there is no ref to move. */
export function createRef(owner, repo, branch, sha, token) {
  return apiFetch(`/repos/${owner}/${repo}/git/refs`, token, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  });
}

/** POST /git/blobs — store a binary blob, returns { sha } */
export function createBlob(owner, repo, base64Content, token) {
  return apiFetch(`/repos/${owner}/${repo}/git/blobs`, token, {
    method: "POST",
    body: JSON.stringify({ content: base64Content, encoding: "base64" }),
  });
}

/**
 * Encode a JS string as the base64 the GitHub Contents API expects.
 * btoa() alone throws on any character above U+00FF, so the string is
 * flattened to UTF-8 bytes first.
 *
 * @param {string} str
 * @returns {string} base64
 */
export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  // String.fromCharCode(...bytes) overruns the argument limit on a large file.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(binary);
}

/** PUT /repos/{owner}/{repo}/contents/{path} — write one file as its own commit.
 *  Only for bootstrapping a repository that has no commits yet; every other
 *  write goes through the Trees API so that one solve stays one commit. */
export function putContentsFile(owner, repo, path, content, message, branch, token) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return apiFetch(`/repos/${owner}/${repo}/contents/${encoded}`, token, {
    method: "PUT",
    body: JSON.stringify({ message, content: utf8ToBase64(content), branch }),
  });
}

/**
 * Give a repository that has never been committed to a HEAD, and return its SHA.
 *
 * Such a repository rejects every git-data write, not only the ref lookup:
 * POST /git/blobs and POST /git/trees both answer 409 "Git Repository is
 * empty". The Trees API therefore cannot author the root commit — verified
 * against a live empty repo, where blobs, trees and commits all 409 and only
 * PUT /contents succeeds. That endpoint writes a genuine root commit
 * (parents: []) and creates the branch; every git-data endpoint works
 * normally afterwards, so the caller's usual tree → commit → ref path applies
 * unchanged from there.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {string} token
 * @returns {Promise<string>} SHA of the commit now at the branch head
 */
export async function bootstrapEmptyRepo(owner, repo, branch, token) {
  const seed = `# ${repo}\n\nManaged by CodeLedger.\n`;
  try {
    const res = await putContentsFile(
      owner,
      repo,
      "README.md",
      seed,
      "chore: initialize repository",
      branch,
      token,
    );
    dbg.log(`bootstrapEmptyRepo(): ${owner}/${repo} seeded at ${res.commit.sha.slice(0, 7)}`);
    return res.commit.sha;
  } catch (err) {
    // 422 means README.md is already there, so the repository was not empty
    // after all — another device won the race, or the emptiness check was
    // fooled. Whatever the cause, if the branch has a head now, the caller can
    // carry on with it; only re-raise when there is still nothing to build on.
    const ref = await getRepoRef(owner, repo, branch, token).catch(() => null);
    if (ref?.object?.sha) {
      dbg.log(`bootstrapEmptyRepo(): seed failed but ${branch} already has a head`);
      return ref.object.sha;
    }
    throw err;
  }
}

// ── Repository management ─────────────────────────────────────────────────────

/** POST /user/repos or /orgs/{owner}/repos — create a new repository.
 *  Pass owner to route to an org; omit for the authenticated user's account. */
export function createRepository(name, token, owner = null, isPrivate = true) {
  const url = owner ? `/orgs/${owner}/repos` : "/user/repos";
  return apiFetch(url, token, {
    method: "POST",
    body: JSON.stringify({
      name,
      description: "Collection of solved DSA problems managed by CodeLedger",
      private: isPrivate,
      auto_init: true,
      has_wiki: false,
      has_projects: false,
      has_discussions: false,
      allow_merge_commit: false,
      allow_rebase_merge: true,
      allow_squash_merge: true,
      delete_branch_on_merge: true,
    }),
  });
}

/** PATCH /repos/{owner}/{repo} — update repository settings */
export function updateRepository(owner, repo, updates, token) {
  return apiFetch(`/repos/${owner}/${repo}`, token, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

/** PUT /repos/{owner}/{repo}/topics */
export function setRepositoryTopics(owner, repo, topics, token) {
  return apiFetch(`/repos/${owner}/${repo}/topics`, token, {
    method: "PUT",
    headers: { Accept: "application/vnd.github.mercy-preview+json" },
    body: JSON.stringify({ names: topics }),
  });
}

/** POST /repos/{owner}/{repo}/pages — enable GitHub Pages (workflow-based deploy) */
export function enablePages(owner, repo, _branch, token) {
  return apiFetch(`/repos/${owner}/${repo}/pages`, token, {
    method: "POST",
    // build_type:"workflow" pairs with the deploy-pages workflow committed to the repo,
    // allowing concurrency control (cancel-in-progress) to avoid wasted builds on
    // rapid consecutive commits from the extension or GitHub App.
    body: JSON.stringify({ build_type: "workflow" }),
  });
}

// ── Contents ──────────────────────────────────────────────────────────────────

/**
 * GET /repos/{owner}/{repo}/contents/{path}
 * Returns a single file object OR an array of directory entries.
 */
export function getContents(owner, repo, path, token) {
  // Path segments come from problem topics and titles, so they routinely contain
  // characters that are legal in a git path but not in a URL — "C#" truncates
  // the request at the fragment, spaces and "?" break it outright.
  const encoded = String(path || "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return apiFetch(`/repos/${owner}/${repo}/contents/${encoded}`, token);
}

/**
 * List files inside a repository directory.
 * Returns [] if the directory doesn't exist or is empty.
 *
 * @returns {Promise<Array<{name:string, path:string, type:string, size:number}>>}
 */
export async function listDirectory(owner, repo, path, token) {
  try {
    const result = await getContents(owner, repo, path, token);
    return Array.isArray(result) ? result : [];
  } catch (e) {
    if (e.status === 404) return [];
    throw e;
  }
}

// ── Commit history ────────────────────────────────────────────────────────────

/** GET /repos/{owner}/{repo}/commits with optional query params */
export function getCommitHistory(owner, repo, params, token) {
  const qs = new URLSearchParams(params || {}).toString();
  return apiFetch(`/repos/${owner}/${repo}/commits${qs ? "?" + qs : ""}`, token);
}
