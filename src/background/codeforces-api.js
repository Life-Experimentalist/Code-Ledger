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

import { cfProblemUrl } from "../core/cf-utils.js";
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
