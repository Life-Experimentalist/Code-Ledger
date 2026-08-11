/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extracts code from GFG's Ace editor via script injection.
 * Content scripts run in isolated world — cannot access window.ace directly.
 * Strategy: inject <script> into page context → reads ace → writes to <meta> → CS reads <meta>.
 */

import { createDebugger } from "../../../lib/debug.js";
import { runtime } from "../../../lib/browser-compat.js";
const dbg = createDebugger("GFGAceExtractor");

/**
 * Read code from the Ace editor on GFG problem pages.
 * @returns {Promise<string>} Editor content, or "" if unavailable.
 */
export async function extractAceCode() {
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).substring(2);
    const responseEvent = `cl-editor-response-${requestId}`;

    const script = document.createElement("script");
    script.src = runtime.getURL("content/injected-editor-helper.js");
    script.setAttribute("data-action", "extract");
    script.setAttribute("data-request-id", requestId);

    const listener = (e) => {
      window.removeEventListener(responseEvent, listener);
      script.remove();
      const code = e.detail?.code || "";
      dbg.log(`extractAceCode(): extracted ${code.length} chars`);
      resolve(code);
    };

    window.addEventListener(responseEvent, listener);
    (document.head || document.documentElement).appendChild(script);

    // Timeout fallback to prevent hanging
    setTimeout(() => {
      window.removeEventListener(responseEvent, listener);
      if (script.parentNode) script.remove();
      resolve("");
    }, 1000);
  });
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
