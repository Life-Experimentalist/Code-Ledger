/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Storage }   from "../core/storage.js";
import { CONSTANTS } from "../core/constants.js";
import { registry }  from "../core/handler-registry.js";
import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("SyncEngine");

const COMPARE_FIELDS = ["title", "difficulty", "code", "tags", "lang", "aiReview"];

function _fieldsEqual(a, b) {
  return COMPARE_FIELDS.every(k => {
    const av = typeof a[k] === "object" ? JSON.stringify(a[k]) : String(a[k] ?? "");
    const bv = typeof b[k] === "object" ? JSON.stringify(b[k]) : String(b[k] ?? "");
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
  const git = registry.getGitProvider("github");
  if (!git) throw new Error("GitHub provider not registered");

  const res = await git.apiFetch(`/repos/${owner}/${repo}/contents/index.json`, token);
  const raw = atob((res.content || "").replace(/\n/g, ""));
  const index = JSON.parse(raw);
  const rawRemote = Array.isArray(index.problems) ? index.problems : [];

  // Ensure all remote problems have platform-scoped ids
  const remoteProblems = rawRemote.map(p => {
    if (!p.id || !/^(lc|gfg|cf)-/.test(p.id)) {
      return { ...p, id: CONSTANTS.makeProblemId(p.platform || "unknown", p.titleSlug || "unknown") };
    }
    return p;
  });

  const localProblems = await Storage.getAllProblems();
  const localById = new Map(localProblems.map(p => [p.id, p]));

  const remoteOnly = [];
  const conflicts  = [];

  for (const remote of remoteProblems) {
    const local = localById.get(remote.id);
    if (!local) {
      remoteOnly.push(remote);
      continue;
    }
    if (!_fieldsEqual(local, remote)) {
      conflicts.push({ local, remote });
    }
  }

  dbg.log(`importFromRepo: ${remoteOnly.length} new, ${conflicts.length} conflicts`);
  return { remoteOnly, conflicts };
}

/**
 * Bulk-save resolved problems into local storage.
 * Call this after user resolves conflicts in ConflictResolutionModal.
 *
 * @param {object[]} resolvedProblems
 */
export async function applyImport(resolvedProblems) {
  for (const p of resolvedProblems) {
    await Storage.saveProblem(p);
  }
  dbg.log(`applyImport: saved ${resolvedProblems.length} problems`);
}

export const SyncEngine = {
  async performSync() {
    dbg.log("Initiating periodic cross-device sync");
    const settings = await Storage.getSettings();
    if (settings.gitEnabled === false || settings.gitEnabled === 0) return;

    const git = registry.getGitProvider(settings.gitProvider || "github");
    if (!git) return;
    const token = await git.getToken().catch(() => null);
    if (!token) return;

    const owner = settings.github_owner || settings.github_username;
    const repo  = settings.github_repo  || settings.gitRepo;
    if (!owner || !repo) return;

    try {
      const { remoteOnly, conflicts } = await importFromRepo(owner, repo, token);

      if (conflicts.length > 0) {
        await Storage.setSettings({ ...settings, _pendingConflicts: conflicts.length });
        dbg.warn(`Sync: ${conflicts.length} conflict(s) detected — user action required in Git settings`);
        return;
      }

      await applyImport(remoteOnly);
      // Clear any stale conflict flag
      if (settings._pendingConflicts) {
        await Storage.setSettings({ ...settings, _pendingConflicts: 0 });
      }
      dbg.log(`Sync complete: imported ${remoteOnly.length} new problems`);
    } catch (e) {
      dbg.warn("Sync failed:", e.message);
    }
  },
};
