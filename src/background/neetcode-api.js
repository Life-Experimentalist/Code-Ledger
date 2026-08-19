/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NeetCode metadata probe, called from the service worker.
 *
 * NeetCode's problem metadata lives behind a Firebase callable that the site
 * exposes over plain HTTPS. It answers without any session cookie, and its
 * miss signal is unambiguous (verified against the live endpoint): a known
 * problemId returns HTTP 200 with `{"data": {...}}`, an unknown one returns
 * HTTP 200 with `{"data": null}`. That makes `data: null` on a clean 200 a
 * definitive "no such problem" — everything else (HTTP error, network
 * failure, malformed body) is indefinite and must never condemn a record.
 *
 * The content-side handler has its own richer client in
 * `handlers/platforms/neetcode/api.js`; this file exists so the worker can
 * ask the one existence question without importing content-script plumbing.
 */

import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("NeetCodeApi");

const METADATA_URL = "https://neetcode.io/api/getProblemMetadataFunctionHttp";

/**
 * @param {string} problemId  NeetCode problem id, e.g. "two-integer-sum"
 * @returns {Promise<{data: object|null, miss: boolean}>}
 */
export async function fetchNeetCodeProblemOutcome(problemId) {
  if (!problemId) return { data: null, miss: true };
  try {
    const res = await fetch(METADATA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ data: { problemId } }),
    });
    if (!res.ok) {
      dbg.warn(`fetchNeetCodeProblemOutcome(): HTTP ${res.status} for id=${problemId}`);
      return { data: null, miss: false };
    }
    const json = await res.json().catch(() => undefined);
    if (!json || !("data" in json)) {
      dbg.warn(`fetchNeetCodeProblemOutcome(): malformed response for id=${problemId}`);
      return { data: null, miss: false };
    }
    if (json.data === null) {
      dbg.warn(`fetchNeetCodeProblemOutcome(): no such problem: id=${problemId}`);
      return { data: null, miss: true };
    }
    return { data: json.data, miss: false };
  } catch (e) {
    dbg.warn(`fetchNeetCodeProblemOutcome(): ✗ ${e?.message}`);
    return { data: null, miss: false };
  }
}
