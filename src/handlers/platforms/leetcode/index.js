/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasePlatformHandler } from "../../_base/BasePlatformHandler.js";
import { SELECTORS } from "./dom-selectors.js";
import { detectPage, PAGE_TYPES } from "./page-detector.js";
import { QUERIES } from "./graphql-queries.js";
import { injectQoL } from "./qol.js";
import { Storage } from "../../../core/storage.js";
import { createDebugger } from "../../../lib/debug.js";
import { registerPlatformPrompt } from "../../../core/ai-prompts.js";
import { createFloatingAI } from "../../../ui/floating-ai.js";
import { runtime, tabs } from "../../../lib/browser-compat.js";
import { CONSTANTS } from "../../../core/constants.js";
import { resolveLang, langExt, LANG_VERBOSE } from "./lang-utils.js";
import { injectProgressImportBtn, removeProgressImportButton } from "./profile-import.js";
import {
  checkSubmission,
  processSubmission,
  onSubmitFired,
  isAcceptedVisible,
} from "./submission-detector.js";
import {
  syncButtonsForCurrentPage,
  injectDetailSyncBtn,
  injectSubmissionListSyncBtn,
  injectProfileActionButtons,
  removeProfileActionButtons,
  manualSync,
} from "./ui-injection.js";

const dbg = createDebugger("LeetCode");

import { normalizeDifficulty } from "../../../core/difficulty-map.js";
import {
  gql as _gqlCall,
  fetchMetadata as _fetchMetadataFn,
  buildFileSet as _buildFileSetFn,
  buildBulkReadme as _buildBulkReadmeFn,
} from "./file-builder.js";

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

        // ── UI / Quality of Life ───────────────────────────────────
        {
          key: "leetcode_ai_panel",
          label: "Floating AI assistant",
          type: "toggle",
          default: true,
          description: "Show a floating AI chat panel for instant code feedback on problem pages.",
        },
        {
          key: "leetcode_copy_btn",
          label: "Copy code button",
          type: "toggle",
          default: true,
          description: "Inject a copy-to-clipboard button into the editor toolbar.",
        },
        {
          key: "leetcode_paste_btn",
          label: "Paste without auto-indent button",
          type: "toggle",
          default: true,
          description: "Inject a paste button that bypasses Monaco's auto-indentation.",
        },

        // ── Import (Advanced) ──────────────────────────────────────
        {
          key: "leetcode_username",
          label: "LeetCode username",
          type: "text",
          default: "",
          description: "Your public LeetCode username for importing your profile history.",
          advanced: true,
          placeholder: "e.g. VKrishna04",
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

    // Watch for mutations and re-evaluate button state; also recover QoL buttons
    const observer = new MutationObserver(() => {
      this._syncButtonsForCurrentPage();
      this._maybeReinjectQoL();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /** Re-inject QoL copy/paste buttons if React removed them from the toolbar. */
  _maybeReinjectQoL() {
    if (detectPage(window.location.pathname).type !== PAGE_TYPES.PROBLEM) return;
    const copyMissing = !document.getElementById("cl-code-copy")?.isConnected;
    const pasteMissing = !document.getElementById("cl-code-paste")?.isConnected;
    const aiMissing = !document.getElementById("cl-ai-toolbar-btn")?.isConnected;
    if (!copyMissing && !pasteMissing && !aiMissing) return;
    this._scheduleDebounce(() => {
      Storage.getSettings()
        .then((s) => {
          import("./qol.js")
            .then(({ resetQoL, injectQoL }) => {
              resetQoL();
              injectQoL({
                showCopy: s.leetcode_copy_btn !== false,
                showPaste: s.leetcode_paste_btn !== false,
                showAI: s.leetcode_ai_panel !== false && s.floatingAIEnabled !== false,
                onAIClick: () => this._aiPanel?.expand(),
              });
            })
            .catch(() => {});
        })
        .catch(() => {});
    }, 600);
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
        id: this.makeProblemId(slug),
        title: meta?.title || existing?.title || slug,
        titleSlug: slug,
        difficulty: normalizeDifficulty(meta?.difficulty || existing?.difficulty || ""),
        tags: (meta?.topicTags || []).map((t) => t.name),
        problemStatement: meta?.content || existing?.problemStatement || null,
        timestamp: existing?.timestamp || Date.now(),
      };
      await Storage.saveProblem(merged).catch(() => {});
      await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            {
              type: "REFRESH_METADATA_DONE",
              platform: "leetcode",
              slug,
            },
            () => resolve(),
          );
        } catch (_) {
          resolve();
        }
      });
      try {
        window.close();
      } catch (_) {}
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
      Storage.getSettings()
        .then((s) => {
          const opts = {
            showCopy: s.leetcode_copy_btn !== false,
            showPaste: s.leetcode_paste_btn !== false,
            showAI: s.leetcode_ai_panel !== false && s.floatingAIEnabled !== false,
            onAIClick: () => this._aiPanel?.expand(),
          };
          setTimeout(() => injectQoL(opts), 1500);
        })
        .catch(() => {
          setTimeout(() => injectQoL(), 1500);
        });
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
      this._injectProgressImportBtn().catch(() => {});
    } else {
      this._removeProgressImportButton();
    }

    if (page.type === PAGE_TYPES.PROFILE) {
      this._injectProfileActionButtons().catch(() => {});
    } else {
      this._removeProfileActionButtons();
    }
  }

  _getNativeTimerElement() {
    return document.querySelector(".select-none.text-sm.text-sd-blue-400");
  }

  _startAIPanel(slug) {
    Storage.getSettings()
      .then((settings) => {
        if (settings.leetcode_ai_panel === false) return;
        if (settings.floatingAIEnabled === false) return;
        if (this._aiPanel && this._aiPanelSlug === slug) return;
        this._stopAIPanel();
        this._aiPanelSlug = slug;
        this._aiPanel = createFloatingAI(slug, {
          position: { bottom: "20px", right: "20px" },
          platform: {
            id: "leetcode",
            label: "LeetCode AI Assistant",
            chatPlatform: "leetcode",
            readPageMeta: () => this._readFloatingAIPageMeta(),
            readEditorCode: () => this._readFloatingAIEditorCode(),
            readEditorLang: () => this._getEditorLanguage(),
            readProblemStatement: () => this._readProblemStatement(),
            readTestFailures: () => this._readFloatingAITestFailures(),
          },
        });
      })
      .catch(() => {});
  }

  _getEditorLanguage() {
    try {
      const langId = window.monaco?.editor?.getModels?.()?.[0]?.getLanguageId?.();
      if (langId) return LANG_VERBOSE[langId.toLowerCase()] || langId;
    } catch (_) {}
    try {
      const btn = document.querySelector(
        '[id*="headlessui-listbox-button"] button, button[aria-haspopup="listbox"]',
      );
      if (btn) return btn.textContent?.trim() || "";
    } catch (_) {}
    return "";
  }

  _readProblemStatement() {
    try {
      const descEl = document.querySelector('[data-track-load="description_content"]');
      if (descEl) {
        return (descEl.textContent || "").trim().slice(0, 3000);
      }
    } catch (_) {}
    return "";
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
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
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
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /** Called when LeetCode SPA navigates to a new page. */
  _onNavigate(pathname) {
    const page = detectPage(pathname);
    dbg.log("SPA navigate →", page.type, pathname);

    this._handleOnDemandFetch(page).catch(() => {});

    // Re-inject QoL on problem pages
    if (page.type === PAGE_TYPES.PROBLEM) {
      this._setupSubmitHook(); // re-hook after React re-renders the submit button
      Storage.getSettings()
        .then((s) => {
          import("./qol.js").then(({ resetQoL }) => resetQoL()).catch(() => {});
          const opts = {
            showCopy: s.leetcode_copy_btn !== false,
            showPaste: s.leetcode_paste_btn !== false,
            showAI: s.leetcode_ai_panel !== false && s.floatingAIEnabled !== false,
            onAIClick: () => this._aiPanel?.expand(),
          };
          setTimeout(() => injectQoL(opts), 1500);
        })
        .catch(() => {
          import("./qol.js").then(({ resetQoL }) => resetQoL()).catch(() => {});
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
      this._scheduleDebounce(() => this._checkSubmission(), 1200);
    }

    // Profile page import button
    // Only progress page import remains; profile import removed per user request
    if (page.type === PAGE_TYPES.PROGRESS) {
      this._injectProgressImportBtn().catch(() => {});
    } else {
      this._removeProgressImportButton();
    }

    if (page.type === PAGE_TYPES.PROFILE) {
      this._injectProfileActionButtons().catch(() => {});
    } else {
      this._removeProfileActionButtons();
    }
  }

  /** Manage sync button visibility based on current page type. */
  _syncButtonsForCurrentPage() {
    return syncButtonsForCurrentPage(this);
  }

  _injectDetailSyncBtn(page) {
    return injectDetailSyncBtn(this, page);
  }
  _injectSubmissionListSyncBtn(page) {
    return injectSubmissionListSyncBtn(this, page);
  }
  async _manualSync(page, btn) {
    return manualSync(this, page, btn);
  }

  /* ── Progress page import (delegates to profile-import.js) ──────── */
  async _injectProgressImportBtn() {
    return injectProgressImportBtn(this);
  }
  _removeProgressImportButton() {
    return removeProgressImportButton();
  }

  async _injectProfileActionButtons() {
    return injectProfileActionButtons(this);
  }
  _removeProfileActionButtons() {
    return removeProfileActionButtons();
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
      const textarea = document.querySelector(".monaco-editor .inputarea.monaco-mouse-cursor-text");
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
    this._submitHookObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /** Called immediately after the user triggers a submission. */
  _onSubmitFired() {
    return onSubmitFired(this);
  }

  _getCodeFromMonaco() {
    try {
      const active = window.monaco?.editor?.getActiveCodeEditor?.()?.getModel?.()?.getValue?.();
      if (typeof active === "string" && active.trim()) return active;
      const editors = window.monaco?.editor?.getEditors?.();
      if (editors?.length) {
        for (const ed of editors) {
          const val = ed.getModel?.()?.getValue?.();
          if (typeof val === "string" && val.trim()) return val;
        }
      }
      const code = window.monaco?.editor?.getModels()?.[0]?.getValue();
      return typeof code === "string" && code.trim() ? code : null;
    } catch (_) {
      return null;
    }
  }

  _readFloatingAIPageMeta() {
    const titleEl =
      document.querySelector('[data-e2e-locator="question-title"]') ||
      document.querySelector('[data-cy="question-title"]') ||
      document.querySelector("h1");
    const diffEl =
      document.querySelector('[data-e2e-locator="question-difficulty"]') ||
      document.querySelector("div[diff]");
    return {
      title: titleEl?.textContent?.trim() || "",
      difficulty: diffEl?.textContent?.trim() || "",
    };
  }

  _readFloatingAIEditorCode() {
    const monacoCode = this._getCodeFromMonaco();
    if (monacoCode) return monacoCode;
    try {
      const lines = document.querySelectorAll(".monaco-editor .view-lines .view-line");
      if (lines.length > 0)
        return Array.from(lines)
          .map((l) => l.textContent)
          .join("\n");
    } catch (_) {}
    return "";
  }

  _readFloatingAITestFailures() {
    try {
      const resultLines = [];
      const errorBanner = document.querySelector('[data-e2e-locator="console-result"]');
      if (errorBanner) resultLines.push((errorBanner.textContent || "").trim());
      document
        .querySelectorAll(".testcase-result-block, [data-e2e-locator='submission-result']")
        .forEach((el) => {
          const text = (el.textContent || "").trim();
          if (text) resultLines.push(text);
        });
      document.querySelectorAll(".result-panel pre, .console-output pre").forEach((el) => {
        const text = (el.textContent || "").trim();
        if (text) resultLines.push(text);
      });
      return resultLines.filter(Boolean).join("\n\n");
    } catch (_) {
      return "";
    }
  }

  /* ── Automatic submission detection (delegates to submission-detector.js) ── */
  async _checkSubmission() {
    return checkSubmission(this);
  }

  /**
   * Returns true when an "Accepted" result banner is visible on the current page.
   * Uses a two-pass strategy:
   *   1. CSS selector fast-path (data attributes + structural classes)
   *   2. Text-content TreeWalker scan — works regardless of hashed class names
   */
  _isAcceptedVisible() {
    return isAcceptedVisible(this);
  }
  async _processSubmission(page, isManual) {
    return processSubmission(this, page, isManual);
  }

  /* ── File set builder (delegates to file-builder.js) ────────────── */
  _buildFileSet(submission, meta, settings, slug, elapsedSeconds = null) {
    const lang = resolveLang(submission.lang);
    const canonical = this._canonical || null;
    return _buildFileSetFn(submission, meta, settings, slug, lang, canonical, elapsedSeconds);
  }

  _buildBulkReadme(sub, opts) {
    return _buildBulkReadmeFn(sub, opts);
  }

  /* ── GraphQL + metadata (delegates to file-builder.js) ──────────── */
  async _fetchMetadata(slug) {
    return _fetchMetadataFn(slug, QUERIES, this._getCsrf());
  }

  async _gql(query, variables) {
    return _gqlCall(query, variables, this._getCsrf());
  }

  async handleCodeFetch(problemId) {
    // Take only the first path segment after /problems/ — LeetCode redirects to
    // /problems/{slug}/description/ so replace(/\//g,"") would give "slugdescription".
    const slug = window.location.pathname.split("/problems/")[1]?.split("/")[0] || "";
    dbg.log(`handleCodeFetch(${problemId}): slug=${slug}`);

    if (!problemId) {
      // URL redirect stripped codeledger_problemid and hash fallback also missing.
      // Can't match the listener without the ID — report error so the queue
      // doesn't silently wait 30 s for a response that will never match.
      dbg.error("handleCodeFetch: problemId is empty — URL params lost in redirect");
      runtime.sendMessage({
        type: "CODELEDGER_CODE_FETCH_ID_MISSING",
        slug,
        error: "URL redirect stripped problemId — cannot identify which queue item to resolve",
      });
      return;
    }

    try {
      // If the problemId has an embedded submissionId (bulk-import format:
      // "lc-<titleSlug>::<submissionId>"), use it directly — avoids SUBMISSION_LIST
      // which can return HTTP 400 if LeetCode's schema has changed.
      const embeddedSubId = problemId.match(/::(\d+)$/)?.[1];

      let detail;
      if (embeddedSubId) {
        dbg.log(`handleCodeFetch(${problemId}): using embedded submissionId=${embeddedSubId}`);
        const detailRes = await this._gql(QUERIES.SUBMISSION_DETAIL, {
          submissionId: +embeddedSubId,
        });
        detail = detailRes?.data?.submissionDetails;
        if (!detail?.code) throw new Error("Submission details returned no code");
      } else {
        // Fallback: find the latest accepted submission via submission list
        const listRes = await this._gql(QUERIES.SUBMISSION_LIST, {
          questionSlug: slug,
          offset: 0,
          limit: 10,
          lastKey: null,
        });
        const submissions = listRes?.data?.questionSubmissionList?.submissions || [];
        const accepted = submissions.find((s) => /accepted/i.test(s.statusDisplay));
        if (!accepted) throw new Error("No accepted submissions found");
        const detailRes = await this._gql(QUERIES.SUBMISSION_DETAIL, {
          submissionId: +accepted.id,
        });
        detail = detailRes?.data?.submissionDetails;
        if (!detail?.code) throw new Error("Submission details returned no code");
      }

      // Tags come directly from submissionDetails — no extra QUESTION call needed.
      // Fall back to QUESTION query only when submission returned none.
      let tags = detail.topicTags?.map((t) => t.name) || [];
      if (!tags.length) {
        try {
          const metaRes = await this._gql(QUERIES.QUESTION, {
            titleSlug: slug,
          });
          tags = metaRes?.data?.question?.topicTags?.map((t) => t.name) || [];
        } catch (_) {}
      }

      const lang = resolveLang(detail.lang);

      runtime.sendMessage({
        type: "CODELEDGER_CODE_FETCHED",
        problemId,
        code: detail.code,
        lang: { name: lang.verbose, slug: lang.slug, ext: lang.ext },
        runtime: detail.runtimeDisplay || null,
        memory: detail.memoryDisplay || null,
        runtimePct: Math.round(detail.runtimePercentile || 0),
        memoryPct: Math.round(detail.memoryPercentile || 0),
        tags,
        notes: detail.notes || null,
        timestamp: detail.timestamp ? detail.timestamp * 1000 : null,
      });
    } catch (e) {
      dbg.error(`handleCodeFetch(${problemId}): ✗`, e?.message);
      runtime.sendMessage({
        type: "CODELEDGER_CODE_FETCHED",
        problemId,
        error: e.message,
      });
    }
  }
}
