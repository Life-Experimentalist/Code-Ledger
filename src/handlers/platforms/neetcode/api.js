/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NeetCode's API, as far as CodeLedger uses it.
 *
 * NeetCode runs its own judge — you never leave the site to submit — and every
 * endpoint is a Firebase callable HTTP function: POST, a body of
 * `{ data: { … } }`, and a reply of `{ result: … }`. Calls are made from the
 * content script so the browser attaches the session cookie the user already
 * has; the extension never sees or stores a NeetCode credential.
 *
 * The verdict payload is Judge0-shaped (`status: { id, description }`), which
 * is why `isAccepted` checks both the id and the description: the numeric id
 * is the stable half, the description is the half that survives a Judge0
 * version bump.
 */

import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("NeetCodeAPI");

export const API_BASE = "https://neetcode.io/api";

export const ENDPOINTS = {
  execute: `${API_BASE}/executeCodeFunctionHttp`,
  metadata: `${API_BASE}/getProblemMetadataFunctionHttp`,
  problemList: `${API_BASE}/getProblemListFunctionHttp`,
};

/** Judge0's id for a fully accepted run. */
const ACCEPTED_ID = 3;

/**
 * Peel the Firebase callable envelope.
 *
 * Callables answer `{ result: … }`, but the same shape is sometimes proxied
 * back as `{ data: … }`, and a direct function invocation returns the payload
 * bare. Unwrapping all three costs nothing and saves a class of silent
 * "submission detected, nothing committed" bug.
 *
 * @param {any} body
 * @returns {any}
 */
export function unwrap(body) {
  if (!body || typeof body !== "object") return body;
  if (body.result !== undefined) return unwrap(body.result);
  if (body.data !== undefined && body.status === undefined) return unwrap(body.data);
  return body;
}

/**
 * Did this submission pass every test?
 *
 * A run that passes the visible cases but not all of them still comes back
 * with a non-accepted status, so this is the only check that matters — there
 * is no need to compare `correct_test_case_count` with `test_case_count`.
 *
 * @param {any} payload already unwrapped
 * @returns {boolean}
 */
export function isAccepted(payload) {
  const status = payload?.status;
  if (!status || typeof status !== "object") return false;
  if (Number(status.id) === ACCEPTED_ID) return true;
  return (
    String(status.description || "")
      .trim()
      .toLowerCase() === "accepted"
  );
}

/**
 * Everything worth keeping out of an accepted verdict.
 * @param {any} payload already unwrapped
 */
export function readVerdict(payload) {
  const p = payload || {};
  return {
    accepted: isAccepted(p),
    status: p.status?.description || null,
    // Judge0 reports seconds as a string; the rest of CodeLedger stores the
    // platform's own display string, so format rather than convert.
    runtime: p.time !== undefined && p.time !== null ? `${p.time} s` : null,
    memory: p.memory !== undefined && p.memory !== null ? `${p.memory} KB` : null,
    totalTests: Number(p.test_case_count) || null,
    passedTests: Number(p.correct_test_case_count) || null,
    complexity: typeof p.complexityAnalysis === "string" ? p.complexityAnalysis : null,
    timestamp: p.date ? Date.parse(p.date) || Date.now() : Date.now(),
  };
}

/**
 * Pull the problem id and the submitted source out of a tapped submit request.
 *
 * Reading the code from here rather than from the Monaco editor is worth the
 * extra parsing: the editor can be edited between pressing Submit and the
 * verdict landing, and what gets committed should be what was judged.
 *
 * @param {string|null} requestBody raw JSON string from the tap
 * @returns {{problemId: string, code: string, lang: string}|null}
 */
export function readSubmitRequest(requestBody) {
  if (!requestBody) return null;
  let parsed;
  try {
    parsed = JSON.parse(requestBody);
  } catch (_) {
    return null;
  }
  const d = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;
  if (!d || typeof d !== "object") return null;

  const problemId = d.problemId || d.problem_id || d.slug || "";
  const code = d.rawCode || d.code || d.source_code || "";
  const lang = d.lang || d.language || d.language_id || "";
  if (!problemId || typeof code !== "string" || !code.trim()) return null;

  return { problemId: String(problemId), code, lang: String(lang) };
}

/** POST a callable and return its unwrapped result, or null. */
async function callFunction(url, data) {
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
    if (!res.ok) {
      dbg.warn(`${url} → ${res.status}`);
      return null;
    }
    return unwrap(await res.json());
  } catch (err) {
    dbg.warn(`${url} failed: ${err?.message}`);
    return null;
  }
}

/**
 * Problem metadata: title, difficulty, topic tags, statement.
 * @param {string} problemId the NeetCode slug
 */
export async function fetchProblemMetadata(problemId) {
  const payload = await callFunction(ENDPOINTS.metadata, { problemId });
  if (!payload || typeof payload !== "object") return null;

  const tags = []
    .concat(payload.topics || [], payload.tags || [], payload.tag ? [payload.tag] : [])
    .map((t) => String(t).trim())
    .filter(Boolean);

  return {
    title: payload.name || payload.title || null,
    difficulty: normalizeDifficulty(payload.difficulty),
    tags: [...new Set(tags)],
    description: payload.description || payload.problem || null,
    leetcodeUrl: payload.leetcodeLink || payload.link || null,
  };
}

/**
 * NeetCode writes difficulty in its own casing ("easy", "Easy", "EASY").
 * Everything downstream — points, badges, the difficulty filter — compares
 * against exactly "Easy" / "Medium" / "Hard".
 * @param {any} raw
 * @returns {string|null}
 */
export function normalizeDifficulty(raw) {
  const d = String(raw || "")
    .trim()
    .toLowerCase();
  if (d === "easy") return "Easy";
  if (d === "medium" || d === "med") return "Medium";
  if (d === "hard") return "Hard";
  return null;
}
