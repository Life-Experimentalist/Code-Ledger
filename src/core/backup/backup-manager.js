/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Backup Manager — GitHub rolling backups.
 * Commits a full data snapshot to `backups/{ISO-timestamp}.json` in the user's repo.
 * Prunes old backups to keep only the N most recent (default: 10).
 *
 * Snapshot format:
 *   { version: 1, createdAt, problems: [...], settings: {...}, knowledge: [...] }
 */

import { createDebugger } from "../../lib/debug.js";
import { Storage } from "../storage.js";
import { getAllInsights } from "../memory/knowledge-bank.js";
import { getContents } from "../../handlers/git/github/api-client.js";

const dbg = createDebugger("BackupManager");

const BACKUP_DIR = "backups";
const DEFAULT_KEEP = 10;
const COMMIT_INTERVAL_KEY = "_backupCommitCount";

// ── Snapshot builder ──────────────────────────────────────────────────────────

/**
 * Build a full backup snapshot object.
 * @returns {Promise<object>}
 */
export async function buildSnapshot() {
    const [problems, settings, knowledge] = await Promise.all([
        Storage.getAllProblems().catch(() => []),
        Storage.getSettings().catch(() => ({})),
        getAllInsights().catch(() => []),
    ]);

    // Strip transient/private keys from settings
    const safeSettings = Object.fromEntries(
        Object.entries(settings).filter(
            ([k]) =>
                !k.startsWith("_") &&
                !k.includes("token") &&
                !k.includes("key") &&
                !k.includes("secret")
        )
    );

    return {
        version: 1,
        createdAt: new Date().toISOString(),
        problems,
        settings: safeSettings,
        knowledge,
    };
}

/**
 * Derive the backup file path from an ISO timestamp.
 * @param {string|Date} [ts]
 * @returns {string}
 */
export function backupFilePath(ts = new Date()) {
    const iso = (ts instanceof Date ? ts : new Date(ts))
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
    return `${BACKUP_DIR}/${iso}.json`;
}

// ── GitHub commit ─────────────────────────────────────────────────────────────

/**
 * Commit a new backup snapshot to GitHub and prune old ones.
 * Safe to call fire-and-forget — errors are caught and logged.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} token
 * @param {object} git - GitHandler instance (has `.commit(files, msg, repo, opts)`)
 * @param {number} [keep=10] - Number of backups to retain
 * @returns {Promise<void>}
 */
export async function commitBackupToGitHub(
    owner,
    repo,
    token,
    git,
    keep = DEFAULT_KEEP
) {
    try {
        const snapshot = await buildSnapshot();
        const filePath = backupFilePath();
        const content = JSON.stringify(snapshot, null, 2);

        dbg.log(
            `commitBackupToGitHub(): creating backup at ${filePath} (${snapshot.problems.length} problems)`
        );

        // Find existing backups so we can prune
        const toDelete = await _getOldBackupPaths(owner, repo, token, keep);

        await git.commit(
            [{ path: filePath, content }],
            `chore: rolling backup — ${snapshot.problems.length} problems`,
            repo,
            { ownerOverride: owner, deletes: toDelete }
        );

        dbg.log(
            `commitBackupToGitHub(): ✓ committed ${filePath}, pruned ${toDelete.length} old backup(s)`
        );
    } catch (e) {
        dbg.warn(`commitBackupToGitHub(): failed:`, e?.message || e);
    }
}

/**
 * List backup file paths in the repo, sorted newest-first.
 * Returns paths that should be deleted to stay within `keep` limit.
 * @param {string} owner
 * @param {string} repo
 * @param {string} token
 * @param {number} keep
 * @returns {Promise<string[]>} paths to delete
 */
async function _getOldBackupPaths(owner, repo, token, keep) {
    try {
        const listing = await getContents(owner, repo, BACKUP_DIR, token);
        if (!Array.isArray(listing)) return [];
        const files = listing
            .filter((f) => f.type === "file" && f.name.endsWith(".json"))
            .sort((a, b) => b.name.localeCompare(a.name)); // newest first (ISO names sort lexicographically)
        // After the new one is added there will be files.length + 1; prune the oldest
        return files.slice(keep - 1).map((f) => f.path);
    } catch (e) {
        if (e?.status === 404) return []; // backups/ dir doesn't exist yet
        dbg.warn(`_getOldBackupPaths(): failed to list:`, e?.message);
        return [];
    }
}

// ── Conditional trigger ───────────────────────────────────────────────────────

/**
 * Maybe commit a rolling backup — triggers every N problem commits.
 * Call this after each successful problem commit.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} token
 * @param {object} git
 */
export async function maybeCommitRollingBackup(owner, repo, token, git) {
    try {
        const settings = await Storage.getSettings();
        const enabled = settings.githubRollingBackups !== false; // default on
        if (!enabled) return;

        const interval = Math.max(
            1,
            parseInt(settings.githubBackupInterval || "10", 10)
        );
        const keep = Math.max(
            1,
            parseInt(settings.githubBackupKeep || "10", 10)
        );
        const count = (settings[COMMIT_INTERVAL_KEY] || 0) + 1;

        await Storage.setSettings({
            ...settings,
            [COMMIT_INTERVAL_KEY]: count,
        });

        if (count % interval === 0) {
            dbg.log(
                `maybeCommitRollingBackup(): triggering backup at commit #${count}`
            );
            await commitBackupToGitHub(owner, repo, token, git, keep);
        }
    } catch (e) {
        dbg.warn(`maybeCommitRollingBackup(): failed:`, e?.message || e);
    }
}

// ── List and restore ──────────────────────────────────────────────────────────

/**
 * List all available backup files in the repo.
 * @param {string} owner
 * @param {string} repo
 * @param {string} token
 * @returns {Promise<Array<{name, path, sha, size}>>}
 */
export async function listBackups(owner, repo, token) {
    try {
        const listing = await getContents(owner, repo, BACKUP_DIR, token);
        if (!Array.isArray(listing)) return [];
        return listing
            .filter((f) => f.type === "file" && f.name.endsWith(".json"))
            .sort((a, b) => b.name.localeCompare(a.name))
            .map((f) => ({
                name: f.name,
                path: f.path,
                sha: f.sha,
                size: f.size,
            }));
    } catch (e) {
        if (e?.status === 404) return [];
        dbg.warn(`listBackups(): failed:`, e?.message);
        return [];
    }
}

/**
 * Fetch and parse a backup snapshot from the repo.
 * @param {string} owner
 * @param {string} repo
 * @param {string} filePath
 * @param {string} token
 * @returns {Promise<object|null>}
 */
export async function fetchBackupSnapshot(owner, repo, filePath, token) {
    try {
        const fileData = await getContents(owner, repo, filePath, token);
        if (!fileData?.content) return null;
        const raw = atob(fileData.content.replace(/\n/g, ""));
        return JSON.parse(raw);
    } catch (e) {
        dbg.warn(`fetchBackupSnapshot(): failed for ${filePath}:`, e?.message);
        return null;
    }
}
