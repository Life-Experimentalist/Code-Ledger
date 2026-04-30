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
      // Platform color ring — blended for multi-platform solves
      const ringColor = n.platformColor || PLATFORM_COLOR[n.platform] || "#64748b";
      ctx.strokeStyle = isSel ? "#fff" : ringColor;
      ctx.lineWidth = isSel ? 2.5 : n.isMultiPlatform ? 2.5 : 1.5;
      ctx.globalAlpha = isSel ? 1 : 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;
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

/* ── Favicon map for hover tooltip ──────────────────────────────────── */
const PLATFORM_FAVICON = {
  leetcode:      "https://assets.leetcode.com/static_assets/public/icons/favicon.ico",
  geeksforgeeks: "https://www.geeksforgeeks.org/favicon.ico",
  codeforces:    "https://codeforces.com/favicon.ico",
};

/* ── Component ───────────────────────────────────────────────────────── */
export function GraphView({ problems }) {
  const canvasRef    = useRef(null);
  const simRef       = useRef({ nodes: [], edges: [], alpha: 1, raf: null });
  const transformRef = useRef({ tx: 0, ty: 0, scale: 1 });
  const dragRef      = useRef(null);
  const [hovered,       setHovered]       = useState(null);
  const [mousePos,      setMousePos]      = useState({ x: 0, y: 0 });
  const [selected,      setSelected]      = useState(null);
  const [modalProblem,  setModalProblem]  = useState(null);
  const [filterSolved, setFilterSolved]   = useState(false);
  const filterSolvedRef = useRef(false);
  // Refs so the animation loop can read current hovered/selected without restarting
  const hoveredRef  = useRef(null);
  const selectedRef = useRef(null);

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

  // Keep all refs in sync so the animation loop reads current values without restarting
  useEffect(() => { filterSolvedRef.current = filterSolved; }, [filterSolved]);
  useEffect(() => { hoveredRef.current  = hovered;  }, [hovered]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // Animation loop — deps are empty; reads all mutable state via refs
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

      const drawNodes = filterSolvedRef.current
        ? nodes.filter((n) => n.type === "topic" || n.solved)
        : nodes;
      const drawEdges = filterSolvedRef.current
        ? edges.filter((e) => drawNodes.some((n) => n.id === e.source) && drawNodes.some((n) => n.id === e.target))
        : edges;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, w, h);
      drawGraph(ctx, drawNodes, drawEdges, transformRef.current, hoveredRef.current, selectedRef.current);
      simRef.current.raf = requestAnimationFrame(loop);
    }

    simRef.current.raf = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(simRef.current.raf); };
  }, []);

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
    const rect   = canvas.getBoundingClientRect();
    const testNodes = filterSolvedRef.current
      ? simRef.current.nodes.filter((n) => n.type === "topic" || n.solved)
      : simRef.current.nodes;
    const hit = hitTest(testNodes, e.clientX - rect.left, e.clientY - rect.top, transformRef.current);
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

  // Attach wheel listener as non-passive so e.preventDefault() works
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const reheat = useCallback(() => { simRef.current.alpha = 1; }, []);

  const visibleNodes = filterSolved
    ? simRef.current.nodes.filter((n) => n.type === "topic" || n.solved)
    : simRef.current.nodes;

  const topicCount   = simRef.current.nodes.filter((n) => n.type === "topic").length;
  const solvedCount  = simRef.current.nodes.filter((n) => n.type === "problem" && n.solved).length;
  const similarCount = simRef.current.nodes.filter((n) => n.type === "problem" && !n.solved).length;

  /* ── Problem URL helper ─────────────────────────────────── */
  function problemUrl(node) {
    if (!node?.titleSlug) return null;
    if (node.platform === "geeksforgeeks") return `https://practice.geeksforgeeks.org/problems/${node.titleSlug}`;
    if (node.platform === "codeforces")    return `https://codeforces.com/problemset/problem/${node.titleSlug}`;
    return `https://leetcode.com/problems/${node.titleSlug}/`;
  }

  /* ── Shared node detail renderer (used by hover tooltip and selected panel) */
  function NodeDetail({ node, compact = false }) {
    if (!node) return null;
    if (node.type === "topic") return html`
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center gap-2 text-xs font-bold text-white">${node.label}</div>
        <div class="text-[11px] text-slate-400">${node.count} problem${node.count !== 1 ? "s" : ""} solved</div>
      </div>
    `;
    const url = problemUrl(node);
    const favicon = PLATFORM_FAVICON[node.platform];
    const diffClass = node.difficulty === "Easy" ? "bg-emerald-500/20 text-emerald-400"
      : node.difficulty === "Medium" ? "bg-amber-500/20 text-amber-400"
      : node.difficulty === "Hard" ? "bg-rose-500/20 text-rose-400"
      : "bg-white/10 text-slate-400";
    return html`
      <div class="flex flex-col gap-2">
        <!-- Title + platform -->
        <div class="flex items-start gap-2">
          ${favicon ? html`<img src=${favicon} class="w-3.5 h-3.5 mt-0.5 shrink-0 object-contain" alt="" onError=${(e) => { e.target.style.display='none'; }} />` : ""}
          <span class="text-xs font-semibold text-white leading-snug">${node.label}</span>
        </div>
        <!-- Status + difficulty -->
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="px-1.5 py-0.5 rounded text-[10px] font-medium ${diffClass}">${node.difficulty || "?"}</span>
          <span class="text-[10px] ${node.solved ? "text-emerald-400" : "text-slate-600"}">${node.solved ? "✓ Solved" : "○ Suggested"}</span>
          ${node.lang ? html`<span class="text-[10px] font-mono text-cyan-500/70">${node.lang}</span>` : ""}
        </div>
        ${!compact ? html`
          <!-- Stats row -->
          ${(node.runtime || node.memory || node.acRate) ? html`
            <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
              ${node.runtime ? html`<span class="text-slate-500">Runtime</span><span class="text-slate-200 text-right">${node.runtime}${node.runtimePct ? html` <span class="text-cyan-500/60">· ${node.runtimePct.toFixed(0)}%</span>` : ""}</span>` : ""}
              ${node.memory ? html`<span class="text-slate-500">Memory</span><span class="text-slate-200 text-right">${node.memory}${node.memoryPct ? html` <span class="text-cyan-500/60">· ${node.memoryPct.toFixed(0)}%</span>` : ""}</span>` : ""}
              ${node.acRate ? html`<span class="text-slate-500">Accept rate</span><span class="text-slate-200 text-right">${node.acRate.toFixed(1)}%</span>` : ""}
              ${node.timestamp ? html`<span class="text-slate-500">Solved</span><span class="text-slate-200 text-right">${new Date(node.timestamp < 1e10 ? node.timestamp * 1000 : node.timestamp).toLocaleDateString()}</span>` : ""}
            </div>
          ` : ""}
          <!-- All topics/tags -->
          ${node.tags?.length ? html`
            <div class="flex flex-wrap gap-1 mt-0.5">
              ${node.tags.map(t => html`
                <span class="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] text-slate-400">${t}</span>
              `)}
            </div>
          ` : ""}
          <!-- Open link -->
          ${url ? html`
            <a href=${url} target="_blank" rel="noopener"
               class="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 border-t border-white/5 pt-1.5 mt-0.5"
               onClick=${(e) => e.stopPropagation()}
            >
              ${favicon ? html`<img src=${favicon} class="w-3 h-3 object-contain" alt="" onError=${(e) => { e.target.style.display='none'; }} />` : ""}
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
        ></canvas>

        <!-- Legend -->
        <div class="absolute bottom-3 left-3 flex flex-col gap-1 text-[10px] text-slate-400 bg-black/60 backdrop-blur px-3 py-2 rounded-lg border border-white/5">
          <div class="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">Difficulty</div>
          <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-[#22c55e] inline-block"></span>Easy</div>
          <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-[#f59e0b] inline-block"></span>Medium</div>
          <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-[#ef4444] inline-block"></span>Hard</div>
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

        <!-- Hover tooltip (follows cursor, shows brief info) — hidden when selected -->
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

        <!-- Selected node panel (pinned, full details) -->
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

      <p class="text-[10px] text-slate-600 text-center">Drag nodes · scroll to zoom · hover to preview · click to pin · Expand for full details · ↺ to re-layout</p>

      <!-- Full problem modal triggered from graph -->
      <${ProblemModal}
        problem=${modalProblem}
        onClose=${() => setModalProblem(null)}
      />
    </div>
  `;
}
