/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LeetCode UI injection: sync buttons, profile action buttons, manual sync.
 */

import { createDebugger } from "../../../lib/debug.js";
import { runtime, tabs } from "../../../lib/browser-compat.js";
import { Storage } from "../../../core/storage.js";
import { PAGE_TYPES, detectPage } from "./page-detector.js";
import { processSubmission } from "./submission-detector.js";

const dbg = createDebugger("LCUIInjection");

export function syncButtonsForCurrentPage(handler) {
  const page = detectPage(window.location.pathname);

  const detailSyncBtn = document.getElementById("cl-sync-btn");
  const listSyncBtn = document.getElementById("cl-submission-list-sync");

  if (page.type === PAGE_TYPES.SUBMISSION) {
    if (listSyncBtn) listSyncBtn.remove();
    if (!detailSyncBtn) injectDetailSyncBtn(handler, page);
  } else if (page.type === PAGE_TYPES.PROBLEM) {
    if (listSyncBtn) listSyncBtn.remove();
    const resultEl = document.querySelector(
      '[data-e2e-locator="submission-result"]',
    );
    if (resultEl && resultEl.offsetParent) {
      if (!detailSyncBtn) injectDetailSyncBtn(handler, page);
    } else {
      if (detailSyncBtn) detailSyncBtn.remove();
      if (handler._syncBtnObserver) {
        handler._syncBtnObserver.disconnect();
        handler._syncBtnObserver = null;
      }
    }
  } else if (page.type === PAGE_TYPES.SUBMISSION_LIST) {
    if (detailSyncBtn) detailSyncBtn.remove();
    if (!listSyncBtn) injectSubmissionListSyncBtn(handler, page);
  } else {
    if (handler._syncBtnObserver) {
      handler._syncBtnObserver.disconnect();
      handler._syncBtnObserver = null;
    }
    if (detailSyncBtn) detailSyncBtn.remove();
    if (listSyncBtn) listSyncBtn.remove();
  }
}

export function injectDetailSyncBtn(handler, page) {
  if (document.getElementById("cl-sync-btn")) return;

  const findResultRow = () => {
    const resultEl = document.querySelector(
      '[data-e2e-locator="submission-result"]',
    );
    if (!resultEl || !resultEl.offsetParent) return null;
    let el = resultEl;
    for (let i = 0; i < 8; i++) {
      if (!el.parentElement || el.parentElement === document.body) break;
      el = el.parentElement;
      const { display, flexDirection } = window.getComputedStyle(el);
      if (
        (display === "flex" || display === "grid") &&
        flexDirection !== "column"
      ) {
        return el;
      }
    }
    return resultEl.parentElement;
  };

  const inject = (row) => {
    if (document.getElementById("cl-sync-btn")) return;
    const btn = document.createElement("button");
    btn.id = "cl-sync-btn";
    btn.title = "Sync this submission to CodeLedger";
    btn.className =
      "group whitespace-nowrap focus:outline-none flex items-center justify-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition-colors";
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4 12a8 8 0 018-8V2.5a.5.5 0 01.854-.354l3 3a.5.5 0 010 .708l-3 3A.5.5 0 0112 8.5V7a5 5 0 105 5h1.5a6.5 6.5 0 11-14.5 0z"/></svg> Sync to Ledger`;
    btn.addEventListener("click", () => manualSync(handler, page, btn));
    row.appendChild(btn);
  };

  const row = findResultRow();
  if (row) {
    inject(row);
    return;
  }

  if (handler._syncBtnObserver) handler._syncBtnObserver.disconnect();
  handler._syncBtnObserver = new MutationObserver(() => {
    const r = findResultRow();
    if (!r) return;
    handler._syncBtnObserver.disconnect();
    handler._syncBtnObserver = null;
    inject(r);
  });
  handler._syncBtnObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

export function injectSubmissionListSyncBtn(handler, page) {
  if (document.getElementById("cl-submission-list-sync")) return;

  const btn = document.createElement("button");
  btn.id = "cl-submission-list-sync";
  btn.title = "Refresh the latest accepted submission for this problem";
  btn.className =
    "fixed right-4 bottom-4 z-[2147483646] whitespace-nowrap focus:outline-none flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium border border-cyan-500/30 text-cyan-300 bg-slate-950/90 shadow-lg hover:bg-cyan-500/10 transition-colors";
  btn.textContent = "Sync latest accepted";
  btn.addEventListener("click", () => manualSync(handler, page, btn));
  document.body.appendChild(btn);
}

export async function injectProfileActionButtons(handler) {
  if (document.getElementById("cl-profile-actions")) return;

  const MAX_ATTEMPTS = 16;
  const RETRY_MS = 500;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (document.getElementById("cl-profile-actions")) return;

    const avatar =
      document.querySelector('img[class*="h-20"][class*="w-20"]') ||
      document.querySelector('img[class*="h-24"][class*="w-24"]') ||
      document.querySelector('[class*="avatar"] img, img[class*="avatar"]') ||
      document.querySelector('img[alt*="avatar" i], img[alt*="profile" i]');

    let column = null;
    if (avatar) {
      let el = avatar.parentElement;
      for (let i = 0; i < 8 && el; i++, el = el.parentElement) {
        const cls = el.className || "";
        if (/flex-col/.test(cls) && /items-center/.test(cls)) {
          column = el;
          break;
        }
      }
      if (!column) {
        column =
          avatar.closest('div[class*="flex-col"]') ||
          document.querySelector('[class*="profile-card"]') ||
          document.querySelector('[class*="user-card"]') ||
          avatar.parentElement;
      }
    }

    if (column) {
      const actions = document.createElement("div");
      actions.id = "cl-profile-actions";
      actions.style.cssText =
        "margin-top:12px;display:flex;flex-direction:column;gap:8px;" +
        "width:100%;padding:0 4px;box-sizing:border-box;";

      actions.appendChild(
        createProfileActionButton("Open CodeLedger Library", () => {
          try {
            tabs.create({ url: runtime.getURL("library/library.html") });
          } catch (_) {}
        }),
      );

      actions.appendChild(
        createProfileActionButton("Open GitHub Repo", async () => {
          const fallbackUrl = runtime.getURL(
            "library/library.html?tab=settings&settingsTab=git",
          );
          try {
            const settings = await Storage.getSettings();
            const owner =
              settings.github_owner ||
              settings.github_username ||
              settings.gitUser;
            const repo = settings.github_repo || settings.gitRepo;
            if (owner && repo) {
              tabs.create({ url: `https://github.com/${owner}/${repo}` });
              return;
            }
          } catch (_) {}
          tabs.create({ url: fallbackUrl });
        }),
      );

      column.appendChild(actions);
      return;
    }

    await new Promise((r) => setTimeout(r, RETRY_MS));
  }
}

export function removeProfileActionButtons() {
  document.getElementById("cl-profile-actions")?.remove();
}

function createProfileActionButton(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.style.cssText =
    "display:inline-flex;align-items:center;justify-content:center;" +
    "width:100%;padding:8px 12px;border-radius:8px;font-size:13px;font-weight:600;" +
    "font-family:inherit;cursor:pointer;border:1px solid rgba(6,182,212,0.35);" +
    "color:#67e8f9;background:rgba(6,182,212,0.08);transition:background 0.2s;" +
    "box-sizing:border-box;";
  btn.onmouseenter = () => {
    btn.style.background = "rgba(6,182,212,0.18)";
  };
  btn.onmouseleave = () => {
    btn.style.background = "rgba(6,182,212,0.08)";
  };
  btn.addEventListener("click", onClick);
  return btn;
}

/**
 * Manual sync triggered by user clicking sync button.
 */
export async function manualSync(handler, page, btn) {
  const originalHTML = btn.innerHTML;
  const originalText = btn.textContent;

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "⏳ Syncing…";
    }

    if (handler._processingLock) {
      let waited = 0;
      while (handler._processingLock && waited < 8000) {
        await new Promise((r) => setTimeout(r, 200));
        waited += 200;
      }
      if (btn) {
        btn.textContent = "✓ Auto-synced";
        setTimeout(() => {
          if (btn && btn.parentElement) {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
          }
        }, 2500);
      }
      return;
    }

    const processed = await processSubmission(handler, page, true);

    if (btn) {
      btn.textContent = processed ? "✓ Synced" : "✓ Already saved";
      setTimeout(() => {
        if (btn && btn.parentElement) {
          btn.innerHTML = originalHTML;
          btn.disabled = false;
        }
      }, 2500);
    }
  } catch (e) {
    dbg.error("Manual sync failed", e);
    if (btn && btn.parentElement) {
      btn.textContent = "✗ Failed";
      btn.disabled = false;
      setTimeout(() => {
        if (btn && btn.parentElement) {
          btn.innerHTML = originalHTML;
          btn.textContent = originalText;
        }
      }, 3000);
    }
  }
}
