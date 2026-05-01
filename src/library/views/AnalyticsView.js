/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import { useMemo, useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { HeatMap } from "../../ui/components/HeatMap.js";
import { ChartWrapper } from "../../ui/components/ChartWrapper.js";
import {
  loadUserDifficultyMap,
  mapDifficulty,
} from "../../core/difficulty-map.js";

// Curated Blind 75 / NeetCode 150 — covers all major topics with real LeetCode slugs
const BLIND75 = [
  { title: "Two Sum", slug: "two-sum", topic: "Array", diff: "Easy" },
  { title: "Best Time to Buy and Sell Stock", slug: "best-time-to-buy-and-sell-stock", topic: "Array", diff: "Easy" },
  { title: "Product of Array Except Self", slug: "product-of-array-except-self", topic: "Array", diff: "Medium" },
  { title: "Maximum Subarray", slug: "maximum-subarray", topic: "Array", diff: "Medium" },
  { title: "3Sum", slug: "3sum", topic: "Array", diff: "Medium" },
  { title: "Container With Most Water", slug: "container-with-most-water", topic: "Array", diff: "Medium" },
  { title: "Find Minimum in Rotated Sorted Array", slug: "find-minimum-in-rotated-sorted-array", topic: "Binary Search", diff: "Medium" },
  { title: "Search in Rotated Sorted Array", slug: "search-in-rotated-sorted-array", topic: "Binary Search", diff: "Medium" },
  { title: "Climbing Stairs", slug: "climbing-stairs", topic: "Dynamic Programming", diff: "Easy" },
  { title: "House Robber", slug: "house-robber", topic: "Dynamic Programming", diff: "Medium" },
  { title: "Coin Change", slug: "coin-change", topic: "Dynamic Programming", diff: "Medium" },
  { title: "Longest Increasing Subsequence", slug: "longest-increasing-subsequence", topic: "Dynamic Programming", diff: "Medium" },
  { title: "Word Break", slug: "word-break", topic: "Dynamic Programming", diff: "Medium" },
  { title: "Unique Paths", slug: "unique-paths", topic: "Dynamic Programming", diff: "Medium" },
  { title: "Decode Ways", slug: "decode-ways", topic: "Dynamic Programming", diff: "Medium" },
  { title: "Longest Common Subsequence", slug: "longest-common-subsequence", topic: "Dynamic Programming", diff: "Medium" },
  { title: "Jump Game", slug: "jump-game", topic: "Greedy", diff: "Medium" },
  { title: "Clone Graph", slug: "clone-graph", topic: "Graph", diff: "Medium" },
  { title: "Course Schedule", slug: "course-schedule", topic: "Graph", diff: "Medium" },
  { title: "Number of Islands", slug: "number-of-islands", topic: "Graph", diff: "Medium" },
  { title: "Pacific Atlantic Water Flow", slug: "pacific-atlantic-water-flow", topic: "Graph", diff: "Medium" },
  { title: "Alien Dictionary", slug: "alien-dictionary", topic: "Graph", diff: "Hard" },
  { title: "Longest Consecutive Sequence", slug: "longest-consecutive-sequence", topic: "Hash Table", diff: "Medium" },
  { title: "Merge Intervals", slug: "merge-intervals", topic: "Intervals", diff: "Medium" },
  { title: "Non-overlapping Intervals", slug: "non-overlapping-intervals", topic: "Intervals", diff: "Medium" },
  { title: "Reverse Linked List", slug: "reverse-linked-list", topic: "Linked List", diff: "Easy" },
  { title: "Linked List Cycle", slug: "linked-list-cycle", topic: "Linked List", diff: "Easy" },
  { title: "Merge Two Sorted Lists", slug: "merge-two-sorted-lists", topic: "Linked List", diff: "Easy" },
  { title: "Reorder List", slug: "reorder-list", topic: "Linked List", diff: "Medium" },
  { title: "Remove Nth Node From End of List", slug: "remove-nth-node-from-end-of-list", topic: "Linked List", diff: "Medium" },
  { title: "Merge k Sorted Lists", slug: "merge-k-sorted-lists", topic: "Linked List", diff: "Hard" },
  { title: "Set Matrix Zeroes", slug: "set-matrix-zeroes", topic: "Matrix", diff: "Medium" },
  { title: "Spiral Matrix", slug: "spiral-matrix", topic: "Matrix", diff: "Medium" },
  { title: "Word Search", slug: "word-search", topic: "Matrix", diff: "Medium" },
  { title: "Longest Substring Without Repeating Characters", slug: "longest-substring-without-repeating-characters", topic: "Sliding Window", diff: "Medium" },
  { title: "Longest Repeating Character Replacement", slug: "longest-repeating-character-replacement", topic: "Sliding Window", diff: "Medium" },
  { title: "Minimum Window Substring", slug: "minimum-window-substring", topic: "Sliding Window", diff: "Hard" },
  { title: "Valid Anagram", slug: "valid-anagram", topic: "String", diff: "Easy" },
  { title: "Valid Palindrome", slug: "valid-palindrome", topic: "String", diff: "Easy" },
  { title: "Valid Parentheses", slug: "valid-parentheses", topic: "Stack", diff: "Easy" },
  { title: "Min Stack", slug: "min-stack", topic: "Stack", diff: "Medium" },
  { title: "Maximum Depth of Binary Tree", slug: "maximum-depth-of-binary-tree", topic: "Tree", diff: "Easy" },
  { title: "Invert Binary Tree", slug: "invert-binary-tree", topic: "Tree", diff: "Easy" },
  { title: "Same Tree", slug: "same-tree", topic: "Tree", diff: "Easy" },
  { title: "Binary Tree Level Order Traversal", slug: "binary-tree-level-order-traversal", topic: "Tree", diff: "Medium" },
  { title: "Validate Binary Search Tree", slug: "validate-binary-search-tree", topic: "Tree", diff: "Medium" },
  { title: "Kth Smallest Element in a BST", slug: "kth-smallest-element-in-a-bst", topic: "Tree", diff: "Medium" },
  { title: "Binary Tree Maximum Path Sum", slug: "binary-tree-maximum-path-sum", topic: "Tree", diff: "Hard" },
  { title: "Serialize and Deserialize Binary Tree", slug: "serialize-and-deserialize-binary-tree", topic: "Tree", diff: "Hard" },
  { title: "Implement Trie (Prefix Tree)", slug: "implement-trie-prefix-tree", topic: "Trie", diff: "Medium" },
  { title: "Word Search II", slug: "word-search-ii", topic: "Trie", diff: "Hard" },
  { title: "Top K Frequent Elements", slug: "top-k-frequent-elements", topic: "Heap", diff: "Medium" },
  { title: "Find Median from Data Stream", slug: "find-median-from-data-stream", topic: "Heap", diff: "Hard" },
  { title: "Number of 1 Bits", slug: "number-of-1-bits", topic: "Bit Manipulation", diff: "Easy" },
  { title: "Counting Bits", slug: "counting-bits", topic: "Bit Manipulation", diff: "Easy" },
  { title: "Missing Number", slug: "missing-number", topic: "Bit Manipulation", diff: "Easy" },
  { title: "Sum of Two Integers", slug: "sum-of-two-integers", topic: "Bit Manipulation", diff: "Medium" },
];

const PLATFORM_META = {
  leetcode:      { name: "LeetCode",     color: "#FFA116", bg: "rgba(255,161,22,0.10)" },
  geeksforgeeks: { name: "GeeksForGeeks", color: "#2F8D46", bg: "rgba(47,141,70,0.10)" },
  codeforces:    { name: "Codeforces",   color: "#1F8ACB", bg: "rgba(31,138,203,0.10)" },
};

// Normalize lang display names so "python3" / "Python3" / "Python 3" all map to "Python3"
const LANG_NORM = {
  python: "Python", python3: "Python3", "python3": "Python3",
  cpp: "C++", "c++": "C++", c: "C", java: "Java",
  javascript: "JavaScript", js: "JavaScript", typescript: "TypeScript", ts: "TypeScript",
  ruby: "Ruby", golang: "Go", go: "Go", swift: "Swift", kotlin: "Kotlin",
  scala: "Scala", rust: "Rust", php: "PHP", csharp: "C#", "c#": "C#",
  dart: "Dart", racket: "Racket", erlang: "Erlang", elixir: "Elixir",
  mysql: "MySQL", postgresql: "PostgreSQL", bash: "Bash",
};
function normalizeLang(raw) {
  if (!raw) return "Unknown";
  const key = String(raw).toLowerCase().replace(/\s+/g, "");
  return LANG_NORM[key] || raw;
}

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Normalise timestamps that may be in seconds (old imports/API) or milliseconds (Date.now())
function toMs(ts) {
  const n = Number(ts) || 0;
  return n < 1e10 ? n * 1000 : n; // < year 2286 in seconds → treat as seconds
}

export function AnalyticsView({ problems }) {
  const [userMap, setUserMap] = useState({});
  useEffect(() => {
    let m = true;
    loadUserDifficultyMap()
      .then((map) => { if (m) setUserMap(map || {}); })
      .catch(() => {});
    return () => (m = false);
  }, []);

  const stats = useMemo(() => {
    const s = {
      easy: 0, medium: 0, hard: 0, unknown: 0,
      total: problems.length,
      topics: {},
      platforms: {},
      langs: {},
      weeks: {},
      currentStreak: 0,
      longestStreak: 0,
      thisWeek: 0,
      thisMonth: 0,
      avgSolveSeconds: 0,
    };

    // Pre-build last 12 weeks slots
    const dNow = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(dNow.getTime() - i * 7 * 86400000);
      const wStr = `${d.getFullYear()}-W${String(Math.ceil((d.getDate() - d.getDay() + 1) / 7)).padStart(2, "0")}`;
      s.weeks[wStr] = 0;
    }

    // Build day map for streak calculation
    const dayMap = {};
    problems.forEach((p) => {
      const cat = mapDifficulty(p.difficulty, userMap);
      if (cat === "Easy") s.easy++;
      else if (cat === "Medium") s.medium++;
      else if (cat === "Hard") s.hard++;
      else s.unknown++;

      const tags = Array.isArray(p.tags) ? p.tags : [];
      tags.forEach((t) => {
        if (!s.topics[t]) s.topics[t] = { easy: 0, medium: 0, hard: 0, total: 0 };
        s.topics[t].total++;
        if (cat === "Easy") s.topics[t].easy++;
        else if (cat === "Medium") s.topics[t].medium++;
        else if (cat === "Hard") s.topics[t].hard++;
      });

      const platform = p.platform || "unknown";
      if (!s.platforms[platform]) s.platforms[platform] = { total: 0, easy: 0, medium: 0, hard: 0 };
      s.platforms[platform].total++;
      if (cat === "Easy") s.platforms[platform].easy++;
      else if (cat === "Medium") s.platforms[platform].medium++;
      else if (cat === "Hard") s.platforms[platform].hard++;

      let lang = p.lang?.name || p.language || "Unknown";
      // Sanitise legacy entries where the slug (ext) is stored without a name
      if (!lang || lang === "undefined" || lang === "null" || lang === "Solution") {
        lang = p.lang?.ext ? p.lang.ext.toUpperCase() : "Unknown";
      }
      lang = normalizeLang(lang);
      s.langs[lang] = (s.langs[lang] || 0) + 1;

      const solvedDate = new Date(toMs(p.timestamp));
      const wStr = `${solvedDate.getFullYear()}-W${String(Math.ceil((solvedDate.getDate() - solvedDate.getDay() + 1) / 7)).padStart(2, "0")}`;
      if (s.weeks[wStr] !== undefined) s.weeks[wStr]++;

      const ds = dateStr(solvedDate);
      dayMap[ds] = (dayMap[ds] || 0) + 1;

      // This week / this month
      const now = new Date();
      const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
      if (solvedDate >= weekStart) s.thisWeek++;
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      if (solvedDate >= monthStart) s.thisMonth++;
    });

    // Compute current streak and longest streak
    const today = new Date();
    let streak = 0, tempStreak = 0, maxStreak = 0;
    for (let i = 0; i < 730; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      if (dayMap[dateStr(d)]) {
        if (i === 0 || streak > 0) streak++;
        tempStreak++;
        maxStreak = Math.max(maxStreak, tempStreak);
      } else {
        if (i === 0) streak = 0; // today no solve — streak = 0
        else if (streak > 0) { maxStreak = Math.max(maxStreak, streak); break; }
        tempStreak = 0;
      }
    }
    s.currentStreak = streak;
    s.longestStreak = Math.max(maxStreak, tempStreak);

    // Average solve time (only problems that have elapsedSeconds)
    const timed = problems.filter(p => p.elapsedSeconds > 0);
    if (timed.length > 0) {
      s.avgSolveSeconds = Math.round(timed.reduce((acc, p) => acc + p.elapsedSeconds, 0) / timed.length);
    }

    return s;
  }, [problems, userMap]);

  const chartData = useMemo(() => {
    const sortedTopics = Object.entries(stats.topics).sort(
      (a, b) => (b[1].hard * 5 + b[1].medium * 3 + b[1].easy) - (a[1].hard * 5 + a[1].medium * 3 + a[1].easy)
    );
    const tpLabels = sortedTopics.slice(0, 8).map((t) => t[0]);
    const maxTopicTotal = Math.max(1, ...Object.values(stats.topics).map(t => t.total));

    return {
      topicRadar: {
        labels: tpLabels,
        datasets: [{
          label: "Depth (%)",
          data: tpLabels.map((t) => Math.min(100, (stats.topics[t].total / Math.max(1, maxTopicTotal)) * 100)),
          backgroundColor: "rgba(6, 182, 212, 0.2)",
          borderColor: "rgba(6, 182, 212, 1)",
          pointBackgroundColor: "rgba(6, 182, 212, 1)",
        }],
      },
      difficultyDonut: {
        labels: stats.unknown > 0 ? ["Easy", "Medium", "Hard", "Unknown"] : ["Easy", "Medium", "Hard"],
        datasets: [{
          data: stats.unknown > 0
            ? [stats.easy, stats.medium, stats.hard, stats.unknown]
            : [stats.easy, stats.medium, stats.hard],
          backgroundColor: stats.unknown > 0
            ? ["#10b981", "#f59e0b", "#ef4444", "#64748b"]
            : ["#10b981", "#f59e0b", "#ef4444"],
          borderWidth: 0,
        }],
      },
      platformBar: {
        labels: Object.keys(stats.platforms).map(p => PLATFORM_META[p]?.name || p),
        datasets: [{
          label: "Problems",
          data: Object.values(stats.platforms).map(p => p.total),
          backgroundColor: Object.keys(stats.platforms).map(
            (p) => PLATFORM_META[p]?.color || "#94a3b8"
          ),
          borderRadius: 6,
        }],
      },
      langPie: {
        labels: Object.keys(stats.langs),
        datasets: [{
          data: Object.values(stats.langs),
          backgroundColor: [
            "#f1e05a", "#3178c6", "#b07219", "#e34c26",
            "#89e051", "#f34b7d", "#00ADD8", "#6e40c9",
          ].slice(0, Object.keys(stats.langs).length),
          borderWidth: 0,
        }],
      },
      velocityLine: {
        labels: Object.keys(stats.weeks).map((w) => w.split("-")[1]),
        datasets: [{
          label: "Solved",
          data: Object.values(stats.weeks),
          borderColor: "#06b6d4",
          tension: 0.3,
          fill: true,
          backgroundColor: "rgba(6, 182, 212, 0.05)",
        }],
      },
    };
  }, [stats]);

  const topTopics = Object.entries(stats.topics)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 6);

  const maxTopicCount = Math.max(1, ...topTopics.map(([, c]) => c.total));

  const unsolvedNext = useMemo(() => {
    const solvedSlugs = new Set(
      problems
        .filter((p) => p.platform === "leetcode" || !p.platform)
        .map((p) => (p.titleSlug || p.title || "").toLowerCase().replace(/[^a-z0-9-]/g, "-"))
    );
    const solvedTitles = new Set(problems.map((p) => (p.title || "").toLowerCase()));

    let available = BLIND75.filter(
      (p) => !solvedSlugs.has(p.slug) && !solvedTitles.has(p.title.toLowerCase())
    );

    // Sort: favor topics the user is already practicing (higher mastery = more to work on)
    available.sort((a, b) => {
      const aMastery = (stats.topics[a.topic]?.total || 0);
      const bMastery = (stats.topics[b.topic]?.total || 0);
      if (bMastery !== aMastery) return bMastery - aMastery;
      // Within same mastery, harder first if user does hard, easier if user does easy
      const hardRatio = stats.hard / (stats.total || 1);
      const diffOrder = hardRatio > 0.25 ? ["Hard", "Medium", "Easy"] : ["Easy", "Medium", "Hard"];
      return diffOrder.indexOf(a.diff) - diffOrder.indexOf(b.diff);
    });

    return available.slice(0, 4);
  }, [problems, stats]);

  const diffColor = (d) =>
    d === "Hard" ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
    : d === "Medium" ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";

  return html`
    <div class="flex flex-col gap-6 w-full pb-10">

      <!-- Quick stats row -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        ${[
          { label: "Total Solved", value: stats.total, sub: `${stats.easy}E · ${stats.medium}M · ${stats.hard}H`, color: "#06b6d4" },
          { label: "Current Streak", value: `${stats.currentStreak}d`, sub: `Best: ${stats.longestStreak} days`, color: "#10b981" },
          { label: "This Week", value: stats.thisWeek, sub: `${stats.thisMonth} this month`, color: "#f59e0b" },
          stats.avgSolveSeconds > 0
            ? (() => {
                const h = Math.floor(stats.avgSolveSeconds / 3600);
                const m = Math.floor((stats.avgSolveSeconds % 3600) / 60);
                const s2 = stats.avgSolveSeconds % 60;
                const val = h > 0 ? `${h}h${m}m` : m > 0 ? `${m}m${s2}s` : `${s2}s`;
                return { label: "Avg Solve Time", value: val, sub: "avg across timed problems", color: "#ec4899" };
              })()
            : { label: "Languages", value: Object.keys(stats.langs).length, sub: Object.entries(stats.langs).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([l])=>l).join(", ") || "—", color: "#8b5cf6" },
        ].map(card => html`
          <div class="p-4 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col gap-1 relative overflow-hidden">
            <div class="absolute inset-0 opacity-5" style=${{ background: `radial-gradient(circle at 0% 0%, ${card.color}, transparent 60%)` }}></div>
            <span class="text-[10px] uppercase tracking-widest text-slate-500">${card.label}</span>
            <span class="text-2xl font-bold" style=${{ color: card.color }}>${card.value}</span>
            <span class="text-[10px] text-slate-500 truncate">${card.sub}</span>
          </div>
        `)}
      </div>

      <!-- Platform breakdown -->
      ${Object.keys(stats.platforms).length > 0 ? html`
        <div class="grid gap-4" style=${{ gridTemplateColumns: `repeat(${Math.min(3, Object.keys(stats.platforms).length)}, 1fr)` }}>
          ${Object.entries(stats.platforms).sort((a,b)=>b[1].total-a[1].total).map(([pid, counts]) => {
            const meta = PLATFORM_META[pid] || { name: pid, color: "#94a3b8", bg: "rgba(148,163,184,0.10)" };
            const pct = (n) => counts.total ? Math.round((n / counts.total) * 100) : 0;
            return html`
              <div class="p-4 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col gap-3">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-semibold" style=${{ color: meta.color }}>${meta.name}</span>
                  <span class="text-lg font-bold text-white">${counts.total}</span>
                </div>
                <div class="flex gap-3 text-[11px]">
                  <span class="text-emerald-400">${counts.easy}E (${pct(counts.easy)}%)</span>
                  <span class="text-amber-400">${counts.medium}M (${pct(counts.medium)}%)</span>
                  <span class="text-rose-400">${counts.hard}H (${pct(counts.hard)}%)</span>
                </div>
                <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                  <div class="h-full bg-emerald-500" style=${{ width: `${pct(counts.easy)}%` }}></div>
                  <div class="h-full bg-amber-500" style=${{ width: `${pct(counts.medium)}%` }}></div>
                  <div class="h-full bg-rose-500" style=${{ width: `${pct(counts.hard)}%` }}></div>
                </div>
              </div>
            `;
          })}
        </div>
      ` : ""}

      <!-- Heatmap + Difficulty Split -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2">
          <${HeatMap} problems=${problems} />
        </div>

        <div class="p-5 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col gap-3 relative overflow-hidden">
          <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(6,182,212,0.05),transparent)] pointer-events-none"></div>
          <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest z-10">Difficulty Split</h3>
          <div class="relative z-10" style="height:180px">
            <${ChartWrapper}
              type="doughnut"
              data=${chartData.difficultyDonut}
              options=${{
                responsive: true,
                maintainAspectRatio: false,
                cutout: "72%",
                plugins: {
                  legend: { position: "bottom", labels: { color: "#94a3b8", padding: 12, usePointStyle: true, boxWidth: 6, font: { size: 10 } } },
                },
              }}
            />
            <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style="padding-bottom:36px">
              <span class="text-2xl font-bold text-white">${stats.total}</span>
              <span class="text-[10px] text-slate-500 uppercase tracking-wider">Solved</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Charts row -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="p-5 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col h-72">
          <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Topic Depth</h3>
          <div class="flex-1 min-h-0">
            <${ChartWrapper}
              type="radar"
              data=${chartData.topicRadar}
              options=${{
                scales: {
                  r: {
                    grid: { color: "rgba(255,255,255,0.1)" },
                    angleLines: { color: "rgba(255,255,255,0.05)" },
                    pointLabels: { color: "#94a3b8", font: { size: 10 } },
                    ticks: { display: false },
                    suggestedMin: 0, suggestedMax: 100,
                  },
                },
                plugins: { legend: { display: false } },
              }}
            />
          </div>
        </div>

        <div class="p-5 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col lg:col-span-2 h-72">
          <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Solve Velocity (12 Weeks)</h3>
          <div class="flex-1 min-h-0">
            <${ChartWrapper}
              type="line"
              data=${chartData.velocityLine}
              options=${{
                scales: { y: { beginAtZero: true, grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#64748b" } }, x: { grid: { display: false }, ticks: { color: "#64748b" } } },
                plugins: { legend: { display: false } },
              }}
            />
          </div>
        </div>

        <div class="p-5 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col h-72">
          <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Languages</h3>
          <div class="flex-1 min-h-0">
            <${ChartWrapper}
              type="pie"
              data=${chartData.langPie}
              options=${{
                plugins: {
                  legend: { position: "bottom", labels: { color: "#94a3b8", usePointStyle: true, boxWidth: 8, font: { size: 10 } } },
                },
              }}
            />
          </div>
        </div>
      </div>

      <!-- Topic grid + Unsolved Next -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 flex flex-col gap-4">
          <h3 class="text-sm font-bold text-white tracking-wide">Topic Breakdown</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${topTopics.map(([topic, counts]) => {
              const barPct = Math.round((counts.total / maxTopicCount) * 100);
              return html`
                <div class="p-4 bg-[#0a0a0f] border border-white/5 rounded-xl hover:border-cyan-900/50 transition-colors cursor-pointer group">
                  <div class="flex justify-between items-center mb-2">
                    <span class="font-medium text-sm text-slate-300 group-hover:text-cyan-400 transition-colors truncate pr-2">${topic}</span>
                    <span class="text-xs font-mono text-slate-500 shrink-0">${counts.total} solved</span>
                  </div>
                  <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                    <div class="h-full bg-emerald-500 transition-all" style=${{ width: `${counts.total ? (counts.easy / counts.total) * barPct : 0}%` }}></div>
                    <div class="h-full bg-amber-500 transition-all" style=${{ width: `${counts.total ? (counts.medium / counts.total) * barPct : 0}%` }}></div>
                    <div class="h-full bg-rose-500 transition-all" style=${{ width: `${counts.total ? (counts.hard / counts.total) * barPct : 0}%` }}></div>
                  </div>
                  <div class="flex gap-3 mt-1.5 text-[10px] text-slate-600">
                    ${counts.easy ? html`<span class="text-emerald-700">${counts.easy}E</span>` : ""}
                    ${counts.medium ? html`<span class="text-amber-700">${counts.medium}M</span>` : ""}
                    ${counts.hard ? html`<span class="text-rose-700">${counts.hard}H</span>` : ""}
                  </div>
                </div>
              `;
            })}
          </div>
        </div>

        <!-- Unsolved Next (Blind 75-based) -->
        <div class="flex flex-col gap-4">
          <h3 class="text-sm font-bold text-white tracking-wide">Up Next (Blind 75)</h3>
          <div class="p-5 bg-gradient-to-b from-[#101018] to-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col gap-3 h-full">
            <p class="text-[11px] text-slate-400 mb-1">Unsolved from the Blind 75 list, tailored to your gaps:</p>
            ${unsolvedNext.length === 0
              ? html`<p class="text-xs text-emerald-400 py-4 text-center">You've completed the Blind 75!</p>`
              : unsolvedNext.map(rec => html`
                <a
                  href=${"https://leetcode.com/problems/" + rec.slug + "/"}
                  target="_blank"
                  rel="noreferrer"
                  class="p-3 bg-white/[0.02] border border-white/5 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all rounded-lg flex items-center justify-between group"
                >
                  <div class="flex flex-col min-w-0">
                    <span class="text-sm font-medium text-slate-300 group-hover:text-cyan-400 truncate">${rec.title}</span>
                    <span class="text-[10px] text-slate-500 mt-0.5">${rec.topic}</span>
                  </div>
                  <span class="text-xs px-2 py-0.5 rounded-full border ${diffColor(rec.diff)} shrink-0 ml-2">${rec.diff}</span>
                </a>
              `)
            }
            <a
              href="https://neetcode.io/practice?tab=neetcode75"
              target="_blank"
              rel="noreferrer"
              class="text-[11px] text-slate-500 hover:text-cyan-400 text-center mt-1 transition-colors"
            >View full Blind 75 list ↗</a>
          </div>
        </div>
      </div>
    </div>
  `;
}
