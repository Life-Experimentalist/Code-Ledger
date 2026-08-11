/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Behaviour profile — the aggregate view of the behaviour bank.
 *
 * behavior-bank.js records per problem, and getProblemStats() reads back one
 * problem at a time, which is all any AI surface has ever had. That answers
 * "how did this problem go" and cannot answer "what does this learner keep
 * getting wrong", because a pattern is by definition not visible inside a
 * single entry. getAllEntries() existed for this and had no callers.
 *
 * Two rules shape what is computed here:
 *
 * 1. Everything is measured against the learner's own history, never a fixed
 *    threshold. A 20-minute median is quick for one person and slow for
 *    another, and advice pinned to an absolute number is wrong for most people.
 *
 * 2. A signal is only a signal if it recurs. A weak area flagged on one problem
 *    is that problem; the same flag on three is a habit. Single occurrences are
 *    dropped rather than reported with a caveat, because the model will use
 *    whatever it is given.
 */

import { getAllEntries, getChatStats } from "./behavior-bank.js";
import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("BehaviorProfile");

/**
 * Below this many recorded problems the aggregate is noise — three entries can
 * make anything look like a trend. The surfaces treat an empty profile as "say
 * nothing", which is the correct behaviour for a new install.
 */
export const MIN_PROBLEMS_FOR_PROFILE = 5;

/** A label must appear on at least this many distinct problems to count. */
const MIN_PROBLEMS_FOR_PATTERN = 2;

/** Timed solves needed before a per-difficulty median means anything. */
const MIN_SAMPLES_FOR_PACE = 3;

const MAX_REPORTED = 5;

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Counts distinct problems per label, then ranks. */
function rankByProblemCount(map, min = MIN_PROBLEMS_FOR_PATTERN) {
  return [...map.entries()]
    .map(([label, problems]) => ({ label, problems: problems.size }))
    .filter((r) => r.problems >= min)
    .sort((a, b) => b.problems - a.problems || a.label.localeCompare(b.label))
    .slice(0, MAX_REPORTED);
}

/**
 * Derive the aggregate profile from raw bank entries.
 *
 * Pure — takes the data rather than reading storage, so the shape of every
 * derived number is testable without a browser.
 *
 * @param {Array<Object>} entries    from getAllEntries()
 * @param {Object|null} [chatStats]  from getChatStats()
 * @returns {Object} profile; `problemCount` is 0 when there is too little to say
 */
export function buildBehaviorProfile(entries = [], chatStats = null) {
  const problems = (entries || []).filter((e) => e && e.slug);
  if (problems.length < MIN_PROBLEMS_FOR_PROFILE) {
    dbg.log(
      `buildBehaviorProfile(): ${problems.length} problem(s) — below the floor, empty profile`,
    );
    return emptyProfile();
  }

  const weakAreas = new Map(); // label → Set of problem keys
  const strainedTopics = new Map(); // tag → Set of problem keys
  const paceBuckets = new Map(); // difficulty → number[]
  const languages = new Map(); // language → count

  let withHints = 0;
  let hintTotal = 0;
  let withResubmits = 0;

  for (const entry of problems) {
    const key = `${entry.platform}::${entry.slug}`;

    for (const insight of entry.aiInsights || []) {
      for (const raw of insight?.weakAreas || []) {
        const label = String(raw || "")
          .trim()
          .toLowerCase();
        if (!label) continue;
        if (!weakAreas.has(label)) weakAreas.set(label, new Set());
        weakAreas.get(label).add(key);
      }
    }

    const solves = entry.solves || [];
    const hints = entry.hintViews || 0;
    if (hints > 0) {
      withHints++;
      hintTotal += hints;
    }
    if (solves.length > 1) withResubmits++;

    // A topic is "under strain" when the learner needed help on it — a hint, a
    // resubmit, or a review that flagged something. Tag frequency alone would
    // just rank the topics they solve most, which is the opposite signal.
    const struggled = hints > 0 || solves.length > 1 || (entry.aiInsights || []).length > 0;
    if (struggled) {
      for (const raw of entry.tags || []) {
        const tag = String(raw || "").trim();
        if (!tag) continue;
        if (!strainedTopics.has(tag)) strainedTopics.set(tag, new Set());
        strainedTopics.get(tag).add(key);
      }
    }

    // elapsedSeconds is 0 when the floating timer was never started, which is
    // not a fast solve — those samples have to be dropped, not averaged in.
    const difficulty = entry.difficulty || "Unknown";
    for (const solve of solves) {
      const seconds = Number(solve?.elapsedSeconds) || 0;
      if (seconds > 0) {
        if (!paceBuckets.has(difficulty)) paceBuckets.set(difficulty, []);
        paceBuckets.get(difficulty).push(seconds);
      }
      const langName = solve?.lang?.name || entry.lang?.name || "";
      if (langName) languages.set(langName, (languages.get(langName) || 0) + 1);
    }
  }

  const paceByDifficulty = {};
  for (const [difficulty, samples] of paceBuckets) {
    if (samples.length >= MIN_SAMPLES_FOR_PACE) {
      paceByDifficulty[difficulty] = { medianSeconds: median(samples), samples: samples.length };
    }
  }

  const profile = {
    problemCount: problems.length,
    recurringWeakAreas: rankByProblemCount(weakAreas),
    topicsUnderStrain: rankByProblemCount(strainedTopics),
    paceByDifficulty,
    hintRate: problems.length ? withHints / problems.length : 0,
    hintTotal,
    resubmitRate: problems.length ? withResubmits / problems.length : 0,
    topLanguage: [...languages.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "",
    chatTotal: Number(chatStats?.total) || 0,
  };
  dbg.log(
    `buildBehaviorProfile(): ${profile.problemCount} problems, ` +
      `${profile.recurringWeakAreas.length} recurring flag(s), ` +
      `${profile.topicsUnderStrain.length} strained topic(s)`,
  );
  return profile;
}

function emptyProfile() {
  return {
    problemCount: 0,
    recurringWeakAreas: [],
    topicsUnderStrain: [],
    paceByDifficulty: {},
    hintRate: 0,
    hintTotal: 0,
    resubmitRate: 0,
    topLanguage: "",
    chatTotal: 0,
  };
}

function formatDuration(seconds) {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds)}s`;
}

/**
 * Render the profile as a prompt block, or "" when there is nothing worth
 * saying. Callers append it verbatim; an empty string must stay empty rather
 * than becoming an "unknown learner" section, which would spend tokens telling
 * the model it knows nothing.
 *
 * @param {Object} profile from buildBehaviorProfile()
 * @returns {string}
 */
export function formatProfileForPrompt(profile) {
  if (!profile || !profile.problemCount) return "";

  const lines = [];
  if (profile.recurringWeakAreas.length) {
    lines.push(
      `- Recurring review flags: ` +
        profile.recurringWeakAreas.map((w) => `${w.label} (${w.problems} problems)`).join(", "),
    );
  }
  if (profile.topicsUnderStrain.length) {
    lines.push(
      `- Topics that needed help: ` +
        profile.topicsUnderStrain.map((t) => `${t.label} (${t.problems})`).join(", "),
    );
  }
  const pace = Object.entries(profile.paceByDifficulty)
    .map(([difficulty, p]) => `${difficulty} ~${formatDuration(p.medianSeconds)}`)
    .join(", ");
  if (pace) lines.push(`- Typical pace (median of timed solves): ${pace}`);
  if (profile.hintRate > 0) {
    lines.push(`- Views hints on ${Math.round(profile.hintRate * 100)}% of problems`);
  }
  if (profile.resubmitRate > 0) {
    lines.push(`- Resubmits on ${Math.round(profile.resubmitRate * 100)}% of problems`);
  }
  if (profile.topLanguage) lines.push(`- Usually writes ${profile.topLanguage}`);

  if (!lines.length) return "";

  return (
    `## Learner profile (across ${profile.problemCount} recorded problems)\n` +
    lines.join("\n") +
    `\n\nUse this to pitch the depth, the examples and the choice of what to ` +
    `emphasise. Address a recurring flag directly when this solution shows it ` +
    `again. Do not recite these statistics back to the learner.`
  );
}

/**
 * Load the bank and build the profile. Never throws — every AI surface calls
 * this on a path where failing to add context must not fail the request.
 *
 * @returns {Promise<Object>}
 */
export async function getBehaviorProfile() {
  try {
    const [entries, chatStats] = await Promise.all([
      getAllEntries().catch(() => []),
      getChatStats().catch(() => null),
    ]);
    return buildBehaviorProfile(entries, chatStats);
  } catch (e) {
    dbg.warn(`getBehaviorProfile(): failed, returning empty profile:`, e?.message);
    return emptyProfile();
  }
}

/**
 * Convenience for the AI surfaces: the prompt block, or "" if there is nothing
 * to say or the learner turned recording off.
 *
 * @returns {Promise<string>}
 */
export async function getProfileContext() {
  return formatProfileForPrompt(await getBehaviorProfile());
}
