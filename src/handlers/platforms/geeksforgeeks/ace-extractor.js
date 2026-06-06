/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extracts code from GFG's Ace editor via script injection.
 * Content scripts run in isolated world — cannot access window.ace directly.
 * Strategy: inject <script> into page context → reads ace → writes to <meta> → CS reads <meta>.
 */

import { createDebugger } from "../../../lib/debug.js";
const dbg = createDebugger("GFGAceExtractor");

/**
 * Read code from the Ace editor on GFG problem pages.
 * @returns {Promise<string>} Editor content, or "" if unavailable.
 */
export async function extractAceCode() {
  const metaId = `cl-ace-${Date.now()}`;

  const script = document.createElement("script");
  script.textContent = `(function(){
        try {
            var ed = ace.edit("ace-editor");
            var val = ed.getValue();
            var m = document.createElement("meta");
            m.name = "${metaId}";
            m.content = encodeURIComponent(val || "");
            document.head.appendChild(m);
        } catch(e) {
            var m = document.createElement("meta");
            m.name = "${metaId}";
            m.content = "";
            document.head.appendChild(m);
        }
    })();`;

  document.head.appendChild(script);

  // Give the synchronous injected script a tick to execute
  await new Promise((r) => setTimeout(r, 50));

  const meta = document.head.querySelector(`meta[name="${metaId}"]`);
  const raw = meta ? meta.getAttribute("content") || "" : "";
  meta?.remove();
  script.remove();

  try {
    const code = raw ? decodeURIComponent(raw) : "";
    dbg.log(`extractAceCode(): ${code.length} chars`);
    return code;
  } catch (e) {
    dbg.warn("extractAceCode(): decode failed", e.message);
    return "";
  }
}

/**
 * Fallback: read code from CodeMirror DOM lines (older GFG pages).
 * @returns {string}
 */
export function extractCodeMirrorCode() {
  const cm = document.querySelector(".CodeMirror-code");
  if (cm) {
    return [...cm.querySelectorAll(".CodeMirror-line")].map((l) => l.textContent).join("\n");
  }
  return "";
}

/**
 * Try Ace first, fall back to CodeMirror, then return empty string.
 * @returns {Promise<string>}
 */
export async function extractEditorCode() {
  const aceCode = await extractAceCode();
  if (aceCode.trim()) return aceCode;

  const cmCode = extractCodeMirrorCode();
  if (cmCode.trim()) return cmCode;

  dbg.warn("extractEditorCode(): no code found in Ace or CodeMirror");
  return "";
}
