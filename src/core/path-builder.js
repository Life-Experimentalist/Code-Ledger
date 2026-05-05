/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Centralised problem-path computation.
 *
 * Directory layout:
 *   With canonical:    {root}/{canonicalId}/{platform}/{Lang}.{ext}
 *   Without canonical: {root}/{slug}/{Lang}.{ext}          (no platform subdir)
 *   README always at:  {root}/{dir}/README.md
 */

export function problemBase(titleSlug, canonical, settings = {}) {
  const root = (settings?.problems_dir || "problems").replace(/\/+$/, "");
  const dir  = canonical?.canonicalId || titleSlug;
  return `${root}/${dir}`;
}

export function solutionPath(titleSlug, platform, lang, canonical, settings = {}) {
  const base     = problemBase(titleSlug, canonical, settings);
  const filename = `${(lang.verbose || lang.name || "Solution").replace(/\s+/g, "_")}.${lang.ext || "txt"}`;
  if (canonical?.canonicalId) {
    return `${base}/${platform}/${filename}`;
  }
  return `${base}/${filename}`;
}

export function readmePath(titleSlug, canonical, settings = {}) {
  return `${problemBase(titleSlug, canonical, settings)}/README.md`;
}

export function hintsPath(titleSlug, canonical, settings = {}) {
  return `${problemBase(titleSlug, canonical, settings)}/hints.md`;
}

/**
 * Build the complete file list for a solved problem.
 * Mirrors the shape used by service-worker getProblemFiles().
 *
 * @param {object} problem  — stored problem record
 * @param {object} settings — user settings
 * @returns {Array<{path: string, content: string}>}
 */
export function buildProblemFiles(problem, settings = {}) {
  const canonical = problem.canonical || null;
  const lang = problem.lang || { verbose: "Solution", name: "solution", ext: "txt" };
  const verbose = lang.verbose || lang.name || "Solution";
  const ext = lang.ext || "txt";
  const normalLang = { verbose, name: lang.name || verbose, ext };

  const files = [];

  if (problem.code) {
    files.push({
      path: solutionPath(problem.titleSlug || problem.id, problem.platform, normalLang, canonical, settings),
      content: problem.code,
    });
  }

  if (problem.readmeContent) {
    files.push({
      path: readmePath(problem.titleSlug || problem.id, canonical, settings),
      content: problem.readmeContent,
    });
  }

  return files;
}

/**
 * Given an old stored path prefix (old base dir) and new base dir,
 * returns the new path for any file at oldPath.
 * Used during canonical-ID reassignment to compute rename targets.
 *
 * @param {string} oldPath   — e.g. "problems/two-sum/Python3.py"
 * @param {string} oldBase   — e.g. "problems/two-sum"
 * @param {string} newBase   — e.g. "problems/two-sum/leetcode"
 * @returns {string}
 */
export function rebasePath(oldPath, oldBase, newBase) {
  if (!oldPath.startsWith(oldBase + "/")) return oldPath;
  const rel = oldPath.slice(oldBase.length + 1);
  return `${newBase}/${rel}`;
}
