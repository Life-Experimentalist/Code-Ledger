/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Repo layout migration manager.
 *
 * migrateRepo()  — detect old-layout files and move them to v2 paths.
 * resetRepo()    — rebuild the entire repo from stored problems (self-healing).
 */

import { LAYOUT_VERSION, solutionPath, readmePath, hintsPath } from "../core/path-builder.js";
import { buildCommitMessage, COMMIT_TYPES } from "../core/commit-messages.js";
import { Storage } from "../core/storage.js";
import { registry } from "../core/handler-registry.js";
import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("MigrationManager");

// Matches old layout: topics/{topic}/{slug}/...
const OLD_LAYOUT_RE = /^topics\/[^/]+\/[^/]+\//;

async function _getGitContext() {
  const settings = await Storage.getSettings();
  const git      = registry.getGitProvider(settings.gitProvider || "github");
  if (!git) throw new Error("No git provider configured");
  const token    = await git.getToken();
  if (!token) throw new Error("Not authenticated with GitHub");
  const userRes  = await git.apiFetch("/user", token);
  const owner    = settings.github_owner?.trim() || userRes.login;
  const repo     = (settings.github_repo || settings.gitRepo || "").replace(/\s+/g, "-");
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
    const res = await git.apiFetch(
      `/repos/${owner}/${repo}/contents/index.json`,
      token,
    );
    const raw   = atob((res.content || "").replace(/\n/g, ""));
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
  const { settings, git, token, owner, repo } = await _getGitContext();

  // 1. Full repo tree
  const treeRes = await git.apiFetch(
    `/repos/${owner}/${repo}/git/trees/main?recursive=1`,
    token,
  );
  const blobs = (treeRes.tree || []).filter(f => f.type === "blob");

  // 2. Old-layout file paths to delete
  const oldPaths = blobs.filter(f => OLD_LAYOUT_RE.test(f.path)).map(f => f.path);
  dbg.log(`migrateRepo: found ${oldPaths.length} old-layout files`);

  // 3. Build complete new-layout file set from stored problems
  const problems = await Storage.getAllProblems();
  const newFiles = [];

  for (const p of problems) {
    if (!p.code) continue;
    const canonical = p.canonical || null;
    const lang      = p.lang || { ext: "txt" };
    newFiles.push({
      path:    solutionPath(p.titleSlug || p.id, p.platform || "unknown", lang, canonical, settings),
      content: p.code,
    });
    if (p.readmeContent) {
      newFiles.push({
        path:    readmePath(p.titleSlug || p.id, canonical, settings),
        content: p.readmeContent,
      });
    }
    if (p.hintsContent) {
      newFiles.push({
        path:    hintsPath(p.titleSlug || p.id, canonical, settings),
        content: p.hintsContent,
      });
    }
  }

  // 4. Updated index.json
  const indexContent = _buildIndexJson(problems);
  newFiles.push({ path: "index.json", content: indexContent });

  if (newFiles.length === 0 && oldPaths.length === 0) {
    dbg.log("migrateRepo: nothing to do");
    return { migrated: 0, deleted: 0 };
  }

  // 5. Single atomic commit
  await git.commit(
    newFiles,
    buildCommitMessage(COMMIT_TYPES.MAINTENANCE, {
      detail: `migrate to layout v${LAYOUT_VERSION}`,
      count:  newFiles.length + oldPaths.length,
    }),
    repo,
    { deletes: oldPaths },
  );

  await Storage.setSettings({ ...settings, repoLayoutVersion: LAYOUT_VERSION });
  dbg.log(`migrateRepo: committed ${newFiles.length} files, deleted ${oldPaths.length}`);
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
  const treeRes = await git.apiFetch(
    `/repos/${owner}/${repo}/git/trees/main?recursive=1`,
    token,
  );
  const existingPaths = new Set(
    (treeRes.tree || []).filter(f => f.type === "blob").map(f => f.path),
  );

  // 2. Build complete desired state from all stored problems
  const problems = await Storage.getAllProblems();
  const desiredFiles = new Map(); // path → content

  for (const p of problems) {
    if (!p.code) continue;
    const canonical = p.canonical || null;
    const lang      = p.lang || { ext: "txt" };
    const solPath   = solutionPath(p.titleSlug || p.id, p.platform || "unknown", lang, canonical, settings);
    desiredFiles.set(solPath, p.code);
    if (p.readmeContent) {
      desiredFiles.set(readmePath(p.titleSlug || p.id, canonical, settings), p.readmeContent);
    }
    if (p.hintsContent) {
      desiredFiles.set(hintsPath(p.titleSlug || p.id, canonical, settings), p.hintsContent);
    }
  }

  desiredFiles.set("index.json", _buildIndexJson(problems));

  // 3. Stray files: in repo but not in desired set and not infra
  const INFRA = new Set(["index.html", "README.md", ".github/workflows/update-stats.yml"]);
  const strayPaths = [...existingPaths].filter(p => !desiredFiles.has(p) && !INFRA.has(p));

  const filesToCommit = [...desiredFiles.entries()].map(([path, content]) => ({ path, content }));

  // 4. Commit desired state, delete strays
  await git.commit(
    filesToCommit,
    buildCommitMessage(COMMIT_TYPES.MAINTENANCE, {
      detail: "full repo rebuild",
      count:  filesToCommit.length,
    }),
    repo,
    { deletes: strayPaths },
  );

  await Storage.setSettings({ ...settings, repoLayoutVersion: LAYOUT_VERSION });
  dbg.log(`resetRepo: committed ${filesToCommit.length} files, deleted ${strayPaths.length} stray files`);
  return { committed: filesToCommit.length, deleted: strayPaths.length };
}

function _buildIndexJson(problems) {
  const stats = {
    total:  problems.length,
    easy:   problems.filter(p => p.difficulty === "Easy").length,
    medium: problems.filter(p => p.difficulty === "Medium").length,
    hard:   problems.filter(p => p.difficulty === "Hard").length,
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
  return JSON.stringify({
    updatedAt:     new Date().toISOString(),
    layoutVersion: LAYOUT_VERSION,
    stats,
    problems,
  }, null, 2);
}
