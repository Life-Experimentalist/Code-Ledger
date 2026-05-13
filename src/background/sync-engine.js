/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Storage } from "../core/storage.js";
import { CONSTANTS } from "../core/constants.js";
import { registry } from "../core/handler-registry.js";
import { createDebugger } from "../lib/debug.js";
import { normalizeLang } from "../core/lang-utils.js";
import {
    flushPendingChatSync,
    importChatsFromRepo,
} from "../core/chat-sync.js";
import { importChatsLocal } from "../core/ai-chat-storage.js";
import { getContents } from "../handlers/git/github/api-client.js";

const dbg = createDebugger("SyncEngine");

const COMPARE_FIELDS = [
    "title",
    "difficulty",
    "code",
    "tags",
    "lang",
    "aiReview",
    "notes",
    "methodTitle",
    "isDuplicate",
    "duplicateOf",
];

function _syncCommitKey(problem = {}) {
    const id = String(
        problem.id ||
            CONSTANTS.makeProblemId(
                problem.platform || "unknown",
                problem.titleSlug || "unknown"
            )
    );
    const lang = normalizeLang(problem);
    if (!id || !lang) return "";
    return `${id}::${lang}`;
}

function _fieldsEqual(a, b) {
    return COMPARE_FIELDS.every((k) => {
        const av =
            typeof a[k] === "object"
                ? JSON.stringify(a[k])
                : String(a[k] ?? "");
        const bv =
            typeof b[k] === "object"
                ? JSON.stringify(b[k])
                : String(b[k] ?? "");
        return av === bv;
    });
}

/**
 * Fetch index.json from the connected repo and categorise remote problems.
 * Returns { remoteOnly, conflicts } — does NOT write to storage (caller decides).
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} token
 * @returns {Promise<{ remoteOnly: object[], conflicts: Array<{local: object, remote: object}> }>}
 */
export async function importFromRepo(owner, repo, token) {
    dbg.log(`importFromRepo(): fetching index.json from ${owner}/${repo}...`);

    let res;
    try {
        res = await getContents(owner, repo, "index.json", token);
    } catch (e) {
        dbg.warn(`importFromRepo(): API fetch failed:`, e?.message);
        res = null;
    }

    let raw = null;
    if (res && typeof res.content === "string" && res.content.trim()) {
        raw = atob((res.content || "").replace(/\n/g, ""));
        dbg.log(`importFromRepo(): ✓ loaded index.json from API`);
    } else {
        // Fallback: try raw.githubusercontent URL (public repos)
        try {
            dbg.log(
                `importFromRepo(): trying raw.githubusercontent fallback...`
            );
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/index.json`;
            const r = await fetch(rawUrl);
            if (r.ok) raw = await r.text();
            dbg.log(
                `importFromRepo(): ✓ loaded index.json from raw.githubusercontent`
            );
        } catch (e) {
            dbg.warn(
                "importFromRepo: raw.githubusercontent fallback failed",
                e?.message || e
            );
        }
    }

    if (!raw || !raw.trim()) {
        dbg.log(
            "importFromRepo(): no index.json content found; treating as empty remote"
        );
        return { remoteOnly: [], conflicts: [] };
    }
    let index;
    try {
        index = JSON.parse(raw);
    } catch (e) {
        dbg.warn(
            "importFromRepo(): failed to parse index.json; treating as empty",
            e?.message || e
        );
        index = { problems: [] };
    }
    const rawRemote = Array.isArray(index.problems) ? index.problems : [];
    dbg.log(`importFromRepo(): parsed ${rawRemote.length} remote problem(s)`);
    if (rawRemote.length > 0) {
        const sample = rawRemote.slice(0, 5).map((p) => p.id || p.titleSlug || "?");
        dbg.log(`importFromRepo(): index.json top-5 ids: [${sample.join(", ")}]`);
    } else {
        const keys = Object.keys(index).join(", ");
        const snippet = raw.length > 300 ? raw.slice(0, 300) + "…" : raw;
        dbg.warn(`importFromRepo(): index.json has 0 problems — top-level keys: [${keys}] — raw(truncated): ${snippet}`);
    }

    // Ensure all remote problems have platform-scoped ids
    const remoteProblems = rawRemote.map((p) => {
        if (!p.id || !/^(lc|gfg|cf)-/.test(p.id)) {
            return {
                ...p,
                id: CONSTANTS.makeProblemId(
                    p.platform || "unknown",
                    p.titleSlug || "unknown"
                ),
            };
        }
        return p;
    });

    const localProblems = await Storage.getAllProblems();
    const localByCommitKey = new Map(
        localProblems
            .map((p) => [_syncCommitKey(p), p])
            .filter(([key]) => Boolean(key))
    );
    dbg.log(
        `importFromRepo(): mapped ${localByCommitKey.size} local problem(s) by commit key`
    );

    const remoteOnly = [];
    const conflicts = [];

    for (const remote of remoteProblems) {
        const local = localByCommitKey.get(_syncCommitKey(remote));
        if (!local) {
            remoteOnly.push(remote);
            continue;
        }
        if (!_fieldsEqual(local, remote)) {
            conflicts.push({ local, remote });
        }
    }

    dbg.log(
        `importFromRepo(): ✓ complete — ${remoteOnly.length} new, ${conflicts.length} conflicts`
    );
    return { remoteOnly, conflicts };
}

/**
 * Bulk-save resolved problems into local storage.
 * Call this after user resolves conflicts in ConflictResolutionModal.
 *
 * @param {object[]} resolvedProblems
 */
export async function applyImport(resolvedProblems) {
    dbg.log(
        `applyImport(): saving ${resolvedProblems.length} resolved problem(s)...`
    );
    let saved = 0;
    for (const p of resolvedProblems) {
        try {
            await Storage.saveProblem(p);
            saved++;
        } catch (e) {
            dbg.warn(`applyImport(): failed to save ${p.id}:`, e?.message);
        }
    }
    dbg.log(
        `applyImport(): ✓ saved ${saved}/${resolvedProblems.length} problems`
    );
}

export const SyncEngine = {
    async performSync() {
        dbg.log(`performSync(): initiating periodic cross-device sync...`);
        const settings = await Storage.getSettings();
        if (settings.gitEnabled === false || settings.gitEnabled === 0) {
            dbg.log(`performSync(): git disabled, skipping sync`);
            return;
        }

        const git = registry.getGitProvider(settings.gitProvider || "github");
        if (!git) {
            dbg.warn(`performSync(): git provider not available`);
            return;
        }
        const token = await git.getToken().catch(() => null);
        if (!token) {
            dbg.warn(`performSync(): no token, skipping sync`);
            return;
        }

        const owner = settings.github_owner || settings.github_username;
        const repo = settings.github_repo || settings.gitRepo;
        if (!owner || !repo) {
            dbg.warn(
                `performSync(): owner or repo not configured (owner=${owner}, repo=${repo})`
            );
            return;
        }

        try {
            dbg.log(`performSync(): importing from ${owner}/${repo}...`);
            const { remoteOnly, conflicts } = await importFromRepo(
                owner,
                repo,
                token
            );
            dbg.log(
                `performSync(): import complete — ${remoteOnly.length} new, ${conflicts.length} conflicts`
            );

            if (conflicts.length > 0) {
                await Storage.setSettings({
                    ...settings,
                    _pendingConflicts: conflicts.length,
                });
                dbg.warn(
                    `performSync(): ✗ ${conflicts.length} conflict(s) detected — user action required in Git settings`
                );
                return;
            }

            await applyImport(remoteOnly);
            // Clear any stale conflict flag
            if (settings._pendingConflicts) {
                await Storage.setSettings({
                    ...settings,
                    _pendingConflicts: 0,
                });
            }
            dbg.log(
                `performSync(): ✓ sync complete — imported ${remoteOnly.length} new problems`
            );

            // Sync AI chats: push pending local chats, pull new remote chats
            flushPendingChatSync(owner, repo, git).catch((e) =>
                dbg.warn("performSync(): chat flush failed:", e?.message)
            );
            importChatsFromRepo(
                owner,
                repo,
                token,
                getContents,
                importChatsLocal
            ).catch((e) =>
                dbg.warn("performSync(): chat import failed:", e?.message)
            );
        } catch (e) {
            dbg.warn("performSync(): ✗ sync failed:", e?.message);
        }
    },
};
