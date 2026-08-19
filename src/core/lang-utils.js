/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CONSTANTS } from "./constants.js";

/**
 * Normalize language from various formats to a consistent lowercase string.
 * Handles: lang.name, lang.slug, lang.ext, or plain string.
 * @param {object|string} problem - problem object or language identifier
 * @returns {string} normalized language name (lowercase, trimmed)
 */
export function normalizeLang(problem = {}) {
  const lang = problem?.lang?.name || problem?.lang?.slug || problem?.lang?.ext || "";
  return String(lang).toLowerCase().trim();
}

/**
 * The one commit key for a problem: `{platform-scoped id}::{normalized lang}`,
 * or the bare id when the record carries no language at all.
 *
 * This key is written into the persisted pendingProblemKeys map and matched
 * back against it by the service worker's commit sweep, so every writer and
 * reader must build it identically. Before this existed, five UI writers used
 * `titleSlug`-first with spaces stripped while the sweep used `id`-first with
 * spaces kept — their marks stopped matching anything the day ids gained the
 * `lc-`/`gfg-`/`cf-` prefixes, and edits from those surfaces silently never
 * reached GitHub.
 *
 * @param {object} problem
 * @returns {string} the commit key, or "" when there is no usable id
 */
export function getProblemCommitKey(problem = {}) {
  const id = String(
    problem.id ||
      CONSTANTS.makeProblemId(
        problem.platform || "unknown",
        problem.titleSlug || problem.slug || "unknown",
      ),
  ).trim();
  if (!id) return "";

  const lang =
    normalizeLang(problem) ||
    String(problem.language || "")
      .toLowerCase()
      .trim();
  return lang ? `${id}::${lang}` : id;
}
