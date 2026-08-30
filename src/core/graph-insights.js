/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A compact, provider-agnostic text digest of the knowledge graph, so the AI
 * chat can reason about the map the user is looking at: which topics are held,
 * which have decayed, where the suggested next problems attach. Built from the
 * same buildKnowledgeGraph() call as the Graph tab — the digest can never
 * disagree with the picture.
 *
 * The output is markdown aimed at a model, not a human: dense lines, hard
 * caps per section, everything the graph knows and nothing it doesn't.
 */

import { buildKnowledgeGraph } from "./knowledge-graph.js";
import { KIND_ORDER, KIND_LABEL_PLURAL, masteryOptsFromSettings } from "./topic-taxonomy.js";

const MAX_TOPICS_PER_AXIS = 15;
const MAX_WEAK = 8;
const MAX_SUGGESTED = 8;

// What the graph can answer: progress, weak spots, what to practice next.
// Deliberately narrower than "any message with a topic word in it" — a chat
// about one problem ("what should I do to fix this bug?", "suggest a better
// approach for this problem") must not drag the whole graph in.
const GRAPH_QUESTION_PATTERNS = [
  /\bwhat\s+(?:should|can|shall)\s+i\s+(?:practice|study|learn|revise|solve|focus\s+on|work\s+on)\b/,
  /\b(?:practice|study|learn|revise|solve|focus\s+on|work\s+on)\s+next\b/,
  /\bwhere\s+am\s+i\s+(?:weak|strong|lacking|behind|rusty)\b/,
  /\bam\s+i\s+(?:weak|rusty|behind)\b/,
  /\bi'?m\s+rusty\b|\brusty\s+on\b/,
  /\bmy\s+(?:weak|weakest|strong|strongest|rusty)\b/,
  /\bmy\s+(?:progress|mastery|gaps?|strengths?|weakness|weaknesses|coverage)\b/,
  /\bhow\s+am\s+i\s+doing\b/,
  /\b(?:recommend|suggest)\b[^.?!]*\b(?:problems|topics)\b/,
  /\bknowledge\s+graph\b/,
  /\b(?:topics?|areas?)\s+(?:should\s+i|to)\s+(?:revise|review|practice|improve|strengthen)\b/,
];

/**
 * Whether a chat message is asking the kind of question the knowledge graph
 * answers — used to attach the digest automatically, without /graph.
 *
 * @param {string} text the user's message
 * @returns {boolean}
 */
export function isGraphQuestion(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return false;
  return GRAPH_QUESTION_PATTERNS.some((re) => re.test(t));
}

function daysPhrase(daysSince) {
  if (daysSince === null || daysSince === undefined) return "";
  if (daysSince === 0) return "last today";
  if (daysSince === 1) return "last yesterday";
  return `last ${daysSince}d ago`;
}

function topicLine(t) {
  const parts = [`${t.solveCount || 0} solved`];
  if (t.band) parts.push(t.band);
  const when = daysPhrase(t.daysSince);
  if (when) parts.push(when);
  return `- ${t.label} — ${parts.join(", ")}`;
}

/**
 * Build the digest the /graph chat command expands into.
 *
 * @param {Array<object>} problems the raw solve ledger
 * @param {object|null} settings for topic mappings, kinds, and decay knobs
 * @returns {string} markdown digest, or a one-line note for an empty ledger
 */
export function buildGraphDigest(problems, settings = null) {
  const masteryOpts = masteryOptsFromSettings(settings);
  const { nodes, edges } = buildKnowledgeGraph(
    problems || [],
    settings?.topicMappings,
    settings?.topicKinds,
    masteryOpts,
    settings?.topicParents,
  );

  const topics = nodes.filter((n) => n.type === "topic");
  const probs = nodes.filter((n) => n.type === "problem");
  const solved = probs.filter((n) => n.solved);
  if (!solved.length) {
    return "The knowledge graph is empty — no solved problems recorded yet.";
  }

  const lines = [];

  // ── Totals ──────────────────────────────────────────────────────────
  const platforms = new Set();
  const byDifficulty = { Easy: 0, Medium: 0, Hard: 0, Unknown: 0 };
  for (const p of solved) {
    for (const plat of p.platforms?.length ? p.platforms : [p.platform]) {
      if (plat) platforms.add(plat);
    }
    const d = byDifficulty[p.difficulty] !== undefined ? p.difficulty : "Unknown";
    byDifficulty[d]++;
  }
  const crossPlatform = solved.filter((p) => p.isMultiPlatform).length;
  const diffMix = ["Easy", "Medium", "Hard"]
    .map((d) => `${byDifficulty[d]} ${d.toLowerCase()}`)
    .join(", ");
  lines.push(
    `${solved.length} solved problems across ${[...platforms].sort().join(", ")} ` +
      `(${diffMix}${byDifficulty.Unknown ? `, ${byDifficulty.Unknown} unknown` : ""}); ` +
      `${topics.length} topics` +
      (crossPlatform ? `; ${crossPlatform} solved on more than one platform` : "") +
      ".",
  );
  lines.push(
    `Mastery model: fades with a ${masteryOpts.halfLifeDays}-day half-life; ` +
      `it takes ${masteryOpts.regainSolves} recent solves to reset a topic's clock. ` +
      `Bands: strong > working > shaky > untouched.`,
  );

  // ── Topics per axis ─────────────────────────────────────────────────
  const bySolves = (a, b) =>
    (b.solveCount || 0) - (a.solveCount || 0) || a.label.localeCompare(b.label);
  for (const kind of KIND_ORDER) {
    const axisTopics = topics.filter((t) => t.category === kind).sort(bySolves);
    if (!axisTopics.length) continue;
    lines.push("");
    lines.push(`**${KIND_LABEL_PLURAL[kind]}:**`);
    for (const t of axisTopics.slice(0, MAX_TOPICS_PER_AXIS)) lines.push(topicLine(t));
    if (axisTopics.length > MAX_TOPICS_PER_AXIS) {
      lines.push(`- …and ${axisTopics.length - MAX_TOPICS_PER_AXIS} more`);
    }
  }

  // ── Weak spots: practiced once, decayed since ───────────────────────
  const weak = topics
    .filter((t) => (t.solveCount || 0) > 0 && (t.band === "shaky" || t.band === "untouched"))
    .sort(bySolves);
  if (weak.length) {
    lines.push("");
    lines.push("**Rusty (practiced before, decayed since):**");
    for (const t of weak.slice(0, MAX_WEAK)) lines.push(topicLine(t));
    if (weak.length > MAX_WEAK) lines.push(`- …and ${weak.length - MAX_WEAK} more`);
  }

  // ── Suggested next: unsolved neighbours the graph already links ─────
  const topicLabelById = new Map(topics.map((t) => [t.id, t.label]));
  const suggested = probs.filter((n) => !n.solved);
  if (suggested.length) {
    const topicsFor = new Map();
    for (const e of edges) {
      if (e.type !== "topic-problem") continue;
      const topicId = e.source.startsWith("topic:") ? e.source : e.target;
      const problemId = topicId === e.source ? e.target : e.source;
      const label = topicLabelById.get(topicId);
      if (!label) continue;
      if (!topicsFor.has(problemId)) topicsFor.set(problemId, []);
      topicsFor.get(problemId).push(label);
    }
    lines.push("");
    lines.push("**Suggested next (unsolved, linked to current topics):**");
    const bySpread = (a, b) =>
      (topicsFor.get(b.id)?.length || 0) - (topicsFor.get(a.id)?.length || 0) ||
      String(a.label).localeCompare(String(b.label));
    for (const s of [...suggested].sort(bySpread).slice(0, MAX_SUGGESTED)) {
      const via = (topicsFor.get(s.id) || []).sort().join(", ");
      lines.push(
        `- ${s.label}${s.difficulty ? ` (${s.difficulty})` : ""}${via ? ` — ${via}` : ""}`,
      );
    }
    if (suggested.length > MAX_SUGGESTED) {
      lines.push(`- …and ${suggested.length - MAX_SUGGESTED} more`);
    }
  }

  return lines.join("\n");
}
