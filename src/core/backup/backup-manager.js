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
import { decodeBase64Utf8 } from "../../lib/base64.js";
import { Storage } from "../storage.js";
import { getAllInsights, importInsights } from "../memory/knowledge-bank.js";
import { autoPopulateFromHistory } from "../behavior-bank.js";
import { isPortableSetting } from "../settings-sync.js";

const dbg = createDebugger("BackupManager");

const BACKUP_DIR = "backups";
const DEFAULT_KEEP = 10;
const COMMIT_INTERVAL_KEY = "_backupCommitCount";

/** Where the last outcome of each backup route is kept. Underscore-prefixed, so
 *  `buildSnapshot` strips it and a restore never carries one device's history
 *  onto another. */
export const BACKUP_STATUS_KEY = "_backupStatus";

/**
 * Remember how the last attempt on one route went.
 *
 * A backup nobody can see the result of is indistinguishable from no backup:
 * the automatic routes run without anyone watching, and until now a failure on
 * one of them went to `dbg.warn` and nowhere else. Settings is the right home
 * because the panel already has them in hand.
 *
 * @param {"local"|"github"} scope
 * @param {boolean} ok
 * @param {string} detail  one line, shown to the user as-is
 */
export async function recordBackupOutcome(scope, ok, detail = "") {
  try {
    await Storage.updateSettings((cur) => ({
      [BACKUP_STATUS_KEY]: {
        ...(cur[BACKUP_STATUS_KEY] || {}),
        [scope]: { ok, at: Date.now(), detail: String(detail || "").slice(0, 300) },
      },
    }));
  } catch (e) {
    dbg.warn(`recordBackupOutcome(${scope}): could not save status:`, e?.message || e);
  }
}

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

  // Keep only settings the portability gate calls safe to move between installs.
  // This used to be a denylist — anything not matching `_`, "token", "key" or
  // "secret" was written into a backup that lives in the ledger repository. It
  // let `openai_endpoint` through (a URL that decides where solutions and API
  // keys get posted), and it let `openai_apiKey` through too, because
  // `includes("key")` is case-sensitive and that key spells it with a capital.
  // A denylist has to anticipate every dangerous key ever added; the allow-list
  // in settings-sync already exists and fails closed instead.
  const safeSettings = Object.fromEntries(
    Object.entries(settings).filter(([k]) => isPortableSetting(k)),
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
 * Take the on-device snapshots in one pass.
 *
 * Two separate `buildSnapshot()` calls used to run on every solve — each one
 * reading every problem, with its code, back out of IndexedDB — to store two
 * copies of the same thing. One build now serves both, and the outcome is
 * recorded so a device that has run out of room says so instead of quietly
 * keeping the snapshot it had months ago.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.scheduled] also file it as a scheduled snapshot
 * @param {string}  [opts.trigger] what caused it, shown in the scheduled list
 * @returns {Promise<object|null>} the snapshot, or null if it could not be saved
 */
export async function saveLocalSnapshots({ scheduled = false, trigger = "on-solve" } = {}) {
  try {
    const snapshot = await buildSnapshot();
    await Storage.updateRollingBackup(snapshot);
    if (scheduled) await Storage.addScheduledBackup(snapshot, trigger);
    await recordBackupOutcome(
      "local",
      true,
      `${(snapshot.problems || []).length} problems saved on this device`,
    );
    return snapshot;
  } catch (e) {
    const reason = e?.message || String(e);
    dbg.warn(`saveLocalSnapshots(): failed:`, reason);
    await recordBackupOutcome("local", false, reason);
    return null;
  }
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
 *
 * **Throws** if the commit does not land. It used to swallow everything, which
 * meant the "Backup now" button reported success after a 401, a rate limit or a
 * repo that had been renamed — the one moment the user is actually watching.
 * Callers that genuinely cannot fail (the fire-and-forget path after a solve)
 * catch it themselves; the outcome is recorded either way.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {object} git - GitHandler instance
 * @param {number} [keep=10] - Number of backups to retain
 * @returns {Promise<{path: string, pruned: number, problems: number}>}
 */
export async function commitBackupToGitHub(owner, repo, git, keep = DEFAULT_KEEP) {
  const filePath = backupFilePath();
  try {
    const snapshot = await buildSnapshot();
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
    const result = {
      path: filePath,
      pruned: toDelete.length,
      problems: snapshot.problems.length,
    };
    await recordBackupOutcome(
      "github",
      true,
      `${result.problems} problems → ${filePath}${result.pruned ? `, ${result.pruned} pruned` : ""}`,
    );
    return result;
  } catch (e) {
    const reason = e?.message || String(e);
    dbg.warn(`commitBackupToGitHub(): failed:`, reason);
    await recordBackupOutcome("github", false, reason);
    throw e;
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
    // Increment under the lock and read the result back, so two commits landing
    // together advance the counter twice rather than both writing the same n+1.
    const after = await Storage.updateSettings((cur) => ({
      [COMMIT_INTERVAL_KEY]: (cur[COMMIT_INTERVAL_KEY] || 0) + 1,
    }));
    const count = after[COMMIT_INTERVAL_KEY];

    if (count % interval === 0) {
      dbg.log(`maybeCommitRollingBackup(): triggering backup at commit #${count}`);
      try {
        await commitBackupToGitHub(owner, repo, git, keep);
      } catch (e) {
        // Give the counter back rather than waiting another full interval. A
        // failed attempt is usually transient — an expired token, a rate limit,
        // no network — and the next solve then retries instead of leaving the
        // repo without a backup for another N problems.
        await Storage.updateSettings((cur) => ({
          [COMMIT_INTERVAL_KEY]: Math.max(0, (cur[COMMIT_INTERVAL_KEY] || 1) - 1),
        }));
        dbg.warn(`maybeCommitRollingBackup(): will retry on the next solve:`, e?.message || e);
      }
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
    return JSON.parse(decodeBase64Utf8(fileData.content));
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

  // 4. Restore Settings (merge the ones the portability gate accepts)
  //
  // A snapshot is untrusted input: it comes out of a repository, or out of a
  // file the user was handed. The same allow-list that decides what may be
  // written decides what may be read back, so a hand-edited backup cannot
  // introduce a key the extension would never have put there itself.
  if (
    snapshot.settings &&
    typeof snapshot.settings === "object" &&
    !Array.isArray(snapshot.settings)
  ) {
    const safeSettings = Object.fromEntries(
      Object.entries(snapshot.settings).filter(([k]) => isPortableSetting(k)),
    );
    await Storage.updateSettings(safeSettings);
  }

  // 5. Restore Knowledge Bank (insights)
  if (Array.isArray(snapshot.knowledge) && snapshot.knowledge.length > 0) {
    await importInsights(snapshot.knowledge).catch(() => {});
  }

  // 6. Ensure behavior bank is seeded/auto-populated from restored history if empty
  await autoPopulateFromHistory().catch(() => {});

  return { problemsCount, behaviorCount, roadmapsCount };
}
