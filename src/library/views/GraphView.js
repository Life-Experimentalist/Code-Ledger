/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  h,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("GraphView");
import {
  buildKnowledgeGraph,
  DIFFICULTY_COLOR,
  PLATFORM_COLOR,
} from "../../core/knowledge-graph.js";
import { getQueryParam, updateQueryParams } from "../../core/url-state.js";
import { ProblemModal } from "../components/ProblemModal.js";
import { CONSTANTS } from "../../core/constants.js";

/* ── Force simulation constants ─────────────────────────────────────── */
const REPULSION = 3500;
const LINK_DIST = { "topic-problem": 100, similar: 80, canonical: 60 };
const LINK_STR = { "topic-problem": 0.45, similar: 0.08, canonical: 0.5 };
// Very weak gravity toward origin — NOT alpha-scaled.
// At radius 700: force = 700 × 0.0008 = 0.56 px/frame.
// Repulsion at 50px: 3500/2501 ≈ 1.4 px/frame — repulsion wins at short range.
// Without alpha-scaling, gravity is constant so it never overwhelms repulsion.
const GRAVITY = 0.00035;
const DAMPING = 0.85;
const ALPHA_DECAY = 0.013;

/* ── Simulation step ─────────────────────────────────────────────────── */
// World origin is fixed at (0,0). No canvas dimensions involved here.
function simulationStep(nodes, edges, alpha) {
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
      // Softening radius: minimum effective distance = 12px
      const dsoft = Math.sqrt(d2 + 144); // Math.max(Math.sqrt(d2), 12) without sqrt performance cost
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
    const ld = LINK_DIST[e.type] ?? 100;
    const str = LINK_STR[e.type] ?? 0.3;
    const f = (d - ld) * str * alpha;
    a.fx += (f * dx) / d;
    a.fy += (f * dy) / d;
    b.fx -= (f * dx) / d;
    b.fy -= (f * dy) / d;
  }

  // Single-topic orbit: problems with exactly one topic connection orbit at ~80px from it
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
    const pull = (d - 80) * 0.012 * alpha;
    p.fx += (pull * dx) / d;
    p.fy += (pull * dy) / d;
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

/* ── Layout modes ────────────────────────────────────────────────────── */
const GRAPH_LAYOUT_MODES = [
  { id: "layered", label: "Layered" },
  { id: "circular", label: "Circular" },
  { id: "force", label: "Force" },
];

function seedNode(node, x, y) {
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
    topicPos.set(n.id, { x: n.x, y: n.y });
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
    const base = (tid && topicPos.get(tid)) || { x: 0, y: 0 };
    const idx = perTopicIdx.get(tid) || 0;
    const count = perTopicCount.get(tid) || 1;
    perTopicIdx.set(tid, idx + 1);
    const angle = (idx / count) * Math.PI * 2;
    const spread = n.solved ? 28 + Math.random() * 18 : 48 + Math.random() * 22;
    seedNode(
      n,
      base.x + Math.cos(angle) * spread,
      base.y + Math.sin(angle) * spread,
    );
  });
}

function applyLayeredLayout(nodes, edges) {
  const topicNodes = nodes
    .filter((n) => n.type === "topic")
    .sort(
      (a, b) =>
        (b.count || 0) - (a.count || 0) ||
        String(a.label).localeCompare(String(b.label)),
    );
  const problemNodes = nodes.filter((n) => n.type === "problem");
  const primaryTopic = getPrimaryTopics(edges);

  const topicGap = Math.max(
    180,
    Math.min(300, 1200 / Math.max(topicNodes.length, 1)),
  );
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

function applyGraphLayout(nodes, edges, mode) {
  if (mode === "layered") {
    applyLayeredLayout(nodes, edges);
    return;
  }
  if (mode === "force") {
    applyForceSeedLayout(nodes);
    return;
  }
  applyCircularLayout(nodes, edges);
}

/* ── Level-of-detail thresholds ──────────────────────────────────────── */
const LOD_SIMILAR_MIN_SCALE = 0.5;
const LOD_CANONICAL_MIN_SCALE = 0.3;
const LOD_GHOST_MIN_SCALE = 0.5;
const LOD_PROBLEM_LABEL_SCALE = 1.1;

/* ── Drawing ─────────────────────────────────────────────────────────── */
const EDGE_COLOR = {
  "topic-problem": "#64748b",
  similar: "#3b82f6",
  canonical: "#f59e0b",
};

const EDGE_GLOW_COLOR = {
  "topic-problem": "#94a3b833",
  similar: "#3b82f633",
  canonical: "#f59e0b33",
};

function drawGraph(ctx, nodes, edges, transform, hovered, selected) {
  const { tx, ty, scale } = transform;
  ctx.save();
  ctx.translate(tx, ty);
  ctx.scale(scale, scale);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const neighborIds = new Set();
  if (selected) {
    for (const e of edges) {
      if (e.source === selected.id) neighborIds.add(e.target);
      if (e.target === selected.id) neighborIds.add(e.source);
    }
  }

  const showSimilarEdges = scale > LOD_SIMILAR_MIN_SCALE;
  const showCanonicalEdges = scale > LOD_CANONICAL_MIN_SCALE;
  const showGhostNodes = scale > LOD_GHOST_MIN_SCALE;
  const edgeAlpha = Math.min(1, scale / 0.4 + 0.2);

  const drawableIds = new Set(
    showGhostNodes
      ? nodes.map((n) => n.id)
      : nodes.filter((n) => n.type === "topic" || n.solved).map((n) => n.id),
  );

  // Edges — drawn in two passes: glow first, then main edge
  // Pass 1: Glow/halo (thicker, semi-transparent)
  for (const e of edges) {
    if (!showSimilarEdges && e.type === "similar") continue;
    if (!showCanonicalEdges && e.type === "canonical") continue;
    if (!drawableIds.has(e.source) || !drawableIds.has(e.target)) continue;
    const a = nodeMap.get(e.source),
      b = nodeMap.get(e.target);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = EDGE_GLOW_COLOR[e.type] ?? "#94a3b833";
    ctx.lineWidth = e.type === "canonical" ? 6 : 4;
    ctx.globalAlpha = (e.type === "topic-problem" ? 0.4 : 0.6) * edgeAlpha;
    ctx.stroke();
  }

  // Pass 2: Main edge (brighter color, thicker)
  for (const e of edges) {
    if (!showSimilarEdges && e.type === "similar") continue;
    if (!showCanonicalEdges && e.type === "canonical") continue;
    if (!drawableIds.has(e.source) || !drawableIds.has(e.target)) continue;
    const a = nodeMap.get(e.source),
      b = nodeMap.get(e.target);
    if (!a || !b) continue;

    const isHovered =
      hovered &&
      (hovered.id === e.source ||
        hovered.id === e.target ||
        (selected && (selected.id === e.source || selected.id === e.target)));
    const isSelectedEdge =
      selected && (selected.id === e.source || selected.id === e.target);
    const isNeighborEdge =
      selected &&
      !isSelectedEdge &&
      (neighborIds.has(e.source) || neighborIds.has(e.target));

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = EDGE_COLOR[e.type] ?? "#64748b";
    ctx.lineWidth =
      isHovered || isSelectedEdge
        ? e.type === "canonical"
          ? 3.5
          : 2.5
        : e.type === "canonical"
          ? 2.5
          : 1.8;
    ctx.globalAlpha = isSelectedEdge
      ? 1
      : isNeighborEdge
        ? (e.type === "topic-problem" ? 0.42 : 0.55) * edgeAlpha
        : isHovered
          ? 1
          : (e.type === "topic-problem" ? 0.55 : 0.7) * edgeAlpha;
    ctx.stroke();
  }

  // Nodes — selected/neighbor emphasis mirrors the graphify-style focal halo
  for (const n of nodes) {
    if (!drawableIds.has(n.id)) continue;
    const r = n.size;
    const isH = hovered?.id === n.id;
    const isSel = selected?.id === n.id;
    const isNeighbor = selected && !isSel && neighborIds.has(n.id);

    ctx.beginPath();
    ctx.arc(n.x, n.y, r + (isH ? 3 : 0), 0, Math.PI * 2);
    ctx.shadowBlur = isSel ? 24 : isNeighbor ? 12 : 0;
    ctx.shadowColor = isSel
      ? n.color
      : isNeighbor
        ? `${n.color}88`
        : "transparent";

    if (n.type === "topic") {
      ctx.fillStyle = n.color + "33";
      ctx.fill();
      ctx.strokeStyle = n.color;
      ctx.lineWidth = isH || isSel ? 3 : isNeighbor ? 2.5 : 2;
      ctx.stroke();
    } else if (n.solved) {
      ctx.fillStyle = n.color;
      ctx.fill();
      ctx.strokeStyle = isSel
        ? "#fff"
        : n.platformColor || PLATFORM_COLOR[n.platform] || "#64748b";
      ctx.lineWidth = isSel
        ? 2.5
        : isNeighbor
          ? 2.2
          : n.isMultiPlatform
            ? 2.5
            : 1.5;
      ctx.globalAlpha = isSel ? 1 : isNeighbor ? 0.82 : 0.85;
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
    if (
      n.type === "topic" ||
      isH ||
      isSel ||
      isNeighbor ||
      scale > LOD_PROBLEM_LABEL_SCALE
    ) {
      if (isSel) {
        ctx.shadowBlur = 28;
        ctx.shadowColor = n.color;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      } else if (isNeighbor) {
        ctx.shadowBlur = 14;
        ctx.shadowColor = n.color + "99";
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      } else {
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
      }
      ctx.fillStyle = "#e2e8f0";
      ctx.font =
        n.type === "topic"
          ? `bold ${Math.max(11, r * 0.7)}px sans-serif`
          : "11px sans-serif";
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
    const dx = wx - n.x,
      dy = wy - n.y;
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
  leetcode:
    "https://assets.leetcode.com/static_assets/public/icons/favicon.ico",
  geeksforgeeks: `${CONSTANTS.PLATFORMS.geeksforgeeks.baseUrl}/favicon.ico`,
  codeforces: `${CONSTANTS.PLATFORMS.codeforces.baseUrl}/favicon.ico`,
};

const DIFF_ORDER = { Easy: 0, Medium: 1, Hard: 2, Unknown: 3 };

/* ── Component ───────────────────────────────────────────────────────── */
export function GraphView({
  problems,
  focusProblem = null,
  onFocusProblemHandled = null,
  onProblemDelete = null,
  onProblemUpdate = null,
  onNavigate = null,
}) {
  const canvasRef = useRef(null);
  const simRef = useRef({ nodes: [], edges: [], alpha: 0, raf: null });
  const transformRef = useRef({ tx: 0, ty: 0, scale: 1 });
  const dragRef = useRef(null);

  // Map from graph node ID → original problem object so modals get full data
  const rawProblemByNodeId = useMemo(() => {
    const map = new Map();
    for (const p of problems || []) {
      const nodeId = `problem:${p.platform}:${p.titleSlug || p.id}`;
      map.set(nodeId, p);
    }
    return map;
  }, [problems]);

  // Resolve a graph node (which lacks code/aiReview/etc.) → full problem
  function nodeToRawProblem(nodeOrProblem) {
    if (!nodeOrProblem) return null;
    if (nodeOrProblem.type === "problem") {
      return rawProblemByNodeId.get(nodeOrProblem.id) || nodeOrProblem;
    }
    return nodeOrProblem;
  }

  const [hovered, setHovered] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState(null);
  const [modalProblem, setModalProblem] = useState(null);
  const [graphSearch, setGraphSearch] = useState("");
  const [graphSort, setGraphSort] = useState("label");
  const [topicA, setTopicA] = useState("");
  const [topicB, setTopicB] = useState("");
  const [groupDepth, setGroupDepth] = useState(1);
  const [filterSolved, setFilterSolved] = useState(false);
  const [filterDifficultyGraph, setFilterDifficultyGraph] = useState("All");
  const [filterPlatformGraph, setFilterPlatformGraph] = useState("All");
  const [filterTopicGraph, setFilterTopicGraph] = useState("All");
  const VALID_LAYOUTS = new Set(["layered", "circular", "force"]);
  const initLayout = getQueryParam("graphLayout", "layered");
  const [layoutMode, setLayoutMode] = useState(
    VALID_LAYOUTS.has(initLayout) ? initLayout : "layered",
  );
  const filterSolvedRef = useRef(false);
  const graphSearchRef = useRef("");
  const filterDifficultyRef = useRef("All");
  const filterPlatformRef = useRef("All");
  const filterTopicRef = useRef("All");
  const groupDepthRef = useRef(1);
  const hoveredRef = useRef(null);
  const selectedRef = useRef(null);
  const fitViewRef = useRef(null);
  // Counts for toolbar (read-only, derived from simRef)
  const [stats, setStats] = useState({ topics: 0, solved: 0, suggested: 0 });

  // Filtered problem list for modal (respects graph filters but not filterSolved)
  const graphFilteredProblems = useMemo(() => {
    let out = problems || [];
    if (filterDifficultyGraph !== "All")
      out = out.filter((p) => p.difficulty === filterDifficultyGraph);
    if (filterPlatformGraph !== "All")
      out = out.filter((p) => p.platform === filterPlatformGraph);
    if (filterTopicGraph !== "All")
      out = out.filter(
        (p) =>
          (p.tags || []).includes(filterTopicGraph) ||
          p.topic === filterTopicGraph,
      );
    if (graphSearch) {
      const q = graphSearch.toLowerCase();
      out = out.filter(
        (p) =>
          (p.title || "").toLowerCase().includes(q) ||
          (p.titleSlug || "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [
    problems,
    filterDifficultyGraph,
    filterPlatformGraph,
    filterTopicGraph,
    graphSearch,
  ]);

  /* ── fitView ─────────────────────────────────────────────────────── */
  const fitView = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nodes = simRef.current.nodes.filter(
      (n) => !isNaN(n.x) && !isNaN(n.y),
    );
    if (!nodes.length) return;
    const { w, h } = getLogicalSize(canvas);
    if (!w || !h) {
      // Canvas not sized yet — retry once ResizeObserver has fired
      setTimeout(() => fitViewRef.current?.(), 60);
      return;
    }
    const pad = 60;
    const xs = nodes.map((n) => n.x),
      ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs) - pad,
      maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad,
      maxY = Math.max(...ys) + pad;
    const gW = maxX - minX || 1,
      gH = maxY - minY || 1;
    const scale = Math.min(Math.max(Math.min(w / gW, h / gH), 0.05), 2);
    const cx = (minX + maxX) / 2,
      cy = (minY + maxY) / 2;
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
        n.x = prev.x;
        n.y = prev.y;
        n.vx = prev.vx;
        n.vy = prev.vy;
        n.fx = 0;
        n.fy = 0;
      }
    }

    if (isFirstLoad) {
      // First load: apply the selected layout in world space (centered at 0,0)
      applyGraphLayout(newNodes, newEdges, layoutMode);
      hasNew = true;
    } else {
      const brandNew = newNodes.filter((n) => !existingMap.has(n.id));
      if (brandNew.length > 0) {
        // Only seed the new nodes; keep existing nodes where they are
        applyGraphLayout(brandNew, newEdges, layoutMode);
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
      suggested: newNodes.filter((n) => n.type === "problem" && !n.solved)
        .length,
    });
  }, [problems, layoutMode]);

  useEffect(() => {
    filterSolvedRef.current = filterSolved;
  }, [filterSolved]);
  useEffect(() => {
    graphSearchRef.current = graphSearch;
  }, [graphSearch]);
  useEffect(() => {
    filterDifficultyRef.current = filterDifficultyGraph;
  }, [filterDifficultyGraph]);
  useEffect(() => {
    filterPlatformRef.current = filterPlatformGraph;
  }, [filterPlatformGraph]);
  useEffect(() => {
    filterTopicRef.current = filterTopicGraph;
  }, [filterTopicGraph]);
  useEffect(() => {
    groupDepthRef.current = groupDepth;
  }, [groupDepth]);
  useEffect(() => {
    hoveredRef.current = hovered;
  }, [hovered]);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    const { nodes, edges } = simRef.current;
    if (!nodes.length) return;
    applyGraphLayout(nodes, edges, layoutMode);
    simRef.current.alpha = 1;
    setTimeout(() => fitViewRef.current?.(), 30);
  }, [layoutMode]);

  useEffect(() => {
    if (!focusProblem) return;
    const nodes = simRef.current.nodes || [];
    const match = nodes.find(
      (node) =>
        node.type === "problem" &&
        (node.id === focusProblem.id ||
          node.titleSlug === focusProblem.titleSlug ||
          (focusProblem.platform &&
            node.platform === focusProblem.platform &&
            node.titleSlug === focusProblem.titleSlug)),
    );
    if (match) {
      setSelected(match);
      setModalProblem(match);
      updateQueryParams({ problem: match.id || match.titleSlug });
      setTimeout(() => fitViewRef.current?.(), 20);
    }
    onFocusProblemHandled?.();
  }, [focusProblem, onFocusProblemHandled]);

  function getVisibleGraphData() {
    const { nodes, edges } = simRef.current;
    const query = String(graphSearchRef.current || "")
      .trim()
      .toLowerCase();
    const solvedOnly = !!filterSolvedRef.current;
    const diff = filterDifficultyRef.current;
    const platform = filterPlatformRef.current;
    const topic = filterTopicRef.current;

    const visibleProblemIds = new Set();
    for (const n of nodes) {
      if (n.type !== "problem") continue;
      if (solvedOnly && !n.solved) continue;
      if (diff !== "All" && String(n.difficulty || "Unknown") !== diff)
        continue;
      if (platform !== "All" && String(n.platform || "") !== platform) continue;
      if (topic !== "All") {
        const tags = n.tags || [];
        const primary = n.topic || n.primaryTopic || "";
        if (!tags.includes(topic) && primary !== topic) continue;
      }
      if (query) {
        const hay =
          `${n.label || ""} ${n.title || ""} ${(n.tags || []).join(" ")} ${n.platform || ""} ${n.difficulty || ""}`.toLowerCase();
        if (!hay.includes(query)) continue;
      }
      visibleProblemIds.add(n.id);
    }

    const drawNodeIds = new Set(visibleProblemIds);

    // Only add topic nodes directly connected to a VISIBLE problem node.
    // Scoping to topic-problem edges prevents unrelated topics bleeding in.
    for (const e of edges) {
      if (e.type !== "topic-problem") continue;
      if (visibleProblemIds.has(e.target)) drawNodeIds.add(e.source); // source = topic
      if (visibleProblemIds.has(e.source)) drawNodeIds.add(e.target); // target = topic
    }

    // Also draw similar/canonical edges between visible problems
    for (const e of edges) {
      if (e.type === "topic-problem") continue;
      if (visibleProblemIds.has(e.source) && visibleProblemIds.has(e.target)) {
        drawNodeIds.add(e.source);
        drawNodeIds.add(e.target);
      }
    }

    // Keep matching topic nodes discoverable even when no problem currently visible.
    if (query) {
      for (const n of nodes) {
        if (
          n.type === "topic" &&
          String(n.label || "")
            .toLowerCase()
            .includes(query)
        ) {
          drawNodeIds.add(n.id);
        }
      }
    }

    const drawNodes = nodes.filter((n) => drawNodeIds.has(n.id));
    const ids = new Set(drawNodes.map((n) => n.id));
    const drawEdges = edges.filter(
      (e) => ids.has(e.source) && ids.has(e.target),
    );
    return { drawNodes, drawEdges };
  }

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

      // Filters hide nodes from view but keep them in the simulation data model.
      const { drawNodes, drawEdges } = getVisibleGraphData();

      // Clear and fill background in physical pixels
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Scale once for DPR so all drawing uses logical CSS pixels
      ctx.save();
      ctx.scale(dpr, dpr);
      drawGraph(
        ctx,
        drawNodes,
        drawEdges,
        transformRef.current,
        hoveredRef.current,
        selectedRef.current,
      );
      ctx.restore();

      simRef.current.raf = requestAnimationFrame(loop);
    }

    simRef.current.raf = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(simRef.current.raf);
    };
  }, []);

  // Derived topic list and counts for search/compare UI
  const topicList = useMemo(
    () =>
      simRef.current.nodes
        .filter((n) => n.type === "topic")
        .map((t) => t.label)
        .sort(),
    [problems],
  );
  const topicCounts = useMemo(() => {
    const map = new Map();
    for (const n of simRef.current.nodes.filter((n) => n.type === "problem")) {
      for (const t of n.tags || []) {
        map.set(t, (map.get(t) || 0) + 1);
      }
      const primary = n.primaryTopic || n.topic;
      if (primary) map.set(primary, (map.get(primary) || 0) + 1);
    }
    return map;
  }, [problems]);

  const searchResults = useMemo(() => {
    const q = String(graphSearch || "")
      .trim()
      .toLowerCase();
    if (!q) return [];
    const nodes = (simRef.current.nodes || []).filter((n) => {
      const hay =
        `${n.label || ""} ${(n.tags || []).join(" ")} ${n.title || ""} ${n.platform || ""} ${n.difficulty || ""}`.toLowerCase();
      return hay.includes(q);
    });
    const rank = (n) => {
      if (graphSort === "difficulty")
        return DIFF_ORDER[String(n.difficulty || "Unknown")] ?? 3;
      if (graphSort === "platform") return String(n.platform || "");
      return String(n.label || "").toLowerCase();
    };
    const sorted = [...nodes].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (typeof ra === "number" && typeof rb === "number") return ra - rb;
      return String(ra).localeCompare(String(rb));
    });
    return sorted.slice(0, 40);
  }, [graphSearch, graphSort, problems]);

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
      const d = dragRef.current;
      const { tx, ty, scale } = transformRef.current;
      const worldX = (mx - tx) / scale;
      const worldY = (my - ty) / scale;
      if (d.group) {
        // move all movedNodes by same delta from snapshot
        const dx = worldX - d.startWorld.x;
        const dy = worldY - d.startWorld.y;
        for (const n of d.movedNodes) {
          const snap = d.snapshot.get(n.id);
          if (!snap) continue;
          n.x = snap.x + dx;
          n.y = snap.y + dy;
          n.vx = 0;
          n.vy = 0;
        }
      } else {
        const { node } = d;
        node.x = worldX;
        node.y = worldY;
        node.vx = 0;
        node.vy = 0;
      }
      return;
    }

    const testNodes = getVisibleGraphData().drawNodes;
    const hit = hitTest(testNodes, mx, my, transformRef.current);
    setHovered(hit);
    setMousePos({ x: e.clientX, y: e.clientY });
    canvas.style.cursor = hit ? "pointer" : "grab";
  }, []);

  const onMouseDown = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const testNodes = getVisibleGraphData().drawNodes;
    const hit = hitTest(
      testNodes,
      e.clientX - rect.left,
      e.clientY - rect.top,
      transformRef.current,
    );
    // Support double-click + drag to move node + neighbors up to configured depth.
    const isGroupDrag = e.detail >= 2;
    if (hit) {
      if (isGroupDrag) {
        const depthLimit = Math.max(1, Number(groupDepthRef.current || 1));
        const adjacency = new Map();
        for (const ed of simRef.current.edges) {
          if (!adjacency.has(ed.source)) adjacency.set(ed.source, []);
          if (!adjacency.has(ed.target)) adjacency.set(ed.target, []);
          adjacency.get(ed.source).push(ed.target);
          adjacency.get(ed.target).push(ed.source);
        }
        const neighbors = new Set([hit.id]);
        const q = [{ id: hit.id, depth: 0 }];
        while (q.length) {
          const cur = q.shift();
          if (cur.depth >= depthLimit) continue;
          for (const nxt of adjacency.get(cur.id) || []) {
            if (neighbors.has(nxt)) continue;
            neighbors.add(nxt);
            q.push({ id: nxt, depth: cur.depth + 1 });
          }
        }
        const movedNodes = simRef.current.nodes.filter((n) =>
          neighbors.has(n.id),
        );
        const snapshot = new Map(
          movedNodes.map((n) => [n.id, { x: n.x, y: n.y }]),
        );
        const startMouse = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
        const { tx, ty, scale } = transformRef.current;
        const startWorld = {
          x: (startMouse.x - tx) / scale,
          y: (startMouse.y - ty) / scale,
        };
        dragRef.current = {
          type: "node",
          node: hit,
          group: true,
          movedNodes,
          snapshot,
          startWorld,
        };
      } else {
        dragRef.current = { type: "node", node: hit, group: false };
      }
    } else {
      dragRef.current = { type: "pan" };
    }
  }, []);

  const onMouseUp = useCallback((e) => {
    if (dragRef.current?.type === "node") {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const testNodes = getVisibleGraphData().drawNodes;
      const hit = hitTest(
        testNodes,
        e.clientX - rect.left,
        e.clientY - rect.top,
        transformRef.current,
      );
      if (hit) setSelected((prev) => (prev?.id === hit.id ? null : hit));
      // if group drag, settle velocities to zero for moved nodes
      if (dragRef.current.group && dragRef.current.movedNodes) {
        for (const n of dragRef.current.movedNodes) {
          n.vx = 0;
          n.vy = 0;
        }
      }
    }
    dragRef.current = null;
  }, []);

  const zoomBy = useCallback((factor) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h } = getLogicalSize(canvas);
    const mx = w / 2,
      my = h / 2;
    const t = transformRef.current;
    const clamped = Math.min(Math.max(t.scale * factor, 0.05), 5);
    const actual = clamped / t.scale;
    t.tx = mx + (t.tx - mx) * actual;
    t.ty = my + (t.ty - my) * actual;
    t.scale = clamped;
  }, []);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // Proportional zoom: deltaY magnitude drives factor so trackpad scrolls smoothly
    // instead of snapping in 10% steps. exp(-0.001 * 100) ≈ 0.905 matches one mouse notch.
    const raw = Math.max(-200, Math.min(200, e.deltaY));
    const factor = Math.exp(-raw * 0.001);
    const t = transformRef.current;
    t.tx = mx + (t.tx - mx) * factor;
    t.ty = my + (t.ty - my) * factor;
    t.scale = Math.min(Math.max(t.scale * factor, 0.05), 5);
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
    applyGraphLayout(nodes, edges, layoutMode);
    simRef.current.alpha = 1;
    setTimeout(() => fitViewRef.current?.(), 30);
  }, [layoutMode]);

  /* ── Problem URL ─────────────────────────────────────────────────── */
  function problemUrl(node) {
    if (!node?.titleSlug) return null;
    return CONSTANTS.makeProblemUrl(
      node.platform || "leetcode",
      node.titleSlug,
    );
  }

  /* ── Node detail (tooltip + selected panel) ─────────────────────── */
  function NodeDetail({ node, compact = false }) {
    if (!node) return null;
    if (node.type === "topic") {
      const topicProblems = simRef.current.nodes
        .filter(
          (candidate) =>
            candidate.type === "problem" &&
            (candidate.tags || []).includes(node.label),
        )
        .sort((a, b) =>
          a.solved === b.solved
            ? String(a.label).localeCompare(String(b.label))
            : a.solved
              ? -1
              : 1,
        );
      return html`
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <div class="text-xs font-bold text-white">${node.label}</div>
            <div
              class="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-400"
            >
              ${node.count} problem${node.count !== 1 ? "s" : ""}
            </div>
          </div>
          <div class="text-[11px] text-slate-400">
            ${node.count} problem${node.count !== 1 ? "s" : ""} solved
          </div>
          ${!compact && topicProblems.length
            ? html`
                <div
                  class="mt-1 border-t border-white/5 pt-2 flex flex-col gap-1"
                >
                  <div
                    class="text-[10px] uppercase tracking-wider text-slate-600"
                  >
                    Problems
                  </div>
                  <div
                    class="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1"
                  >
                    ${topicProblems.map(
                      (problem) => html`
                        <button
                          onClick=${() => {
                            setModalProblem(problem);
                            updateQueryParams({
                              problem: problem.id || problem.titleSlug,
                            });
                          }}
                          class="text-left px-2 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-cyan-500/20 transition-colors"
                        >
                          <div class="flex items-center justify-between gap-2">
                            <span
                              class="text-[11px] text-slate-200 leading-snug"
                              >${problem.label}</span
                            >
                            <span class="text-[10px] text-slate-500 shrink-0"
                              >${problem.platform || ""}</span
                            >
                          </div>
                        </button>
                      `,
                    )}
                  </div>
                </div>
              `
            : ""}
        </div>
      `;
    }
    const url = problemUrl(node);
    const favicon = PLATFORM_FAVICON[node.platform];
    const diffClass =
      node.difficulty === "Easy"
        ? "bg-emerald-500/20 text-emerald-400"
        : node.difficulty === "Medium"
          ? "bg-amber-500/20 text-amber-400"
          : node.difficulty === "Hard"
            ? "bg-rose-500/20 text-rose-400"
            : "bg-slate-500/20 text-slate-400";
    return html`
      <div class="flex flex-col gap-2">
        <div class="flex items-start gap-2">
          ${favicon
            ? html`<img
                src=${favicon}
                class="w-3.5 h-3.5 mt-0.5 shrink-0 object-contain"
                alt=""
                onError=${(e) => {
                  e.target.style.display = "none";
                }}
              />`
            : ""}
          <span class="text-xs font-semibold text-white leading-snug"
            >${node.label}</span
          >
        </div>
        <div class="flex items-center gap-1.5 flex-wrap">
          <span
            class="px-1.5 py-0.5 rounded text-[10px] font-medium ${diffClass}"
            >${node.difficulty || "?"}</span
          >
          <span
            class="text-[10px] ${node.solved
              ? "text-emerald-400"
              : "text-slate-600"}"
            >${node.solved ? "✓ Solved" : "○ Suggested"}</span
          >
          ${node.lang
            ? html`<span class="text-[10px] font-mono text-cyan-500/70"
                >${node.lang}</span
              >`
            : ""}
        </div>
        ${!compact
          ? html`
              ${node.runtime || node.memory || node.acRate
                ? html`
                    <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                      ${node.runtime
                        ? html`<span class="text-slate-500">Runtime</span
                            ><span class="text-slate-200 text-right"
                              >${node.runtime}${node.runtimePct
                                ? html` <span class="text-cyan-500/60"
                                    >· ${node.runtimePct.toFixed(0)}%</span
                                  >`
                                : ""}</span
                            >`
                        : ""}
                      ${node.memory
                        ? html`<span class="text-slate-500">Memory</span
                            ><span class="text-slate-200 text-right"
                              >${node.memory}${node.memoryPct
                                ? html` <span class="text-cyan-500/60"
                                    >· ${node.memoryPct.toFixed(0)}%</span
                                  >`
                                : ""}</span
                            >`
                        : ""}
                      ${node.acRate
                        ? html`<span class="text-slate-500">Accept rate</span
                            ><span class="text-slate-200 text-right"
                              >${node.acRate.toFixed(1)}%</span
                            >`
                        : ""}
                      ${node.timestamp
                        ? html`<span class="text-slate-500">Solved</span
                            ><span class="text-slate-200 text-right"
                              >${new Date(
                                node.timestamp < 1e10
                                  ? node.timestamp * 1000
                                  : node.timestamp,
                              ).toLocaleDateString()}</span
                            >`
                        : ""}
                    </div>
                  `
                : ""}
              ${node.tags?.length
                ? html`
                    <div class="flex flex-wrap gap-1 mt-0.5">
                      ${node.tags.map(
                        (t) =>
                          html`<span
                            class="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] text-slate-400"
                            >${t}</span
                          >`,
                      )}
                    </div>
                  `
                : ""}
              ${url
                ? html`
                    <a
                      href=${url}
                      target="_blank"
                      rel="noopener"
                      class="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 border-t border-white/5 pt-1.5 mt-0.5"
                      onClick=${(e) => e.stopPropagation()}
                    >
                      ${favicon
                        ? html`<img
                            src=${favicon}
                            class="w-3 h-3 object-contain"
                            alt=""
                            onError=${(e) => {
                              e.target.style.display = "none";
                            }}
                          />`
                        : ""}
                      Open problem ↗
                    </a>
                  `
                : ""}
            `
          : ""}
      </div>
    `;
  }

  return html`
    <div class="flex flex-col gap-4 w-full h-full min-h-[600px]">
      <!-- Toolbar -->
      <div class="flex items-center gap-3 flex-wrap">
        <div class="flex gap-2 text-xs text-slate-400">
          <span class="px-2 py-1 rounded bg-white/5 border border-white/10"
            >${stats.topics} topics</span
          >
          <span class="px-2 py-1 rounded bg-white/5 border border-white/10"
            >${stats.solved} solved</span
          >
          <span class="px-2 py-1 rounded bg-white/5 border border-white/10"
            >${stats.suggested} suggested</span
          >
        </div>
        <div
          class="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1 text-xs text-slate-400"
        >
          ${GRAPH_LAYOUT_MODES.map(
            (mode) => html`
              <button
                onClick=${() => {
                  setLayoutMode(mode.id);
                  updateQueryParams({ graphLayout: mode.id });
                }}
                class="px-2 py-1 rounded-md transition-colors ${layoutMode ===
                mode.id
                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/5"}"
                title=${mode.id === "layered"
                  ? "Topics on top, problems grouped by difficulty"
                  : mode.id === "circular"
                    ? "Topics in a ring with clustered problems"
                    : "Loose force-directed seed layout"}
              >
                ${mode.label}
              </button>
            `,
          )}
        </div>
        <div class="flex items-center gap-2 ml-2">
          <input
            placeholder="Search graph…"
            value=${graphSearch}
            onInput=${(e) => setGraphSearch(e.target.value)}
            class="px-2 py-1.5 bg-black border border-white/10 rounded text-xs text-white min-w-[200px]"
          />
          <select
            value=${graphSort}
            onChange=${(e) => setGraphSort(e.target.value)}
            class="px-2 py-1.5 bg-black border border-white/10 rounded text-xs text-slate-300"
          >
            <option value="label">Label</option>
            <option value="difficulty">Difficulty</option>
            <option value="platform">Platform</option>
          </select>
          <select
            value=${filterDifficultyGraph}
            onChange=${(e) => setFilterDifficultyGraph(e.target.value)}
            class="px-2 py-1.5 bg-black border border-white/10 rounded text-xs text-slate-300"
          >
            <option value="All">All Difficulty</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
            <option value="Unknown">Unknown</option>
          </select>
          <select
            value=${filterPlatformGraph}
            onChange=${(e) => setFilterPlatformGraph(e.target.value)}
            class="px-2 py-1.5 bg-black border border-white/10 rounded text-xs text-slate-300"
          >
            <option value="All">All Platform</option>
            <option value="leetcode">LeetCode</option>
            <option value="geeksforgeeks">GFG</option>
            <option value="codeforces">Codeforces</option>
          </select>
          <div class="flex items-center gap-1 text-xs text-slate-400">
            <select
              value=${filterTopicGraph}
              onChange=${(e) => setFilterTopicGraph(e.target.value)}
              class="px-2 py-1 bg-black border border-white/10 rounded text-xs text-white"
            >
              <option value="All">All Topics</option>
              ${topicList.map((t) => html`<option value=${t}>${t}</option>`)}
            </select>
            <select
              value=${topicA}
              onChange=${(e) => setTopicA(e.target.value)}
              class="px-2 py-1 bg-black border border-white/10 rounded text-xs text-white"
            >
              <option value="">Compare…</option>
              ${topicList.map(
                (t) =>
                  html`<option value=${t}>
                    ${t} (${topicCounts.get(t) || 0})
                  </option>`,
              )}
            </select>
            <select
              value=${topicB}
              onChange=${(e) => setTopicB(e.target.value)}
              class="px-2 py-1 bg-black border border-white/10 rounded text-xs text-white"
            >
              <option value=""></option>
              ${topicList.map(
                (t) =>
                  html`<option value=${t}>
                    ${t} (${topicCounts.get(t) || 0})
                  </option>`,
              )}
            </select>
            <div
              class="flex items-center gap-1 text-[10px] text-slate-400 ml-1"
            >
              Depth
              <input
                type="range"
                min="1"
                max="4"
                value=${groupDepth}
                onInput=${(e) => setGroupDepth(Number(e.target.value) || 1)}
                class="w-20"
              />
              <span>${groupDepth}</span>
            </div>
            ${topicA && topicB
              ? html`<div class="text-[10px] text-slate-300">
                  A: ${topicCounts.get(topicA) || 0} · B:
                  ${topicCounts.get(topicB) || 0} · ∩:
                  ${(() => {
                    const a = new Set(
                      simRef.current.nodes
                        .filter(
                          (n) =>
                            n.type === "problem" &&
                            (n.tags || []).includes(topicA),
                        )
                        .map((n) => n.id),
                    );
                    const b = new Set(
                      simRef.current.nodes
                        .filter(
                          (n) =>
                            n.type === "problem" &&
                            (n.tags || []).includes(topicB),
                        )
                        .map((n) => n.id),
                    );
                    let inter = 0;
                    for (const id of a) if (b.has(id)) inter++;
                    return inter;
                  })()}
                </div>`
              : ""}
          </div>
        </div>
        <label
          class="flex items-center gap-2 text-xs text-slate-400 cursor-pointer ml-auto"
        >
          <input
            type="checkbox"
            checked=${filterSolved}
            onChange=${(e) => setFilterSolved(e.target.checked)}
          />
          Solved only
        </label>
        <div
          class="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-0.5"
        >
          <button
            onClick=${() => zoomBy(1.25)}
            title="Zoom in"
            class="text-xs px-2.5 py-1 rounded-md text-slate-300 hover:bg-white/10 transition-colors leading-none"
          >
            +
          </button>
          <button
            onClick=${fitView}
            title="Fit all nodes into view"
            class="text-xs px-2.5 py-1 rounded-md text-slate-400 hover:bg-white/10 transition-colors"
          >
            ▣
          </button>
          <button
            onClick=${() => zoomBy(0.8)}
            title="Zoom out"
            class="text-xs px-2.5 py-1 rounded-md text-slate-300 hover:bg-white/10 transition-colors leading-none"
          >
            −
          </button>
        </div>
        <button
          onClick=${reLayout}
          class="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors"
        >
          ↺ Re-layout
        </button>
        ${filterDifficultyGraph !== "All" ||
        filterPlatformGraph !== "All" ||
        filterTopicGraph !== "All" ||
        filterSolved ||
        graphSearch
          ? html`
              <button
                onClick=${() => {
                  setFilterDifficultyGraph("All");
                  setFilterPlatformGraph("All");
                  setFilterTopicGraph("All");
                  setFilterSolved(false);
                  setGraphSearch("");
                }}
                class="text-xs px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 transition-colors"
              >
                ✕ Clear filters
              </button>
            `
          : ""}
      </div>

      ${graphSearch && searchResults.length
        ? html`
            <div
              class="rounded-lg border border-white/10 bg-black/40 p-2 max-h-36 overflow-y-auto"
            >
              <div
                class="text-[10px] uppercase tracking-wider text-slate-500 mb-2"
              >
                Search Results
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-1">
                ${searchResults.map(
                  (n) => html`
                    <button
                      class="text-left px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200"
                      onClick=${() => {
                        setSelected(n);
                        if (n.type === "problem") {
                          const problem = nodeToRawProblem(n);
                          setModalProblem(problem);
                          updateQueryParams({
                            problem: problem.id || problem.titleSlug,
                          });
                        }
                      }}
                    >
                      ${n.label}
                      <span class="text-slate-500"
                        >${n.type}${n.platform ? ` · ${n.platform}` : ""}</span
                      >
                    </button>
                  `,
                )}
              </div>
            </div>
          `
        : ""}

      <!-- Canvas area -->
      <div
        class="relative flex-1 rounded-2xl overflow-hidden border border-white/5 bg-[#0a0a0f]"
        style="min-height:500px"
      >
        <canvas
          ref=${canvasRef}
          style="display:block;width:100%;height:100%"
          onMouseMove=${onMouseMove}
          onMouseDown=${onMouseDown}
          onMouseUp=${onMouseUp}
        ></canvas>

        <!-- Legend -->
        <div
          class="absolute bottom-3 left-3 flex flex-col gap-1 text-[10px] text-slate-400 bg-black/60 backdrop-blur px-3 py-2 rounded-lg border border-white/5"
        >
          <div
            class="text-[9px] text-slate-600 uppercase tracking-wider mb-0.5"
          >
            Difficulty
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#22c55e] inline-block"></span
            >Easy
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#f59e0b] inline-block"></span
            >Medium
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#ef4444] inline-block"></span
            >Hard
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#64748b] inline-block"></span
            >Unknown
          </div>
          <div class="flex items-center gap-2">
            <span
              class="w-3 h-3 rounded-full border border-dashed border-slate-400 inline-block"
            ></span
            >Suggested
          </div>
          <div
            class="text-[9px] text-slate-600 uppercase tracking-wider mt-1 mb-0.5"
          >
            Platform (ring)
          </div>
          <div class="flex items-center gap-2">
            <img
              src=${PLATFORM_FAVICON.leetcode}
              class="w-3 h-3 object-contain"
              alt=""
            />
            LeetCode
          </div>
          <div class="flex items-center gap-2">
            <img
              src=${PLATFORM_FAVICON.geeksforgeeks}
              class="w-3 h-3 object-contain"
              alt=""
            />
            GFG
          </div>
          <div class="flex items-center gap-2">
            <img
              src=${PLATFORM_FAVICON.codeforces}
              class="w-3 h-3 object-contain"
              alt=""
            />
            Codeforces
          </div>
        </div>

        <!-- Empty state -->
        ${!problems?.length &&
        html`
          <div class="absolute inset-0 flex items-center justify-center">
            <p class="text-slate-500 text-sm">
              Solve some problems to build the graph.
            </p>
          </div>
        `}

        <!-- Hover tooltip -->
        ${hovered &&
        !selected &&
        html`
          <div
            class="pointer-events-none fixed z-50 bg-[#071018]/95 backdrop-blur border border-white/15 rounded-xl p-3 shadow-2xl w-52"
            style=${{
              left: `${mousePos.x + 14}px`,
              top: `${mousePos.y - 10}px`,
              transform:
                mousePos.x > window.innerWidth - 230
                  ? "translateX(-110%)"
                  : "none",
            }}
          >
            <${NodeDetail} node=${hovered} compact=${true} />
            <p class="text-[9px] text-slate-600 mt-2">Click to pin details</p>
          </div>
        `}

        <!-- Selected node panel -->
        ${selected &&
        html`
          <div
            class="absolute top-3 right-3 bg-[#071018]/97 backdrop-blur border border-cyan-500/20 rounded-xl p-4 w-64 shadow-2xl max-h-[80%] overflow-y-auto"
          >
            <div class="flex items-center justify-between mb-3">
              ${selected.type === "problem" && selected.solved
                ? html`
                    <button
                      onClick=${() => {
                        const problem = nodeToRawProblem(selected);
                        setModalProblem(problem);
                        updateQueryParams({
                          problem: problem.id || problem.titleSlug,
                        });
                      }}
                      class="text-[10px] px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                    >
                      Expand ↗
                    </button>
                  `
                : html`<span></span>`}
              <button
                onClick=${() => setSelected(null)}
                class="text-slate-500 hover:text-slate-300 text-xs leading-none px-1"
              >
                ✕
              </button>
            </div>
            <${NodeDetail} node=${selected} compact=${false} />
          </div>
        `}
      </div>

      <p class="text-[10px] text-slate-600 text-center">
        Drag nodes · scroll or +/− to zoom · ▣ fit view · hover to preview ·
        click to pin · double-click drag to move a cluster
      </p>

      <${ProblemModal}
        problem=${modalProblem}
        onClose=${() => {
          setModalProblem(null);
          updateQueryParams({ problem: null });
        }}
        problemList=${graphFilteredProblems}
        onNavigateProblem=${(prob) => {
          setModalProblem(prob);
          updateQueryParams({ problem: prob.id || prob.titleSlug });
        }}
        onNavigate=${onNavigate}
        onDelete=${(id) => {
          if (onProblemDelete) onProblemDelete(id);
          setModalProblem(null);
        }}
        onUpdate=${(updated) => {
          if (onProblemUpdate) onProblemUpdate(updated);
        }}
      />
    </div>
  `;
}
