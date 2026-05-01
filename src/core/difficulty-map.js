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

/**
 * Built-in normalizations for known non-standard difficulty labels.
 * Platform handlers use these automatically so users never need to remap
 * common labels like "School" or "Basic".
 * Keys are lowercased for comparison. Values are canonical Easy/Medium/Hard.
 */
export const BUILT_IN_MAP = {
  // GeeksForGeeks
  "school":         "Easy",
  "basic":          "Easy",
  // Generic
  "trivial":        "Easy",
  "beginner":       "Easy",
  "simple":         "Easy",
  "easy":           "Easy",
  "intermediate":   "Medium",
  "medium":         "Medium",
  "moderate":       "Medium",
  "hard":           "Hard",
  "difficult":      "Hard",
  "advanced":       "Hard",
  "expert":         "Hard",
  "extreme":        "Hard",
  "very hard":      "Hard",
  "extra hard":     "Hard",
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
  if (s.includes("easy") || s.includes("simple") || s.includes("beginner") || s.includes("school") || s.includes("basic")) return "Easy";
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

export async function loadUserDifficultyMap() {
  try {
    const settings = await Storage.getSettings();
    return settings && settings.difficultyMap ? settings.difficultyMap : {};
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
