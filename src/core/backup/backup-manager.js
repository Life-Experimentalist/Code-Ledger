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
import { getAllInsights, importInsights } from "../memory/knowledge-bank.js";
import { autoPopulateFromHistory } from "../behavior-bank.js";

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
  const [problems, settings, knowledge, behaviorBank, roadmaps] = await Promise.all([
    Storage.getAllProblems().catch(() => []),
    Storage.getSettings().catch(() => ({})),
    getAllInsights().catch(() => []),
    Storage.getBehaviorBank().catch(() => ({})),
    Storage.getRoadmaps().catch(() => []),
  ]);

  // Strip transient/private keys from settings
  const safeSettings = Object.fromEntries(
    Object.entries(settings).filter(
      ([k]) =>
        !k.startsWith("_") && !k.includes("token") && !k.includes("key") && !k.includes("secret"),
    ),
  );

  return {
    version: 2,
    createdAt: new Date().toISOString(),
    problems,
    settings: safeSettings,
    knowledge,
    behaviorBank,
    roadmaps,
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
 * @param {object} git - GitHandler instance
 * @param {number} [keep=10] - Number of backups to retain
 * @returns {Promise<void>}
 */
export async function commitBackupToGitHub(owner, repo, git, keep = DEFAULT_KEEP) {
  try {
    const snapshot = await buildSnapshot();
    const filePath = backupFilePath();
    const content = JSON.stringify(snapshot, null, 2);

    dbg.log(
      `commitBackupToGitHub(): creating backup at ${filePath} (${snapshot.problems.length} problems)`,
    );

    // Find existing backups so we can prune
    const toDelete = await _getOldBackupPaths(owner, repo, git, keep);

    await git.commit(
      [{ path: filePath, content }],
      `chore: rolling backup — ${snapshot.problems.length} problems`,
      repo,
      { ownerOverride: owner, deletes: toDelete },
    );

    dbg.log(
      `commitBackupToGitHub(): ✓ committed ${filePath}, pruned ${toDelete.length} old backup(s)`,
    );
  } catch (e) {
    dbg.warn(`commitBackupToGitHub(): failed:`, e?.message || e);
  }
}

async function _getOldBackupPaths(owner, repo, git, keep) {
  try {
    const listing = await git.getContents(owner, repo, BACKUP_DIR);
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
 * @param {object} git - GitHandler instance
 */
export async function maybeCommitRollingBackup(owner, repo, git) {
  try {
    const settings = await Storage.getSettings();
    const enabled = settings.githubRollingBackups !== false; // default on
    if (!enabled) return;

    const interval = Math.max(1, parseInt(settings.githubBackupInterval || "10", 10));
    const keep = Math.max(1, parseInt(settings.githubBackupKeep || "10", 10));
    const count = (settings[COMMIT_INTERVAL_KEY] || 0) + 1;

    await Storage.setSettings({
      ...settings,
      [COMMIT_INTERVAL_KEY]: count,
    });

    if (count % interval === 0) {
      dbg.log(`maybeCommitRollingBackup(): triggering backup at commit #${count}`);
      await commitBackupToGitHub(owner, repo, git, keep);
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
 * @param {object} git - GitHandler instance
 * @returns {Promise<Array<{name, path, sha, size}>>}
 */
export async function listBackups(owner, repo, git) {
  try {
    const listing = await git.getContents(owner, repo, BACKUP_DIR);
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
 * @param {object} git - GitHandler instance
 * @returns {Promise<object|null>}
 */
export async function fetchBackupSnapshot(owner, repo, filePath, git) {
  try {
    const fileData = await git.getContents(owner, repo, filePath);
    if (!fileData?.content) return null;
    const raw = atob(fileData.content.replace(/\n/g, ""));
    return JSON.parse(raw);
  } catch (e) {
    dbg.warn(`fetchBackupSnapshot(): failed for ${filePath}:`, e?.message);
    return null;
  }
}

/**
 * Restores a full backup snapshot (problems, behavior bank, roadmaps, settings, knowledge bank).
 * Merges items to prevent deleting existing data.
 * @param {object} snapshot
 * @returns {Promise<{problemsCount: number, behaviorCount: number, roadmapsCount: number}>}
 */
export async function restoreSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Invalid snapshot payload");
  }

  // 1. Restore Problems (merge existing)
  let problemsCount = 0;
  if (Array.isArray(snapshot.problems)) {
    for (const p of snapshot.problems) {
      if (p && (p.id || p.titleSlug)) {
        await Storage.saveProblem(p);
        problemsCount++;
      }
    }
  }

  // 2. Restore Behavior Bank (merge key-value records)
  let behaviorCount = 0;
  if (
    snapshot.behaviorBank &&
    typeof snapshot.behaviorBank === "object" &&
    !Array.isArray(snapshot.behaviorBank)
  ) {
    const currentBank = await Storage.getBehaviorBank().catch(() => ({}));
    const mergedBank = { ...currentBank, ...snapshot.behaviorBank };
    await Storage.setBehaviorBank(mergedBank);
    behaviorCount = Object.keys(snapshot.behaviorBank).length;
  }

  // 3. Restore Roadmaps (merge by ID)
  let roadmapsCount = 0;
  if (Array.isArray(snapshot.roadmaps)) {
    const currentRoadmaps = await Storage.getRoadmaps().catch(() => []);
    const roadmapsMap = new Map(currentRoadmaps.map((r) => [r.id, r]));
    for (const r of snapshot.roadmaps) {
      if (r && r.id) {
        roadmapsMap.set(r.id, { ...(roadmapsMap.get(r.id) || {}), ...r });
        roadmapsCount++;
      }
    }
    await Storage.setRoadmaps([...roadmapsMap.values()]);
  }

  // 4. Restore Settings (merge non-sensitive settings)
  if (
    snapshot.settings &&
    typeof snapshot.settings === "object" &&
    !Array.isArray(snapshot.settings)
  ) {
    const currentSettings = await Storage.getSettings().catch(() => ({}));
    const safeSettings = Object.fromEntries(
      Object.entries(snapshot.settings).filter(
        ([k]) =>
          !k.startsWith("_") && !k.includes("token") && !k.includes("key") && !k.includes("secret"),
      ),
    );
    await Storage.setSettings({ ...currentSettings, ...safeSettings });
  }

  // 5. Restore Knowledge Bank (insights)
  if (Array.isArray(snapshot.knowledge) && snapshot.knowledge.length > 0) {
    await importInsights(snapshot.knowledge).catch(() => {});
  }

  // 6. Ensure behavior bank is seeded/auto-populated from restored history if empty
  await autoPopulateFromHistory().catch(() => {});

  return { problemsCount, behaviorCount, roadmapsCount };
}
