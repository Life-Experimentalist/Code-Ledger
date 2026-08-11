/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Codeforces slug arithmetic.
 *
 * A Codeforces problem has no slug of its own — it is addressed by contest and
 * letter, and the extension joins the two into `"{contestId}{index}"` (`"4A"`,
 * `"gym100500B"`) so it has a single id to key storage on. Every link back to
 * the site has to take that apart again, which is why this lives in one place:
 * the same string is turned into a URL by the library, the popup, the metadata
 * refresh and the published Pages site.
 */

/** Gym contests are numbered from 100000; regular contests are four digits. */
export const GYM_MIN_CONTEST_ID = 100000;

/** `{contestId}{index}`, with the `gym` prefix the handler adds for gym problems. */
const CF_SLUG_RE = /^(gym)?(\d+)([A-Za-z][A-Za-z0-9]*)$/;

/**
 * Split a CodeLedger Codeforces slug back into its parts.
 *
 * @param {string} slug e.g. "4A", "1234A1", "gym100500B"
 * @returns {{ contestId: string, index: string, isGym: boolean } | null}
 *   null when the slug is not in that shape — an acmsguru problem, say, whose
 *   index is numeric. A wrong link is worse than none.
 */
export function splitCFSlug(slug) {
  const m = CF_SLUG_RE.exec(String(slug || "").trim());
  if (!m) return null;
  const [, gymPrefix, contestId, index] = m;
  return {
    contestId,
    index,
    isGym: !!gymPrefix || Number(contestId) >= GYM_MIN_CONTEST_ID,
  };
}

/**
 * Build the slug for a problem the API describes by contest and index.
 *
 * Must agree with `page-detector.js`, which builds the same string from the
 * URL — a mismatch would file an imported problem separately from the same
 * problem solved live.
 *
 * @param {number|string} contestId
 * @param {string} index
 * @returns {string} "" when either part is missing
 */
export function buildCFSlug(contestId, index) {
  const id = String(contestId ?? "").trim();
  const idx = String(index ?? "").trim();
  if (!/^\d+$/.test(id) || !idx) return "";
  return `${Number(id) >= GYM_MIN_CONTEST_ID ? "gym" : ""}${id}${idx}`;
}

/**
 * The public page for a Codeforces problem.
 *
 * @param {string} slug
 * @returns {string} "" when the slug cannot be read
 */
export function cfProblemUrl(slug) {
  const parts = splitCFSlug(slug);
  if (!parts) return "";
  return parts.isGym
    ? `https://codeforces.com/gym/${parts.contestId}/problem/${parts.index}`
    : `https://codeforces.com/problemset/problem/${parts.contestId}/${parts.index}`;
}
