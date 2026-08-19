/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Topic taxonomy: which axis a topic belongs to, and how well it is known.
 *
 * The problem this solves: "Array" is tagged on roughly half of all LeetCode
 * problems, and it is a container, not a skill. Counting it alongside "Dynamic
 * Programming" in one flat list makes every chart say the same thing — that you
 * have done a lot of array problems — and buries the signal anyone actually
 * wants, which is whether they can write a DP.
 *
 * So topics are split onto two independent axes:
 *
 *   - **Data structure** — what the problem is stored in. Array, Hash Table,
 *     Tree, Graph, Trie. Nearly always present, weak signal on its own.
 *   - **Algorithm** — what you had to think of. DP, Greedy, Binary Search,
 *     Backtracking, Topological Sort. Often absent, strong signal.
 *
 * with a third bucket for tags that are neither (Database, Shell, Concurrency,
 * Design, Interactive). Analysed separately, "40 array problems, 3 of them
 * needing an actual algorithm" is a sentence worth reading.
 *
 * The classification is editable. Platforms invent tags constantly and no fixed
 * table stays right, so `settings.topicKinds` overrides anything here and the
 * heuristic only runs when neither has an answer.
 *
 * Alias merging is delegated to `normalizeTag` in topic-resolver.js, which
 * already maps LeetCode's "Dynamic Programming", GeeksforGeeks' "dynamic
 * programming" and Codeforces' "dp" onto one canonical name — which is what
 * makes a single topic node across platforms possible.
 */

import { normalizeTag } from "./topic-resolver.js";

/** The three axes. `ds` and `algo` are the ones worth charting against. */
export const KIND = Object.freeze({
  DS: "ds",
  ALGO: "algo",
  DOMAIN: "domain",
});

export const KIND_LABEL = Object.freeze({
  ds: "Data structure",
  algo: "Algorithm",
  domain: "Other",
});

/** Group headers, wherever topics of one axis are listed together. */
export const KIND_LABEL_PLURAL = Object.freeze({
  ds: "Data structures",
  algo: "Algorithms",
  domain: "Other",
});

/**
 * Display order wherever the axes appear side by side: the algorithm first
 * (what you had to think of), then the structure (what held the data), then
 * the rest. Every grouped list in the UI follows this so the same tag always
 * appears in the same place.
 */
export const KIND_ORDER = Object.freeze([KIND.ALGO, KIND.DS, KIND.DOMAIN]);

/**
 * Canonical topic → axis. Keys are the canonical names `normalizeTag` emits.
 *
 * Judgement calls worth recording, because they will be argued with:
 *   - "Sorting" is an algorithm, not a structure — you are being asked to think
 *     about ordering, even when the platform means "call .sort()".
 *   - "Binary Search Tree" is a structure; "Binary Search" is an algorithm.
 *     They are one character apart in a tag list and mean entirely different
 *     things about what you can do.
 *   - "Matrix" is a structure (a 2-D array), not a technique.
 *   - "Design" is neither — it is a question format.
 */
export const BUILT_IN_KINDS = Object.freeze({
  // ── Data structures ────────────────────────────────────────────────
  Array: KIND.DS,
  String: KIND.DS,
  Matrix: KIND.DS,
  "Hash Table": KIND.DS,
  "Linked List": KIND.DS,
  "Doubly Linked List": KIND.DS,
  Stack: KIND.DS,
  Queue: KIND.DS,
  Deque: KIND.DS,
  "Heap (Priority Queue)": KIND.DS,
  Tree: KIND.DS,
  "Binary Tree": KIND.DS,
  "Binary Search Tree": KIND.DS,
  Trie: KIND.DS,
  Graph: KIND.DS,
  "Segment Tree": KIND.DS,
  "Binary Indexed Tree": KIND.DS,
  "Union Find": KIND.DS,
  "Ordered Set": KIND.DS,
  "Suffix Array": KIND.DS,
  "Data Stream": KIND.DS,
  Iterator: KIND.DS,

  // ── Algorithms and techniques ──────────────────────────────────────
  "Dynamic Programming": KIND.ALGO,
  Memoization: KIND.ALGO,
  Greedy: KIND.ALGO,
  Recursion: KIND.ALGO,
  Backtracking: KIND.ALGO,
  "Divide and Conquer": KIND.ALGO,
  "Binary Search": KIND.ALGO,
  Sorting: KIND.ALGO,
  "Merge Sort": KIND.ALGO,
  "Counting Sort": KIND.ALGO,
  "Bucket Sort": KIND.ALGO,
  "Radix Sort": KIND.ALGO,
  Quickselect: KIND.ALGO,
  "Two Pointers": KIND.ALGO,
  "Sliding Window": KIND.ALGO,
  "Prefix Sum": KIND.ALGO,
  "Bit Manipulation": KIND.ALGO,
  Bitmask: KIND.ALGO,
  "Depth-First Search": KIND.ALGO,
  "Breadth-First Search": KIND.ALGO,
  "Topological Sort": KIND.ALGO,
  "Shortest Path": KIND.ALGO,
  "Minimum Spanning Tree": KIND.ALGO,
  "Strongly Connected Component": KIND.ALGO,
  "Eulerian Circuit": KIND.ALGO,
  "Biconnected Component": KIND.ALGO,
  "Line Sweep": KIND.ALGO,
  "String Matching": KIND.ALGO,
  "Rolling Hash": KIND.ALGO,
  "Hash Function": KIND.ALGO,
  Math: KIND.ALGO,
  "Number Theory": KIND.ALGO,
  Combinatorics: KIND.ALGO,
  Geometry: KIND.ALGO,
  "Game Theory": KIND.ALGO,
  Probability: KIND.ALGO,
  Randomized: KIND.ALGO,
  "Reservoir Sampling": KIND.ALGO,
  "Rejection Sampling": KIND.ALGO,
  Counting: KIND.ALGO,
  Enumeration: KIND.ALGO,
  Simulation: KIND.ALGO,
  "Brute Force": KIND.ALGO,
  Constructive: KIND.ALGO,
  "Ternary Search": KIND.ALGO,
  // `normalizeTag` title-cases every word of an unmapped tag, so the key that
  // actually arrives here is "Meet In The Middle", not the English spelling.
  "Meet In The Middle": KIND.ALGO,
  "Max Flow": KIND.ALGO,
  Matching: KIND.ALGO,
  // No "Monotonic Stack" / "Monotonic Queue" entries: topic-resolver folds those
  // aliases into Stack and Queue, so keys for them would never be reached.

  // ── Neither ────────────────────────────────────────────────────────
  Design: KIND.DOMAIN,
  Database: KIND.DOMAIN,
  Shell: KIND.DOMAIN,
  Concurrency: KIND.DOMAIN,
  Interactive: KIND.DOMAIN,
  Brainteaser: KIND.DOMAIN,
  Implementation: KIND.DOMAIN,
  Untagged: KIND.DOMAIN,
});

/**
 * Last-resort classification for a tag no table knows. Ordered most to least
 * specific — "binary search tree" has to lose to the structure rule before the
 * word "search" reaches the algorithm rule.
 */
const HEURISTICS = [
  [
    /\b(tree|heap|list|stack|queue|trie|graph|table|array|matrix|set|map|deque|buffer|structure)\b/,
    KIND.DS,
  ],
  [
    /\b(sort|search|traversal|dp|programming|greedy|recursion|divide|sweep|flow|path|algorithm|technique|method)\b/,
    KIND.ALGO,
  ],
  [/\b(sql|database|shell|design|concurrency|thread|system|interactive|puzzle)\b/, KIND.DOMAIN],
];

/**
 * Classify one raw tag.
 *
 * A `kind` of `null` means the tag carries no information and should be
 * dropped, not bucketed — `normalizeTag` returns "" for umbrella tags like
 * "dsa", "algorithms" and "data structures", which every problem on some
 * platforms carries and which would otherwise become the largest node on the
 * graph while meaning nothing.
 *
 * @param {string} raw a tag as it appeared on the platform
 * @param {Record<string,string>} [overrides] `settings.topicKinds`, canonical name → kind
 * @returns {{ topic: string, kind: string|null, source: "user"|"builtin"|"heuristic"|"default"|"ignored" }}
 */
export function classifyTopic(raw, overrides = {}) {
  const topic = normalizeTag(raw);
  if (!topic) return { topic: "", kind: null, source: "ignored" };

  if (overrides && Object.prototype.hasOwnProperty.call(overrides, topic)) {
    const k = overrides[topic];
    if (k === KIND.DS || k === KIND.ALGO || k === KIND.DOMAIN) {
      return { topic, kind: k, source: "user" };
    }
  }

  if (BUILT_IN_KINDS[topic]) return { topic, kind: BUILT_IN_KINDS[topic], source: "builtin" };

  const lower = String(raw ?? "").toLowerCase();
  for (const [pattern, kind] of HEURISTICS) {
    if (pattern.test(lower)) return { topic, kind, source: "heuristic" };
  }

  // An unrecognised tag is far more often a niche technique than a structure —
  // platforms name their structures conventionally and their techniques freely.
  return { topic, kind: KIND.ALGO, source: "default" };
}

/**
 * Split one problem's tags onto the two axes.
 *
 * @param {string[]} tags
 * @param {Record<string,string>} [overrides]
 * @returns {{ ds: string[], algo: string[], domain: string[] }}
 */
export function splitTags(tags, overrides = {}) {
  const out = { ds: [], algo: [], domain: [] };
  const seen = new Set();
  for (const t of tags || []) {
    if (!t) continue;
    const { topic, kind } = classifyTopic(t, overrides);
    if (!kind) continue;
    const key = `${kind}:${topic}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out[kind].push(topic);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Mastery                                                             */
/* ------------------------------------------------------------------ */

const MS_PER_DAY = 86_400_000;

/**
 * How well a topic is held, on 0..1.
 *
 * Two independent factors, multiplied:
 *
 *   - **Volume.** Saturating, not linear — the tenth DP problem teaches far
 *     less than the second, so the curve flattens. Five distinct problems on a
 *     topic reaches roughly 0.7; twenty reaches roughly 0.95.
 *   - **Recency.** Decays with a half-life, because a topic solved once a year
 *     ago is not held. Never reaches zero: you do not entirely forget.
 *
 * Multiplying rather than averaging is deliberate. A topic you hammered a year
 * ago and a topic you touched once yesterday are both weak, for different
 * reasons, and an average would call them medium.
 *
 * @param {{ count: number, lastSolved: number }} stat
 * @param {{ now?: number, halfLifeDays?: number }} [opts]
 * @returns {number} 0..1
 */
export function masteryScore(stat, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const halfLife = opts.halfLifeDays ?? 90;
  const count = Math.max(0, stat?.count || 0);
  if (!count) return 0;

  const volume = 1 - Math.exp(-count / 5);

  const days = Number.isFinite(stat.lastSolved)
    ? Math.max(0, (now - stat.lastSolved) / MS_PER_DAY)
    : Infinity;
  // Floors at 0.25 — a decayed topic is rusty, not erased.
  const recency = 0.25 + 0.75 * Math.pow(0.5, days / halfLife);

  return Math.max(0, Math.min(1, volume * recency));
}

/** Coarse bands, for colouring nodes without exposing a float to the user. */
export function masteryBand(score) {
  if (score >= 0.7) return "strong";
  if (score >= 0.4) return "working";
  if (score > 0) return "shaky";
  return "untouched";
}

/**
 * The moment mastery decays from, with a regain bar: one stray solve does not
 * refresh a rusty topic. The clock only rewinds as far as the Nth most recent
 * solve, so it takes `regainSolves` recent problems before the topic counts
 * as back in touch. A topic with fewer solves than the bar uses its oldest —
 * a brand-new topic is not penalised for being new.
 *
 * @param {number[]} timestampsDesc solve times, newest first
 * @param {number} [regainSolves]
 * @returns {number} epoch ms, or -Infinity with no usable solves
 */
export function effectiveLastSolved(timestampsDesc, regainSolves = 2) {
  const list = Array.isArray(timestampsDesc) ? timestampsDesc : [];
  if (!list.length) return -Infinity;
  const n = Math.max(1, Math.min(Math.floor(regainSolves) || 1, list.length));
  return list[n - 1];
}

/**
 * The user-configurable mastery knobs, read off the settings map with clamps
 * and defaults. Single authority — the graph, the gap report, and the settings
 * panel all go through this so they can never disagree on the defaults.
 *
 * @param {object|null} settings
 * @returns {{ halfLifeDays: number, regainSolves: number }}
 */
export function masteryOptsFromSettings(settings) {
  const num = (v, lo, hi, dflt) => {
    // Number(null) and Number("") are 0, which would silently clamp an unset
    // knob to the floor instead of falling back to the default.
    if (v === null || v === undefined || v === "") return dflt;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };
  return {
    halfLifeDays: num(settings?.mastery_half_life_days, 7, 3650, 90),
    regainSolves: num(settings?.mastery_regain_solves, 1, 8, 2),
  };
}

/**
 * Per-topic mastery across the whole ledger.
 *
 * @param {Array<object>} problems
 * @param {{ now?: number, overrides?: Record<string,string>, halfLifeDays?: number,
 *   regainSolves?: number }} [opts]
 * @returns {Array<{ topic:string, kind:string, count:number, platforms:string[],
 *   byDifficulty:Record<string,number>, lastSolved:number, daysSince:number,
 *   mastery:number, band:string }>}
 */
export function topicMastery(problems, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const overrides = opts.overrides || {};
  const acc = new Map();

  for (const p of problems || []) {
    if (!p) continue;
    const ts = Number(p.timestamp);
    const tags = p.tags && p.tags.length ? p.tags : [p.topic].filter(Boolean);
    if (!tags.length) continue;

    // Dedupe within the problem first. A problem tagged both "hash map" and
    // "hashtable" is one hash-table solve, not two, and counting it twice would
    // inflate the mastery of exactly the topics platforms tag most sloppily.
    const perProblem = new Map();
    for (const raw of tags) {
      if (!raw) continue;
      const { topic, kind } = classifyTopic(raw, overrides);
      if (!kind) continue;
      perProblem.set(topic, kind);
    }

    for (const [topic, kind] of perProblem) {
      let e = acc.get(topic);
      if (!e) {
        e = {
          topic,
          kind,
          count: 0,
          platforms: new Set(),
          byDifficulty: {},
          lastSolved: -Infinity,
          recent: [],
        };
        acc.set(topic, e);
      }
      e.count += 1;
      if (p.platform) e.platforms.add(p.platform);
      const d = p.difficulty || "Unknown";
      e.byDifficulty[d] = (e.byDifficulty[d] || 0) + 1;
      if (Number.isFinite(ts)) {
        if (ts > e.lastSolved) e.lastSolved = ts;
        e.recent.push(ts);
      }
    }
  }

  return [...acc.values()]
    .map((e) => {
      // Recency decays from the Nth-most-recent solve, not the very last one —
      // the regain bar. Display fields keep the true latest.
      const recent = e.recent.sort((a, b) => b - a).slice(0, 8);
      const mastery = masteryScore(
        { count: e.count, lastSolved: effectiveLastSolved(recent, opts.regainSolves) },
        { now, halfLifeDays: opts.halfLifeDays },
      );
      return {
        topic: e.topic,
        kind: e.kind,
        count: e.count,
        platforms: [...e.platforms].sort(),
        byDifficulty: e.byDifficulty,
        lastSolved: Number.isFinite(e.lastSolved) ? e.lastSolved : null,
        daysSince: Number.isFinite(e.lastSolved)
          ? Math.floor((now - e.lastSolved) / MS_PER_DAY)
          : null,
        mastery,
        band: masteryBand(mastery),
      };
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * The gap report: what is weak, per axis.
 *
 * Data structures and algorithms are ranked separately and never compared with
 * each other, which is the whole point of the split — "you are weak on Trie"
 * and "you are weak on DP" are different kinds of advice and mixing them into
 * one leaderboard lets Array drown out both.
 *
 * @param {Array<object>} problems
 * @param {{ now?: number, overrides?: Record<string,string>, limit?: number, minCount?: number,
 *   halfLifeDays?: number, regainSolves?: number }} [opts]
 * @returns {{ ds: object[], algo: object[], domain: object[], untouched: object[], summary: object }}
 */
export function topicGaps(problems, opts = {}) {
  const limit = opts.limit ?? 5;
  const all = topicMastery(problems, opts);

  const weakest = (kind) =>
    all
      .filter((t) => t.kind === kind && t.count >= (opts.minCount ?? 1))
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, limit);

  // Well-known topics with no solves at all — the real blind spots, which by
  // definition never appear in the ledger and so can only come from the table.
  const seen = new Set(all.map((t) => t.topic));
  const untouched = Object.entries(BUILT_IN_KINDS)
    .filter(([topic, kind]) => kind !== KIND.DOMAIN && !seen.has(topic))
    .map(([topic, kind]) => ({ topic, kind, count: 0, mastery: 0, band: "untouched" }));

  const count = (kind) => all.filter((t) => t.kind === kind).length;
  return {
    ds: weakest(KIND.DS),
    algo: weakest(KIND.ALGO),
    domain: all.filter((t) => t.kind === KIND.DOMAIN),
    untouched,
    summary: {
      dsTopics: count(KIND.DS),
      algoTopics: count(KIND.ALGO),
      domainTopics: count(KIND.DOMAIN),
      /**
       * Share of solves that needed an algorithm rather than just a structure.
       * The single most useful number this module produces: a high solve count
       * with a low ratio is someone doing easy array problems on repeat.
       */
      algoRatio: (() => {
        const ds = all.filter((t) => t.kind === KIND.DS).reduce((s, t) => s + t.count, 0);
        const algo = all.filter((t) => t.kind === KIND.ALGO).reduce((s, t) => s + t.count, 0);
        return ds + algo === 0 ? 0 : algo / (ds + algo);
      })(),
    },
  };
}

/**
 * Nodes and edges for the topic graph, with cross-platform merging.
 *
 * A canonical problem solved on both LeetCode and GeeksforGeeks is one node
 * carrying both platforms, not two — that is what `canonicalId` is for. Topic
 * nodes merge the same way, so "dp" from Codeforces and "Dynamic Programming"
 * from LeetCode are one node with a combined count.
 *
 * Edges connect a topic to a problem, and topics to each other when they
 * co-occur, weighted by how often. Co-occurrence is what makes the layout
 * meaningful: DP sits next to Memoization because they appear together.
 *
 * @param {Array<object>} problems
 * @param {{ now?: number, overrides?: Record<string,string>, minCoOccurrence?: number }} [opts]
 * @returns {{ nodes: object[], links: object[] }}
 */
export function buildTopicGraph(problems, opts = {}) {
  const minCo = opts.minCoOccurrence ?? 2;
  const mastery = topicMastery(problems, opts);
  const byTopic = new Map(mastery.map((t) => [t.topic, t]));

  const nodes = mastery.map((t) => ({
    id: `topic:${t.topic}`,
    type: "topic",
    label: t.topic,
    kind: t.kind,
    count: t.count,
    mastery: t.mastery,
    band: t.band,
    platforms: t.platforms,
    daysSince: t.daysSince,
  }));

  const links = [];
  const pairs = new Map();

  for (const p of problems || []) {
    if (!p) continue;
    const tags = p.tags && p.tags.length ? p.tags : [p.topic].filter(Boolean);
    const topics = [
      ...new Set(tags.filter(Boolean).map((t) => classifyTopic(t, opts.overrides).topic)),
    ].filter((t) => byTopic.has(t));

    for (let i = 0; i < topics.length; i++) {
      for (let j = i + 1; j < topics.length; j++) {
        const key =
          topics[i] < topics[j] ? `${topics[i]}|${topics[j]}` : `${topics[j]}|${topics[i]}`;
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }
  }

  for (const [key, weight] of pairs) {
    if (weight < minCo) continue;
    const [a, b] = key.split("|");
    links.push({ source: `topic:${a}`, target: `topic:${b}`, weight });
  }

  return { nodes, links };
}
