/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Direct GFG API fetcher for problem metadata.
 * Called from the service worker (no CORS issues in MV3 background scripts).
 *
 * GFG Practice API:
 *   GET https://practiceapi.geeksforgeeks.org/api/latest/problems/{slug}/
 *
 * Relevant response fields:
 *   results.problem_name       -> title
 *   results.difficulty         -> "Easy" | "Medium" | "Hard"
 *   results.tags.topic_tags    -> string[]  (tag names)
 *   results.problem_question   -> full HTML problem statement
 *   results.accuracy           -> "54.74%"
 */

import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("GFGApi");

const GFG_API_BASE = "https://practiceapi.geeksforgeeks.org/api/latest/problems";

/** Map the API's `results` object to the shape the rest of the codebase uses. */
function formatResults(data) {
  try {
    // Extract topic tags
    let tags = [];
    const rawTags = data.tags?.topic_tags;
    if (Array.isArray(rawTags)) {
      tags = rawTags.map((t) => (typeof t === "string" ? t : t?.name || "")).filter(Boolean);
    }

    return {
      title: data.problem_name || null,
      difficulty: data.difficulty || data.problem_level_text || null,
      tags,
      problemStatement: data.problem_question
        ? data.problem_question.replace(/\s(?:style|class|dir)=["'][^"']*["']/gi, "")
        : null,
      accuracy: data.accuracy || null,
      allSubmissions: data.all_submissions || null,
    };
  } catch (_) {
    return null;
  }
}

/**
 * Fetch one slug and say what actually happened, because "no data" has two very
 * different meanings here: an HTTP 404 is the API stating this slug names no
 * problem (verified live — the API answers wrong slugs with a genuine 404 and
 * `"Problem not found"`, unlike the website, which serves a 200 shell), while a
 * network error or 5xx says nothing about the slug at all. URL verification
 * must only ever condemn a slug on the former.
 *
 * @param {string} slug
 * @returns {Promise<{data: object|null, miss: boolean}>}
 *   data — formatted metadata on success; miss — true only on a definitive 404
 */
export async function fetchGFGProblemOutcome(slug) {
  if (!slug) return { data: null, miss: false };
  const url = `${GFG_API_BASE}/${encodeURIComponent(slug)}/`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (res.status === 404 || res.status === 410) return { data: null, miss: true };
    if (!res.ok) return { data: null, miss: false };
    const json = await res.json();
    const results = json?.results || null;
    if (!results) return { data: null, miss: false };
    return { data: formatResults(results), miss: false };
  } catch (_) {
    return { data: null, miss: false };
  }
}

/**
 * Fetch problem metadata + description directly from GFG's practice API.
 * Returns null on failure.
 *
 * @param {string} slug  - the GFG problem slug, e.g. "compare-two-fractions4438"
 * @returns {Promise<{title, difficulty, tags, problemStatement} | null>}
 */
export async function fetchGFGProblemData(slug) {
  if (!slug) return null;

  dbg.log(`fetchGFGProblemData(): GET for slug=${slug}`);
  let { data } = await fetchGFGProblemOutcome(slug);

  if (!data) {
    const match = slug.match(/^(.*?)-?\d+$/);
    if (match && match[1]) {
      dbg.log(`fetchGFGProblemData(): miss on ${slug}, retrying with stripped slug=${match[1]}`);
      ({ data } = await fetchGFGProblemOutcome(match[1]));
    }
  }

  if (!data) {
    dbg.warn(`fetchGFGProblemData(): no results in response for slug=${slug}`);
    return null;
  }

  dbg.log(`fetchGFGProblemData(): ✓ fetched metadata for slug=${slug}`, {
    title: data.title,
    difficulty: data.difficulty,
    tagCount: data.tags.length,
    hasStatement: !!data.problemStatement,
  });
  return data;
}
