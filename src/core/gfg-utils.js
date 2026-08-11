/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Normalizes GeeksforGeeks problem slugs.
 * Discards legacy trailing "/0", "/1", and cleans double-hyphen suffixes (e.g. `--1235` or `--102404`).
 * If a slug ends with "--digits", it is cleaned:
 * - If there are digits before "--" (e.g. `compare-two-fractions4438--102404`), it strips the "--102404" completely.
 * - Otherwise (e.g. `total-decoding-messages--1235`), it replaces the "--" with nothing to yield the modern slug (e.g. `total-decoding-messages1235`).
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
      clean = base;
    } else {
      clean = base + digits;
    }
  }
  return clean;
}
