/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect, useRef, useCallback } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);
import { buildKnowledgeGraph, DIFFICULTY_COLOR } from "../../core/knowledge-graph.js";

/* ── Force simulation constants ─────────────────────────────────────── */
const REPULSION   = 3000;
const LINK_DIST   = { "topic-problem": 120, similar: 90, canonical: 60 };
const LINK_STR    = { "topic-problem": 0.4,  similar: 0.1, canonical: 0.6 };
const CENTER_PULL = 0.015;
const DAMPING     = 0.85;
const ALPHA_DECAY = 0.015;

/* ── Simulation step (one tick of Verlet / force-directed) ──────────── */
function simulationStep(nodes, edges, alpha, cx, cy) {
  // Reset forces
  for (const n of nodes) { n.fx = 0; n.fy = 0; }

  // Repulsion (O(n²) — fine for hundreds of nodes)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x || 0.01;
      const dy = b.y - a.y || 0.01;
      const d2 = dx * dx + dy * dy + 1;
      const f  = (REPULSION * alpha) / d2;
      a.fx -= f * dx; a.fy -= f * dy;
      b.fx += f * dx; b.fy += f * dy;
    }
  }

  // Attraction along edges
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
    if (!a || !b) continue;
    const dx  = b.x - a.x;
    const dy  = b.y - a.y;
    const d   = Math.sqrt(dx * dx + dy * dy) || 1;
    const ld  = LINK_DIST[e.type] ?? 100;
    const str = LINK_STR[e.type]  ?? 0.3;
    const f   = (d - ld) * str * alpha;
    a.fx += (f * dx) / d; a.fy += (f * dy) / d;
    b.fx -= (f * dx) / d; b.fy -= (f * dy) / d;
  }

  // Center pull
  for (const n of nodes) {
    n.fx += (cx - n.x) * CENTER_PULL * alpha;
    n.fy += (cy - n.y) * CENTER_PULL * alpha;
  }

  // Integrate
  for (const n of nodes) {
    n.vx = (n.vx + n.fx) * DAMPING;
    n.vy = (n.vy + n.fy) * DAMPING;
    n.x += n.vx;
    n.y += n.vy;
  }
}

/* ── Drawing ─────────────────────────────────────────────────────────── */
const EDGE_COLOR = { "topic-problem": "#334155", similar: "#1e3a5f", canonical: "#713f12" };

function drawGraph(ctx, nodes, edges, transform, hovered, selected) {
  const { tx, ty, scale } = transform;
  ctx.save();
  ctx.translate(tx, ty);
  ctx.scale(scale, scale);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Edges first
  for (const e of edges) {
    const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = EDGE_COLOR[e.type] ?? "#334155";
    ctx.lineWidth = e.type === "canonical" ? 2 : 1;
    ctx.globalAlpha = e.type === "topic-problem" ? 0.4 : 0.6;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Nodes
  for (const n of nodes) {
    const r     = n.size;
    const isH   = hovered?.id === n.id;
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
      if (isSel) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); }
    } else {
      // Unsolved ghost node
      ctx.fillStyle = n.color + "22";
      ctx.fill();
      ctx.strokeStyle = n.color + "88";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Labels for topics or hovered/selected problems
    if (n.type === "topic" || isH || isSel) {
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

/* ── Component ───────────────────────────────────────────────────────── */
export function GraphView({ problems }) {
  const canvasRef   = useRef(null);
  const simRef      = useRef({ nodes: [], edges: [], alpha: 1, raf: null });
  const transformRef = useRef({ tx: 0, ty: 0, scale: 1 });
  const dragRef     = useRef(null);
  const [hovered,  setHovered]  = useState(null);
  const [selected, setSelected] = useState(null);
  const [filterSolved, setFilterSolved] = useState(false);

  // Build graph whenever problems change
  useEffect(() => {
    if (!problems?.length) return;
    const { nodes, edges } = buildKnowledgeGraph(problems);
    const canvas = canvasRef.current;
    const w = canvas?.width ?? 800, h = canvas?.height ?? 600;

    // Random initial positions
    for (const n of nodes) {
      n.x  = w / 2 + (Math.random() - 0.5) * 400;
      n.y  = h / 2 + (Math.random() - 0.5) * 400;
      n.vx = 0; n.vy = 0; n.fx = 0; n.fy = 0;
    }
    simRef.current.nodes = nodes;
    simRef.current.edges = edges;
    simRef.current.alpha = 1;
  }, [problems]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let running = true;

    function loop() {
      if (!running) return;
      const { nodes, edges, alpha } = simRef.current;
      const w = canvas.width, h = canvas.height;

      if (alpha > 0.001) {
        simulationStep(nodes, edges, alpha, w / 2, h / 2);
        simRef.current.alpha = Math.max(0, alpha - ALPHA_DECAY);
      }

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, w, h);
      drawGraph(ctx, nodes, edges, transformRef.current, hovered, selected);
      simRef.current.raf = requestAnimationFrame(loop);
    }

    simRef.current.raf = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(simRef.current.raf); };
  }, [hovered, selected]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      canvas.width  = width;
      canvas.height = height;
      transformRef.current.tx = 0;
      transformRef.current.ty = 0;
    });
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, []);

  // Pointer events
  const onMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
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

    const hit = hitTest(simRef.current.nodes, mx, my, transformRef.current);
    setHovered(hit);
    canvas.style.cursor = hit ? "pointer" : "grab";
  }, []);

  const onMouseDown = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const hit = hitTest(simRef.current.nodes, e.clientX - rect.left, e.clientY - rect.top, transformRef.current);
    if (hit) {
      dragRef.current = { type: "node", node: hit };
    } else {
      dragRef.current = { type: "pan" };
    }
  }, []);

  const onMouseUp = useCallback((e) => {
    if (dragRef.current?.type === "node") {
      const canvas = canvasRef.current;
      const rect   = canvas.getBoundingClientRect();
      const hit = hitTest(simRef.current.nodes, e.clientX - rect.left, e.clientY - rect.top, transformRef.current);
      if (hit) setSelected((prev) => (prev?.id === hit.id ? null : hit));
    }
    dragRef.current = null;
  }, []);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const t = transformRef.current;
    t.tx = mx + (t.tx - mx) * delta;
    t.ty = my + (t.ty - my) * delta;
    t.scale = Math.min(Math.max(t.scale * delta, 0.2), 5);
  }, []);

  const reheat = useCallback(() => { simRef.current.alpha = 1; }, []);

  const visibleNodes = filterSolved
    ? simRef.current.nodes.filter((n) => n.type === "topic" || n.solved)
    : simRef.current.nodes;

  const topicCount   = simRef.current.nodes.filter((n) => n.type === "topic").length;
  const solvedCount  = simRef.current.nodes.filter((n) => n.type === "problem" && n.solved).length;
  const similarCount = simRef.current.nodes.filter((n) => n.type === "problem" && !n.solved).length;

  return html`
    <div class="flex flex-col gap-4 w-full h-full min-h-[600px]">
      <!-- Toolbar -->
      <div class="flex items-center gap-3 flex-wrap">
        <div class="flex gap-2 text-xs text-slate-400">
          <span class="px-2 py-1 rounded bg-white/5 border border-white/10">${topicCount} topics</span>
          <span class="px-2 py-1 rounded bg-white/5 border border-white/10">${solvedCount} solved</span>
          <span class="px-2 py-1 rounded bg-white/5 border border-white/10">${similarCount} suggested</span>
        </div>
        <label class="flex items-center gap-2 text-xs text-slate-400 cursor-pointer ml-auto">
          <input type="checkbox" checked=${filterSolved} onChange=${(e) => setFilterSolved(e.target.checked)} />
          Solved only
        </label>
        <button
          onClick=${reheat}
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
          onWheel=${onWheel}
        ></canvas>

        <!-- Legend -->
        <div class="absolute bottom-3 left-3 flex flex-col gap-1 text-[10px] text-slate-400 bg-black/60 backdrop-blur px-3 py-2 rounded-lg border border-white/5">
          <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-[#22c55e] inline-block"></span>Easy</div>
          <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-[#f59e0b] inline-block"></span>Medium</div>
          <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-[#ef4444] inline-block"></span>Hard</div>
          <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full border border-dashed border-slate-400 inline-block"></span>Suggested</div>
        </div>

        <!-- Empty state -->
        ${!problems?.length && html`
          <div class="absolute inset-0 flex items-center justify-center">
            <p class="text-slate-500 text-sm">Solve some problems to build the graph.</p>
          </div>
        `}

        <!-- Selected node panel -->
        ${selected && html`
          <div class="absolute top-3 right-3 bg-[#071018]/95 backdrop-blur border border-white/10 rounded-xl p-4 text-sm w-56 shadow-2xl">
            <button
              onClick=${() => setSelected(null)}
              class="absolute top-2 right-2 text-slate-500 hover:text-slate-300 text-xs leading-none"
            >✕</button>
            <div class="font-semibold text-white mb-2 pr-4 leading-snug">${selected.label}</div>
            ${selected.type === "topic" ? html`
              <div class="flex flex-col gap-1 text-xs text-slate-400">
                <div class="flex items-center justify-between">
                  <span>Problems solved</span>
                  <span class="text-white font-mono">${selected.count}</span>
                </div>
              </div>
            ` : html`
              <div class="flex flex-col gap-1.5 text-[11px]">
                <div class="flex items-center gap-2">
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    selected.difficulty === "Easy" ? "bg-emerald-500/20 text-emerald-400"
                    : selected.difficulty === "Medium" ? "bg-amber-500/20 text-amber-400"
                    : selected.difficulty === "Hard" ? "bg-rose-500/20 text-rose-400"
                    : "bg-white/10 text-slate-400"
                  }">${selected.difficulty || "?"}</span>
                  <span class="text-slate-500 capitalize">${selected.platform || "?"}</span>
                  <span class="${selected.solved ? "text-emerald-400" : "text-slate-600"}">${selected.solved ? "✓ Solved" : "○ Unsolved"}</span>
                </div>
                ${selected.lang ? html`
                  <div class="flex justify-between text-slate-400">
                    <span>Language</span><span class="text-slate-200">${selected.lang}</span>
                  </div>` : ""}
                ${selected.runtime ? html`
                  <div class="flex justify-between text-slate-400">
                    <span>Runtime</span>
                    <span class="text-slate-200">${selected.runtime}${selected.runtimePct ? html` <span class="text-cyan-500/70 text-[10px]">beats ${selected.runtimePct.toFixed(0)}%</span>` : ""}</span>
                  </div>` : ""}
                ${selected.memory ? html`
                  <div class="flex justify-between text-slate-400">
                    <span>Memory</span>
                    <span class="text-slate-200">${selected.memory}${selected.memoryPct ? html` <span class="text-cyan-500/70 text-[10px]">beats ${selected.memoryPct.toFixed(0)}%</span>` : ""}</span>
                  </div>` : ""}
                ${selected.acRate ? html`
                  <div class="flex justify-between text-slate-400">
                    <span>Acceptance</span><span class="text-slate-200">${selected.acRate.toFixed(1)}%</span>
                  </div>` : ""}
                ${selected.timestamp ? html`
                  <div class="flex justify-between text-slate-400">
                    <span>Solved</span>
                    <span class="text-slate-200">${new Date(selected.timestamp * 1000).toLocaleDateString()}</span>
                  </div>` : ""}
                ${selected.tags?.length ? html`
                  <div class="flex flex-wrap gap-1 mt-1">
                    ${selected.tags.slice(0, 4).map(t => html`
                      <span class="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] text-slate-400">${t}</span>
                    `)}
                    ${selected.tags.length > 4 ? html`<span class="text-[9px] text-slate-600">+${selected.tags.length - 4}</span>` : ""}
                  </div>` : ""}
                ${selected.titleSlug ? html`
                  <a
                    href=${
                      selected.platform === "geeksforgeeks"
                        ? "https://practice.geeksforgeeks.org/problems/" + selected.titleSlug
                        : selected.platform === "codeforces"
                          ? "https://codeforces.com/problemset/problem/" + selected.titleSlug
                          : "https://leetcode.com/problems/" + selected.titleSlug + "/"
                    }
                    target="_blank"
                    rel="noopener"
                    class="text-cyan-400 hover:text-cyan-300 text-[11px] mt-1 block border-t border-white/5 pt-1.5"
                  >Open problem ↗</a>
                ` : ""}
              </div>
            `}
          </div>
        `}
      </div>

      <p class="text-[10px] text-slate-600 text-center">Drag nodes · scroll to zoom · click to inspect · ↺ to re-layout</p>
    </div>
  `;
}
