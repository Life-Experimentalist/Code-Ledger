/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Derived insights — the thing that was supposed to fill the Insights tab.
 *
 * The tab has always said "The AI will add insights here as you chat and solve
 * problems". Nothing ever did. `saveInsight()` had exactly two callers: the
 * manual "+ Add Insight" form, and a `remember-insight` tool the model was
 * never told to use. So a learner with 283 recorded problems saw "0 insights
 * stored", which reads as broken rather than as empty.
 *
 * What is generated here is deliberately narrow. An insight is written only
 * when a pattern has repeated across at least three distinct problems, so it is
 * a habit rather than a bad afternoon. And it carries the thing the Behaviour
 * tab's chips cannot: *which* problems, so the claim is checkable instead of
 * being a number the learner has to take on faith.
 *
 * These are marked `type: "derived"` and excluded from the prompt context. The
 * learner profile already tells the model the same statistics in a denser form;
 * sending both would spend tokens saying it twice. The examples are for the
 * human reading the tab, not for the model.
 */

import { getAllInsights, upsertInsight, deleteInsight } from "./knowledge-bank.js";
import { getAllEntries } from "../behavior-bank.js";
import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("InsightSynthesis");

/**
 * A pattern needs this many distinct problems before it is written down. The
 * Behaviour tab's chips use two, which is right for a chip — it is a count, and
 * the learner can see it is small. An insight is a sentence making a claim
 * about how they solve, and three is the smallest number that is not an anecdote.
 */
export const MIN_PROBLEMS_FOR_INSIGHT = 3;

/** How many worked examples to name. Enough to check, few enough to read. */
const EXAMPLES_SHOWN = 3;

/** Cap per kind, so a long history does not bury the hand-written insights. */
const MAX_PER_KIND = 5;

const DERIVED_TYPE = "derived";

function readableSlug(slug) {
  return String(slug || "")
    .replace(/[-_]+/g, " ")
    .trim();
}

/** "a, b and c" — the list is read by a person, not parsed. */
function listPhrase(items) {
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

/**
 * Group problems by a label, newest first within each group.
 *
 * Labels are de-duplicated per problem before counting. A problem keeps up to
 * three review snapshots, and a review that flags "edge cases" twice is still
 * one problem with weak edge cases — counting it twice would inflate every
 * number the insight quotes.
 *
 * @param {Array<Object>} entries
 * @param {(entry: Object) => string[]} labelsOf
 * @returns {Map<string, Array<{slug: string, ts: number}>>}
 */
function groupBy(entries, labelsOf) {
  const groups = new Map();
  for (const entry of entries) {
    if (!entry?.slug) continue;
    const ts = Math.max(0, ...(entry.solves || []).map((s) => Number(s?.ts) || 0));
    const labels = new Set(
      (labelsOf(entry) || []).map((raw) => String(raw || "").trim()).filter(Boolean),
    );
    for (const label of labels) {
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push({ slug: entry.slug, ts });
    }
  }
  for (const list of groups.values()) list.sort((a, b) => b.ts - a.ts);
  return groups;
}

function rank(groups) {
  return [...groups.entries()]
    .filter(([, list]) => list.length >= MIN_PROBLEMS_FOR_INSIGHT)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, MAX_PER_KIND);
}

/**
 * Derive the full set of insights from raw behaviour-bank entries.
 *
 * Pure: takes the data rather than reading storage, so every sentence it can
 * produce is testable without a browser. Keys are stable across runs — the same
 * pattern always produces the same key — which is what lets the caller upsert
 * instead of accumulating a duplicate on every solve.
 *
 * @param {Array<Object>} entries from getAllEntries()
 * @returns {Array<Object>} entries ready for upsertInsight()
 */
export function deriveInsights(entries = []) {
  const problems = (entries || []).filter((e) => e && e.slug);
  const out = [];

  // ── What the reviews keep flagging ─────────────────────────────────────────
  // Filtered before stringifying: `String(null)` is the four-character label
  // "null", which is not blank and would otherwise become an insight.
  const flagGroups = groupBy(problems, (e) =>
    (e.aiInsights || []).flatMap((i) =>
      (i?.weakAreas || []).filter(Boolean).map((w) => String(w).toLowerCase()),
    ),
  );
  for (const [label, list] of rank(flagGroups)) {
    const examples = list.slice(0, EXAMPLES_SHOWN).map((p) => readableSlug(p.slug));
    out.push({
      key: `derived:flag:${label}`,
      topic: "recurring-flags",
      type: DERIVED_TYPE,
      tags: [label],
      content:
        `Your reviews have flagged “${label}” on ${list.length} problems — ` +
        `most recently ${listPhrase(examples)}. ` +
        `It is the kind of thing worth checking before you call a solution finished.`,
      meta: { kind: "flag", label, problems: list.length, examples: list.slice(0, 10) },
    });
  }

  // ── Topics that cost effort ────────────────────────────────────────────────
  // Same definition the profile uses: a topic counts only on problems where a
  // hint was opened, the solution was resubmitted, or a review flagged something.
  // Ranking by tag frequency alone would surface the topics they solve *most*,
  // which is the opposite of what needs attention.
  const strainGroups = groupBy(problems, (e) => {
    const struggled =
      (e.hintViews || 0) > 0 || (e.solves || []).length > 1 || (e.aiInsights || []).length > 0;
    return struggled ? e.tags || [] : [];
  });
  for (const [topic, list] of rank(strainGroups)) {
    const examples = list.slice(0, EXAMPLES_SHOWN).map((p) => readableSlug(p.slug));
    out.push({
      key: `derived:topic:${topic.toLowerCase()}`,
      topic: topic.toLowerCase(),
      type: DERIVED_TYPE,
      tags: [topic],
      content:
        `${topic} has needed a second pass ${list.length} times — a hint, a resubmit, ` +
        `or a review that flagged something. Recent ones: ${listPhrase(examples)}.`,
      meta: { kind: "topic", label: topic, problems: list.length, examples: list.slice(0, 10) },
    });
  }

  dbg.log(`deriveInsights(): ${out.length} insight(s) from ${problems.length} problem(s)`);
  return out;
}

/**
 * Recompute the derived insights and reconcile them with what is stored.
 *
 * Never throws: every caller is on a path — a solve, a review — where failing
 * to update a memo must not fail the thing the learner actually asked for.
 *
 * @returns {Promise<{written: number, removed: number}>}
 */
export async function synthesizeInsights() {
  try {
    const derived = deriveInsights(await getAllEntries());
    const wanted = new Set(derived.map((d) => d.key));

    for (const entry of derived) await upsertInsight(entry);

    // A pattern that fell below the threshold — because the learner fixed it, or
    // because they cleared the bank — has to stop being asserted. Only derived
    // rows are ever removed; anything hand-written or AI-written is left alone.
    let removed = 0;
    for (const stored of await getAllInsights()) {
      if (stored?.type === DERIVED_TYPE && stored.key && !wanted.has(stored.key)) {
        await deleteInsight(stored.id);
        removed++;
      }
    }

    dbg.log(`synthesizeInsights(): ${derived.length} written, ${removed} removed`);
    return { written: derived.length, removed };
  } catch (e) {
    dbg.warn(`synthesizeInsights(): failed:`, e?.message || e);
    return { written: 0, removed: 0 };
  }
}
