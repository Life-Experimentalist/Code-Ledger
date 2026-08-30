/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A dated plan: what to solve, on which day, between now and an interview.
 *
 * Two things separate this from the roadmap templates already in the app.
 *
 * **It is ordered by dependency, not by frequency.** The obvious way to build
 * a plan is to sort topics by how often they are asked, which puts Dynamic
 * Programming near the top and has someone attempting DP before they can write
 * a clean recursion. `TOPIC_ORDER` from topic-dependencies.js decides instead,
 * so Binary Search precedes Sliding Window precedes Heap precedes Graph
 * whatever the frequency tables say.
 *
 * **It schedules revision of problems already solved.** Every roadmap tool
 * ships the forward plan; almost none ship this half, and it is the half that
 * decides whether a compressed plan survives contact with an interview. A
 * problem solved once in March is not knowledge in August. Revisions are
 * scheduled at expanding intervals from each problem's last solve, and they
 * take priority over new work on the day they come due, because re-deriving
 * something half-remembered is cheaper than learning something new and worth
 * more per minute.
 *
 * Capacity is honest arithmetic rather than encouragement. If the target date
 * and the hours per day cannot cover the queue, the plan says so with the two
 * numbers and reports what was cut, instead of silently producing a schedule
 * nobody can keep.
 *
 * Everything here is pure and synchronous — it reads the ledger it is given and
 * nothing else, so it runs client-side against `index.json` with no server.
 */

import { topicReadiness } from "./topic-dependencies.js";
import { normalizeTag } from "./topic-resolver.js";
import { mapDifficulty } from "./difficulty-map.js";
import { unsolvedForTopic, problemUrl } from "../data/problem-sets.js";

const DAY = 86_400_000;

/**
 * Minutes for one fresh attempt, by difficulty.
 *
 * These are what an interview-length attempt plus reading the editorial
 * actually costs, not the 25 minutes a clean solution takes once you know the
 * trick. Budgeting the optimistic number is how plans end up 40% overcommitted.
 */
const MINUTES = Object.freeze({ Easy: 20, Medium: 40, Hard: 70, Unknown: 40 });

/** A revision is a re-derivation, not a discovery. It costs much less. */
const REVISION_MINUTES = 15;

/**
 * Expanding intervals, in days, from the last solve.
 *
 * Three touches is what fits inside a realistic preparation window; a fourth at
 * six months is correct in principle and outlives every plan this builds.
 */
export const REVISION_INTERVALS = Object.freeze([7, 21, 60]);

/** Ceiling on how much of a day revision may take. */
const REVISION_SHARE = 0.4;

/** Days shown problem by problem. Beyond this the plan is themes. */
const CONCRETE_DAYS = 7;

/**
 * What the target role changes.
 *
 * The two differ in what counts as done, not in the order — the ordering is a
 * property of the subject and does not care who is hiring. A product company
 * loop reaches differentiator topics and asks Hard problems; a service company
 * loop rarely leaves tier 2, and preparing for it by grinding DP is a way to
 * feel busy.
 */
export const ROLE_PRESETS = Object.freeze({
  "tier-a": {
    id: "tier-a",
    label: "Tier A product company",
    blurb: "Reaches DP, graphs and tries. Expects Hard problems in the loop.",
    maxTier: 3,
    perTopicTarget: 8,
    /** Share of new problems drawn at each difficulty, best effort. */
    mix: { Easy: 0.1, Medium: 0.6, Hard: 0.3 },
  },
  service: {
    id: "service",
    label: "Service company",
    blurb: "Foundations and core patterns, mostly Easy and Medium.",
    maxTier: 2,
    perTopicTarget: 5,
    mix: { Easy: 0.35, Medium: 0.6, Hard: 0.05 },
  },
});

export const DEFAULT_ROLE = "tier-a";

/** @param {string} id */
export function rolePreset(id) {
  return ROLE_PRESETS[id] || ROLE_PRESETS[DEFAULT_ROLE];
}

/** Midnight UTC of the day a timestamp falls in, so day maths is stable. */
function dayStart(ts) {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** `YYYY-MM-DD` for a timestamp. */
function isoDate(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

/**
 * How many minutes a day, and how many days there are.
 *
 * @param {{ now?: number, targetDate?: number|string, hoursPerDay?: number }} opts
 */
export function planCapacity(opts = {}) {
  const now = opts.now ?? Date.now();
  const start = dayStart(now);
  const hoursPerDay = Math.max(0.25, Number(opts.hoursPerDay) || 1);

  const target = opts.targetDate ? dayStart(new Date(opts.targetDate).getTime()) : start + 28 * DAY;
  // At least one day: a target date in the past is a user error, and returning
  // a zero-day plan turns every downstream division into NaN.
  const days = Math.max(1, Math.round((target - start) / DAY));

  const minutesPerDay = Math.round(hoursPerDay * 60);
  return {
    start,
    target,
    days,
    hoursPerDay,
    minutesPerDay,
    totalMinutes: days * minutesPerDay,
  };
}

/**
 * The topics to work through, in dependency order, with problems attached.
 *
 * Held topics are dropped — the plan is what is missing, not an inventory.
 * Blocked topics stay in, in their dependency position, because `TOPIC_ORDER`
 * already guarantees the blocker comes first; removing them would silently
 * shrink the plan to whatever happens to be reachable today.
 *
 * @param {Array<object>} problems the ledger
 * @param {object} [opts] `role`, plus anything topicReadiness takes
 * @returns {Array<{topic:string, tier:number, state:string, have:number, need:number,
 *   blockedBy:string[], problems:Array<object>}>}
 */
export function topicQueue(problems, opts = {}) {
  const role = rolePreset(opts.role);
  const rows = topicReadiness(problems, { ...opts, maxTier: opts.maxTier ?? role.maxTier });

  return rows
    .filter((r) => r.state !== "held")
    .map((r) => {
      const need = Math.max(0, role.perTopicTarget - r.count);
      return {
        topic: r.topic,
        tier: r.tier,
        state: r.state,
        have: r.count,
        need,
        blockedBy: r.blockedBy,
        problems: pickForTopic(r.topic, problems, need, role),
      };
    })
    .filter((t) => t.need > 0);
}

/**
 * `need` problems for one topic, weighted towards the role's difficulty mix.
 *
 * Falls back to whatever the set has: a topic with four Easy problems and no
 * Medium ones yields four Easy problems rather than an empty list, because a
 * named problem someone can open beats a correctly-graded absence.
 */
function pickForTopic(topic, solved, need, role) {
  if (need <= 0) return [];
  const picked = [];
  const taken = new Set();

  for (const level of ["Medium", "Easy", "Hard"]) {
    const want = Math.round(need * (role.mix[level] ?? 0));
    for (const p of unsolvedForTopic(topic, solved, { difficulty: level })) {
      if (picked.length >= need || picked.filter((x) => x.difficulty === level).length >= want)
        break;
      if (taken.has(p.slug)) continue;
      taken.add(p.slug);
      picked.push(p);
    }
  }
  // Top up from anything left, in the set's own order.
  for (const p of unsolvedForTopic(topic, solved)) {
    if (picked.length >= need) break;
    if (taken.has(p.slug)) continue;
    taken.add(p.slug);
    picked.push(p);
  }
  return picked;
}

/**
 * Revisions due between now and the target date.
 *
 * One entry per problem per interval it has passed. A problem solved 90 days
 * ago has missed its 7- and 21-day touches and is due for both — but only the
 * furthest-along one is scheduled, since re-deriving it once now serves both.
 * `overdue` says how late it is, which is what makes the ordering meaningful.
 *
 * @param {Array<object>} problems
 * @param {{ now?: number, horizonDays?: number, intervals?: number[] }} [opts]
 * @returns {Array<{slug:string, title:string, topic:string, platform:string,
 *   lastSolved:number, dueAt:number, overdueDays:number, interval:number}>}
 */
export function revisionSchedule(problems, opts = {}) {
  const now = opts.now ?? Date.now();
  const intervals = opts.intervals || REVISION_INTERVALS;
  const horizon = now + (opts.horizonDays ?? 90) * DAY;

  /** Latest solve per problem — a re-solve resets the clock, which is the point. */
  const latest = new Map();
  for (const p of problems || []) {
    if (!p) continue;
    const key = p.titleSlug || p.title;
    if (!key) continue;
    const ts = Number(p.timestamp) || 0;
    if (!latest.has(key) || ts > latest.get(key).timestamp)
      latest.set(key, { ...p, timestamp: ts });
  }

  const due = [];
  for (const [key, p] of latest) {
    const age = (now - p.timestamp) / DAY;
    // The furthest interval this problem has reached. Below the first one it is
    // still fresh and does not belong in a plan at all.
    let interval = null;
    for (const i of intervals) if (age >= i) interval = i;
    const dueAt = p.timestamp + (interval ?? intervals[0]) * DAY;
    if (interval === null && dueAt > horizon) continue;

    const rawTopic = p.tags?.[0] || p.topic || "";
    due.push({
      slug: key,
      title: p.title || key,
      topic: normalizeTag(rawTopic) || rawTopic || "Unsorted",
      platform: p.platform || "",
      difficulty: mapDifficulty(p.difficulty),
      lastSolved: p.timestamp,
      dueAt,
      overdueDays: Math.max(0, Math.round((now - dueAt) / DAY)),
      interval: interval ?? intervals[0],
    });
  }

  // Most overdue first; ties by oldest solve, so a long-forgotten problem beats
  // one that only just crossed its threshold.
  return due.sort((a, b) => b.overdueDays - a.overdueDays || a.lastSolved - b.lastSolved);
}

/**
 * The whole plan.
 *
 * @param {Array<object>} problems the ledger
 * @param {{ now?: number, targetDate?: number|string, hoursPerDay?: number, role?: string,
 *   overrides?: Record<string,string>, halfLifeDays?: number, regainSolves?: number }} [opts]
 */
export function buildStudyPlan(problems, opts = {}) {
  const now = opts.now ?? Date.now();
  const role = rolePreset(opts.role);
  const capacity = planCapacity({ ...opts, now });

  const queue = topicQueue(problems, { ...opts, now });
  const revisions = revisionSchedule(problems, { ...opts, now, horizonDays: capacity.days });

  // Flatten the queue into one ordered stream of new problems. The topic order
  // is the dependency order, so consuming the stream front to back is what puts
  // Binary Search before Graph.
  const newStream = queue.flatMap((t) =>
    t.problems.map((p) => ({
      kind: "new",
      topic: t.topic,
      tier: t.tier,
      slug: p.slug,
      title: p.title,
      difficulty: p.difficulty,
      url: problemUrl(p),
      minutes: MINUTES[p.difficulty] ?? MINUTES.Unknown,
    })),
  );

  const revisionStream = revisions.map((r) => ({
    kind: "revision",
    topic: r.topic,
    slug: r.slug,
    title: r.title,
    difficulty: r.difficulty,
    platform: r.platform,
    lastSolved: r.lastSolved,
    overdueDays: r.overdueDays,
    minutes: REVISION_MINUTES,
  }));

  const days = [];
  let ni = 0;
  let ri = 0;
  for (let d = 0; d < capacity.days; d++) {
    const at = capacity.start + d * DAY;
    const revisionBudget = capacity.minutesPerDay * REVISION_SHARE;
    let spent = 0;
    let revisionSpent = 0;
    const items = [];

    // Revision first, capped. Due work outranks new work on the day it is due,
    // and the cap stops a large backlog turning the entire plan into revision.
    while (ri < revisionStream.length) {
      const item = revisionStream[ri];
      if (revisionSpent + item.minutes > revisionBudget) break;
      items.push(item);
      revisionSpent += item.minutes;
      spent += item.minutes;
      ri++;
    }

    while (ni < newStream.length) {
      const item = newStream[ni];
      // Always place at least one item, or a Hard problem on a 30-minute day
      // would block the plan forever rather than spilling over.
      if (spent + item.minutes > capacity.minutesPerDay && items.length) break;
      items.push(item);
      spent += item.minutes;
      ni++;
    }

    days.push({
      dayIndex: d,
      at,
      date: isoDate(at),
      items,
      minutes: spent,
      themes: [...new Set(items.map((i) => i.topic))],
    });
    if (ni >= newStream.length && ri >= revisionStream.length) break;
  }

  const placedNew = ni;
  const placedRevisions = ri;
  const shortfall =
    placedNew < newStream.length || placedRevisions < revisionStream.length
      ? {
          newUnplaced: newStream.length - placedNew,
          revisionsUnplaced: revisionStream.length - placedRevisions,
          minutesNeeded: [...newStream, ...revisionStream].reduce((s, i) => s + i.minutes, 0),
          minutesAvailable: capacity.totalMinutes,
          /** The topics that fell off the end — the honest version of "you are behind". */
          droppedTopics: [...new Set(newStream.slice(placedNew).map((i) => i.topic))],
        }
      : null;

  return {
    role: { id: role.id, label: role.label, blurb: role.blurb },
    capacity,
    queue,
    revisions,
    /** Day by day, for the first week — the part someone acts on. */
    days: days.slice(0, CONCRETE_DAYS),
    /** Everything after that, as themes. */
    weeks: summariseWeeks(days.slice(CONCRETE_DAYS)),
    totals: {
      newProblems: newStream.length,
      revisions: revisionStream.length,
      minutes: [...newStream, ...revisionStream].reduce((s, i) => s + i.minutes, 0),
    },
    shortfall,
  };
}

/**
 * Days 8 onward, collapsed into weeks of themes.
 *
 * Naming five problems for the third Tuesday from now is false precision — the
 * plan will have changed by then, because solves land and the queue is rebuilt.
 * A theme survives that; a problem list does not.
 */
function summariseWeeks(days) {
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    if (!chunk.length) continue;
    const items = chunk.flatMap((d) => d.items);
    weeks.push({
      weekIndex: weeks.length + 2, // week 1 is the concrete stretch
      from: chunk[0].date,
      to: chunk[chunk.length - 1].date,
      themes: [...new Set(items.map((i) => i.topic))],
      newCount: items.filter((i) => i.kind === "new").length,
      revisionCount: items.filter((i) => i.kind === "revision").length,
      minutes: chunk.reduce((s, d) => s + d.minutes, 0),
    });
  }
  return weeks;
}
