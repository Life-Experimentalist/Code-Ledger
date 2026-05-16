/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../../lib/debug.js";

export class BaseGitHandler {
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this.dbg = createDebugger(`${name}GitHandler`);
    }

    async authenticate() {
        throw new Error("Not implemented");
    }
    async getToken() {
        return null;
    }
    async commit(files, message) {
        throw new Error("Not implemented");
    }
    async getFile(path) {
        throw new Error("Not implemented");
    }
    /** GET a file from the repository. Returns raw API response (content, sha, …). */
    async getContents(owner, repo, path) {
        throw new Error("Not implemented");
    }
    /** Fetch the authenticated user profile. Returns at minimum { login: string }. */
    async getCurrentUser() {
        throw new Error("Not implemented");
    }
    /** Low-level authenticated HTTP request. path is provider-relative (e.g. "/repos/…"). */
    async apiFetch(path, opts = {}) {
        throw new Error("Not implemented");
    }
}
