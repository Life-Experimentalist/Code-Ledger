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

/**
 * Fetch problem metadata + description directly from GFG's practice API.
 * Returns null on failure.
 *
 * @param {string} slug  - the GFG problem slug, e.g. "compare-two-fractions4438"
 * @returns {Promise<{title, difficulty, tags, problemStatement} | null>}
 */
export async function fetchGFGProblemData(slug) {
  if (!slug) return null;

  const tryFetch = async (s) => {
    const url = `${GFG_API_BASE}/${encodeURIComponent(s)}/`;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json?.results || null;
    } catch (_) {
      return null;
    }
  };

  dbg.log(`fetchGFGProblemData(): GET for slug=${slug}`);
  let data = await tryFetch(slug);

  if (!data) {
    const match = slug.match(/^(.*?)-?\d+$/);
    if (match && match[1]) {
      dbg.log(`fetchGFGProblemData(): 404 on ${slug}, retrying with stripped slug=${match[1]}`);
      data = await tryFetch(match[1]);
    }
  }

  if (!data) {
    dbg.warn(`fetchGFGProblemData(): no results in response for slug=${slug}`);
    return null;
  }

  try {
    // Extract topic tags
    let tags = [];
    const rawTags = data.tags?.topic_tags;
    if (Array.isArray(rawTags)) {
      tags = rawTags.map((t) => (typeof t === "string" ? t : t?.name || "")).filter(Boolean);
    }

    const result = {
      title: data.problem_name || null,
      difficulty: data.difficulty || data.problem_level_text || null,
      tags,
      problemStatement: data.problem_question
        ? data.problem_question.replace(/\s(?:style|class|dir)=["'][^"']*["']/gi, "")
        : null,
      accuracy: data.accuracy || null,
      allSubmissions: data.all_submissions || null,
    };

    dbg.log(`fetchGFGProblemData(): ✓ fetched metadata for slug=${slug}`, {
      title: result.title,
      difficulty: result.difficulty,
      tagCount: result.tags.length,
      hasStatement: !!result.problemStatement,
    });

    return result;
  } catch (e) {
    dbg.error(`fetchGFGProblemData(): ✗ failed for slug=${slug}:`, e?.message);
    return null;
  }
}
