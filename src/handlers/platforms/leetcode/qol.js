/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SELECTORS } from "./dom-selectors.js";

async function copyToClipboard(text) {
    if (!text) return false;
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (_) {}

    // execCommand fallback (deprecated but still works in most content-script contexts)
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
}

/** Pastes clipboard text into the Monaco editor at cursor, bypassing auto-indentation. */
async function pasteWithoutIndent() {
    let text = "";
    try {
        text = await navigator.clipboard.readText();
    } catch (_) {
        return;
    }
    if (!text) return;

    const inputArea = document.querySelector(
        ".monaco-editor .inputarea.monaco-mouse-cursor-text"
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
        target.dispatchEvent(
            new ClipboardEvent("paste", {
                clipboardData: dt,
                bubbles: true,
                cancelable: true,
            })
        );
    } catch (_) {}
}

function toolbarFromAnchor(anchor) {
    if (!anchor) return null;
    let el = anchor.parentElement;
    for (let i = 0; i < 5 && el; i++, el = el.parentElement) {
        const buttonCount = el.querySelectorAll("button").length;
        if (
            buttonCount >= 2 &&
            /flex|items-center|justify-between|gap-/.test(el.className || "")
        ) {
            return el;
        }
    }
    return anchor.parentElement || null;
}

/**
 * Find the editor toolbar action button group.
 * LeetCode's class names are Tailwind utilities so they can change — we use
 * multiple structural heuristics with broad fallbacks.
 */
function findEditorToolbar() {
    const monaco = document.querySelector(SELECTORS.qol.editorContainer);
    const submit = document.querySelector(SELECTORS.qol.submitButton);

    const candidates = [
        document.querySelector(
            "div.flex.h-8.items-center.justify-between > div.flex.h-full.items-center.gap-1"
        ),
        document.querySelector(
            "div.flex.h-8.items-center.justify-between > div:last-child"
        ),
        document.querySelector(
            "[class*='editor-header'] div.flex.items-center.gap-1"
        ),
        document.querySelector(
            "[class*='editor-panel'] div.flex.h-8 > div:last-child"
        ),
        toolbarFromAnchor(submit),
        toolbarFromAnchor(monaco),
        (() => {
            if (!monaco) return null;
            let el = monaco.parentElement;
            for (let i = 0; i < 5 && el; i++, el = el.parentElement) {
                const sibling = el.previousElementSibling;
                if (sibling && sibling.querySelector("button")) return sibling;
            }
            return null;
        })(),
    ].filter(Boolean);

    return (
        candidates.find((el) => el.querySelectorAll("button").length > 0) ||
        candidates.find((el) =>
            /flex|items-center|justify-between|gap-/.test(el.className || "")
        ) ||
        candidates[0] ||
        null
    );
}

/**
 * Strip Monaco's whitespace-visualization characters from code so clipboard
 * output is clean and runnable.
 */
function cleanCode(code) {
    return code
        .replace(/·/g, " ") // middle dot → regular space
        .replace(/‌/g, "") // ZWNJ → remove
        .replace(/ /g, " "); // NBSP → regular space
}

/**
 * Get code from the Monaco editor.
 * Tries the active editor first (most reliable), then falls back to the first
 * non-empty model, then to DOM line scraping.
 */
function getEditorCode() {
    // Prefer the active editor's model — most reliable on LeetCode
    const activeCode = window.monaco?.editor
        ?.getActiveCodeEditor?.()
        ?.getModel?.()
        ?.getValue?.();
    if (activeCode) return cleanCode(activeCode);

    // Fallback: first editor in the list
    const editors = window.monaco?.editor?.getEditors?.();
    if (editors?.length) {
        for (const ed of editors) {
            const val = ed.getModel?.()?.getValue?.();
            if (val) return cleanCode(val);
        }
    }

    // Fallback: first non-empty model
    const models = window.monaco?.editor?.getModels?.();
    if (models?.length) {
        for (const m of models) {
            const val = m.getValue?.();
            if (val) return cleanCode(val);
        }
    }

    // Last resort: scrape visible DOM lines
    const lines = [...document.querySelectorAll(".view-line")]
        .map((l) => l.textContent)
        .join("\n");
    return lines ? cleanCode(lines) : "";
}

/** Show a brief error flash on the button then restore original HTML. */
function flashError(btn, orig) {
    btn.innerHTML = `<div class="relative text-[14px] p-[1px] text-rose-400 flex items-center justify-center">
    <svg class="h-3.5 w-3.5" viewBox="0 0 384 512" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
      <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3l105.4 105.3c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256l105.3-105.4z"/>
    </svg>
  </div>`;
    setTimeout(() => {
        btn.innerHTML = orig;
    }, 1500);
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

    btn.onclick = async () => {
        const code = getEditorCode();
        const orig = btn.innerHTML;
        if (!code) {
            flashError(btn, orig);
            return;
        }
        const success = await copyToClipboard(code);
        if (success) {
            btn.innerHTML = `<div class="relative text-[14px] p-[1px] text-emerald-500 flex items-center justify-center">
        <svg class="h-3.5 w-3.5" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
          <path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/>
        </svg>
      </div>`;
            setTimeout(() => {
                btn.innerHTML = orig;
            }, 2000);
        } else {
            flashError(btn, orig);
        }
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
            setTimeout(() => {
                btn.innerHTML = orig;
            }, 1500);
        } catch (_) {
            btn.innerHTML = orig;
        }
    };
    return btn;
}

let _qolInjected = false;
let _qolRetryTimer = null;

/**
 * Inject QoL buttons into the LeetCode editor toolbar.
 * Uses a retry loop since LeetCode's React renders the toolbar asynchronously.
 *
 * @param {{ showCopy?: boolean, showPaste?: boolean }} opts
 */
export function injectQoL(opts = {}) {
    const showCopy = opts.showCopy !== false;
    const showPaste = opts.showPaste !== false;

    if (_qolRetryTimer) {
        clearTimeout(_qolRetryTimer);
        _qolRetryTimer = null;
    }

    // If neither button is enabled, clean up and bail
    if (!showCopy && !showPaste) {
        ["cl-code-copy", "cl-code-paste"].forEach((id) =>
            document.getElementById(id)?.remove()
        );
        _qolInjected = false;
        return;
    }

    // Check if the enabled buttons are already correctly injected
    const copyOk =
        !showCopy ||
        (document.getElementById("cl-code-copy") &&
            document.getElementById("cl-code-copy").isConnected);
    const pasteOk =
        !showPaste ||
        (document.getElementById("cl-code-paste") &&
            document.getElementById("cl-code-paste").isConnected);
    if (copyOk && pasteOk) {
        _qolInjected = true;
        return;
    }

    const toolbar = findEditorToolbar();

    // Remove stale disconnected buttons
    ["cl-code-copy", "cl-code-paste"].forEach((id) => {
        const el = document.getElementById(id);
        if (el && !el.isConnected) el.remove();
    });

    if (toolbar) {
        if (showCopy && !document.getElementById("cl-code-copy")) {
            toolbar.insertBefore(makeCopyBtn(), toolbar.firstChild);
        }
        if (showPaste && !document.getElementById("cl-code-paste")) {
            const copyEl = document.getElementById("cl-code-copy");
            const ref = copyEl ? copyEl.nextSibling : toolbar.firstChild;
            toolbar.insertBefore(makePasteBtn(), ref);
        }
        // Remove buttons that were disabled after being injected
        if (!showCopy) document.getElementById("cl-code-copy")?.remove();
        if (!showPaste) document.getElementById("cl-code-paste")?.remove();
        _qolInjected = true;
        return;
    }

    if (!_qolInjected) {
        _qolRetryTimer = setTimeout(() => injectQoL(opts), 800);
    }
}

/** Reset injection state (call on SPA navigation to allow re-injection). */
export function resetQoL() {
    _qolInjected = false;
    if (_qolRetryTimer) {
        clearTimeout(_qolRetryTimer);
        _qolRetryTimer = null;
    }
    ["cl-code-copy", "cl-code-paste"].forEach((id) => {
        document.getElementById(id)?.remove();
    });
}
