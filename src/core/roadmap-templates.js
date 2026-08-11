/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ready-made roadmaps.
 *
 * The Roadmap tab used to have exactly one way in: describe a goal, and wait
 * for an AI provider to write a plan. That fails outright for anyone who has
 * not configured a provider, and asks everyone else to know what they want
 * before they have a plan to react to. Picking from a shelf is easier than
 * writing from nothing, and every one of these can be edited or replaced by an
 * AI-generated plan afterwards.
 *
 * Subtopics are real lowercase-hyphenated platform tags, because that is what
 * `countMilestoneSolves` matches against. A milestone whose subtopics are prose
 * scores zero forever, which looks like a broken progress bar.
 */

/**
 * @typedef {Object} RoadmapTemplate
 * @property {string} id
 * @property {string} title
 * @property {string} blurb   one line, shown on the card
 * @property {string} goal
 * @property {string} level
 * @property {string} timeframe
 * @property {Array<Object>} milestones
 */

/** @type {RoadmapTemplate[]} */
export const ROADMAP_TEMPLATES = [
  {
    id: "foundations",
    title: "Foundations",
    blurb: "Start here if arrays and strings still take a while.",
    goal: "Get comfortable with the everyday data structures",
    level: "beginner",
    timeframe: "1 month",
    milestones: [
      {
        topic: "Arrays & Strings",
        subtopics: ["array", "string", "two-pointers"],
        difficulty: "Easy",
        targetCount: 12,
        week: 1,
        description: "Scan, reverse, and walk from both ends without reaching for extra space.",
      },
      {
        topic: "Hashing",
        subtopics: ["hash-table", "counting"],
        difficulty: "Easy",
        targetCount: 10,
        week: 2,
        description: "Trade memory for time — the move behind most O(n) rewrites.",
      },
      {
        topic: "Sorting & Searching",
        subtopics: ["sorting", "binary-search"],
        difficulty: "Easy",
        targetCount: 10,
        week: 3,
        description: "Sort to expose structure; binary search anything monotonic.",
      },
      {
        topic: "Stacks & Queues",
        subtopics: ["stack", "queue", "monotonic-stack"],
        difficulty: "Medium",
        targetCount: 8,
        week: 4,
        description: "Recognise the problems that are secretly about the last thing you saw.",
      },
      {
        topic: "Linked Lists",
        subtopics: ["linked-list"],
        difficulty: "Medium",
        targetCount: 8,
        week: 4,
        description: "Pointer surgery: reversal, cycle detection, merging.",
      },
    ],
  },
  {
    id: "interview-core",
    title: "Interview core",
    blurb: "The patterns that actually come up in interviews, in order.",
    goal: "Be ready for a technical interview loop",
    level: "intermediate",
    timeframe: "3 months",
    milestones: [
      {
        topic: "Two Pointers & Sliding Window",
        subtopics: ["two-pointers", "sliding-window"],
        difficulty: "Medium",
        targetCount: 12,
        week: 1,
        description: "Know which one a problem wants before you write a line.",
      },
      {
        topic: "Binary Search",
        subtopics: ["binary-search"],
        difficulty: "Medium",
        targetCount: 10,
        week: 2,
        description: "Including search-on-answer, where the array is not the thing you search.",
      },
      {
        topic: "Trees",
        subtopics: ["tree", "binary-tree", "binary-search-tree", "depth-first-search"],
        difficulty: "Medium",
        targetCount: 15,
        week: 4,
        description: "Traversal until it is boring, then the problems that hang off it.",
      },
      {
        topic: "Graphs",
        subtopics: ["graph", "breadth-first-search", "union-find", "topological-sort"],
        difficulty: "Medium",
        targetCount: 14,
        week: 6,
        description: "BFS for shortest, DFS for reachable, union-find for connectivity.",
      },
      {
        topic: "Heaps & Intervals",
        subtopics: ["heap-priority-queue", "greedy", "sorting"],
        difficulty: "Medium",
        targetCount: 10,
        week: 8,
        description: "Top-k, merge rooms, and the sort-then-sweep family.",
      },
      {
        topic: "Dynamic Programming",
        subtopics: ["dynamic-programming", "memoization"],
        difficulty: "Hard",
        targetCount: 18,
        week: 10,
        description: "Recurrence first, table second. Never the other way round.",
      },
      {
        topic: "Backtracking",
        subtopics: ["backtracking", "recursion"],
        difficulty: "Hard",
        targetCount: 10,
        week: 12,
        description: "Generate, prune, undo — and be able to state the pruning rule.",
      },
    ],
  },
  {
    id: "dp-deep",
    title: "Dynamic programming, properly",
    blurb: "For when DP is the one thing standing in the way.",
    goal: "Stop guessing at DP and start deriving it",
    level: "advanced",
    timeframe: "1 month",
    milestones: [
      {
        topic: "One-dimensional DP",
        subtopics: ["dynamic-programming"],
        difficulty: "Medium",
        targetCount: 10,
        week: 1,
        description: "Climbing stairs through house robber — write the recurrence out loud.",
      },
      {
        topic: "Grid DP",
        subtopics: ["dynamic-programming", "matrix"],
        difficulty: "Medium",
        targetCount: 8,
        week: 2,
        description: "Paths and edit distance, where the state is a pair of indices.",
      },
      {
        topic: "Knapsack family",
        subtopics: ["dynamic-programming", "array"],
        difficulty: "Hard",
        targetCount: 8,
        week: 3,
        description: "0/1 versus unbounded, and why the loop order decides which you wrote.",
      },
      {
        topic: "DP on trees and intervals",
        subtopics: ["dynamic-programming", "tree", "memoization"],
        difficulty: "Hard",
        targetCount: 8,
        week: 4,
        description: "When the subproblem is a subtree or a range rather than a prefix.",
      },
    ],
  },
  {
    id: "contest",
    title: "Contest readiness",
    blurb: "Speed and the topics that decide rated rounds.",
    goal: "Rate up in competitive programming",
    level: "advanced",
    timeframe: "3 months",
    milestones: [
      {
        topic: "Math & Number Theory",
        subtopics: ["math", "number-theory", "combinatorics"],
        difficulty: "Medium",
        targetCount: 12,
        week: 1,
        description: "Primes, modular arithmetic, and counting without enumerating.",
      },
      {
        topic: "Greedy & Sorting",
        subtopics: ["greedy", "sorting"],
        difficulty: "Medium",
        targetCount: 12,
        week: 3,
        description: "The exchange argument — being able to prove greedy works, quickly.",
      },
      {
        topic: "Prefix Sums & Bit Tricks",
        subtopics: ["prefix-sum", "bit-manipulation"],
        difficulty: "Medium",
        targetCount: 10,
        week: 5,
        description: "Constant-time range queries and the XOR identities worth memorising.",
      },
      {
        topic: "Graph Algorithms",
        subtopics: ["graph", "shortest-path", "union-find", "topological-sort"],
        difficulty: "Hard",
        targetCount: 12,
        week: 7,
        description: "Dijkstra, MST, and knowing which one the constraints are asking for.",
      },
      {
        topic: "Advanced Structures",
        subtopics: ["segment-tree", "binary-indexed-tree", "trie"],
        difficulty: "Hard",
        targetCount: 10,
        week: 10,
        description: "Range structures, once the brute force is provably too slow.",
      },
    ],
  },
];

/**
 * Build a roadmap out of the topics this learner has actually struggled with.
 *
 * The other templates are somebody else's plan. This one is theirs: the topics
 * come from the same strained-topic ranking the Behaviour tab shows, so the
 * milestones are the things that have already cost them time.
 *
 * Returns null below three strained topics — a two-milestone roadmap made of
 * one bad afternoon is worse than no roadmap, because it looks authoritative.
 *
 * @param {Array<{label: string, problems: number}>} strainedTopics ranked, strongest first
 * @returns {RoadmapTemplate|null}
 */
export function buildWeakAreaRoadmap(strainedTopics) {
  const topics = (strainedTopics || []).filter((t) => t?.label).slice(0, 6);
  if (topics.length < 3) return null;

  return {
    id: "from-my-history",
    title: "Built from your history",
    blurb: "The topics that have cost you the most time so far.",
    goal: "Turn the topics that keep needing a second pass into ones that do not",
    level: "intermediate",
    timeframe: "1 month",
    milestones: topics.map((t, i) => ({
      topic: t.label,
      subtopics: [String(t.label).toLowerCase()],
      difficulty: "Medium",
      // Enough new problems to actually shift the habit, scaled to how often it
      // has come up, but never so many that the bar cannot be finished.
      targetCount: Math.min(12, Math.max(5, Math.round((t.problems || 0) / 2))),
      week: i + 1,
      description: `Needed a second pass on ${t.problems} problem${t.problems === 1 ? "" : "s"} so far.`,
    })),
  };
}

/**
 * Turn a template into a stored roadmap.
 *
 * @param {RoadmapTemplate} template
 * @returns {Object}
 */
export function instantiateTemplate(template) {
  return {
    id: `rm-${Date.now()}`,
    createdAt: Date.now(),
    source: `template:${template.id}`,
    title: template.title,
    goal: template.goal,
    level: template.level,
    timeframe: template.timeframe,
    topics: "",
    milestones: template.milestones.map((m, i) => ({ id: `m${i + 1}`, ...m })),
  };
}
