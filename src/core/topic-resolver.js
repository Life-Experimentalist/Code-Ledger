/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("TopicResolver");

/**
 * DSA Topic Hierarchy & Weights
 * Lower weight = higher priority (selected first)
 * This ranking reflects the primary classification for each problem
 */
const TOPIC_WEIGHTS = {
  // Core Algorithms & Techniques (highest priority)
  "Dynamic Programming": 1,
  Greedy: 2,
  Recursion: 3,
  Backtracking: 4,
  "Divide and Conquer": 5,
  "Bit Manipulation": 6,
  Math: 7,
  Geometry: 8,

  // Data Structures
  "Hash Table": 10,
  "Linked List": 11,
  Stack: 12,
  Queue: 13,
  "Heap (Priority Queue)": 14,
  Trie: 15,
  "Binary Search Tree": 16,
  "Segment Tree": 17,
  "Binary Indexed Tree": 18,
  Graph: 19,
  "Union Find": 20,

  // Fundamental Techniques
  "Two Pointers": 30,
  "Sliding Window": 31,
  "Binary Search": 32,
  Sorting: 33,

  // Lower Priority - Usually secondary classification
  "Depth-First Search": 50,
  "Breadth-First Search": 51,
  Array: 100,
  String: 101,
  Tree: 102,
  Design: 103,
  Database: 104,
  Shell: 105,
};

const RAW_MAPPINGS = {
  Array: ["array", "arrays"],
  String: ["string", "strings"],
  Tree: ["tree", "trees"],
  Graph: ["graph", "graphs"],
  "Heap (Priority Queue)": ["heap", "heaps", "priority queue", "priority-queue", "priorityqueue"],
  "Linked List": ["linked list", "linked-list", "linkedlist", "linked lists"],
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
  "Binary Search": ["binary search", "binary-search", "binarysearch"],
  "Sliding Window": ["sliding window", "sliding-window", "slidingwindow"],
  "Dynamic Programming": ["dynamic programming", "dynamic-programming", "dynamicprogramming", "dp"],
  Greedy: ["greedy", "greedy algorithms", "greedy-algorithms", "greedyalgorithms"],
  Recursion: ["recursion"],
  Backtracking: ["backtracking"],
  "Divide and Conquer": ["divide and conquer", "divide-and-conquer", "divideandconquer"],
  "Bit Manipulation": [
    "bit manipulation",
    "bit-manipulation",
    "bitmanipulation",
    "bit magic",
    "bit-magic",
    "bitmagic",
  ],
  Math: ["math", "mathematical", "mathematics"],
  Geometry: ["geometry"],
  Stack: ["stack", "stacks", "monotonic stack", "monotonic-stack", "monotonicstack"],
  Queue: ["queue", "queues", "monotonic queue", "monotonic-queue", "monotonicqueue"],
  Trie: ["trie", "tries"],
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
  Sorting: ["sorting", "sort"],
  Design: ["design"],
  Database: ["database", "databases"],
  Shell: ["shell"],
  "Depth-First Search": ["depth-first search", "depth first search", "depthfirstsearch", "dfs"],
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
export function normalizeTag(tag, customMappings = {}) {
  if (!tag || typeof tag !== "string") return "";
  const cleaned = tag.trim();
  const lowerTag = cleaned.toLowerCase();

  // 1. Check custom user mappings first (case-insensitive keys)
  if (customMappings && typeof customMappings === "object") {
    for (const [from, to] of Object.entries(customMappings)) {
      if (from.toLowerCase() === lowerTag) {
        return to;
      }
    }
  }

  // 2. Fall back to built-in mapping
  const cleanedLower = lowerTag.replace(/[\s-_]+/g, " ");

  // Discard generic high-level category tags
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
 * Gets all known topics in priority order
 * @returns {string[]}
 */
export function getKnownTopics() {
  return Object.entries(TOPIC_WEIGHTS)
    .sort(([, a], [, b]) => a - b)
    .map(([topic]) => topic);
}

export { RAW_MAPPINGS };
