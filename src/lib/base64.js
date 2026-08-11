/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Base64 → text, the way the GitHub API means it.
 *
 * `atob` returns one character per *byte*, which is only the original string
 * back if every character in it was ASCII. Everything we read out of a repo can
 * hold something that is not: a problem title with an accent, a comment in a
 * language that is not English, an emoji in a commit message, the ✓ somebody
 * typed into their own notes. Decoding those with `atob` alone turns "é" into
 * "Ã©" and then writes the mangled version back on the next sync, so the damage
 * compounds every round trip.
 */

const _decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8") : null;

/**
 * Decode a base64 payload as UTF-8 text.
 *
 * Whitespace is stripped first because the GitHub contents API wraps its
 * base64 at 60 columns, and a stray newline makes `atob` throw.
 *
 * @param {string} b64
 * @returns {string} the decoded text, or "" for empty/blank input
 */
export function decodeBase64Utf8(b64) {
  const clean = String(b64 || "").replace(/\s+/g, "");
  if (!clean) return "";
  const binary = atob(clean);
  if (!_decoder) return binary; // no TextDecoder: byte-for-byte, as before
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return _decoder.decode(bytes);
}
