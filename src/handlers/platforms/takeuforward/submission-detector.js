/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * takeuforward submission detection.
 *
 * Unlike NeetCode, TUF's judge is asynchronous. Submitting is two calls:
 *
 *   POST /v1/plus/judge/submit        — carries the source; returns a handle
 *   GET  /v1/plus/judge/check-submit  — polled until the verdict lands
 *
 * So the code and the verdict arrive in different messages and have to be
 * paired. `SubmissionTracker` does that pairing and is deliberately a plain
 * object with an injected clock: no window, no storage, no DOM, so the whole
 * correlation can be tested without a browser.
 *
 * Pairing prefers an id — if the submit response names a submission and the
 * check-submit url carries one, they must match. When neither side exposes an
 * id, it falls back to "the submission that was just made", which is correct
 * in practice because the page will not let a second submission start while
 * one is being judged. A pending submission is dropped after five minutes so
 * a stale one can never be paired with a much later verdict.
 *
 * ⚠️ The verdict payload shape is unverified — see the header of ./api.js. An
 * unrecognised shape here means nothing is committed, never that the wrong
 * thing is committed.
 */

import { subscribeTap, parseJsonSafe } from "../../../lib/net-tap-client.js";
import { TAP_PATHS, unwrap, readVerdict, readSubmitRequest } from "./api.js";
import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("TUFDetector");

/** A submission still being judged after this long is not ours to pair. */
export const PENDING_TTL_MS = 5 * 60 * 1000;

/** Where a submission id might be named, in a request, response, or query. */
const ID_KEYS = ["submission_id", "submissionId", "id", "token", "job_id", "jobId"];

/**
 * Pull a submission id out of an unwrapped payload, or null.
 * @param {any} data
 */
export function readSubmissionId(data) {
  if (!data || typeof data !== "object") return null;
  for (const k of ID_KEYS) {
    const v = data[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return null;
}

/**
 * Pull a submission id out of a check-submit url's query string, or null.
 * @param {string} url
 */
export function readIdFromUrl(url) {
  const q = String(url || "").split("?")[1];
  if (!q) return null;
  const params = new URLSearchParams(q);
  for (const k of ID_KEYS) {
    const v = params.get(k);
    if (v) return v;
  }
  return null;
}

export class SubmissionTracker {
  /** @param {() => number} [clock] */
  constructor(clock = () => Date.now()) {
    this._clock = clock;
    /** @type {{id: string|null, slug: string|null, code: string, lang: string, at: number}|null} */
    this._pending = null;
  }

  /** Whatever is currently waiting on a verdict, for tests and logging. */
  get pending() {
    return this._pending;
  }

  _expire() {
    if (this._pending && this._clock() - this._pending.at > PENDING_TTL_MS) {
      dbg.log("Pending submission expired without a verdict");
      this._pending = null;
    }
  }

  /**
   * Record a tapped `submit` call. If the judge happened to answer with the
   * verdict in the same response, this returns the solve immediately.
   *
   * @param {{url: string, status: number, requestBody: string|null, responseBody: string|null}} payload
   * @returns {{slug: string|null, code: string, lang: string, verdict: any}|null}
   */
  noteSubmit(payload) {
    if (!payload || (payload.status && payload.status !== 200)) return null;

    const request = readSubmitRequest(payload.requestBody);
    if (!request) {
      dbg.log("Submit call carried no source — ignoring");
      return null;
    }

    const data = unwrap(parseJsonSafe(payload.responseBody));
    this._pending = {
      id: readSubmissionId(data),
      slug: request.slug,
      code: request.code,
      lang: request.lang,
      at: this._clock(),
    };
    dbg.log(`Submitted ${request.slug || "(unknown problem)"}, awaiting verdict`);

    // Some judges answer synchronously. If this one did, take it.
    const verdict = readVerdict(data);
    if (verdict.accepted) return this._settle(verdict);
    return null;
  }

  /**
   * Record a tapped `check-submit` poll.
   *
   * @param {{url: string, status: number, responseBody: string|null}} payload
   * @returns {{slug: string|null, code: string, lang: string, verdict: any}|null}
   */
  noteCheck(payload) {
    if (!payload || (payload.status && payload.status !== 200)) return null;
    this._expire();
    if (!this._pending) return null;

    const urlId = readIdFromUrl(payload.url);
    if (urlId && this._pending.id && urlId !== this._pending.id) {
      dbg.log(`Poll for ${urlId} is not our submission ${this._pending.id}`);
      return null;
    }

    const data = unwrap(parseJsonSafe(payload.responseBody));
    if (!data) return null;

    const verdict = readVerdict(data);
    if (verdict.pending) return null; // still judging; keep waiting

    if (!verdict.accepted) {
      // A terminal non-accepted verdict ends this submission. Nothing is
      // committed, and the pending entry is cleared so the next submission
      // starts clean.
      if (verdict.status) {
        dbg.log(`Not accepted (${verdict.status}) — dropping`);
        this._pending = null;
      }
      return null;
    }

    return this._settle(verdict);
  }

  /** @param {any} verdict */
  _settle(verdict) {
    const p = this._pending;
    this._pending = null;
    if (!p) return null;
    return { slug: p.slug, code: p.code, lang: p.lang, verdict };
  }
}

/**
 * Watch for accepted takeuforward submissions.
 *
 * @param {(solve: {slug: string|null, code: string, lang: string, verdict: any}) => void} onAccepted
 * @returns {() => void} unsubscribe
 */
export function watchSubmissions(onAccepted) {
  const tracker = new SubmissionTracker();
  dbg.log("Listening for judge responses");

  return subscribeTap(
    (url) => url.includes(TAP_PATHS.submit) || url.includes(TAP_PATHS.checkSubmit),
    (payload) => {
      // check-submit contains "submit" as a substring, so test it first.
      const solve = payload.url.includes(TAP_PATHS.checkSubmit)
        ? tracker.noteCheck(payload)
        : tracker.noteSubmit(payload);
      if (!solve) return;
      dbg.log(`Accepted: ${solve.slug || "(unknown problem)"}`);
      onAccepted(solve);
    },
  );
}
