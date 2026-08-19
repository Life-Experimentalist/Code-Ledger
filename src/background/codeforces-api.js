/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Codeforces metadata fetcher for the background self-heal pass.
 *
 * LeetCode and GeeksForGeeks each publish a JSON endpoint that answers with a
 * problem's statement; Codeforces publishes no such thing. What it does publish
 * is the problem page itself, served rendered, at a stable URL that
 * `cfProblemUrl` can build from the slug the import already stored. That is a
 * plain public GET, no different in kind from the two JSON calls beside it —
 * nothing is opened, no tab appears, and cookies are deliberately left behind
 * so the request is not made as the signed-in user.
 *
 * The catch is that the answer is HTML, and an MV3 service worker has no
 * DOMParser. `extractStatementHtml` therefore walks the markup by hand: it
 * finds the `problem-statement` div and counts `<div>` against `</div>` until
 * the matching close. An unbalanced document yields nothing rather than a
 * guess, so a truncated page or one of Codeforces' interstitial challenge
 * responses is treated as a failed fetch and retried later.
 *
 * The extracted value is the div's inner HTML — the same shape the content
 * script stores when it captures a statement at submit time, so a healed
 * problem and a live one render identically.
 */

import { cfProblemUrl, splitCFSlug } from "../core/cf-utils.js";
import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("CFApi");

/** Matches the live capture's ceiling in codeforces/submission-detector.js. */
const MAX_STATEMENT_CHARS = 60000;

const STATEMENT_OPEN_RE = /<div[^>]*\bclass\s*=\s*["'][^"']*\bproblem-statement\b[^"']*["'][^>]*>/i;
const DIV_TAG_RE = /<\/?div\b[^>]*>/gi;
const TAG_BOX_RE =
  /<span[^>]*\bclass\s*=\s*["'][^"']*\btag-box\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;

/**
 * The inner HTML of the problem-statement div, or null when it is not there
 * whole. Exported for its own tests — this is the only fragile part.
 *
 * @param {string} html a full Codeforces problem page
 * @returns {string|null}
 */
export function extractStatementHtml(html) {
  const text = String(html || "");
  const open = STATEMENT_OPEN_RE.exec(text);
  if (!open) return null;

  const start = open.index + open[0].length;
  DIV_TAG_RE.lastIndex = start;
  let depth = 1;
  let m;
  while ((m = DIV_TAG_RE.exec(text)) !== null) {
    depth += m[0][1] === "/" ? -1 : 1;
    if (depth === 0) {
      const inner = text.slice(start, m.index).trim();
      return inner ? inner.slice(0, MAX_STATEMENT_CHARS) : null;
    }
  }
  return null;
}

/**
 * The problem's tags, from the sidebar boxes.
 *
 * Must agree with `CodeforcesHandler._extractTags`, which reads the same boxes
 * off the live DOM: the rating shares the tag-box class and is dropped, so a
 * problem is never tagged "1500".
 *
 * @param {string} html
 * @returns {string[]}
 */
export function extractTags(html) {
  const text = String(html || "");
  const tags = [];
  TAG_BOX_RE.lastIndex = 0;
  let m;
  while ((m = TAG_BOX_RE.exec(text)) !== null) {
    const t = m[1]
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, " ")
      .trim();
    if (!t || /^\*?\d+$/.test(t)) continue;
    if (!tags.includes(t)) tags.push(t);
  }
  return tags;
}

/**
 * Fetch what the problem page can tell us about a problem.
 *
 * Returns only the two fields self-heal can fill. Title and difficulty are
 * left out on purpose: the profile import reads both from `user.status`, which
 * states them outright, and there is nothing to gain from second-guessing that
 * with a scrape.
 *
 * @param {string} slug e.g. "4A", "gym100500B"
 * @returns {Promise<{tags: string[], problemStatement: string}|null>} null when
 *   the page could not be read — the caller treats that as a failed attempt
 */
export async function fetchCFProblemData(slug) {
  const url = cfProblemUrl(slug);
  if (!url) {
    dbg.warn(`fetchCFProblemData(): no URL for slug=${slug}`);
    return null;
  }

  let html;
  try {
    const res = await fetch(url, { credentials: "omit", headers: { Accept: "text/html" } });
    if (!res.ok) {
      dbg.warn(`fetchCFProblemData(): ${res.status} for ${url}`);
      return null;
    }
    html = await res.text();
  } catch (e) {
    dbg.error(`fetchCFProblemData(): ✗ failed for slug=${slug}:`, e?.message);
    return null;
  }

  const problemStatement = extractStatementHtml(html);
  if (!problemStatement) {
    // Codeforces answers a first request with a JS challenge page often enough
    // that this is expected rather than exceptional. Backing off is the answer.
    dbg.warn(`fetchCFProblemData(): no statement in the response for slug=${slug}`);
    return null;
  }

  const tags = extractTags(html);
  dbg.log(
    `fetchCFProblemData(): ✓ ${slug} — ${problemStatement.length} chars, ${tags.length} tag(s)`,
  );
  return { tags, problemStatement };
}

// ── Link verification ───────────────────────────────────────────────────────
//
// Codeforces has no per-problem JSON endpoint, and the problem page answers a
// wrong URL with a redirect to the problemset — useless as a yes/no. What it
// does publish is `problemset.problems`: the complete list of every regular
// problemset problem (~11k entries, ~2MB). Membership in a successfully
// fetched list is a definitive answer for non-gym slugs. Gym problems are
// absent from that list by design, so a gym slug can never be condemned —
// only its shape can be validated.

const PROBLEMSET_URL = "https://codeforces.com/api/problemset.problems";
/** The problemset changes a few times a week; a stale set only delays a verdict. */
const PROBLEMSET_TTL_MS = 6 * 60 * 60 * 1000;

let _problemsetSlugs = null;
let _problemsetFetchedAt = 0;

/**
 * The set of `{contestId}{index}` keys in a problemset.problems payload, or
 * null when the payload is not a successful listing. Exported for tests.
 *
 * @param {object} payload  parsed problemset.problems response
 * @returns {Set<string>|null}
 */
export function slugSetFromProblemset(payload) {
  if (payload?.status !== "OK" || !Array.isArray(payload?.result?.problems)) return null;
  const set = new Set();
  for (const p of payload.result.problems) {
    if (p?.contestId != null && p?.index) set.add(`${p.contestId}${p.index}`);
  }
  return set.size ? set : null;
}

/**
 * The verdict a slug set gives for one slug. Pure — exported for tests.
 *
 * @param {Set<string>} slugSet  from slugSetFromProblemset
 * @param {string} slug  e.g. "4A", "gym100500B"
 * @returns {{data: object|null, miss: boolean, unverifiable?: boolean}}
 *   miss is true only when the answer is definitive: a slug no URL can be
 *   built from, or a non-gym slug absent from the full listing. Gym slugs
 *   come back `unverifiable` — the listing cannot see them.
 */
export function cfOutcomeFromSlugSet(slugSet, slug) {
  const parts = splitCFSlug(slug);
  // No URL can ever be built from this slug — that is broken by construction,
  // no network answer required.
  if (!parts) return { data: null, miss: true };
  if (parts.isGym) return { data: null, miss: false, unverifiable: true };
  return slugSet.has(`${parts.contestId}${parts.index}`)
    ? { data: { slug }, miss: false }
    : { data: null, miss: true };
}

/**
 * Definitive-where-possible existence check for a Codeforces problem slug.
 *
 * @param {string} slug
 * @returns {Promise<{data: object|null, miss: boolean, unverifiable?: boolean}>}
 */
export async function fetchCFProblemOutcome(slug) {
  const parts = splitCFSlug(slug);
  if (!parts) return { data: null, miss: true };
  if (parts.isGym) return { data: null, miss: false, unverifiable: true };

  if (!_problemsetSlugs || Date.now() - _problemsetFetchedAt > PROBLEMSET_TTL_MS) {
    try {
      const res = await fetch(PROBLEMSET_URL, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        dbg.warn(`fetchCFProblemOutcome(): HTTP ${res.status} from problemset.problems`);
        return { data: null, miss: false };
      }
      const set = slugSetFromProblemset(await res.json());
      if (!set) {
        dbg.warn(`fetchCFProblemOutcome(): problemset.problems answered without a listing`);
        return { data: null, miss: false };
      }
      _problemsetSlugs = set;
      _problemsetFetchedAt = Date.now();
      dbg.log(`fetchCFProblemOutcome(): cached ${set.size} problemset slugs`);
    } catch (e) {
      dbg.warn(`fetchCFProblemOutcome(): ✗ ${e?.message}`);
      return { data: null, miss: false };
    }
  }

  return cfOutcomeFromSlugSet(_problemsetSlugs, slug);
}
