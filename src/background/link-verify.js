/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Platform-generic link verification and manual link repair.
 *
 * `gfg-verify.js` grew the original contract for GeeksForGeeks — a probe that
 * answers `{data, miss}` where `miss` is true only on a definitive "no such
 * problem", verified-before-save manual fixes, and a record id that never
 * changes. This module extends the same contract to the other platforms:
 *
 *   leetcode       probeable — GraphQL answers a wrong slug with question:null
 *   neetcode       probeable — the metadata callable answers data:null
 *   codeforces     probeable via problemset membership, except gym problems
 *                  (absent from the listing by design) — those save unverified
 *   geeksforgeeks  probeable — practice API 404s wrong slugs (probe supplied
 *                  by the caller; the richer candidate repair stays in
 *                  gfg-verify.js)
 *   takeuforward   NOT probeable — backend-go.takeuforward.org rejects any
 *                  request whose Origin is not on its allowlist, and a
 *                  chrome-extension:// origin is not. Manual fixes are
 *                  strictly parsed and saved clearly unverified.
 *
 * A probe may extend the outcome with `unverifiable: true` for slugs it can
 * see are beyond its reach (Codeforces gym). "Unverified" is an honest state,
 * never a silent one: the record gets no `urlVerifiedAt` stamp and the UI
 * says so.
 *
 * Everything is dependency-injected so the logic is testable without a
 * service worker.
 */

import { createDebugger } from "../lib/debug.js";
import { splitCFSlug, buildCFSlug } from "../core/cf-utils.js";
import { slugFromInput as gfgSlugFromInput } from "./gfg-verify.js";

const dbg = createDebugger("LinkVerify");

/** Hyphenated lowercase slug, as LeetCode / NeetCode / TUF use. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function decodeSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch (_) {
    return s;
  }
}

/**
 * Slug from a `/problems/<slug>` URL on the given domain, or from a bare
 * slug-shaped input. A URL on the wrong domain is rejected rather than
 * mined for a slug — for an unverifiable platform, a pasted URL from the
 * wrong site would otherwise be saved without any probe to catch it.
 */
function problemsPathParser(domain) {
  return (input) => {
    let s = String(input || "").trim();
    if (!s) return "";
    if (/:\/\//.test(s)) {
      if (!s.toLowerCase().includes(domain)) return "";
      const m = s.match(/\/problems\/([^/?#]+)/i);
      if (!m) return "";
      s = m[1];
    }
    s = decodeSafe(s).replace(/\/+$/, "").trim().toLowerCase();
    return SLUG_RE.test(s) ? s : "";
  };
}

/**
 * Codeforces: a problem URL in any of the three shapes the site serves, or a
 * bare slug. The index is uppercased — that is how the API states it and how
 * every stored slug was built.
 */
function cfSlugFromInput(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  if (/:\/\//.test(s)) {
    if (!s.toLowerCase().includes("codeforces.com")) return "";
    let m = s.match(/\/problemset\/problem\/(\d+)\/([A-Za-z][A-Za-z0-9]*)/i);
    if (!m) m = s.match(/\/(?:contest|gym)\/(\d+)\/problem\/([A-Za-z][A-Za-z0-9]*)/i);
    if (!m) return "";
    return buildCFSlug(m[1], m[2].toUpperCase());
  }
  const parts = splitCFSlug(s);
  if (!parts) return "";
  return buildCFSlug(parts.contestId, parts.index.toUpperCase());
}

/**
 * Per-platform link input parsers. Each returns the canonical stored slug, or
 * "" when nothing slug-shaped for that platform can be extracted.
 */
export const LINK_PARSERS = {
  leetcode: problemsPathParser("leetcode.com"),
  geeksforgeeks: gfgSlugFromInput,
  codeforces: cfSlugFromInput,
  neetcode: problemsPathParser("neetcode.io"),
  takeuforward: problemsPathParser("takeuforward.org"),
};

/**
 * @param {string} platform  a key of LINK_PARSERS
 * @param {string} input  user-pasted URL or slug
 * @returns {string} canonical slug, or "" when unparseable / unknown platform
 */
export function linkSlugFromInput(platform, input) {
  const parse = LINK_PARSERS[platform];
  return parse ? parse(input) : "";
}

/**
 * Probe-only check of a link, for the UI: nothing is saved.
 *
 * @param {string} platform
 * @param {string} input  user-pasted URL or slug
 * @param {object} deps
 * @param {Record<string, (slug: string) => Promise<{data: object|null, miss: boolean, unverifiable?: boolean}>>} deps.probes
 * @returns {Promise<{status: "ok"|"invalid"|"notfound"|"error"|"unverified", slug?: string}>}
 *   "ok"         — the platform confirms the link resolves
 *   "invalid"    — nothing slug-shaped for this platform in the input
 *   "notfound"   — the platform definitively says no such problem
 *   "error"      — the check failed non-definitively; try again
 *   "unverified" — the slug parses but this platform (or this slug) cannot
 *                  be checked from the background
 */
export async function checkLink(platform, input, deps) {
  const slug = linkSlugFromInput(platform, input);
  if (!slug) return { status: "invalid" };
  const probe = deps.probes?.[platform];
  if (!probe) return { status: "unverified", slug };
  const outcome = await probe(slug);
  if (outcome.data) return { status: "ok", slug };
  if (outcome.unverifiable) return { status: "unverified", slug };
  return { status: outcome.miss ? "notfound" : "error", slug };
}

/**
 * Apply a user-supplied URL/slug to a problem of any platform.
 *
 * Where a probe exists, the fix is verified before anything is saved — a
 * manual fix must not be able to replace one broken link with another. Where
 * no probe can reach (takeuforward, Codeforces gym), the strictly-parsed slug
 * is saved without a verification stamp and reported "unverified".
 *
 * As everywhere in this pipeline, only `titleSlug` changes: the record id,
 * commit path and pending-commit key all stay put.
 *
 * @param {object} problem
 * @param {string} input  user-pasted URL or slug
 * @param {object} deps
 * @param {Record<string, Function>} deps.probes  per-platform outcome probes
 * @param {(problem: object) => Promise<any>} deps.saveProblem
 * @param {(problem: object) => Promise<any>} [deps.markPending] called only when the slug changed
 * @param {() => number} [deps.now]
 * @returns {Promise<{status: "ok"|"invalid"|"notfound"|"error"|"unverified", slug?: string, problem?: object}>}
 */
export async function applyManualLink(problem, input, deps) {
  const { probes, saveProblem, markPending, now = Date.now } = deps;
  const platform = problem?.platform;
  const slug = linkSlugFromInput(platform, input);
  if (!slug) return { status: "invalid" };

  const probe = probes?.[platform];
  let verified = false;
  if (probe) {
    const outcome = await probe(slug);
    if (outcome.data) {
      verified = true;
    } else if (!outcome.unverifiable) {
      return { status: outcome.miss ? "notfound" : "error", slug };
    }
  }

  const changed = slug !== problem.titleSlug;
  const updated = { ...problem, titleSlug: slug };
  delete updated.urlBroken;
  delete updated.urlBrokenAt;
  if (verified) updated.urlVerifiedAt = now();
  else delete updated.urlVerifiedAt;
  if (changed) updated.slugRepairedFrom = problem.titleSlug || null;
  await saveProblem(updated);
  if (changed && markPending) await markPending(updated);
  dbg.log(
    `applyManualLink(): ${platform} ${problem.titleSlug || problem.id} → ${slug}` +
      (verified ? "" : " (unverified)"),
  );
  return { status: verified ? "ok" : "unverified", slug, problem: updated };
}

/**
 * Verify one problem's stored link against its platform.
 *
 * No candidate generation here — slug-generation repair is a GFG quirk that
 * lives in gfg-verify.js. Everything else either resolves as stored, is
 * definitively gone, or cannot be judged.
 *
 * @param {object} problem
 * @param {object} deps  same shape as applyManualLink's
 * @returns {Promise<{status: "ok"|"broken"|"error"|"unverified", slug?: string, problem?: object}>}
 */
export async function verifyProblemLink(problem, deps) {
  const { probes, saveProblem, now = Date.now } = deps;
  const platform = problem?.platform;
  const slug = problem?.titleSlug || "";
  const probe = probes?.[platform];
  if (!probe) return { status: "unverified", slug };
  if (!slug) return { status: "error" };

  const outcome = await probe(slug);
  if (outcome.data) {
    const updated = { ...problem, urlVerifiedAt: now() };
    delete updated.urlBroken;
    delete updated.urlBrokenAt;
    await saveProblem(updated);
    return { status: "ok", slug, problem: updated };
  }
  if (outcome.unverifiable) return { status: "unverified", slug };
  // A network blip or 5xx cannot condemn the record — only a definitive
  // "no such problem" marks it broken.
  if (!outcome.miss) return { status: "error", slug };

  const updated = { ...problem, urlBroken: true, urlBrokenAt: now() };
  await saveProblem(updated);
  dbg.warn(`verifyProblemLink(): ${platform} slug ${slug} definitively gone — marked urlBroken`);
  return { status: "broken", slug, problem: updated };
}
