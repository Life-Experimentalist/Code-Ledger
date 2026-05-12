/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// @ts-nocheck

import { CONSTANTS } from "../../../core/constants.js";
import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("GitHubAPI");

/**
 * GitHub API client wrapper.
 * Handles all API calls with error handling and retries.
 */

/**
 * Make authenticated GitHub API call.
 */
export async function apiFetch(url, token, options = {}) {
    const fullUrl = url.startsWith("http")
        ? url
        : `${CONSTANTS.GIT_PROVIDERS.github.apiBase}${url}`;

    const method = (options.method || "GET").toUpperCase();
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        ...(options.headers || {}),
    };

    if (["POST", "PATCH", "PUT"].includes(method) && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    try {
        const res = await fetch(fullUrl, { ...options, method, headers });

        if (!res.ok) {
            const errRes = await res.json().catch(() => ({}));
            const err = new Error(
                `GitHub API Error: ${errRes.message || res.statusText}`,
            );
            err.status = res.status;
            throw err;
        }

        const txt = await res.text();
        return txt ? JSON.parse(txt) : {};
    } catch (e) {
        dbg.error(`API call ${method} ${fullUrl} failed:`, e.message);
        throw e;
    }
}

/**
 * Get current user info.
 */
export async function getCurrentUser(token) {
    return apiFetch("/user", token);
}

/**
 * Get repo reference (SHA of branch).
 */
export async function getRepoRef(owner, repo, branch, token) {
    return apiFetch(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, token);
}

/**
 * Get commit object.
 */
export async function getCommit(owner, repo, sha, token) {
    return apiFetch(`/repos/${owner}/${repo}/git/commits/${sha}`, token);
}

/**
 * Create tree.
 */
export async function createTree(owner, repo, treeItems, baseTreeSha, token) {
    return apiFetch(`/repos/${owner}/${repo}/git/trees`, token, {
        method: "POST",
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
    });
}

/**
 * Create commit.
 */
export async function createCommit(owner, repo, commitPayload, token) {
    return apiFetch(`/repos/${owner}/${repo}/git/commits`, token, {
        method: "POST",
        body: JSON.stringify(commitPayload),
    });
}

/**
 * Update branch ref.
 */
export async function updateRef(owner, repo, branch, sha, token) {
    return apiFetch(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, {
        method: "PATCH",
        body: JSON.stringify({ sha }),
    });
}

/**
 * Create repository.
 */
export async function createRepository(name, token) {
    return apiFetch("/user/repos", token, {
        method: "POST",
        body: JSON.stringify({
            name,
            description:
                "Collection of solved DSA problems managed by CodeLedger",
            private: false,
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

/**
 * Update repository settings.
 */
export async function updateRepository(owner, repo, settings, token) {
    return apiFetch(`/repos/${owner}/${repo}`, token, {
        method: "PATCH",
        body: JSON.stringify(settings),
    });
}

/**
 * Set repository topics.
 */
export async function setRepositoryTopics(owner, repo, topics, token) {
    return apiFetch(`/repos/${owner}/${repo}/topics`, token, {
        method: "PUT",
        headers: {
            Accept: "application/vnd.github.mercy-preview+json",
        },
        body: JSON.stringify({ names: topics }),
    });
}

/**
 * Enable GitHub Pages.
 */
export async function enablePages(owner, repo, branch, token) {
    return apiFetch(`/repos/${owner}/${repo}/pages`, token, {
        method: "POST",
        body: JSON.stringify({ source: { branch, path: "/" } }),
    });
}

/**
 * Get repository contents.
 */
export async function getContents(owner, repo, path, token) {
    return apiFetch(`/repos/${owner}/${repo}/contents/${path}`, token);
}

/**
 * Get commit history.
 */
export async function getCommitHistory(owner, repo, options, token) {
    const params = new URLSearchParams(options);
    return apiFetch(`/repos/${owner}/${repo}/commits?${params}`, token);
}
