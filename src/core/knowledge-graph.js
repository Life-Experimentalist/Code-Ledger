/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../lib/debug.js";
import { normalizeTag } from "./topic-resolver.js";
import { classifyTopic, KIND } from "./topic-taxonomy.js";

const dbg = createDebugger("KnowledgeGraph");

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
  Easy: "#22c55e",
  Medium: "#f59e0b",
  Hard: "#ef4444",
  Unknown: "#64748b",
};

const PLATFORM_COLOR = {
  leetcode: "#FFA116",
  geeksforgeeks: "#2F8D46",
  codeforces: "#1F8ACB",
};

const TOPIC_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#14b8a6",
  "#0ea5e9",
  "#84cc16",
  "#a16207",
  "#dc2626",
  "#7c3aed",
];

/** Blend two hex colors by averaging their RGB channels. */
function blendColors(colorsArr) {
  if (!colorsArr || colorsArr.length === 0) return "#64748b";
  if (colorsArr.length === 1) return colorsArr[0];
  let r = 0,
    g = 0,
    b = 0;
  for (const hex of colorsArr) {
    const n = parseInt((hex || "#64748b").replace("#", ""), 16);
    r += (n >> 16) & 0xff;
    g += (n >> 8) & 0xff;
    b += n & 0xff;
  }
  const n = colorsArr.length;
  const toHex = (v) =>
    Math.round(v / n)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * @param {Array<object>} problems
 * @param {object} [customMappings] `settings.topicMappings` — alias → canonical name
 * @param {object} [topicKinds] `settings.topicKinds` — canonical name → "ds"|"algo"|"domain"
 */
export function buildKnowledgeGraph(problems, customMappings = {}, topicKinds = {}) {
  dbg.log(`buildKnowledgeGraph(): building from ${(problems || []).length} problems`);
  const nodes = new Map(); // id → node
  const edges = []; // { source, target, type }
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
        category: classifyTopic(topic, topicKinds).kind || KIND.DOMAIN,
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

    // Normalize tags
    const rawTopics = Array.isArray(p.tags) && p.tags.length > 0 ? p.tags : [p.topic || "Untagged"];
    const allTopics = rawTopics.map((t) => normalizeTag(t, customMappings)).filter(Boolean);
    if (allTopics.length === 0) allTopics.push("Untagged");
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
      canonical: p.canonical || null,
      canonicalId: p.canonical?.id || null,
      hasCanonical: !!p.canonical?.id,
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
          const rawSimTopics =
            Array.isArray(sim.topicTags) && sim.topicTags.length > 0
              ? sim.topicTags.map((t) => t.name || t)
              : [sim.topic || primaryTopic];
          const simTopics = rawSimTopics
            .map((t) => normalizeTag(t, customMappings))
            .filter(Boolean);
          if (simTopics.length === 0) simTopics.push("Untagged");

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
            edges.push({
              source: tid,
              target: simId,
              type: "topic-problem",
            });
          }
        }
        edges.push({ source: id, target: simId, type: "similar" });
      }
    }
  }

  // Second pass: detect cross-platform duplicates and canonical equivalents, then merge them into single nodes
  const parent = new Map();
  function findNode(i) {
    if (!parent.has(i)) parent.set(i, i);
    if (parent.get(i) === i) return i;
    const p = findNode(parent.get(i));
    parent.set(i, p);
    return p;
  }
  function unionNode(i, j) {
    const rootI = findNode(i);
    const rootJ = findNode(j);
    if (rootI !== rootJ) parent.set(rootI, rootJ);
  }

  for (const [, idSet] of slugToIds) {
    if (idSet.size <= 1) continue;
    const ids = [...idSet];
    for (let i = 1; i < ids.length; i++) unionNode(ids[0], ids[i]);
  }
  for (const [, group] of canonicalGroups) {
    if (group.length <= 1) continue;
    for (let i = 1; i < group.length; i++) unionNode(group[0], group[i]);
  }

  const mergedGroups = new Map();
  for (const id of nodes.keys()) {
    if (nodes.get(id).type !== "problem") continue;
    const root = findNode(id);
    if (!mergedGroups.has(root)) mergedGroups.set(root, []);
    mergedGroups.get(root).push(id);
  }

  for (const [root, group] of mergedGroups) {
    if (group.length <= 1) {
      nodes.get(root).mergedProblemIds = [root];
      continue;
    }
    const rootNode = nodes.get(root);

    const allPlatforms = new Set();
    const allTags = new Set();
    const allMergedIds = [];
    let isSolved = false;
    let baseColor = null;

    let hasCanonical = false;
    let canonical = null;
    let canonicalId = null;

    for (const id of group) {
      const n = nodes.get(id);
      allMergedIds.push(n.id);
      (n.platforms || []).forEach((pl) => allPlatforms.add(pl));
      (n.tags || []).forEach((t) => allTags.add(t));
      if (n.solved) isSolved = true;
      if (n.solved && !baseColor) baseColor = n.color;
      if (n.hasCanonical) {
        hasCanonical = true;
        canonical = n.canonical;
        canonicalId = n.canonicalId;
      }
    }

    rootNode.platforms = [...allPlatforms];
    rootNode.isMultiPlatform = rootNode.platforms.length > 1;
    rootNode.platformColor = blendColors(
      rootNode.platforms.map((pl) => PLATFORM_COLOR[pl] || "#64748b"),
    );
    rootNode.solved = isSolved;
    rootNode.color = baseColor || rootNode.color;
    rootNode.tags = [...allTags];
    rootNode.mergedProblemIds = allMergedIds;
    rootNode.hasCanonical = hasCanonical;
    rootNode.canonical = canonical;
    rootNode.canonicalId = canonicalId;

    for (const id of group) {
      if (id !== root) nodes.delete(id);
    }
  }

  // Remap edges and clean up duplicates/self-loops
  const finalEdges = [];
  const edgeSet = new Set();
  for (const edge of edges) {
    if (edge.source.startsWith("problem:")) edge.source = findNode(edge.source);
    if (edge.target.startsWith("problem:")) edge.target = findNode(edge.target);

    if (edge.source === edge.target) continue;

    // Sort source and target to eliminate bidirectional duplicates
    const [minNode, maxNode] =
      edge.source < edge.target ? [edge.source, edge.target] : [edge.target, edge.source];
    const key = `${minNode}->${maxNode}:${edge.type}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      finalEdges.push(edge);
    }
  }

  const result = {
    nodes: [...nodes.values()],
    edges: finalEdges,
  };
  dbg.log(
    `buildKnowledgeGraph(): ✓ complete - ${result.nodes.length} nodes, ${result.edges.length} edges`,
  );
  return result;
}

export { DIFFICULTY_COLOR, TOPIC_COLORS, PLATFORM_COLOR };
