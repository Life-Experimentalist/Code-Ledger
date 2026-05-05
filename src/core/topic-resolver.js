/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DSA Topic Hierarchy & Weights
 * Lower weight = higher priority (selected first)
 * This ranking reflects the primary classification for each problem
 */
const TOPIC_WEIGHTS = {
    // Core Algorithms & Techniques (highest priority)
    "Dynamic Programming": 1,
    "Greedy": 2,
    "Recursion": 3,
    "Backtracking": 4,
    "Divide and Conquer": 5,
    "Bit Manipulation": 6,
    "Math": 7,
    "Geometry": 8,

    // Data Structures
    "Hash Table": 10,
    "Linked List": 11,
    "Stack": 12,
    "Queue": 13,
    "Heap (Priority Queue)": 14,
    "Trie": 15,
    "Binary Search Tree": 16,
    "Segment Tree": 17,
    "Binary Indexed Tree": 18,
    "Graph": 19,
    "Union Find": 20,

    // Fundamental Techniques
    "Two Pointers": 30,
    "Sliding Window": 31,
    "Binary Search": 32,
    "Sorting": 33,

    // Lower Priority - Usually secondary classification
    "Array": 100,
    "String": 101,
    "Tree": 102,
    "Design": 103,
    "Database": 104,
    "Shell": 105,
};

/**
 * Resolves the primary topic from a list of tags.
 * Intelligently selects based on DSA category importance rather than alphabetical order.
 *
 * @param {string[]} tags - Array of problem tags/topics
 * @param {object} canonicalEntry - Optional canonical entry with topic metadata
 * @returns {string} The primary topic, or "Untagged" if empty
 */
export function resolvePrimaryTopic(tags, canonicalEntry = null) {
    if (!tags || tags.length === 0) {
        return "Untagged";
    }

    // If canonical entry specifies a primary topic, use it
    if (canonicalEntry?.primaryTopic) {
        return canonicalEntry.primaryTopic;
    }

    // Find the tag with the lowest weight (highest priority)
    let bestTag = tags[0];
    let bestWeight = TOPIC_WEIGHTS[tags[0]] ?? 1000;

    for (const tag of tags) {
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
    return TOPIC_WEIGHTS[topic] ?? 1000;
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
