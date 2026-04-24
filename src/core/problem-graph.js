/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from '../lib/debug.js';
const dbg = createDebugger('ProblemGraph');

/**
 * Builds vis.js graph data from solved problems.
 */
export const ProblemGraph = {
  build(problems, canonicalMap) {
    dbg.log('Building problem graph', { count: problems.length });

    const nodes = [];
    const edges = [];
    const nodeSet = new Set();

    // Create nodes for all problems
    problems.forEach(p => {
      const id = p.canonicalId || p.id;
      if (nodeSet.has(id)) return;
      
      nodes.push({
        id,
        label: p.title,
        group: p.topic || 'General',
        value: p.difficulty === 'Hard' ? 3 : p.difficulty === 'Medium' ? 2 : 1,
        title: `${p.title} (${p.difficulty})`
      });
      nodeSet.add(id);
    });

    // Create edges based on topics and patterns
    // This is a simplified version; real logic would use canonical-map.json dependencies or same-topic connections
    const topicGroups = new Map();
    problems.forEach(p => {
      const topic = p.topic || 'General';
      if (!topicGroups.has(topic)) topicGroups.set(topic, []);
      topicGroups.get(topic).push(p.canonicalId || p.id);
    });

    topicGroups.forEach((ids, topic) => {
      for (let i = 0; i < ids.length - 1; i++) {
        edges.push({ from: ids[i], to: ids[i+1], label: topic, arrows: 'to' });
      }
    });

    return { nodes, edges };
  }
};
