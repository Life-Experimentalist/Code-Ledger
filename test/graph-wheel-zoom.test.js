/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Wheel-zoom arithmetic for the knowledge graph.
 *
 * vis-network's built-in wheel handler zooms a fixed 10% per wheel *event*
 * regardless of the event's delta, and clamps at 1e-5–10. A smooth-scrolling
 * mouse or precision touchpad fires dozens of small-delta events per flick,
 * so one flick multiplied the scale several times over and parked the camera
 * where the whole graph is a sub-pixel dot. computeWheelZoom replaces it:
 * delta-proportional, clamped to the same 0.05–5 range as the zoom buttons,
 * and anchored so the point under the pointer stays put.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeWheelZoom } from "../src/library/views/GraphView.js";

const ORIGIN = { x: 0, y: 0 };

describe("computeWheelZoom", () => {
  test("scrolling up zooms in, scrolling down zooms out", () => {
    const zoomIn = computeWheelZoom(1, ORIGIN, ORIGIN, -100, 0);
    const zoomOut = computeWheelZoom(1, ORIGIN, ORIGIN, 100, 0);
    assert.ok(zoomIn.scale > 1);
    assert.ok(zoomOut.scale < 1);
  });

  test("zoom is proportional to delta — many small events equal one big one", () => {
    // Ten smooth-scroll events of 10px must land where one 100px notch does,
    // not 10× further. This is the exact failure vis-network's handler had.
    let scale = 1;
    for (let i = 0; i < 10; i++) scale = computeWheelZoom(scale, ORIGIN, ORIGIN, -10, 0).scale;
    const oneNotch = computeWheelZoom(1, ORIGIN, ORIGIN, -100, 0).scale;
    assert.ok(Math.abs(scale - oneNotch) < 1e-9);
  });

  test("scale never leaves the range the zoom buttons enforce", () => {
    let scale = 1;
    for (let i = 0; i < 200; i++) {
      scale = computeWheelZoom(scale, ORIGIN, ORIGIN, 360, 0)?.scale ?? scale;
    }
    assert.equal(scale, 0.05);
    for (let i = 0; i < 200; i++) {
      scale = computeWheelZoom(scale, ORIGIN, ORIGIN, -360, 0)?.scale ?? scale;
    }
    assert.equal(scale, 5);
  });

  test("a huge free-spin delta is capped, not a teleport", () => {
    const burst = computeWheelZoom(1, ORIGIN, ORIGIN, -5000, 0);
    const cap = computeWheelZoom(1, ORIGIN, ORIGIN, -360, 0);
    assert.equal(burst.scale, cap.scale);
  });

  test("line and page delta modes are converted, not taken as pixels", () => {
    // Firefox reports lines (mode 1): 3 lines ≈ one notch, so it must zoom
    // far more than a literal 3px would.
    const lines = computeWheelZoom(1, ORIGIN, ORIGIN, -3, 1);
    const literal = computeWheelZoom(1, ORIGIN, ORIGIN, -3, 0);
    assert.ok(lines.scale > literal.scale);
    const pages = computeWheelZoom(1, ORIGIN, ORIGIN, -1, 2);
    assert.ok(pages.scale > lines.scale);
  });

  test("the point under the pointer stays put on screen", () => {
    const scale = 1;
    const anchor = { x: 40, y: -25 };
    const center = { x: 100, y: 50 };
    const move = computeWheelZoom(scale, anchor, center, -100, 0);
    // Screen offset of the anchor from the viewport centre before and after.
    const before = { x: (center.x - anchor.x) * scale, y: (center.y - anchor.y) * scale };
    const after = {
      x: (move.position.x - anchor.x) * move.scale,
      y: (move.position.y - anchor.y) * move.scale,
    };
    assert.ok(Math.abs(before.x - after.x) < 1e-9);
    assert.ok(Math.abs(before.y - after.y) < 1e-9);
  });

  test("zooming with the pointer on the centre keeps the centre", () => {
    const move = computeWheelZoom(2, { x: 7, y: 7 }, { x: 7, y: 7 }, -100, 0);
    assert.deepEqual(move.position, { x: 7, y: 7 });
  });

  test("no-ops return null instead of a redraw", () => {
    assert.equal(computeWheelZoom(1, ORIGIN, ORIGIN, 0, 0), null);
    // Already pinned at the floor and still scrolling out — nothing to do.
    assert.equal(computeWheelZoom(0.05, ORIGIN, ORIGIN, 100, 0), null);
    assert.equal(computeWheelZoom(5, ORIGIN, ORIGIN, -100, 0), null);
  });
});
