/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The pure half of the Codeforces profile import.
 *
 * Codeforces publishes every submission a user has ever made through
 * `GET /api/user.status`, and the endpoint answers with `Access-Control-Allow-
 * Origin: *` — a content script can read it directly. What it does not publish
 * is the source code: there is no public endpoint for a submission's text, so an
 * imported problem arrives with an empty `code`. That is the whole reason this
 * module builds records rather than commits.
 *
 * Nothing here touches the DOM, the network or storage, so it is testable on its
 * own; `profile-import.js` does the fetching and the batching.
 */

import { buildCFSlug } from "../../../core/cf-utils.js";
import { resolveLang, normalizeCFRating } from "./lang-utils.js";

const CF_API_BASE = "https://codeforces.com/api";

/**
 * Codeforces documents one request per two seconds and answers a faster caller
 * with `Call limit exceeded`. The extra 100ms covers clock jitter.
 */
export const CF_MIN_GAP_MS = 2100;

/** Submissions per request. `user.status` pages through `from`/`count`. */
export const CF_PAGE_SIZE = 1000;

/**
 * @param {string} handle
 * @param {number} from 1-based index of the first submission to return
 * @param {number} count
 * @returns {string} "" when there is no handle to ask about
 */
export function buildUserStatusUrl(handle, from = 1, count = CF_PAGE_SIZE) {
  const h = String(handle || "").trim();
  if (!h) return "";
  return `${CF_API_BASE}/user.status?handle=${encodeURIComponent(h)}&from=${from}&count=${count}`;
}

function formatMemory(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * Turn one `user.status` response into the solves it describes.
 *
 * Only accepted submissions count, and only ones whose problem can be addressed
 * by contest and index — an acmsguru problem has a numeric index and no contest,
 * so no slug can be built for it and it is skipped rather than filed wrongly.
 *
 * @param {any} payload the parsed JSON body
 * @returns {{ ok: boolean, error: string|null, solves: Array<object>, seen: number }}
 *   `seen` counts the submissions in the response, which is what tells the
 *   caller whether another page is waiting.
 */
export function extractSolves(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Codeforces returned an empty response.", solves: [], seen: 0 };
  }
  if (payload.status !== "OK") {
    return {
      ok: false,
      error: String(payload.comment || "Codeforces refused the request.").trim(),
      solves: [],
      seen: 0,
    };
  }

  const result = Array.isArray(payload.result) ? payload.result : [];
  const solves = [];

  for (const entry of result) {
    if (entry?.verdict !== "OK") continue;
    const problem = entry.problem;
    if (!problem) continue;

    const slug = buildCFSlug(problem.contestId, problem.index);
    if (!slug) continue;

    const seconds = Number(entry.creationTimeSeconds);
    solves.push({
      slug,
      title: String(problem.name || slug),
      difficulty: normalizeCFRating(problem.rating),
      rating: Number.isFinite(problem.rating) ? problem.rating : null,
      tags: Array.isArray(problem.tags) ? problem.tags.filter((t) => typeof t === "string") : [],
      lang: resolveLang(entry.programmingLanguage),
      // Codeforces stamps every submission, so an import never has to guess a
      // date the way the GeeksForGeeks one does.
      timestamp: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null,
      runtime: Number.isFinite(entry.timeConsumedMillis) ? `${entry.timeConsumedMillis} ms` : null,
      memory: formatMemory(Number(entry.memoryConsumedBytes)),
    });
  }

  return { ok: true, error: null, solves, seen: result.length };
}

/**
 * Fold solves into a slug-keyed map, keeping the earliest accepted one.
 *
 * A problem re-solved a year later is still solved on the first date; taking the
 * newest would move the whole back catalogue forward and pile it onto the
 * heatmap in the wrong place. An undated entry never displaces a dated one.
 *
 * @param {Map<string, object>} into
 * @param {Array<object>} solves
 * @returns {Map<string, object>} the same map, for chaining
 */
export function mergeSolves(into, solves) {
  for (const solve of solves || []) {
    const prev = into.get(solve.slug);
    if (!prev) {
      into.set(solve.slug, solve);
      continue;
    }
    if (prev.timestamp === null) {
      if (solve.timestamp !== null) into.set(solve.slug, solve);
      continue;
    }
    if (solve.timestamp !== null && solve.timestamp < prev.timestamp) into.set(solve.slug, solve);
  }
  return into;
}
