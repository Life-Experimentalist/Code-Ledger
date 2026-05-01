/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect, useRef, useCallback } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);
import { buildKnowledgeGraph, DIFFICULTY_COLOR, PLATFORM_COLOR } from "../../core/knowledge-graph.js";
import { ProblemModal } from "../components/ProblemModal.js";

/* ── Force simulation constants ─────────────────────────────────────── */
const REPULSION = 3500;
const LINK_DIST = { "topic-problem": 100, similar: 80, canonical: 60, "topic-topic": 220 };
const LINK_STR = { "topic-problem": 0.45, similar: 0.08, canonical: 0.5, "topic-topic": 0.25 };
// Very weak gravity toward origin — NOT alpha-scaled.
// At radius 700: force = 700 × 0.0008 = 0.56 px/frame.
// Repulsion at 50px: 3500/2501 ≈ 1.4 px/frame — repulsion wins at short range.
// Without alpha-scaling, gravity is constant so it never overwhelms repulsion.
const GRAVITY = 0.0008;
const DAMPING = 0.85;
const ALPHA_DECAY = 0.013;

/* ── Simulation step ─────────────────────────────────────────────────── */
// World origin is fixed at (0,0). No canvas dimensions involved here.
function simulationStep(nodes, edges, alpha) {
  for (const n of nodes) { n.fx = 0; n.fy = 0; }

  // Repulsion — with softening radius to prevent singularities
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      // Softening radius: minimum effective distance = 12px
      const dsoft = Math.sqrt(d2 + 144); // Math.max(Math.sqrt(d2), 12) without sqrt performance cost
      const d2soft = dsoft * dsoft;
      const f = (REPULSION * alpha) / d2soft;
      a.fx -= f * dx; a.fy -= f * dy;
      b.fx += f * dx; b.fy += f * dy;
    }
  }

  // Attraction along edges
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const ld = LINK_DIST[e.type] ?? 100;
    const str = LINK_STR[e.type] ?? 0.3;
    const f = (d - ld) * str * alpha;
    a.fx += (f * dx) / d; a.fy += (f * dy) / d;
    b.fx -= (f * dx) / d; b.fy -= (f * dy) / d;
  }

  // Constant weak gravity toward origin — not alpha-scaled so it never dominates repulsion
  for (const n of nodes) {
    n.fx -= n.x * GRAVITY;
    n.fy -= n.y * GRAVITY;
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
}

/* ── Radial initial layout ───────────────────────────────────────────── */
// All world positions are centered at (0,0) — independent of canvas size.
// Topics go in a ring; each problem spawns near its primary topic.
function applyRadialLayout(nodes, edges) {
  const topicNodes = nodes.filter((n) => n.type === "topic");
  const problemNodes = nodes.filter((n) => n.type === "problem");

  // Space topics evenly around a ring large enough so clusters don't overlap
  const topicRadius = Math.max(180, topicNodes.length * 28);
  const topicPos = new Map();

  topicNodes.forEach((n, i) => {
    const angle = (i / topicNodes.length) * Math.PI * 2 - Math.PI / 2;
    n.x = Math.cos(angle) * topicRadius;
    n.y = Math.sin(angle) * topicRadius;
    n.vx = 0; n.vy = 0; n.fx = 0; n.fy = 0;
    topicPos.set(n.id, { x: n.x, y: n.y });
  });

  // First topic-problem edge per problem → primary topic for placement
  const primaryTopic = new Map();
  for (const e of edges) {
    if (e.type === "topic-problem" && !primaryTopic.has(e.target)) {
      primaryTopic.set(e.target, e.source);
    }
  }

  // Count problems per topic so we spread them evenly in a ring around the topic node
  const perTopicCount = new Map();
  for (const n of problemNodes) {
    const tid = primaryTopic.get(n.id);
    if (tid) perTopicCount.set(tid, (perTopicCount.get(tid) || 0) + 1);
  }
  const perTopicIdx = new Map();

  problemNodes.forEach((n) => {
    const tid = primaryTopic.get(n.id);
    const base = (tid && topicPos.get(tid)) || { x: 0, y: 0 };
    const idx = perTopicIdx.get(tid) || 0;
    const count = perTopicCount.get(tid) || 1;
    perTopicIdx.set(tid, idx + 1);
    const angle = (idx / count) * Math.PI * 2;
    const spread = n.solved ? 50 + Math.random() * 30 : 85 + Math.random() * 35;
    n.x = base.x + Math.cos(angle) * spread;
    n.y = base.y + Math.sin(angle) * spread;
    n.vx = 0; n.vy = 0; n.fx = 0; n.fy = 0;
  });
}

/* ── Level-of-detail thresholds ──────────────────────────────────────── */
const LOD_SIMILAR_MIN_SCALE = 0.5;
const LOD_CANONICAL_MIN_SCALE = 0.3;
const LOD_GHOST_MIN_SCALE = 0.5;
const LOD_PROBLEM_LABEL_SCALE = 1.1;

/* ── Drawing ─────────────────────────────────────────────────────────── */
const EDGE_COLOR = {
  "topic-problem": "#64748b",  // Brighter slate-500
  similar: "#3b82f6",          // Bright blue
  canonical: "#f59e0b",        // Bright amber
  "topic-topic": "#475569",    // Brighter slate-600
};

const EDGE_GLOW_COLOR = {
  "topic-problem": "#94a3b833", // Soft glow
  similar: "#3b82f633",
  canonical: "#f59e0b33",
  "topic-topic": "#47556933",
};

function drawGraph(ctx, nodes, edges, transform, hovered, selected) {
  const { tx, ty, scale } = transform;
  ctx.save();
  ctx.translate(tx, ty);
  ctx.scale(scale, scale);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const showSimilarEdges = scale > LOD_SIMILAR_MIN_SCALE;
  const showCanonicalEdges = scale > LOD_CANONICAL_MIN_SCALE;
  const showGhostNodes = scale > LOD_GHOST_MIN_SCALE;
  const edgeAlpha = Math.min(1, scale / 0.4 + 0.2);

  const drawableIds = new Set(
    showGhostNodes
      ? nodes.map((n) => n.id)
      : nodes.filter((n) => n.type === "topic" || n.solved).map((n) => n.id)
  );

  // Edges — drawn in two passes: glow first, then main edge
  // Pass 1: Glow/halo (thicker, semi-transparent)
  for (const e of edges) {
    if (!showSimilarEdges && e.type === "similar") continue;
    if (!showCanonicalEdges && e.type === "canonical") continue;
    if (!drawableIds.has(e.source) || !drawableIds.has(e.target)) continue;
    const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = EDGE_GLOW_COLOR[e.type] ?? "#94a3b833";
    ctx.lineWidth = (e.type === "canonical" ? 6 : 4);
    ctx.globalAlpha = (e.type === "topic-problem" ? 0.4 : 0.6) * edgeAlpha;
    ctx.stroke();
  }

  // Pass 2: Main edge (brighter color, thicker)
  for (const e of edges) {
    if (!showSimilarEdges && e.type === "similar") continue;
    if (!showCanonicalEdges && e.type === "canonical") continue;
    if (!drawableIds.has(e.source) || !drawableIds.has(e.target)) continue;
    const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
    if (!a || !b) continue;

    const isHovered = hovered && (
      (hovered.id === e.source || hovered.id === e.target) ||
      (selected && (selected.id === e.source || selected.id === e.target))
    );

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = EDGE_COLOR[e.type] ?? "#64748b";
    ctx.lineWidth = isHovered ? (e.type === "canonical" ? 3.5 : 2.5) : (e.type === "canonical" ? 2.5 : 1.8);
    ctx.globalAlpha = isHovered ? 1 : ((e.type === "topic-problem" ? 0.55 : 0.7) * edgeAlpha);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Nodes
  for (const n of nodes) {
    if (!drawableIds.has(n.id)) continue;
    const r = n.size;
    const isH = hovered?.id === n.id;
    const isSel = selected?.id === n.id;

    ctx.beginPath();
    ctx.arc(n.x, n.y, r + (isH ? 3 : 0), 0, Math.PI * 2);

    if (n.type === "topic") {
      ctx.fillStyle = n.color + "33";
      ctx.fill();
      ctx.strokeStyle = n.color;
      ctx.lineWidth = isH || isSel ? 3 : 2;
      ctx.stroke();
    } else if (n.solved) {
      ctx.fillStyle = n.color;
      ctx.fill();
      ctx.strokeStyle = isSel ? "#fff" : (n.platformColor || PLATFORM_COLOR[n.platform] || "#64748b");
      ctx.lineWidth = isSel ? 2.5 : n.isMultiPlatform ? 2.5 : 1.5;
      ctx.globalAlpha = isSel ? 1 : 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = n.color + "22";
      ctx.fill();
      ctx.strokeStyle = n.color + "88";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Labels: always for topics, only when hovered/selected/deeply-zoomed for problems
    if (n.type === "topic" || isH || isSel || scale > LOD_PROBLEM_LABEL_SCALE) {
      ctx.fillStyle = "#e2e8f0";
      ctx.font = n.type === "topic" ? `bold ${Math.max(11, r * 0.7)}px sans-serif` : "11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = n.label.length > 22 ? n.label.slice(0, 20) + "…" : n.label;
      if (n.type === "topic") {
        ctx.fillText(label, n.x, n.y);
      } else {
        ctx.fillText(label, n.x, n.y - r - 6);
      }
    }
  }

  ctx.restore();
}

/* ── Hit-test ─────────────────────────────────────────────────────────── */
function hitTest(nodes, mx, my, transform) {
  const { tx, ty, scale } = transform;
  const wx = (mx - tx) / scale;
  const wy = (my - ty) / scale;
  for (const n of [...nodes].reverse()) {
    const dx = wx - n.x, dy = wy - n.y;
    if (dx * dx + dy * dy <= (n.size + 4) ** 2) return n;
  }
  return null;
}

/* ── Canvas logical dimensions ──────────────────────────────────────── */
function getLogicalSize(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas._logicalWidth || canvas.width / dpr;
  const h = canvas._logicalHeight || canvas.height / dpr;
  return { w, h };
}

const PLATFORM_FAVICON = {
  leetcode: "https://assets.leetcode.com/static_assets/public/icons/favicon.ico",
  geeksforgeeks: "https://www.geeksforgeeks.org/favicon.ico",
  codeforces: "https://codeforces.com/favicon.ico",
};

/* ── Component ───────────────────────────────────────────────────────── */
export function GraphView({ problems }) {
  const canvasRef = useRef(null);
  const simRef = useRef({ nodes: [], edges: [], alpha: 0, raf: null });
  const transformRef = useRef({ tx: 0, ty: 0, scale: 1 });
  const dragRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState(null);
  const [modalProblem, setModalProblem] = useState(null);
  const [filterSolved, setFilterSolved] = useState(false);
  const filterSolvedRef = useRef(false);
  const hoveredRef = useRef(null);
  const selectedRef = useRef(null);
  const fitViewRef = useRef(null);
  // Counts for toolbar (read-only, derived from simRef)
  const [stats, setStats] = useState({ topics: 0, solved: 0, suggested: 0 });

  /* ── fitView ─────────────────────────────────────────────────────── */
  const fitView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nodes = simRef.current.nodes.filter((n) => !isNaN(n.x) && !isNaN(n.y));
    if (!nodes.length) return;
    const { w, h } = getLogicalSize(canvas);
    if (!w || !h) {
      // Canvas not sized yet — retry once ResizeObserver has fired
      setTimeout(() => fitViewRef.current?.(), 60);
      return;
    }
    const pad = 60;
    const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
    const gW = maxX - minX || 1, gH = maxY - minY || 1;
    const scale = Math.min(Math.max(Math.min(w / gW, h / gH), 0.05), 2);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    transformRef.current = {
      scale,
      tx: w / 2 - cx * scale,
      ty: h / 2 - cy * scale,
    };
  }, []);
  fitViewRef.current = fitView;

  /* ── Build graph when problems change ───────────────────────────── */
  useEffect(() => {
    if (!problems?.length) return;
    const { nodes: newNodes, edges: newEdges } = buildKnowledgeGraph(problems);

    const existingMap = new Map(simRef.current.nodes.map((n) => [n.id, n]));
    const isFirstLoad = existingMap.size === 0;
    let hasNew = false;

    for (const n of newNodes) {
      const prev = existingMap.get(n.id);
      if (prev) {
        n.x = prev.x; n.y = prev.y;
        n.vx = prev.vx; n.vy = prev.vy;
        n.fx = 0; n.fy = 0;
      }
    }

    if (isFirstLoad) {
      // First load: apply radial layout in world space (centered at 0,0)
      applyRadialLayout(newNodes, newEdges);
      hasNew = true;
    } else {
      const brandNew = newNodes.filter((n) => !existingMap.has(n.id));
      if (brandNew.length > 0) {
        // Only re-layout the new nodes around their topic positions
        applyRadialLayout(brandNew, newEdges);
        hasNew = true;
      }
    }

    simRef.current.nodes = newNodes;
    simRef.current.edges = newEdges;

    if (isFirstLoad) {
      simRef.current.alpha = 1;
      // Fit view once canvas is sized (ResizeObserver fires first, then our timeout fires)
      setTimeout(() => fitViewRef.current?.(), 80);
    } else if (hasNew) {
      simRef.current.alpha = Math.max(simRef.current.alpha, 0.4);
    }

    setStats({
      topics: newNodes.filter((n) => n.type === "topic").length,
      solved: newNodes.filter((n) => n.type === "problem" && n.solved).length,
      suggested: newNodes.filter((n) => n.type === "problem" && !n.solved).length,
    });
  }, [problems]);

  useEffect(() => { filterSolvedRef.current = filterSolved; }, [filterSolved]);
  useEffect(() => { hoveredRef.current = hovered; }, [hovered]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  /* ── Animation loop ─────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let running = true;

    function loop() {
      if (!running) return;
      const { nodes, edges, alpha } = simRef.current;

      // Run simulation step — purely in world space, no canvas dimensions needed
      if (alpha > 0.001 && nodes.length) {
        simulationStep(nodes, edges, alpha);
        simRef.current.alpha = Math.max(0, alpha - ALPHA_DECAY);
      }

      // Filter for solved-only mode using a Set for O(1) lookup
      const filterActive = filterSolvedRef.current;
      let drawNodes, drawEdges;
      if (filterActive) {
        drawNodes = nodes.filter((n) => n.type === "topic" || n.solved);
        const ids = new Set(drawNodes.map((n) => n.id));
        drawEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
      } else {
        drawNodes = nodes;
        drawEdges = edges;
      }

      // Clear and fill background in physical pixels
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Scale once for DPR so all drawing uses logical CSS pixels
      ctx.save();
      ctx.scale(dpr, dpr);
      drawGraph(ctx, drawNodes, drawEdges, transformRef.current, hoveredRef.current, selectedRef.current);
      ctx.restore();

      simRef.current.raf = requestAnimationFrame(loop);
    }

    simRef.current.raf = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(simRef.current.raf);
    };
  }, []);

  /* ── Resize observer ────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      const dpr = window.devicePixelRatio || 1;
      const prevW = canvas._logicalWidth || 0;
      const prevH = canvas._logicalHeight || 0;

      canvas._logicalWidth = width;
      canvas._logicalHeight = height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      if (prevW > 0 && prevH > 0) {
        // Keep same world point at screen centre when container resizes
        transformRef.current.tx += (width - prevW) / 2;
        transformRef.current.ty += (height - prevH) / 2;
      } else if (simRef.current.nodes.length > 0) {
        // First paint after canvas is sized: fit the graph
        fitViewRef.current?.();
      }
      simRef.current.alpha = Math.max(simRef.current.alpha, 0.1);
    });

    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, []);

  /* ── Pointer events ─────────────────────────────────────────────── */
  const onMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (dragRef.current?.type === "pan") {
      transformRef.current.tx += e.movementX;
      transformRef.current.ty += e.movementY;
      return;
    }
    if (dragRef.current?.type === "node") {
      const { node } = dragRef.current;
      const { tx, ty, scale } = transformRef.current;
      node.x = (mx - tx) / scale;
      node.y = (my - ty) / scale;
      node.vx = 0; node.vy = 0;
      simRef.current.alpha = Math.max(simRef.current.alpha, 0.3);
      return;
    }

    const testNodes = filterSolvedRef.current
      ? simRef.current.nodes.filter((n) => n.type === "topic" || n.solved)
      : simRef.current.nodes;
    const hit = hitTest(testNodes, mx, my, transformRef.current);
    setHovered(hit);
    setMousePos({ x: e.clientX, y: e.clientY });
    canvas.style.cursor = hit ? "pointer" : "grab";
  }, []);

  const onMouseDown = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const testNodes = filterSolvedRef.current
      ? simRef.current.nodes.filter((n) => n.type === "topic" || n.solved)
      : simRef.current.nodes;
    const hit = hitTest(testNodes, e.clientX - rect.left, e.clientY - rect.top, transformRef.current);
    dragRef.current = hit ? { type: "node", node: hit } : { type: "pan" };
  }, []);

  const onMouseUp = useCallback((e) => {
    if (dragRef.current?.type === "node") {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const testNodes = filterSolvedRef.current
        ? simRef.current.nodes.filter((n) => n.type === "topic" || n.solved)
        : simRef.current.nodes;
      const hit = hitTest(testNodes, e.clientX - rect.left, e.clientY - rect.top, transformRef.current);
      if (hit) setSelected((prev) => (prev?.id === hit.id ? null : hit));
    }
    dragRef.current = null;
  }, []);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const t = transformRef.current;
    t.tx = mx + (t.tx - mx) * delta;
    t.ty = my + (t.ty - my) * delta;
    t.scale = Math.min(Math.max(t.scale * delta, 0.05), 5);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  /* ── Re-layout: scatter nodes again + reheat ─────────────────────── */
  const reLayout = useCallback(() => {
    const { nodes, edges } = simRef.current;
    if (!nodes.length) return;
    applyRadialLayout(nodes, edges);
    simRef.current.alpha = 1;
    setTimeout(() => fitViewRef.current?.(), 30);
  }, []);

  /* ── Problem URL ─────────────────────────────────────────────────── */
  function problemUrl(node) {
    if (!node?.titleSlug) return null;
    if (node.platform === "geeksforgeeks") return `https://practice.geeksforgeeks.org/problems/${node.titleSlug}`;
    if (node.platform === "codeforces") return `https://codeforces.com/problemset/problem/${node.titleSlug}`;
    return `https://leetcode.com/problems/${node.titleSlug}/`;
  }

  /* ── Node detail (tooltip + selected panel) ─────────────────────── */
  function NodeDetail({ node, compact = false }) {
    if (!node) return null;
    if (node.type === "topic") return html`
      <div class="flex flex-col gap-1.5">
        <div class="text-xs font-bold text-white">${node.label}</div>
        <div class="text-[11px] text-slate-400">${node.count} problem${node.count !== 1 ? "s" : ""} solved</div>
      </div>
    `;
    const url = problemUrl(node);
    const favicon = PLATFORM_FAVICON[node.platform];
    const diffClass = node.difficulty === "Easy" ? "bg-emerald-500/20 text-emerald-400"
      : node.difficulty === "Medium" ? "bg-amber-500/20 text-amber-400"
        : node.difficulty === "Hard" ? "bg-rose-500/20 text-rose-400"
          : "bg-slate-500/20 text-slate-400";
    return html`
      <div class="flex flex-col gap-2">
        <div class="flex items-start gap-2">
          ${favicon ? html`<img src=${favicon} class="w-3.5 h-3.5 mt-0.5 shrink-0 object-contain" alt=""
            onError=${(e) => { e.target.style.display = "none"; }} />` : ""}
          <span class="text-xs font-semibold text-white leading-snug">${node.label}</span>
        </div>
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="px-1.5 py-0.5 rounded text-[10px] font-medium ${diffClass}">${node.difficulty || "?"}</span>
          <span class="text-[10px] ${node.solved ? "text-emerald-400" : "text-slate-600"}">${node.solved ? "✓ Solved" : "○ Suggested"}</span>
          ${node.lang ? html`<span class="text-[10px] font-mono text-cyan-500/70">${node.lang}</span>` : ""}
        </div>
        ${!compact ? html`
          ${(node.runtime || node.memory || node.acRate) ? html`
            <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
              ${node.runtime ? html`<span class="text-slate-500">Runtime</span><span class="text-slate-200 text-right">${node.runtime}${node.runtimePct ? html` <span class="text-cyan-500/60">· ${node.runtimePct.toFixed(0)}%</span>` : ""}</span>` : ""}
              ${node.memory ? html`<span class="text-slate-500">Memory</span><span class="text-slate-200 text-right">${node.memory}${node.memoryPct ? html` <span class="text-cyan-500/60">· ${node.memoryPct.toFixed(0)}%</span>` : ""}</span>` : ""}
              ${node.acRate ? html`<span class="text-slate-500">Accept rate</span><span class="text-slate-200 text-right">${node.acRate.toFixed(1)}%</span>` : ""}
              ${node.timestamp ? html`<span class="text-slate-500">Solved</span><span class="text-slate-200 text-right">${new Date(node.timestamp < 1e10 ? node.timestamp * 1000 : node.timestamp).toLocaleDateString()}</span>` : ""}
            </div>
          ` : ""}
          ${node.tags?.length ? html`
            <div class="flex flex-wrap gap-1 mt-0.5">
              ${node.tags.map((t) => html`<span class="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] text-slate-400">${t}</span>`)}
            </div>
          ` : ""}
          ${url ? html`
            <a href=${url} target="_blank" rel="noopener"
               class="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 border-t border-white/5 pt-1.5 mt-0.5"
               onClick=${(e) => e.stopPropagation()}>
              ${favicon ? html`<img src=${favicon} class="w-3 h-3 object-contain" alt=""
                onError=${(e) => { e.target.style.display = "none"; }} />` : ""}
              Open problem ↗
            </a>
          ` : ""}
        ` : ""}
      </div>
    `;
  }

  return html`
    <div class="flex flex-col gap-4 w-full h-full min-h-[600px]">

      <!-- Toolbar -->
      <div class="flex items-center gap-3 flex-wrap">
        <div class="flex gap-2 text-xs text-slate-400">
          <span class="px-2 py-1 rounded bg-white/5 border border-white/10">${stats.topics} topics</span>
          <span class="px-2 py-1 rounded bg-white/5 border border-white/10">${stats.solved} solved</span>
          <span class="px-2 py-1 rounded bg-white/5 border border-white/10">${stats.suggested} suggested</span>
        </div>
        <label class="flex items-center gap-2 text-xs text-slate-400 cursor-pointer ml-auto">
          <input type="checkbox" checked=${filterSolved} onChange=${(e) => setFilterSolved(e.target.checked)} />
          Solved only
        </label>
        <button
          onClick=${fitView}
          class="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors"
        >▣ Fit view</button>
        <button
          onClick=${reLayout}
          class="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors"
        >↺ Re-layout</button>
      </div>

      <!-- Canvas area -->
      <div class="relative flex-1 rounded-2xl overflow-hidden border border-white/5 bg-[#0a0a0f]" style="min-height:500px">
        <canvas
          ref=${canvasRef}
          style="display:block;width:100%;height:100%"
          onMouseMove=${onMouseMove}
          onMouseDown=${onMouseDown}
          onMouseUp=${onMouseUp}
        ></canvas>

        <!-- Legend -->
        <div class="absolute bottom-3 left-3 flex flex-col gap-1 text-[10px] text-slate-400 bg-black/60 backdrop-blur px-3 py-2 rounded-lg border border-white/5">
          <div class="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">Difficulty</div>
          <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-[#22c55e] inline-block"></span>Easy</div>
          <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-[#f59e0b] inline-block"></span>Medium</div>
          <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-[#ef4444] inline-block"></span>Hard</div>
          <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-[#64748b] inline-block"></span>Unknown</div>
          <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full border border-dashed border-slate-400 inline-block"></span>Suggested</div>
          <div class="text-[9px] text-slate-600 uppercase tracking-wider mt-1 mb-0.5">Platform (ring)</div>
          <div class="flex items-center gap-2">
            <img src="https://assets.leetcode.com/static_assets/public/icons/favicon.ico" class="w-3 h-3 object-contain" alt="" />
            LeetCode
          </div>
          <div class="flex items-center gap-2">
            <img src="https://www.geeksforgeeks.org/favicon.ico" class="w-3 h-3 object-contain" alt="" />
            GFG
          </div>
          <div class="flex items-center gap-2">
            <img src="https://codeforces.com/favicon.ico" class="w-3 h-3 object-contain" alt="" />
            Codeforces
          </div>
        </div>

        <!-- Empty state -->
        ${!problems?.length && html`
          <div class="absolute inset-0 flex items-center justify-center">
            <p class="text-slate-500 text-sm">Solve some problems to build the graph.</p>
          </div>
        `}

        <!-- Hover tooltip -->
        ${hovered && !selected && html`
          <div
            class="pointer-events-none fixed z-50 bg-[#071018]/95 backdrop-blur border border-white/15 rounded-xl p-3 shadow-2xl w-52"
            style=${{
        left: `${mousePos.x + 14}px`,
        top: `${mousePos.y - 10}px`,
        transform: mousePos.x > window.innerWidth - 230 ? "translateX(-110%)" : "none",
      }}
          >
            <${NodeDetail} node=${hovered} compact=${true} />
            <p class="text-[9px] text-slate-600 mt-2">Click to pin details</p>
          </div>
        `}

        <!-- Selected node panel -->
        ${selected && html`
          <div class="absolute top-3 right-3 bg-[#071018]/97 backdrop-blur border border-cyan-500/20 rounded-xl p-4 w-64 shadow-2xl max-h-[80%] overflow-y-auto">
            <div class="flex items-center justify-between mb-3">
              ${selected.type === "problem" && selected.solved ? html`
                <button
                  onClick=${() => setModalProblem(selected)}
                  class="text-[10px] px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                >Expand ↗</button>
              ` : html`<span></span>`}
              <button
                onClick=${() => setSelected(null)}
                class="text-slate-500 hover:text-slate-300 text-xs leading-none px-1"
              >✕</button>
            </div>
            <${NodeDetail} node=${selected} compact=${false} />
          </div>
        `}
      </div>

      <p class="text-[10px] text-slate-600 text-center">
        Drag nodes · scroll to zoom · hover to preview · click to pin · ▣ Fit view · ↺ Re-layout
      </p>

      <${ProblemModal}
        problem=${modalProblem}
        onClose=${() => setModalProblem(null)}
      />
    </div>
  `;
}
