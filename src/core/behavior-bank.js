/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Behavior bank: lightweight event recorder that tracks solve patterns, chat
 * interactions, and hint views to provide richer context for AI suggestions.
 * All data is stored locally via Storage.getBehaviorBank() / setBehaviorBank().
 *
 * Opt-out: records unless settings.behaviorBankEnabled === false.
 */

import { Storage } from "./storage.js";
import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("BehaviorBank");

async function isEnabled() {
  try {
    const s = await Storage.getSettings();
    return s?.behaviorBankEnabled !== false; // opt-out: enabled by default
  } catch {
    return true;
  }
}

async function load() {
  try {
    return (await Storage.getBehaviorBank()) || {};
  } catch {
    return {};
  }
}

async function save(data) {
  try {
    await Storage.setBehaviorBank(data);
  } catch {}
}

/** Record a problem being solved. */
export async function recordSolve({ slug, platform, difficulty, lang, elapsedSeconds, tags }) {
  dbg.log(`recordSolve(): entering for ${platform}::${slug}`);
  if (!(await isEnabled())) {
    dbg.log(`recordSolve(): disabled, skipping`);
    return;
  }
  const bank = await load();
  const key = `${platform}::${slug}`;
  const entry = bank[key] || {
    slug,
    platform,
    difficulty,
    lang,
    tags: tags || [],
    solves: [],
  };
  entry.solves = [
    ...(entry.solves || []),
    {
      ts: Date.now(),
      elapsedSeconds: elapsedSeconds || 0,
      lang,
    },
  ].slice(-10);
  bank[key] = entry;
  await save(bank);
  dbg.log(`recordSolve(): ✓ saved for ${key}`);
}

/** Record a chat interaction (user sent a message). */
export async function recordChatInteraction({ slug, platform, mode, commandsUsed }) {
  dbg.log(`recordChatInteraction(): entering for ${platform}::${slug}, mode=${mode}`);
  if (!(await isEnabled())) {
    dbg.log(`recordChatInteraction(): disabled, skipping`);
    return;
  }
  const bank = await load();
  const statsKey = "__chat_stats__";
  const stats = bank[statsKey] || { total: 0, byMode: {}, byCommand: {} };
  stats.total = (stats.total || 0) + 1;
  if (mode) stats.byMode[mode] = (stats.byMode[mode] || 0) + 1;
  (commandsUsed || []).forEach((cmd) => {
    stats.byCommand[cmd] = (stats.byCommand[cmd] || 0) + 1;
  });
  bank[statsKey] = stats;
  await save(bank);
  dbg.log(`recordChatInteraction(): ✓ recorded, total=${stats.total}`);
}

/** Record a hint being viewed for a problem. */
export async function recordHintView({ slug, platform, hintIndex }) {
  dbg.log(`recordHintView(): entering for ${platform}::${slug}, hintIndex=${hintIndex}`);
  if (!(await isEnabled())) {
    dbg.log(`recordHintView(): disabled, skipping`);
    return;
  }
  const bank = await load();
  const key = `${platform}::${slug}`;
  const entry = bank[key] || { slug, platform, hintViews: 0 };
  entry.hintViews = (entry.hintViews || 0) + 1;
  entry.lastHintIndex = hintIndex ?? null;
  bank[key] = entry;
  await save(bank);
}

/** Return aggregated stats for a given problem slug+platform. */
export async function getProblemStats(slug, platform) {
  const bank = await load();
  return bank[`${platform}::${slug}`] || null;
}

/** Return the global chat stats record. */
export async function getChatStats() {
  const bank = await load();
  return bank["__chat_stats__"] || { total: 0, byMode: {}, byCommand: {} };
}

/**
 * Record an AI review being generated for a problem.
 * Tracks which providers were used and how thorough reviews are over time.
 */
export async function recordAIReview({ slug, platform, providerId, reviewLength }) {
  dbg.log(`recordAIReview(): entering for ${platform}::${slug}`);
  if (!(await isEnabled())) {
    dbg.log(`recordAIReview(): disabled, skipping`);
    return;
  }
  const bank = await load();
  const key = `${platform}::${slug}`;
  const entry = bank[key] || { slug, platform };
  entry.aiReviews = [
    ...(entry.aiReviews || []),
    {
      ts: Date.now(),
      providerId: providerId || "unknown",
      length: reviewLength || 0,
    },
  ].slice(-5);
  bank[key] = entry;
  await save(bank);
  dbg.log(`recordAIReview(): ✓ saved for ${key}`);
}

/**
 * Store a brief AI-review insight snapshot for a problem.
 * `weakAreas` is a string[] of short issue labels (e.g. "edge case", "O(n²)").
 * `summary` is the reviewer's own one-sentence takeaway; when the model dropped
 * that line it is instead the head of the review, and `hasTakeaway` is false so
 * the UI can show it as the raw excerpt it is rather than passing it off as a
 * summary.
 */
export async function recordAIInsights({
  slug,
  platform,
  weakAreas = [],
  summary = "",
  hasTakeaway = false,
}) {
  dbg.log(`recordAIInsights(): entering for ${platform}::${slug}`);
  if (!(await isEnabled())) return;
  const bank = await load();
  const key = `${platform}::${slug}`;
  const entry = bank[key] || { slug, platform };
  entry.aiInsights = [
    ...(entry.aiInsights || []),
    { ts: Date.now(), weakAreas, summary: summary.slice(0, 280), hasTakeaway },
  ].slice(-3);
  bank[key] = entry;
  await save(bank);
  dbg.log(`recordAIInsights(): ✓ saved for ${key}`);
}

/**
 * Record that an AI review rewrote part of a problem's metadata.
 *
 * The review has always been allowed to replace tags, topic, pattern and
 * difficulty, and until now it did so silently — so nothing could distinguish a
 * difficulty the platform stated from one a model decided on, and a learner
 * looking at their own difficulty breakdown had no way to know which they were
 * reading. `fields` is the list of what actually changed, not what the reviewer
 * offered; a reviewer restating a value it did not change is not an edit.
 */
export async function recordAIMetadataEdit({ slug, platform, fields = [] }) {
  if (!Array.isArray(fields) || fields.length === 0) return;
  dbg.log(`recordAIMetadataEdit(): entering for ${platform}::${slug} (${fields.join(", ")})`);
  if (!(await isEnabled())) return;
  const bank = await load();
  const key = `${platform}::${slug}`;
  const entry = bank[key] || { slug, platform };
  entry.aiMetadataEdits = [...(entry.aiMetadataEdits || []), { ts: Date.now(), fields }].slice(-5);
  bank[key] = entry;
  await save(bank);
  dbg.log(`recordAIMetadataEdit(): ✓ saved for ${key}`);
}

/** Return all behavior bank entries as an array for display. */
export async function getAllEntries() {
  const bank = await load();
  return Object.values(bank).filter((v) => typeof v === "object" && v.slug);
}

/** Wipe the behavior bank entirely. */
export async function clearBehaviorBank() {
  await save({});
}

/**
 * Automatically populate behavior bank entries from existing solve history.
 * Scans all stored problems and seeds missing solves/data into the behavior bank.
 */
export async function autoPopulateFromHistory() {
  dbg.log("autoPopulateFromHistory(): starting checks");
  if (!(await isEnabled())) {
    dbg.log("autoPopulateFromHistory(): behavior bank disabled, skipping");
    return;
  }
  const bank = await load();
  let problems = [];
  try {
    problems = (await Storage.getAllProblems()) || [];
  } catch (e) {
    dbg.warn("autoPopulateFromHistory(): failed to load problems:", e?.message);
    return;
  }

  let updated = false;
  for (const p of problems) {
    const slug = p.titleSlug || p.id;
    if (!slug) continue;
    const platform = p.platform || "leetcode";
    const key = `${platform}::${slug}`;

    // Skip if there's already an entry for this problem with solve records
    if (bank[key] && bank[key].solves && bank[key].solves.length > 0) {
      continue;
    }

    // Seed data structure
    const entry = bank[key] || {
      slug,
      platform,
      difficulty: p.difficulty || "",
      lang: p.lang || "unknown",
      tags: p.tags || [],
      solves: [],
    };

    if (Array.isArray(p.solutions) && p.solutions.length > 0) {
      entry.solves = p.solutions
        .map((sol) => ({
          ts: sol.ts || sol.timestamp || p.timestamp || Date.now(),
          elapsedSeconds: sol.meta?.elapsedSeconds || p.elapsedSeconds || 0,
          lang: sol.lang || p.lang || "unknown",
        }))
        .sort((a, b) => a.ts - b.ts)
        .slice(-10);
    } else {
      entry.solves = [
        {
          ts: p.timestamp || Date.now(),
          elapsedSeconds: p.elapsedSeconds || 0,
          lang: p.lang || "unknown",
        },
      ];
    }

    if (p.tags) {
      entry.tags = p.tags;
    }
    if (p.difficulty) {
      entry.difficulty = p.difficulty;
    }
    if (entry.solves.length > 0) {
      entry.lang = entry.solves[entry.solves.length - 1].lang;
    }

    bank[key] = entry;
    updated = true;
  }

  if (updated) {
    await save(bank);
    dbg.log("autoPopulateFromHistory(): behavior bank successfully seeded from solve history");
  } else {
    dbg.log("autoPopulateFromHistory(): no new behavior bank entries needed to seed");
  }
}
