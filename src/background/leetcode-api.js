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
 * @param {string} slug  problem titleSlug, e.g. "two-sum"
 * @returns {Promise<{title: string, difficulty: string, tags: string[], problemStatement: string|null} | null>}
 */
export async function fetchLeetCodeProblemData(slug) {
  if (!slug) return null;
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
      dbg.warn(`fetchLeetCodeProblemData(): HTTP ${res.status} for slug=${slug}`);
      return null;
    }
    const json = await res.json();
    const q = json?.data?.question;
    if (!q) {
      dbg.warn(`fetchLeetCodeProblemData(): no question in response for slug=${slug}`);
      return null;
    }
    return {
      title: q.title || slug,
      difficulty: q.difficulty || "",
      tags: (q.topicTags || []).map((t) => t?.name).filter(Boolean),
      // A premium problem answers with an empty body rather than an error. That
      // is not a statement we failed to fetch, it is one we are not allowed to
      // have — reporting null keeps the caller from storing "".
      problemStatement: q.content || null,
    };
  } catch (e) {
    dbg.warn(`fetchLeetCodeProblemData(): ✗ ${e?.message}`);
    return null;
  }
}
