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
 *   - "canonical"     : two problems map to the same canonical problem
 */

const DIFFICULTY_COLOR = {
  Easy:   "#22c55e",
  Medium: "#f59e0b",
  Hard:   "#ef4444",
};

const TOPIC_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#14b8a6",
  "#0ea5e9", "#84cc16", "#a16207", "#dc2626", "#7c3aed",
];

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
    node.size = 16 + Math.min(node.count * 2, 32); // grow with problem count
    return id;
  }

  const slugToId = new Map(); // titleSlug → node id
  const canonicalGroups = new Map(); // canonicalId → [node ids]

  for (const p of problems) {
    const id = `problem:${p.platform}:${p.titleSlug || p.id}`;
    const topic = p.topic || p.tags?.[0] || "Uncategorized";
    const topicId = ensureTopic(topic);

    nodes.set(id, {
      id,
      type: "problem",
      label: p.title || p.titleSlug || String(p.id),
      color: DIFFICULTY_COLOR[p.difficulty] || "#64748b",
      size: 10,
      platform: p.platform,
      difficulty: p.difficulty,
      topic,
      titleSlug: p.titleSlug,
      solved: true,
    });

    if (p.titleSlug) slugToId.set(p.titleSlug, id);

    edges.push({ source: topicId, target: id, type: "topic-problem" });

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
          nodes.set(simId, {
            id: simId,
            type: "problem",
            label: sim.title || sim.titleSlug,
            color: DIFFICULTY_COLOR[sim.difficulty] || "#64748b",
            size: 8,
            platform: "leetcode",
            difficulty: sim.difficulty,
            topic: sim.topic || topic,
            titleSlug: sim.titleSlug,
            solved: false,
          });
          slugToId.set(sim.titleSlug, simId);
          // Link to same topic
          const simTopicId = ensureTopic(sim.topic || topic);
          edges.push({ source: simTopicId, target: simId, type: "topic-problem" });
        }
        edges.push({ source: id, target: simId, type: "similar" });
      }
    }
  }

  // Canonical cross-platform edges
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

export { DIFFICULTY_COLOR, TOPIC_COLORS };
