/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Graph layout — where the nodes go, with no canvas and no framework in sight.
 *
 * Split out of GraphView so the geometry can be tested on its own. Everything
 * here is pure arithmetic over plain objects: it mutates node positions and
 * returns nothing, and the world origin is fixed at (0,0) so no function needs
 * to know how large the canvas is.
 */
/* ── Force simulation constants ─────────────────────────────────────── */
const REPULSION = 3800;
// Rest length is the gap between two node *rims*, not their centres. A topic
// hub is up to 48px across, so the old centre-to-centre 60 put its problems
// inside the circle they belong to — which is most of what read as clutter.
const LINK_DIST = { "topic-problem": 46, similar: 70, canonical: 40 };
const LINK_STR = { "topic-problem": 0.6, similar: 0.05, canonical: 0.6 };
/** Clear space every node keeps around itself. Nothing may sit on top of it. */
export const COLLIDE_PAD = 7;
// Very weak gravity toward origin — NOT alpha-scaled.
const GRAVITY = 0.00045;
const DAMPING = 0.85;
export const ALPHA_DECAY = 0.013;

/* ── Simulation step ─────────────────────────────────────────────────── */
// World origin is fixed at (0,0). No canvas dimensions involved here.
export function simulationStep(nodes, edges, alpha) {
  for (const n of nodes) {
    n.fx = 0;
    n.fy = 0;
  }

  // Repulsion — with softening radius to prevent singularities
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i],
        b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;

      // Distance cutoff: Skip repulsion if nodes are far apart to prevent isolated clusters flying away
      if (d2 > 202500) continue; // 450px^2 = 202500

      // Softening radius: minimum effective distance = 12px
      const dsoft = Math.sqrt(d2 + 144);
      const d2soft = dsoft * dsoft;
      const f = (REPULSION * alpha) / d2soft;
      a.fx -= f * dx;
      a.fy -= f * dy;
      b.fx += f * dx;
      b.fy += f * dy;
    }
  }

  // Attraction along edges
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    const a = nodeMap.get(e.source),
      b = nodeMap.get(e.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const ld = (LINK_DIST[e.type] ?? 100) + a.size + b.size;
    const str = LINK_STR[e.type] ?? 0.3;
    const f = (d - ld) * str * alpha;
    a.fx += (f * dx) / d;
    a.fy += (f * dy) / d;
    b.fx -= (f * dx) / d;
    b.fy -= (f * dy) / d;
  }

  // Single-topic orbit: problems with exactly one topic connection orbit at ~60px from it
  const problemTopicCount = new Map();
  const singleTopicMap = new Map();
  for (const e of edges) {
    if (e.type !== "topic-problem") continue;
    const pId = e.target;
    problemTopicCount.set(pId, (problemTopicCount.get(pId) || 0) + 1);
    singleTopicMap.set(pId, e.source);
  }
  for (const [problemId, topicId] of singleTopicMap) {
    if ((problemTopicCount.get(problemId) || 0) !== 1) continue;
    const p = nodeMap.get(problemId);
    const t = nodeMap.get(topicId);
    if (!p || !t) continue;
    const dx = t.x - p.x,
      dy = t.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const pull = (d - (46 + p.size + t.size)) * 0.015 * alpha;
    p.fx += (pull * dx) / d;
    p.fy += (pull * dy) / d;
  }

  // Gravity toward origin to prevent clusters from flying away forever
  for (const n of nodes) {
    const dist2 = n.x * n.x + n.y * n.y;
    // Increase gravity exponentially if node is very far away (>800px or >1200px)
    const g = dist2 > 1440000 ? GRAVITY * 12 : dist2 > 640000 ? GRAVITY * 4 : GRAVITY;
    n.fx -= n.x * g;
    n.fy -= n.y * g;
  }

  // Integrate with velocity cap
  const MAX_VELOCITY = 45; // Max px/frame per axis
  for (const n of nodes) {
    n.vx = (n.vx + n.fx) * DAMPING;
    n.vy = (n.vy + n.fy) * DAMPING;
    // Cap velocity to prevent runaway
    n.vx = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, n.vx));
    n.vy = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, n.vy));
    n.x += n.vx;
    n.y += n.vy;
  }

  // Separation, resolved on positions rather than added as another force.
  // Repulsion falls off with distance and so only ever makes overlap *less
  // likely*; this makes it impossible. Two nodes end at least their two radii
  // plus a margin apart, whatever else the simulation wanted.
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i],
        b = nodes[j];
      const min = a.size + b.size + COLLIDE_PAD;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      let d = Math.sqrt(d2);
      if (d < 0.01) {
        // Exactly coincident — any direction will do, but it has to be a
        // *stable* one, or the pair jitters differently on every frame.
        dx = i % 2 ? 1 : -1;
        dy = j % 2 ? 1 : -1;
        d = Math.SQRT2;
      }
      const push = ((min - d) / d) * 0.5;
      a.x -= dx * push;
      a.y -= dy * push;
      b.x += dx * push;
      b.y += dy * push;
    }
  }
}

export function seedNode(node, x, y) {
  node.x = x;
  node.y = y;
  node.vx = 0;
  node.vy = 0;
  node.fx = 0;
  node.fy = 0;
}

function getPrimaryTopics(edges) {
  const primaryTopic = new Map();
  for (const e of edges) {
    if (e.type === "topic-problem" && !primaryTopic.has(e.target)) {
      primaryTopic.set(e.target, e.source);
    }
  }
  return primaryTopic;
}

// All world positions are centered at (0,0) — independent of canvas size.
// Topics go in a ring; each problem spawns near its primary topic.
function applyCircularLayout(nodes, edges) {
  const topicNodes = nodes.filter((n) => n.type === "topic");
  const problemNodes = nodes.filter((n) => n.type === "problem");

  // Space topics evenly around a ring large enough so clusters don't overlap
  const topicRadius = Math.max(120, topicNodes.length * 18);
  const topicPos = new Map();

  topicNodes.forEach((n, i) => {
    const angle = (i / topicNodes.length) * Math.PI * 2 - Math.PI / 2;
    seedNode(n, Math.cos(angle) * topicRadius, Math.sin(angle) * topicRadius);
    topicPos.set(n.id, { x: n.x, y: n.y, r: n.size });
  });

  const primaryTopic = getPrimaryTopics(edges);

  // Count problems per topic so we spread them evenly in a ring around the topic node
  const perTopicCount = new Map();
  for (const n of problemNodes) {
    const tid = primaryTopic.get(n.id);
    if (tid) perTopicCount.set(tid, (perTopicCount.get(tid) || 0) + 1);
  }
  const perTopicIdx = new Map();

  problemNodes.forEach((n) => {
    const tid = primaryTopic.get(n.id);
    const base = (tid && topicPos.get(tid)) || { x: 0, y: 0, r: 0 };
    const idx = perTopicIdx.get(tid) || 0;
    const count = perTopicCount.get(tid) || 1;
    perTopicIdx.set(tid, idx + 1);
    const angle = (idx / count) * Math.PI * 2;
    // Measured from the hub's rim — seeding inside it just makes the first
    // second of the simulation an explosion.
    const spread = (base.r || 0) + (n.solved ? 28 + Math.random() * 18 : 48 + Math.random() * 22);
    seedNode(n, base.x + Math.cos(angle) * spread, base.y + Math.sin(angle) * spread);
  });
}

function applyLayeredLayout(nodes, edges) {
  const topicNodes = nodes
    .filter((n) => n.type === "topic")
    .sort(
      (a, b) => (b.count || 0) - (a.count || 0) || String(a.label).localeCompare(String(b.label)),
    );
  const problemNodes = nodes.filter((n) => n.type === "problem");
  const primaryTopic = getPrimaryTopics(edges);

  const topicGap = Math.max(180, Math.min(300, 1200 / Math.max(topicNodes.length, 1)));
  const topicY = -280;
  const topicBase = (topicNodes.length - 1) / 2;
  const topicPos = new Map();

  topicNodes.forEach((n, i) => {
    const x = (i - topicBase) * topicGap;
    seedNode(n, x, topicY);
    topicPos.set(n.id, { x, y: topicY });
  });

  const bucketsByTopic = new Map();
  for (const n of problemNodes) {
    const topicId = primaryTopic.get(n.id) || "__orphan__";
    if (!bucketsByTopic.has(topicId)) {
      bucketsByTopic.set(topicId, {
        Easy: [],
        Medium: [],
        Hard: [],
        Unknown: [],
      });
    }
    const bucket = bucketsByTopic.get(topicId);
    const difficulty = bucket[n.difficulty] ? n.difficulty : "Unknown";
    bucket[difficulty].push(n);
  }

  const rows = { Easy: -90, Medium: 20, Hard: 130, Unknown: 240 };
  const itemGap = 48;

  for (const [topicId, bucket] of bucketsByTopic) {
    const baseX = topicId === "__orphan__" ? 0 : topicPos.get(topicId)?.x || 0;
    for (const difficulty of ["Easy", "Medium", "Hard", "Unknown"]) {
      const items = bucket[difficulty];
      if (!items.length) continue;
      const spread = (items.length - 1) * itemGap;
      items.forEach((n, index) => {
        const x = baseX + index * itemGap - spread / 2;
        const y = rows[difficulty] + (n.solved ? 0 : 26);
        seedNode(n, x, y);
      });
    }
  }
}

function applyForceSeedLayout(nodes) {
  nodes.forEach((n, index) => {
    const angle = index * 2.399963229728653;
    const radius = 18 + Math.sqrt(index + 1) * 28;
    seedNode(n, Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
}

function applyClusteredLayout(nodes, edges) {
  const topicNodes = nodes.filter((n) => n.type === "topic");
  const problemNodes = nodes.filter((n) => n.type === "problem");

  // Force a very wide ring for topics so clusters do not intersect
  const topicRadius = Math.max(300, topicNodes.length * 40);
  const topicPos = new Map();

  topicNodes.forEach((n, i) => {
    const angle = (i / topicNodes.length) * Math.PI * 2;
    seedNode(n, Math.cos(angle) * topicRadius, Math.sin(angle) * topicRadius);
    topicPos.set(n.id, { x: n.x, y: n.y, r: n.size });
  });

  const primaryTopic = getPrimaryTopics(edges);
  const perTopicCount = new Map();
  for (const n of problemNodes) {
    const tid = primaryTopic.get(n.id);
    if (tid) perTopicCount.set(tid, (perTopicCount.get(tid) || 0) + 1);
  }
  const perTopicIdx = new Map();

  problemNodes.forEach((n) => {
    const tid = primaryTopic.get(n.id);
    const base = (tid && topicPos.get(tid)) || { x: 0, y: 0, r: 0 };
    const idx = perTopicIdx.get(tid) || 0;
    const count = perTopicCount.get(tid) || 1;
    perTopicIdx.set(tid, idx + 1);

    // Distribute the problems evenly in concentric rings if there are many.
    // Rings start at the hub's rim, and each is wide enough for the nodes on
    // it — a ring of 16 nodes 30px apart does not fit in a 30px radius.
    const ringCapacity = 16;
    const ringIndex = Math.floor(idx / ringCapacity);
    const ringBaseSpread = n.solved ? 30 : 60;
    const spread = (base.r || 0) + ringBaseSpread + ringIndex * 45 + Math.random() * 15;

    const angle = ((idx % ringCapacity) / Math.min(count, ringCapacity)) * Math.PI * 2;
    seedNode(n, base.x + Math.cos(angle) * spread, base.y + Math.sin(angle) * spread);
  });
}

export function applyGraphLayout(nodes, edges, mode) {
  if (mode === "layered") {
    applyLayeredLayout(nodes, edges);
    return;
  }
  if (mode === "force") {
    applyForceSeedLayout(nodes);
    return;
  }
  if (mode === "circular") {
    applyCircularLayout(nodes, edges);
    return;
  }
  applyClusteredLayout(nodes, edges);
}
