/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Centralised commit message taxonomy for CodeLedger.
 */

import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("CommitMessages");

export const COMMIT_TYPES = {
  SOLVED: "solved",
  UPDATE: "update",
  COMPREHENSIVE_UPDATE: "comprehensive-update",
  MAINTENANCE: "maintenance",
  CHORE: "chore",
  INIT: "init",
};

const TYPE_MAP = Object.fromEntries(Object.values(COMMIT_TYPES).map((v) => [v, v]));

/** Normalise a string like "comprehensive-update" → COMMIT_TYPES value. */
export function resolveCommitType(str) {
  return TYPE_MAP[str] || COMMIT_TYPES.CHORE;
}

/**
 * Build a commit message for the given type and data.
 * @param {string} type   — one of COMMIT_TYPES values
 * @param {object} data   — { title, titleSlug, lang, topic, count, platform, detail }
 */
export function buildCommitMessage(type, data = {}) {
  switch (type) {
    case COMMIT_TYPES.SOLVED: {
      const lang = data.lang?.name || data.lang?.slug || "Unknown";
      const topic = data.topic || "Untagged";
      const title = data.title || data.titleSlug || "Unknown";
      return `[solved] ${title} (${lang}) — ${topic}`;
    }
    case COMMIT_TYPES.UPDATE: {
      const title = data.title || data.titleSlug || "Unknown";
      return `[update] ${title} — synced`;
    }
    case COMMIT_TYPES.COMPREHENSIVE_UPDATE: {
      const count = data.count ?? 0;
      const platform = data.platform ? ` (${data.platform})` : "";
      return `[comprehensive-update] import ${count} submission${count !== 1 ? "s" : ""}${platform}`;
    }
    case COMMIT_TYPES.MAINTENANCE: {
      const detail = data.detail || "repo updated";
      const count = data.count != null ? ` (${data.count} files)` : "";
      return `[maintenance] ${detail}${count}`;
    }
    case COMMIT_TYPES.CHORE: {
      const count = data.count ?? 0;
      return `[chore] sync ${count} pending problem${count !== 1 ? "s" : ""}`;
    }
    case COMMIT_TYPES.INIT:
      return `[init] CodeLedger repo initialized`;
    default:
      return data.message || `[chore] codeledger update`;
  }
}
