/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Knowledge graph view, rebuilt on vis-network — the same engine graphify's
 * exported graphs use. The custom canvas simulation this replaces overlapped
 * nodes and fought the user; vis-network's forceAtlas2Based solver with
 * avoidOverlap spreads clusters organically, then freezes so the map stays
 * where it settled. Layout is seeded deterministically, so the same library
 * lands in the same shape every time the tab opens — a problem lives
 * somewhere, and search or a legend click zooms you to it.
 *
 * The vendored bundle (src/vendor/vis-network-bundle.js) is imported lazily so
 * the other library tabs never pay for it.
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
import { buildKnowledgeGraph, PLATFORM_COLOR } from "../../core/knowledge-graph.js";
import { getQueryParam, updateQueryParams } from "../../core/url-state.js";
import {
  KIND,
  KIND_ORDER,
  KIND_LABEL,
  KIND_LABEL_PLURAL,
  masteryOptsFromSettings,
} from "../../core/topic-taxonomy.js";
import { ProblemModal } from "../components/ProblemModal.js";
import { CONSTANTS } from "../../core/constants.js";
import { isAIActive } from "../../core/feature-flags.js";

/* ── Colour modes ────────────────────────────────────────────────────── */

/**
 * What the colour of a topic node means. "Topic" gives every topic its own
 * hue — identity only. "Mastery" spends the same colour on how well the topic
 * is held, so the weak areas are the ones that stand out.
 */
const GRAPH_COLOR_MODES = [
  { id: "topic", label: "By topic" },
  { id: "mastery", label: "By mastery" },
];

const BAND_COLOR = {
  strong: "#10b981",
  working: "#06b6d4",
  shaky: "#f59e0b",
  untouched: "#64748b",
};

const BAND_LABEL = {
  strong: "solid",
  working: "coming along",
  shaky: "shaky",
  untouched: "untouched",
};

const EDGE_STYLE = {
  "topic-problem": { width: 1, dashes: false },
  similar: { color: "#3b82f6", highlight: "#60a5fa", width: 1, dashes: [4, 6] },
  canonical: { color: "#f59e0b", highlight: "#fbbf24", width: 2, dashes: [8, 6] },
};

/**
 * The physics that make graphify's graphs read as calm instead of cluttered:
 * forceAtlas2 spreads hubs apart, avoidOverlap keeps every node clear of its
 * neighbours, and once the layout stabilises physics turns off so the map
 * holds still. randomSeed pins the initial scatter, which makes the final
 * layout reproducible run to run.
 */
const VIS_OPTIONS = {
  autoResize: false,
  layout: { randomSeed: 7 },
  physics: {
    enabled: true,
    solver: "forceAtlas2Based",
    forceAtlas2Based: {
      gravitationalConstant: -60,
      centralGravity: 0.005,
      springLength: 100,
      springConstant: 0.08,
      damping: 0.4,
      avoidOverlap: 0.9,
    },
    maxVelocity: 40,
    stabilization: { enabled: true, iterations: 250, updateInterval: 25, fit: true },
  },
  interaction: {
    hover: true,
    hideEdgesOnDrag: true,
    navigationButtons: false,
    keyboard: false,
    tooltipDelay: 3600000, // effectively off — the sidebar is the inspector
  },
  nodes: { shape: "dot", borderWidth: 1.5, borderWidthSelected: 3 },
  edges: {
    smooth: { enabled: true, type: "continuous", roundness: 0.2 },
    selectionWidth: 2,
    hoverWidth: 0.5,
  },
};

const PLATFORM_FAVICON = {
  leetcode: "https://assets.leetcode.com/static_assets/public/icons/favicon.ico",
  geeksforgeeks: `${CONSTANTS.PLATFORMS.geeksforgeeks.baseUrl}/favicon.ico`,
  codeforces: `${CONSTANTS.PLATFORMS.codeforces.baseUrl}/favicon.ico`,
};

const PLATFORM_LABEL = {
  leetcode: "LeetCode",
  geeksforgeeks: "GFG",
  codeforces: "Codeforces",
  neetcode: "NeetCode",
  takeuforward: "takeUforward",
};

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Current colour of a topic node under the given mode. */
function topicNodeColor(node, colorMode) {
  return colorMode === "mastery"
    ? BAND_COLOR[node.band] || BAND_COLOR.untouched
    : node.paletteColor || node.color;
}

/**
 * Translate one knowledge-graph node into vis-network's node shape.
 *
 * The visual hierarchy carries the levels: topic hubs are large translucent
 * discs with big labels, solved problems are solid difficulty-coloured dots
 * ringed in their platform colour, and unsolved suggestions are small dashed
 * ghosts. Because vis draws labels in world space, zooming out naturally
 * fades problem titles into texture while topic names stay readable — the
 * level-of-detail story needs no extra code.
 */
/**
 * Topic hubs wear their taxonomy axis as a shape, so the map itself answers
 * "is this a data structure or a technique": algorithms are the familiar
 * discs, data structures are diamonds, domain topics are hexagons. All three
 * are outside-label shapes in vis, so sizing and fonts behave identically.
 */
const KIND_SHAPE = {
  [KIND.ALGO]: "dot",
  [KIND.DS]: "diamond",
  [KIND.DOMAIN]: "hexagon",
};

// Short axis names for the segmented kind filter — 280px of sidebar fits
// "DS", not "Data structures".
const KIND_SHORT = {
  [KIND.ALGO]: "Algo",
  [KIND.DS]: "DS",
  [KIND.DOMAIN]: "Other",
};

function toVisNode(n, { colorMode, textColor }) {
  if (n.type === "topic") {
    const color = topicNodeColor(n, colorMode);
    return {
      id: n.id,
      label: n.label,
      shape: KIND_SHAPE[n.category] || "dot",
      size: 14 + Math.min((n.count || 1) * 1.5, 24),
      mass: 2 + Math.min((n.count || 1) / 8, 4),
      color: {
        background: color + "2e",
        border: color,
        highlight: { background: color + "55", border: textColor },
        hover: { background: color + "44", border: color },
      },
      font: {
        size: 15 + Math.min(n.count || 1, 22) * 0.45,
        color: textColor,
        face: "sans-serif",
      },
    };
  }
  if (!n.solved) {
    return {
      id: n.id,
      label: n.label,
      size: 6,
      color: {
        background: n.color + "1f",
        border: n.color + "66",
        highlight: { background: n.color + "44", border: textColor },
        hover: { background: n.color + "33", border: n.color },
      },
      shapeProperties: { borderDashes: [3, 3] },
      font: { size: 8, color: textColor + "66", face: "sans-serif" },
    };
  }
  const ring = n.platformColor || PLATFORM_COLOR[n.platform] || "#64748b";
  return {
    id: n.id,
    label: n.label,
    size: n.isMultiPlatform ? 11 : 9,
    borderWidth: n.isMultiPlatform ? 3 : 1.5,
    color: {
      background: n.color,
      border: ring,
      highlight: { background: n.color, border: textColor },
      hover: { background: n.color, border: textColor + "aa" },
    },
    font: { size: 9, color: textColor + "99", face: "sans-serif" },
  };
}

function toVisEdge(e, topicColorById) {
  const style = EDGE_STYLE[e.type] || EDGE_STYLE["topic-problem"];
  const solid =
    e.type === "topic-problem" ? topicColorById.get(e.source) || "#64748b" : style.color;
  const color = e.type === "topic-problem" ? solid + "44" : style.color;
  // Resting edges stay faint; selecting a node lights its edges at full
  // strength, so the selected node's connections are the ones that read.
  const highlight = e.type === "topic-problem" ? solid : style.highlight || style.color;
  return {
    id: `${e.source}->${e.target}:${e.type}`,
    from: e.source,
    to: e.target,
    width: style.width,
    dashes: style.dashes,
    color: { color, highlight, hover: highlight },
    _type: e.type,
  };
}

const DIFF_BADGE = {
  Easy: "bg-emerald-500/20 text-emerald-400",
  Medium: "bg-amber-500/20 text-amber-400",
  Hard: "bg-rose-500/20 text-rose-400",
};

/* ── Component ───────────────────────────────────────────────────────── */
export function GraphView({
  problems,
  settings = null,
  focusProblem = null,
  onFocusProblemHandled = null,
  onProblemDelete = null,
  onProblemUpdate = null,
  onNavigate = null,
}) {
  const rootRef = useRef(null);
  const containerRef = useRef(null);
  const networkRef = useRef(null);
  const dataRef = useRef({ nodes: null, edges: null }); // vis DataSets
  const graphRef = useRef({ nodes: [], edges: [], byId: new Map() });
  const visReadyRef = useRef(false);
  const stabilizedRef = useRef(false);
  const pendingFocusRef = useRef(null); // { nodeId, openModal }
  const restoredFromUrlRef = useRef(false); // ?problem=/?sel= consumed once, at load
  // Captured at mount: the URL write-back effect runs with selectedId still
  // null before the graph has built, wiping ?sel= — so the restore effect
  // must read this snapshot, never the live URL.
  const initialSelRef = useRef(getQueryParam("sel"));
  const visibleSigRef = useRef(null); // fingerprint of the visible set → resettle on change
  const visibleSetRef = useRef(null); // the ids behind the fingerprint, for delta sizing
  const settledIdsRef = useRef(new Set()); // ids that have been through a completed settle
  const filterResettleRef = useRef(false); // the running stabilize came from a filter change
  const selectedIdRef = useRef(null); // for the stabilization handler, which outlives renders

  const [selectedId, setSelectedId] = useState(null);
  const [modalNode, setModalNode] = useState(null);
  const [modalVersion, setModalVersion] = useState(null); // specific platform version picked inside the modal
  const [search, setSearch] = useState("");
  // Filters and selection live in the URL (g-prefixed to stay clear of the
  // other tabs' params), so a reload — or a link pasted from elsewhere —
  // lands on the same view.
  const [hiddenTopics, setHiddenTopics] = useState(() => {
    const raw = getQueryParam("ghide", "");
    return new Set(raw ? raw.split("|").filter(Boolean) : []);
  });
  const [filterDifficulty, setFilterDifficulty] = useState(() => getQueryParam("gdiff", "All"));
  const [filterPlatform, setFilterPlatform] = useState(() => getQueryParam("gplat", "All"));
  const [filterTopic, setFilterTopic] = useState(() => getQueryParam("gtopic", "All"));
  const [filterKind, setFilterKind] = useState(() => getQueryParam("gkind", "All"));
  const [solvedOnly, setSolvedOnly] = useState(() => getQueryParam("gsolved", "1") !== "0");
  const [canonicalOnly, setCanonicalOnly] = useState(() => getQueryParam("gcanon", "0") === "1");
  const [legendOpen, setLegendOpen] = useState(() => getQueryParam("gleg", "0") === "1");
  const initColor = getQueryParam("graphColor", "topic");
  const [colorMode, setColorMode] = useState(initColor === "mastery" ? "mastery" : "topic");
  const [stats, setStats] = useState({ topics: 0, solved: 0, suggested: 0, links: 0 });
  const [settling, setSettling] = useState(0); // 0..1 stabilization progress, 1 = done
  const [isNarrow, setIsNarrow] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [graphEpoch, setGraphEpoch] = useState(0); // bumps when graph data rebuilds

  // Map from original per-platform node ID → raw problem object, so the modal
  // can show every platform version of a merged canonical node.
  const rawProblemByNodeId = useMemo(() => {
    const map = new Map();
    for (const p of problems || []) {
      map.set(`problem:${p.platform}:${p.titleSlug || p.id}`, p);
    }
    return map;
  }, [problems]);

  // The raw problem the details modal shows: an explicitly chosen version, or
  // the most recent version of the (possibly merged canonical) node.
  const modalProblem = useMemo(() => {
    if (modalVersion) return modalVersion;
    if (!modalNode) return null;
    const raws = (modalNode.mergedProblemIds || [modalNode.id])
      .map((id) => rawProblemByNodeId.get(id))
      .filter(Boolean);
    if (!raws.length) return null;
    return raws.reduce((a, b) => ((b.timestamp || 0) > (a.timestamp || 0) ? b : a));
  }, [modalNode, modalVersion, rawProblemByNodeId]);

  /* ── Focus (the "show me where it is" move) ─────────────────────── */
  const focusNode = useCallback((nodeId, { openModal = false, select = true } = {}) => {
    const network = networkRef.current;
    const node = graphRef.current.byId.get(nodeId);
    if (!network || !node) return;
    if (!stabilizedRef.current) {
      pendingFocusRef.current = { nodeId, openModal };
      return;
    }
    const scale = Math.max(1.1, Math.min(network.getScale(), 2));
    network.focus(nodeId, {
      scale,
      animation: { duration: 650, easingFunction: "easeInOutQuad" },
    });
    if (select) {
      network.selectNodes([nodeId]);
      setSelectedId(nodeId);
    }
    if (openModal && node.type === "problem" && node.solved) {
      setModalVersion(null);
      setModalNode(node);
    }
  }, []);
  const focusNodeRef = useRef(focusNode);
  focusNodeRef.current = focusNode;
  selectedIdRef.current = selectedId;

  /* ── Filters → hidden flags on the vis DataSet ──────────────────── */
  const applyFilters = useCallback(() => {
    const ds = dataRef.current.nodes;
    if (!ds) return;
    const { nodes, edges } = graphRef.current;

    // Which taxonomy axis each topic label sits on, for the kind filter.
    const kindByLabel = new Map();
    for (const n of nodes) {
      if (n.type === "topic") kindByLabel.set(n.label, n.category || KIND.DOMAIN);
    }

    // Every active filter must pass — they compose as AND, independently.
    const problemVisible = new Map();
    for (const n of nodes) {
      if (n.type !== "problem") continue;
      let visible = true;
      if (solvedOnly && !n.solved) visible = false;
      if (visible && canonicalOnly && !n.hasCanonical) visible = false;
      if (
        visible &&
        filterDifficulty !== "All" &&
        String(n.difficulty || "Unknown") !== filterDifficulty
      )
        visible = false;
      if (visible && filterPlatform !== "All") {
        const platforms = n.platforms?.length ? n.platforms : [n.platform];
        if (!platforms.includes(filterPlatform)) visible = false;
      }
      if (
        visible &&
        filterTopic !== "All" &&
        !(n.tags || []).includes(filterTopic) &&
        n.topic !== filterTopic
      )
        visible = false;
      if (visible && filterKind !== "All") {
        const tags = n.tags?.length ? n.tags : [n.topic];
        if (!tags.some((t) => kindByLabel.get(t) === filterKind)) visible = false;
      }
      if (visible && hiddenTopics.size) {
        const tags = n.tags?.length ? n.tags : [n.topic];
        if (tags.every((t) => hiddenTopics.has(t))) visible = false;
      }
      problemVisible.set(n.id, visible);
    }

    // A topic stays on the map only while it still shows a problem.
    const topicHasVisible = new Map();
    for (const e of edges) {
      if (e.type !== "topic-problem") continue;
      const topicId = e.source.startsWith("topic:") ? e.source : e.target;
      const problemId = topicId === e.source ? e.target : e.source;
      if (problemVisible.get(problemId)) topicHasVisible.set(topicId, true);
    }

    const updates = [];
    let visSolved = 0;
    let visSuggested = 0;
    let visTopics = 0;
    for (const n of nodes) {
      let visible;
      if (n.type === "topic") {
        visible =
          !hiddenTopics.has(n.label) &&
          (filterTopic === "All" || n.label === filterTopic) &&
          (filterKind === "All" || (n.category || KIND.DOMAIN) === filterKind) &&
          !!topicHasVisible.get(n.id);
        if (visible) visTopics++;
      } else {
        visible = !!problemVisible.get(n.id);
        if (visible) n.solved ? visSolved++ : visSuggested++;
      }
      // Hidden nodes still pull on the layout unless they leave the physics
      // simulation too — that invisible drag is what shoved filtered views
      // off to one side.
      updates.push({ id: n.id, hidden: !visible, physics: visible });
    }
    ds.update(updates);

    const visibleIds = new Set(updates.filter((u) => !u.hidden).map((u) => u.id));
    dataRef.current.edges?.update(
      edges.map((e) => ({
        id: `${e.source}->${e.target}:${e.type}`,
        physics: visibleIds.has(e.source) && visibleIds.has(e.target),
      })),
    );
    const links = edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)).length;
    setStats({ topics: visTopics, solved: visSolved, suggested: visSuggested, links });

    // When the visible set changes a lot, let the survivors re-spread and
    // recentre — otherwise the layout keeps the shape the hidden rest of the
    // graph gave it. Small deltas skip the reheat entirely: hiding or restoring
    // a handful of nodes doesn't need a re-spread, and every forceAtlas2 pass
    // is free to spin the whole map, so toggling a tiny group used to rotate
    // the graph. The only small delta that still earns a reheat is revealing a
    // node that has never been through a settle — it has no real position yet.
    const sig = [...visibleIds].sort().join("|");
    const network = networkRef.current;
    if (
      visibleSigRef.current !== null &&
      sig !== visibleSigRef.current &&
      network &&
      stabilizedRef.current
    ) {
      const prev = visibleSetRef.current || new Set();
      let delta = 0;
      for (const id of visibleIds) if (!prev.has(id)) delta++;
      for (const id of prev) if (!visibleIds.has(id)) delta++;
      const allSettled = [...visibleIds].every((id) => settledIdsRef.current.has(id));
      if (delta > 8 || !allSettled) {
        filterResettleRef.current = true;
        stabilizedRef.current = false;
        setSettling(0);
        network.setOptions({ physics: { enabled: true } });
        network.stabilize(120);
      }
    }
    visibleSigRef.current = sig;
    visibleSetRef.current = visibleIds;
  }, [
    solvedOnly,
    canonicalOnly,
    filterDifficulty,
    filterPlatform,
    filterTopic,
    filterKind,
    hiddenTopics,
    graphEpoch,
  ]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  /* ── Create the network once, lazily loading the vendored bundle ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const vis = await import("../../vendor/vis-network-bundle.js");
      if (cancelled || !containerRef.current) return;

      const nodesDS = new vis.DataSet([]);
      const edgesDS = new vis.DataSet([]);
      dataRef.current = { nodes: nodesDS, edges: edgesDS };

      const network = new vis.Network(
        containerRef.current,
        { nodes: nodesDS, edges: edgesDS },
        VIS_OPTIONS,
      );
      networkRef.current = network;

      network.on("stabilizationProgress", (params) => {
        setSettling(params.iterations / params.total);
      });
      network.on("stabilizationIterationsDone", () => {
        network.setOptions({ physics: { enabled: false } });
        stabilizedRef.current = true;
        setSettling(1);
        // Everything visible now owns a real, settled position.
        const ds = dataRef.current.nodes;
        if (ds) {
          for (const n of ds.get()) if (!n.hidden) settledIdsRef.current.add(n.id);
        }
        const pending = pendingFocusRef.current;
        const fromFilters = filterResettleRef.current;
        filterResettleRef.current = false;
        const sel = selectedIdRef.current;
        if (pending) {
          pendingFocusRef.current = null;
          focusNodeRef.current(pending.nodeId, { openModal: pending.openModal });
        } else if (fromFilters && sel && ds?.get(sel) && !ds.get(sel).hidden) {
          // A filter resettle must not yank a zoomed-in camera back to full
          // screen — follow the selected node to wherever it settled instead.
          network.focus(sel, {
            scale: network.getScale(),
            animation: { duration: 450, easingFunction: "easeInOutQuad" },
          });
        } else if (dataRef.current.nodes?.length) {
          // A manual stabilize() ends without the load-time auto-fit, so the
          // camera would still be parked at the origin — bring the graph in.
          network.fit({ animation: { duration: 400, easingFunction: "easeInOutQuad" } });
        }
      });
      network.on("click", (params) => {
        if (params.nodes.length > 0) {
          setSelectedId(params.nodes[0]);
        } else {
          setSelectedId(null);
        }
      });
      network.on("doubleClick", (params) => {
        if (!params.nodes.length) return;
        const node = graphRef.current.byId.get(params.nodes[0]);
        if (node?.type === "problem" && node.solved) {
          setModalVersion(null);
          setModalNode(node);
        }
      });
      network.on("hoverNode", () => {
        containerRef.current.style.cursor = "pointer";
      });
      network.on("blurNode", () => {
        containerRef.current.style.cursor = "default";
      });

      visReadyRef.current = true;
      setGraphEpoch((e) => e + 1); // trigger the data-load effect below
    })().catch((err) => dbg.error("Failed to load graph engine:", err));

    return () => {
      cancelled = true;
      visReadyRef.current = false;
      networkRef.current?.destroy();
      networkRef.current = null;
    };
  }, []);

  /* ── (Re)build graph data when problems change ──────────────────── */
  useEffect(() => {
    if (!visReadyRef.current || !dataRef.current.nodes) return;
    const { nodes, edges } = buildKnowledgeGraph(
      problems || [],
      settings?.topicMappings,
      settings?.topicKinds,
      masteryOptsFromSettings(settings),
    );
    for (const n of nodes) {
      if (n.type === "topic" && n.paletteColor === undefined) n.paletteColor = n.color;
    }
    graphRef.current = { nodes, edges, byId: new Map(nodes.map((n) => [n.id, n])) };

    const textColor = cssVar("--cl-text", "#e2e8f0");
    const topicColorById = new Map(
      nodes.filter((n) => n.type === "topic").map((n) => [n.id, topicNodeColor(n, colorMode)]),
    );

    dataRef.current.nodes.clear();
    dataRef.current.edges.clear();
    dataRef.current.nodes.add(nodes.map((n) => toVisNode(n, { colorMode, textColor })));
    dataRef.current.edges.add(edges.map((e) => toVisEdge(e, topicColorById)));

    // setData-less rebuild: reheat physics so the new set settles, then freeze.
    settledIdsRef.current = new Set();
    filterResettleRef.current = false;
    stabilizedRef.current = false;
    setSettling(0);
    networkRef.current.setOptions({ physics: { enabled: true } });
    networkRef.current.stabilize(250);
    setGraphEpoch((e) => e + 1);
    // graphEpoch is the build counter; adding it as a dependency would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problems, settings, visReadyRef.current]);

  /* ── Recolour topics in place when the colour mode flips ────────── */
  useEffect(() => {
    const ds = dataRef.current.nodes;
    if (!ds) return;
    const textColor = cssVar("--cl-text", "#e2e8f0");
    const topicNodes = graphRef.current.nodes.filter((n) => n.type === "topic");
    ds.update(topicNodes.map((n) => toVisNode(n, { colorMode, textColor })));
    const topicColorById = new Map(topicNodes.map((n) => [n.id, topicNodeColor(n, colorMode)]));
    const edgeUpdates = graphRef.current.edges
      .filter((e) => e.type === "topic-problem")
      .map((e) => {
        const solid = topicColorById.get(e.source) || "#64748b";
        return {
          id: `${e.source}->${e.target}:${e.type}`,
          color: { color: solid + "44", highlight: solid, hover: solid },
        };
      });
    dataRef.current.edges?.update(edgeUpdates);
  }, [colorMode]);

  /* ── Deep links: focusProblem prop and ?problem= URL param ──────── */
  const findProblemNode = useCallback((idOrSlug, platform = null) => {
    if (!idOrSlug) return null;
    return graphRef.current.nodes.find(
      (n) =>
        n.type === "problem" &&
        (n.id === idOrSlug ||
          n.titleSlug === idOrSlug ||
          (platform && n.platform === platform && n.titleSlug === idOrSlug) ||
          (n.mergedProblemIds &&
            n.mergedProblemIds.some(
              (mid) => mid === idOrSlug || mid.split(":").pop() === idOrSlug,
            ))),
    );
  }, []);

  // Arriving from a problem modal's Graph button (or any ?problem= link)
  // zooms to the node and points at it — it does not reopen the modal the
  // user just left. From then on ?sel= carries the selection, so a reload
  // lands back on the same spot.
  useEffect(() => {
    if (!focusProblem || !graphRef.current.nodes.length) return;
    restoredFromUrlRef.current = true;
    const match = findProblemNode(focusProblem.titleSlug || focusProblem.id, focusProblem.platform);
    if (match) revealAndFocus(match.id);
    onFocusProblemHandled?.();
  }, [focusProblem, graphEpoch]);

  useEffect(() => {
    if (restoredFromUrlRef.current || focusProblem || !graphRef.current.nodes.length) return;
    const problemId = getQueryParam("problem");
    if (problemId) {
      const match = findProblemNode(problemId);
      if (match) {
        restoredFromUrlRef.current = true;
        revealAndFocus(match.id);
        updateQueryParams({ problem: null }); // consumed — ?sel= takes over
        return;
      }
    }
    const sel = initialSelRef.current;
    if (sel && graphRef.current.byId.has(sel)) {
      restoredFromUrlRef.current = true;
      revealAndFocus(sel);
    }
  }, [graphEpoch]);

  /* ── Everything on the URL: reload lands on the same view ───────── */
  useEffect(() => {
    updateQueryParams({
      gdiff: filterDifficulty === "All" ? null : filterDifficulty,
      gplat: filterPlatform === "All" ? null : filterPlatform,
      gtopic: filterTopic === "All" ? null : filterTopic,
      gkind: filterKind === "All" ? null : filterKind,
      gsolved: solvedOnly ? null : "0",
      gcanon: canonicalOnly ? "1" : null,
      ghide: hiddenTopics.size ? [...hiddenTopics].join("|") : null,
      gleg: legendOpen ? "1" : null,
      sel: selectedId || null,
    });
  }, [
    filterDifficulty,
    filterPlatform,
    filterTopic,
    filterKind,
    solvedOnly,
    canonicalOnly,
    hiddenTopics,
    legendOpen,
    selectedId,
  ]);

  /* ── Responsive: watch the container, not the window ────────────── */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setIsNarrow(width < 700);
      const network = networkRef.current;
      if (network && width && height) {
        const sidebarW = width >= 700 ? 280 : 0;
        network.setSize(`${Math.max(width - sidebarW, 50)}px`, `${height}px`);
        network.redraw();
      }
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  /* ── Derived UI data ─────────────────────────────────────────────── */
  const selected = selectedId ? graphRef.current.byId.get(selectedId) : null;

  const topicLegend = useMemo(() => {
    return graphRef.current.nodes
      .filter((n) => n.type === "topic")
      .sort((a, b) => (b.count || 0) - (a.count || 0) || a.label.localeCompare(b.label));
  }, [graphEpoch, colorMode]);

  // The same topics, split by taxonomy axis so "Array" (a container everyone
  // touches) never buries "Binary Search" (the signal) in one flat list.
  const topicLegendGroups = useMemo(() => {
    const groups = new Map(KIND_ORDER.map((k) => [k, []]));
    for (const t of topicLegend) {
      const kind = groups.has(t.category) ? t.category : KIND.DOMAIN;
      groups.get(kind).push(t);
    }
    return KIND_ORDER.map((kind) => ({ kind, topics: groups.get(kind) })).filter(
      (g) => g.topics.length,
    );
  }, [topicLegend]);

  // The platform filter lists what the ledger actually contains — a hardcoded
  // list missed neetcode and takeuforward. A platform restored from the URL
  // stays listed even if its problems are gone, so the select shows the truth.
  const platformOptions = useMemo(() => {
    const present = new Set();
    for (const n of graphRef.current.nodes) {
      if (n.type !== "problem") continue;
      for (const p of n.platforms?.length ? n.platforms : [n.platform]) if (p) present.add(p);
    }
    if (filterPlatform !== "All") present.add(filterPlatform);
    return [...present].sort((a, b) =>
      (PLATFORM_LABEL[a] || a).localeCompare(PLATFORM_LABEL[b] || b),
    );
  }, [graphEpoch, filterPlatform]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    // How well the name itself matches beats what kind of node it is:
    // an exact title, then a title starting with the query, then a word
    // inside it starting with the query, then any substring, and only
    // then matches that live in the tags/platform metadata.
    const matchRank = (n) => {
      const label = String(n.label || "").toLowerCase();
      if (label === q) return 0;
      if (label.startsWith(q)) return 1;
      if (label.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 2;
      if (label.includes(q)) return 3;
      return 4;
    };
    const typeRank = (n) => (n.type === "topic" ? 0 : n.solved ? 1 : 2);
    return graphRef.current.nodes
      .filter((n) => {
        const hay =
          `${n.label || ""} ${(n.tags || []).join(" ")} ${n.platform || ""} ${n.difficulty || ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort(
        (a, b) =>
          matchRank(a) - matchRank(b) ||
          typeRank(a) - typeRank(b) ||
          String(a.label).localeCompare(String(b.label)),
      )
      .slice(0, 30);
  }, [search, graphEpoch]);

  // Zoom means nothing if the target is filtered out — reveal it first. A
  // reveal changes filters, and the resettle that follows would stomp an
  // immediate zoom, so the focus is queued and runs once the layout freezes.
  const revealAndFocus = useCallback(
    (nodeId) => {
      const visNode = dataRef.current.nodes?.get(nodeId);
      if (visNode?.hidden) {
        setFilterDifficulty("All");
        setFilterPlatform("All");
        setFilterTopic("All");
        setFilterKind("All");
        setCanonicalOnly(false);
        setHiddenTopics(new Set());
        const node = graphRef.current.byId.get(nodeId);
        if (node?.type === "problem" && !node.solved) setSolvedOnly(false);
        pendingFocusRef.current = { nodeId, openModal: false };
        return;
      }
      focusNode(nodeId);
    },
    [focusNode],
  );

  const toggleTopicHidden = useCallback((label) => {
    setHiddenTopics((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  // Header click hides or shows a whole axis at once: if any topic in the
  // group is still visible, hide them all; otherwise bring them all back.
  const toggleKindHidden = useCallback((labels) => {
    setHiddenTopics((prev) => {
      const next = new Set(prev);
      const anyVisible = labels.some((l) => !next.has(l));
      for (const l of labels) {
        if (anyVisible) next.add(l);
        else next.delete(l);
      }
      return next;
    });
  }, []);

  const fitView = useCallback(() => {
    networkRef.current?.fit({ animation: { duration: 500, easingFunction: "easeInOutQuad" } });
  }, []);

  // Sidebar rows zoom to their group: the topic hub plus every problem still
  // visible on it. An axis header passes all its topic ids at once.
  const zoomToGroup = useCallback((topicIds, selectId = null) => {
    const network = networkRef.current;
    const ds = dataRef.current.nodes;
    if (!network || !ds) return;
    const ids = new Set();
    for (const tid of topicIds) {
      const topicNode = ds.get(tid);
      if (topicNode && !topicNode.hidden) ids.add(tid);
      let neighborIds = [];
      try {
        neighborIds = network.getConnectedNodes(tid) || [];
      } catch {
        continue;
      }
      for (const nid of neighborIds) {
        const neighbor = ds.get(nid);
        if (neighbor && !neighbor.hidden) ids.add(nid);
      }
    }
    if (!ids.size) return;
    network.fit({
      nodes: [...ids],
      animation: { duration: 600, easingFunction: "easeInOutQuad" },
    });
    if (selectId && ids.has(selectId)) {
      network.selectNodes([selectId]);
      setSelectedId(selectId);
    }
  }, []);

  const zoomBy = useCallback((factor) => {
    const network = networkRef.current;
    if (!network) return;
    network.moveTo({
      scale: Math.min(Math.max(network.getScale() * factor, 0.05), 5),
      animation: { duration: 200, easingFunction: "easeInOutQuad" },
    });
  }, []);

  const reLayout = useCallback(() => {
    const network = networkRef.current;
    if (!network) return;
    // Hidden nodes sit out the re-run, so their remembered positions belong to
    // the old layout — a later reveal must earn a fresh settle, not reuse them.
    settledIdsRef.current = new Set();
    filterResettleRef.current = false;
    stabilizedRef.current = false;
    setSettling(0);
    network.setOptions({ physics: { enabled: true } });
    network.stabilize(250);
  }, []);

  const openModalForNode = useCallback((node) => {
    if (node?.type !== "problem" || !node.solved) return;
    setModalVersion(null);
    setModalNode(node);
  }, []);

  const closeModal = useCallback(() => {
    setModalNode(null);
    setModalVersion(null);
  }, []);

  const anyFilterActive =
    filterDifficulty !== "All" ||
    filterPlatform !== "All" ||
    filterTopic !== "All" ||
    filterKind !== "All" ||
    canonicalOnly ||
    !solvedOnly ||
    hiddenTopics.size > 0;

  /* ── Sidebar pieces ─────────────────────────────────────────────── */

  function NeighborList({ node }) {
    const network = networkRef.current;
    if (!network) return null;
    let neighborIds = [];
    try {
      neighborIds = network.getConnectedNodes(node.id) || [];
    } catch {
      return null;
    }
    const ds = dataRef.current.nodes;
    const neighbors = neighborIds
      .map((id) => graphRef.current.byId.get(id))
      .filter((n) => n && !ds?.get(n.id)?.hidden)
      .sort((a, b) => (a.type === "topic" ? -1 : 1) - (b.type === "topic" ? -1 : 1));
    if (!neighbors.length) return null;
    return html`
      <div class="mt-2">
        <div class="text-[10px] uppercase tracking-wider text-slate-600 mb-1">
          Connected (${neighbors.length})
        </div>
        <div class="flex flex-col gap-0.5 pr-1">
          ${neighbors.map((nb) => {
            const color =
              nb.type === "topic" ? topicNodeColor(nb, colorMode) : nb.color || "#64748b";
            return html`
              <button
                onClick=${() => focusNode(nb.id)}
                class="text-left px-2 py-1 rounded text-[11px] text-slate-300 hover:bg-white/10 transition-colors truncate"
                style=${{ borderLeft: `3px solid ${color}` }}
                title=${nb.label}
              >
                ${nb.label}
              </button>
            `;
          })}
        </div>
      </div>
    `;
  }

  function TopicInfo({ node }) {
    const ds = dataRef.current.nodes;
    const topicProblems = graphRef.current.nodes
      .filter(
        (n) =>
          n.type === "problem" &&
          ((n.tags || []).includes(node.label) || n.topic === node.label) &&
          !ds?.get(n.id)?.hidden,
      )
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return html`
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <span
            class="w-3 h-3 shrink-0 ${node.category === KIND.DS ? "rotate-45" : "rounded-full"}"
            style=${{ background: topicNodeColor(node, colorMode) }}
          ></span>
          <span class="text-sm font-semibold text-white leading-snug flex-1">${node.label}</span>
          ${KIND_LABEL[node.category]
            ? html`<span
                class="px-1.5 py-0.5 rounded text-[9px] shrink-0 border ${node.category ===
                KIND.ALGO
                  ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-300"
                  : node.category === KIND.DS
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-300/90"
                    : "bg-white/5 border-white/10 text-slate-400"}"
                >${KIND_LABEL[node.category]}</span
              >`
            : ""}
        </div>
        <div class="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
          <span>${node.solveCount || 0} solved</span>
          ${node.daysSince !== null && node.daysSince !== undefined
            ? html`<span
                >${`· last ${
                  node.daysSince === 0
                    ? "today"
                    : node.daysSince === 1
                      ? "yesterday"
                      : `${node.daysSince}d ago`
                }`}</span
              >`
            : ""}
          ${node.band
            ? html`<span style=${{ color: BAND_COLOR[node.band] || BAND_COLOR.untouched }}
                >${BAND_LABEL[node.band] || ""}</span
              >`
            : ""}
        </div>
        ${topicProblems.length
          ? html`
              <div class="mt-1 border-t border-white/5 pt-2">
                <div class="text-[10px] uppercase tracking-wider text-slate-600 mb-1">
                  Problems (${topicProblems.length})
                </div>
                <div class="flex flex-col gap-0.5 pr-1">
                  ${topicProblems.map(
                    (p) => html`
                      <button
                        onClick=${() => focusNode(p.id)}
                        class="text-left px-2 py-1 rounded text-[11px] text-slate-300 hover:bg-white/10 transition-colors truncate"
                        style=${{ borderLeft: `3px solid ${p.color || "#64748b"}` }}
                        title=${p.label}
                      >
                        ${p.label}
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

  function ProblemInfo({ node }) {
    const versions = (node.mergedProblemIds || [node.id])
      .map((id) => ({ id, raw: rawProblemByNodeId.get(id) }))
      .filter((v) => v.raw);
    const diffClass = DIFF_BADGE[node.difficulty] || "bg-slate-500/20 text-slate-400";
    return html`
      <div class="flex flex-col gap-2">
        <span class="text-sm font-semibold text-white leading-snug">${node.label}</span>
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="px-1.5 py-0.5 rounded text-[10px] font-medium ${diffClass}"
            >${node.difficulty || "?"}</span
          >
          <span class="text-[10px] ${node.solved ? "text-emerald-400" : "text-slate-500"}"
            >${node.solved ? "✓ Solved" : "○ Suggested"}</span
          >
          ${node.hasCanonical
            ? html`<span
                class="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400"
                title="Linked across platforms through the canonical map"
                >⬡ canonical</span
              >`
            : ""}
        </div>
        ${versions.length
          ? html`
              <div class="flex flex-col gap-1 mt-0.5">
                ${versions.map(({ raw }) => {
                  const url = raw.titleSlug
                    ? CONSTANTS.makeProblemUrl(raw.platform, raw.titleSlug)
                    : null;
                  const favicon = PLATFORM_FAVICON[raw.platform];
                  return html`
                    <a
                      href=${url}
                      target="_blank"
                      rel="noopener"
                      class="flex items-center gap-2 px-2 py-1 rounded bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-colors text-[11px] text-slate-300"
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
                      <span class="flex-1 truncate"
                        >${PLATFORM_LABEL[raw.platform] || raw.platform}</span
                      >
                      ${raw.timestamp
                        ? html`<span class="text-slate-500"
                            >${new Date(
                              raw.timestamp < 1e10 ? raw.timestamp * 1000 : raw.timestamp,
                            ).toLocaleDateString()}</span
                          >`
                        : ""}
                      <span class="text-cyan-500/70">↗</span>
                    </a>
                  `;
                })}
              </div>
            `
          : !node.solved && node.titleSlug
            ? html`
                <a
                  href=${CONSTANTS.makeProblemUrl(node.platform || "leetcode", node.titleSlug)}
                  target="_blank"
                  rel="noopener"
                  class="text-[11px] text-cyan-400 hover:text-cyan-300"
                  >Open on ${PLATFORM_LABEL[node.platform] || node.platform} ↗</a
                >
              `
            : ""}
        ${node.tags?.length
          ? html`
              <div class="flex flex-wrap gap-1">
                ${node.tags.map(
                  (t) => html`
                    <button
                      onClick=${() => focusNode(`topic:${t}`)}
                      class="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] text-slate-400 hover:text-cyan-300 hover:border-cyan-500/30 transition-colors"
                    >
                      ${t}
                    </button>
                  `,
                )}
              </div>
            `
          : ""}
        ${node.solved
          ? html`
              <button
                onClick=${() => openModalForNode(node)}
                class="mt-1 text-[11px] px-2 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
              >
                Open details${versions.length > 1 ? ` (${versions.length} versions)` : ""}
              </button>
            `
          : ""}
        <${NeighborList} node=${node} />
      </div>
    `;
  }

  const sidebar = html`
    <div
      class="${isNarrow
        ? "absolute top-0 right-0 bottom-0 z-30 shadow-2xl"
        : "shrink-0"} w-[280px] min-w-[280px] max-w-[280px] overflow-hidden flex flex-col border-l border-white/10 bg-[#0d1117]/95 backdrop-blur"
    >
      <!-- Search -->
      <div class="p-3 border-b border-white/10">
        <div class="relative">
          <input
            placeholder="Search problems and topics…"
            value=${search}
            onInput=${(e) => setSearch(e.target.value)}
            onKeyDown=${(e) => {
              if (e.key === "Enter" && searchResults.length) {
                revealAndFocus(searchResults[0].id);
                setSearch("");
              } else if (e.key === "Escape") {
                setSearch("");
              }
            }}
            class="w-full pl-2.5 pr-7 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs text-white outline-none focus:border-cyan-500/50"
          />
          ${search
            ? html`
                <button
                  onClick=${() => setSearch("")}
                  class="absolute right-1.5 top-1/2 -translate-y-1/2 px-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                  title="Clear search"
                >
                  ✕
                </button>
              `
            : ""}
        </div>
        ${search && searchResults.length
          ? html`
              <div class="mt-2 max-h-44 overflow-y-auto flex flex-col gap-0.5">
                ${searchResults.map((n) => {
                  const color =
                    n.type === "topic" ? topicNodeColor(n, colorMode) : n.color || "#64748b";
                  const isHidden = !!dataRef.current.nodes?.get(n.id)?.hidden;
                  return html`
                    <button
                      onClick=${() => {
                        revealAndFocus(n.id);
                        setSearch("");
                      }}
                      class="text-left px-2 py-1 rounded text-[11px] text-slate-200 hover:bg-white/10 transition-colors truncate"
                      style=${{ borderLeft: `3px solid ${color}` }}
                      title=${isHidden
                        ? `${n.label} — hidden by filters; click to reveal`
                        : n.label}
                    >
                      ${n.label}
                      <span class="text-slate-500">
                        ${` · ${
                          n.type === "topic"
                            ? "topic"
                            : `${n.difficulty || "?"}${n.solved ? "" : " · suggested"}`
                        }${isHidden ? " · filtered" : ""}`}
                      </span>
                    </button>
                  `;
                })}
              </div>
            `
          : search
            ? html`<div class="mt-2 text-[11px] text-slate-600 px-1">No matches.</div>`
            : ""}
      </div>

      <!-- Node info: one scrolling unit — the lists inside never compress -->
      <div
        class="p-3 border-b border-white/10 min-h-[110px] max-h-[45%] overflow-y-auto overscroll-contain"
      >
        ${selected
          ? selected.type === "topic"
            ? html`<${TopicInfo} node=${selected} />`
            : html`<${ProblemInfo} node=${selected} />`
          : html`<div class="text-[11px] text-slate-600 italic">
              Click a node to inspect it. Double-click a problem for full details.
            </div>`}
      </div>

      <!-- Topic legend, split by axis: algorithms carry the signal, data
           structures are the near-universal containers, so they never share
           one flat list. Header click toggles the whole axis. -->
      <div class="flex-1 overflow-y-auto p-3 min-h-[80px]">
        ${topicLegendGroups.map((group) => {
          const labels = group.topics.map((t) => t.label);
          const allHidden = labels.every((l) => hiddenTopics.has(l));
          return html`
            <div class="mb-2">
              <div
                class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-1 transition-colors ${allHidden
                  ? "text-slate-700"
                  : group.kind === KIND.ALGO
                    ? "text-cyan-500/70 hover:text-cyan-400"
                    : group.kind === KIND.DS
                      ? "text-amber-500/60 hover:text-amber-400"
                      : "text-slate-600 hover:text-slate-400"}"
              >
                <span
                  class="flex-1 flex items-center gap-1.5 cursor-pointer"
                  onClick=${() =>
                    zoomToGroup(
                      group.topics.filter((t) => !hiddenTopics.has(t.label)).map((t) => t.id),
                    )}
                  title="Zoom in on this whole axis"
                >
                  <span class="w-2 text-center"
                    >${group.kind === KIND.DS ? "◆" : group.kind === KIND.DOMAIN ? "⬡" : "●"}</span
                  >
                  <span>${KIND_LABEL_PLURAL[group.kind]}</span>
                  <span class="normal-case tracking-normal">${group.topics.length}</span>
                </span>
                <button
                  onClick=${(e) => {
                    e.stopPropagation();
                    toggleKindHidden(labels);
                  }}
                  class="shrink-0 normal-case tracking-normal text-[10px] px-1.5 py-0.5 rounded border transition-colors ${allHidden
                    ? "border-emerald-400/40 text-emerald-300/90 hover:bg-emerald-500/10"
                    : "border-white/10 text-slate-500 hover:text-rose-300 hover:border-rose-400/40"}"
                  title=${allHidden
                    ? "Bring this whole axis back"
                    : "Hide this whole axis from the graph"}
                >
                  ${allHidden ? "show all" : "hide all"}
                </button>
              </div>
              ${group.topics.map((t) => {
                const dimmed = hiddenTopics.has(t.label);
                return html`
                  <div
                    class="group flex items-center gap-2 py-0.5 rounded cursor-pointer hover:bg-white/5 transition-colors ${dimmed
                      ? "opacity-35"
                      : ""}"
                    onClick=${() =>
                      dimmed ? toggleTopicHidden(t.label) : zoomToGroup([t.id], t.id)}
                    title=${dimmed ? "Hidden — click to bring it back" : "Zoom in on this group"}
                  >
                    <span
                      class="w-2.5 h-2.5 shrink-0 ${group.kind === KIND.DS
                        ? "rotate-45"
                        : "rounded-full"}"
                      style=${{ background: topicNodeColor(t, colorMode) }}
                    ></span>
                    <span class="flex-1 text-[11px] text-slate-300 truncate">${t.label}</span>
                    <span class="text-[10px] text-slate-600">${t.solveCount || 0}</span>
                    <button
                      onClick=${(e) => {
                        e.stopPropagation();
                        toggleTopicHidden(t.label);
                      }}
                      class="shrink-0 text-[10px] px-1.5 py-0.5 rounded border transition-colors ${dimmed
                        ? "border-emerald-400/40 text-emerald-300/90 hover:bg-emerald-500/10"
                        : "border-white/10 text-slate-500 hover:text-rose-300 hover:border-rose-400/40"}"
                      title=${dimmed ? "Show this group again" : "Hide this group from the graph"}
                    >
                      ${dimmed ? "show" : "hide"}
                    </button>
                  </div>
                `;
              })}
            </div>
          `;
        })}
      </div>

      <!-- Filters -->
      <div class="p-3 border-t border-white/10 flex flex-col gap-2">
        <div class="flex gap-1.5">
          <select
            value=${filterDifficulty}
            onChange=${(e) => setFilterDifficulty(e.target.value)}
            class="flex-1 min-w-0 px-1.5 py-1 bg-black/40 border rounded text-[11px] ${filterDifficulty !==
            "All"
              ? "border-cyan-500/40 text-cyan-200"
              : "border-white/10 text-slate-300"}"
          >
            <option value="All">Difficulty</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
            <option value="Unknown">Unknown</option>
          </select>
          <select
            value=${filterPlatform}
            onChange=${(e) => setFilterPlatform(e.target.value)}
            class="flex-1 min-w-0 px-1.5 py-1 bg-black/40 border rounded text-[11px] ${filterPlatform !==
            "All"
              ? "border-cyan-500/40 text-cyan-200"
              : "border-white/10 text-slate-300"}"
          >
            <option value="All">Platform</option>
            ${platformOptions.map(
              (p) => html`<option value=${p}>${PLATFORM_LABEL[p] || p}</option>`,
            )}
          </select>
        </div>
        <select
          value=${filterTopic}
          onChange=${(e) => setFilterTopic(e.target.value)}
          class="w-full px-1.5 py-1 bg-black/40 border rounded text-[11px] ${filterTopic !== "All"
            ? "border-cyan-500/40 text-cyan-200"
            : "border-white/10 text-slate-300"}"
        >
          <option value="All">All topics</option>
          ${topicLegendGroups.map(
            (group) => html`
              <optgroup label=${KIND_LABEL_PLURAL[group.kind]}>
                ${group.topics.map((t) => html`<option value=${t.label}>${t.label}</option>`)}
              </optgroup>
            `,
          )}
        </select>
        <!-- Axis filter: only algorithms, only data structures, or everything -->
        <div class="flex rounded-lg border border-white/10 bg-black/40 p-0.5 text-[10px]">
          ${[
            { id: "All", label: "All" },
            ...KIND_ORDER.filter((k) => topicLegendGroups.some((g) => g.kind === k)).map((k) => ({
              id: k,
              label: KIND_SHORT[k],
            })),
          ].map(
            (opt) => html`
              <button
                onClick=${() => setFilterKind(opt.id)}
                class="flex-1 px-1 py-0.5 rounded-md transition-colors truncate ${filterKind ===
                opt.id
                  ? opt.id === KIND.DS
                    ? "bg-amber-500/15 text-amber-300"
                    : opt.id === KIND.ALGO
                      ? "bg-cyan-500/15 text-cyan-300"
                      : "bg-white/10 text-slate-200"
                  : "text-slate-500 hover:text-slate-300"}"
                title=${opt.id === "All"
                  ? "Both axes"
                  : `Only ${KIND_LABEL_PLURAL[opt.id].toLowerCase()}`}
              >
                ${opt.label}
              </button>
            `,
          )}
        </div>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked=${solvedOnly}
              onChange=${(e) => setSolvedOnly(e.target.checked)}
              class="accent-cyan-500"
            />
            Solved only
          </label>
          <label class="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked=${canonicalOnly}
              onChange=${(e) => setCanonicalOnly(e.target.checked)}
              class="accent-cyan-500"
            />
            Canonical only
          </label>
        </div>
        <div class="flex items-center gap-1.5">
          <div class="flex rounded-lg border border-white/10 bg-black/40 p-0.5 text-[10px]">
            ${GRAPH_COLOR_MODES.map(
              (mode) => html`
                <button
                  onClick=${() => {
                    setColorMode(mode.id);
                    updateQueryParams({ graphColor: mode.id });
                  }}
                  class="px-2 py-0.5 rounded-md transition-colors ${colorMode === mode.id
                    ? "bg-cyan-500/15 text-cyan-300"
                    : "text-slate-500 hover:text-slate-300"}"
                  title=${mode.id === "mastery"
                    ? "Colour topics by how well you hold them"
                    : "Give every topic its own colour"}
                >
                  ${mode.label}
                </button>
              `,
            )}
          </div>
          ${anyFilterActive
            ? html`
                <button
                  onClick=${() => {
                    setFilterDifficulty("All");
                    setFilterPlatform("All");
                    setFilterTopic("All");
                    setFilterKind("All");
                    setSolvedOnly(true);
                    setCanonicalOnly(false);
                    setHiddenTopics(new Set());
                  }}
                  class="text-[10px] px-2 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 transition-colors"
                >
                  Reset
                </button>
              `
            : ""}
        </div>
        ${colorMode === "mastery"
          ? html`
              <div class="flex items-center gap-2 text-[10px] text-slate-500 flex-wrap">
                ${["strong", "working", "shaky"].map(
                  (band) => html`
                    <span key=${band} class="flex items-center gap-1">
                      <span
                        class="w-2 h-2 rounded-full"
                        style=${{ background: BAND_COLOR[band] }}
                      ></span>
                      ${BAND_LABEL[band]}
                    </span>
                  `,
                )}
              </div>
            `
          : ""}
      </div>

      <!-- Stats -->
      <div class="px-3 py-2 border-t border-white/10 text-[10px] text-slate-600">
        ${stats.topics} topics · ${stats.solved} solved
        ${stats.suggested ? ` · ${stats.suggested} suggested` : ""} · ${stats.links} links
        <div class="mt-0.5 text-slate-700">Scroll to zoom · drag to pan · click to inspect</div>
        ${onNavigate && isAIActive(settings)
          ? html`
              <button
                class="mt-1.5 w-full px-2 py-1 rounded border border-violet-500/30 text-violet-300 hover:bg-violet-500/10 transition-colors font-medium"
                title="Open AI chat with a digest of this graph attached"
                onClick=${() => {
                  updateQueryParams({
                    chatPrompt:
                      "Here is my current knowledge-graph digest:\n\n/graph\n\nBased on it: where am I weak or rusty, and what should I practice next? Suggest specific problems and say why.",
                  });
                  onNavigate("ai-chats");
                }}
              >
                ✦ Ask AI about this graph
              </button>
            `
          : ""}
      </div>
    </div>
  `;

  /* ── Render ─────────────────────────────────────────────────────── */
  return html`
    <div
      ref=${rootRef}
      class="relative flex w-full min-h-[520px] rounded-2xl overflow-hidden border border-white/5"
      style="height: calc(100vh - 180px); background-color: var(--cl-surface)"
    >
      <!-- Canvas -->
      <div class="relative flex-1 min-w-0">
        <div ref=${containerRef} class="absolute inset-0"></div>

        <!-- Stabilization progress -->
        ${settling < 1 && problems?.length
          ? html`
              <div class="absolute top-0 left-0 right-0 h-0.5 bg-white/5">
                <div
                  class="h-full bg-cyan-500/70 transition-all duration-200"
                  style=${{ width: `${Math.round(settling * 100)}%` }}
                ></div>
              </div>
            `
          : ""}

        <!-- Zoom controls -->
        <div
          class="absolute bottom-3 right-3 flex flex-col rounded-lg border border-white/10 bg-black/50 backdrop-blur overflow-hidden"
        >
          <button
            onClick=${() => zoomBy(1.35)}
            title="Zoom in"
            class="px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10 transition-colors leading-none"
          >
            +
          </button>
          <button
            onClick=${fitView}
            title="Fit the whole graph"
            class="px-2.5 py-1.5 text-xs text-slate-400 hover:bg-white/10 transition-colors leading-none border-y border-white/10"
          >
            ▣
          </button>
          <button
            onClick=${() => zoomBy(0.75)}
            title="Zoom out"
            class="px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10 transition-colors leading-none"
          >
            −
          </button>
          <button
            onClick=${reLayout}
            title="Re-run the layout"
            class="px-2.5 py-1.5 text-xs text-slate-400 hover:bg-white/10 transition-colors leading-none border-t border-white/10"
          >
            ↺
          </button>
        </div>

        <!-- Legend: a small chip, expandable into the full vertical key -->
        <div class="absolute bottom-3 left-3 max-w-[85%]">
          ${legendOpen
            ? html`
                <div
                  class="w-[300px] max-w-full max-h-[70vh] overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-black/75 backdrop-blur px-3 py-2.5 text-[10px] text-slate-400 flex flex-col gap-2.5"
                >
                  <div class="flex items-center justify-between">
                    <span class="uppercase tracking-wider text-slate-500 font-semibold"
                      >Legend</span
                    >
                    <button
                      onClick=${() => setLegendOpen(false)}
                      class="text-slate-500 hover:text-slate-300 px-1"
                      title="Collapse the legend"
                    >
                      ✕
                    </button>
                  </div>

                  <div class="flex flex-col gap-1">
                    <span class="text-slate-500 uppercase tracking-wider text-[9px]">Problems</span>
                    <span class="flex items-center gap-1.5">
                      <span class="w-2.5 h-2.5 rounded-full bg-[#22c55e] shrink-0"></span>Easy
                      <span class="w-2.5 h-2.5 rounded-full bg-[#f59e0b] shrink-0 ml-2"></span
                      >Medium
                      <span class="w-2.5 h-2.5 rounded-full bg-[#ef4444] shrink-0 ml-2"></span>Hard
                    </span>
                    <span class="flex items-center gap-1.5">
                      <span
                        class="w-2.5 h-2.5 rounded-full border border-dashed border-slate-400 shrink-0"
                      ></span>
                      Suggested — connects to your topics, not solved yet
                    </span>
                    <span class="flex items-center gap-1.5">
                      <span
                        class="w-2 h-2 rounded-full bg-slate-500 shrink-0"
                        style="box-shadow: 0 0 0 2px #FFA116"
                      ></span>
                      Ring colour = platform it was solved on
                    </span>
                    <div class="flex items-center gap-x-2.5 gap-y-1 flex-wrap pl-4">
                      ${Object.entries(PLATFORM_LABEL).map(
                        ([pid, label]) => html`
                          <span class="flex items-center gap-1 text-slate-500">
                            <span
                              class="w-2 h-2 rounded-full border-2 shrink-0"
                              style=${{ borderColor: PLATFORM_COLOR[pid] || "#64748b" }}
                            ></span>
                            ${label}
                          </span>
                        `,
                      )}
                    </div>
                    <span class="flex items-center gap-1.5">
                      <span
                        class="w-2.5 h-2.5 rounded-full bg-slate-500 shrink-0"
                        style="box-shadow: 0 0 0 3px #8b5cf6"
                      ></span>
                      Thick ring = solved on several platforms
                    </span>
                  </div>

                  <div class="flex flex-col gap-1">
                    <span class="text-slate-500 uppercase tracking-wider text-[9px]"
                      >Topic hubs</span
                    >
                    <span class="flex items-center gap-1.5">
                      <span class="text-cyan-400 w-3 text-center shrink-0">●</span>Algorithm /
                      technique
                    </span>
                    <span class="flex items-center gap-1.5">
                      <span class="text-amber-400 w-3 text-center shrink-0">◆</span>Data structure
                    </span>
                    <span class="flex items-center gap-1.5">
                      <span class="text-slate-400 w-3 text-center shrink-0">⬡</span>Domain (SQL,
                      shell, …)
                    </span>
                    <span class="text-slate-500">A hub grows with the solves on it.</span>
                  </div>

                  <div class="flex flex-col gap-1">
                    <span class="text-slate-500 uppercase tracking-wider text-[9px]">Links</span>
                    <span class="flex items-center gap-1.5">
                      <span class="w-5 border-t border-slate-500/60 shrink-0"></span>Topic ↔
                      problem, tinted by topic
                    </span>
                    <span class="flex items-center gap-1.5">
                      <span class="w-5 border-t border-dashed border-[#3b82f6] shrink-0"></span
                      >Similar problems
                    </span>
                    <span class="flex items-center gap-1.5">
                      <span class="w-5 border-t-2 border-dashed border-[#f59e0b] shrink-0"></span
                      >Same problem across platforms
                    </span>
                    <span class="text-slate-500"
                      >Selecting a node lights its links at full colour.</span
                    >
                  </div>

                  <div class="flex flex-col gap-1">
                    <span class="text-slate-500 uppercase tracking-wider text-[9px]"
                      >Mastery colours (in “By mastery”)</span
                    >
                    ${Object.keys(BAND_COLOR).map(
                      (band) => html`
                        <span class="flex items-center gap-1.5">
                          <span
                            class="w-2.5 h-2.5 rounded-full shrink-0"
                            style=${{ background: BAND_COLOR[band] }}
                          ></span>
                          ${BAND_LABEL[band]}
                        </span>
                      `,
                    )}
                    <span class="text-slate-500">
                      ${`Mastery fades with a half-life of ${masteryOptsFromSettings(settings).halfLifeDays} days; ${masteryOptsFromSettings(settings).regainSolves} recent solves bring a topic back. Tune both in Settings.`}
                    </span>
                  </div>

                  <div class="flex flex-col gap-1">
                    <span class="text-slate-500 uppercase tracking-wider text-[9px]"
                      >Getting around</span
                    >
                    <span>Click a node to inspect it in the sidebar.</span>
                    <span>Double-click a solved problem for full details.</span>
                    <span>Scroll to zoom · drag the canvas to pan.</span>
                    <span>Click a sidebar group to zoom in on it; “hide” removes it.</span>
                  </div>
                </div>
              `
            : html`
                <button
                  onClick=${() => setLegendOpen(true)}
                  class="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-cyan-300 bg-black/50 backdrop-blur px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-cyan-500/30 transition-colors"
                  title="Open the full legend"
                >
                  ${(colorMode === "mastery"
                    ? [BAND_COLOR.strong, BAND_COLOR.working, BAND_COLOR.shaky]
                    : ["#22c55e", "#f59e0b", "#ef4444"]
                  ).map(
                    (c) => html`
                      <span
                        class="w-2 h-2 rounded-full inline-block"
                        style=${{ background: c }}
                      ></span>
                    `,
                  )}
                  Legend ▸
                </button>
              `}
        </div>

        <!-- Narrow-mode sidebar toggle -->
        ${isNarrow
          ? html`
              <button
                onClick=${() => setSidebarOpen((v) => !v)}
                class="absolute top-3 right-3 z-40 px-2.5 py-1.5 rounded-lg border border-white/10 bg-black/60 backdrop-blur text-xs text-slate-300 hover:bg-white/10 transition-colors"
                title=${sidebarOpen ? "Hide panel" : "Search and filters"}
              >
                ${sidebarOpen ? "✕" : "☰"}
              </button>
            `
          : ""}

        <!-- Empty state -->
        ${!problems?.length
          ? html`
              <div
                class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center px-6"
              >
                <p class="text-slate-400 text-sm">No solves on the map yet.</p>
                <p class="text-slate-600 text-xs max-w-[340px]">
                  ${`Solve a problem on LeetCode, GFG, Codeforces, NeetCode or takeUforward and it lands here, linked to its topics.`}
                </p>
              </div>
            `
          : ""}
      </div>

      <!-- Sidebar -->
      ${!isNarrow || sidebarOpen ? sidebar : ""}

      <!-- Full problem details (same modal as the Solutions list; its version
           chips switch between the platform versions of a merged node) -->
      ${modalProblem &&
      html`
        <${ProblemModal}
          problem=${modalProblem}
          onClose=${closeModal}
          problemList=${problems || []}
          topicKinds=${settings?.topicKinds || {}}
          onNavigateProblem=${(prob) => {
            setModalVersion(prob);
            const node = findProblemNode(prob.titleSlug || prob.id, prob.platform);
            if (node) setModalNode(node);
          }}
          onNavigate=${onNavigate}
          onDelete=${(delId) => {
            if (onProblemDelete) onProblemDelete(delId);
            closeModal();
          }}
          onUpdate=${(updated) => {
            if (onProblemUpdate) onProblemUpdate(updated);
          }}
        />
      `}
    </div>
  `;
}
