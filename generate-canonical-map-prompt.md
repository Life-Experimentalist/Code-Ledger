# Task: Generate the Complete 150-Problem Canonical Mapping for CodeLedger

You are an expert in Data Structures and Algorithms and platform internals. Your task is to generate exactly 150 JSON entries for the `canonical-map.json` file. This data represents the "NeetCode 150" problems, providing cross-platform aliases for LeetCode, GeeksForGeeks, and Codeforces where applicable.

Please output the result as a complete JSON structure matching the schema below. You may split it into multiple parts if needed, but the structure must be perfect.

## Required JSON Output Structure

```json
{
  "version": 3,
  "entries": [
    {
      "canonicalId": "two-sum",
      "canonicalTitle": "Two Sum",
      "topic": "arrays",
      "difficulty": "easy",
      "pattern": "hash-map",
      "tags": ["array", "hash-table"],
      "aliases": [
        { "platform": "leetcode", "slug": "two-sum", "id": 1 },
        { "platform": "geeksforgeeks", "slug": "key-pair5616" }
      ],
      "voteCount": 100,
      "confirmedBy": "system-init",
      "addedAt": "2025-04-24"
    }
    // ... 149 more problems here covering the rest of NeetCode 150
  ]
}
```

## Detailed Instructions

For each problem in the standard NeetCode 150 list, provide the exact `canonicalId` (use the LeetCode slug as the canonical ID), and fill out all fields.

Topics must be chosen from the following list:
- arrays
- two-pointers
- sliding-window
- stack
- binary-search
- linked-list
- trees
- tries
- heap
- backtracking
- graphs
- dynamic-programming
- greedy
- intervals
- math
- bit-manipulation

All 150 entries must be populated with realistic aliases where known. If an alias for GFG or Codeforces is not definitively known, you may omit the alias for that secondary platform, but you MUST provide the LeetCode alias for all of them.
