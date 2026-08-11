/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * mermaid-stub.js — Mermaid diagram URLs.
 *
 * The extension CSP blocks external scripts, so mermaid itself cannot run here.
 * Diagrams are rendered by mermaid.ink instead, which means the diagram source —
 * derived from the user's problem and code by their AI provider — leaves the
 * device to a third party that is not otherwise part of CodeLedger.
 *
 * That is why these are URL builders and nothing more: the caller decides when,
 * and the UI only requests the image after an explicit click.
 *
 * @ts-check
 */

/**
 * Rewrite horizontal graph directions to vertical (top-down) when the author
 * hasn't explicitly chosen one, or has chosen LR/RL (horizontal).
 */
function preferVertical(src) {
  return src
    .replace(/^(graph)\s+(LR|RL)\s/im, "$1 TD ")
    .replace(/^(flowchart)\s+(LR|RL)\s/im, "$1 TD ")
    .replace(/^(graph)\s*(\n|$)/im, "graph TD\n")
    .replace(/^(flowchart)\s*(\n|$)/im, "flowchart TD\n");
}

/** UTF-8 safe base64, since btoa() rejects code points above U+00FF. */
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Encode diagram source for the mermaid.ink / mermaid.live URL formats.
 * Returns null when the source cannot be encoded.
 *
 * @param {string} src Raw mermaid diagram source
 * @returns {{ image: string, live: string } | null}
 */
export function mermaidUrls(src) {
  try {
    const encoded = toBase64(preferVertical(String(src || "").trim()));
    if (!encoded) return null;
    return {
      image: `https://mermaid.ink/svg/${encoded}`,
      live: `https://mermaid.live/view#base64:${encoded}`,
    };
  } catch {
    return null;
  }
}
