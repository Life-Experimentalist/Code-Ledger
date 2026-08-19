/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Difficulty mapping utilities: normalize raw difficulty labels and
 * provide a persisted per-user mapping for non-standard labels.
 *
 * Authority order when normalizing:
 *   1. User overrides (settings.difficultyMap)
 *   2. BUILT_IN_MAP (known platform labels)
 *   3. Heuristic pattern matching
 */

import { Storage } from "./storage.js";

/** The only difficulty values the rest of the app stores or filters on. */
export const CANONICAL = ["Easy", "Medium", "Hard"];

/**
 * Built-in normalizations for known non-standard difficulty labels.
 * Platform handlers use these automatically so users never need to remap
 * common labels like "School" or "Basic".
 * Keys are lowercased for comparison. Values are canonical Easy/Medium/Hard.
 */
export const BUILT_IN_MAP = {
  // GeeksForGeeks
  school: "Easy",
  basic: "Easy",
  // Generic
  trivial: "Easy",
  beginner: "Easy",
  simple: "Easy",
  easy: "Easy",
  intermediate: "Medium",
  medium: "Medium",
  moderate: "Medium",
  hard: "Hard",
  difficult: "Hard",
  advanced: "Hard",
  expert: "Hard",
  extreme: "Hard",
  "very hard": "Hard",
  "extra hard": "Hard",
};

function normalizeRaw(raw) {
  if (!raw && raw !== 0) return "";
  return String(raw).trim();
}

export function guessCategory(raw) {
  const s = normalizeRaw(raw).toLowerCase();
  if (!s || s === "unknown") return "Unknown";
  // Exact built-in match
  if (BUILT_IN_MAP[s]) return BUILT_IN_MAP[s];
  // Substring heuristics (catches "Very Hard", "Extra Hard", etc.)
  if (s.includes("very hard") || s.includes("extra") || s.includes("extreme")) return "Hard";
  if (s.includes("hard")) return "Hard";
  if (s.includes("med") || s.includes("intermediate") || s.includes("moderate")) return "Medium";
  if (
    s.includes("easy") ||
    s.includes("simple") ||
    s.includes("beginner") ||
    s.includes("school") ||
    s.includes("basic")
  )
    return "Easy";
  return "Unknown";
}

/**
 * Synchronous normalizer for platform handlers.
 * Applies BUILT_IN_MAP first, then heuristics.
 * User overrides (if provided) take highest priority.
 * @param {string} raw - raw difficulty string from the platform
 * @param {Record<string,string>} [userMap] - optional user override map
 * @returns {"Easy"|"Medium"|"Hard"|"Unknown"}
 */
export function normalizeDifficulty(raw, userMap = {}) {
  const r = normalizeRaw(raw);
  if (!r) return "Unknown";
  const lower = r.toLowerCase();

  // 1. Exact user override
  if (userMap && Object.prototype.hasOwnProperty.call(userMap, r)) return userMap[r];
  // 2. Case-insensitive user override
  for (const k of Object.keys(userMap || {})) {
    if (k.toLowerCase() === lower) return userMap[k];
  }
  // 3. Built-in map (exact)
  if (BUILT_IN_MAP[lower]) return BUILT_IN_MAP[lower];
  // 4. Heuristics
  return guessCategory(r);
}

/**
 * Build the raw→canonical override map from settings.
 *
 * Two sources feed it: the global `settings.difficultyMap` (already
 * raw→canonical), and the per-platform alias maps the Platforms panel writes
 * as `${pid}_difficultyMap` in the opposite orientation — canonical level →
 * the label that platform uses ({ Easy: "School" }). The per-platform maps
 * are inverted here so "School" normalizes to Easy; the global map is applied
 * last and wins on conflict, since it is the explicit raw-label form.
 *
 * @param {Record<string, any>} [settings]
 * @returns {Record<string, string>} raw label → canonical Easy/Medium/Hard
 */
export function buildUserDifficultyMap(settings = {}) {
  const map = {};
  for (const [key, val] of Object.entries(settings || {})) {
    if (key === "difficultyMap" || !key.endsWith("_difficultyMap")) continue;
    if (!val || typeof val !== "object") continue;
    for (const [level, alias] of Object.entries(val)) {
      if (CANONICAL.includes(level) && typeof alias === "string" && alias.trim()) {
        map[alias.trim()] = level;
      }
    }
  }
  Object.assign(map, (settings && settings.difficultyMap) || {});
  return map;
}

export async function loadUserDifficultyMap() {
  try {
    const settings = await Storage.getSettings();
    return buildUserDifficultyMap(settings);
  } catch (e) {
    return {};
  }
}

/**
 * Full async normalizer: loads user map then applies normalizeDifficulty.
 * Use this in rendering contexts (heatmap, analytics).
 * Handlers should call normalizeDifficulty() synchronously with a cached userMap instead.
 */
export function mapDifficulty(raw, userMap = {}) {
  return normalizeDifficulty(raw, userMap);
}

/**
 * Count problems into the canonical buckets.
 *
 * Every caller that needed these numbers wrote its own
 * `problems.filter((p) => p.difficulty === "Easy").length`, which is only
 * correct for a platform that uses that exact word. GeeksForGeeks grades
 * School and Basic, Codeforces gives numeric ratings, and a user difficulty
 * map can rename anything — all of which counted as nothing, so a repository
 * full of solves published 0 / 0 / 0 to its stats page and its badges.
 *
 * `unknown` is returned rather than folded into a bucket: a label nobody can
 * classify is a real answer, and silently filing it under Easy would misreport
 * the split rather than admit the gap.
 *
 * @param {Array<{difficulty?: string}>} problems
 * @param {Record<string,string>} [userMap] settings.difficultyMap
 * @returns {{easy: number, medium: number, hard: number, unknown: number}}
 */
export function countByDifficulty(problems = [], userMap = {}) {
  const counts = { easy: 0, medium: 0, hard: 0, unknown: 0 };
  for (const p of problems || []) {
    switch (normalizeDifficulty(p?.difficulty, userMap)) {
      case "Easy":
        counts.easy++;
        break;
      case "Medium":
        counts.medium++;
        break;
      case "Hard":
        counts.hard++;
        break;
      default:
        counts.unknown++;
    }
  }
  return counts;
}
