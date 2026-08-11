/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NeetCode submission detection.
 *
 * One request does everything: the page POSTs the source to
 * `executeCodeFunctionHttp` and the verdict comes back in that same response.
 * There is no polling and no page navigation, which is why there is no
 * MutationObserver here — the DOM never has to be believed.
 *
 * The whole flow is:
 *   net-tap.js (MAIN world) sees the POST
 *     → postMessage
 *       → watchSubmissions() below pairs the request with its response
 *         → the handler builds the commit
 *
 * Both halves come from the same tapped message, so the committed source is
 * always the source that was judged, even if the user keeps typing while the
 * judge is running.
 */

import { subscribeTap, parseJsonSafe } from "../../../lib/net-tap-client.js";
import { ENDPOINTS, unwrap, readVerdict, readSubmitRequest } from "./api.js";
import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("NeetCodeDetector");

/** Matched as a substring so a host or version change does not break it. */
const EXECUTE_PATH = "/api/executeCodeFunctionHttp";

/**
 * Turn one tapped execute call into a solve, or into nothing.
 *
 * Exported on its own because it is pure: given the two raw bodies it decides
 * whether a commit is warranted, with no window, no storage and no clock.
 *
 * @param {{requestBody: string|null, responseBody: string|null, status: number}} payload
 * @returns {{problemId: string, code: string, lang: string,
 *            verdict: ReturnType<typeof readVerdict>}|null}
 */
export function readTappedSolve(payload) {
  if (!payload) return null;
  // A judge that answered anything other than 200 did not accept anything.
  if (payload.status && payload.status !== 200) return null;

  const request = readSubmitRequest(payload.requestBody);
  if (!request) return null;

  const body = unwrap(parseJsonSafe(payload.responseBody));
  if (!body) return null;

  const verdict = readVerdict(body);
  if (!verdict.accepted) {
    dbg.log(`Not accepted (${verdict.status || "no status"}) — ignoring`);
    return null;
  }

  return { ...request, verdict };
}

/**
 * Watch for accepted NeetCode submissions.
 *
 * @param {(solve: NonNullable<ReturnType<typeof readTappedSolve>>) => void} onAccepted
 * @returns {() => void} unsubscribe
 */
export function watchSubmissions(onAccepted) {
  dbg.log("Listening for judge responses");
  return subscribeTap(
    (url) => url.includes(EXECUTE_PATH),
    (payload) => {
      const solve = readTappedSolve(payload);
      if (!solve) return;
      dbg.log(`Accepted: ${solve.problemId}`);
      onAccepted(solve);
    },
  );
}

/** The execute endpoint, re-exported so the handler need not import api.js. */
export const EXECUTE_ENDPOINT = ENDPOINTS.execute;
