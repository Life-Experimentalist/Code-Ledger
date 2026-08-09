/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GFG Quality-of-Life toolbar buttons: copy code + AI panel toggle.
 * GFG uses Ace editor, so copy reads via extractEditorCode().
 */

import { extractEditorCode } from "./ace-extractor.js";
import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("GFGQOL");

let _injected = false;
let _retryTimer = null;

async function copyToClipboard(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {}
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}

let _observer = null;

function _makeBtn(id, title, viewBox, svgPath, onClick) {
  const btn = document.createElement("button");
  btn.id = id;
  btn.title = title;
  btn.style.cssText =
    "display:inline-flex;align-items:center;justify-content:center;" +
    "width:30px;height:30px;border-radius:6px;cursor:pointer;border:none;" +
    "background:transparent;color:#94a3b8;transition:background 0.15s,color 0.15s;" +
    "padding:0;flex-shrink:0;";
  btn.innerHTML = `<svg width="15" height="15" viewBox="${viewBox}" fill="currentColor">${svgPath}</svg>`;
  btn.onmouseenter = () => {
    btn.style.background = "rgba(255,255,255,0.06)";
    btn.style.color = "#e2e8f0";
  };
  btn.onmouseleave = () => {
    btn.style.background = "transparent";
    btn.style.color = "#94a3b8";
  };
  btn.addEventListener("click", onClick);
  return btn;
}

function makeCopyBtn() {
  return _makeBtn(
    "cl-gfg-copy",
    "Copy code (CodeLedger)",
    "0 0 448 512",
    '<path d="M384 336H192c-8.8 0-16-7.2-16-16V64c0-8.8 7.2-16 16-16h140.1L400 115.9V320c0 8.8-7.2 16-16 16zM192 16C165.5 16 144 37.5 144 64v256c0 26.5 21.5 48 48 48h192c26.5 0 48-21.5 48-48V115.9c0-12.7-5-24.9-14.1-33.9L353.9 14.1c-9-9-21.2-14.1-33.9-14.1H192zM64 128c-35.3 0-64 28.7-64 64v256c0 35.3 28.7 64 64 64h192c35.3 0 64-28.7 64-64v-32h-48v32c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192c0-8.8 7.2-16 16-16h32v-48H64z"/>',
    async () => {
      const btn = document.getElementById("cl-gfg-copy");
      if (!btn) return;
      const code = await extractEditorCode();
      if (!code) return;
      const ok = await copyToClipboard(code);
      const orig = btn.innerHTML;
      btn.innerHTML = ok
        ? '<svg width="15" height="15" viewBox="0 0 448 512" fill="#34d399"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>'
        : '<svg width="15" height="15" viewBox="0 0 384 512" fill="#f87171"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3l105.4 105.3c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256l105.3-105.4z"/></svg>';
      setTimeout(() => {
        if (btn.isConnected) btn.innerHTML = orig;
      }, 2000);
    },
  );
}

function makeAIBtn(onClickFn) {
  return _makeBtn(
    "cl-gfg-ai-btn",
    "Open AI Assistant (CodeLedger)",
    "0 0 576 512",
    '<path d="M234.7 42C226.5 32.5 213.5 28 200.7 30.3L96.7 50.3C79.3 53.5 66 67.5 63.6 85L47.1 213.6C45.1 229.9 50.6 246.2 62.1 257.7l248 248c25 25 65.5 25 90.5 0l154.5-154.5c25-25 25-65.5 0-90.5L310.5 16.5l-75.8-25.5zm17 48.4l248.2 248.2-154.5 154.5-248.2-248.2L114 91.4l117.7-22.4 20 21.4zM160 144a32 32 0 1 0 0-64 32 32 0 1 0 0 64z"/>',
    (e) => {
      e.preventDefault();
      onClickFn?.();
    },
  );
}

function findEditorToolbar() {
  // Heuristic 1: Find by class or ID
  const selectors = [
    ".ace_toolbar",
    "[class*='editor_header']",
    "[class*='editor-header']",
    "[class*='problems_editor'] [class*='header']",
    ".problems-editor-header",
    "[class*='problems_header_menu']",
    "[class*='editorHeader']",
    "[class*='header_menu']",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }

  // Heuristic 2: Find the language selector container
  const langSel = document.querySelector(
    '.divider.text, [class*="selectedLang"], [class*="language"] [class*="selected"], select[name="language"], [class*="language-dropdown"]',
  );
  if (langSel) {
    let parent = langSel.parentElement;
    for (let i = 0; i < 4 && parent; i++, parent = parent.parentElement) {
      if (
        parent.querySelector("button, select") &&
        /flex|header|menu|toolbar|align/i.test(parent.className || "")
      ) {
        return parent;
      }
    }
  }

  // Heuristic 3: Sibling relative to editor container
  const editor = document.querySelector("#editor, .ace_editor");
  if (editor) {
    let el = editor.parentElement;
    for (let i = 0; i < 6 && el; i++, el = el.parentElement) {
      const prev = el.previousElementSibling;
      if (
        prev &&
        (prev.querySelector("button, select") ||
          /flex|header|menu|toolbar/i.test(prev.className || ""))
      ) {
        return prev;
      }
    }
  }

  return null;
}

export function injectGFGQoL(opts = {}) {
  const showCopy = opts.showCopy !== false;
  const showAI = opts.showAI === true;
  const onAIClick = opts.onAIClick || null;

  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }

  if (!showCopy && !showAI) {
    _cleanupGFGQoL();
    return;
  }

  const copyOk = !showCopy || document.getElementById("cl-gfg-copy")?.isConnected;
  const aiOk = !showAI || document.getElementById("cl-gfg-ai-btn")?.isConnected;

  if (copyOk && aiOk) {
    _injected = true;
  } else {
    const toolbar = findEditorToolbar();

    ["cl-gfg-copy", "cl-gfg-ai-btn"].forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el.isConnected) el.remove();
    });

    if (toolbar) {
      if (showCopy && !document.getElementById("cl-gfg-copy")) {
        toolbar.appendChild(makeCopyBtn());
      }
      if (showAI && onAIClick && !document.getElementById("cl-gfg-ai-btn")) {
        toolbar.appendChild(makeAIBtn(onAIClick));
      }
      if (!showCopy) document.getElementById("cl-gfg-copy")?.remove();
      if (!showAI) document.getElementById("cl-gfg-ai-btn")?.remove();
      _injected = true;
    } else {
      if (!_injected) {
        _retryTimer = setTimeout(() => injectGFGQoL(opts), 800);
      }
    }
  }

  // Setup observer to re-inject buttons when dynamic renders wipe them out
  if (!_observer && (showCopy || showAI)) {
    _observer = new MutationObserver(() => {
      const activeCopy = !showCopy || document.getElementById("cl-gfg-copy")?.isConnected;
      const activeAI = !showAI || document.getElementById("cl-gfg-ai-btn")?.isConnected;
      if (!activeCopy || !activeAI) {
        injectGFGQoL(opts);
      }
    });
    _observer.observe(document.body, { childList: true, subtree: true });
  }
}

export function resetGFGQoL() {
  _injected = false;
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }
  _cleanupGFGQoL();
}

function _cleanupGFGQoL() {
  if (_observer) {
    _observer.disconnect();
    _observer = null;
  }
  ["cl-gfg-copy", "cl-gfg-ai-btn"].forEach((id) => document.getElementById(id)?.remove());
}
