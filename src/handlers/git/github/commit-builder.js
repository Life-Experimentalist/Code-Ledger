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
 * @param {Array<{path:string, content:string}>} files
 * @param {string[]} [deletes]
 * @returns {object[]} tree items ready for POST /git/trees
 */
export function buildTreeItems(files, deletes = []) {
    const items = (files || []).map((f) => {
        const item = { path: f.path, mode: "100644", type: "blob" };
        if (f.sha) item.sha = f.sha; else item.content = f.content;
        return item;
    });

    for (const delPath of deletes || []) {
        items.push({ path: delPath, mode: "100644", type: "blob", sha: null });
    }

    return items;
}

/**
 * Build the commit payload for POST /git/commits.
 *
 * @param {string} message       Commit message (may include co-author trailer)
 * @param {string} treeSha       SHA of the new tree
 * @param {string} parentSha     SHA of the parent commit
 * @param {object} [opts]
 * @param {Date|string|number} [opts.date]  Backdate the author/committer timestamp
 * @param {object} [user]        { name, login, email } from getCurrentUser
 * @returns {object}             Payload for POST /git/commits
 */
export function buildCommitPayload(message, treeSha, parentSha, opts = {}, user = {}) {
    const payload = {
        message,
        tree: treeSha,
        parents: [parentSha],
    };

    if (opts.date) {
        const iso = new Date(opts.date).toISOString();
        const name = user.name || user.login || "CodeLedger";
        const email = user.email || `${user.login || "codeledger"}@users.noreply.github.com`;
        payload.author = { name, email, date: iso };
        payload.committer = { ...payload.author };
    }

    return payload;
}
