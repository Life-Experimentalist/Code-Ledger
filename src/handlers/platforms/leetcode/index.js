/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasePlatformHandler } from "../../_base/BasePlatformHandler.js";
import { SELECTORS } from "./dom-selectors.js";
import { detectPage, PAGE_TYPES } from "./page-detector.js";
import { QUERIES } from "./graphql-queries.js";
import { eventBus } from "../../../core/event-bus.js";
import { injectQoL } from "./qol.js";
import { Storage } from "../../../core/storage.js";
import { canonicalMapper } from "../../../core/canonical-mapper.js";
import { createDebugger } from "../../../lib/debug.js";
import { registerPlatformPrompt } from "../../../core/ai-prompts.js";
import { createFloatingAI } from "../../../ui/floating-ai.js";
import { runtime, tabs } from "../../../lib/browser-compat.js";

const dbg = createDebugger("LeetCode");

// Module-level debounce timer — prevents rapid-fire MutationObserver callbacks
let _debounceTimer = null;

const LANG_EXT = {
  python: "py", python3: "py", cpp: "cpp", "c++": "cpp",
  c: "c", java: "java", javascript: "js", js: "js",
  typescript: "ts", ts: "ts", ruby: "rb", golang: "go",
  go: "go", swift: "swift", kotlin: "kt", scala: "scala",
  rust: "rs", php: "php", csharp: "cs", "c#": "cs",
  dart: "dart", racket: "rkt", erlang: "erl", elixir: "ex",
  mysql: "sql", postgresql: "sql", bash: "sh",
};

// Human-readable display name from slug
const LANG_VERBOSE = {
  python: "Python", python3: "Python3", cpp: "C++", "c++": "C++",
  c: "C", java: "Java", javascript: "JavaScript", js: "JavaScript",
  typescript: "TypeScript", ts: "TypeScript", ruby: "Ruby",
  golang: "Go", go: "Go", swift: "Swift", kotlin: "Kotlin",
  scala: "Scala", rust: "Rust", php: "PHP", csharp: "C#", "c#": "C#",
  dart: "Dart", racket: "Racket", erlang: "Erlang", elixir: "Elixir",
  mysql: "MySQL", postgresql: "PostgreSQL", bash: "Bash",
};

function langExt(name = "") {
  return LANG_EXT[name.toLowerCase().replace(/\s+/g, "")] || "txt";
}
/** Normalise submission.lang which can be a string slug OR an object { name, verboseName }. */
import { normalizeDifficulty } from "../../../core/difficulty-map.js";
import { resolvePrimaryTopic } from "../../../core/topic-resolver.js";
import { solutionPath, readmePath, hintsPath } from "../../../core/path-builder.js";
import { querySubmissionResult, isAcceptedVisibleExtended } from "./enhanced-selectors.js";
function resolveLang(rawLang) {
  if (!rawLang) return { verbose: "Unknown", slug: "txt", ext: "txt" };
  if (typeof rawLang === "string") {
    const slug = rawLang.toLowerCase().replace(/\s+/g, "");
    return { verbose: LANG_VERBOSE[slug] || rawLang, slug, ext: langExt(slug) };
  }
  // Object form: { name, verboseName, langSlug }
  const slug = (rawLang.name || rawLang.langSlug || "txt").toLowerCase().replace(/\s+/g, "");
  const verbose = rawLang.verboseName || LANG_VERBOSE[slug] || rawLang.name || slug;
  return { verbose, slug, ext: langExt(slug) };
}

export class LeetCodeHandler extends BasePlatformHandler {
  constructor() {
    super("leetcode", "LeetCode", {});
    this.mutationObserver = null;
    this.lastDetectedId = null;
    this._processingLock = false;
    this._aiPanel = null;
    this._aiPanelSlug = null;
    this._submissionPollTimer = null;
    this._syncBtnObserver = null;
    this._submitHookObserver = null;
    this._resultPollTimer = null;
    // Wire native timer reader into the shared PlatformTimer instance
    this._timer.getNativeElapsed = () => this._getElapsedSeconds();
    registerPlatformPrompt("leetcode", this.getDefaultPrompt());
  }

  getDefaultPrompt() {
    return `Review this {difficulty} {language} solution for LeetCode problem '{title}'.

Provide:
1. Time complexity (Big-O) and space complexity
2. Correctness — any edge cases that could fail?
3. One concrete optimisation if applicable
4. Key algorithmic pattern used

Be concise. Max 200 words.`;
  }

  getSettingsSchema() {
    return {
      id: this.id,
      title: "LeetCode",
      order: 10,
      fields: [
        // ── Core Tracking ──────────────────────────────────────────
        {
          key: "leetcode_enable",
          label: "Enable tracking",
          type: "toggle",
          default: true,
          description: "Auto-detect accepted submissions on LeetCode and save them to CodeLedger.",
        },
        {
          key: "leetcode_auto_review",
          label: "AI review on accept",
          type: "toggle",
          default: true,
          description: "Automatically analyze your code with AI immediately after acceptance.",
        },

        // ── Commit Content ─────────────────────────────────────────
        {
          key: "leetcode_readme",
          label: "Include problem description",
          type: "toggle",
          default: true,
          description: "Save full problem statement and your stats to README.md.",
        },
        {
          key: "leetcode_similar",
          label: "Include similar problems",
          type: "toggle",
          default: true,
          description: "Add LeetCode's similar problems list to your commit.",
        },
        {
          key: "leetcode_sync_hints",
          label: "Include hints",
          type: "toggle",
          default: false,
          description: "Save problem hints to hints.md alongside your solution.",
          advanced: true,
        },

        // ── UI Features ────────────────────────────────────────────
        {
          key: "leetcode_ai_panel",
          label: "Floating AI assistant",
          type: "toggle",
          default: true,
          description: "Show a floating AI chat panel for instant code feedback on problem pages.",
        },

        // ── Import (Advanced) ──────────────────────────────────────
        {
          key: "leetcode_username",
          label: "LeetCode username",
          type: "text",
          default: "",
          description: "Your public LeetCode username for importing your profile history.",
          advanced: true,
          placeholder: "e.g. vkrishna04",
        },
      ],
    };
  }

  async init() {
    dbg.log("LeetCode handler active on", window.location.pathname);
    this._setupMutationObserver();
    this._setupSyncButtons();
    this._setupSubmitHook();
    await this._handlePageSpecific();
  }

  /** Setup handlers for page sync buttons — runs at init + on mutations. */
  _setupSyncButtons() {
    // Initial checks at different time intervals (elements may render staggered)
    this._syncButtonsForCurrentPage();
    setTimeout(() => this._syncButtonsForCurrentPage(), 800);
    setTimeout(() => this._syncButtonsForCurrentPage(), 2000);

    // Watch for mutations and re-evaluate button state
    const observer = new MutationObserver(() => this._syncButtonsForCurrentPage());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async _handleOnDemandFetch(page) {
    try {
      const params = new URLSearchParams(window.location.search);
      if (!params.get("codeledger_fetch")) return false;
      const slug = page.slug || params.get("cl_fetch_id") || params.get("slug");
      if (!slug) return false;
      const existing = await Storage.getProblem(String(slug)).catch(() => null);
      const meta = await this._fetchMetadata(slug);
      const merged = {
        ...(existing || {}),
        platform: "leetcode",
        id: String(slug),
        title: meta?.title || existing?.title || slug,
        titleSlug: slug,
        difficulty: normalizeDifficulty(meta?.difficulty || existing?.difficulty || ""),
        tags: (meta?.topicTags || []).map(t => t.name),
        problemStatement: meta?.content || existing?.problemStatement || null,
        timestamp: existing?.timestamp || Date.now(),
      };
      await Storage.saveProblem(merged).catch(() => { });
      await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: "REFRESH_METADATA_DONE", platform: "leetcode", slug }, () => resolve());
        } catch (_) {
          resolve();
        }
      });
      try { window.close(); } catch (_) { }
      return true;
    } catch (e) {
      dbg.error("on-demand fetch failed", e);
      return false;
    }
  }

  /** Handle page-specific init logic on load and SPA navigation. */
  async _handlePageSpecific() {
    const page = detectPage(window.location.pathname);

    // Fast path for refresh-data fetch flow opened from library modal.
    const fetched = await this._handleOnDemandFetch(page);
    if (fetched) return;

    // QoL buttons on problem pages
    if (page.type === PAGE_TYPES.PROBLEM) {
      Storage.getSettings().then((s) => {
        if (s.qolEnabled !== false) setTimeout(() => injectQoL(), 1500);
      }).catch(() => { setTimeout(() => injectQoL(), 1500); });
    }

    // AI panel on problem and submission pages
    if (page.type === PAGE_TYPES.PROBLEM || page.type === PAGE_TYPES.SUBMISSION) {
      if (page.slug) this._startAIPanel(page.slug);
      this._startSubmissionPolling();
    } else {
      this._stopAIPanel();
      this._stopSubmissionPolling();
    }

    // Immediate check on submission detail pages
    if (page.type === PAGE_TYPES.SUBMISSION) {
      setTimeout(() => this._checkSubmission(), 250);
    }

    // /progress page import button (only progress page keeps import)
    if (page.type === PAGE_TYPES.PROGRESS) {
      this._injectProgressImportBtn().catch(() => { });
    } else {
      this._removeProgressImportButton();
    }

    if (page.type === PAGE_TYPES.PROFILE) {
      this._injectProfileActionButtons().catch(() => { });
    } else {
      this._removeProfileActionButtons();
    }
  }

  _getNativeTimerElement() {
    return document.querySelector(".select-none.text-sm.text-sd-blue-400");
  }

  _startAIPanel(slug) {
    Storage.getSettings().then((settings) => {
      if (settings.leetcode_ai_panel === false) return;
      if (settings.floatingAIEnabled === false) return;
      if (this._aiPanel && this._aiPanelSlug === slug) return;
      this._stopAIPanel();
      this._aiPanelSlug = slug;
      this._aiPanel = createFloatingAI(slug, { position: { bottom: "110px", right: "20px" } });
    }).catch(() => { });
  }

  _stopAIPanel() {
    if (this._aiPanel) {
      this._aiPanel.destroy({ force: true });
      this._aiPanel = null;
      this._aiPanelSlug = null;
    }
  }

  _startSubmissionPolling() {
    if (this._submissionPollTimer) return;
    this._submissionPollTimer = setInterval(() => {
      this._checkSubmission();
    }, 2000);
  }

  _stopSubmissionPolling() {
    if (this._submissionPollTimer) {
      clearInterval(this._submissionPollTimer);
      this._submissionPollTimer = null;
    }
  }

  _getElapsedSeconds() {
    const timerEl = this._getNativeTimerElement();
    if (!timerEl) return null;

    const text = timerEl.textContent || "";
    const match = text.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
    if (!match) return null;

    const parts = match[1].split(":").map((n) => Number(n));
    if (parts.some((n) => Number.isNaN(n))) return null;
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    if (parts.length === 2) return (parts[0] * 60) + parts[1];
    return null;
  }

  _setupMutationObserver() {
    let lastPath = window.location.pathname;

    this.mutationObserver = new MutationObserver(() => {
      const currentPath = window.location.pathname;
      if (currentPath !== lastPath) {
        lastPath = currentPath;
        this._onNavigate(currentPath);
      }
    });
    // childList + subtree is enough to catch SPA route changes; no need for characterData/attributes
    this.mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  /** Called when LeetCode SPA navigates to a new page. */
  _onNavigate(pathname) {
    const page = detectPage(pathname);
    dbg.log("SPA navigate →", page.type, pathname);

    this._handleOnDemandFetch(page).catch(() => { });

    // Re-inject QoL on problem pages
    if (page.type === PAGE_TYPES.PROBLEM) {
      this._setupSubmitHook(); // re-hook after React re-renders the submit button
      Storage.getSettings().then((s) => {
        if (s.qolEnabled !== false) {
          import("./qol.js").then(({ resetQoL }) => resetQoL()).catch(() => { });
          setTimeout(() => injectQoL(), 1500);
        }
      }).catch(() => {
        import("./qol.js").then(({ resetQoL }) => resetQoL()).catch(() => { });
        setTimeout(() => injectQoL(), 1500);
      });
      this._startAIPanel(page.slug);
    } else if (page.type === PAGE_TYPES.SUBMISSION) {
      if (page.slug) this._startAIPanel(page.slug);
    } else {
      this._stopAIPanel();
    }

    if (page.type === PAGE_TYPES.PROBLEM || page.type === PAGE_TYPES.SUBMISSION) {
      this._startSubmissionPolling();
    } else {
      this._stopSubmissionPolling();
    }

    // On submission detail pages, trigger a check immediately after render settles
    if (page.type === PAGE_TYPES.SUBMISSION) {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => this._checkSubmission(), 1200);
    }

    // Profile page import button
    // Only progress page import remains; profile import removed per user request
    if (page.type === PAGE_TYPES.PROGRESS) {
      this._injectProgressImportBtn().catch(() => { });
    } else {
      this._removeProgressImportButton();
    }

    if (page.type === PAGE_TYPES.PROFILE) {
      this._injectProfileActionButtons().catch(() => { });
    } else {
      this._removeProfileActionButtons();
    }
  }

  /** Manage sync button visibility based on current page type. */
  _syncButtonsForCurrentPage() {
    const page = detectPage(window.location.pathname);

    const detailSyncBtn = document.getElementById("cl-sync-btn");
    const listSyncBtn = document.getElementById("cl-submission-list-sync");

    // Show detail sync button only on submission detail pages
    if (page.type === PAGE_TYPES.SUBMISSION) {
      if (listSyncBtn) listSyncBtn.remove();
      if (!detailSyncBtn) this._injectDetailSyncBtn(page);
    }
    // Show list sync button only on submission list pages
    else if (page.type === PAGE_TYPES.SUBMISSION_LIST) {
      if (detailSyncBtn) detailSyncBtn.remove();
      if (!listSyncBtn) this._injectSubmissionListSyncBtn(page);
    }
    // Hide both buttons on other pages
    else {
      if (this._syncBtnObserver) { this._syncBtnObserver.disconnect(); this._syncBtnObserver = null; }
      if (detailSyncBtn) detailSyncBtn.remove();
      if (listSyncBtn) listSyncBtn.remove();
    }
  }

  _injectDetailSyncBtn(page) {
    if (document.getElementById("cl-sync-btn")) return;

    const findRow = () => {
      const row =
        document.querySelector(".flex.flex-none.gap-2:not(.justify-center):not(.justify-between)") ||
        document.querySelector(".flex.gap-2:not(.justify-center):not(.justify-between)");
      return row && row.offsetParent ? row : null;
    };

    const inject = (row) => {
      if (document.getElementById("cl-sync-btn")) return;
      const btn = document.createElement("button");
      btn.id = "cl-sync-btn";
      btn.title = "Sync this submission to CodeLedger";
      btn.className =
        "group whitespace-nowrap focus:outline-none flex items-center justify-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition-colors";
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4 12a8 8 0 018-8V2.5a.5.5 0 01.854-.354l3 3a.5.5 0 010 .708l-3 3A.5.5 0 0112 8.5V7a5 5 0 105 5h1.5a6.5 6.5 0 11-14.5 0z"/></svg> Sync to Ledger`;
      btn.addEventListener("click", () => this._manualSync(page, btn));
      row.appendChild(btn);
    };

    const row = findRow();
    if (row) { inject(row); return; }

    // Button row not in DOM yet — watch for it immediately via MutationObserver
    // instead of a fixed setTimeout so the button appears as soon as the row renders.
    if (this._syncBtnObserver) this._syncBtnObserver.disconnect();
    this._syncBtnObserver = new MutationObserver(() => {
      const r = findRow();
      if (!r) return;
      this._syncBtnObserver.disconnect();
      this._syncBtnObserver = null;
      inject(r);
    });
    this._syncBtnObserver.observe(document.body, { childList: true, subtree: true });
  }

  _injectSubmissionListSyncBtn(page) {
    if (document.getElementById("cl-submission-list-sync")) return;

    const btn = document.createElement("button");
    btn.id = "cl-submission-list-sync";
    btn.title = "Refresh the latest accepted submission for this problem";
    btn.className =
      "fixed right-4 bottom-4 z-[2147483646] whitespace-nowrap focus:outline-none flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium border border-cyan-500/30 text-cyan-300 bg-slate-950/90 shadow-lg hover:bg-cyan-500/10 transition-colors";
    btn.textContent = "Sync latest accepted";
    btn.addEventListener("click", () => this._manualSync(page, btn));
    document.body.appendChild(btn);
  }

  /**
   * Manual sync triggered by user clicking sync button.
   * Provides clear state feedback: "Syncing…" → "✓ Synced" → restore button.
   */
  async _manualSync(page, btn) {
    const originalHTML = btn.innerHTML;
    const originalText = btn.textContent;

    try {
      // State: Syncing
      if (btn) {
        btn.disabled = true;
        btn.textContent = "⏳ Syncing…";
      }

      await this._processSubmission(page, true);

      // State: Success
      if (btn) {
        btn.textContent = "✓ Synced";
        // Restore after 2.5s
        setTimeout(() => {
          if (btn && btn.parentElement) {
            btn.innerHTML = originalHTML;
            btn.textContent = originalText;
            btn.disabled = false;
          }
        }, 2500);
      }
    } catch (e) {
      dbg.error("Manual sync failed", e);
      // State: Error
      if (btn && btn.parentElement) {
        btn.textContent = "✗ Failed";
        btn.disabled = false;
        // Restore after 3s
        setTimeout(() => {
          if (btn && btn.parentElement) {
            btn.innerHTML = originalHTML;
            btn.textContent = originalText;
          }
        }, 3000);
      }
    }
  }

  /* ── Progress page import ─────────────────────────────────────────── */
  /**
   * Inject the import button on leetcode.com/progress (stable URL; always the logged-in user).
   * The progress page is preferred over /u/{username} because it's a fixed URL with no
   * username-check ambiguity.
   */
  async _injectProgressImportBtn() {
    if (document.getElementById("cl-profile-import")) return;

    const MAX_ATTEMPTS = 16;
    const RETRY_MS = 500;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (document.getElementById("cl-profile-import")) return;

      // /progress shows a top summary card — look for the calendar or user-name heading
      const anchor =
        document.querySelector("[class*='progress-header']") ||
        document.querySelector("[class*='userProfile'], [class*='user-profile']") ||
        document.querySelector("h1, h2") ||
        document.querySelector("main");

      if (anchor) {
        const username = null; // no per-user check needed on /progress
        const container = document.createElement("div");
        container.style.cssText = "margin:12px 0;display:flex;flex-direction:column;gap:6px;";

        const btn = this._createImportBtn(username);
        const prog = document.createElement("div");
        prog.id = "cl-import-progress";
        prog.style.cssText = "font-size:12px;color:#94a3b8;display:none;";

        container.appendChild(btn);
        container.appendChild(prog);
        anchor.parentElement?.insertBefore(container, anchor) || document.body.appendChild(container);
        return;
      }

      await new Promise((r) => setTimeout(r, RETRY_MS));
    }

    // Fallback: floating button at bottom-right
    if (!document.getElementById("cl-profile-import")) {
      const floater = document.createElement("div");
      floater.style.cssText =
        "position:fixed;bottom:80px;right:20px;z-index:9999;" +
        "display:flex;flex-direction:column;gap:6px;align-items:flex-end;";
      const btn = this._createImportBtn(null);
      btn.style.boxShadow = "0 4px 24px rgba(6,182,212,0.25)";
      const prog = document.createElement("div");
      prog.id = "cl-import-progress";
      prog.style.cssText = "font-size:11px;color:#94a3b8;background:#0a0a0f;border:1px solid #1e293b;padding:4px 8px;border-radius:6px;max-width:240px;text-align:right;display:none;";
      floater.appendChild(prog);
      floater.appendChild(btn);
      document.body.appendChild(floater);
    }
  }

  _removeProgressImportButton() {
    document.getElementById("cl-profile-import")?.remove();
    document.getElementById("cl-import-progress")?.remove();
  }

  async _injectProfileActionButtons() {
    if (document.getElementById("cl-profile-actions")) return;

    const MAX_ATTEMPTS = 16;
    const RETRY_MS = 500;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (document.getElementById("cl-profile-actions")) return;

      // Find the avatar image (LeetCode uses h-20/h-24 rounded-full for profile avatars)
      const avatar =
        document.querySelector('img[class*="h-20"][class*="w-20"]') ||
        document.querySelector('img[class*="h-24"][class*="w-24"]') ||
        document.querySelector('[class*="avatar"] img, img[class*="avatar"]') ||
        document.querySelector('img[alt*="avatar" i], img[alt*="profile" i]');

      // Walk up from the avatar to find the flex-col sidebar column (narrow, centered)
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

        actions.appendChild(this._createProfileActionButton("Open CodeLedger Library", () => {
          try {
            tabs.create({ url: runtime.getURL("library/library.html") });
          } catch (_) { }
        }));

        actions.appendChild(this._createProfileActionButton("Open GitHub Repo", async () => {
          const fallbackUrl = runtime.getURL("library/library.html?tab=settings&settingsTab=git");
          try {
            const settings = await Storage.getSettings();
            const owner = settings.github_owner || settings.github_username || settings.gitUser;
            const repo = settings.github_repo || settings.gitRepo;
            if (owner && repo) {
              tabs.create({ url: `https://github.com/${owner}/${repo}` });
              return;
            }
          } catch (_) { }
          tabs.create({ url: fallbackUrl });
        }));

        column.appendChild(actions);
        return;
      }

      await new Promise((r) => setTimeout(r, RETRY_MS));
    }
  }

  _createProfileActionButton(label, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.style.cssText =
      "display:inline-flex;align-items:center;justify-content:center;" +
      "width:100%;padding:8px 12px;border-radius:8px;font-size:13px;font-weight:600;" +
      "font-family:inherit;cursor:pointer;border:1px solid rgba(6,182,212,0.35);" +
      "color:#67e8f9;background:rgba(6,182,212,0.08);transition:background 0.2s;" +
      "box-sizing:border-box;";
    btn.onmouseenter = () => { btn.style.background = "rgba(6,182,212,0.18)"; };
    btn.onmouseleave = () => { btn.style.background = "rgba(6,182,212,0.08)"; };
    btn.addEventListener("click", onClick);
    return btn;
  }

  _removeProfileActionButtons() {
    document.getElementById("cl-profile-actions")?.remove();
  }

  /** Create the styled import button element. */
  _createImportBtn(pageUsername) {
    const btn = document.createElement("button");
    btn.id = "cl-profile-import";
    btn.style.cssText =
      "display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;" +
      "font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;" +
      "border:1px solid rgba(6,182,212,0.4);color:#67e8f9;" +
      "background:rgba(6,182,212,0.08);transition:background 0.2s;";
    btn.onmouseenter = () => { btn.style.background = "rgba(6,182,212,0.18)"; };
    btn.onmouseleave = () => { btn.style.background = "rgba(6,182,212,0.08)"; };
    btn.innerHTML =
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">` +
      `<path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm1 14H11v-4H8l4-4 4 4h-3v4z"/>` +
      `</svg> Import All Solves to CodeLedger`;
    btn.addEventListener("click", () => this._runProfileImport(pageUsername, btn));
    return btn;
  }

  async _runProfileImport(pageUsername, btn) {
    btn.disabled = true;
    const progressEl = document.getElementById("cl-import-progress");
    const show = (msg) => {
      dbg.log("[import]", msg);
      if (progressEl) { progressEl.textContent = msg; progressEl.style.display = "block"; }
    };

    try {
      // ── Phase 1: Bulk problem index (difficulty + title from REST API) ──
      show("Building problem index…");
      const diffMap = {}; // slug → "Easy"|"Medium"|"Hard"
      const titleMap = {}; // slug → display title
      const tagsMap = {}; // slug → string[]
      const descMap = {}; // slug → HTML content string
      const hintsMap = {}; // slug → string[]
      const acRateMap = {}; // slug → number
      const similarMap = {}; // slug → array

      try {
        const apiRes = await fetch("https://leetcode.com/api/problems/all/", { credentials: "include" });
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          const LEVEL = { 1: "Easy", 2: "Medium", 3: "Hard" };
          for (const pair of (apiData.stat_status_pairs || [])) {
            const slug = pair.stat?.question__title_slug;
            const level = pair.difficulty?.level;
            const title = pair.stat?.question__title;
            if (slug) {
              if (level) diffMap[slug] = LEVEL[level];
              if (title) titleMap[slug] = title;
            }
          }
          show(`Problem index: ${Object.keys(diffMap).length} entries.`);
        } else {
          show("Problem index unavailable — will fetch per-problem.");
        }
      } catch (_) {
        show("Problem index fetch failed — will fetch per-problem.");
      }

      // ── Phase 2: Paginate accepted submissions via REST API (more stable than GraphQL) ──
      show("Fetching submission history…");
      const allSubs = [];
      let offset = 0;
      const PAGE = 20;
      let pageNum = 0;

      while (true) {
        show(`Fetching submissions page ${++pageNum}…`);
        let pageData;
        try {
          const res = await fetch(
            `https://leetcode.com/api/submissions/?offset=${offset}&limit=${PAGE}`,
            { credentials: "include" }
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          pageData = await res.json();
        } catch (e) {
          throw new Error(`Submission fetch failed (page ${pageNum}): ${e.message}. Make sure you are logged in to LeetCode.`);
        }

        // LeetCode REST returns submissions_dump (snake_case); normalise to camelCase
        const raw = pageData.submissions_dump || pageData.submissions || [];
        for (const s of raw) {
          const titleSlug = s.title_slug || s.titleSlug || "";
          const langSlug = (s.lang || "").toLowerCase().replace(/\s+/g, "");
          const statusOk = s.status_display === "Accepted" || s.statusDisplay === "Accepted";
          if (!statusOk || !titleSlug) continue;
          // Timestamps: REST API returns Unix seconds (always); normalise here
          const tsRaw = Number(s.timestamp || s.time || 0);
          // Guard: if LeetCode ever returns ms (> year 2100 in seconds = 4102444800),
          // treat it as already-ms; otherwise multiply.
          const ts = tsRaw > 4_102_444_800 ? tsRaw : tsRaw * 1000;
          allSubs.push({
            titleSlug,
            title: s.title || titleSlug,
            lang: langSlug,
            langName: s.lang_name || s.langName || langSlug,
            runtime: s.runtime || "",
            memory: s.memory || "",
            timestamp: ts,           // stored as ms
            id: s.id,
          });
        }

        if (!pageData.has_next) break;
        offset += PAGE;
        await new Promise((r) => setTimeout(r, 600));
      }

      if (allSubs.length === 0) {
        show("No accepted submissions found. Make sure you are logged in to LeetCode.");
        btn.disabled = false;
        return;
      }

      // ── Phase 3: Dedup — keep newest accepted per (titleSlug, lang) ──
      const dedupMap = new Map();
      for (const s of allSubs) {
        const key = `${s.titleSlug}::${s.lang}`;
        const cur = dedupMap.get(key);
        if (!cur || s.timestamp > cur.timestamp) dedupMap.set(key, s);
      }
      const picks = Array.from(dedupMap.values());
      show(`Found ${picks.length} unique accepted submissions.`);

      // ── Phase 4: Fetch metadata (difficulty + tags + description) via QUESTION query ──
      // The REST API gives difficulty but NOT topic tags or descriptions.
      const needMeta = [...new Set(
        picks
          .filter(s => !diffMap[s.titleSlug] || !tagsMap[s.titleSlug])
          .map(s => s.titleSlug)
      )];

      if (needMeta.length > 0) {
        show(`Fetching tags & descriptions for ${needMeta.length} problems…`);
        for (let i = 0; i < needMeta.length; i++) {
          const slug = needMeta[i];
          try {
            const meta = await this._fetchMetadata(slug);
            if (meta) {
              if (meta.difficulty) diffMap[slug] = meta.difficulty;
              if (meta.title) titleMap[slug] = meta.title;
              if (meta.topicTags?.length) tagsMap[slug] = meta.topicTags.map(t => t.name);
              if (meta.content) descMap[slug] = meta.content;
              if (meta.hints?.length) hintsMap[slug] = meta.hints;
              if (meta.acRate != null) acRateMap[slug] = meta.acRate;
              if (meta.similarQuestionList?.length) similarMap[slug] = meta.similarQuestionList;
            }
          } catch (_) { }
          if (i < needMeta.length - 1) await new Promise((r) => setTimeout(r, 200));
          if ((i + 1) % 10 === 0) show(`Tags… ${i + 1}/${needMeta.length}`);
        }
      }

      // ── Phase 4b: Fetch submission code via GraphQL submissionDetails ──
      // Three concurrent requests with a 400ms gap between batches.
      const BATCH = 3;
      show(`Fetching code for ${picks.length} submissions…`);
      for (let i = 0; i < picks.length; i += BATCH) {
        const batch = picks.slice(i, i + BATCH);
        await Promise.all(batch.map(async (sub) => {
          if (!sub.id) return;
          try {
            const res = await this._gql(QUERIES.SUBMISSION_DETAIL, { submissionId: +sub.id });
            const d = res.data?.submissionDetails;
            if (d) {
              if (d.code) sub.code = d.code;
              if (d.runtimeDisplay) sub.runtime = d.runtimeDisplay;
              if (d.memoryDisplay) sub.memory = d.memoryDisplay;
              if (d.runtimePercentile) sub.runtimePct = d.runtimePercentile;
              if (d.memoryPercentile) sub.memoryPct = d.memoryPercentile;
            }
          } catch (_) { /* leave code empty — non-fatal */ }
        }));
        if (i + BATCH < picks.length) await new Promise((r) => setTimeout(r, 400));
        if ((i / BATCH) % 5 === 0 || i + BATCH >= picks.length) {
          show(`Code ${Math.min(i + BATCH, picks.length)}/${picks.length}…`);
        }
      }

      // ── Phase 5: Send all problems as one atomic BULK_IMPORT to avoid concurrent write races ──
      show(`Importing ${picks.length} submissions…`);

      const settings = await Storage.getSettings();
      const bulkProblems = picks.map((sub) => {
        const lang    = resolveLang(sub.lang || sub.langName);
        const tags    = tagsMap[sub.titleSlug] || [];
        const topic   = resolvePrimaryTopic(tags);
        const title   = titleMap[sub.titleSlug] || sub.title || sub.titleSlug;
        const difficulty = diffMap[sub.titleSlug] || "Unknown";
        const canonical  = null; // bulk import has no canonical mapping

        const files = [];
        if (sub.code) {
          files.push({
            path:    solutionPath(sub.titleSlug, "leetcode", lang, canonical, settings),
            content: sub.code,
          });
        }

        const readmeContent = (descMap[sub.titleSlug] || sub.code)
          ? this._buildBulkReadme(sub, {
              title,
              difficulty,
              tags,
              acRate:   acRateMap[sub.titleSlug] ?? null,
              similar:  similarMap[sub.titleSlug] || [],
              descHtml: descMap[sub.titleSlug] || null,
            })
          : null;

        if (readmeContent) {
          files.push({
            path:    readmePath(sub.titleSlug, canonical, settings),
            content: readmeContent,
          });
        }

        return {
          id:             `${sub.titleSlug}::${lang.slug}`,
          submissionId:   sub.id || null,
          platform:       "leetcode",
          title,
          titleSlug:      sub.titleSlug,
          difficulty,
          lang:           { name: lang.verbose, ext: lang.ext, slug: lang.slug },
          tags,
          topic,
          code:           sub.code || "",
          readmeContent:  readmeContent || null,
          files,
          timestamp:      sub.timestamp,
          runtime:        sub.runtime || null,
          memory:         sub.memory  || null,
          runtimePct:     sub.runtimePct  || null,
          memoryPct:      sub.memoryPct   || null,
          problemStatement: descMap[sub.titleSlug] || null,
          hints:          hintsMap[sub.titleSlug] || null,
          acRate:         acRateMap[sub.titleSlug] ?? null,
          similar:        similarMap[sub.titleSlug] || null,
          hasSimilar:     (similarMap[sub.titleSlug]?.length > 0) || null,
        };
      });

      const result = await new Promise((resolve) => {
        runtime.sendMessage({ type: "BULK_IMPORT", problems: bulkProblems }, (res) => resolve(res || {}));
      });
      const imported = result.saved ?? bulkProblems.length;

      show(`Done! Imported ${imported} submissions.`);
      btn.textContent = `✓ Imported ${imported} solves`;
      btn.style.color = "#34d399";
      btn.style.borderColor = "rgba(52,211,153,0.4)";

      if (imported > 0) {
        const commitBtn = document.createElement("button");
        commitBtn.style.cssText =
          "display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;" +
          "font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;margin-top:8px;" +
          "border:1px solid rgba(6,182,212,0.4);color:#67e8f9;background:rgba(6,182,212,0.08);transition:background 0.2s;";
        commitBtn.innerHTML =
          `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M4 12a8 8 0 018-8V2.5a.5.5 0 01.854-.354l3 3a.5.5 0 010 .708l-3 3A.5.5 0 0112 8.5V7a5 5 0 105 5h1.5a6.5 6.5 0 11-14.5 0z"/></svg>` +
          ` Commit ${imported} to GitHub`;
        commitBtn.onmouseenter = () => { commitBtn.style.background = "rgba(6,182,212,0.18)"; };
        commitBtn.onmouseleave = () => { commitBtn.style.background = "rgba(6,182,212,0.08)"; };
        commitBtn.addEventListener("click", async () => {
          commitBtn.disabled = true;
          commitBtn.textContent = "⏳ Committing…";
          show("Committing to GitHub…");
          try {
            const result = await new Promise((resolve) => {
              runtime.sendMessage({
                type: "RESYNC_ALL",
                mode: "bulk",
                commitType: "comprehensive-update",
              }, (res) => resolve(res || {}));
            });
            if (result.ok) {
              show(`✓ Committed ${result.committed ?? imported} problems to GitHub.`);
              commitBtn.textContent = `✓ Committed ${result.committed ?? imported}`;
              commitBtn.style.color = "#34d399";
            } else {
              throw new Error(result.error || "Unknown error");
            }
          } catch (e) {
            dbg.error("Bulk commit failed", e);
            show(`Commit failed: ${e.message}`);
            commitBtn.textContent = "↺ Retry";
            commitBtn.disabled = false;
          }
        });
        btn.parentElement?.appendChild(commitBtn);
      }
    } catch (e) {
      dbg.error("Profile import failed", e);
      show(`Import failed: ${e.message}`);
      btn.disabled = false;
      btn.textContent = "↺ Retry Import";
    }
  }

  /** Extract the CSRF token from LeetCode cookies. */
  _getCsrf() {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : "";
  }

  /**
   * Watch for the submit button to appear, then hook its click + Ctrl/Cmd+Enter.
   * This mirrors the LeetHub reference approach: trigger result polling on submit,
   * rather than passively scanning all DOM mutations for "Accepted" text.
   */
  _setupSubmitHook() {
    if (this._submitHookObserver) {
      this._submitHookObserver.disconnect();
      this._submitHookObserver = null;
    }

    const hookBtn = (btn) => {
      if (btn._clHooked) return;
      btn._clHooked = true;
      btn.addEventListener("click", () => this._onSubmitFired());
    };

    // Hook keyboard shortcut on the editor textarea (Ctrl+Enter / Cmd+Enter)
    const hookKeyboard = () => {
      const textarea = document.querySelector(
        ".monaco-editor .inputarea.monaco-mouse-cursor-text"
      );
      if (textarea && !textarea._clHooked) {
        textarea._clHooked = true;
        textarea.addEventListener("keydown", (e) => {
          const isMac = navigator.platform.toUpperCase().includes("MAC");
          if (e.key === "Enter" && (isMac ? e.metaKey : e.ctrlKey)) {
            this._onSubmitFired();
          }
        });
      }
    };

    // Try to hook immediately (page may already be rendered)
    const tryHook = () => {
      const btn = document.querySelector('[data-e2e-locator="console-submit-button"]');
      if (btn) hookBtn(btn);
      hookKeyboard();
    };
    tryHook();

    // Watch for button to appear (LeetCode renders it asynchronously)
    this._submitHookObserver = new MutationObserver(() => tryHook());
    this._submitHookObserver.observe(document.body, { childList: true, subtree: true });
  }

  /** Called immediately after the user triggers a submission. */
  _onSubmitFired() {
    // Cancel any previous result poll
    if (this._resultPollTimer) {
      clearInterval(this._resultPollTimer);
      this._resultPollTimer = null;
    }

    let attempts = 0;
    const MAX_ATTEMPTS = 30; // 30 s timeout

    this._resultPollTimer = setInterval(() => {
      attempts++;
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(this._resultPollTimer);
        this._resultPollTimer = null;
        return;
      }

      // Wait for the result element to appear (any result — WA, TLE, Accepted…)
      const resultEl = document.querySelector('[data-e2e-locator="submission-result"]');
      if (!resultEl) return;

      // Result is visible — stop polling
      clearInterval(this._resultPollTimer);
      this._resultPollTimer = null;

      // Only process accepted submissions
      if (!/accepted/i.test(resultEl.textContent || "")) {
        dbg.log("Submission result not Accepted — skipping", resultEl.textContent?.trim());
        return;
      }

      dbg.log("Accepted result detected via submit hook");
      const page = detectPage(window.location.pathname);
      this._processSubmission(page, false).catch((e) => dbg.error("processSubmission failed", e));
    }, 1000);
  }

  _getCodeFromMonaco() {
    try {
      const code = window.monaco?.editor?.getModels()?.[0]?.getValue();
      return (typeof code === "string" && code.trim()) ? code : null;
    } catch (_) {
      return null;
    }
  }

  /* ── Automatic submission detection ──────────────────────────────── */
  async _checkSubmission() {
    if (this._processingLock) return;

    const page = detectPage(window.location.pathname);
    if (page.type !== PAGE_TYPES.PROBLEM && page.type !== PAGE_TYPES.SUBMISSION) return;

    // For submission detail pages we can always fetch — no banner check needed.
    if (page.type === PAGE_TYPES.PROBLEM) {
      if (!this._isAcceptedVisible()) return;
    }

    await this._processSubmission(page, false);
  }

  /**
   * Returns true when an "Accepted" result banner is visible on the current page.
   * Uses a two-pass strategy:
   *   1. CSS selector fast-path (data attributes + structural classes)
   *   2. Text-content TreeWalker scan — works regardless of hashed class names
   */
  _isAcceptedVisible() {
    // Fast path — check known/stable selectors first
    const bySelector = this.safeQuery(SELECTORS.submission.successIndicator);
    if (bySelector && /accepted/i.test(bySelector.textContent || "")) return true;

    // Slow path — walk all visible leaf-ish text nodes looking for exactly "Accepted"
    // Scoped to likely result containers to keep it fast on a large DOM.
    const roots = [
      document.querySelector('[data-e2e-locator="submission-result"]'),
      document.querySelector('[class*="result"]'),
      document.querySelector('[class*="verdict"]'),
      document.querySelector('[class*="console"]'),
      document.body,
    ].filter(Boolean);

    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      let node;
      while ((node = walker.nextNode())) {
        if (/^\s*accepted\s*$/i.test(node.textContent)) {
          const el = node.parentElement;
          if (!el) continue;
          // Use getComputedStyle — works for fixed/sticky positioned elements too
          const style = window.getComputedStyle(el);
          if (style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0") {
            return true;
          }
        }
      }
      if (root !== document.body) break; // only fall through to body as last resort
    }

    return isAcceptedVisibleExtended();
  }
  async _processSubmission(page, isManual) {
    this._processingLock = true;
    try {
      const settings = await Storage.getSettings();
      if (!settings.leetcode_enable && !isManual) return;

      let submission = null;
      let slug = page.slug;

      if (page.type === PAGE_TYPES.SUBMISSION && page.submissionId) {
        const res = await this._gql(QUERIES.SUBMISSION_DETAIL, { submissionId: +page.submissionId });
        submission = res.data?.submissionDetails;
        slug = submission?.question?.titleSlug || slug;
        // Auto-detection: skip non-accepted submissions (statusCode 10 = Accepted)
        if (!isManual && submission?.statusCode !== 10) return;
      } else {
        // Problem page: find the latest accepted submission
        const listRes = await this._gql(QUERIES.SUBMISSION_LIST, {
          offset: 0, limit: 10, questionSlug: slug,
        });
        const subs = listRes.data?.questionSubmissionList?.submissions || [];
        const latest = subs.find(s => /accepted/i.test(s.statusDisplay)) || subs[0];
        if (!latest) return;

        // Dedup: skip if we already committed this submission this browser session
        const dedupKey = `cl_committed_${slug}`;
        const lastId = sessionStorage.getItem(dedupKey);
        if (!isManual && lastId === String(latest.id)) {
          dbg.log("Skipping already-committed submission", slug, latest.id);
          return;
        }

        const detailRes = await this._gql(QUERIES.SUBMISSION_DETAIL, { submissionId: +latest.id });
        submission = detailRes.data?.submissionDetails;
        if (!submission) return;

        // Monaco has the live editor content — use it when GraphQL returns empty code
        if (!submission.code) {
          const monacoCode = this._getCodeFromMonaco();
          if (monacoCode) submission = { ...submission, code: monacoCode };
        }

        sessionStorage.setItem(dedupKey, String(latest.id));
      }

      // Module-level dedup (same JS runtime, catches fast double-fires)
      const detectionId = `${slug}:${submission.timestamp || submission.id || Date.now()}`;
      if (!isManual && detectionId === this.lastDetectedId) return;
      this.lastDetectedId = detectionId;

      // Fetch rich metadata
      const meta = await this._fetchMetadata(slug);

      // Canonical mapping
      try { await canonicalMapper.loadMap(); } catch (_) { }
      const canonical = canonicalMapper.resolve("leetcode", slug);
      this._canonical = canonical; // stored for _buildFileSet

      const lang = resolveLang(submission.lang);
      const elapsedSeconds = this._timer.getElapsedSeconds();

      // Build file list for the single atomic commit
      const files = this._buildFileSet(submission, meta, settings, slug, elapsedSeconds);
      const readmeFile = files.find(f => f.path.endsWith("README.md"));

      // Normalize timestamp to ms — LeetCode API returns Unix seconds
      const tsMs = submission.timestamp
        ? Number(submission.timestamp) * 1000
        : Date.now();

      eventBus.emit("problem:solved", {
        platform: "leetcode",
        id: `${slug}::${lang.slug}`,
        forceCommit: isManual,
        submissionId: submission.id || null,
        title: meta?.title || submission.question?.title || slug,
        titleSlug: slug,
        difficulty: normalizeDifficulty(meta?.difficulty || submission.question?.difficulty || ""),
        topic: resolvePrimaryTopic(meta?.topicTags?.map(t => t.name) || []),
        tags: meta?.topicTags?.map(t => t.name) || [],
        canonical: canonical ? { id: canonical.canonicalId, title: canonical.canonicalTitle } : null,
        readmeContent: readmeFile?.content || null,
        code: submission.code || "",
        files,
        lang: { name: lang.verbose, ext: lang.ext, slug: lang.slug },
        runtime: submission.runtimeDisplay || submission.runtime || null,
        memory: submission.memoryDisplay || submission.memory || null,
        runtimePct: submission.runtimePercentile || null,
        memoryPct: submission.memoryPercentile || null,
        timestamp: tsMs,
        acRate: meta?.acRate || null,
        likes: meta?.likes || null,
        dislikes: meta?.dislikes || null,
        similar: (meta?.similarQuestionList || []).filter(q => !q.isPaidOnly),
        problemStatement: meta?.content || null,
        elapsedSeconds,
        hasSimilar: meta?.hasSimilar ?? null, // explicit "no similar" field: true|false|null
        submissionsUrl: `https://leetcode.com/problems/${slug}/submissions/`, // direct link to submissions page
      });

      dbg.log("Solve emitted", { slug, canonical: canonical?.canonicalId });
    } catch (err) {
      dbg.error("Failed to process submission", err);
    } finally {
      this._processingLock = false;
    }
  }

  /* ── File set builder ────────────────────────────────────────────── */
  _buildFileSet(submission, meta, settings, slug, elapsedSeconds = null) {
    const lang      = resolveLang(submission.lang);
    const canonical = this._canonical || null;
    const title     = meta?.title || slug;

    const files = [];

    // 1. Solution file
    files.push({
      path: solutionPath(slug, "leetcode", lang, canonical, settings),
      content: submission.code || "// (no code retrieved)",
    });

    // 2. README (problem description + stats)
    if (settings.leetcode_readme !== false && meta?.content) {
      const stats   = this._formatStats(submission, meta, elapsedSeconds);
      const similar = this._formatSimilar(meta, settings);

      files.push({
        path: readmePath(slug, canonical, settings),
        content: [
          `# ${meta.questionFrontendId ? `[${meta.questionFrontendId}] ` : ""}${title}`,
          "",
          `**Difficulty:** ${meta.difficulty || "?"}  |  **Acceptance:** ${meta.acRate ? meta.acRate.toFixed(1) + "%" : "?"}  |  **Likes:** ${meta.likes ?? "?"} / **Dislikes:** ${meta.dislikes ?? "?"}`,
          "",
          `**Tags:** ${(meta.topicTags || []).map(t => `\`${t.name}\``).join(", ") || "—"}`,
          "",
          "## Problem",
          "",
          meta.content
            .replace(/<[^>]+>/g, "")
            .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
            .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
            .replace(/\n{3,}/g, "\n\n")
            .trim(),
          "",
          stats,
          similar,
        ].filter(Boolean).join("\n"),
      });
    }

    // 3. Hints (separate file if enabled)
    if (settings.leetcode_sync_hints && meta?.hints?.length) {
      files.push({
        path: hintsPath(slug, canonical, settings),
        content: [
          `# Hints — ${title}`,
          "",
          ...meta.hints.map((h, i) => `### Hint ${i + 1}\n\n${h}\n`),
        ].join("\n"),
      });
    }

    return files;
  }

  _formatStats(submission, meta, elapsedSeconds = null) {
    const parts = [];
    if (submission.runtimeDisplay) parts.push(`Runtime: ${submission.runtimeDisplay}${submission.runtimePercentile ? ` (beats ${submission.runtimePercentile.toFixed(1)}%)` : ""}`);
    if (submission.memoryDisplay) parts.push(`Memory: ${submission.memoryDisplay}${submission.memoryPercentile ? ` (beats ${submission.memoryPercentile.toFixed(1)}%)` : ""}`);
    if (elapsedSeconds && elapsedSeconds > 0) {
      const h = Math.floor(elapsedSeconds / 3600);
      const m = Math.floor((elapsedSeconds % 3600) / 60);
      const s = elapsedSeconds % 60;
      const timeStr = h > 0
        ? `${h}h ${m}m ${s}s`
        : m > 0 ? `${m}m ${s}s` : `${s}s`;
      parts.push(`Solve time: ${timeStr}`);
    }
    if (!parts.length) return "";
    return `## My Submission\n\n${parts.map(p => `- ${p}`).join("\n")}\n`;
  }

  _formatSimilar(meta, settings) {
    if (settings.leetcode_similar === false) return "";
    const similar = (meta?.similarQuestionList || []).filter(q => !q.isPaidOnly).slice(0, 5);
    if (!similar.length) return "";
    return [
      "## Similar Problems",
      "",
      ...similar.map(q => `- [${q.title}](https://leetcode.com/problems/${q.titleSlug}/) — ${q.difficulty}`),
      "",
    ].join("\n");
  }

  /** Build a README.md string for a bulk-imported problem. */
  _buildBulkReadme(sub, { title, difficulty, tags, acRate, similar, descHtml }) {
    const tagStr  = tags.length ? tags.map(t => `\`${t}\``).join(", ") : "—";
    const simList = (similar || []).filter(q => !q.isPaidOnly).slice(0, 5);
    const parts   = [
      `# ${title}`,
      "",
      `**Difficulty:** ${difficulty || "?"}  |  **Acceptance:** ${acRate != null ? acRate.toFixed(1) + "%" : "?"}`,
      "",
      `**Tags:** ${tagStr}`,
      "",
    ];
    if (descHtml) {
      parts.push(
        "## Problem",
        "",
        descHtml
          .replace(/<[^>]+>/g, "")
          .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
          .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
          .replace(/\n{3,}/g, "\n\n")
          .trim(),
        "",
      );
    }
    if (sub.runtime || sub.memory) {
      const perf = [];
      if (sub.runtime) perf.push(`Runtime: ${sub.runtime}`);
      if (sub.memory)  perf.push(`Memory: ${sub.memory}`);
      parts.push("## My Submission", "", ...perf.map(p => `- ${p}`), "");
    }
    if (simList.length) {
      parts.push(
        "## Similar Problems",
        "",
        ...simList.map(q => `- [${q.title}](https://leetcode.com/problems/${q.titleSlug}/) — ${q.difficulty}`),
        "",
      );
    }
    return parts.join("\n");
  }

  /* ── GraphQL + metadata ──────────────────────────────────────────── */
  /**
   * GraphQL-first metadata fetching with explicit "no similar" field.
   * Returns: { title, difficulty, content, topicTags, hints, acRate, likes, dislikes,
   *           similarQuestionList, hasSimilar: true|false|null }
   * - hasSimilar: true (has similar problems), false (queried, none found), null (not yet queried)
   */
  async _fetchMetadata(slug) {
    try {
      const res = await this._gql(QUERIES.QUESTION, { titleSlug: slug });
      const question = res.data?.question || null;
      if (!question) return null;

      // Explicitly mark similar field: null = not queried, false = queried & none found, true = has similar
      const similar = question.similarQuestionList || [];
      const hasSimilar = similar.length > 0 ? true : false; // explicit: either has some or none

      return {
        ...question,
        hasSimilar, // new field: explicitly marks if similar questions were queried
        similarQuestionList: similar.filter(q => !q.isPaidOnly),
      };
    } catch (_) {
      return null;
    }
  }

  async _gql(query, variables) {
    const csrf = this._getCsrf();
    const res = await fetch("https://leetcode.com/graphql/", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        ...(csrf ? { "x-csrftoken": csrf } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors[0]?.message || "GraphQL error");
    return json;
  }

}
