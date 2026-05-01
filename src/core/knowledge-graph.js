/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Builds a topic-centric knowledge graph from solved problems.
 *
 * Node types:
 *   - "topic"   : a DSA topic (e.g. "Dynamic Programming")
 *   - "problem" : an individual solved problem
 *
 * Edge types:
 *   - "topic-problem" : problem belongs to this topic
 *   - "similar"       : two problems are marked as similar (from LeetCode metadata)
 *   - "canonical"     : two problems map to the same canonical problem (cross-platform)
 */

const DIFFICULTY_COLOR = {
  Easy:    "#22c55e",
  Medium:  "#f59e0b",
  Hard:    "#ef4444",
  Unknown: "#64748b",
};

const PLATFORM_COLOR = {
  leetcode:      "#FFA116",
  geeksforgeeks: "#2F8D46",
  codeforces:    "#1F8ACB",
};

const TOPIC_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#14b8a6",
  "#0ea5e9", "#84cc16", "#a16207", "#dc2626", "#7c3aed",
];

/** Blend two hex colors by averaging their RGB channels. */
function blendColors(colorsArr) {
  if (!colorsArr || colorsArr.length === 0) return "#64748b";
  if (colorsArr.length === 1) return colorsArr[0];
  let r = 0, g = 0, b = 0;
  for (const hex of colorsArr) {
    const n = parseInt((hex || "#64748b").replace("#", ""), 16);
    r += (n >> 16) & 0xff;
    g += (n >> 8) & 0xff;
    b += n & 0xff;
  }
  const n = colorsArr.length;
  const toHex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function buildKnowledgeGraph(problems) {
  const nodes = new Map(); // id → node
  const edges = [];        // { source, target, type }
  const topicColorMap = new Map();
  let topicColorIdx = 0;

  function topicColor(topic) {
    if (!topicColorMap.has(topic)) {
      topicColorMap.set(topic, TOPIC_COLORS[topicColorIdx++ % TOPIC_COLORS.length]);
    }
    return topicColorMap.get(topic);
  }

  function ensureTopic(topic) {
    const id = `topic:${topic}`;
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        type: "topic",
        label: topic,
        color: topicColor(topic),
        size: 24,
        count: 0,
      });
    }
    const node = nodes.get(id);
    node.count++;
    node.size = 16 + Math.min(node.count * 2, 32);
    return id;
  }

  // Track slug → node IDs (supports same problem on multiple platforms)
  const slugToIds = new Map(); // titleSlug → Set<nodeId>
  const canonicalGroups = new Map(); // canonicalId → [node ids]

  // First pass: create problem nodes
  for (const p of problems) {
    const id = `problem:${p.platform}:${p.titleSlug || p.id}`;

    // Use ALL tags for topic edges — this is the key fix (was only using first tag)
    const allTopics =
      Array.isArray(p.tags) && p.tags.length > 0
        ? p.tags
        : [p.topic || "Untagged"];
    const primaryTopic = allTopics[0];

    // Determine node color: difficulty-based, but blended if solved on multiple platforms
    const slug = p.titleSlug || String(p.id);
    if (!slugToIds.has(slug)) slugToIds.set(slug, new Set());
    slugToIds.get(slug).add(id);

    nodes.set(id, {
      id,
      type: "problem",
      label: p.title || p.titleSlug || String(p.id),
      // Color is difficulty-based; platform tint applied in GraphView rendering
      color: DIFFICULTY_COLOR[p.difficulty] || "#64748b",
      platformColor: PLATFORM_COLOR[p.platform] || "#64748b",
      size: 10,
      platform: p.platform,
      difficulty: p.difficulty,
      topic: primaryTopic,
      topics: allTopics,
      titleSlug: slug,
      solved: true,
      platforms: [p.platform],
      // Rich metadata for the info panel
      runtime: p.runtime || null,
      memory: p.memory || null,
      lang: p.lang?.name || p.language || null,
      timestamp: p.timestamp || null,
      tags: allTopics,
      acRate: p.acRate || null,
      runtimePct: p.runtimePct || null,
      memoryPct: p.memoryPct || null,
    });

    // Create edges for ALL topics (not just the first one)
    for (const topic of allTopics) {
      const topicId = ensureTopic(topic);
      edges.push({ source: topicId, target: id, type: "topic-problem" });
    }

    // Canonical grouping
    if (p.canonical?.id) {
      const cid = String(p.canonical.id);
      if (!canonicalGroups.has(cid)) canonicalGroups.set(cid, []);
      canonicalGroups.get(cid).push(id);
    }

    // Add unsolved similar problems as ghost nodes
    if (Array.isArray(p.similar)) {
      for (const sim of p.similar) {
        if (!sim.titleSlug) continue;
        const simId = `problem:leetcode:${sim.titleSlug}`;
        if (!nodes.has(simId)) {
          const simTopics =
            Array.isArray(sim.topicTags) && sim.topicTags.length > 0
              ? sim.topicTags.map((t) => t.name || t)
              : [sim.topic || primaryTopic];
          nodes.set(simId, {
            id: simId,
            type: "problem",
            label: sim.title || sim.titleSlug,
            color: DIFFICULTY_COLOR[sim.difficulty] || "#64748b",
            platformColor: PLATFORM_COLOR.leetcode,
            size: 8,
            platform: "leetcode",
            difficulty: sim.difficulty,
            topic: simTopics[0],
            topics: simTopics,
            titleSlug: sim.titleSlug,
            solved: false,
            platforms: [],
            tags: simTopics,
          });
          if (!slugToIds.has(sim.titleSlug)) slugToIds.set(sim.titleSlug, new Set());
          slugToIds.get(sim.titleSlug).add(simId);
          for (const t of simTopics) {
            const tid = ensureTopic(t);
            edges.push({ source: tid, target: simId, type: "topic-problem" });
          }
        }
        edges.push({ source: id, target: simId, type: "similar" });
      }
    }
  }

  // Backbone: connect all topic nodes in a ring so no cluster can fully detach.
  // Use a sparse ring (O(n) edges) — enough to keep the graph connected without
  // over-constraining the layout.
  const topicNodeIds = [...nodes.values()]
    .filter((n) => n.type === "topic")
    .map((n) => n.id);
  for (let i = 0; i < topicNodeIds.length; i++) {
    edges.push({
      source: topicNodeIds[i],
      target: topicNodeIds[(i + 1) % topicNodeIds.length],
      type: "topic-topic",
    });
  }

  // Second pass: detect cross-platform duplicates (same titleSlug, different platforms)
  // Merge their platform lists and blend colors to show multi-platform status
  for (const [, idSet] of slugToIds) {
    if (idSet.size <= 1) continue;
    const ids = [...idSet];
    const allPlatforms = ids
      .map((id) => nodes.get(id)?.platform)
      .filter(Boolean);
    const blended = blendColors(allPlatforms.map((pl) => PLATFORM_COLOR[pl] || "#64748b"));

    for (const id of ids) {
      const node = nodes.get(id);
      if (!node) continue;
      node.platforms = allPlatforms;
      node.isMultiPlatform = true;
      // Use blended platform color as accent; difficulty color stays as base
      node.platformColor = blended;
      // Add canonical cross-platform edges
      for (const other of ids) {
        if (other !== id) {
          edges.push({ source: id, target: other, type: "canonical" });
        }
      }
    }
  }

  // Canonical cross-platform edges from metadata
  for (const [, group] of canonicalGroups) {
    for (let i = 0; i < group.length - 1; i++) {
      edges.push({ source: group[i], target: group[i + 1], type: "canonical" });
    }
  }

  return {
    nodes: [...nodes.values()],
    edges,
  };
}

export { DIFFICULTY_COLOR, TOPIC_COLORS, PLATFORM_COLOR };
