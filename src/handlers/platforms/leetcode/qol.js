/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { storage, runtime } from "../../../lib/browser-compat.js";
import { CONSTANTS } from "../../../core/constants.js";

/** Pastes clipboard text into the Monaco editor at cursor, bypassing auto-indentation. */
async function pasteWithoutIndent() {
  let text = "";
  try {
    text = await navigator.clipboard.readText();
  } catch (_) {
    return;
  }
  if (!text) return;

  // Monaco's hidden textarea captures input — insertText via execCommand
  // bypasses Monaco's paste handler and does not trigger auto-indentation.
  const inputArea = document.querySelector(
    ".monaco-editor .inputarea.monaco-mouse-cursor-text",
  );
  if (inputArea) {
    inputArea.focus();
    const ok = document.execCommand("insertText", false, text);
    if (ok) return;
  }

  // Fallback: dispatch a synthetic ClipboardEvent with the plain text
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
      }),
    );
  } catch (_) {}
}

export function injectQoL(container, selectors) {
  if (
    document.getElementById("cl-code-copy") &&
    document.getElementById("cl-open-popup")
  )
    return;

  const copyBtn = document.createElement("button");
  copyBtn.id = "cl-code-copy";
  copyBtn.className =
    "relative inline-flex gap-2 items-center justify-center font-medium cursor-pointer focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors bg-transparent enabled:hover:bg-fill-secondary enabled:active:bg-fill-primary text-caption rounded text-text-primary group ml-auto aspect-1 h-full p-1";
  copyBtn.innerHTML = `
    <div class="relative text-[14px] leading-[normal] p-[1px] before:block text-sd-muted-foreground flex items-center justify-center">
      <svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="copy" class="svg-inline--fa fa-copy h-3.5 w-3.5" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path fill="currentColor" d="M384 336H192c-8.8 0-16-7.2-16-16V64c0-8.8 7.2-16 16-16h140.1L400 115.9V320c0 8.8-7.2 16-16 16zM192 16C165.5 16 144 37.5 144 64v256c0 26.5 21.5 48 48 48h192c26.5 0 48-21.5 48-48V115.9c0-12.7-5-24.9-14.1-33.9L353.9 14.1c-9-9-21.2-14.1-33.9-14.1H192zM64 128c-35.3 0-64 28.7-64 64v256c0 35.3 28.7 64 64 64h192c35.3 0 64-28.7 64-64v-32h-48v32c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192c0-8.8 7.2-16 16-16h32v-48H64z"></path></svg>
    </div>
  `;

  copyBtn.onclick = () => {
    // Attempt to extract from Monaco editor lines
    let code = "";
    const lines = document.querySelectorAll(".view-line");
    if (lines.length > 0) {
      // Monaco renders whitespaces recursively via span, we need innerText to retain spacing
      // We process each line div
      code = Array.from(lines)
        .map((line) => {
          // Find text pieces or return textContent
          return line.textContent.replace(/\u00a0/g, " ");
        })
        .join("\n");
    } else {
      code = document.querySelector(".monaco-editor")?.textContent || "";
    }

    if (code) {
      navigator.clipboard.writeText(code);
      const originalSvg = copyBtn.innerHTML;
      copyBtn.innerHTML = `<div class="relative text-[14px] leading-[normal] p-[1px] before:block text-emerald-500 flex items-center justify-center">
        <svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="check" class="svg-inline--fa fa-check h-3.5 w-3.5" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path fill="currentColor" d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"></path></svg>
      </div>`;
      setTimeout(() => (copyBtn.innerHTML = originalSvg), 2000);
    }
  };

  // Paste button — inserts clipboard text without Monaco auto-indentation
  const pasteBtn = document.createElement("button");
  pasteBtn.id = "cl-code-paste";
  pasteBtn.title = "Paste from clipboard (no auto-indent)";
  pasteBtn.className =
    "relative inline-flex gap-2 items-center justify-center font-medium cursor-pointer focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors bg-transparent enabled:hover:bg-fill-secondary enabled:active:bg-fill-primary text-caption rounded text-text-primary group ml-auto aspect-1 h-full p-1";
  pasteBtn.innerHTML = `
    <div class="relative text-[14px] leading-[normal] p-[1px] before:block text-sd-muted-foreground flex items-center justify-center">
      <svg aria-hidden="true" focusable="false" class="h-3.5 w-3.5" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M208 0H332.1c12.7 0 24.9 5.1 33.9 14.1l67.9 67.9c9 9 14.1 21.2 14.1 33.9V336c0 26.5-21.5 48-48 48H208c-26.5 0-48-21.5-48-48V48c0-26.5 21.5-48 48-48zM48 128h80v64H64V448h192v-32h64v48c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V176c0-26.5 21.5-48 48-48z"/></svg>
    </div>
  `;

  pasteBtn.onclick = async () => {
    const originalHtml = pasteBtn.innerHTML;
    try {
      await pasteWithoutIndent();
      pasteBtn.innerHTML = `<div class="relative text-[14px] leading-[normal] p-[1px] before:block text-emerald-500 flex items-center justify-center">
        <svg aria-hidden="true" focusable="false" class="h-3.5 w-3.5" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"></path></svg>
      </div>`;
      setTimeout(() => (pasteBtn.innerHTML = originalHtml), 1500);
    } catch (_) {
      pasteBtn.innerHTML = originalHtml;
    }
  };

  // The exact toolbar location provided by user
  const editorHeaderActions =
    container.querySelector(
      "div.flex.h-8.items-center.justify-between > div.flex.h-full.items-center.gap-1",
    ) ||
    document.querySelector(
      "div.flex.h-8.items-center.justify-between > div.flex.h-full.items-center.gap-1",
    ) ||
    container;

  // AI / Popup opener button (QoL) — sends a message to the background to open the extension popup
  if (!document.getElementById("cl-open-popup")) {
    const aiBtn = document.createElement("button");
    aiBtn.id = "cl-open-popup";
    aiBtn.className =
      "relative inline-flex gap-2 items-center justify-center font-medium cursor-pointer focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-colors bg-transparent enabled:hover:bg-fill-secondary enabled:active:bg-fill-primary text-caption rounded text-text-primary group ml-auto aspect-1 h-full p-1";
    aiBtn.title = "Open CodeLedger popup";
    aiBtn.innerHTML = `
      <div class="relative text-[14px] leading-[normal] p-[1px] before:block text-sd-muted-foreground flex items-center justify-center">
        <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 7h-2v6h2V9zm0 8h-2v2h2v-2z" fill="currentColor"/></svg>
      </div>
    `;

    aiBtn.onclick = async () => {
      // gather best-effort context to prefill popup
      let code = "";
      const lines = document.querySelectorAll(".view-line");
      if (lines && lines.length) {
        code = Array.from(lines)
          .map((line) => line.textContent.replace(/\u00a0/g, " "))
          .join("\n");
      } else {
        code =
          document.querySelector(".monaco-editor")?.textContent ||
          document.querySelector("#editor")?.textContent ||
          "";
      }

      const title =
        document.querySelector('[data-cy="question-title"]')?.textContent ||
        document.querySelector("h1")?.textContent ||
        document.title ||
        "";
      const url = window.location.href;

      try {
        if (runtime && runtime.sendMessage) {
          await runtime.sendMessage({
            type: "OPEN_POPUP",
            payload: { platform: "leetcode", title, code, url },
          });
        } else if (window.postMessage) {
          // Fallback: postMessage to window (background bridges may pick it up)
          window.postMessage(
            {
              type: "OPEN_POPUP",
              payload: { platform: "leetcode", title, code, url },
            },
            "*",
          );
        }
      } catch (e) {
        // Ignore — best-effort only
      }
    };

    // append after the copy button to be non-intrusive
    if (editorHeaderActions) {
      editorHeaderActions.insertBefore(aiBtn, copyBtn.nextSibling || null);
    } else {
      container.appendChild(aiBtn);
    }
  }

  if (editorHeaderActions) {
    editorHeaderActions.insertBefore(copyBtn, editorHeaderActions.firstChild);
    editorHeaderActions.insertBefore(pasteBtn, copyBtn.nextSibling);
  }
}
