/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DSA Topic Hierarchy & Weights
 * Lower weight = higher priority (selected first)
 * This ranking reflects the primary classification for each problem
 *
 * The weight decides which of a problem's tags names its folder, so renumbering
 * moves files. The original ranks are whole numbers and are left exactly as they
 * were; every topic added since slots in on a decimal beside the one it
 * specialises. "Monotonic Stack" sits at 12.5 because it is a Stack (12) and
 * should beat Array (100) the same way Stack did before it was a topic of its
 * own — an unweighted topic scores 1000 and would have lost to everything.
 *
 * Two rules are inherited rather than invented, and both are debatable:
 * the parent wins ties with its own children (Math at 7 beats Geometry at 8),
 * and the family headings this file added — Searching, Ad Hoc, Other — are
 * parked above 900 so they never win a folder name. A path called
 * `problems/Other/` helps nobody.
 */
const TOPIC_WEIGHTS = {
  // Core Algorithms & Techniques (highest priority)
  "Dynamic Programming": 1,
  Memoization: 1.5,
  "Game Theory": 1.6,
  Greedy: 2,
  Schedules: 2.5,
  Recursion: 3,
  Backtracking: 4,
  "Divide and Conquer": 5,
  "Meet In The Middle": 5.5,
  "Bit Manipulation": 6,
  Bitmask: 6.5,
  Math: 7,
  "Number Theory": 7.1,
  "Chinese Remainder Theorem": 7.2,
  Combinatorics: 7.3,
  Probability: 7.4,
  Randomized: 7.5,
  "Reservoir Sampling": 7.6,
  "Rejection Sampling": 7.7,
  "Fast Fourier Transform": 7.8,
  Geometry: 8,

  // Data Structures
  "Hash Table": 10,
  Counting: 10.5,
  "Hash Function": 10.6,
  "Linked List": 11,
  "Doubly Linked List": 11.5,
  Stack: 12,
  "Monotonic Stack": 12.5,
  Queue: 13,
  Deque: 13.4,
  "Monotonic Queue": 13.5,
  "Heap (Priority Queue)": 14,
  Trie: 15,
  "Binary Search Tree": 16,
  "Ordered Set": 16.5,
  "Segment Tree": 17,
  "Binary Indexed Tree": 18,
  Graph: 19,
  "Topological Sort": 19.1,
  "Shortest Path": 19.2,
  "Minimum Spanning Tree": 19.3,
  "Strongly Connected Component": 19.4,
  "Biconnected Component": 19.5,
  "Eulerian Circuit": 19.6,
  "Max Flow": 19.7,
  Matching: 19.8,
  "2-SAT": 19.9,
  "Union Find": 20,

  // Fundamental Techniques
  "Two Pointers": 30,
  "Sliding Window": 31,
  "Binary Search": 32,
  "Ternary Search": 32.5,
  Sorting: 33,
  "Merge Sort": 33.1,
  "Counting Sort": 33.2,
  "Bucket Sort": 33.3,
  "Radix Sort": 33.4,
  Quickselect: 33.5,
  "Line Sweep": 33.6,

  // Lower Priority - Usually secondary classification
  "Depth-First Search": 50,
  "Breadth-First Search": 51,
  Array: 100,
  Matrix: 100.5,
  "Prefix Sum": 100.6,
  String: 101,
  "String Matching": 101.1,
  "Rolling Hash": 101.2,
  "Suffix Array": 101.3,
  "Expression Parsing": 101.4,
  Tree: 102,
  "Binary Tree": 102.5,
  Design: 103,
  Iterator: 103.1,
  "Data Stream": 103.2,
  Database: 104,
  Pandas: 104.5,
  Shell: 105,
  Concurrency: 106,
  Interactive: 107,

  // Descriptions of a problem rather than of its solution. Real tags — every
  // Codeforces problem carries at least one — but a folder named after them
  // tells you nothing, so they rank below everything that does.
  Brainteaser: 200,
  Simulation: 201,
  Implementation: 202,
  "Brute Force": 203,
  Constructive: 204,
  Enumeration: 205,

  // Family headings. See the note above: these must never win a folder name.
  Searching: 940,
  "Ad Hoc": 960,
  Other: 970,
};

/**
 * Alias → canonical.
 *
 * Two things to know before editing this table.
 *
 * **A fold here is destructive.** Whatever is listed as an alias stops existing:
 * it is rewritten at the moment a solve is stored and cannot be recovered from
 * the ledger afterwards. `monotonic stack` used to be an alias of `Stack` for
 * exactly the wrong reason — to give Stack the count — and the cost was that
 * nobody could ever see, chart or plan a monotonic-stack problem. Containment
 * belongs in `topic-hierarchy.js`, which rolls the count up *and* keeps the
 * specific name. Only put a spelling here if it is genuinely the same topic.
 *
 * **Codeforces passes its tags through untouched.** Its vocabulary is its own —
 * `sortings`, `dfs and similar`, `constructive algorithms`, `flows`,
 * `probabilities` — and anything unlisted survives title-cased, so `sortings`
 * becomes a second topic sitting next to `Sorting` with its own separate count.
 * The entries below exist to stop that from happening for every tag those
 * platforms are known to emit.
 */
const RAW_MAPPINGS = {
  Array: ["array", "arrays"],
  Matrix: ["matrix", "matrices", "grid", "2d array", "2-d array", "two dimensional array"],
  "Prefix Sum": ["prefix sum", "prefix-sum", "prefixsum", "prefix sums", "cumulative sum"],
  String: ["string", "strings"],
  "String Matching": [
    "string matching",
    "string-matching",
    "pattern matching",
    "pattern searching",
  ],
  "Suffix Array": ["suffix array", "suffix-array", "string suffix structures"],
  "Expression Parsing": ["expression parsing", "expression-parsing"],
  Tree: ["tree", "trees"],
  "Binary Tree": ["binary tree", "binary-tree", "binarytree"],
  Graph: ["graph", "graphs"],
  "Topological Sort": ["topological sort", "topological-sort", "topological sorting", "toposort"],
  "Shortest Path": ["shortest path", "shortest paths", "shortest-path", "shortestpath"],
  "Minimum Spanning Tree": ["minimum spanning tree", "minimum-spanning-tree", "mst"],
  "Max Flow": ["max flow", "maximum flow", "max-flow", "flows"],
  Matching: ["matching", "matchings", "graph matchings"],
  "2-SAT": ["2 sat", "2-sat", "two sat"],
  "Strongly Connected Component": [
    "strongly connected component",
    "strongly connected components",
    "scc",
  ],
  "Biconnected Component": ["biconnected component", "biconnected components"],
  "Eulerian Circuit": ["eulerian circuit", "eulerian path", "euler tour"],
  "Heap (Priority Queue)": ["heap", "heaps", "priority queue", "priority-queue", "priorityqueue"],
  "Linked List": ["linked list", "linked-list", "linkedlist", "linked lists"],
  "Doubly Linked List": ["doubly linked list", "doubly-linked list", "doubly-linked-list"],
  "Hash Table": [
    "hash table",
    "hash-table",
    "hashtable",
    "hash map",
    "hash-map",
    "hashmap",
    "hashing",
    "hash",
    "dictionary",
    "dictionaries",
    "dictionaries in python",
    "map",
    "maps",
    "unordered_map",
    "unordered-map",
    "dict",
  ],
  "Hash Function": ["hash function", "hash-function", "hashfunction"],
  Counting: ["counting", "frequency count", "frequency counting"],
  "Two Pointers": [
    "two pointers",
    "two-pointers",
    "twopointers",
    "two pointer",
    "two-pointer",
    "twopointer",
    "two pointer strategy",
    "two-pointer strategy",
    "two-pointer-algorithm",
  ],
  Searching: ["searching", "search"],
  "Binary Search": ["binary search", "binary-search", "binarysearch"],
  "Ternary Search": ["ternary search", "ternary-search", "ternarysearch"],
  "Sliding Window": ["sliding window", "sliding-window", "slidingwindow"],
  "Dynamic Programming": ["dynamic programming", "dynamic-programming", "dynamicprogramming", "dp"],
  Memoization: ["memoization", "memoisation", "memo"],
  "Game Theory": ["game theory", "game-theory", "games", "gametheory"],
  Greedy: ["greedy", "greedy algorithms", "greedy-algorithms", "greedyalgorithms"],
  Schedules: ["schedules", "scheduling"],
  Recursion: ["recursion"],
  Backtracking: ["backtracking"],
  "Divide and Conquer": ["divide and conquer", "divide-and-conquer", "divideandconquer"],
  "Meet In The Middle": ["meet in the middle", "meet-in-the-middle", "meetinthemiddle"],
  "Bit Manipulation": [
    "bit manipulation",
    "bit-manipulation",
    "bitmanipulation",
    "bit magic",
    "bit-magic",
    "bitmagic",
  ],
  Bitmask: ["bitmask", "bitmasks", "bit mask", "bitmasking"],
  Math: ["math", "mathematical", "mathematics", "maths"],
  "Number Theory": ["number theory", "number-theory", "numbertheory"],
  "Chinese Remainder Theorem": ["chinese remainder theorem", "crt"],
  Combinatorics: ["combinatorics", "combinatorial", "combinatorial mathematics"],
  Probability: ["probability", "probabilities", "probability and statistics", "statistics"],
  Randomized: ["randomized", "randomised", "randomization"],
  "Reservoir Sampling": ["reservoir sampling", "reservoir-sampling"],
  "Rejection Sampling": ["rejection sampling", "rejection-sampling"],
  "Fast Fourier Transform": ["fast fourier transform", "fft", "ntt"],
  Geometry: ["geometry", "geometric", "computational geometry"],
  // `monotonic stack` and `monotonic queue` were aliases of Stack and Queue
  // until the hierarchy existed. That gave the parents their count and threw the
  // specific topic away — the trade is no longer necessary, because
  // `topic-hierarchy.js` rolls a Monotonic Stack solve up into Stack while
  // leaving it visible as itself. Note the split is forward-only: solves already
  // in the ledger were normalised when they were written and say `Stack` on
  // disk. Re-tagging them means re-fetching the tags, which is what the
  // self-heal pass does when it next runs against those problems.
  Stack: ["stack", "stacks"],
  "Monotonic Stack": ["monotonic stack", "monotonic-stack", "monotonicstack"],
  Queue: ["queue", "queues"],
  Deque: ["deque", "double ended queue", "double-ended queue"],
  "Monotonic Queue": ["monotonic queue", "monotonic-queue", "monotonicqueue"],
  Trie: ["trie", "tries", "prefix tree"],
  "Binary Search Tree": ["binary search tree", "bst", "binary-search-tree", "binarysearchtree"],
  "Segment Tree": ["segment tree", "segment-tree", "segmenttree"],
  "Binary Indexed Tree": [
    "binary indexed tree",
    "binary-indexed-tree",
    "binaryindexedtree",
    "fenwick tree",
    "fenwick-tree",
    "fenwicktree",
  ],
  "Union Find": [
    "union find",
    "union-find",
    "unionfind",
    "disjoint set",
    "disjoint-set",
    "disjointset",
    "disjoint set union",
    "dsu",
  ],
  "Ordered Set": ["ordered set", "ordered-set", "sorted set", "tree map", "treemap"],
  Sorting: ["sorting", "sort", "sortings", "sorts"],
  "Merge Sort": ["merge sort", "merge-sort", "mergesort"],
  "Counting Sort": ["counting sort", "counting-sort", "countingsort"],
  "Bucket Sort": ["bucket sort", "bucket-sort", "bucketsort"],
  "Radix Sort": ["radix sort", "radix-sort", "radixsort"],
  Quickselect: ["quickselect", "quick select", "quick-select"],
  "Line Sweep": ["line sweep", "line-sweep", "sweep line", "sweepline"],
  Design: ["design"],
  Iterator: ["iterator", "iterators"],
  "Data Stream": ["data stream", "data-stream", "datastream", "streaming"],
  Database: ["database", "databases", "sql"],
  Pandas: ["pandas"],
  Shell: ["shell", "bash"],
  Concurrency: ["concurrency", "concurrent", "multithreading", "threading"],
  Interactive: ["interactive", "interactive problem"],
  Simulation: ["simulation", "simulations"],
  Implementation: ["implementation"],
  "Brute Force": ["brute force", "brute-force", "bruteforce"],
  Constructive: ["constructive", "constructive algorithms", "constructive-algorithms"],
  Enumeration: ["enumeration", "enumerate"],
  Brainteaser: ["brainteaser", "brain teaser", "brainteasers", "puzzle", "puzzles"],
  "Depth-First Search": [
    "depth-first search",
    "depth first search",
    "depthfirstsearch",
    "dfs",
    "dfs and similar",
  ],
  "Breadth-First Search": [
    "breadth-first search",
    "breadth first search",
    "breadthfirstsearch",
    "bfs",
  ],
};

const TAG_NORMALIZATION_MAP = {};
for (const [canonicalName, aliases] of Object.entries(RAW_MAPPINGS)) {
  TAG_NORMALIZATION_MAP[canonicalName.toLowerCase()] = canonicalName;
  for (const alias of aliases) {
    const lowerAlias = alias.toLowerCase();
    TAG_NORMALIZATION_MAP[lowerAlias] = canonicalName;
    TAG_NORMALIZATION_MAP[lowerAlias.replace(/[\s-_]+/g, "")] = canonicalName;
  }
}

/**
 * Normalizes a raw tag name to a standardized Title Case tag.
 *
 * @param {string} tag - The raw tag to normalize
 * @param {object} customMappings - Optional settings mappings (lowerKey -> canonicalValue)
 * @returns {string} The normalized tag name
 */
/**
 * Generic category labels that say nothing about a problem. Discarded rather
 * than normalized.
 *
 * Module scope, not inside normalizeTag: that function runs once per tag per
 * problem on every storage read, every graph build and every migration, so a
 * Set built in its body is rebuilt thousands of times per call site.
 */
const IGNORED_TAGS = new Set([
  "data structure",
  "data structures",
  "algorithm",
  "algorithms",
  "dsa",
  "programming",
  "coding",
  "computer science",
]);

/**
 * Lowercased view of a user's topicMappings, memoized per settings object.
 *
 * The lookup is case-insensitive and callers pass the same mappings object for
 * every tag in a loop, so lowercasing every key on every tag made the cost the
 * product of two things the user controls: how many problems they have and how
 * many rename rules they wrote. A WeakMap keyed on the object they already hold
 * does it once and lets it go when they do.
 *
 * On a case collision the first key wins, which is what the linear scan did.
 */
const lowerMappingCache = new WeakMap();

function lowerMappings(customMappings) {
  let m = lowerMappingCache.get(customMappings);
  if (m) return m;
  m = new Map();
  for (const [from, to] of Object.entries(customMappings)) {
    const k = from.toLowerCase();
    if (!m.has(k)) m.set(k, to);
  }
  lowerMappingCache.set(customMappings, m);
  return m;
}

export function normalizeTag(tag, customMappings = {}) {
  if (!tag || typeof tag !== "string") return "";
  const cleaned = tag.trim();
  const lowerTag = cleaned.toLowerCase();

  // 1. Check custom user mappings first (case-insensitive keys)
  if (customMappings && typeof customMappings === "object") {
    const hit = lowerMappings(customMappings).get(lowerTag);
    if (hit !== undefined) return hit;
  }

  // 2. Fall back to built-in mapping
  const cleanedLower = lowerTag.replace(/[\s-_]+/g, " ");

  if (IGNORED_TAGS.has(cleanedLower)) {
    return "";
  }

  if (TAG_NORMALIZATION_MAP[cleanedLower]) {
    return TAG_NORMALIZATION_MAP[cleanedLower];
  }
  const simplified = cleanedLower.replace(/[^a-z0-9]/g, "");
  if (TAG_NORMALIZATION_MAP[simplified]) {
    return TAG_NORMALIZATION_MAP[simplified];
  }

  // Fallback to title casing the cleaned tag
  return cleanedLower
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Topic classification (data structure vs algorithm vs neither) lives in
// ./topic-taxonomy.js — see `classifyTopic`. It is not re-exported here because
// that module imports `normalizeTag` from this one, and the import must stay
// one-way.

/**
 * Resolves the primary topic from a list of tags.
 * Intelligently selects based on DSA category importance rather than alphabetical order.
 *
 * @param {string[]} tags - Array of problem tags/topics
 * @param {object} canonicalEntry - Optional canonical entry with topic metadata
 * @param {object} customMappings - Optional settings mappings (lowerKey -> canonicalValue)
 * @returns {string} The primary topic, or "Untagged" if empty
 */
export function resolvePrimaryTopic(tags, canonicalEntry = null, customMappings = {}) {
  if (!tags || tags.length === 0) {
    return "Untagged";
  }

  // Normalize tags array first
  const normalizedTags = tags.map((t) => normalizeTag(t, customMappings)).filter(Boolean);
  if (normalizedTags.length === 0) {
    return "Untagged";
  }

  // If canonical entry specifies a primary topic, use it
  if (canonicalEntry?.primaryTopic) {
    return normalizeTag(canonicalEntry.primaryTopic, customMappings);
  }

  // Find the tag with the lowest weight (highest priority)
  let bestTag = normalizedTags[0];
  let bestWeight = TOPIC_WEIGHTS[normalizedTags[0]] ?? 1000;

  for (const tag of normalizedTags) {
    const weight = TOPIC_WEIGHTS[tag] ?? 1000;
    if (weight < bestWeight) {
      bestWeight = weight;
      bestTag = tag;
    }
  }

  return bestTag;
}

/**
 * Gets the topic weight for sorting/comparison
 * @param {string} topic
 * @returns {number}
 */
export function getTopicWeight(topic) {
  return TOPIC_WEIGHTS[normalizeTag(topic)] ?? 1000;
}

/**
 * Gets all known topics in priority order, with any of the user's own after them.
 *
 * The built-ins are ordered by weight because that order is what
 * `resolvePrimaryTopic` picks from. A topic the user invented has no weight, so
 * it goes on the end alphabetically rather than pretending to a rank.
 *
 * @param {string[]} [extra] topics the user has created — see `customTopicsFromMappings`
 * @returns {string[]}
 */
export function getKnownTopics(extra = []) {
  const ordered = Object.entries(TOPIC_WEIGHTS)
    .sort(([, a], [, b]) => a - b)
    .map(([topic]) => topic);

  const seen = new Set(ordered.map((t) => t.toLowerCase()));
  for (const t of extra || []) {
    const name = typeof t === "string" ? t.trim() : "";
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    ordered.push(name);
  }
  return ordered;
}

/**
 * The canonical topics the user has invented, read back out of their own mappings.
 *
 * There is deliberately no second list to keep in sync: a topic exists because
 * something maps to it, and stops existing when the last mapping to it is
 * deleted. A target that already has a built-in name is not a new topic — it is
 * that one, which is why the comparison is case-insensitive.
 *
 * @param {Record<string,string>} [mappings] `settings.topicMappings`
 * @returns {string[]} sorted, deduplicated
 */
export function customTopicsFromMappings(mappings = {}) {
  const builtIn = new Set(Object.keys(TOPIC_WEIGHTS).map((t) => t.toLowerCase()));
  const seen = new Set();
  const out = [];
  for (const target of Object.values(mappings || {})) {
    const name = typeof target === "string" ? target.trim() : "";
    if (!name) continue;
    const key = name.toLowerCase();
    if (builtIn.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export { RAW_MAPPINGS };
