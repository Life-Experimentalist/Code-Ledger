/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Named problem sets, mapped onto the reference topic vocabulary.
 *
 * The roadmap templates in `core/roadmap-templates.js` work at topic level:
 * "solve 7 binary search problems". That is enough to measure progress and not
 * enough to act on, because the next question is always *which seven*. This
 * file answers that with two well-known lists.
 *
 * **NeetCode 150** is reproduced in full — 150 LeetCode slugs, in the
 * roadmap's own group order. The slug is what builds the link, so a wrong one
 * is a 404 rather than a silent miss; `dev/validate-problem-sets.js` checks
 * every slug against LeetCode and is the only thing that can prove them right.
 *
 * **Striver A2Z** is *not* reproduced problem by problem. The sheet is ~455
 * problems across platforms and a large share of them are GeeksForGeeks
 * entries whose slugs cannot be derived from the title. Writing out 455 slugs
 * from memory would produce a list that looks authoritative and is quietly
 * wrong in a few dozen places, which is worse than not shipping it. What is
 * here is the step structure — the part that carries the ordering — with each
 * step mapped onto the same topic vocabulary, so a plan can say "Striver step
 * 9, Binary Search" and link out to the step rather than invent its contents.
 *
 * Topic names are the canonical ones from `core/topic-dependencies.js`. They
 * must survive `normalizeTag` unchanged or they can never match a stored tag —
 * the vocabulary trap that made every multi-word roadmap milestone score zero
 * before commit edb1b83. `test/problem-sets.test.js` asserts it.
 */

/**
 * @typedef {Object} SetProblem
 * @property {string} slug     LeetCode slug — `leetcode.com/problems/{slug}/`
 * @property {string} title
 * @property {"Easy"|"Medium"|"Hard"} difficulty
 * @property {string} group    the list's own section name
 */

/** NeetCode 150, in roadmap order. @type {SetProblem[]} */
export const NEETCODE_150 = [
  // Arrays & Hashing
  {
    slug: "contains-duplicate",
    title: "Contains Duplicate",
    difficulty: "Easy",
    group: "Arrays & Hashing",
  },
  { slug: "valid-anagram", title: "Valid Anagram", difficulty: "Easy", group: "Arrays & Hashing" },
  { slug: "two-sum", title: "Two Sum", difficulty: "Easy", group: "Arrays & Hashing" },
  {
    slug: "group-anagrams",
    title: "Group Anagrams",
    difficulty: "Medium",
    group: "Arrays & Hashing",
  },
  {
    slug: "top-k-frequent-elements",
    title: "Top K Frequent Elements",
    difficulty: "Medium",
    group: "Arrays & Hashing",
  },
  {
    slug: "encode-and-decode-strings",
    title: "Encode and Decode Strings",
    difficulty: "Medium",
    group: "Arrays & Hashing",
  },
  {
    slug: "product-of-array-except-self",
    title: "Product of Array Except Self",
    difficulty: "Medium",
    group: "Arrays & Hashing",
  },
  { slug: "valid-sudoku", title: "Valid Sudoku", difficulty: "Medium", group: "Arrays & Hashing" },
  {
    slug: "longest-consecutive-sequence",
    title: "Longest Consecutive Sequence",
    difficulty: "Medium",
    group: "Arrays & Hashing",
  },

  // Two Pointers
  {
    slug: "valid-palindrome",
    title: "Valid Palindrome",
    difficulty: "Easy",
    group: "Two Pointers",
  },
  {
    slug: "two-sum-ii-input-array-is-sorted",
    title: "Two Sum II",
    difficulty: "Medium",
    group: "Two Pointers",
  },
  { slug: "3sum", title: "3Sum", difficulty: "Medium", group: "Two Pointers" },
  {
    slug: "container-with-most-water",
    title: "Container With Most Water",
    difficulty: "Medium",
    group: "Two Pointers",
  },
  {
    slug: "trapping-rain-water",
    title: "Trapping Rain Water",
    difficulty: "Hard",
    group: "Two Pointers",
  },

  // Sliding Window
  {
    slug: "best-time-to-buy-and-sell-stock",
    title: "Best Time to Buy and Sell Stock",
    difficulty: "Easy",
    group: "Sliding Window",
  },
  {
    slug: "longest-substring-without-repeating-characters",
    title: "Longest Substring Without Repeating Characters",
    difficulty: "Medium",
    group: "Sliding Window",
  },
  {
    slug: "longest-repeating-character-replacement",
    title: "Longest Repeating Character Replacement",
    difficulty: "Medium",
    group: "Sliding Window",
  },
  {
    slug: "permutation-in-string",
    title: "Permutation in String",
    difficulty: "Medium",
    group: "Sliding Window",
  },
  {
    slug: "minimum-window-substring",
    title: "Minimum Window Substring",
    difficulty: "Hard",
    group: "Sliding Window",
  },
  {
    slug: "sliding-window-maximum",
    title: "Sliding Window Maximum",
    difficulty: "Hard",
    group: "Sliding Window",
  },

  // Stack
  { slug: "valid-parentheses", title: "Valid Parentheses", difficulty: "Easy", group: "Stack" },
  { slug: "min-stack", title: "Min Stack", difficulty: "Medium", group: "Stack" },
  {
    slug: "evaluate-reverse-polish-notation",
    title: "Evaluate Reverse Polish Notation",
    difficulty: "Medium",
    group: "Stack",
  },
  {
    slug: "generate-parentheses",
    title: "Generate Parentheses",
    difficulty: "Medium",
    group: "Stack",
  },
  { slug: "daily-temperatures", title: "Daily Temperatures", difficulty: "Medium", group: "Stack" },
  { slug: "car-fleet", title: "Car Fleet", difficulty: "Medium", group: "Stack" },
  {
    slug: "largest-rectangle-in-histogram",
    title: "Largest Rectangle in Histogram",
    difficulty: "Hard",
    group: "Stack",
  },

  // Binary Search
  { slug: "binary-search", title: "Binary Search", difficulty: "Easy", group: "Binary Search" },
  {
    slug: "search-a-2d-matrix",
    title: "Search a 2D Matrix",
    difficulty: "Medium",
    group: "Binary Search",
  },
  {
    slug: "koko-eating-bananas",
    title: "Koko Eating Bananas",
    difficulty: "Medium",
    group: "Binary Search",
  },
  {
    slug: "find-minimum-in-rotated-sorted-array",
    title: "Find Minimum in Rotated Sorted Array",
    difficulty: "Medium",
    group: "Binary Search",
  },
  {
    slug: "search-in-rotated-sorted-array",
    title: "Search in Rotated Sorted Array",
    difficulty: "Medium",
    group: "Binary Search",
  },
  {
    slug: "time-based-key-value-store",
    title: "Time Based Key-Value Store",
    difficulty: "Medium",
    group: "Binary Search",
  },
  {
    slug: "median-of-two-sorted-arrays",
    title: "Median of Two Sorted Arrays",
    difficulty: "Hard",
    group: "Binary Search",
  },

  // Linked List
  {
    slug: "reverse-linked-list",
    title: "Reverse Linked List",
    difficulty: "Easy",
    group: "Linked List",
  },
  {
    slug: "merge-two-sorted-lists",
    title: "Merge Two Sorted Lists",
    difficulty: "Easy",
    group: "Linked List",
  },
  {
    slug: "linked-list-cycle",
    title: "Linked List Cycle",
    difficulty: "Easy",
    group: "Linked List",
  },
  { slug: "reorder-list", title: "Reorder List", difficulty: "Medium", group: "Linked List" },
  {
    slug: "remove-nth-node-from-end-of-list",
    title: "Remove Nth Node From End of List",
    difficulty: "Medium",
    group: "Linked List",
  },
  {
    slug: "copy-list-with-random-pointer",
    title: "Copy List With Random Pointer",
    difficulty: "Medium",
    group: "Linked List",
  },
  { slug: "add-two-numbers", title: "Add Two Numbers", difficulty: "Medium", group: "Linked List" },
  {
    slug: "find-the-duplicate-number",
    title: "Find the Duplicate Number",
    difficulty: "Medium",
    group: "Linked List",
  },
  { slug: "lru-cache", title: "LRU Cache", difficulty: "Medium", group: "Linked List" },
  {
    slug: "merge-k-sorted-lists",
    title: "Merge k Sorted Lists",
    difficulty: "Hard",
    group: "Linked List",
  },
  {
    slug: "reverse-nodes-in-k-group",
    title: "Reverse Nodes in k-Group",
    difficulty: "Hard",
    group: "Linked List",
  },

  // Trees
  { slug: "invert-binary-tree", title: "Invert Binary Tree", difficulty: "Easy", group: "Trees" },
  {
    slug: "maximum-depth-of-binary-tree",
    title: "Maximum Depth of Binary Tree",
    difficulty: "Easy",
    group: "Trees",
  },
  {
    slug: "diameter-of-binary-tree",
    title: "Diameter of Binary Tree",
    difficulty: "Easy",
    group: "Trees",
  },
  {
    slug: "balanced-binary-tree",
    title: "Balanced Binary Tree",
    difficulty: "Easy",
    group: "Trees",
  },
  { slug: "same-tree", title: "Same Tree", difficulty: "Easy", group: "Trees" },
  {
    slug: "subtree-of-another-tree",
    title: "Subtree of Another Tree",
    difficulty: "Easy",
    group: "Trees",
  },
  {
    slug: "lowest-common-ancestor-of-a-binary-search-tree",
    title: "Lowest Common Ancestor of a BST",
    difficulty: "Medium",
    group: "Trees",
  },
  {
    slug: "binary-tree-level-order-traversal",
    title: "Binary Tree Level Order Traversal",
    difficulty: "Medium",
    group: "Trees",
  },
  {
    slug: "binary-tree-right-side-view",
    title: "Binary Tree Right Side View",
    difficulty: "Medium",
    group: "Trees",
  },
  {
    slug: "count-good-nodes-in-binary-tree",
    title: "Count Good Nodes in Binary Tree",
    difficulty: "Medium",
    group: "Trees",
  },
  {
    slug: "validate-binary-search-tree",
    title: "Validate Binary Search Tree",
    difficulty: "Medium",
    group: "Trees",
  },
  {
    slug: "kth-smallest-element-in-a-bst",
    title: "Kth Smallest Element in a BST",
    difficulty: "Medium",
    group: "Trees",
  },
  {
    slug: "construct-binary-tree-from-preorder-and-inorder-traversal",
    title: "Construct Binary Tree from Preorder and Inorder Traversal",
    difficulty: "Medium",
    group: "Trees",
  },
  {
    slug: "binary-tree-maximum-path-sum",
    title: "Binary Tree Maximum Path Sum",
    difficulty: "Hard",
    group: "Trees",
  },
  {
    slug: "serialize-and-deserialize-binary-tree",
    title: "Serialize and Deserialize Binary Tree",
    difficulty: "Hard",
    group: "Trees",
  },

  // Tries
  {
    slug: "implement-trie-prefix-tree",
    title: "Implement Trie (Prefix Tree)",
    difficulty: "Medium",
    group: "Tries",
  },
  {
    slug: "design-add-and-search-words-data-structure",
    title: "Design Add and Search Words Data Structure",
    difficulty: "Medium",
    group: "Tries",
  },
  { slug: "word-search-ii", title: "Word Search II", difficulty: "Hard", group: "Tries" },

  // Heap / Priority Queue
  {
    slug: "kth-largest-element-in-a-stream",
    title: "Kth Largest Element in a Stream",
    difficulty: "Easy",
    group: "Heap / Priority Queue",
  },
  {
    slug: "last-stone-weight",
    title: "Last Stone Weight",
    difficulty: "Easy",
    group: "Heap / Priority Queue",
  },
  {
    slug: "k-closest-points-to-origin",
    title: "K Closest Points to Origin",
    difficulty: "Medium",
    group: "Heap / Priority Queue",
  },
  {
    slug: "kth-largest-element-in-an-array",
    title: "Kth Largest Element in an Array",
    difficulty: "Medium",
    group: "Heap / Priority Queue",
  },
  {
    slug: "task-scheduler",
    title: "Task Scheduler",
    difficulty: "Medium",
    group: "Heap / Priority Queue",
  },
  {
    slug: "design-twitter",
    title: "Design Twitter",
    difficulty: "Medium",
    group: "Heap / Priority Queue",
  },
  {
    slug: "find-median-from-data-stream",
    title: "Find Median from Data Stream",
    difficulty: "Hard",
    group: "Heap / Priority Queue",
  },

  // Backtracking
  { slug: "subsets", title: "Subsets", difficulty: "Medium", group: "Backtracking" },
  {
    slug: "combination-sum",
    title: "Combination Sum",
    difficulty: "Medium",
    group: "Backtracking",
  },
  { slug: "permutations", title: "Permutations", difficulty: "Medium", group: "Backtracking" },
  { slug: "subsets-ii", title: "Subsets II", difficulty: "Medium", group: "Backtracking" },
  {
    slug: "combination-sum-ii",
    title: "Combination Sum II",
    difficulty: "Medium",
    group: "Backtracking",
  },
  { slug: "word-search", title: "Word Search", difficulty: "Medium", group: "Backtracking" },
  {
    slug: "palindrome-partitioning",
    title: "Palindrome Partitioning",
    difficulty: "Medium",
    group: "Backtracking",
  },
  {
    slug: "letter-combinations-of-a-phone-number",
    title: "Letter Combinations of a Phone Number",
    difficulty: "Medium",
    group: "Backtracking",
  },
  { slug: "n-queens", title: "N-Queens", difficulty: "Hard", group: "Backtracking" },

  // Graphs
  { slug: "number-of-islands", title: "Number of Islands", difficulty: "Medium", group: "Graphs" },
  {
    slug: "max-area-of-island",
    title: "Max Area of Island",
    difficulty: "Medium",
    group: "Graphs",
  },
  { slug: "clone-graph", title: "Clone Graph", difficulty: "Medium", group: "Graphs" },
  { slug: "walls-and-gates", title: "Walls and Gates", difficulty: "Medium", group: "Graphs" },
  { slug: "rotting-oranges", title: "Rotting Oranges", difficulty: "Medium", group: "Graphs" },
  {
    slug: "pacific-atlantic-water-flow",
    title: "Pacific Atlantic Water Flow",
    difficulty: "Medium",
    group: "Graphs",
  },
  {
    slug: "surrounded-regions",
    title: "Surrounded Regions",
    difficulty: "Medium",
    group: "Graphs",
  },
  { slug: "course-schedule", title: "Course Schedule", difficulty: "Medium", group: "Graphs" },
  {
    slug: "course-schedule-ii",
    title: "Course Schedule II",
    difficulty: "Medium",
    group: "Graphs",
  },
  { slug: "graph-valid-tree", title: "Graph Valid Tree", difficulty: "Medium", group: "Graphs" },
  {
    slug: "number-of-connected-components-in-an-undirected-graph",
    title: "Number of Connected Components in an Undirected Graph",
    difficulty: "Medium",
    group: "Graphs",
  },
  {
    slug: "redundant-connection",
    title: "Redundant Connection",
    difficulty: "Medium",
    group: "Graphs",
  },
  { slug: "word-ladder", title: "Word Ladder", difficulty: "Hard", group: "Graphs" },

  // Advanced Graphs
  {
    slug: "network-delay-time",
    title: "Network Delay Time",
    difficulty: "Medium",
    group: "Advanced Graphs",
  },
  {
    slug: "min-cost-to-connect-all-points",
    title: "Min Cost to Connect All Points",
    difficulty: "Medium",
    group: "Advanced Graphs",
  },
  {
    slug: "cheapest-flights-within-k-stops",
    title: "Cheapest Flights Within K Stops",
    difficulty: "Medium",
    group: "Advanced Graphs",
  },
  {
    slug: "reconstruct-itinerary",
    title: "Reconstruct Itinerary",
    difficulty: "Hard",
    group: "Advanced Graphs",
  },
  {
    slug: "swim-in-rising-water",
    title: "Swim in Rising Water",
    difficulty: "Hard",
    group: "Advanced Graphs",
  },
  {
    slug: "alien-dictionary",
    title: "Alien Dictionary",
    difficulty: "Hard",
    group: "Advanced Graphs",
  },

  // 1-D Dynamic Programming
  { slug: "climbing-stairs", title: "Climbing Stairs", difficulty: "Easy", group: "1-D DP" },
  {
    slug: "min-cost-climbing-stairs",
    title: "Min Cost Climbing Stairs",
    difficulty: "Easy",
    group: "1-D DP",
  },
  { slug: "house-robber", title: "House Robber", difficulty: "Medium", group: "1-D DP" },
  { slug: "house-robber-ii", title: "House Robber II", difficulty: "Medium", group: "1-D DP" },
  {
    slug: "longest-palindromic-substring",
    title: "Longest Palindromic Substring",
    difficulty: "Medium",
    group: "1-D DP",
  },
  {
    slug: "palindromic-substrings",
    title: "Palindromic Substrings",
    difficulty: "Medium",
    group: "1-D DP",
  },
  { slug: "decode-ways", title: "Decode Ways", difficulty: "Medium", group: "1-D DP" },
  { slug: "coin-change", title: "Coin Change", difficulty: "Medium", group: "1-D DP" },
  {
    slug: "maximum-product-subarray",
    title: "Maximum Product Subarray",
    difficulty: "Medium",
    group: "1-D DP",
  },
  { slug: "word-break", title: "Word Break", difficulty: "Medium", group: "1-D DP" },
  {
    slug: "longest-increasing-subsequence",
    title: "Longest Increasing Subsequence",
    difficulty: "Medium",
    group: "1-D DP",
  },
  {
    slug: "partition-equal-subset-sum",
    title: "Partition Equal Subset Sum",
    difficulty: "Medium",
    group: "1-D DP",
  },

  // 2-D Dynamic Programming
  { slug: "unique-paths", title: "Unique Paths", difficulty: "Medium", group: "2-D DP" },
  {
    slug: "longest-common-subsequence",
    title: "Longest Common Subsequence",
    difficulty: "Medium",
    group: "2-D DP",
  },
  {
    slug: "best-time-to-buy-and-sell-stock-with-cooldown",
    title: "Best Time to Buy and Sell Stock With Cooldown",
    difficulty: "Medium",
    group: "2-D DP",
  },
  { slug: "coin-change-ii", title: "Coin Change II", difficulty: "Medium", group: "2-D DP" },
  { slug: "target-sum", title: "Target Sum", difficulty: "Medium", group: "2-D DP" },
  {
    slug: "interleaving-string",
    title: "Interleaving String",
    difficulty: "Medium",
    group: "2-D DP",
  },
  { slug: "edit-distance", title: "Edit Distance", difficulty: "Medium", group: "2-D DP" },
  {
    slug: "longest-increasing-path-in-a-matrix",
    title: "Longest Increasing Path in a Matrix",
    difficulty: "Hard",
    group: "2-D DP",
  },
  {
    slug: "distinct-subsequences",
    title: "Distinct Subsequences",
    difficulty: "Hard",
    group: "2-D DP",
  },
  { slug: "burst-balloons", title: "Burst Balloons", difficulty: "Hard", group: "2-D DP" },
  {
    slug: "regular-expression-matching",
    title: "Regular Expression Matching",
    difficulty: "Hard",
    group: "2-D DP",
  },

  // Greedy
  { slug: "maximum-subarray", title: "Maximum Subarray", difficulty: "Medium", group: "Greedy" },
  { slug: "jump-game", title: "Jump Game", difficulty: "Medium", group: "Greedy" },
  { slug: "jump-game-ii", title: "Jump Game II", difficulty: "Medium", group: "Greedy" },
  { slug: "gas-station", title: "Gas Station", difficulty: "Medium", group: "Greedy" },
  { slug: "hand-of-straights", title: "Hand of Straights", difficulty: "Medium", group: "Greedy" },
  {
    slug: "merge-triplets-to-form-target-triplet",
    title: "Merge Triplets to Form Target Triplet",
    difficulty: "Medium",
    group: "Greedy",
  },
  { slug: "partition-labels", title: "Partition Labels", difficulty: "Medium", group: "Greedy" },
  {
    slug: "valid-parenthesis-string",
    title: "Valid Parenthesis String",
    difficulty: "Medium",
    group: "Greedy",
  },

  // Intervals
  { slug: "meeting-rooms", title: "Meeting Rooms", difficulty: "Easy", group: "Intervals" },
  { slug: "insert-interval", title: "Insert Interval", difficulty: "Medium", group: "Intervals" },
  { slug: "merge-intervals", title: "Merge Intervals", difficulty: "Medium", group: "Intervals" },
  {
    slug: "non-overlapping-intervals",
    title: "Non-overlapping Intervals",
    difficulty: "Medium",
    group: "Intervals",
  },
  { slug: "meeting-rooms-ii", title: "Meeting Rooms II", difficulty: "Medium", group: "Intervals" },
  {
    slug: "minimum-interval-to-include-each-query",
    title: "Minimum Interval to Include Each Query",
    difficulty: "Hard",
    group: "Intervals",
  },

  // Math & Geometry
  { slug: "happy-number", title: "Happy Number", difficulty: "Easy", group: "Math & Geometry" },
  { slug: "plus-one", title: "Plus One", difficulty: "Easy", group: "Math & Geometry" },
  { slug: "rotate-image", title: "Rotate Image", difficulty: "Medium", group: "Math & Geometry" },
  { slug: "spiral-matrix", title: "Spiral Matrix", difficulty: "Medium", group: "Math & Geometry" },
  {
    slug: "set-matrix-zeroes",
    title: "Set Matrix Zeroes",
    difficulty: "Medium",
    group: "Math & Geometry",
  },
  { slug: "powx-n", title: "Pow(x, n)", difficulty: "Medium", group: "Math & Geometry" },
  {
    slug: "multiply-strings",
    title: "Multiply Strings",
    difficulty: "Medium",
    group: "Math & Geometry",
  },
  {
    slug: "detect-squares",
    title: "Detect Squares",
    difficulty: "Medium",
    group: "Math & Geometry",
  },

  // Bit Manipulation
  { slug: "single-number", title: "Single Number", difficulty: "Easy", group: "Bit Manipulation" },
  {
    slug: "number-of-1-bits",
    title: "Number of 1 Bits",
    difficulty: "Easy",
    group: "Bit Manipulation",
  },
  { slug: "counting-bits", title: "Counting Bits", difficulty: "Easy", group: "Bit Manipulation" },
  { slug: "reverse-bits", title: "Reverse Bits", difficulty: "Easy", group: "Bit Manipulation" },
  {
    slug: "missing-number",
    title: "Missing Number",
    difficulty: "Easy",
    group: "Bit Manipulation",
  },
  {
    slug: "sum-of-two-integers",
    title: "Sum of Two Integers",
    difficulty: "Medium",
    group: "Bit Manipulation",
  },
  {
    slug: "reverse-integer",
    title: "Reverse Integer",
    difficulty: "Medium",
    group: "Bit Manipulation",
  },
];

/**
 * NeetCode's own section names → the reference topics they exercise.
 *
 * First entry is the primary topic; the rest are what the group also touches,
 * which is why "Arrays & Hashing" reaches two topics and "Advanced Graphs"
 * three. `Intervals` maps to Sorting deliberately — it is a NeetCode section
 * name, not a tag any platform emits, and `EXCLUDED_TOPICS` says so.
 */
export const NEETCODE_GROUP_TOPICS = Object.freeze({
  "Arrays & Hashing": ["Array", "Hash Table"],
  "Two Pointers": ["Two Pointers"],
  "Sliding Window": ["Sliding Window"],
  Stack: ["Stack"],
  "Binary Search": ["Binary Search"],
  "Linked List": ["Linked List"],
  Trees: ["Binary Tree", "Tree", "Depth-First Search", "Breadth-First Search"],
  Tries: ["Trie"],
  "Heap / Priority Queue": ["Heap (Priority Queue)"],
  Backtracking: ["Backtracking"],
  Graphs: ["Graph", "Depth-First Search", "Breadth-First Search"],
  "Advanced Graphs": ["Shortest Path", "Minimum Spanning Tree", "Topological Sort"],
  "1-D DP": ["Dynamic Programming"],
  "2-D DP": ["Dynamic Programming"],
  Greedy: ["Greedy"],
  Intervals: ["Sorting"],
  "Math & Geometry": ["Math", "Matrix"],
  "Bit Manipulation": ["Bit Manipulation"],
});

/**
 * Striver's A2Z sheet, by step.
 *
 * Structure only — see the file header for why the ~455 problems are not
 * written out. `url` links to the step so the plan can hand off rather than
 * pretend to contain it. `count` is the sheet's own published figure and is
 * used for nothing but display.
 */
export const STRIVER_A2Z_STEPS = Object.freeze([
  {
    step: 1,
    title: "Learn the basics",
    topics: ["Array", "String", "Recursion", "Hash Table"],
    count: 31,
  },
  { step: 2, title: "Sorting techniques", topics: ["Sorting"], count: 7 },
  { step: 3, title: "Arrays", topics: ["Array", "Two Pointers", "Prefix Sum"], count: 40 },
  { step: 4, title: "Binary search", topics: ["Binary Search"], count: 32 },
  { step: 5, title: "Strings", topics: ["String"], count: 15 },
  { step: 6, title: "Linked list", topics: ["Linked List"], count: 31 },
  { step: 7, title: "Recursion", topics: ["Recursion", "Backtracking"], count: 25 },
  { step: 8, title: "Bit manipulation", topics: ["Bit Manipulation", "Math"], count: 18 },
  { step: 9, title: "Stack and queues", topics: ["Stack", "Queue"], count: 30 },
  {
    step: 10,
    title: "Sliding window and two pointer",
    topics: ["Sliding Window", "Two Pointers"],
    count: 12,
  },
  { step: 11, title: "Heaps", topics: ["Heap (Priority Queue)"], count: 17 },
  { step: 12, title: "Greedy algorithms", topics: ["Greedy"], count: 16 },
  {
    step: 13,
    title: "Binary trees",
    topics: ["Tree", "Binary Tree", "Depth-First Search", "Breadth-First Search"],
    count: 39,
  },
  { step: 14, title: "Binary search trees", topics: ["Binary Search Tree"], count: 16 },
  {
    step: 15,
    title: "Graphs",
    topics: ["Graph", "Topological Sort", "Union Find", "Shortest Path", "Minimum Spanning Tree"],
    count: 54,
  },
  { step: 16, title: "Dynamic programming", topics: ["Dynamic Programming"], count: 56 },
  { step: 17, title: "Tries", topics: ["Trie"], count: 7 },
  { step: 18, title: "Strings — advanced", topics: ["String Matching"], count: 9 },
]);

/** Where the A2Z sheet lives. One link, not 455 guessed ones. */
export const STRIVER_A2Z_URL =
  "https://takeuforward.org/strivers-a2z-dsa-course/strivers-a2z-dsa-course-sheet-2";

/**
 * Reference topic → the NeetCode problems that exercise it, easiest first.
 *
 * Built once at module load. A problem appears under every topic its group
 * maps to, so "Trees" contributes to Binary Tree and to DFS — which is correct:
 * solving it is evidence for both, and that is how the tags land anyway.
 *
 * @type {Readonly<Record<string, SetProblem[]>>}
 */
export const NEETCODE_BY_TOPIC = (() => {
  const rank = { Easy: 0, Medium: 1, Hard: 2 };
  /** @type {Record<string, SetProblem[]>} */
  const byTopic = {};
  for (const p of NEETCODE_150) {
    for (const topic of NEETCODE_GROUP_TOPICS[p.group] || []) {
      (byTopic[topic] ||= []).push(p);
    }
  }
  for (const list of Object.values(byTopic)) {
    // Stable within a difficulty, so the list's own order survives — NeetCode
    // orders within a group on purpose and re-sorting alphabetically would
    // throw that away.
    list.sort((a, b) => rank[a.difficulty] - rank[b.difficulty]);
  }
  return Object.freeze(byTopic);
})();

/**
 * Problems for a topic that are not already in the ledger.
 *
 * Matching is on `titleSlug`, which every LeetCode solve carries. A solve of
 * the same problem on another platform will not match, and that is accepted:
 * suggesting a problem someone already solved elsewhere costs them one click,
 * while a cross-platform title match would need the canonical map to be
 * populated, and it currently holds three entries.
 *
 * @param {string} topic canonical reference topic
 * @param {Array<{titleSlug?: string}>} solved the ledger
 * @param {{ limit?: number, difficulty?: string }} [opts]
 * @returns {SetProblem[]}
 */
export function unsolvedForTopic(topic, solved = [], opts = {}) {
  const seen = new Set((solved || []).map((p) => p?.titleSlug).filter(Boolean));
  let list = (NEETCODE_BY_TOPIC[topic] || []).filter((p) => !seen.has(p.slug));
  if (opts.difficulty) list = list.filter((p) => p.difficulty === opts.difficulty);
  return opts.limit ? list.slice(0, opts.limit) : list;
}

/** `leetcode.com` URL for a set problem. */
export function problemUrl(problem) {
  return `https://leetcode.com/problems/${problem.slug}/`;
}
