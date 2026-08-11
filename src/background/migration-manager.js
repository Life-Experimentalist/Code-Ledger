/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Repo layout migration manager.
 *
 * migrateRepo()  — detect old-layout files and move them to v2 paths.
 * resetRepo()    — rebuild the entire repo from stored problems (self-healing).
 */

import {
  LAYOUT_VERSION,
  buildProblemFiles,
  solutionPath,
  readmePath,
  hintsPath,
} from "../core/path-builder.js";
import { buildCommitMessage, COMMIT_TYPES } from "../core/commit-messages.js";
import { Storage } from "../core/storage.js";
import { registry } from "../core/handler-registry.js";
import { createDebugger } from "../lib/debug.js";
import { CONSTANTS } from "../core/constants.js";
import { cleanGfgSlug } from "../core/gfg-utils.js";
import { countByDifficulty } from "../core/difficulty-map.js";

const dbg = createDebugger("MigrationManager");

// Matches old layout: topics/{topic}/{slug}/...
const OLD_LAYOUT_RE = /^topics\/[^/]+\/[^/]+\//;

/**
 * One-time migration: rekey problem records to platform-scoped ids.
 * Old formats handled:
 *   "two-sum"        → "lc-two-sum" / "gfg-two-sum" / "cf-two-sum"
 *   "two-sum::py"    → "lc-two-sum"   (LeetCode bulk import style — strip ::lang suffix)
 *   null / ""        → "gfg-{titleSlug}" (GFG bug fallback — use titleSlug)
 *
 * Idempotent: records already matching /^(lc|gfg|cf)-/ are skipped.
 * When multiple old records collapse to the same new id, keeps the one with the latest timestamp.
 */
export async function migrateProblemIds() {
  const ALREADY_MIGRATED = /^(lc|gfg|cf)-/;
  const problems = await Storage.getAllProblems();
  const toMigrate = problems.filter((p) => !ALREADY_MIGRATED.test(p.id || ""));
  if (toMigrate.length === 0) {
    dbg.log(`migrateProblemIds(): all ${problems.length} record(s) already migrated`);
    return;
  }

  dbg.log(
    `migrateProblemIds(): starting migration of ${toMigrate.length}/${problems.length} record(s)`,
  );

  // Group by new id — keep the record with the latest timestamp when multiple collapse
  const byNewId = new Map();
  for (const p of toMigrate) {
    const rawId = String(p.id || p.titleSlug || "unknown");
    const titleSlug = rawId.includes("::") ? rawId.split("::")[0] : rawId;
    const platform = p.platform || "unknown";
    const newId = CONSTANTS.makeProblemId(platform, titleSlug);
    dbg.log(`migrateProblemIds(): rekey ${rawId} → ${newId} (platform=${platform})`);
    const existing = byNewId.get(newId);
    if (!existing || (p.timestamp || 0) > (existing.timestamp || 0)) {
      byNewId.set(newId, { ...p, id: newId, titleSlug });
    }
  }

  // Delete old records
  const oldIds = toMigrate.map((p) => p.id || p.titleSlug).filter(Boolean);
  for (const oldId of oldIds) {
    await Storage.deleteProblem(oldId).catch(() => {});
    dbg.log(`migrateProblemIds(): deleted old ${oldId}`);
  }
  // Insert rekeyed records
  for (const [, record] of byNewId) {
    await Storage.saveProblem(record);
  }

  // Migrate committedSlugLangs map: rekey from "slug::lang" to "newId::lang"
  const SLUG_LANG_KEY = "cl.committed.sluglangs";
  const all = await Storage._raw().catch(() => ({}));
  const oldMap = all[SLUG_LANG_KEY] || {};
  if (Object.keys(oldMap).length > 0) {
    const newMap = {};
    for (const [k, v] of Object.entries(oldMap)) {
      const parts = k.split("::");
      const rawSlug = parts[0];
      const lang = parts.slice(1).join("::");
      if (!rawSlug) continue;
      const migrated = [...byNewId.values()].find((p) => p.titleSlug === rawSlug);
      const newKey = migrated ? `${migrated.id}::${lang}` : k;
      newMap[newKey] = v;
    }
    await Storage._setRaw(SLUG_LANG_KEY, newMap).catch(() => {});
    dbg.log(`migrateProblemIds(): rekeyed ${Object.keys(newMap).length} slug-lang entries`);
  }

  dbg.log(`migrateProblemIds(): ✓ complete — ${byNewId.size} record(s) rekeyed`);

  // Clean up any corrupt GFG problem records (double-hyphen, trailing /0 /1, etc.)
  await sanitizeGfgProblemSlugs().catch((err) => {
    dbg.error("migrateProblemIds(): sanitizeGfgProblemSlugs failed:", err.message);
  });
}

export async function sanitizeGfgProblemSlugs() {
  const problems = await Storage.getAllProblems().catch(() => []);
  const gfgProblems = problems.filter((p) => p && p.platform === "geeksforgeeks");

  let updatedCount = 0;
  for (const p of gfgProblems) {
    const rawSlug = p.titleSlug || p.id.replace(/^gfg-/, "");
    if (!rawSlug) continue;

    const cleanSlug = cleanGfgSlug(rawSlug);
    const newId = `gfg-${cleanSlug}`;

    if (cleanSlug !== p.titleSlug || newId !== p.id) {
      dbg.log(
        `sanitizeGfgProblemSlugs(): migrating dirty GFG problem ${p.id} (${p.titleSlug}) -> ${newId} (${cleanSlug})`,
      );

      // Delete old record
      await Storage.deleteProblem(p.id).catch(() => {});

      // Save new record
      const updated = {
        ...p,
        id: newId,
        titleSlug: cleanSlug,
      };
      await Storage.saveProblem(updated).catch(() => {});
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    dbg.log(`sanitizeGfgProblemSlugs(): completed, cleaned ${updatedCount} GFG problem(s)`);
  }
}

async function _getGitContext() {
  const settings = await Storage.getSettings();
  const git = registry.getGitProvider(settings.gitProvider || "github");
  if (!git) throw new Error("No git provider configured");
  const token = await git.getToken();
  if (!token) throw new Error("Not authenticated with GitHub");
  const userRes = await git.apiFetch("/user", token);
  const owner = settings.github_owner?.trim() || userRes.login;
  const repo = (settings.github_repo || settings.gitRepo || "").replace(/\s+/g, "-");
  dbg.log(
    `_getGitContext: owner=${owner} repo=${repo} provider=${settings.gitProvider || "github"}`,
  );
  if (!repo) throw new Error("No repository configured");
  return { settings, git, token, owner, repo };
}

/**
 * Read layoutVersion from the repo's index.json.
 * Returns 1 if absent (pre-v2 repo), null if repo has no index.json yet.
 */
export async function detectRepoLayoutVersion() {
  try {
    const { git, token, owner, repo } = await _getGitContext();
    const res = await git.apiFetch(`/repos/${owner}/${repo}/contents/index.json`, token);
    const raw = atob((res.content || "").replace(/\n/g, ""));
    const index = JSON.parse(raw);
    return index.layoutVersion ?? 1;
  } catch (e) {
    if (e.status === 404) return null; // no repo or no index.json yet
    dbg.warn("detectRepoLayoutVersion error:", e.message);
    return null;
  }
}

/**
 * Migrate repo from old layout to v2.
 * - Fetches full tree to find old-layout blobs
 * - Builds new-layout file tree from all stored problems
 * - One atomic commit: new paths + delete old paths
 */
export async function migrateRepo() {
  dbg.log(`migrateRepo(): starting repo layout migration`);
  const { settings, git, token, owner, repo } = await _getGitContext();

  // 1. Full repo tree
  dbg.log(`migrateRepo(): fetching complete repo tree from ${owner}/${repo}...`);
  const treeRes = await git.apiFetch(`/repos/${owner}/${repo}/git/trees/main?recursive=1`, token);
  const blobs = (treeRes.tree || []).filter((f) => f.type === "blob");
  dbg.log(`migrateRepo(): found ${blobs.length} total blob(s)`);

  // 2. Old-layout file paths to delete
  const oldPaths = blobs.filter((f) => OLD_LAYOUT_RE.test(f.path)).map((f) => f.path);
  dbg.log(`migrateRepo(): identified ${oldPaths.length} old-layout file(s) to delete`);

  // 3. Build complete new-layout file set from stored problems
  const problems = await Storage.getAllProblems();
  dbg.log(`migrateRepo(): building new-layout files for ${problems.length} problem(s)...`);
  const newFiles = [];

  for (const p of problems) {
    if (!p.code) continue;
    const canonical = p.canonical || null;
    const lang = p.lang || { ext: "txt" };
    newFiles.push({
      path: solutionPath(p.id || p.titleSlug, p.platform || "unknown", lang, canonical, settings),
      content: p.code,
    });
    if (p.readmeContent) {
      newFiles.push({
        path: readmePath(p.id || p.titleSlug, canonical, settings, p.platform),
        content: p.readmeContent,
      });
    }
    if (p.hintsContent) {
      newFiles.push({
        path: hintsPath(p.id || p.titleSlug, canonical, settings, p.platform),
        content: p.hintsContent,
      });
    }
  }

  // 4. Updated index.json
  const indexContent = _buildIndexJson(problems);
  newFiles.push({ path: "index.json", content: indexContent });
  dbg.log(`migrateRepo(): prepared ${newFiles.length} file(s) for new layout`);

  if (newFiles.length === 0 && oldPaths.length === 0) {
    dbg.log("migrateRepo(): ✓ nothing to migrate (repo already in new layout)");
    return { migrated: 0, deleted: 0 };
  }

  // 5. Single atomic commit
  dbg.log(`migrateRepo(): creating migration commit...`);
  await git.commit(
    newFiles,
    buildCommitMessage(COMMIT_TYPES.MAINTENANCE, {
      detail: `migrate to layout v${LAYOUT_VERSION}`,
      count: newFiles.length + oldPaths.length,
    }),
    repo,
    { deletes: oldPaths },
  );

  await Storage.updateSettings({ repoLayoutVersion: LAYOUT_VERSION });
  dbg.log(`migrateRepo(): ✓ complete — ${newFiles.length} files added, ${oldPaths.length} deleted`);
  return { migrated: newFiles.length, deleted: oldPaths.length };
}

/**
 * Full repo rebuild — re-commits every known problem from storage.
 * Identifies stray files (in repo but not expected) and deletes them.
 * Use when the repo is broken or needs a hard reset.
 */
export async function resetRepo() {
  const { settings, git, token, owner, repo } = await _getGitContext();

  // 1. All existing repo blobs
  const treeRes = await git.apiFetch(`/repos/${owner}/${repo}/git/trees/main?recursive=1`, token);
  const existingPaths = new Set(
    (treeRes.tree || []).filter((f) => f.type === "blob").map((f) => f.path),
  );

  // 2. Build complete desired state from all stored problems
  const problems = await Storage.getAllProblems();
  const desiredFiles = new Map(); // path → content

  for (const p of problems) {
    if (!p.code) continue;
    const canonical = p.canonical || null;
    const lang = p.lang || { ext: "txt" };
    const solPath = solutionPath(
      p.id || p.titleSlug,
      p.platform || "unknown",
      lang,
      canonical,
      settings,
    );
    desiredFiles.set(solPath, p.code);
    if (p.readmeContent) {
      desiredFiles.set(
        readmePath(p.id || p.titleSlug, canonical, settings, p.platform),
        p.readmeContent,
      );
    }
    if (p.hintsContent) {
      desiredFiles.set(
        hintsPath(p.id || p.titleSlug, canonical, settings, p.platform),
        p.hintsContent,
      );
    }
  }

  desiredFiles.set("index.json", _buildIndexJson(problems));

  // 3. Stray files: in repo but not in desired set and not infra
  const INFRA = new Set(["index.html", "README.md", ".github/workflows/deploy-pages.yml"]);
  const strayPaths = [...existingPaths].filter((p) => !desiredFiles.has(p) && !INFRA.has(p));

  const filesToCommit = [...desiredFiles.entries()].map(([path, content]) => ({
    path,
    content,
  }));

  // 4. Commit desired state, delete strays
  await git.commit(
    filesToCommit,
    buildCommitMessage(COMMIT_TYPES.MAINTENANCE, {
      detail: "full repo rebuild",
      count: filesToCommit.length,
    }),
    repo,
    { deletes: strayPaths },
  );

  await Storage.updateSettings({ repoLayoutVersion: LAYOUT_VERSION });
  dbg.log(
    `resetRepo: committed ${filesToCommit.length} files, deleted ${strayPaths.length} stray files`,
  );
  return { committed: filesToCommit.length, deleted: strayPaths.length };
}

/**
 * Force rebuild the repo by first deleting non-infra blobs, then committing
 * each stored problem as a historical backdated commit (one commit per problem).
 * This is useful when the remote repo is inconsistent and a full rebuild is required.
 */
export async function forceRebuildRepo() {
  const { settings, git, token, owner, repo } = await _getGitContext();

  // Fetch existing repo tree (best-effort)
  const treeRes = await git
    .apiFetch(`/repos/${owner}/${repo}/git/trees/main?recursive=1`, token)
    .catch(() => ({ tree: [] }));

  const existingPaths = new Set(
    (treeRes.tree || []).filter((f) => f.type === "blob").map((f) => f.path),
  );

  // Leave infrastructure files alone
  const INFRA = new Set(["index.html", "README.md", ".github/workflows/deploy-pages.yml"]);
  const deletable = [...existingPaths].filter((p) => !INFRA.has(p));

  if (deletable.length > 0) {
    await git.commit(
      [],
      buildCommitMessage(COMMIT_TYPES.MAINTENANCE, {
        detail: "force rebuild: clear existing state",
        count: deletable.length,
      }),
      repo,
      { deletes: deletable },
    );
  }

  // Build historical commits (one per problem) to preserve timestamps
  const problems = await Storage.getAllProblems();
  const indexContent = _buildIndexJson(problems);

  const commits = (problems || [])
    .filter((p) => p && (p.code || Array.isArray(p.files)))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    .map((p) => {
      const files = buildProblemFiles(p, settings).slice();
      // Ensure index.json is present in last commit as a convenience
      files.push({ path: "index.json", content: indexContent });
      return {
        files,
        message: buildCommitMessage(COMMIT_TYPES.SOLVED, p),
        date: p.timestamp || Date.now(),
        repoName: repo,
      };
    });

  if (commits.length > 0) {
    await git.commitHistorical(commits);
  }

  await Storage.updateSettings({ repoLayoutVersion: LAYOUT_VERSION });
  dbg.log(
    `forceRebuildRepo: rebuilt ${commits.length} problems, removed ${deletable.length} files`,
  );
  return { committed: commits.length, deleted: deletable.length };
}

function _buildIndexJson(problems) {
  const diff = countByDifficulty(problems);
  const stats = {
    total: problems.length,
    easy: diff.easy,
    medium: diff.medium,
    hard: diff.hard,
    unknownDifficulty: diff.unknown,
    byPlatform: problems.reduce((acc, p) => {
      const k = p.platform || "unknown";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
    byLang: problems.reduce((acc, p) => {
      const k = p.lang?.name || p.lang?.slug || "unknown";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
  };
  return JSON.stringify(
    {
      updatedAt: new Date().toISOString(),
      layoutVersion: LAYOUT_VERSION,
      stats,
      problems,
    },
    null,
    2,
  );
}

/**
 * One-time migration: normalize all stored problem tags to canonical DSA topic names.
 *
 * Reads every problem from IDB, runs tags through normalizeTag(), deduplicates,
 * re-saves only if tags actually changed. Idempotent — tracks completion via
 * a settings flag (cl.migration.tagsCanonical.v1) so it never runs twice.
 */
export async function migrateTagsToCanonical() {
  const MIGRATION_KEY = "cl.migration.tagsCanonical.v1";
  const settings = await Storage.getSettings().catch(() => ({}));
  if (settings[MIGRATION_KEY]) {
    dbg.log("migrateTagsToCanonical(): already completed, skipping");
    return;
  }

  // Lazy-import to avoid circular deps in ESM (topic-resolver is pure)
  const { normalizeTag } = await import("../core/topic-resolver.js");

  const problems = await Storage.getAllProblems().catch(() => []);
  dbg.log(`migrateTagsToCanonical(): scanning ${problems.length} problem(s)`);

  let changed = 0;
  for (const p of problems) {
    if (!Array.isArray(p.tags) || p.tags.length === 0) continue;

    const normalized = [...new Set(p.tags.map((t) => normalizeTag(t)).filter(Boolean))];
    const normalizedTopic = p.topic ? normalizeTag(p.topic) : p.topic;

    // Check if anything actually changed
    const isDiff =
      normalized.length !== p.tags.length ||
      normalized.some((t, i) => t !== p.tags[i]) ||
      (p.topic && normalizedTopic !== p.topic);

    if (!isDiff) continue;

    await Storage.saveProblem({
      ...p,
      tags: normalized,
      ...(normalizedTopic ? { topic: normalizedTopic } : {}),
    }).catch((e) => dbg.warn(`migrateTagsToCanonical(): failed to update ${p.id}:`, e?.message));
    changed++;
  }

  // Mark as done
  await Storage.updateSettings({ [MIGRATION_KEY]: true }).catch(() => {});
  dbg.log(
    `migrateTagsToCanonical(): ✓ complete — ${changed}/${problems.length} problem(s) updated`,
  );
}

/**
 * One-time migration: get stranded API keys out of the settings map.
 *
 * The provider card used to write what you typed into `settings.{provider}_keys`
 * on every keystroke and only move it to `ai.keys` when you pressed Save. It no
 * longer does, which leaves anyone who typed a key and navigated away with a
 * plaintext credential sitting in a settings key nothing reads. Dropping it
 * would silently lose keys somebody meant to keep, so it is folded into
 * `ai.keys` — the same place Save would have put it — and then removed.
 *
 * Runs on every start until it succeeds; the marker is written last so a failed
 * run is retried rather than skipped.
 */
export async function migrateStrandedAIKeys() {
  const MIGRATION_KEY = "cl.migration.strandedAIKeys.v1";
  const settings = await Storage.getSettings().catch(() => ({}));
  if (settings[MIGRATION_KEY]) return;

  const stranded = Object.keys(settings).filter(
    (k) => k.endsWith("_keys") && typeof settings[k] === "string" && settings[k].trim(),
  );

  if (stranded.length) {
    const all = await Storage.getAIKeys().catch(() => ({}));
    const patch = {};

    for (const key of stranded) {
      const providerId = key.slice(0, -"_keys".length);
      const incoming = String(settings[key])
        .split(/[,\n]/)
        .map((k) => k.trim())
        .filter(Boolean);
      const existing = Array.isArray(all[providerId]) ? all[providerId] : [];
      all[providerId] = [...new Set([...existing, ...incoming])];
      patch[key] = undefined;
    }

    await Storage.setAIKeys(all);
    await Storage.updateSettings(patch);
    dbg.log(
      `migrateStrandedAIKeys(): moved keys out of ${stranded.length} settings key(s) into ai.keys`,
    );
  }

  await Storage.updateSettings({ [MIGRATION_KEY]: true }).catch(() => {});
}
