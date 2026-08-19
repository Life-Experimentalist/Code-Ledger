/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GFG URL verification and slug repair.
 *
 * Profile imports can store slugs that match no live GFG URL — the profile
 * page's links drift across GFG's three slug generations, and the site itself
 * serves a 200 HTML shell for dead problem URLs, so nothing downstream ever
 * notices. This module checks each imported record against the practice API
 * (which does answer wrong slugs with a real 404), repairs the slug when one
 * of the known generation variants resolves, and marks the record
 * `urlBroken` when every variant is definitively gone.
 *
 * Marking is as far as it goes: records are never deleted here. The library
 * surfaces broken ones for the user to verify and remove.
 *
 * Everything is dependency-injected so the logic is testable without a
 * service worker: callers supply fetchOutcome/saveProblem/markPending.
 */

import { createDebugger } from "../lib/debug.js";
import { cleanGfgSlug } from "../core/gfg-utils.js";

const dbg = createDebugger("GFGVerify");

/** True when a string already looks like a slug rather than a display title. */
function isSlugLike(s) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*(?:--\d+)?$/.test(s || "");
}

function slugifyTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

/**
 * Ordered, de-duplicated slug candidates for a GFG problem record, covering
 * the three slug generations the profile page has emitted over time:
 *   legacy        name--1234        (≤4 digits; canonical is the concatenation)
 *   transitional  name1234--105678  (canonical is the base name)
 *   modern        name--170646      (≥5 digits; the `--` is part of the slug)
 *
 * @param {object} problem
 * @returns {string[]} at most 5 candidates, most likely first
 */
export function slugCandidates(problem) {
  const raw =
    problem?.titleSlug || String(problem?.id || "").replace(/^(?:gfg|geeksforgeeks)-/, "") || "";
  const out = [];
  const push = (s) => {
    if (s && !out.includes(s)) out.push(s);
  };

  push(cleanGfgSlug(raw));
  push(raw);

  // A concatenated modern id (`name12345`) that lost its `--` — restore it.
  const concat = raw.match(/^(.+?)-?(\d{5,})$/);
  if (concat && !raw.includes("--")) push(`${concat[1]}--${concat[2]}`);

  // Bare base name with every trailing digit run stripped.
  const stripped = raw.replace(/--\d+$/, "").replace(/-?\d+$/, "");
  push(stripped);

  // Last resort: slugify the display title — but only when the title is a
  // real title, not itself slug-shaped (then it adds nothing new).
  if (problem?.title && !isSlugLike(problem.title)) push(slugifyTitle(problem.title));

  return out.slice(0, 5);
}

/**
 * Verify one GFG problem's URL against the practice API, repairing the slug
 * if a variant resolves.
 *
 * Only the `titleSlug` ever changes — the record `id` (and with it the commit
 * path and pending-commit key) is left alone, so an already-committed problem
 * keeps pointing at the same file in the repo.
 *
 * @param {object} problem
 * @param {object} deps
 * @param {(slug: string) => Promise<{data: object|null, miss: boolean}>} deps.fetchOutcome
 * @param {(problem: object) => Promise<any>} deps.saveProblem
 * @param {(problem: object) => Promise<any>} [deps.markPending] called only on repair
 * @param {() => number} [deps.now]
 * @returns {Promise<{status: "ok"|"broken"|"error", slug?: string, repaired?: boolean, data?: object, problem?: object}>}
 *   "ok"     — a candidate resolved (problem = saved record, data = API metadata)
 *   "broken" — every candidate got a definitive 404 (record marked urlBroken)
 *   "error"  — at least one candidate failed non-definitively; nothing marked
 */
export async function verifyGfgProblem(problem, deps) {
  const { fetchOutcome, saveProblem, markPending, now = Date.now } = deps;
  const candidates = slugCandidates(problem);
  if (!candidates.length) return { status: "error" };

  let sawNonMiss = false;
  for (const cand of candidates) {
    const { data, miss } = await fetchOutcome(cand);
    if (data) {
      const repaired = cand !== problem.titleSlug;
      const updated = {
        ...problem,
        titleSlug: cand,
        urlVerifiedAt: now(),
      };
      delete updated.urlBroken;
      delete updated.urlBrokenAt;
      if (repaired) {
        updated.slugRepairedFrom = problem.titleSlug || null;
        dbg.log(`verifyGfgProblem(): repaired slug ${problem.titleSlug} → ${cand}`);
      }
      await saveProblem(updated);
      if (repaired && markPending) await markPending(updated);
      return { status: "ok", slug: cand, repaired, data, problem: updated };
    }
    if (!miss) sawNonMiss = true;
  }

  // A network blip or 5xx among the misses means we cannot condemn the record
  // this pass — only a clean sweep of definitive 404s marks it broken.
  if (sawNonMiss) return { status: "error" };

  const updated = { ...problem, urlBroken: true, urlBrokenAt: now() };
  await saveProblem(updated);
  dbg.warn(
    `verifyGfgProblem(): all candidates 404 for ${problem.titleSlug || problem.id} — marked urlBroken`,
  );
  return { status: "broken", problem: updated };
}

/**
 * Slug from user-pasted input — a full GFG problem URL or a bare slug.
 *
 * Accepts anything the address bar gives: full URL with or without the
 * trailing tab segment (`/1`, `/0`), a bare slug, mixed case, stray spaces,
 * percent-escapes. Returns "" when nothing slug-shaped can be extracted.
 *
 * @param {string} input
 * @returns {string}
 */
export function slugFromInput(input) {
  let s = String(input || "").trim();
  if (!s) return "";
  const m = s.match(/\/problems\/([^/?#]+)/i);
  if (m) s = m[1];
  s = s.replace(/\/+\d*\/?$/, "").trim();
  try {
    s = decodeURIComponent(s);
  } catch (_) {
    // malformed escape — keep as pasted
  }
  s = s.toLowerCase();
  return isSlugLike(s) ? s : "";
}

/**
 * Apply a user-supplied URL/slug to a problem, but only after the practice
 * API confirms it resolves — a manual fix must not be able to replace one
 * broken link with another.
 *
 * As with automatic repair, only `titleSlug` changes: the record id, commit
 * path and pending-commit key all stay put.
 *
 * @param {object} problem
 * @param {string} input user-pasted URL or slug
 * @param {object} deps same shape as verifyGfgProblem's
 * @returns {Promise<{status: "ok"|"invalid"|"notfound"|"error", slug?: string, problem?: object}>}
 *   "ok"       — the slug resolves; record saved with the new slug
 *   "invalid"  — nothing slug-shaped in the input
 *   "notfound" — the API definitively 404s that slug
 *   "error"    — network blip / 5xx; try again
 */
export async function applyManualSlug(problem, input, deps) {
  const { fetchOutcome, saveProblem, markPending, now = Date.now } = deps;
  const slug = slugFromInput(input);
  if (!slug) return { status: "invalid" };

  const { data, miss } = await fetchOutcome(slug);
  if (!data) return { status: miss ? "notfound" : "error" };

  const changed = slug !== problem.titleSlug;
  const updated = { ...problem, titleSlug: slug, urlVerifiedAt: now() };
  delete updated.urlBroken;
  delete updated.urlBrokenAt;
  if (changed) updated.slugRepairedFrom = problem.titleSlug || null;
  await saveProblem(updated);
  if (changed && markPending) await markPending(updated);
  dbg.log(`applyManualSlug(): ${problem.titleSlug || problem.id} → ${slug} (user-supplied)`);
  return { status: "ok", slug, problem: updated };
}

/**
 * Sweep every GFG problem (or a given id subset) through verifyGfgProblem.
 *
 * @param {object} deps  verifyGfgProblem deps plus getAllProblems
 * @param {object} [opts]
 * @param {boolean} [opts.onlyUnverified=true] skip records already stamped urlVerifiedAt or urlBroken
 * @param {number} [opts.delayMs=250] pause between API calls
 * @param {string[]} [opts.ids] restrict to these record ids (ignores onlyUnverified)
 * @returns {Promise<{checked: number, ok: number, repaired: number, broken: number, errors: number}>}
 */
export async function runGfgVerifySweep(deps, opts = {}) {
  const { onlyUnverified = true, delayMs = 250, ids } = opts;
  const all = (await deps.getAllProblems()) || [];
  let targets = all.filter((p) => p?.platform === "geeksforgeeks");
  if (Array.isArray(ids)) {
    const idSet = new Set(ids);
    targets = targets.filter((p) => idSet.has(p.id));
  } else if (onlyUnverified) {
    targets = targets.filter((p) => !p.urlVerifiedAt && !p.urlBroken);
  }

  const counts = { checked: 0, ok: 0, repaired: 0, broken: 0, errors: 0 };
  for (const problem of targets) {
    const result = await verifyGfgProblem(problem, deps);
    counts.checked++;
    if (result.status === "ok") {
      counts.ok++;
      if (result.repaired) counts.repaired++;
    } else if (result.status === "broken") {
      counts.broken++;
    } else {
      counts.errors++;
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  dbg.log("runGfgVerifySweep(): done", counts);
  return counts;
}
