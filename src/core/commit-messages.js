/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Centralised commit message taxonomy for CodeLedger.
 */

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
 * Fill a user commit-message template with a solve's data.
 * Supported variables: {topic} {title} {difficulty} {language} {platform} —
 * the exact list the settings UI advertises. Unknown braces pass through.
 *
 * @param {string} template
 * @param {object} data — { title, titleSlug, lang, topic, difficulty, platform }
 */
export function applyCommitTemplate(template, data = {}) {
  const vars = {
    topic: data.topic || "Untagged",
    title: data.title || data.titleSlug || "Unknown",
    difficulty: data.difficulty || "?",
    language: data.lang?.name || data.lang?.slug || "Unknown",
    platform: data.platform || "unknown",
  };
  return template.replace(/\{(topic|title|difficulty|language|platform)\}/g, (_, k) => vars[k]);
}

/**
 * Build a commit message for the given type and data.
 * @param {string} type   — one of COMMIT_TYPES values
 * @param {object} data   — { title, titleSlug, lang, topic, count, platform, detail }
 * @param {string} [template] — user's commitMessageTemplate setting; applies to
 *   solve commits only (the other types have no per-problem variables to fill)
 */
export function buildCommitMessage(type, data = {}, template = "") {
  if (type === COMMIT_TYPES.SOLVED && typeof template === "string" && template.trim()) {
    return applyCommitTemplate(template, data);
  }
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
