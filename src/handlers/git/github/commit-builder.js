/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * commit-builder.js — Pure functions for assembling GitHub Trees API payloads.
 * No I/O, no side effects — just data transformation.
 */

/**
 * Convert a files array + optional deletes list into GitHub tree items.
 * Deletions are represented by sha:null as required by the Trees API.
 *
 * @param {Array<{path: string, content: string}>} files
 * @param {string[]} [deletes]
 * @returns {object[]} tree items ready for POST /git/trees
 */
export function buildTreeItems(files, deletes = []) {
    const items = (files || []).map(f => ({
        path: f.path,
        mode: "100644",
        type: "blob",
        content: f.content,
    }));

    for (const delPath of (deletes || [])) {
        items.push({ path: delPath, mode: "100644", type: "blob", sha: null });
    }

    return items;
}

/**
 * Build the commit payload for POST /git/commits.
 *
 * @param {string} message
 * @param {string} treeSha
 * @param {string} parentSha
 * @param {object} [opts]
 * @param {Date|string|number} [opts.date] - backdating timestamp
 * @param {object} [user]  - { name, login, email } from getCurrentUser
 * @returns {object} commit payload
 */
export function buildCommitPayload(message, treeSha, parentSha, opts = {}, user = {}) {
    const payload = {
        message,
        tree: treeSha,
        parents: [parentSha],
    };

    if (opts.date) {
        const iso = new Date(opts.date).toISOString();
        const authorName = user.name || user.login || "CodeLedger";
        const authorEmail = user.email || `${user.login || "codeledger"}@users.noreply.github.com`;
        payload.author = { name: authorName, email: authorEmail, date: iso };
        payload.committer = { ...payload.author };
    }

    return payload;
}
