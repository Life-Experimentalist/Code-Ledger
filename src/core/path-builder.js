/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Centralised problem-path computation — layout v2.
 *
 * No canonical:   problems/{slug}/{slug}.{ext}
 * With canonical: problems/{slug}/{platform}/{slug}.{ext}
 * README:         problems/{slug}/README.md   (always, no platform subdir)
 * Hints:          problems/{slug}/hints.md    (always, no platform subdir)
 */

/** Increment when the directory layout changes. Stored in index.json. */
export const LAYOUT_VERSION = 2;

/** Base directory for a problem. Directory name is always titleSlug (or canonicalId if set). */
export function problemBase(titleSlug, canonical, settings = {}) {
  const root = (settings?.problems_dir || "problems").replace(/\/+$/, "");
  const dir  = canonical?.canonicalId || titleSlug;
  return `${root}/${dir}`;
}

/**
 * Full path for the solution file.
 *
 * canonical present  → base/{platform}/{slug}.{ext}   (platform subdir for multi-platform problems)
 * canonical absent   → base/{slug}.{ext}              (no subdir — single platform only)
 *
 * The file is ALWAYS named after the problem slug, not the language verbose name.
 * Multiple languages for the same problem produce sibling files: two-sum.py, two-sum.js.
 */
export function solutionPath(titleSlug, platform, lang, canonical, settings = {}) {
  const base = problemBase(titleSlug, canonical, settings);
  const slug = canonical?.canonicalId || titleSlug;
  const ext  = lang.ext || "txt";
  if (canonical?.canonicalId) {
    return `${base}/${platform}/${slug}.${ext}`;
  }
  return `${base}/${slug}.${ext}`;
}

/** README is always at the problem base, never inside a platform subdir. */
export function readmePath(titleSlug, canonical, settings = {}) {
  return `${problemBase(titleSlug, canonical, settings)}/README.md`;
}

/** Hints file is always at the problem base, never inside a platform subdir. */
export function hintsPath(titleSlug, canonical, settings = {}) {
  return `${problemBase(titleSlug, canonical, settings)}/hints.md`;
}

/**
 * Build the complete file list for a solved problem from its stored record.
 * Used by service-worker for resync/pending commits.
 *
 * @param {object} problem  — stored problem record
 * @param {object} settings — user settings
 * @returns {Array<{path: string, content: string}>}
 */
export function buildProblemFiles(problem, settings = {}) {
  const canonical = problem.canonical || null;
  const lang      = problem.lang || { verbose: "Solution", name: "solution", ext: "txt" };
  const ext       = lang.ext || "txt";
  const normalLang = { verbose: lang.verbose || lang.name || "Solution", name: lang.name || "solution", ext };
  const files = [];

  if (problem.code) {
    files.push({
      path: solutionPath(problem.titleSlug || problem.id, problem.platform || "unknown", normalLang, canonical, settings),
      content: problem.code,
    });
  }
  if (problem.readmeContent) {
    files.push({
      path: readmePath(problem.titleSlug || problem.id, canonical, settings),
      content: problem.readmeContent,
    });
  }
  if (problem.hintsContent) {
    files.push({
      path: hintsPath(problem.titleSlug || problem.id, canonical, settings),
      content: problem.hintsContent,
    });
  }
  return files;
}

/**
 * Rebase a file path from oldBase to newBase.
 * Used during canonical-ID reassignment to compute rename targets.
 */
export function rebasePath(oldPath, oldBase, newBase) {
  if (!oldPath.startsWith(oldBase + "/")) return oldPath;
  const rel = oldPath.slice(oldBase.length + 1);
  return `${newBase}/${rel}`;
}
