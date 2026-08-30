/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The thirty-second read: the three things most worth fixing, each with the
 * number that makes it true.
 *
 * The app already has plenty of surfaces that show everything — a radar, a
 * graph, a per-axis gap report, a topic table. Everything is the problem. Given
 * six charts and no ranking, the honest reading of one's own ledger is "lots of
 * green, some grey, I am probably fine", which is exactly the conclusion the
 * data does not support. This module refuses to show everything: it returns at
 * most three headlines and each one carries a count, so the sentence is "four
 * core topics at zero", not "some gaps in graph algorithms".
 *
 * Three signals feed it, in the order they matter:
 *
 *   1. **Absent topics**, from topic-dependencies.js — a zero is worse than a
 *      weakness, and the tier says how much worse.
 *   2. **Difficulty shape.** A ledger that is mostly Easy is the most common
 *      way a large solve count means nothing. Interviews ask Medium.
 *   3. **Retention risk.** A topic met once, months ago, is not held, and it is
 *      invisible to every count-based view because the count is not zero.
 *
 * Non-algorithm work is excluded from all three. A problem tagged only
 * Database, Shell or Pandas is real work and is not interview preparation, and
 * counting it inflates exactly the number someone is trying to judge themselves
 * by. `splitTags` decides; this module only asks.
 */

import { splitTags } from "./topic-taxonomy.js";
import { mapDifficulty } from "./difficulty-map.js";
import { TIER, TIER_LABEL, topicReadiness, orderIndex } from "./topic-dependencies.js";

/**
 * Is this problem algorithm practice at all?
 *
 * True when at least one tag is a structure or a technique. A problem carrying
 * nothing but Database/Shell/Pandas/Design tags is excluded; an untagged
 * problem is kept, because absence of tags is a platform failing rather than
 * evidence the problem was a SQL exercise.
 *
 * @param {object} problem
 * @param {Record<string,string>} [overrides] `settings.topicKinds`
 * @returns {boolean}
 */
export function isAlgorithmProblem(problem, overrides = {}) {
  const tags = problem?.tags?.length ? problem.tags : [problem?.topic].filter(Boolean);
  if (!tags.length) return true;
  const { ds, algo, domain } = splitTags(tags, overrides);
  if (ds.length || algo.length) return true;
  return domain.length === 0;
}

/**
 * The shares an interview loop actually asks in, and what counts as off.
 *
 * Roughly a fifth Easy, most of the rest Medium, a little Hard. The thresholds
 * below are deliberately loose — this is meant to catch "I have done 130 Easy
 * problems", not to police a ledger that is 46% Easy instead of 45%.
 */
const SHAPE = Object.freeze({
  /** Below this many algorithm solves there is nothing to judge. */
  MIN_SAMPLE: 20,
  /** Easy share at or above this is the finding. */
  EASY_HEAVY: 0.5,
  /** Medium share below this means the bulk of interview work is missing. */
  MEDIUM_LIGHT: 0.35,
  /** Hard share below this, on a mature ledger, means Hard is being avoided. */
  HARD_ABSENT: 0.05,
  /** Solves before "no Hard problems" is a finding rather than just early days. */
  HARD_SAMPLE: 50,
});

/**
 * Difficulty distribution across algorithm problems only.
 *
 * @param {Array<object>} problems the ledger
 * @param {{ userMap?: Record<string,string>, overrides?: Record<string,string> }} [opts]
 *   `userMap` is `settings.difficultyMap`, so Codeforces ratings land on the
 *   same three buckets as everything else
 * @returns {{ easy:number, medium:number, hard:number, unknown:number, total:number,
 *   easyShare:number, mediumShare:number, hardShare:number, excluded:number,
 *   flags:string[] }}
 */
export function difficultyMix(problems, opts = {}) {
  const userMap = opts.userMap || {};
  const overrides = opts.overrides || {};

  const counts = { Easy: 0, Medium: 0, Hard: 0, Unknown: 0 };
  let excluded = 0;

  for (const p of problems || []) {
    if (!p) continue;
    if (!isAlgorithmProblem(p, overrides)) {
      excluded += 1;
      continue;
    }
    // A user difficulty map returns its value verbatim, so it can name a
    // bucket that does not exist ({ "Basic": "Trivial" }). Anything outside the
    // three canonical levels counts as Unknown rather than incrementing
    // `undefined` and turning every total into NaN.
    const level = mapDifficulty(p.difficulty, userMap);
    counts[level in counts ? level : "Unknown"] += 1;
  }

  const total = counts.Easy + counts.Medium + counts.Hard + counts.Unknown;
  // Shares are over the graded problems only. Dividing by a total that includes
  // Unknown makes every share drift downward on platforms that do not report a
  // difficulty, which reads as a finding and is an artefact.
  const graded = counts.Easy + counts.Medium + counts.Hard;
  const share = (n) => (graded ? n / graded : 0);

  const flags = [];
  if (graded >= SHAPE.MIN_SAMPLE) {
    if (share(counts.Easy) >= SHAPE.EASY_HEAVY) flags.push("easy-heavy");
    if (share(counts.Medium) < SHAPE.MEDIUM_LIGHT) flags.push("medium-light");
    if (graded >= SHAPE.HARD_SAMPLE && share(counts.Hard) < SHAPE.HARD_ABSENT) {
      flags.push("hard-absent");
    }
  }

  return {
    easy: counts.Easy,
    medium: counts.Medium,
    hard: counts.Hard,
    unknown: counts.Unknown,
    total,
    graded,
    easyShare: share(counts.Easy),
    mediumShare: share(counts.Medium),
    hardShare: share(counts.Hard),
    excluded,
    flags,
  };
}

/** A topic met this few times has been seen, not learned. */
const THIN_COUNT = 2;
/** Days after which a thin topic is treated as gone rather than recent. */
const STALE_DAYS = 60;

/**
 * Topics touched once or twice, long enough ago to have gone.
 *
 * The blind spot every count-based view shares: the count is not zero, so the
 * topic never appears in an "untouched" list, and it is small, so it never
 * appears in a "top topics" list either. It falls between the two and is
 * exactly the thing that fails in an interview — recognised, not recalled.
 *
 * @param {Array<object>} problems
 * @param {{ now?: number, overrides?: Record<string,string>, halfLifeDays?: number,
 *   regainSolves?: number, maxTier?: number, minDays?: number, maxCount?: number }} [opts]
 * @returns {Array<object>} readiness rows, worst first
 */
export function retentionRisk(problems, opts = {}) {
  const minDays = opts.minDays ?? STALE_DAYS;
  const maxCount = opts.maxCount ?? THIN_COUNT;

  return topicReadiness(problems, opts)
    .filter((t) => t.count > 0 && t.count <= maxCount && (t.daysSince ?? 0) >= minDays)
    .sort((a, b) => a.tier - b.tier || (b.daysSince ?? 0) - (a.daysSince ?? 0));
}

/**
 * At most three findings, ranked, each with the number behind it.
 *
 * Candidates are scored and the top three returned. The scores are not
 * calibrated against anything — they encode one ordering judgement, which is
 * that a missing foundation beats a missing core topic beats a lopsided
 * difficulty mix beats a decayed topic. Everything below the top three is
 * deliberately dropped rather than shown smaller: a list of eight findings is
 * the wall of charts this module exists to replace.
 *
 * @param {Array<object>} problems
 * @param {{ now?: number, overrides?: Record<string,string>, userMap?: Record<string,string>,
 *   halfLifeDays?: number, regainSolves?: number, maxTier?: number, limit?: number }} [opts]
 * @returns {Array<{ id:string, severity:number, number:number, unit:string, title:string,
 *   detail:string, topics:string[] }>}
 */
export function gapHeadlines(problems, opts = {}) {
  const limit = opts.limit ?? 3;
  const rows = topicReadiness(problems, opts);
  const mix = difficultyMix(problems, opts);
  const stale = retentionRisk(problems, opts);

  const absentIn = (tier) =>
    rows
      .filter((r) => r.tier === tier && r.count === 0)
      .sort((a, b) => orderIndex(a.topic) - orderIndex(b.topic))
      .map((r) => r.topic);

  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  /** @type {Array<{id:string,severity:number,number:number,unit:string,title:string,detail:string,topics:string[]}>} */
  const candidates = [];

  const missingFoundations = absentIn(TIER.FOUNDATION);
  if (missingFoundations.length) {
    candidates.push({
      id: "absent-foundation",
      // Weighted by how many, so four missing foundations outranks one.
      severity: 1000 + missingFoundations.length,
      number: missingFoundations.length,
      unit: plural(missingFoundations.length, "foundation"),
      title: `${plural(missingFoundations.length, "foundation")} at zero`,
      detail: `Nothing solved in ${missingFoundations.slice(0, 3).join(", ")}. These are assumed knowledge in every loop — start here before anything else.`,
      topics: missingFoundations,
    });
  }

  const missingCore = absentIn(TIER.CORE);
  if (missingCore.length) {
    candidates.push({
      id: "absent-core",
      severity: 800 + missingCore.length,
      number: missingCore.length,
      unit: plural(missingCore.length, "core topic"),
      title: `${plural(missingCore.length, "core topic")} at zero`,
      detail: `No solves at all in ${missingCore.slice(0, 3).join(", ")}${missingCore.length > 3 ? ` and ${missingCore.length - 3} more` : ""}. Each is asked in most interview loops.`,
      topics: missingCore,
    });
  }

  if (mix.flags.includes("easy-heavy")) {
    const pct = Math.round(mix.easyShare * 100);
    candidates.push({
      id: "easy-heavy",
      // Scaled by how lopsided it is, so 80% Easy outranks 51% Easy.
      severity: 600 + pct,
      number: pct,
      unit: "% Easy",
      title: `${pct}% of graded solves are Easy`,
      detail: `${mix.easy} Easy against ${mix.medium} Medium and ${mix.hard} Hard. Interviews are mostly Medium, so the solve count is running ahead of what it demonstrates.`,
      topics: [],
    });
  } else if (mix.flags.includes("medium-light")) {
    const pct = Math.round(mix.mediumShare * 100);
    candidates.push({
      id: "medium-light",
      severity: 550,
      number: pct,
      unit: "% Medium",
      title: `Only ${pct}% of graded solves are Medium`,
      detail: `${mix.medium} of ${mix.graded} graded problems. Medium is the bulk of what interviews ask.`,
      topics: [],
    });
  }

  if (stale.length) {
    const worst = stale.slice(0, 3);
    candidates.push({
      id: "retention",
      severity: 400 + stale.length,
      number: stale.length,
      unit: plural(stale.length, "topic"),
      title: `${plural(stale.length, "topic")} met once and not since`,
      detail: `${worst.map((t) => `${t.topic} (${t.count}, ${t.daysSince}d ago)`).join(", ")}. Seen is not the same as held; these will not survive an interview without a revision pass.`,
      topics: stale.map((t) => t.topic),
    });
  }

  if (mix.flags.includes("hard-absent")) {
    candidates.push({
      id: "hard-absent",
      severity: 300,
      number: mix.hard,
      unit: "Hard solves",
      title: `${mix.hard} Hard problems in ${mix.graded} solves`,
      detail: `A ledger this size with almost no Hard problems suggests they are being skipped rather than not yet reached.`,
      topics: [],
    });
  }

  const blockedFoundations = rows.filter(
    (r) => r.state === "blocked" && r.tier <= TIER.CORE && r.blockedBy.length,
  );
  if (blockedFoundations.length && !missingFoundations.length) {
    const first = blockedFoundations[0];
    candidates.push({
      id: "blocked",
      severity: 200 + blockedFoundations.length,
      number: blockedFoundations.length,
      unit: plural(blockedFoundations.length, "topic"),
      title: `${plural(blockedFoundations.length, "topic")} blocked upstream`,
      detail: `${first.topic} is out of reach until ${first.blockedBy.join(" and ")} ${first.blockedBy.length === 1 ? "is" : "are"} solid. Working on it before then is wasted effort.`,
      topics: blockedFoundations.map((t) => t.topic),
    });
  }

  return candidates.sort((a, b) => b.severity - a.severity).slice(0, limit);
}

/**
 * One line for the top of the report, or "" when there is nothing to say.
 *
 * @param {Array<object>} headlines from `gapHeadlines`
 * @returns {string}
 */
export function headlineSummary(headlines) {
  if (!headlines?.length) return "";
  return headlines.map((h) => h.title).join(" · ");
}

export { TIER, TIER_LABEL };
