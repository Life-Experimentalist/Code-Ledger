/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Normalizes GeeksforGeeks problem slugs to the form the live site serves.
 *
 * GFG has had three slug generations, and only two of them need rewriting
 * (verified against the live site — the wrong form renders a soft-404 shell):
 *
 * - legacy list form  `total-decoding-messages--1235`   → canonical `total-decoding-messages1235`
 * - transitional form `compare-two-fractions4438--102404` → canonical `compare-two-fractions4438`
 * - modern canonical  `geeks-island--170646`            → already canonical, keep verbatim
 *
 * The distinguisher between the legacy and the modern form is the id width:
 * legacy per-problem ids are short (≤4 digits), while the modern ids GFG
 * appends after `--` are ≥5 digits (today's problem-of-the-day slug is
 * `secret-cipher--141631`). Collapsing those turns a working URL into a 404.
 *
 * Trailing "/0" and "/1" page suffixes are always discarded.
 *
 * @param {string} slug
 * @returns {string} normalized slug
 */
export function cleanGfgSlug(slug) {
  if (!slug) return "";
  let clean = String(slug).trim();
  if (clean.endsWith("/0") || clean.endsWith("/1")) {
    clean = clean.slice(0, -2);
  }

  const match = clean.match(/(.*)--(\d+)$/);
  if (match) {
    const base = match[1];
    const digits = match[2];
    if (/\d$/.test(base)) {
      // transitional: the real id is already glued to the base
      clean = base;
    } else if (digits.length <= 4) {
      // legacy: the canonical slug concatenates name and short id
      clean = base + digits;
    }
    // modern (≥5-digit id, plain base): `--` is part of the canonical slug
  }
  return clean;
}
