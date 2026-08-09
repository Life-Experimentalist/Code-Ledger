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

  // Rate-limit — wait for Retry-After then retry
  if (res.status === 429 && _left > 0) {
    const wait = Math.max(1, parseInt(res.headers.get("Retry-After") || "2", 10));
    dbg.warn(`rate-limited — waiting ${wait}s then retrying (${_left} left)`);
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
    dbg.error(`${method} ${fullUrl} → ${res.status}:`, err.message);
    throw err;
  }

  const text = await res.text();
  return text ? JSON.parse(text) : {};
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
  return apiFetch(`/repos/${owner}/${repo}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
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

/** POST /git/blobs — store a binary blob, returns { sha } */
export function createBlob(owner, repo, base64Content, token) {
  return apiFetch(`/repos/${owner}/${repo}/git/blobs`, token, {
    method: "POST",
    body: JSON.stringify({ content: base64Content, encoding: "base64" }),
  });
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
  return apiFetch(`/repos/${owner}/${repo}/contents/${path}`, token);
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
