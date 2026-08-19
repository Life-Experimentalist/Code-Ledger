/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Next-problem suggestions — "what should I solve now?" answered from data the
 * library already holds, with no network call and no AI required.
 *
 * Three signals, in order of how personal they are:
 *
 *  1. Similar problems. LeetCode ships a similar-questions list with every
 *     solve; entries from your most recent solves that you have NOT solved yet
 *     are the closest thing to "the next rung of the ladder you are already
 *     climbing". A candidate named by several recent solves outranks one named
 *     by one.
 *  2. The active roadmap. Whatever milestone `summarizeRoadmap` says you are
 *     on lends a boost to candidates whose source problem serves it, and
 *     contributes its own "work this milestone" entry so a learner with no
 *     unsolved similars still gets a direction.
 *  3. The weakest topic. The tag you have touched but practised least — the
 *     gap the punch card cannot see.
 *
 * Everything is a pure function of (problems, roadmaps) so the Solutions bar,
 * the popup, and any future AI tool can share one ranking.
 */

/** Same folding as roadmap-progress.js tagKey — both sides land on one slug. */
function slugKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** How many recent solves feed the similar-problem signal. */
const RECENT_WINDOW = 20;

/**
 * A human handle for how long ago a solve happened. Coarse on purpose — the
 * reason line says "recently", not a timestamp the user has to parse.
 * @param {number} ts Unix ms
 * @param {number} now Unix ms
 */
function agoLabel(ts, now) {
  const days = Math.floor((now - ts) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  return "a while back";
}

/**
 * Rank unsolved problems worth doing next.
 *
 * @param {Array<Object>} problems everything in the library
 * @param {Object|null} roadmapSummary the return of summarizeRoadmap(), or null
 * @param {{limit?: number, now?: number}} [opts]
 * @returns {Array<{kind: "similar"|"roadmap"|"gap", title: string,
 *   titleSlug?: string, difficulty?: string, url: string, reason: string,
 *   sourceTitle?: string}>}
 */
export function suggestNextProblems(problems, roadmapSummary, opts = {}) {
  const limit = opts.limit ?? 6;
  const now = opts.now ?? Date.now();
  const list = (problems || []).filter((p) => p && (p.titleSlug || p.title));

  const solved = new Set();
  for (const p of list) {
    if (p.titleSlug) solved.add(slugKey(p.titleSlug));
    if (p.canonical?.id) solved.add(slugKey(p.canonical.id));
  }

  const milestone = roadmapSummary?.next || null;
  const milestoneKeys = milestone
    ? new Set([milestone.topic, ...(milestone.subtopics || [])].map(slugKey).filter(Boolean))
    : new Set();

  // ── Signal 1: unsolved similars of recent solves ──────────────────────────
  const recent = [...list]
    .filter((p) => Array.isArray(p.similar) && p.similar.length)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, RECENT_WINDOW);

  /** @type {Map<string, any>} */
  const candidates = new Map();
  recent.forEach((source, idx) => {
    const recency = RECENT_WINDOW - idx; // newest solve weighs most
    const servesMilestone =
      milestoneKeys.size > 0 &&
      [...(source.tags || []), source.topic].some((t) => milestoneKeys.has(slugKey(t)));
    for (const s of source.similar) {
      const key = slugKey(s?.titleSlug);
      if (!key || solved.has(key) || s?.isPaidOnly) continue;
      let c = candidates.get(key);
      if (!c) {
        c = {
          titleSlug: s.titleSlug,
          title: s.title || s.titleSlug,
          difficulty: s.difficulty || "",
          score: 0,
          sources: [],
          servesMilestone: false,
        };
        candidates.set(key, c);
      }
      c.score += recency;
      if (servesMilestone) {
        c.score += RECENT_WINDOW; // roadmap-relevant beats merely recent
        c.servesMilestone = true;
      }
      c.sources.push({ title: source.title || source.titleSlug, ts: source.timestamp || 0 });
    }
  });

  const ranked = [...candidates.values()].sort((a, b) => b.score - a.score);

  /** @type {Array<Object>} */
  const out = [];
  for (const c of ranked) {
    const src = c.sources[0];
    const extra = c.sources.length > 1 ? ` and ${c.sources.length - 1} more` : "";
    const reason = c.servesMilestone
      ? `Serves your “${milestone.topic}” milestone — follows “${src.title}”`
      : `Follows “${src.title}”${extra}, solved ${agoLabel(src.ts, now)}`;
    out.push({
      kind: "similar",
      title: c.title,
      titleSlug: c.titleSlug,
      difficulty: c.difficulty,
      url: `https://leetcode.com/problems/${c.titleSlug}/`,
      reason,
      sourceTitle: src.title,
    });
    if (out.length >= limit) break;
  }

  // ── Signal 2: the roadmap milestone itself ────────────────────────────────
  if (milestone && out.length < limit) {
    const key = slugKey(milestone.subtopics?.[0] || milestone.topic);
    out.push({
      kind: "roadmap",
      title: `Practise ${milestone.topic}`,
      difficulty: milestone.difficulty || "",
      url: `https://leetcode.com/problemset/?topicSlugs=${encodeURIComponent(key)}`,
      reason: `Your roadmap milestone — ${milestone.solved}/${milestone.target} problems in`,
    });
  }

  // ── Signal 3: the least-practised topic ───────────────────────────────────
  if (out.length < limit && list.length >= 5) {
    const counts = new Map();
    const names = new Map();
    for (const p of list) {
      for (const t of p.tags || []) {
        const k = slugKey(t);
        if (!k) continue;
        counts.set(k, (counts.get(k) || 0) + 1);
        if (!names.has(k)) names.set(k, t);
      }
    }
    let weakest = null;
    for (const [k, n] of counts) {
      if (!weakest || n < weakest.n) weakest = { k, n };
    }
    if (weakest && !milestoneKeys.has(weakest.k)) {
      out.push({
        kind: "gap",
        title: `Revisit ${names.get(weakest.k)}`,
        url: `https://leetcode.com/problemset/?topicSlugs=${encodeURIComponent(weakest.k)}`,
        reason: `Your least-practised topic — only ${weakest.n} solve${weakest.n === 1 ? "" : "s"} so far`,
      });
    }
  }

  return out.slice(0, limit);
}
