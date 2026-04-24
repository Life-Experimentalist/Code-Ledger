/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Difficulty mapping utilities: normalize raw difficulty labels and
 * provide a persisted per-user mapping for non-standard labels.
 */
import { Storage } from "./storage.js";

function normalizeRaw(raw) {
  if (!raw && raw !== 0) return "";
  return String(raw).trim();
}

export function guessCategory(raw) {
  const s = normalizeRaw(raw).toLowerCase();
  if (!s) return "Easy";
  if (
    s.includes("hard") ||
    s.includes("extra") ||
    s.includes("very hard") ||
    s.includes("extreme")
  )
    return "Hard";
  if (s.includes("med") || s.includes("intermediate")) return "Medium";
  if (s.includes("easy") || s.includes("simple") || s.includes("beginner"))
    return "Easy";
  // fallback for unknown labels: default to Easy as user requested
  return "Easy";
}

export async function loadUserDifficultyMap() {
  try {
    const settings = await Storage.getSettings();
    return settings && settings.difficultyMap ? settings.difficultyMap : {};
  } catch (e) {
    return {};
  }
}

export function mapDifficulty(raw, userMap = {}) {
  const r = normalizeRaw(raw);
  if (!r) return "Easy";
  // exact-match lookup first
  if (userMap && Object.prototype.hasOwnProperty.call(userMap, r)) {
    return userMap[r];
  }
  // case-insensitive match
  const lower = r.toLowerCase();
  for (const k of Object.keys(userMap || {})) {
    if (k.toLowerCase() === lower) return userMap[k];
  }
  // heuristics
  return guessCategory(r);
}
