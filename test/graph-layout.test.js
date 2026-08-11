/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The graph reads as clutter when nodes sit on top of each other, and the two
 * ways that happened were both geometric: link lengths measured centre to
 * centre, so a problem's resting place was inside its own topic hub, and
 * nothing ever guaranteed separation — repulsion only makes overlap less
 * likely. Both are invariants, so both are testable without a canvas.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  ALPHA_DECAY,
  applyGraphLayout,
  COLLIDE_PAD,
  seedNode,
  simulationStep,
} from "../src/library/views/graph-layout.js";

const LAYOUTS = ["clustered", "layered", "circular", "force"];

/** A topic hub with `count` problems hanging off it. */
function cluster(topicId, count, { topicSize = 24, solved = true } = {}) {
  const nodes = [{ id: topicId, type: "topic", size: topicSize, label: topicId }];
  const edges = [];
  for (let i = 0; i < count; i++) {
    const id = `${topicId}-p${i}`;
    nodes.push({ id, type: "problem", size: solved ? 10 : 8, solved, label: id });
    edges.push({ source: topicId, target: id, type: "topic-problem" });
  }
  return { nodes, edges };
}

/** Run the simulation the way the render loop does, until alpha runs out. */
function settle(nodes, edges) {
  let alpha = 1;
  let steps = 0;
  while (alpha > 0.001 && steps < 500) {
    simulationStep(nodes, edges, alpha);
    alpha = Math.max(0, alpha - ALPHA_DECAY);
    steps++;
  }
  return steps;
}

/** The closest pair, as a fraction of the distance they should be keeping. */
function worstOverlap(nodes) {
  let worst = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i],
        b = nodes[j];
      const min = a.size + b.size + COLLIDE_PAD;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      worst = Math.max(worst, min - d);
    }
  }
  return worst;
}

describe("separation", () => {
  test("no two nodes end up overlapping", () => {
    const { nodes, edges } = cluster("arrays", 40);
    applyGraphLayout(nodes, edges, "clustered");
    settle(nodes, edges);
    assert.equal(
      worstOverlap(nodes) <= 0.01,
      true,
      `closest pair overlaps by ${worstOverlap(nodes)}`,
    );
  });

  test("nor across several hubs pulled together", () => {
    const a = cluster("arrays", 25);
    const b = cluster("graphs", 25);
    const nodes = [...a.nodes, ...b.nodes];
    const edges = [...a.edges, ...b.edges];
    // A problem shared between both topics drags the two clusters into each
    // other — the case where overlap used to be worst.
    edges.push({ source: "graphs", target: "arrays-p0", type: "topic-problem" });
    applyGraphLayout(nodes, edges, "clustered");
    settle(nodes, edges);
    assert.equal(
      worstOverlap(nodes) <= 0.01,
      true,
      `closest pair overlaps by ${worstOverlap(nodes)}`,
    );
  });

  test("exactly coincident nodes are pushed apart rather than dividing by zero", () => {
    const nodes = [
      { id: "a", type: "problem", size: 10, solved: true },
      { id: "b", type: "problem", size: 10, solved: true },
    ];
    seedNode(nodes[0], 0, 0);
    seedNode(nodes[1], 0, 0);
    simulationStep(nodes, [], 1);
    for (const n of nodes) {
      assert.equal(Number.isFinite(n.x) && Number.isFinite(n.y), true, `${n.id} went non-finite`);
    }
    assert.equal(Math.hypot(nodes[1].x - nodes[0].x, nodes[1].y - nodes[0].y) > 0, true);
  });

  test("a big hub does not swallow the problems attached to it", () => {
    // The old rest length was 60 between centres, and a hub is up to 48 across.
    const { nodes, edges } = cluster("arrays", 8, { topicSize: 48 });
    applyGraphLayout(nodes, edges, "clustered");
    settle(nodes, edges);
    const hub = nodes[0];
    for (const p of nodes.slice(1)) {
      const gap = Math.hypot(p.x - hub.x, p.y - hub.y) - hub.size - p.size;
      assert.equal(gap > 0, true, `${p.id} sits ${gap.toFixed(1)}px inside the hub`);
    }
  });
});

describe("stability", () => {
  test("nothing goes NaN or infinite, on any layout", () => {
    for (const mode of LAYOUTS) {
      const { nodes, edges } = cluster("arrays", 30);
      applyGraphLayout(nodes, edges, mode);
      settle(nodes, edges);
      for (const n of nodes) {
        assert.equal(Number.isFinite(n.x), true, `${mode}: ${n.id}.x is ${n.x}`);
        assert.equal(Number.isFinite(n.y), true, `${mode}: ${n.id}.y is ${n.y}`);
      }
    }
  });

  test("an isolated node is still pulled back rather than drifting forever", () => {
    const nodes = [{ id: "lonely", type: "problem", size: 10, solved: true }];
    seedNode(nodes[0], 5000, 5000);
    const before = Math.hypot(nodes[0].x, nodes[0].y);
    settle(nodes, []);
    assert.equal(Math.hypot(nodes[0].x, nodes[0].y) < before, true);
  });

  test("an empty graph is not an error", () => {
    assert.doesNotThrow(() => {
      applyGraphLayout([], [], "clustered");
      simulationStep([], [], 1);
    });
  });

  test("an edge naming a node that is not there is skipped", () => {
    const nodes = [{ id: "a", type: "problem", size: 10, solved: true }];
    seedNode(nodes[0], 0, 0);
    assert.doesNotThrow(() => simulationStep(nodes, [{ source: "a", target: "ghost" }], 1));
    assert.equal(Number.isFinite(nodes[0].x), true);
  });
});

describe("seeding", () => {
  test("every layout gives every node a position and no velocity", () => {
    for (const mode of LAYOUTS) {
      const { nodes, edges } = cluster("arrays", 12);
      applyGraphLayout(nodes, edges, mode);
      for (const n of nodes) {
        assert.equal(typeof n.x, "number", `${mode}: ${n.id} has no x`);
        assert.equal(n.vx, 0, `${mode}: ${n.id} starts moving`);
        assert.equal(n.vy, 0);
      }
    }
  });

  test("problems are seeded outside their hub, not inside it", () => {
    // Seeding inside means the first second on screen is an explosion, even
    // though separation would eventually sort it out.
    for (const mode of ["clustered", "circular"]) {
      const { nodes, edges } = cluster("arrays", 20, { topicSize: 48 });
      applyGraphLayout(nodes, edges, mode);
      const hub = nodes[0];
      for (const p of nodes.slice(1)) {
        const d = Math.hypot(p.x - hub.x, p.y - hub.y);
        assert.equal(d >= hub.size, true, `${mode}: ${p.id} seeded ${d.toFixed(1)}px from centre`);
      }
    }
  });

  test("an unrecognised mode falls back to the default rather than leaving nodes unplaced", () => {
    const { nodes, edges } = cluster("arrays", 5);
    applyGraphLayout(nodes, edges, "no-such-layout");
    for (const n of nodes) assert.equal(Number.isFinite(n.x), true);
  });
});
