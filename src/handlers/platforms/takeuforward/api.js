/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * takeuforward's backend, as far as CodeLedger reads it.
 *
 * Everything TUF+ serves comes from `backend-go.takeuforward.org` and shares
 * one envelope: `{ success, message, data }` on the way out, and
 * `{ success: false, error, message }` when auth is missing. Verified against
 * the live API on 2026-08-12.
 *
 * ── What is known, and what is not ────────────────────────────────────────
 *
 * The routes are confirmed: an unauthenticated request to each returns 401
 * TOKEN_MISSING rather than 404, which is how a Go router says "this exists,
 * you are not allowed". `/v2/plus/problem/{slug}` is confirmed further — it
 * answers 200 to anyone, and redacts the subscriber-only fields to the literal
 * string "Subscribe to TUF+".
 *
 * The shape of an accepted verdict is NOT confirmed. The judge routes answer
 * 401 to an anonymous request, so observing one needs an account; no account of
 * either kind was available. Note that this establishes the judge requires a
 * *login* — whether it also requires the subscription, despite the `plus` in
 * its path, is not something these responses settle, and nothing here assumes
 * either way. `readVerdict` therefore does not pattern-match one known shape; it
 * looks only at fields *named* like a verdict, and accepts only a small
 * vocabulary of pass words. Two rules keep that from turning into a false
 * positive:
 *
 *   1. The envelope's own `success` is never read as a verdict. It means "the
 *      request worked", and it is `true` on a rejected submission too.
 *   2. If the payload reports a test-case count and a passed count, they must
 *      be equal. A partial pass is a fail.
 *
 * The failure mode this leaves is a miss, not a bad commit: an unrecognised
 * shape commits nothing rather than committing a wrong answer.
 */

import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("TUFAPI");

export const API_BASE = "https://backend-go.takeuforward.org/api";

export const ENDPOINTS = {
  submit: `${API_BASE}/v1/plus/judge/submit`,
  checkSubmit: `${API_BASE}/v1/plus/judge/check-submit`,
  problem: (slug) => `${API_BASE}/v2/plus/problem/${slug}`,
};

/** Substrings the tap matches on. Keep in sync with content/net-tap.js. */
export const TAP_PATHS = {
  submit: "/v1/plus/judge/submit",
  checkSubmit: "/v1/plus/judge/check-submit",
  problem: "/v2/plus/problem/",
};

/** What the API puts where a subscriber would see a real value. */
export const REDACTED = "Subscribe to TUF+";

/** Field names that actually carry a verdict. */
const VERDICT_KEYS = [
  "status",
  "verdict",
  "submission_status",
  "submissionStatus",
  "judge_status",
  "result_status",
  "state",
];

/** Every way a judge writes "all tests passed". */
const PASS_WORDS = new Set([
  "accepted",
  "success",
  "successful",
  "passed",
  "pass",
  "ac",
  "correct",
]);

/** Judge0's numeric id for Accepted, in case TUF fronts one. */
const JUDGE0_ACCEPTED = 3;

/**
 * Unwrap `{ success, message, data }`. Returns null when the call failed.
 * @param {any} body
 */
export function unwrap(body) {
  if (!body || typeof body !== "object") return null;
  if (body.success === false) return null;
  return body.data !== undefined ? body.data : body;
}

/** Blank out the paywall sentinel so it never reaches a commit. */
export function unredact(value) {
  if (typeof value === "string") return value.trim() === REDACTED ? null : value;
  if (Array.isArray(value)) {
    const kept = value.filter((v) => String(v).trim() !== REDACTED);
    return kept.length ? kept : [];
  }
  return value ?? null;
}

/**
 * Read the one field out of `payload` that looks like a verdict.
 * @param {any} payload
 * @returns {{raw: any, text: string}|null}
 */
function findVerdictField(payload) {
  if (!payload || typeof payload !== "object") return null;
  for (const key of VERDICT_KEYS) {
    const v = payload[key];
    if (v === undefined || v === null) continue;
    // Judge0 nests it one deeper: status: { id, description }.
    if (typeof v === "object") {
      const inner = v.description ?? v.status ?? v.name ?? v.label;
      if (Number(v.id) === JUDGE0_ACCEPTED) return { raw: v, text: "accepted" };
      if (typeof inner === "string") return { raw: v, text: inner };
      continue;
    }
    return { raw: v, text: String(v) };
  }
  return null;
}

/** First present numeric field from a list of candidate names. */
function pickNumber(payload, names) {
  for (const n of names) {
    const v = payload?.[n];
    if (v !== undefined && v !== null && v !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

/** First present non-empty field from a list of candidate names. */
function pickValue(payload, names) {
  for (const n of names) {
    const v = payload?.[n];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

/**
 * Decide whether a tapped judge payload describes a fully accepted submission.
 *
 * @param {any} data already unwrapped from the envelope
 * @returns {{accepted: boolean, status: string|null, runtime: string|null,
 *            memory: string|null, totalTests: number|null,
 *            passedTests: number|null, pending: boolean}}
 */
export function readVerdict(data) {
  const empty = {
    accepted: false,
    status: null,
    runtime: null,
    memory: null,
    totalTests: null,
    passedTests: null,
    pending: false,
  };
  if (!data || typeof data !== "object") return empty;

  const field = findVerdictField(data);
  const text = field ? String(field.text).trim().toLowerCase() : "";

  // check-submit is polled, so most responses are "still judging". Say so
  // rather than reporting them as a failure.
  const pending = /pending|queued|processing|running|in[_ -]?progress/.test(text);

  const totalTests = pickNumber(data, [
    "total_testcases",
    "total_test_cases",
    "test_case_count",
    "totalTestCases",
    "totalTests",
  ]);
  const passedTests = pickNumber(data, [
    "passed_testcases",
    "passed_test_cases",
    "correct_test_case_count",
    "passedTestCases",
    "passedTests",
  ]);

  let accepted = PASS_WORDS.has(text);
  // A partial pass is a fail, whatever the status string says.
  if (accepted && totalTests !== null && passedTests !== null && passedTests !== totalTests) {
    dbg.log(`Status said "${text}" but only ${passedTests}/${totalTests} passed — not a solve`);
    accepted = false;
  }

  const runtime = pickValue(data, ["runtime", "time", "execution_time", "time_taken"]);
  const memory = pickValue(data, ["memory", "memory_used", "memory_taken"]);

  return {
    accepted,
    status: field ? String(field.text) : null,
    runtime: runtime === null ? null : String(runtime),
    memory: memory === null ? null : String(memory),
    totalTests,
    passedTests,
    pending,
  };
}

/**
 * The source and language out of a tapped submit request.
 * @param {string|null} requestBody
 * @returns {{slug: string|null, code: string, lang: string}|null}
 */
export function readSubmitRequest(requestBody) {
  if (!requestBody) return null;
  let d;
  try {
    d = JSON.parse(requestBody);
  } catch (_) {
    return null;
  }
  if (!d || typeof d !== "object") return null;

  const code = pickValue(d, ["code", "source_code", "sourceCode", "rawCode", "solution"]);
  if (typeof code !== "string" || !code.trim()) return null;

  const slug = pickValue(d, ["problem_slug", "problemSlug", "slug", "problem_id", "problemId"]);
  const lang = pickValue(d, ["language", "lang", "language_slug", "languageSlug"]);

  return {
    slug: slug === null ? null : String(slug),
    code,
    lang: lang === null ? "" : String(lang),
  };
}

/**
 * Problem metadata out of a tapped `/v2/plus/problem/{slug}` response.
 *
 * `difficulty` and `topic_tags` come back redacted unless the request carried
 * a subscriber's token — which is exactly why this reads the page's own
 * response instead of making its own request.
 *
 * @param {any} body the raw parsed response
 */
export function readProblemMeta(body) {
  const d = unwrap(body);
  if (!d || typeof d !== "object" || !d.problem_slug) return null;

  const tags = unredact(d.topic_tags);
  return {
    slug: String(d.problem_slug),
    title: (d.problem_name || "").trim() || null,
    difficulty: normalizeDifficulty(unredact(d.difficulty)),
    tags: Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [],
    statement: d.problem_statement || null,
    constraints: d.constraints || null,
    examples: [d.example1, d.example2, d.example3].filter((e) => typeof e === "string" && e),
  };
}

/** What `readSubscriptionTier` can conclude. */
export const TIER = { PLUS: "plus", FREE: "free" };

/** Settings key the detected tier is remembered under. Derived, never typed. */
export const TIER_KEY = "takeuforward_tier";

/**
 * Which side of takeuforward's paywall the person reading this page is on.
 *
 * There is no endpoint that answers "is this account TUF+", and the GitHub
 * account CodeLedger signs in with says nothing about it — they are unrelated
 * identities. But `/v2/plus/problem/{slug}` answers 200 to anyone and redacts
 * the subscriber-only fields to the literal string "Subscribe to TUF+", so the
 * response the page already fetched carries the answer for free: see the
 * sentinel and the reader is on the free tier, see a real difficulty and they
 * are not.
 *
 * A field that is simply absent proves nothing, and is reported as unknown
 * rather than guessed either way.
 *
 * @param {any} body the raw parsed `/v2/plus/problem/{slug}` response
 * @returns {"plus"|"free"|null} null when the response cannot say
 */
export function readSubscriptionTier(body) {
  const d = unwrap(body);
  if (!d || typeof d !== "object" || !d.problem_slug) return null;

  const isSentinel = (v) =>
    (typeof v === "string" && v.trim() === REDACTED) ||
    (Array.isArray(v) && v.some((x) => String(x).trim() === REDACTED));

  if (isSentinel(d.difficulty) || isSentinel(d.topic_tags)) return TIER.FREE;
  if (typeof d.difficulty === "string" && d.difficulty.trim()) return TIER.PLUS;
  return null;
}

/**
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
