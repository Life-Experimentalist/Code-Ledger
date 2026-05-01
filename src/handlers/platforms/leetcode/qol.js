/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { runtime } from "../../../lib/browser-compat.js";

/** Pastes clipboard text into the Monaco editor at cursor, bypassing auto-indentation. */
async function pasteWithoutIndent() {
  let text = "";
  try { text = await navigator.clipboard.readText(); } catch (_) { return; }
  if (!text) return;

  const inputArea = document.querySelector(
    ".monaco-editor .inputarea.monaco-mouse-cursor-text",
  );
  if (inputArea) {
    inputArea.focus();
    if (document.execCommand("insertText", false, text)) return;
  }

  const target = inputArea || document.activeElement;
  if (!target) return;
  try {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  } catch (_) { }
}

/**
 * Find the editor toolbar action button group.
 * LeetCode's class names are Tailwind utilities so they can change — we use
 * multiple structural heuristics with broad fallbacks.
 */
function findEditorToolbar() {
  // Strategy 1: look for h-8 flex row that sits above the Monaco editor
  const candidates = [
    // 2025 LeetCode — h-8 toolbar row, rightmost flex group
    document.querySelector(
      "div.flex.h-8.items-center.justify-between > div.flex.h-full.items-center.gap-1"
    ),
    document.querySelector(
      "div.flex.h-8.items-center.justify-between > div:last-child"
    ),
    // Alternate: toolbar inside any editor wrapper
    document.querySelector("[class*='editor-header'] div.flex.items-center.gap-1"),
    document.querySelector("[class*='editor-panel'] div.flex.h-8 > div:last-child"),
    // Monaco editor ancestor sibling
    (() => {
      const monaco = document.querySelector(".monaco-editor");
      if (!monaco) return null;
      // Walk up to find a wrapper, then look for sibling toolbar row
      let el = monaco.parentElement;
      for (let i = 0; i < 5 && el; i++, el = el.parentElement) {
        const sibling = el.previousElementSibling;
        if (sibling) {
          const btn = sibling.querySelector("button");
          if (btn) return sibling;
        }
      }
      return null;
    })(),
  ];

  // Filter to only valid candidates and pick the one with buttons or most likely toolbar structure
  const validCandidates = candidates.filter(Boolean);

  // Prefer candidates that already have buttons or are clearly toolbar-like
  return (
    validCandidates.find((el) => el.querySelectorAll("button").length > 0) ||
    validCandidates.find((el) => el.className.includes("flex")) ||
    validCandidates[0] ||
    null
  );
}

/** Build the copy SVG button element. */
function makeCopyBtn() {
  const btn = document.createElement("button");
  btn.id = "cl-code-copy";
  btn.title = "Copy code (CodeLedger)";
  btn.className =
    "relative inline-flex gap-2 items-center justify-center font-medium cursor-pointer focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors bg-transparent enabled:hover:bg-fill-secondary enabled:active:bg-fill-primary text-caption rounded text-text-primary group aspect-1 h-full p-1";
  btn.innerHTML = `<div class="relative text-[14px] leading-[normal] p-[1px] before:block text-sd-muted-foreground flex items-center justify-center">
    <svg aria-hidden="true" focusable="false" class="h-3.5 w-3.5" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
      <path d="M384 336H192c-8.8 0-16-7.2-16-16V64c0-8.8 7.2-16 16-16h140.1L400 115.9V320c0 8.8-7.2 16-16 16zM192 16C165.5 16 144 37.5 144 64v256c0 26.5 21.5 48 48 48h192c26.5 0 48-21.5 48-48V115.9c0-12.7-5-24.9-14.1-33.9L353.9 14.1c-9-9-21.2-14.1-33.9-14.1H192zM64 128c-35.3 0-64 28.7-64 64v256c0 35.3 28.7 64 64 64h192c35.3 0 64-28.7 64-64v-32h-48v32c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192c0-8.8 7.2-16 16-16h32v-48H64z"/>
    </svg>
  </div>`;

  btn.onclick = () => {
    let code = "";
    const lines = document.querySelectorAll(".view-line");
    if (lines.length > 0) {
      code = Array.from(lines).map((l) => l.textContent.replace(/ /g, " ")).join("\n");
    } else {
      code = document.querySelector(".monaco-editor")?.textContent || "";
    }
    if (!code) return;

    navigator.clipboard.writeText(code);
    const orig = btn.innerHTML;
    btn.innerHTML = `<div class="relative text-[14px] p-[1px] text-emerald-500 flex items-center justify-center">
      <svg class="h-3.5 w-3.5" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
        <path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/>
      </svg>
    </div>`;
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
  };
  return btn;
}

/** Build the paste SVG button element. */
function makePasteBtn() {
  const btn = document.createElement("button");
  btn.id = "cl-code-paste";
  btn.title = "Paste from clipboard (no auto-indent) — CodeLedger";
  btn.className =
    "relative inline-flex gap-2 items-center justify-center font-medium cursor-pointer focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors bg-transparent enabled:hover:bg-fill-secondary enabled:active:bg-fill-primary text-caption rounded text-text-primary group aspect-1 h-full p-1";
  btn.innerHTML = `<div class="relative text-[14px] leading-[normal] p-[1px] before:block text-sd-muted-foreground flex items-center justify-center">
    <svg aria-hidden="true" focusable="false" class="h-3.5 w-3.5" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
      <path d="M208 0H332.1c12.7 0 24.9 5.1 33.9 14.1l67.9 67.9c9 9 14.1 21.2 14.1 33.9V336c0 26.5-21.5 48-48 48H208c-26.5 0-48-21.5-48-48V48c0-26.5 21.5-48 48-48zM48 128h80v64H64V448h192v-32h64v48c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V176c0-26.5 21.5-48 48-48z"/>
    </svg>
  </div>`;

  btn.onclick = async () => {
    const orig = btn.innerHTML;
    try {
      await pasteWithoutIndent();
      btn.innerHTML = `<div class="relative text-[14px] p-[1px] text-emerald-500 flex items-center justify-center">
        <svg class="h-3.5 w-3.5" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
          <path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/>
        </svg>
      </div>`;
      setTimeout(() => { btn.innerHTML = orig; }, 1500);
    } catch (_) { btn.innerHTML = orig; }
  };
  return btn;
}

/** Build the CodeLedger popup opener button. */
function makePopupBtn() {
  const btn = document.createElement("button");
  btn.id = "cl-open-popup";
  btn.title = "Open CodeLedger";
  btn.className =
    "relative inline-flex gap-2 items-center justify-center font-medium cursor-pointer focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors bg-transparent enabled:hover:bg-fill-secondary enabled:active:bg-fill-primary text-caption rounded text-text-primary group aspect-1 h-full p-1";
  btn.innerHTML = `<div class="relative text-[14px] leading-[normal] p-[1px] before:block text-sd-muted-foreground flex items-center justify-center" style="color:#06b6d4">
    <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
      <path d="M12 7v5l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  </div>`;

  btn.onclick = async () => {
    let code = "";
    const lines = document.querySelectorAll(".view-line");
    if (lines.length) {
      code = Array.from(lines).map((l) => l.textContent.replace(/ /g, " ")).join("\n");
    }
    const title =
      document.querySelector('[data-e2e-locator="question-title"]')?.textContent ||
      document.querySelector('[data-cy="question-title"]')?.textContent ||
      document.querySelector("h1")?.textContent || document.title || "";
    try {
      if (runtime && runtime.sendMessage) {
        await runtime.sendMessage({ type: "OPEN_POPUP", payload: { platform: "leetcode", title, code, url: window.location.href } });
      }
    } catch (_) { }
  };
  return btn;
}

let _qolInjected = false;
let _qolRetryTimer = null;

/**
 * Inject QoL buttons into the LeetCode editor toolbar.
 * Uses a retry loop since LeetCode's React renders the toolbar asynchronously.
 */
export function injectQoL() {
  // Clear any pending retry
  if (_qolRetryTimer) { clearTimeout(_qolRetryTimer); _qolRetryTimer = null; }

  // If all buttons already present and in the DOM, skip
  if (
    document.getElementById("cl-code-copy") &&
    document.getElementById("cl-code-paste") &&
    document.getElementById("cl-open-popup") &&
    document.getElementById("cl-code-copy").isConnected
  ) {
    _qolInjected = true;
    return;
  }

  const toolbar = findEditorToolbar();

  if (!toolbar) {
    // Toolbar not yet rendered — retry after a short delay (up to ~10s total)
    if (!_qolInjected) {
      _qolRetryTimer = setTimeout(() => injectQoL(), 800);
    }
    return;
  }

  // Remove stale buttons if they exist but are disconnected
  ["cl-code-copy", "cl-code-paste", "cl-open-popup"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.isConnected) el.remove();
  });

  // Inject if not already present
  if (!document.getElementById("cl-code-copy")) {
    const copyBtn = makeCopyBtn();
    const pasteBtn = makePasteBtn();
    toolbar.insertBefore(copyBtn, toolbar.firstChild);
    toolbar.insertBefore(pasteBtn, copyBtn.nextSibling);
  }
  if (!document.getElementById("cl-open-popup")) {
    toolbar.appendChild(makePopupBtn());
  }

  _qolInjected = true;
}

/** Reset injection state (call on SPA navigation to allow re-injection). */
export function resetQoL() {
  _qolInjected = false;
  if (_qolRetryTimer) { clearTimeout(_qolRetryTimer); _qolRetryTimer = null; }
  ["cl-code-copy", "cl-code-paste", "cl-open-popup"].forEach((id) => {
    document.getElementById(id)?.remove();
  });
}
