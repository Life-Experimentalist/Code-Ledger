/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("LangUtils");

/**
 * Normalize language from various formats to a consistent lowercase string.
 * Handles: lang.name, lang.slug, lang.ext, or plain string.
 * @param {object|string} problem - problem object or language identifier
 * @returns {string} normalized language name (lowercase, trimmed)
 */
export function normalizeLang(problem = {}) {
  const lang =
    problem?.lang?.name || problem?.lang?.slug || problem?.lang?.ext || "";
  return String(lang).toLowerCase().trim();
}
