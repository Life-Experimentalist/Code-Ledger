/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Self-heal — fill in the parts of a solve the platform did not hand over.
 *
 * A solve can land incomplete for reasons that have nothing to do with the
 * user: a profile import knows the slug and nothing else, a submission page
 * renders the verdict before the tags load, a network blip eats the statement
 * request. The library then shows "No problem statement cached locally" with a
 * button next to it, and the repair only happens if the user finds the button,
 * presses it, and waits with the modal open.
 *
 * This module does that waiting instead. It runs on an alarm, picks a couple of
 * incomplete problems per tick, asks the platform for what is missing, and
 * writes the answer to storage — so the data is there whether or not anything
 * is on screen when it arrives.
 *
 * Two rules keep it from becoming a nuisance:
 *
 *   - It only ever *fills gaps*. A field that already holds something is never
 *     overwritten, so nothing the user typed can be undone by a background job.
 *   - A problem that fails backs off, and after MAX_HEAL_ATTEMPTS it is left
 *     alone. Some problems genuinely have no statement to fetch — LeetCode
 *     premium, a slug the platform has since retired — and retrying those
 *     forever is just traffic.
 *
 * Everything here takes its collaborators as arguments. The service worker
 * supplies the real storage and fetchers; the tests supply fakes.
 */

import { normalizeDifficulty } from "../core/difficulty-map.js";
import { CONSTANTS } from "../core/constants.js";

/** Storage key holding the per-problem attempt bookkeeping. */
export const HEAL_STATE_KEY = "_selfHealState";

/** After this many failures a problem is left alone until asked for by hand. */
export const MAX_HEAL_ATTEMPTS = 5;

/** Wait after the 1st, 2nd, … failed attempt. The last entry repeats. */
const BACKOFF_MINUTES = [15, 60, 360, 1440, 10080];

/**
 * Platforms the worker can ask about on its own.
 *
 * LeetCode and GeeksForGeeks answer with JSON. Codeforces has no
 * problem-statement API at all, so its fetcher reads the public problem page
 * instead — still a plain GET the worker makes itself, with no tab opened and
 * no cookies sent. NeetCode and takeuforward are absent because neither
 * publishes a statement anywhere; theirs is written by the AI review, under a
 * heading that says so.
 */
export const HEALABLE_PLATFORMS = ["leetcode", "geeksforgeeks", "codeforces"];

/** Which fields healing can supply, and how it tells one is missing. */
export const HEALABLE_FIELDS = {
  statement: (p) => !String(p?.problemStatement || "").trim(),
  tags: (p) => !Array.isArray(p?.tags) || p.tags.length === 0,
};

/**
 * The parts of `problem` that are missing and fetchable.
 * @returns {string[]} keys of HEALABLE_FIELDS, in a stable order
 */
export function missingParts(problem) {
  return Object.keys(HEALABLE_FIELDS).filter((k) => HEALABLE_FIELDS[k](problem));
}

/** The platform slug to ask about, from either the record or its id. */
export function healSlug(problem) {
  const raw =
    problem?.titleSlug || String(problem?.id || "").replace(CONSTANTS.platformIdRegex(), "");
  return String(raw || "").trim();
}

/** Can this problem be healed at all — right platform, and a slug to ask with? */
export function isHealable(problem) {
  // urlBroken records verified as dead URLs — every heal attempt would fetch a
  // 404, burn all five backoff slots, and go permanently silent. The GFG
  // verification sweep owns those; it clears the flag if the slug is repaired.
  return (
    HEALABLE_PLATFORMS.includes(problem?.platform) &&
    Boolean(healSlug(problem)) &&
    !problem?.urlBroken
  );
}

/** Milliseconds to wait after `attempts` consecutive failures. */
export function backoffMs(attempts) {
  const i = Math.min(Math.max(attempts, 1), BACKOFF_MINUTES.length) - 1;
  return BACKOFF_MINUTES[i] * 60_000;
}

/**
 * Problems worth attempting on this tick, worst-served first.
 *
 * @param {object[]} problems
 * @param {Record<string, {attempts?: number, nextAt?: number}>} state
 * @param {number} now
 * @param {number} limit
 */
export function selectHealBatch(problems, state = {}, now = Date.now(), limit = 2) {
  const due = (problems || []).filter((p) => {
    if (!isHealable(p) || missingParts(p).length === 0) return false;
    const s = state[p.id] || {};
    if ((s.attempts || 0) >= MAX_HEAL_ATTEMPTS) return false;
    return !s.nextAt || s.nextAt <= now;
  });
  // A problem missing both fields is more broken than one missing tags alone,
  // and among equals the one that has been waiting longest goes first — so a
  // stalled import drains in the order it was created rather than at random.
  due.sort((a, b) => {
    const byGap = missingParts(b).length - missingParts(a).length;
    if (byGap !== 0) return byGap;
    return (state[a.id]?.attempts || 0) - (state[b.id]?.attempts || 0);
  });
  return due.slice(0, Math.max(0, limit));
}

/**
 * Merge fetched metadata into a problem *without overwriting anything*.
 *
 * @param {object} problem
 * @param {{title?: string, difficulty?: string, tags?: string[], problemStatement?: string}} data
 * @returns {{merged: object, changed: string[]}}
 */
export function applyMetadata(problem, data) {
  const merged = { ...problem };
  const changed = [];
  const slug = healSlug(problem);

  // The title placeholder an import leaves behind is the slug itself. That is
  // not a title the user chose, so replacing it is filling a gap, not an edit.
  const titlePlaceholder = !merged.title || merged.title === slug;
  if (titlePlaceholder && data?.title && data.title !== merged.title) {
    merged.title = data.title;
    changed.push("title");
  }
  if (!merged.difficulty && data?.difficulty) {
    const d = normalizeDifficulty(data.difficulty);
    if (d) {
      merged.difficulty = d;
      changed.push("difficulty");
    }
  }
  if (HEALABLE_FIELDS.tags(merged) && Array.isArray(data?.tags) && data.tags.length) {
    merged.tags = [...data.tags];
    changed.push("tags");
  }
  if (HEALABLE_FIELDS.statement(merged) && String(data?.problemStatement || "").trim()) {
    merged.problemStatement = data.problemStatement;
    changed.push("statement");
  }
  return { merged, changed };
}

/**
 * Fetch and merge metadata for one problem. Saves only when something changed —
 * a no-op write would still bump the record into the next commit.
 *
 * @param {object} problem
 * @param {{fetchers: Record<string, (slug: string) => Promise<any>>, saveProblem: Function, notify?: Function}} deps
 * @returns {Promise<{ok: boolean, changed: string[], stillMissing: string[], error?: string}>}
 */
export async function healProblem(problem, deps) {
  if (!isHealable(problem)) {
    return { ok: false, changed: [], stillMissing: missingParts(problem), error: "not healable" };
  }
  const fetcher = deps.fetchers?.[problem.platform];
  if (!fetcher) {
    return { ok: false, changed: [], stillMissing: missingParts(problem), error: "no fetcher" };
  }

  let data = null;
  try {
    data = await fetcher(healSlug(problem));
  } catch (e) {
    return {
      ok: false,
      changed: [],
      stillMissing: missingParts(problem),
      error: e?.message || "fetch failed",
    };
  }
  if (!data) {
    return {
      ok: false,
      changed: [],
      stillMissing: missingParts(problem),
      error: "platform returned nothing",
    };
  }

  const { merged, changed } = applyMetadata(problem, data);
  if (changed.length) {
    await deps.saveProblem(merged);
    deps.notify?.(merged, changed);
  }
  // A fetch that answered but filled nothing still counts as answered: the data
  // is not there to be had, and hammering the endpoint will not change that.
  return { ok: true, changed, stillMissing: missingParts(merged) };
}

/**
 * Record the outcome of one attempt.
 * @returns {object|null} the new state entry, or null when the entry should go
 */
export function nextHealState(prev = {}, result, now = Date.now()) {
  if (result.ok && result.stillMissing.length === 0) return null; // whole, forget it
  const attempts = (prev.attempts || 0) + 1;
  return {
    attempts,
    lastAt: now,
    nextAt: now + backoffMs(attempts),
    ...(result.error ? { lastError: String(result.error).slice(0, 200) } : {}),
  };
}

/**
 * One pass: pick a batch, heal it, persist the bookkeeping.
 *
 * @param {object} deps
 * @param {() => Promise<object[]>} deps.getAllProblems
 * @param {Function} deps.saveProblem
 * @param {() => Promise<object>} deps.loadState
 * @param {(s: object) => Promise<void>} deps.saveState
 * @param {Record<string, Function>} deps.fetchers
 * @param {Function} [deps.notify]
 * @param {() => number} [deps.now]
 * @param {{limit?: number}} [opts]
 */
export async function runSelfHeal(deps, { limit = 2 } = {}) {
  const now = deps.now ? deps.now() : Date.now();
  const problems = await deps.getAllProblems();
  const state = (await deps.loadState()) || {};

  const batch = selectHealBatch(problems, state, now, limit);
  const summary = { attempted: 0, healed: 0, changed: [] };

  for (const p of batch) {
    summary.attempted++;
    const result = await healProblem(p, deps);
    if (result.changed.length) {
      summary.healed++;
      summary.changed.push({ id: p.id, fields: result.changed });
    }
    const entry = nextHealState(state[p.id], result, now);
    if (entry) state[p.id] = entry;
    else delete state[p.id];
  }

  // Drop bookkeeping for problems that are gone or complete — otherwise the map
  // grows for the life of the install and never shrinks.
  const byId = new Map(problems.map((p) => [p.id, p]));
  for (const id of Object.keys(state)) {
    const p = byId.get(id);
    if (!p || missingParts(p).length === 0) delete state[id];
  }

  await deps.saveState(state);
  return summary;
}

/**
 * Everything still incomplete, with why, for the UI to report honestly.
 * @param {object[]} problems
 * @param {object} state
 */
export function healStatus(problems = [], state = {}) {
  let incomplete = 0;
  let waiting = 0;
  let givenUp = 0;
  let unfetchable = 0;
  for (const p of problems) {
    if (missingParts(p).length === 0) continue;
    incomplete++;
    if (!isHealable(p)) unfetchable++;
    else if ((state[p.id]?.attempts || 0) >= MAX_HEAL_ATTEMPTS) givenUp++;
    else waiting++;
  }
  return { incomplete, waiting, givenUp, unfetchable };
}
