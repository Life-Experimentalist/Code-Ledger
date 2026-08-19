/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Direct LeetCode fetcher for problem metadata, called from the service worker.
 *
 * The content script can already read this off the page, but only while a tab
 * is sitting on the problem. Repairing a library of a few hundred problems that
 * way means opening a few hundred tabs. The `question(titleSlug:)` GraphQL field
 * is public — no session cookie, no submission data — so the worker can ask for
 * it directly and the user never sees a tab.
 *
 * Returns the same shape as `fetchGFGProblemData` so callers do not care which
 * platform they are healing.
 */

import { createDebugger } from "../lib/debug.js";
import { QUERIES } from "../handlers/platforms/leetcode/graphql-queries.js";

const dbg = createDebugger("LeetCodeApi");

const GRAPHQL_URL = "https://leetcode.com/graphql";

/**
 * Like `fetchLeetCodeProblemData`, but distinguishes "that slug does not
 * exist" from "the request failed". LeetCode answers a nonexistent slug with
 * HTTP 200 and `data.question: null` — that is a definitive miss. Anything
 * else that yields no question (HTTP error, network failure, malformed body)
 * is indefinite and must never condemn a record.
 *
 * @param {string} slug  problem titleSlug, e.g. "two-sum"
 * @returns {Promise<{data: object|null, miss: boolean}>}
 */
export async function fetchLeetCodeProblemOutcome(slug) {
  if (!slug) return { data: null, miss: true };
  try {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: QUERIES.QUESTION,
        variables: { titleSlug: slug },
        operationName: "questionData",
      }),
    });
    if (!res.ok) {
      dbg.warn(`fetchLeetCodeProblemOutcome(): HTTP ${res.status} for slug=${slug}`);
      return { data: null, miss: false };
    }
    const json = await res.json();
    if (json?.data && json.data.question === null) {
      dbg.warn(`fetchLeetCodeProblemOutcome(): no such problem: slug=${slug}`);
      return { data: null, miss: true };
    }
    const q = json?.data?.question;
    if (!q) {
      dbg.warn(`fetchLeetCodeProblemOutcome(): malformed response for slug=${slug}`);
      return { data: null, miss: false };
    }
    return {
      data: {
        title: q.title || slug,
        difficulty: q.difficulty || "",
        tags: (q.topicTags || []).map((t) => t?.name).filter(Boolean),
        // A premium problem answers with an empty body rather than an error. That
        // is not a statement we failed to fetch, it is one we are not allowed to
        // have — reporting null keeps the caller from storing "".
        problemStatement: q.content || null,
      },
      miss: false,
    };
  } catch (e) {
    dbg.warn(`fetchLeetCodeProblemOutcome(): ✗ ${e?.message}`);
    return { data: null, miss: false };
  }
}

/**
 * @param {string} slug  problem titleSlug, e.g. "two-sum"
 * @returns {Promise<{title: string, difficulty: string, tags: string[], problemStatement: string|null} | null>}
 */
export async function fetchLeetCodeProblemData(slug) {
  const { data } = await fetchLeetCodeProblemOutcome(slug);
  return data;
}
