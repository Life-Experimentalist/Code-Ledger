/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Behavior bank: lightweight event recorder that tracks solve patterns, chat
 * interactions, and hint views to provide richer context for AI suggestions.
 * All data is stored locally via Storage.getBehaviorBank() / setBehaviorBank().
 *
 * Opt-in: only records when settings.behaviorBankEnabled === true.
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
export async function recordSolve({
    slug,
    platform,
    difficulty,
    lang,
    elapsedSeconds,
    tags,
}) {
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
export async function recordChatInteraction({
    slug,
    platform,
    mode,
    commandsUsed,
}) {
    dbg.log(
        `recordChatInteraction(): entering for ${platform}::${slug}, mode=${mode}`
    );
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
    dbg.log(
        `recordHintView(): entering for ${platform}::${slug}, hintIndex=${hintIndex}`
    );
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
        { ts: Date.now(), providerId: providerId || "unknown", length: reviewLength || 0 },
    ].slice(-5);
    bank[key] = entry;
    await save(bank);
    dbg.log(`recordAIReview(): ✓ saved for ${key}`);
}

/**
 * Store a brief AI-review insight snapshot for a problem.
 * `weakAreas` is a string[] of short issue labels (e.g. "edge case", "O(n²)").
 * `summary` is the first ~200 chars of the review.
 */
export async function recordAIInsights({ slug, platform, weakAreas = [], summary = "" }) {
    dbg.log(`recordAIInsights(): entering for ${platform}::${slug}`);
    if (!(await isEnabled())) return;
    const bank = await load();
    const key = `${platform}::${slug}`;
    const entry = bank[key] || { slug, platform };
    entry.aiInsights = [
        ...(entry.aiInsights || []),
        { ts: Date.now(), weakAreas, summary: summary.slice(0, 200) },
    ].slice(-3);
    bank[key] = entry;
    await save(bank);
    dbg.log(`recordAIInsights(): ✓ saved for ${key}`);
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
