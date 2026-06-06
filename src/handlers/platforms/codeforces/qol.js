/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Codeforces Quality-of-Life buttons: copy code + AI panel toggle.
 * Injected above the #editor textarea on problem pages.
 * CF's editor is a plain <textarea id="editor"> — no Monaco, no Ace.
 */

import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("CFQoL");

const MAX_ATTEMPTS = 20;
const RETRY_MS = 500;
let _retryTimer = null;

export async function injectCFQoL({ showCopy, showAI, onAIClick } = {}) {
  if (!showCopy && !showAI) return;
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (document.getElementById("cl-cf-qol")) return; // already injected

    const editor = document.querySelector("#editor");
    if (editor?.parentElement) {
      _inject(editor.parentElement, editor, { showCopy, showAI, onAIClick });
      return;
    }
    await new Promise((r) => setTimeout(r, RETRY_MS));
  }
  dbg.warn("Could not find #editor to inject QoL buttons");
}

export function removeCFQoL() {
  document.getElementById("cl-cf-qol")?.remove();
}

function _inject(parent, editor, { showCopy, showAI, onAIClick }) {
  if (document.getElementById("cl-cf-qol")) return;

  const container = document.createElement("div");
  container.id = "cl-cf-qol";
  container.style.cssText =
    "display:flex;gap:6px;padding:4px 0 6px;flex-wrap:wrap;align-items:center;";

  if (showCopy) {
    container.appendChild(
      _makeBtn("cl-cf-copy", "📋 Copy Code", async (btn) => {
        const code = document.querySelector("#editor")?.value || "";
        if (!code) return;
        try {
          await navigator.clipboard.writeText(code);
          const orig = btn.textContent;
          btn.textContent = "✓ Copied";
          setTimeout(() => {
            if (btn.isConnected) btn.textContent = orig;
          }, 2000);
        } catch (_) {
          // execCommand fallback
          const ta = document.createElement("textarea");
          ta.value = code;
          ta.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
          const orig = btn.textContent;
          btn.textContent = "✓ Copied";
          setTimeout(() => {
            if (btn.isConnected) btn.textContent = orig;
          }, 2000);
        }
      }),
    );
  }

  if (showAI && onAIClick) {
    container.appendChild(_makeBtn("cl-cf-ai", "✦ AI Review", () => onAIClick()));
  }

  parent.insertBefore(container, editor);
  dbg.log("CF QoL buttons injected");
}

function _makeBtn(id, label, onClick) {
  const btn = document.createElement("button");
  btn.id = id;
  btn.type = "button";
  btn.textContent = label;
  btn.style.cssText =
    "padding:4px 10px;border-radius:6px;font-size:12px;font-weight:500;" +
    "font-family:inherit;cursor:pointer;border:1px solid rgba(6,182,212,0.35);" +
    "color:#67e8f9;background:rgba(6,182,212,0.08);transition:background 0.2s;" +
    "white-space:nowrap;line-height:1.4;";
  btn.onmouseenter = () => {
    btn.style.background = "rgba(6,182,212,0.18)";
  };
  btn.onmouseleave = () => {
    btn.style.background = "rgba(6,182,212,0.08)";
  };
  btn.addEventListener("click", () => onClick(btn));
  return btn;
}
