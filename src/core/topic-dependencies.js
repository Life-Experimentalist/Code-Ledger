/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Which topics an interview actually asks about, what order they have to be
 * learned in, and which of them you have not met.
 *
 * `topic-taxonomy.js` answers "how well is each topic I have touched held?".
 * That is the wrong question for planning, because a topic you have never met
 * contributes no solves and therefore no row — the gap that matters most is the
 * one the data cannot show you. `topicGaps()` does emit an `untouched` list, but
 * it walks `BUILT_IN_KINDS` in object-literal order and slices the first twelve,
 * so "Suffix Array", "Data Stream" and "Iterator" take the slots that
 * Backtracking, Heap and Trie should have. It surfaces zeros without ranking
 * them, which is close to not surfacing them at all.
 *
 * Two things fix that, and they are the whole of this module:
 *
 *   1. **A reference set with tiers.** Only topics in this table are ever
 *      reported as a gap. A zero outside it is not a gap, it is a topic nobody
 *      is asked about. Tier decides how loudly a zero is reported: a missing
 *      Hash Table is an emergency, a missing Max Flow is not news.
 *   2. **Prerequisite edges.** Ordering by frequency tells a beginner to start
 *      with Dynamic Programming, which is the single worst advice available.
 *      Ordering alphabetically is not advice at all. The edges below mean
 *      "attempting Y before X is wasted effort", so the order falls out of the
 *      graph rather than out of a popularity count.
 *
 * ## The vocabulary trap
 *
 * Every name here must be exactly what `normalizeTag` emits, or it can never
 * match a stored tag and the topic reads as permanently absent. This is not
 * hypothetical: it is the bug fixed in `edb1b83`, where template slugs like
 * "heap-priority-queue" were compared against the display text "Heap (Priority
 * Queue)" and every multi-word milestone scored zero for the life of the
 * feature. `assertReferenceVocabulary()` and its test exist so that a topic
 * added here with a plausible-looking name fails the suite instead of silently
 * becoming an unreachable nag.
 *
 * One topic people expect to see is deliberately absent, and `EXCLUDED_TOPICS`
 * records why so the UI can say so rather than leaving a hole:
 *
 *   - **Intervals.** No platform in use emits it. LeetCode tags those problems
 *     `Array` + `Sorting` + `Greedy`; only NeetCode's category list calls the
 *     group Intervals. As a reference topic it would nag forever about work
 *     already done under other names.
 *
 * Monotonic Stack and Monotonic Queue used to be listed here too, because the
 * resolver folded both into their parents and a row for either could only ever
 * read zero. They are real reference topics now: `topic-hierarchy.js` gives
 * Stack the rolled-up count without the fold, so the specific topic survives.
 */

import { normalizeTag } from "./topic-resolver.js";
import { topicMastery, masteryBand } from "./topic-taxonomy.js";

/**
 * How much a zero costs you.
 *
 * The tier is the ranking the current `untouched` list lacks. It is about
 * interview probability, not difficulty — Backtracking is harder than Matrix and
 * sits in the same tier, while Segment Tree is not much harder than Trie and is
 * two tiers below it, because one is asked and the other is not.
 */
export const TIER = Object.freeze({
  /** Assumed knowledge. A zero here is an emergency, whatever the target. */
  FOUNDATION: 1,
  /** Asked in almost every loop. A zero here is the headline. */
  CORE: 2,
  /** Separates offers at strong companies. A zero is fine early, fatal late. */
  DIFFERENTIATOR: 3,
  /** Contest material. Never reported as a gap unless explicitly asked for. */
  COMPETITIVE: 4,
});

export const TIER_LABEL = Object.freeze({
  1: "Foundation",
  2: "Core interview",
  3: "Differentiator",
  4: "Competitive",
});

/**
 * The reference set: canonical topic → tier and prerequisites.
 *
 * `prereqs` are the topics that must be at least loosely held before this one
 * is worth attempting. They are deliberately sparse — an edge for every
 * defensible relationship produces a graph where everything depends on
 * everything and the order it implies is meaningless. The test is "would I tell
 * someone to go learn X first?", not "does Y ever touch X?".
 *
 * Judgement calls worth recording, because they will be argued with:
 *   - **Binary Search requires Sorting**, not Array. The idea being borrowed is
 *     the ordering invariant, and someone who has never thought about sortedness
 *     writes an off-by-one every time.
 *   - **Sliding Window requires Two Pointers and Hash Table.** The window is a
 *     two-pointer walk; the counting inside it is a map. Both halves, or the
 *     problems are unsolvable rather than merely hard.
 *   - **Bit Manipulation is a root.** It reads like it should need Math, but bit
 *     tricks and number theory share nothing but a reputation for being fiddly.
 *   - **Graph requires DFS and BFS, which require Binary Tree.** Traversal is
 *     learned on a tree, where there are no cycles to get wrong, and then
 *     transferred. Going straight to graphs is the most common way people bounce
 *     off them.
 *   - **Dynamic Programming requires Recursion**, and nothing else does more
 *     damage when skipped. Tabulation taught before recursion produces someone
 *     who can fill a table and cannot say what it means.
 */
export const REFERENCE_TOPICS = Object.freeze({
  // ── Foundations ────────────────────────────────────────────────────
  Array: { tier: TIER.FOUNDATION, prereqs: [] },
  String: { tier: TIER.FOUNDATION, prereqs: [] },
  "Hash Table": { tier: TIER.FOUNDATION, prereqs: [] },
  Stack: { tier: TIER.FOUNDATION, prereqs: [] },
  Queue: { tier: TIER.FOUNDATION, prereqs: [] },
  "Linked List": { tier: TIER.FOUNDATION, prereqs: [] },
  Sorting: { tier: TIER.FOUNDATION, prereqs: ["Array"] },
  "Two Pointers": { tier: TIER.FOUNDATION, prereqs: ["Array", "String"] },
  "Binary Search": { tier: TIER.FOUNDATION, prereqs: ["Sorting"] },
  "Sliding Window": { tier: TIER.FOUNDATION, prereqs: ["Two Pointers", "Hash Table"] },
  "Prefix Sum": { tier: TIER.FOUNDATION, prereqs: ["Array"] },

  // ── Core interview ─────────────────────────────────────────────────
  Recursion: { tier: TIER.CORE, prereqs: [] },
  Tree: { tier: TIER.CORE, prereqs: ["Recursion"] },
  "Binary Tree": { tier: TIER.CORE, prereqs: ["Tree"] },
  "Depth-First Search": { tier: TIER.CORE, prereqs: ["Binary Tree"] },
  "Breadth-First Search": { tier: TIER.CORE, prereqs: ["Binary Tree", "Queue"] },
  "Binary Search Tree": { tier: TIER.CORE, prereqs: ["Binary Tree", "Binary Search"] },
  "Heap (Priority Queue)": { tier: TIER.CORE, prereqs: ["Sorting"] },
  Greedy: { tier: TIER.CORE, prereqs: ["Sorting"] },
  Backtracking: { tier: TIER.CORE, prereqs: ["Recursion"] },
  Matrix: { tier: TIER.CORE, prereqs: ["Array"] },
  Graph: { tier: TIER.CORE, prereqs: ["Depth-First Search", "Breadth-First Search"] },
  "Bit Manipulation": { tier: TIER.CORE, prereqs: [] },
  // Reachable at last — the resolver used to rewrite both of these to their
  // parents. Core rather than differentiator because "next greater element" is
  // an extremely common interview shape, and the prerequisite is the parent
  // structure, which is also where the hierarchy hangs them.
  "Monotonic Stack": { tier: TIER.CORE, prereqs: ["Stack"] },

  // ── Differentiators ────────────────────────────────────────────────
  "Topological Sort": { tier: TIER.DIFFERENTIATOR, prereqs: ["Graph"] },
  "Union Find": { tier: TIER.DIFFERENTIATOR, prereqs: ["Graph"] },
  Trie: { tier: TIER.DIFFERENTIATOR, prereqs: ["String", "Tree"] },
  "Divide and Conquer": { tier: TIER.DIFFERENTIATOR, prereqs: ["Recursion"] },
  "Dynamic Programming": { tier: TIER.DIFFERENTIATOR, prereqs: ["Recursion", "Array"] },
  "Shortest Path": { tier: TIER.DIFFERENTIATOR, prereqs: ["Graph", "Heap (Priority Queue)"] },
  Math: { tier: TIER.DIFFERENTIATOR, prereqs: [] },

  // ── Competitive ────────────────────────────────────────────────────
  // Present so a contest user can opt in, and so the reason they are quiet is
  // a tier rather than an omission somebody later "fixes" by adding them back
  // into the headline list.
  "Segment Tree": { tier: TIER.COMPETITIVE, prereqs: ["Tree", "Array"] },
  "Binary Indexed Tree": { tier: TIER.COMPETITIVE, prereqs: ["Array"] },
  "Suffix Array": { tier: TIER.COMPETITIVE, prereqs: ["String", "Sorting"] },
  "String Matching": { tier: TIER.COMPETITIVE, prereqs: ["String"] },
  "Rolling Hash": { tier: TIER.COMPETITIVE, prereqs: ["String"] },
  "Minimum Spanning Tree": { tier: TIER.COMPETITIVE, prereqs: ["Graph", "Union Find"] },
  "Strongly Connected Component": { tier: TIER.COMPETITIVE, prereqs: ["Graph"] },
  "Eulerian Circuit": { tier: TIER.COMPETITIVE, prereqs: ["Graph"] },
  "Max Flow": { tier: TIER.COMPETITIVE, prereqs: ["Graph"] },
  "Number Theory": { tier: TIER.COMPETITIVE, prereqs: ["Math"] },
  Combinatorics: { tier: TIER.COMPETITIVE, prereqs: ["Math"] },
  Geometry: { tier: TIER.COMPETITIVE, prereqs: ["Math"] },
  Probability: { tier: TIER.COMPETITIVE, prereqs: ["Math"] },
  "Game Theory": { tier: TIER.COMPETITIVE, prereqs: ["Dynamic Programming"] },
  "Line Sweep": { tier: TIER.COMPETITIVE, prereqs: ["Sorting"] },
  // The sibling of Monotonic Stack, and a tier lower on purpose: it is
  // essentially one problem shape (sliding-window maximum) rather than a family.
  "Monotonic Queue": { tier: TIER.COMPETITIVE, prereqs: ["Queue", "Sliding Window"] },
});

/**
 * Topics a user will look for and not find, with the reason.
 *
 * Shown in the UI. A gap report that silently omits something the user believes
 * in reads as broken; one that says "we fold this into Stack" reads as
 * considered, and is also the truth.
 */
export const EXCLUDED_TOPICS = Object.freeze([
  {
    name: "Intervals",
    foldedInto: "Sorting",
    reason:
      "No platform here emits an Intervals tag — LeetCode tags those problems Array, Sorting and Greedy. Only NeetCode's category list uses the name.",
  },
]);

/**
 * The reference topics in dependency order.
 *
 * Kahn's algorithm, with ties broken by tier and then by declaration order, so
 * the result is deterministic rather than dependent on Object key iteration
 * happening to be stable. Computed once at module load: the graph is a
 * constant, and recomputing it per render would be pointless work.
 *
 * @returns {string[]}
 */
function topologicalOrder() {
  const names = Object.keys(REFERENCE_TOPICS);
  const declaredAt = new Map(names.map((n, i) => [n, i]));
  const remaining = new Map(
    names.map((n) => [n, REFERENCE_TOPICS[n].prereqs.filter((p) => declaredAt.has(p)).length]),
  );
  /** @type {Map<string,string[]>} */
  const dependents = new Map(names.map((n) => [n, []]));
  for (const n of names) {
    for (const p of REFERENCE_TOPICS[n].prereqs) {
      if (dependents.has(p)) dependents.get(p).push(n);
    }
  }

  const out = [];
  while (out.length < names.length) {
    const ready = names
      .filter((n) => remaining.get(n) === 0)
      .sort(
        (a, b) =>
          REFERENCE_TOPICS[a].tier - REFERENCE_TOPICS[b].tier ||
          declaredAt.get(a) - declaredAt.get(b),
      );
    // A cycle would leave nothing ready. The vocabulary test asserts this never
    // happens; throwing rather than looping forever makes the failure legible if
    // an edge is ever added carelessly.
    if (!ready.length) {
      const stuck = names.filter((n) => remaining.get(n) > 0);
      throw new Error(`topic-dependencies: prerequisite cycle among ${stuck.join(", ")}`);
    }
    const next = ready[0];
    out.push(next);
    remaining.set(next, -1);
    for (const d of dependents.get(next)) remaining.set(d, remaining.get(d) - 1);
  }
  return out;
}

/** Every reference topic, prerequisites first. */
export const TOPIC_ORDER = Object.freeze(topologicalOrder());

/** Position in `TOPIC_ORDER`, for sorting anything keyed by topic. */
const ORDER_INDEX = new Map(TOPIC_ORDER.map((t, i) => [t, i]));

/**
 * Where a topic sits in the dependency order, or `Infinity` for a topic outside
 * the reference set — so a plain sort puts unknown topics last instead of first.
 *
 * @param {string} topic canonical name
 * @returns {number}
 */
export function orderIndex(topic) {
  const i = ORDER_INDEX.get(topic);
  return i === undefined ? Infinity : i;
}

/**
 * Every name in the reference set survives `normalizeTag` unchanged.
 *
 * A topic that does not is unreachable — no stored tag can ever equal it — and
 * would show as permanently untouched. Exported rather than inlined into the
 * test so the same check is available to anyone adding a topic at runtime.
 *
 * @returns {string[]} the offending names, empty when the table is sound
 */
export function assertReferenceVocabulary() {
  return Object.keys(REFERENCE_TOPICS).filter((name) => normalizeTag(name) !== name);
}

/* ------------------------------------------------------------------ */
/* Readiness                                                           */
/* ------------------------------------------------------------------ */

/**
 * The mastery floor that counts as "loosely held" — the bottom of the `working`
 * band in topic-taxonomy.js, reused rather than redeclared so the two can never
 * drift into disagreeing about what a held topic is.
 */
export const HELD_ENOUGH = 0.4;

/**
 * What to do about each reference topic, given what has been solved.
 *
 * The four states are the whole point. A flat "weakest topics" list tells a
 * beginner their Dynamic Programming is weak, which is true, useless, and
 * actively harmful if they act on it before they can write a recursion.
 *
 *   - `held` — strong. Revision, not study.
 *   - `practising` — under way, keep going.
 *   - `ready` — weak or absent, and every prerequisite is at least loosely
 *     held. **This is the actionable set.**
 *   - `blocked` — weak or absent, but something upstream is missing. Naming the
 *     blocker is more useful than naming the topic.
 *
 * @param {Array<object>} problems the ledger
 * @param {{ now?: number, overrides?: Record<string,string>, halfLifeDays?: number,
 *   regainSolves?: number, maxTier?: number }} [opts] `maxTier` defaults to
 *   DIFFERENTIATOR, which is what keeps contest topics out of the report
 * @returns {Array<{ topic:string, tier:number, count:number, mastery:number, band:string,
 *   daysSince:number|null, state:"held"|"practising"|"ready"|"blocked", blockedBy:string[] }>}
 */
export function topicReadiness(problems, opts = {}) {
  const maxTier = opts.maxTier ?? TIER.DIFFERENTIATOR;
  const measured = new Map(topicMastery(problems, opts).map((t) => [t.topic, t]));

  // Mastery of every reference topic, including the ones with no solves, so a
  // prerequisite lookup never has to distinguish "absent" from "not measured".
  const scoreOf = (topic) => measured.get(topic)?.mastery ?? 0;

  return TOPIC_ORDER.filter((topic) => REFERENCE_TOPICS[topic].tier <= maxTier).map((topic) => {
    const entry = REFERENCE_TOPICS[topic];
    const stat = measured.get(topic);
    const mastery = stat?.mastery ?? 0;
    // Blockers are reported whatever this topic's own state is — a held topic
    // with a shaky prerequisite is worth knowing about, and hiding the edge
    // would make the graph look sound when it is not.
    const blockedBy = entry.prereqs.filter((p) => scoreOf(p) < HELD_ENOUGH);

    let state;
    if (mastery >= 0.7) state = "held";
    else if (mastery >= HELD_ENOUGH) state = "practising";
    else state = blockedBy.length ? "blocked" : "ready";

    return {
      topic,
      tier: entry.tier,
      count: stat?.count ?? 0,
      mastery,
      band: masteryBand(mastery),
      daysSince: stat?.daysSince ?? null,
      state,
      blockedBy,
    };
  });
}

/**
 * The topics to work on next, in the order they should be worked on.
 *
 * `ready` only: a blocked topic is not a next step, it is a later one, and
 * offering it is how a plan sends someone to Dynamic Programming in week one.
 * Within that, dependency order rather than weakness — the point of the graph is
 * that the earliest unmet topic unlocks the most.
 *
 * @param {Array<object>} problems
 * @param {{ limit?: number, maxTier?: number, now?: number, overrides?: Record<string,string>,
 *   halfLifeDays?: number, regainSolves?: number }} [opts]
 * @returns {Array<object>} entries from `topicReadiness`, dependency-ordered
 */
export function nextTopics(problems, opts = {}) {
  const limit = opts.limit ?? 5;
  return topicReadiness(problems, opts)
    .filter((t) => t.state === "ready")
    .slice(0, limit);
}

/**
 * Reference topics with no solves at all, ranked by how much the zero costs.
 *
 * This is what the `untouched` list in topic-taxonomy.js should have been. The
 * differences that matter: contest topics are excluded by tier rather than
 * crowding the front of the list, the order is by tier and then by
 * dependency position rather than by object-literal accident, and each entry
 * carries what is blocking it so a zero that cannot be acted on yet says so.
 *
 * @param {Array<object>} problems
 * @param {{ maxTier?: number, now?: number, overrides?: Record<string,string>,
 *   halfLifeDays?: number, regainSolves?: number }} [opts]
 * @returns {Array<object>}
 */
export function absentTopics(problems, opts = {}) {
  return topicReadiness(problems, opts)
    .filter((t) => t.count === 0)
    .sort((a, b) => a.tier - b.tier || orderIndex(a.topic) - orderIndex(b.topic));
}

/**
 * Coverage of the reference set, per tier.
 *
 * "You have met 9 of 11 foundations and 4 of 12 core topics" is a sentence
 * someone can act on. A single percentage over all topics is not — it moves
 * mostly with how many contest topics are in the denominator.
 *
 * @param {Array<object>} problems
 * @param {{ maxTier?: number, now?: number, overrides?: Record<string,string>,
 *   halfLifeDays?: number, regainSolves?: number }} [opts]
 * @returns {{ byTier: Array<{ tier:number, label:string, met:number, total:number,
 *   held:number, absent:string[] }>, met:number, total:number }}
 */
export function referenceCoverage(problems, opts = {}) {
  const rows = topicReadiness(problems, opts);
  const tiers = [...new Set(rows.map((r) => r.tier))].sort((a, b) => a - b);

  const byTier = tiers.map((tier) => {
    const inTier = rows.filter((r) => r.tier === tier);
    return {
      tier,
      label: TIER_LABEL[tier] || String(tier),
      met: inTier.filter((r) => r.count > 0).length,
      total: inTier.length,
      held: inTier.filter((r) => r.state === "held").length,
      absent: inTier.filter((r) => r.count === 0).map((r) => r.topic),
    };
  });

  return {
    byTier,
    met: rows.filter((r) => r.count > 0).length,
    total: rows.length,
  };
}
