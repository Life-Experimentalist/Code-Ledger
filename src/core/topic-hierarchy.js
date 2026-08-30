/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Which topic sits under which — the whole tag vocabulary as a forest.
 *
 * Three relations between topics exist in this codebase and they are not the
 * same thing. Keeping them apart is most of the design:
 *
 *   - **alias → canonical** (`topic-resolver.js`). "monotonic-stack" and
 *     "Monotonic Stack" are the same topic spelled differently. Destructive by
 *     nature: the alias is gone after normalisation.
 *   - **prerequisite** (`topic-dependencies.js`). "learn Sorting before Binary
 *     Search". An ordering, not a containment — Sorting does not *contain*
 *     Binary Search, and a Binary Search solve is not a Sorting solve.
 *   - **parent** (this file). "Monotonic Stack lives under Stack". A
 *     containment: a Monotonic Stack solve *is* a Stack solve, so counts roll
 *     up, and the pair reads as one branch of a syllabus rather than two
 *     unrelated rows.
 *
 * Until now the third relation was faked by the first. `RAW_MAPPINGS` folded
 * `monotonic stack` into `Stack`, which does give Stack the count — and throws
 * the specific topic away, so it can never be studied, charted or planned for.
 * That is why `EXCLUDED_TOPICS` had to apologise for two topics LeetCode really
 * does tag. A parent edge gets the same rollup without the amnesia.
 *
 * ## Rules
 *
 *   1. **One parent.** A forest, not a lattice. Trie is under Tree and not also
 *      under String; Game Theory is under Dynamic Programming and not also
 *      under Math. Two parents would make a rolled-up count ambiguous — a solve
 *      would be counted twice at the root — and would make the tree unbrowsable,
 *      which is the point of having one.
 *   2. **Every canonical topic appears exactly once**, including the ones nobody
 *      would call DSA. A tag with no home is a tag the user cannot find, and
 *      `assertHierarchy()` fails the suite rather than let one go missing.
 *   3. **Names are what `normalizeTag` emits.** The vocabulary trap from
 *      `edb1b83` applies here identically: a parent named "Heap" instead of
 *      "Heap (Priority Queue)" would silently never match anything.
 *   4. **The user has the last word.** `settings.topicParents` overrides any
 *      edge here, including making a topic a root. AI healing writes to the same
 *      map. Nothing in this file is more than a default.
 *
 * ## Judgement calls, recorded because they will be argued with
 *
 *   - **Matrix under Array.** A 2-D array is an array. This also gives the
 *     grid problems somewhere to aggregate to.
 *   - **Prefix Sum under Array**, not under Math. It is an array preprocessing
 *     step; the arithmetic in it is incidental.
 *   - **Counting under Hash Table.** LeetCode's `Counting` tag means frequency
 *     counting, which is a map with extra steps.
 *   - **Sliding Window under Two Pointers.** Matches the prerequisite edge, and
 *     it really is a two-pointer walk with bookkeeping.
 *   - **Game Theory under Dynamic Programming**, not Math — interview game
 *     theory is nearly always a DP over states.
 *   - **Binary Search under Searching.** `Searching` is a GeeksForGeeks tag, so
 *     it arrives as a real topic with real solves; it is the natural heading and
 *     it does not disturb Binary Search's tier or prerequisites, which live
 *     elsewhere.
 *   - **Ad Hoc and Other are invented headings.** No platform emits them. They
 *     exist so Simulation, Implementation and Brute Force stop being nineteen
 *     separate roots, and so SQL, Shell and Concurrency have somewhere to be
 *     that is visibly not the algorithm tree.
 */

import { normalizeTag } from "./topic-resolver.js";

/**
 * Canonical topic → the topic it sits under. `null` is a family root.
 *
 * Order within the object is the display order of siblings, so it is grouped by
 * family rather than alphabetically.
 *
 * @type {Readonly<Record<string, string|null>>}
 */
export const TOPIC_PARENTS = Object.freeze({
  // ── Array ──────────────────────────────────────────────────────────
  Array: null,
  Matrix: "Array",
  "Prefix Sum": "Array",

  // ── String ─────────────────────────────────────────────────────────
  String: null,
  "String Matching": "String",
  "Rolling Hash": "String Matching",
  "Suffix Array": "String",
  "Expression Parsing": "String",

  // ── Hash Table ─────────────────────────────────────────────────────
  "Hash Table": null,
  "Hash Function": "Hash Table",
  Counting: "Hash Table",

  // ── Linked List ────────────────────────────────────────────────────
  "Linked List": null,
  "Doubly Linked List": "Linked List",

  // ── Stack ──────────────────────────────────────────────────────────
  Stack: null,
  "Monotonic Stack": "Stack",

  // ── Queue ──────────────────────────────────────────────────────────
  Queue: null,
  Deque: "Queue",
  "Monotonic Queue": "Queue",

  // ── Heap ───────────────────────────────────────────────────────────
  "Heap (Priority Queue)": null,

  // ── Tree ───────────────────────────────────────────────────────────
  Tree: null,
  "Binary Tree": "Tree",
  "Binary Search Tree": "Binary Tree",
  Trie: "Tree",
  "Segment Tree": "Tree",
  "Binary Indexed Tree": "Tree",
  "Ordered Set": "Tree",

  // ── Graph ──────────────────────────────────────────────────────────
  Graph: null,
  "Depth-First Search": "Graph",
  "Breadth-First Search": "Graph",
  "Topological Sort": "Graph",
  "Union Find": "Graph",
  "Shortest Path": "Graph",
  "Minimum Spanning Tree": "Graph",
  "Strongly Connected Component": "Graph",
  "Biconnected Component": "Graph",
  "Eulerian Circuit": "Graph",
  "Max Flow": "Graph",
  Matching: "Graph",
  "2-SAT": "Graph",

  // ── Sorting ────────────────────────────────────────────────────────
  Sorting: null,
  "Merge Sort": "Sorting",
  "Counting Sort": "Sorting",
  "Bucket Sort": "Sorting",
  "Radix Sort": "Sorting",
  Quickselect: "Sorting",
  "Line Sweep": "Sorting",

  // ── Searching ──────────────────────────────────────────────────────
  Searching: null,
  "Binary Search": "Searching",
  "Ternary Search": "Binary Search",

  // ── Recursion ──────────────────────────────────────────────────────
  Recursion: null,
  Backtracking: "Recursion",
  "Divide and Conquer": "Recursion",
  "Meet In The Middle": "Divide and Conquer",

  // ── Dynamic Programming ────────────────────────────────────────────
  "Dynamic Programming": null,
  Memoization: "Dynamic Programming",
  "Game Theory": "Dynamic Programming",

  // ── Greedy ─────────────────────────────────────────────────────────
  Greedy: null,
  Schedules: "Greedy",

  // ── Two Pointers ───────────────────────────────────────────────────
  "Two Pointers": null,
  "Sliding Window": "Two Pointers",

  // ── Bit Manipulation ───────────────────────────────────────────────
  "Bit Manipulation": null,
  Bitmask: "Bit Manipulation",

  // ── Math ───────────────────────────────────────────────────────────
  Math: null,
  "Number Theory": "Math",
  "Chinese Remainder Theorem": "Number Theory",
  Combinatorics: "Math",
  Geometry: "Math",
  Probability: "Math",
  Randomized: "Probability",
  "Reservoir Sampling": "Randomized",
  "Rejection Sampling": "Randomized",
  "Fast Fourier Transform": "Math",

  // ── Ad Hoc ─────────────────────────────────────────────────────────
  "Ad Hoc": null,
  Implementation: "Ad Hoc",
  Simulation: "Ad Hoc",
  "Brute Force": "Ad Hoc",
  Constructive: "Ad Hoc",
  Enumeration: "Ad Hoc",
  Brainteaser: "Ad Hoc",

  // ── Other ──────────────────────────────────────────────────────────
  Other: null,
  Design: "Other",
  Iterator: "Design",
  "Data Stream": "Design",
  Database: "Other",
  Pandas: "Other",
  Shell: "Other",
  Concurrency: "Other",
  Interactive: "Other",
  Untagged: "Other",
});

/** The family headings, in declaration order. */
export const FAMILY_ROOTS = Object.freeze(
  Object.keys(TOPIC_PARENTS).filter((t) => TOPIC_PARENTS[t] === null),
);

/**
 * Headings this file invented rather than read off a platform.
 *
 * Worth naming because their solve count is entirely rolled up from children —
 * nothing is ever tagged "Ad Hoc" — and a UI that shows a count should be able
 * to say so.
 */
export const SYNTHETIC_TOPICS = Object.freeze(["Ad Hoc", "Other", "Searching"]);

/** Where an unrecognised topic goes until somebody says otherwise. */
export const DEFAULT_PARENT = "Ad Hoc";

/**
 * The parent map with the user's corrections applied.
 *
 * An override value of `""`, `null` or the topic's own name means "make this a
 * root" — the three spellings a UI is likely to produce for "no parent", all
 * meaning the same thing rather than one of them silently doing nothing.
 *
 * @param {Record<string,string|null>} [overrides] `settings.topicParents`
 * @returns {Record<string, string|null>}
 */
export function resolveParents(overrides = {}) {
  const merged = { ...TOPIC_PARENTS };
  for (const [rawChild, rawParent] of Object.entries(overrides || {})) {
    const child = normalizeTag(rawChild);
    if (!child) continue;
    const parent = rawParent == null ? "" : normalizeTag(String(rawParent));
    merged[child] = !parent || parent === child ? null : parent;
  }
  return merged;
}

/**
 * The topic one level up, or `null` at a root.
 *
 * @param {string} topic canonical or raw — it is normalised either way
 * @param {Record<string,string|null>} [parents] from `resolveParents`
 * @returns {string|null}
 */
export function parentOf(topic, parents = TOPIC_PARENTS) {
  const name = normalizeTag(topic);
  if (!name) return null;
  const parent = parents[name];
  return parent || null;
}

/**
 * Every ancestor, nearest first, ending at the family root.
 *
 * Cycle-safe on purpose. The built-in map is acyclic and a test enforces that,
 * but `settings.topicParents` is user data: someone can set A under B and B
 * under A, by hand or by accepting a bad AI suggestion. A walk that trusted the
 * data would hang the library. This one stops at the repeat and returns what it
 * has, so a bad edge costs a wrong answer instead of a frozen tab.
 *
 * @param {string} topic
 * @param {Record<string,string|null>} [parents]
 * @returns {string[]}
 */
export function ancestorsOf(topic, parents = TOPIC_PARENTS) {
  const out = [];
  const seen = new Set();
  let current = normalizeTag(topic);
  if (!current) return out;
  seen.add(current);

  for (;;) {
    const next = parents[current] || null;
    if (!next || seen.has(next)) return out;
    out.push(next);
    seen.add(next);
    current = next;
  }
}

/**
 * The family heading a topic belongs to — itself, if it is one.
 *
 * @param {string} topic
 * @param {Record<string,string|null>} [parents]
 * @returns {string}
 */
export function familyOf(topic, parents = TOPIC_PARENTS) {
  const name = normalizeTag(topic);
  const chain = ancestorsOf(name, parents);
  return chain.length ? chain[chain.length - 1] : name;
}

/**
 * Direct children, in the map's declaration order.
 *
 * @param {string} topic
 * @param {Record<string,string|null>} [parents]
 * @returns {string[]}
 */
export function childrenOf(topic, parents = TOPIC_PARENTS) {
  const name = normalizeTag(topic);
  if (!name) return [];
  return Object.keys(parents).filter((t) => parents[t] === name);
}

/**
 * Every descendant, breadth-first. Cycle-safe for the same reason as
 * `ancestorsOf`.
 *
 * @param {string} topic
 * @param {Record<string,string|null>} [parents]
 * @returns {string[]}
 */
export function descendantsOf(topic, parents = TOPIC_PARENTS) {
  const root = normalizeTag(topic);
  if (!root) return [];
  const out = [];
  const seen = new Set([root]);
  const queue = childrenOf(root, parents);

  while (queue.length) {
    const next = queue.shift();
    if (seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    queue.push(...childrenOf(next, parents));
  }
  return out;
}

/**
 * The whole vocabulary as nested nodes, ready to render.
 *
 * Topics the user invented — anything in their ledger that this file has never
 * heard of — are included too, hung off `DEFAULT_PARENT` unless an override says
 * otherwise. They have to be visible: an unplaced tag that does not render is
 * one the user cannot re-parent, which would make the override map useless for
 * exactly the tags that need it most.
 *
 * @param {object} [opts]
 * @param {Record<string,string|null>} [opts.overrides] `settings.topicParents`
 * @param {string[]} [opts.extraTopics] canonical topics seen in the ledger
 * @returns {Array<{topic: string, depth: number, synthetic: boolean, known: boolean, children: any[]}>}
 */
export function topicForest(opts = {}) {
  const parents = resolveParents(opts.overrides || {});
  const known = new Set(Object.keys(parents));

  for (const raw of opts.extraTopics || []) {
    const name = normalizeTag(raw);
    if (!name || known.has(name)) continue;
    parents[name] = DEFAULT_PARENT;
    known.add(name);
  }

  const build = (topic, depth, seen) => {
    if (seen.has(topic)) return null;
    const next = new Set(seen).add(topic);
    return {
      topic,
      depth,
      synthetic: SYNTHETIC_TOPICS.includes(topic),
      known: topic in TOPIC_PARENTS,
      children: childrenOf(topic, parents)
        .map((c) => build(c, depth + 1, next))
        .filter(Boolean),
    };
  };

  return Object.keys(parents)
    .filter((t) => !parents[t])
    .map((t) => build(t, 0, new Set()))
    .filter(Boolean);
}

/**
 * Solve counts per topic, own and rolled up.
 *
 * `own` counts problems carrying that exact tag. `total` adds every descendant,
 * counting each *problem* once per topic rather than once per matching tag — a
 * problem tagged both `Binary Tree` and `Binary Search Tree` contributes one to
 * Tree's total, not two. Without that, a well-tagged problem inflates its family
 * and the tree stops being comparable to the flat counts everywhere else.
 *
 * @param {Array<{tags?: string[], topic?: string}>} problems
 * @param {object} [opts]
 * @param {Record<string,string|null>} [opts.overrides] `settings.topicParents`
 * @param {Record<string,string>} [opts.mappings] `settings.topicMappings`
 * @returns {Record<string, {own: number, total: number}>}
 */
export function rollupCounts(problems, opts = {}) {
  const parents = resolveParents(opts.overrides || {});
  const mappings = opts.mappings || {};

  /** @type {Record<string, {own: number, total: number}>} */
  const counts = {};
  const bump = (topic, field) => {
    counts[topic] ||= { own: 0, total: 0 };
    counts[topic][field] += 1;
  };

  for (const problem of problems || []) {
    const raw =
      Array.isArray(problem?.tags) && problem.tags.length ? problem.tags : [problem?.topic];
    const topics = new Set(raw.map((t) => normalizeTag(t, mappings)).filter(Boolean));
    if (!topics.size) continue;

    // Each problem contributes at most one to any given topic's total, however
    // many of its tags land in that branch.
    const credited = new Set();
    for (const topic of topics) {
      bump(topic, "own");
      for (const node of [topic, ...ancestorsOf(topic, parents)]) {
        if (credited.has(node)) continue;
        credited.add(node);
        bump(node, "total");
      }
    }
  }

  return counts;
}

/**
 * Fail loudly on a hierarchy that cannot be rendered or counted.
 *
 * Called by the test suite, not at runtime — a user override is allowed to be
 * wrong, and the walk functions above already degrade rather than throw.
 *
 * @param {Record<string,string|null>} [parents]
 * @returns {string[]} problems found; empty means the forest is sound
 */
export function assertHierarchy(parents = TOPIC_PARENTS) {
  const problems = [];
  const names = Object.keys(parents);

  for (const name of names) {
    if (normalizeTag(name) !== name) {
      problems.push(`"${name}" is not what normalizeTag emits ("${normalizeTag(name)}")`);
    }
    const parent = parents[name];
    if (parent && !(parent in parents)) {
      problems.push(`"${name}" hangs off "${parent}", which is not a topic`);
    }
    if (parent === name) problems.push(`"${name}" is its own parent`);
  }

  for (const name of names) {
    const seen = new Set([name]);
    let current = name;
    for (;;) {
      const next = parents[current];
      if (!next) break;
      if (seen.has(next)) {
        problems.push(`cycle through "${name}"`);
        break;
      }
      seen.add(next);
      current = next;
    }
  }

  return problems;
}
