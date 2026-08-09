/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasePlatformHandler } from "../../_base/BasePlatformHandler.js";
import { SELECTORS, LEGACY_SELECTORS } from "./dom-selectors.js";
import { detectPage, PAGE_TYPES } from "./page-detector.js";
import { Storage } from "../../../core/storage.js";
import { createDebugger } from "../../../lib/debug.js";
import { runtime } from "../../../lib/browser-compat.js";
import { registerPlatformPrompt } from "../../../core/ai-prompts.js";
import { normalizeDifficulty } from "../../../core/difficulty-map.js";
import { resolvePrimaryTopic } from "../../../core/topic-resolver.js";
import { solutionPath, readmePath } from "../../../core/path-builder.js";
import { extractEditorCode } from "./ace-extractor.js";
import { setupSubmitHook, isAcceptedVisible } from "./submission-detector.js";
import { injectProfileImportBtn, removeProfileImportBtn } from "./profile-import.js";
import { injectGFGQoL } from "./qol.js";
import { createFloatingAI } from "../../../ui/floating-ai.js";

const dbg = createDebugger("GFG");

const LANG_EXT = {
  c: "c",
  "c++": "cpp",
  cpp: "cpp",
  "c#": "cs",
  java: "java",
  python: "py",
  python3: "py",
  javascript: "js",
  js: "js",
  typescript: "ts",
  go: "go",
  golang: "go",
  swift: "swift",
  kotlin: "kt",
  rust: "rs",
  php: "php",
  scala: "scala",
  ruby: "rb",
};

function langExt(name = "") {
  return LANG_EXT[name.toLowerCase().replace(/[^a-z0-9]/g, "")] || "txt";
}

export class GFGHandler extends BasePlatformHandler {
  constructor() {
    super("geeksforgeeks", "GeeksForGeeks", {});
    this._enableKey = "gfg_enable";
    this.mutationObserver = null;
    this.lastDetectedId = null;
    this._processingLock = false;
    this._cleanupSubmitHook = null;
    this._aiPanel = null;
    this._aiPanelSlug = null;
    registerPlatformPrompt("geeksforgeeks", this.getDefaultPrompt());
  }

  getDefaultPrompt() {
    return `Review this {difficulty} {language} solution for GeeksForGeeks problem '{title}'.

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
      title: "GeeksForGeeks",
      order: 20,
      fields: [
        {
          key: "gfg_enable",
          label: "Enable tracking",
          type: "toggle",
          default: true,
          description:
            "Auto-detect accepted submissions on GeeksForGeeks and save them to CodeLedger.",
        },
        {
          key: "gfg_readme",
          label: "Include problem description",
          type: "toggle",
          default: true,
          description: "Save full problem statement and your stats to README.md.",
        },
        {
          key: "gfg_timer",
          label: "Show solve timer",
          type: "toggle",
          default: true,
          description: "Display a floating stopwatch overlay while solving problems on GFG.",
        },
        {
          key: "gfg_copy_btn",
          label: "Copy code button",
          type: "toggle",
          default: true,
          description: "Inject a copy-to-clipboard button into the GFG editor area.",
        },
        {
          key: "gfg_ai_panel",
          label: "Floating AI assistant",
          type: "toggle",
          default: true,
          description:
            "Show a floating AI chat panel for instant code feedback on GFG problem pages.",
        },
        {
          key: "gfg_username",
          label: "GFG username",
          type: "text",
          default: "",
          description: "Your GeeksForGeeks username for importing your profile history.",
          advanced: true,
          placeholder: "e.g. vkrishna04",
        },
      ],
    };
  }

  async init() {
    dbg.log("GFG handler active");
    const page = detectPage(window.location.pathname);

    this._setupMutationObserver();

    if (page.type === PAGE_TYPES.PROBLEM) {
      Storage.getSettings()
        .then((s) => {
          if (s.gfg_timer !== false && s.floatingTimerEnabled !== false) {
            this._timer.startFloating(page.slug || "gfg");
          }
          const opts = {
            showCopy: s.gfg_copy_btn !== false,
            showAI: s.gfg_ai_panel !== false && s.floatingAIEnabled !== false,
            onAIClick: () => this._aiPanel?.expand(),
          };
          setTimeout(() => injectGFGQoL(opts), 1500);
          if (page.slug) this._startAIPanel(page.slug);
        })
        .catch(() => {});
    }

    if (page.type === PAGE_TYPES.PROFILE) {
      injectProfileImportBtn((slug) => this.makeProblemId(slug)).catch(() => {});
    }

    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("codeledger_fetch") && page.type === PAGE_TYPES.PROBLEM) {
        await this._handleOnDemandFetch(page);
      }
    } catch (e) {
      /* ignore */
    }
  }

  _startAIPanel(slug) {
    Storage.getSettings()
      .then((settings) => {
        if (settings.gfg_ai_panel === false) return;
        if (settings.floatingAIEnabled === false) return;
        if (this._aiPanel && this._aiPanelSlug === slug) return;
        this._stopAIPanel();
        this._aiPanelSlug = slug;
        this._aiPanel = createFloatingAI(slug, {
          position: { bottom: "20px", right: "20px" },
          platform: {
            id: "geeksforgeeks",
            label: "GFG AI Assistant",
            chatPlatform: "geeksforgeeks",
            readPageMeta: () => this._readPageMeta(),
            readEditorCode: () => extractEditorCode(),
            readEditorLang: () => this._extractLanguage().name,
            readProblemStatement: () => this._readProblemStatement(),
            readTestFailures: () => this._readTestFailures(),
          },
        });
      })
      .catch(() => {});
  }

  _stopAIPanel() {
    if (this._aiPanel) {
      this._aiPanel.destroy({ force: true });
      this._aiPanel = null;
      this._aiPanelSlug = null;
    }
  }

  _readPageMeta() {
    const titleEl = document.querySelector(
      '[class^="problems_header_content__title"] h3, .problem-title h3, h1',
    );
    const diffEl = document.querySelector('[class*="difficulty"], .difficulty-tag');
    return {
      title: (titleEl?.textContent || "").trim(),
      difficulty: (diffEl?.textContent || "").trim(),
    };
  }

  _readProblemStatement() {
    const selectors = [
      '[class*="problems_problem_content"]',
      '[class*="problem-statement"]',
      '[class*="ProblemStatement"]',
      '[class*="problemStatement"]',
      ".problem-statement",
      ".problem-description",
      ".mce-content-body",
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.trim().length > 20) {
          return el.textContent.trim().slice(0, 3000);
        }
      } catch (_) {}
    }
    return "";
  }

  async _handleOnDemandFetch(page) {
    const params = new URLSearchParams(window.location.search);
    if (!params.get("codeledger_fetch")) return false;
    if (page.type !== PAGE_TYPES.PROBLEM) return false;

    const slug = page.slug || params.get("cl_fetch_id");
    if (!slug) return false;

    const isCodeFetch = params.get("codeledger_code_fetch") === "1";
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const pId =
      params.get("codeledger_problemid") || hashParams.get("cl-pid") || this.makeProblemId(slug);

    try {
      // Wait for GFG Next.js to hydrate and inject __NEXT_DATA__
      await new Promise((r) => setTimeout(r, 2000));

      // Poll until __NEXT_DATA__ contains problem content or timeout after 8s
      const waitForNextData = async () => {
        for (let i = 0; i < 30; i++) {
          const script = document.getElementById("__NEXT_DATA__");
          if (script && script.textContent) {
            try {
              const json = JSON.parse(script.textContent);
              // Check if problem data is present (has pname or title field somewhere)
              const hasData =
                JSON.stringify(json).includes("pname") ||
                JSON.stringify(json).includes("problem_body") ||
                JSON.stringify(json).includes("difficulty");
              if (hasData) break;
            } catch (_) {}
          }
          await new Promise((r) => setTimeout(r, 300));
        }
      };
      await waitForNextData();

      const is404 =
        document.title.includes("Page Not Found") ||
        !!document.querySelector(".error-page") ||
        !!document.querySelector('[class*="error-page"]') ||
        (document.body && document.body.textContent.includes("Page Not Found"));
      if (is404) {
        throw new Error(
          "GeeksForGeeks returned 404 Page Not Found. The problem slug might have changed.",
        );
      }
      let code = null;
      let newMethods = [];
      let lang = null;

      if (isCodeFetch) {
        try {
          // Find and click the Submissions tab
          const tabs = Array.from(document.querySelectorAll("div, button, a"));
          const subTab = tabs.find(
            (el) =>
              el.textContent.trim().toLowerCase() === "submissions" ||
              el.textContent.trim().toLowerCase() === "submissions ↗" ||
              el.textContent.trim().toLowerCase() === "submissions (my)",
          );
          if (subTab) {
            subTab.click();
            await new Promise((r) => setTimeout(r, 2000));

            for (let i = 0; i < 20; i++) {
              if (document.querySelector("table tbody tr")) break;
              await new Promise((r) => setTimeout(r, 300));
            }

            const table = document.querySelector("table");
            if (table) {
              const headerRow = table.querySelector("thead tr") || table.querySelector("tr");
              if (headerRow) {
                const colTexts = [...headerRow.querySelectorAll("th, td")].map((el) =>
                  el.textContent.trim().toLowerCase(),
                );
                const statusIdx = colTexts.findIndex((t) => t.includes("status"));
                const langIdx = colTexts.findIndex((t) => t.includes("lang"));
                const codeIdx = colTexts.findIndex((t) => t.includes("code"));
                const timeIdx = colTexts.findIndex((t) => t.includes("time"));

                if (statusIdx !== -1 && codeIdx !== -1) {
                  const rows = table.querySelectorAll("tbody tr");
                  const targetRows =
                    rows.length > 0 ? [...rows] : [...table.querySelectorAll("tr")].slice(1);

                  const correctRows = targetRows.filter((row) => {
                    const statusCell = row.children[statusIdx];
                    if (!statusCell) return false;
                    const statusText = statusCell.textContent.trim().toLowerCase();
                    return statusText.includes("correct") || statusText.includes("accepted");
                  });

                  for (let i = 0; i < correctRows.length; i++) {
                    const row = correctRows[i];
                    const codeCell = row.children[codeIdx];
                    const langCell = row.children[langIdx];
                    const timeCell = row.children[timeIdx];
                    if (!codeCell) continue;

                    const viewEl =
                      [...codeCell.querySelectorAll("a, button, span")].find((el) =>
                        el.textContent.trim().toLowerCase().includes("view"),
                      ) || codeCell;

                    if (viewEl) {
                      viewEl.click();
                      const modal = await this._pollForSubmissionModal();
                      const extractedCode = this._extractCodeFromPopup(modal);
                      this._closeSubmissionModal(modal);

                      if (extractedCode && extractedCode.trim()) {
                        const langText = langCell ? langCell.textContent.trim() : "C++";
                        const timeText = timeCell ? timeCell.textContent.trim() : "";
                        const langObj = this._resolveLanguageFromText(langText);

                        let timestamp = Date.now();
                        if (timeText) {
                          const formatted = timeText.replace(" ", "T") + "+05:30";
                          const parsed = Date.parse(formatted);
                          if (!isNaN(parsed)) timestamp = parsed;
                        }

                        const normCode = this._normalizeCode(extractedCode);
                        if (!newMethods.some((m) => this._normalizeCode(m.code) === normCode)) {
                          newMethods.push({
                            code: extractedCode,
                            lang: langObj,
                            timestamp,
                            description: `Auto-recovered from submissions — ${timeText}`,
                            language: langObj.name,
                          });
                        }
                      }
                      await new Promise((r) => setTimeout(r, 500)); // slight delay between clicks
                    }
                  }
                }
              }
            }
          }
        } catch (err) {
          dbg.warn("Failed to scrape submissions tab", err);
        }
      }

      if (newMethods.length > 0) {
        code = newMethods[0].code;
        lang = newMethods[0].lang;
      } else {
        code = await extractEditorCode();
      }

      const meta = this._extractMetadata(slug);
      const finalLang = lang || this._extractLanguage();
      const langSlug = finalLang.name.toLowerCase().replace(/[^a-z0-9]/g, "");

      const existing = await Storage.getProblem(this.makeProblemId(slug)).catch(() => null);

      const methods = existing?.methods || [];
      for (const m of newMethods) {
        if (!methods.some((em) => this._normalizeCode(em.code) === this._normalizeCode(m.code))) {
          methods.push({
            title: `Approach ${methods.length + 1} (${m.lang.name})`,
            ...m,
          });
        }
      }

      // If we recovered methods with real timestamps, update the root timestamp to match the latest one.
      // Otherwise, keep existing timestamp (or use Date.now()).
      let rootTimestamp = Date.now();
      if (newMethods.length > 0) {
        const validTimes = newMethods.map((m) => m.timestamp).filter((t) => t > 0 && !isNaN(t));
        if (validTimes.length > 0) {
          rootTimestamp = Math.max(...validTimes);
        }
      } else if (existing?.timestamp) {
        rootTimestamp = existing.timestamp;
      }

      const problem = {
        ...(existing || {}),
        platform: "geeksforgeeks",
        id: this.makeProblemId(slug),
        title: meta.title || existing?.title || slug,
        titleSlug: slug,
        difficulty: meta.difficulty || existing?.difficulty || null,
        tags: meta.tags?.length ? meta.tags : existing?.tags || [],
        code: code || existing?.code || "",
        lang: code ? { name: finalLang.name, ext: finalLang.ext, slug: langSlug } : existing?.lang,
        problemStatement: meta.description || existing?.problemStatement || null,
        timestamp: rootTimestamp,
        methods: methods,
      };

      await Storage.saveProblem(problem).catch(() => {});

      if (isCodeFetch) {
        await new Promise((resolve) => {
          try {
            runtime.sendMessage(
              {
                type: "CODELEDGER_CODE_FETCHED",
                problemId: pId,
                code: problem.code,
                lang: problem.lang,
                tags: problem.tags,
              },
              () => resolve(),
            );
          } catch (_) {
            resolve();
          }
        });
      } else {
        await new Promise((resolve) => {
          try {
            runtime.sendMessage(
              { type: "REFRESH_METADATA_DONE", platform: "geeksforgeeks", slug },
              () => resolve(),
            );
          } catch (_) {
            resolve();
          }
        });
      }

      try {
        window.close();
      } catch (_) {}
      return true;
    } catch (e) {
      dbg.error("on-demand fetch failed", e);
      if (isCodeFetch) {
        try {
          runtime.sendMessage({
            type: "CODELEDGER_CODE_FETCHED",
            problemId: pId,
            error: e?.message || "On-demand GFG fetch failed",
          });
        } catch (_) {}
      }
      return false;
    }
  }

  _setupMutationObserver() {
    // Primary: hook submit button (fires only after user submits)
    this._cleanupSubmitHook = setupSubmitHook(() =>
      this._processSubmission(detectPage(window.location.pathname)),
    );

    let lastPath = window.location.pathname;

    // Fallback: passive MutationObserver for edge cases (e.g., page opened mid-result)
    let debounce = null;
    this.mutationObserver = new MutationObserver(() => {
      const currentPath = window.location.pathname;
      if (currentPath !== lastPath) {
        lastPath = currentPath;
        this._onNavigate(currentPath);
      }

      // Ensure profile button is injected if on profile page and missing
      const page = detectPage(currentPath);
      if (page.type === PAGE_TYPES.PROFILE) {
        if (!document.getElementById("cl-gfg-profile-import")) {
          injectProfileImportBtn((slug) => this.makeProblemId(slug)).catch(() => {});
        }
      }

      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (!this._processingLock && isAcceptedVisible()) {
          this._checkSubmission();
        }
        if (isAcceptedVisible()) {
          this._injectSyncBtn();
        }
        this._checkSubmissionsTable();
      }, 1500);
    });
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    if (isAcceptedVisible()) {
      this._injectSyncBtn();
    }
    this._checkSubmissionsTable();
  }

  _onNavigate(pathname) {
    const page = detectPage(pathname);
    dbg.log("SPA navigate →", page.type, pathname);

    if (page.type === PAGE_TYPES.PROBLEM) {
      this._cleanupSubmitHook?.();
      this._cleanupSubmitHook = setupSubmitHook(() =>
        this._processSubmission(detectPage(window.location.pathname)),
      );
      Storage.getSettings()
        .then((s) => {
          if (s.gfg_timer !== false && s.floatingTimerEnabled !== false) {
            this._timer.startFloating(page.slug || "gfg");
          }
          const opts = {
            showCopy: s.gfg_copy_btn !== false,
            showAI: s.gfg_ai_panel !== false && s.floatingAIEnabled !== false,
            onAIClick: () => this._aiPanel?.expand(),
          };
          setTimeout(() => injectGFGQoL(opts), 1500);
          if (page.slug) this._startAIPanel(page.slug);
        })
        .catch(() => {});
    } else {
      this._stopAIPanel();
      this._timer.stopFloating();
    }

    if (page.type === PAGE_TYPES.PROFILE) {
      injectProfileImportBtn((slug) => this.makeProblemId(slug)).catch(() => {});
    } else {
      removeProfileImportBtn();
    }
  }

  _injectSyncBtn() {
    if (document.getElementById("cl-gfg-sync-btn")) return;

    const successEl = this._findAcceptedIndicator();
    if (!successEl) return;

    const btn = document.createElement("button");
    btn.id = "cl-gfg-sync-btn";
    btn.title = "Sync this GFG submission to CodeLedger";

    // Style with CSS-in-JS directly so it doesn't rely on Tailwind (which GFG lacks)
    btn.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 6px 12px;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      color: #22d3ee;
      background: rgba(6, 182, 212, 0.08);
      border: 1px solid rgba(6, 182, 212, 0.35);
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      vertical-align: middle;
      margin-left: 12px;
      flex-shrink: 0;
      box-sizing: border-box;
      outline: none;
      white-space: nowrap;
    `;

    btn.onmouseenter = () => {
      btn.style.background = "rgba(6, 182, 212, 0.18)";
      btn.style.borderColor = "rgba(6, 182, 212, 0.55)";
    };
    btn.onmouseleave = () => {
      btn.style.background = "rgba(6, 182, 212, 0.08)";
      btn.style.borderColor = "rgba(6, 182, 212, 0.35)";
    };

    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="display:inline-block;vertical-align:middle;"><path d="M4 12a8 8 0 018-8V2.5a.5.5 0 01.854-.354l3 3a.5.5 0 010 .708l-3 3A.5.5 0 0112 8.5V7a5 5 0 105 5h1.5a6.5 6.5 0 11-14.5 0z"/></svg> Sync to Ledger`;

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const originalHTML = btn.innerHTML;
      try {
        btn.disabled = true;
        btn.textContent = "⏳ Syncing…";

        const page = detectPage(window.location.pathname);
        const processed = await this._processSubmission(page, true);

        btn.textContent = processed ? "✓ Synced" : "✓ Already saved";
        setTimeout(() => {
          if (btn.parentNode) {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
          }
        }, 2500);
      } catch (err) {
        dbg.error("Manual sync failed", err);
        btn.textContent = "✗ Failed";
        btn.disabled = false;
        setTimeout(() => {
          if (btn.parentNode) {
            btn.innerHTML = originalHTML;
          }
        }, 3000);
      }
    });

    successEl.appendChild(btn);
    dbg.log("Injected Sync to Ledger button next to success indicator");
  }

  /* ── Submission detection ─────────────────────────────────────────── */
  async _checkSubmission() {
    if (this._processingLock) return;

    const page = detectPage(window.location.pathname);
    if (page.type !== PAGE_TYPES.PROBLEM) return;

    // Look for "correct answer" / "problem solved" indicators
    const accepted = this._findAcceptedIndicator();
    if (!accepted) return;

    await this._processSubmission(page);
  }

  _findAcceptedIndicator() {
    // Try primary selector
    const el = this.safeQuery(SELECTORS.submission.successIndicator);
    if (el) return el;

    // Fallback: text search across known classes
    const candidates = [
      ...document.querySelectorAll('[class*="success"], [class*="accepted"], [class*="correct"]'),
    ];
    return (
      candidates.find((el) => {
        const t = (el.textContent || "").toLowerCase();
        return (
          t.includes("problem solved") || t.includes("correct answer") || t.includes("accepted")
        );
      }) || null
    );
  }

  async _processSubmission(page, isManual = false) {
    this._processingLock = true;
    try {
      const settings = await Storage.getSettings();
      if (!this.isEnabled(settings) && !isManual) return false;

      const slug = page.slug;
      if (!slug) return false;

      // Dedup: skip if already committed this problem this session
      const dedupKey = `cl_committed_gfg_${slug}`;
      const committed = sessionStorage.getItem(dedupKey);
      if (!isManual && committed === "1") {
        dbg.log("Skipping already-committed GFG problem", slug);
        return false;
      }

      // Module-level dedup
      if (!isManual && slug === this.lastDetectedId) return false;
      this.lastDetectedId = slug;

      // Extract problem data from DOM
      const meta = this._extractMetadata(slug);
      const code = await extractEditorCode();
      const lang = this._extractLanguage();
      const topic = resolvePrimaryTopic(meta.tags || []);

      if (!code || !code.trim()) {
        dbg.warn("Code extraction failed, skipping commit");
        return;
      }

      sessionStorage.setItem(dedupKey, "1");

      const canonical = await this.resolveCanonical(slug);

      // Build file set
      const files = this._buildFileSet(meta, code, lang, settings, slug, canonical);
      const readmeFile = files.find((f) => f.path.endsWith("README.md"));

      const elapsedSeconds = this._timer.getElapsedSeconds();
      const langSlug = lang.name.toLowerCase().replace(/[^a-z0-9]/g, "");

      this.emitSolved({
        id: this.makeProblemId(slug),
        forceCommit: isManual,
        title: meta.title || slug,
        titleSlug: slug,
        difficulty: meta.difficulty || null,
        topic,
        tags: meta.tags || [],
        canonical: canonical
          ? {
              id: canonical.canonicalId,
              title: canonical.canonicalTitle,
            }
          : null,
        readmeContent: readmeFile?.content || null,
        code,
        files,
        lang: { name: lang.name, ext: lang.ext, slug: langSlug },
        runtime: meta.runtime || null,
        memory: meta.memory || null,
        timestamp: Date.now(),
        elapsedSeconds,
        _requestAIReview: true,
      });

      dbg.log("Solve emitted", { slug, lang: lang.name });
      return true;
    } catch (err) {
      dbg.error("Failed to process GFG submission", err);
      return false;
    } finally {
      this._processingLock = false;
    }
  }

  _extractMetadata(slug) {
    let nextDataTitle = null;
    let nextDataDiff = null;
    let nextDataTags = [];
    let nextDataDesc = null;

    try {
      const script = document.getElementById("__NEXT_DATA__");
      if (script && script.textContent) {
        const json = JSON.parse(script.textContent);
        const findData = (obj) => {
          if (!obj || typeof obj !== "object") return null;
          if (
            (obj.pname || obj.title || obj.problem_name) &&
            (obj.difficulty || obj.problem_difficulty) &&
            (Array.isArray(obj.tags) ||
              Array.isArray(obj.topicTags) ||
              Array.isArray(obj.tags_list) ||
              (obj.tags && typeof obj.tags === "object" && Array.isArray(obj.tags.topic_tags)))
          ) {
            return obj;
          }
          for (const key of Object.keys(obj)) {
            if (obj[key] && typeof obj[key] === "object") {
              const res = findData(obj[key]);
              if (res) return res;
            }
          }
          return null;
        };

        const data = findData(json);
        if (data) {
          nextDataTitle = data.pname || data.title || data.problem_name;
          nextDataDiff = data.difficulty || data.problem_difficulty;

          const rawTags = data.tags || data.topicTags || data.tags_list || [];
          if (rawTags && typeof rawTags === "object" && Array.isArray(rawTags.topic_tags)) {
            nextDataTags = rawTags.topic_tags;
          } else if (Array.isArray(rawTags)) {
            nextDataTags = rawTags
              .map((t) => {
                if (typeof t === "string") return t;
                if (t && typeof t === "object") return t.name || t.pname || t.title || "";
                return "";
              })
              .filter(Boolean);
          }

          // GFG stores the actual problem body in problem_body or body field
          nextDataDesc =
            data.problem_body ||
            data.body ||
            data.content ||
            data.description ||
            data.problemStatement ||
            data.pdescription ||
            null;
          dbg.log("Extracted GFG problem metadata from __NEXT_DATA__", {
            nextDataTitle,
            nextDataDiff,
            nextDataTags,
            hasDesc: !!nextDataDesc,
          });
        }

        // If no description found from the main data node, do a broader search for problem_body
        if (!nextDataDesc) {
          const findDesc = (obj, depth = 0) => {
            if (!obj || typeof obj !== "object" || depth > 10) return null;
            // Prioritize problem_body field
            if (
              obj.problem_body &&
              typeof obj.problem_body === "string" &&
              obj.problem_body.length > 50
            ) {
              return obj.problem_body;
            }
            if (obj.body && typeof obj.body === "string" && obj.body.length > 100) {
              return obj.body;
            }
            for (const key of Object.keys(obj)) {
              if (obj[key] && typeof obj[key] === "object") {
                const res = findDesc(obj[key], depth + 1);
                if (res) return res;
              }
            }
            return null;
          };
          nextDataDesc = findDesc(json);
          if (nextDataDesc) {
            dbg.log("Found GFG problem body via broad search", { len: nextDataDesc.length });
          }
        }
      }
    } catch (err) {
      dbg.error("Failed to parse __NEXT_DATA__ for metadata", err);
    }

    const titleEl = this._queryFirst([
      SELECTORS.problem.title,
      ...(LEGACY_SELECTORS["problem.title"] || []),
    ]);
    const diffEl = this.safeQuery(SELECTORS.problem.difficulty);

    const rawTitle = titleEl ? titleEl.textContent.trim() : nextDataTitle || slug;
    // Clean GFG title: remove trailing spaces and numeric IDs (3+ digits) e.g. " 1235" or " 102404"
    const title = rawTitle
      .replace(/\s*\d{3,}$/g, "")
      .replace(/\s*\d{3,}$/g, "")
      .trim();

    const difficulty = diffEl
      ? normalizeDifficulty(diffEl.textContent.trim())
      : nextDataDiff
        ? normalizeDifficulty(nextDataDiff)
        : null;

    const tags = this._extractTags();
    const finalTags = tags && tags.length ? tags : nextDataTags;

    const runtime = this.safeQuery(SELECTORS.submission.runtime);
    const memory = this.safeQuery(SELECTORS.submission.memory);

    return {
      title,
      difficulty,
      tags: finalTags,
      runtime: runtime ? runtime.textContent.trim() : null,
      memory: memory ? memory.textContent.trim() : null,
      description: this._extractDescription() || nextDataDesc,
      platformId: null,
    };
  }

  _extractTags() {
    const tagEls = document.querySelectorAll(SELECTORS.problem.tags);
    const tags = [];
    for (const el of tagEls) {
      const t = el.textContent.trim();
      if (t && !tags.includes(t)) tags.push(t);
    }

    // Fallback to __NEXT_DATA__ if DOM tags are empty
    if (tags.length === 0) {
      try {
        const script = document.getElementById("__NEXT_DATA__");
        if (script && script.textContent) {
          const json = JSON.parse(script.textContent);
          const findTags = (obj) => {
            if (!obj || typeof obj !== "object") return null;
            if (obj.tags && typeof obj.tags === "object" && Array.isArray(obj.tags.topic_tags)) {
              return obj.tags.topic_tags;
            }
            if (
              Array.isArray(obj.tags) ||
              Array.isArray(obj.topicTags) ||
              Array.isArray(obj.tags_list)
            ) {
              const list = obj.tags || obj.topicTags || obj.tags_list;
              if (list.length > 0) return list;
            }
            for (const key of Object.keys(obj)) {
              if (obj[key] && typeof obj[key] === "object") {
                const res = findTags(obj[key]);
                if (res) return res;
              }
            }
            return null;
          };
          const rawTags = findTags(json);
          if (Array.isArray(rawTags)) {
            for (const t of rawTags) {
              const name = typeof t === "string" ? t : t?.name || t?.pname || t?.title || "";
              const trimmed = name.trim();
              if (trimmed && !tags.includes(trimmed)) tags.push(trimmed);
            }
          }
        }
      } catch (err) {
        dbg.error("Failed to extract tags from __NEXT_DATA__", err);
      }
    }
    return tags;
  }

  _extractDescription() {
    // Try all known modern GFG DOM selectors for problem content
    const selectors = [
      '[class*="problems_problem_content"]',
      '[class*="problem-statement"]',
      '[class*="ProblemStatement"]',
      '[class*="problemStatement"]',
      ".problem-statement",
      ".problem-description",
      '[class*="problem_description"]',
      '[class*="problems_content"] [class*="content"]',
      // TinyMCE rendered content container
      ".mce-content-body",
      '[class*="tinymce"]',
      // Newer GFG layout
      '[class*="problems_header"] ~ div [class*="content"]',
      'section[class*="problem"]',
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.innerHTML && el.innerHTML.trim().length > 50) {
          return el.innerHTML;
        }
      } catch (_) {}
    }
    return null;
  }

  _extractCode() {
    // Try primary selectors
    const codeEl = this._queryFirst([
      SELECTORS.submission.code,
      ...(LEGACY_SELECTORS["submission.code"] || []),
    ]);
    if (codeEl) return codeEl.textContent || codeEl.innerText || "";

    // Fallback: CodeMirror / Ace content
    const cm = document.querySelector(".CodeMirror-code");
    if (cm) {
      return [...cm.querySelectorAll(".CodeMirror-line")].map((l) => l.textContent).join("\n");
    }
    const ace = document.querySelector(".ace_content .ace_text-layer");
    if (ace) {
      return [...ace.querySelectorAll(".ace_line")].map((l) => l.textContent).join("\n");
    }
    return "// Code extraction failed";
  }

  _extractLanguage() {
    const langEl = this._queryFirst([
      SELECTORS.submission.language,
      ".divider.text",
      "[class*='language'] [class*='selected']",
      "select[name='language'] option:checked",
    ]);
    const raw = langEl ? langEl.textContent.trim().split("(")[0].trim() : "C++";
    const name = raw || "C++";
    const ext = langExt(name);
    return { name, ext };
  }

  _readTestFailures() {
    try {
      const lines = [];
      const SKIP = /problem\s+solved|correct\s+answer|accepted|compilation\s+success/i;

      // Result/verdict container used after submission
      const resultContainers = document.querySelectorAll(
        '[class^="problems_content"], .problems-content, #problems-content, ' +
          '[class*="result"], [class*="verdict"]',
      );
      for (const el of resultContainers) {
        const t = (el.textContent || "").trim();
        if (t && t.length > 4 && !SKIP.test(t)) {
          lines.push(t.slice(0, 800));
          break;
        }
      }

      // Compilation / runtime error blocks
      document
        .querySelectorAll(
          '[class*="error"] pre, [class*="compile"] pre, ' +
            '.error-output, [class*="ErrorOutput"]',
        )
        .forEach((el) => {
          const t = (el.textContent || "").trim();
          if (t && t.length > 4 && !lines.some((l) => l.includes(t.slice(0, 40)))) {
            lines.push(t.slice(0, 600));
          }
        });

      // Wrong answer test case diff panels
      document
        .querySelectorAll(
          '[class*="wrong"], [class*="WrongAnswer"], ' +
            '[class*="testCase"] pre, [class*="test_case"] pre',
        )
        .forEach((el) => {
          const t = (el.textContent || "").trim();
          if (t && t.length > 4 && !lines.some((l) => l.includes(t.slice(0, 40)))) {
            lines.push(t.slice(0, 400));
          }
        });

      return lines.slice(0, 5).join("\n\n");
    } catch (_) {
      return "";
    }
  }

  _queryFirst(selectors) {
    for (const sel of [].concat(selectors)) {
      if (!sel) continue;
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  /* ── File set builder ────────────────────────────────────────────── */
  _buildFileSet(meta, code, lang, settings, slug, canonical = null) {
    const langObj = {
      verbose: lang.name.replace(/[^a-zA-Z0-9]/g, "_"),
      name: lang.name,
      ext: lang.ext,
    };
    const problemId = this.makeProblemId(slug);
    const files = [];

    files.push({
      path: solutionPath(problemId, "geeksforgeeks", langObj, canonical, settings),
      content: code,
    });

    if (settings.gfg_readme !== false) {
      const readmeContent = this._buildReadme(meta, lang, slug);
      files.push({
        path: readmePath(problemId, canonical, settings, "geeksforgeeks"),
        content: readmeContent,
      });
    }

    return files;
  }

  _buildReadme(meta, lang, slug) {
    const lines = [
      `# ${meta.title || slug}`,
      "",
      `**Platform:** GeeksForGeeks  |  **Difficulty:** ${meta.difficulty || "?"}`,
    ];

    if (meta.tags?.length) {
      lines.push("", `**Tags:** ${meta.tags.map((t) => `\`${t}\``).join(", ")}`);
    }

    if (meta.description) {
      const plain = meta.description
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      lines.push("", "## Problem", "", plain);
    }

    const stats = [];
    if (meta.runtime) stats.push(`Runtime: ${meta.runtime}`);
    if (meta.memory) stats.push(`Memory: ${meta.memory}`);
    if (stats.length) {
      lines.push("", "## My Submission", "", ...stats.map((s) => `- ${s}`));
    }

    lines.push("", `**Source:** https://www.geeksforgeeks.org/problems/${slug}/`);

    return lines.join("\n");
  }

  _checkSubmissionsTable() {
    const tables = document.querySelectorAll("table");
    for (const table of tables) {
      const headerRow = table.querySelector("thead tr") || table.querySelector("tr");
      if (!headerRow) continue;
      const colTexts = [...headerRow.querySelectorAll("th, td")].map((el) =>
        el.textContent.trim().toLowerCase(),
      );

      const timeIdx = colTexts.findIndex((t) => t.includes("time"));
      const statusIdx = colTexts.findIndex((t) => t.includes("status"));
      const langIdx = colTexts.findIndex((t) => t.includes("lang"));
      const codeIdx = colTexts.findIndex((t) => t.includes("code"));

      if (statusIdx === -1 || langIdx === -1 || codeIdx === -1) {
        continue;
      }

      const rows = table.querySelectorAll("tbody tr");
      const targetRows = rows.length > 0 ? [...rows] : [...table.querySelectorAll("tr")].slice(1);

      for (const row of targetRows) {
        if (row.querySelector(".cl-gfg-row-sync-btn")) {
          continue;
        }

        const statusCell = row.children[statusIdx];
        const codeCell = row.children[codeIdx];
        if (!statusCell || !codeCell) continue;

        const statusText = statusCell.textContent.trim().toLowerCase();
        if (!statusText.includes("correct") && !statusText.includes("accepted")) {
          continue;
        }

        const viewEl =
          [...codeCell.querySelectorAll("a, button, span")].find((el) =>
            el.textContent.trim().toLowerCase().includes("view"),
          ) || codeCell;

        if (!viewEl) continue;

        const syncBtn = document.createElement("button");
        syncBtn.className = "cl-gfg-row-sync-btn";
        syncBtn.title = "Sync this submission to CodeLedger";
        syncBtn.style.cssText = `
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 2px 6px;
          font-size: 11px;
          font-weight: 600;
          font-family: inherit;
          color: #22d3ee;
          background: rgba(6, 182, 212, 0.08);
          border: 1px solid rgba(6, 182, 212, 0.35);
          border-radius: 4px;
          cursor: pointer;
          margin-left: 8px;
          transition: background 0.15s, border-color 0.15s;
          vertical-align: middle;
          box-sizing: border-box;
          outline: none;
          white-space: nowrap;
        `;

        syncBtn.onmouseenter = () => {
          syncBtn.style.background = "rgba(6, 182, 212, 0.18)";
          syncBtn.style.borderColor = "rgba(6, 182, 212, 0.55)";
        };
        syncBtn.onmouseleave = () => {
          syncBtn.style.background = "rgba(6, 182, 212, 0.08)";
          syncBtn.style.borderColor = "rgba(6, 182, 212, 0.35)";
        };

        syncBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style="display:inline-block;vertical-align:middle;"><path d="M4 12a8 8 0 018-8V2.5a.5.5 0 01.854-.354l3 3a.5.5 0 010 .708l-3 3A.5.5 0 0112 8.5V7a5 5 0 105 5h1.5a6.5 6.5 0 11-14.5 0z"/></svg> Sync`;

        syncBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const originalHTML = syncBtn.innerHTML;
          try {
            syncBtn.disabled = true;
            syncBtn.textContent = "⏳...";

            const page = detectPage(window.location.pathname);
            const slug = page.slug;
            if (!slug) throw new Error("Could not detect problem slug");

            viewEl.click();

            const modal = await this._pollForSubmissionModal();
            const code = this._extractCodeFromPopup(modal);
            if (!code || !code.trim()) {
              throw new Error("Failed to extract code from submission popup");
            }

            this._closeSubmissionModal(modal);

            const langText = row.children[langIdx]?.textContent || "C++";
            const lang = this._resolveLanguageFromText(langText);
            const timeText = row.children[timeIdx]?.textContent;

            let timestamp = Date.now();
            if (timeText) {
              const formatted = timeText.trim().replace(" ", "T") + "+05:30";
              const parsed = Date.parse(formatted);
              if (!isNaN(parsed)) {
                timestamp = parsed;
              }
            }

            const problemId = this.makeProblemId(slug);
            const existing = await Storage.getProblem(problemId).catch(() => null);
            const meta = this._extractMetadata(slug);
            const topic = resolvePrimaryTopic(meta.tags || []);
            const canonical = await this.resolveCanonical(slug);
            const settings = await Storage.getSettings();

            if (existing) {
              const normScraped = this._normalizeCode(code);
              const isPrimaryMatch = this._normalizeCode(existing.code) === normScraped;
              const isMethodMatch = (existing.methods || []).some(
                (m) => this._normalizeCode(m.code) === normScraped,
              );

              if (isPrimaryMatch || isMethodMatch) {
                syncBtn.textContent = "✓ Synced";
                return;
              }

              const newMethod = {
                title: `Approach ${existing.methods?.length + 1 || 1} (${lang.name})`,
                language: lang.name,
                code: code,
                description: `Synced from submissions table — ${timeText || ""}`,
                timestamp: timestamp,
              };

              const updatedProblem = {
                ...existing,
                methods: [...(existing.methods || []), newMethod],
              };

              const files = this._buildFileSet(
                meta,
                existing.code,
                existing.lang || lang,
                settings,
                slug,
                canonical,
              );
              const readmeFile = files.find((f) => f.path.endsWith("README.md"));

              await Storage.saveProblem(updatedProblem);

              const elapsedSeconds = 0;
              this.emitSolved({
                ...updatedProblem,
                forceCommit: true,
                readmeContent: readmeFile?.content || null,
                files,
                timestamp,
                elapsedSeconds,
                _requestAIReview: false,
              });
            } else {
              const files = this._buildFileSet(meta, code, lang, settings, slug, canonical);
              const readmeFile = files.find((f) => f.path.endsWith("README.md"));

              const problem = {
                platform: "geeksforgeeks",
                id: problemId,
                title: meta.title || slug,
                titleSlug: slug,
                difficulty: meta.difficulty || null,
                topic,
                tags: meta.tags || [],
                canonical: canonical
                  ? {
                      id: canonical.canonicalId,
                      title: canonical.canonicalTitle,
                    }
                  : null,
                readmeContent: readmeFile?.content || null,
                code,
                files,
                lang: { name: lang.name, ext: lang.ext, slug: lang.slug },
                runtime: null,
                memory: null,
                timestamp,
                elapsedSeconds: 0,
                _requestAIReview: true,
              };

              await Storage.saveProblem(problem);
              this.emitSolved(problem);
            }

            syncBtn.textContent = "✓ Synced";
          } catch (err) {
            dbg.error("Row sync failed", err);
            syncBtn.textContent = "✗ Failed";
            setTimeout(() => {
              syncBtn.innerHTML = originalHTML;
              syncBtn.disabled = false;
            }, 3000);
          }
        });

        if (viewEl.nextSibling) {
          viewEl.parentNode.insertBefore(syncBtn, viewEl.nextSibling);
        } else {
          viewEl.parentNode.appendChild(syncBtn);
        }
      }
    }
  }

  _pollForSubmissionModal() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const poll = () => {
        if (attempts++ > 30) {
          reject(new Error("Timeout waiting for submission popup"));
          return;
        }
        const modals = document.querySelectorAll(
          '[role="dialog"], [class*="modal"], [class*="dialog"], [class*="popup"], .modal, .dialog',
        );
        for (const m of modals) {
          if (m.offsetParent !== null) {
            if (m.querySelector('.CodeMirror, .ace_editor, pre, code, textarea, [class*="code"]')) {
              resolve(m);
              return;
            }
          }
        }
        setTimeout(poll, 100);
      };
      poll();
    });
  }

  _extractCodeFromPopup(modal) {
    const cm = modal.querySelector(".CodeMirror-code");
    if (cm) {
      return [...cm.querySelectorAll(".CodeMirror-line")].map((l) => l.textContent).join("\n");
    }
    const ace = modal.querySelector(".ace_content .ace_text-layer");
    if (ace) {
      return [...ace.querySelectorAll(".ace_line")].map((l) => l.textContent).join("\n");
    }
    const pre = modal.querySelector("pre, code, textarea");
    if (pre) {
      return pre.value || pre.textContent || "";
    }
    const lines = modal.querySelectorAll(
      ".code-line, [class*='code-line'], [class*='line-number']",
    );
    if (lines.length > 0) {
      return [...lines].map((l) => l.textContent).join("\n");
    }
    return null;
  }

  _closeSubmissionModal(modal) {
    const closeBtn = modal.querySelector(
      '[class*="close"], [class*="Close"], .close, button[aria-label="Close"], [class*="cancel"]',
    );
    if (closeBtn) {
      closeBtn.click();
    } else {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }),
      );
    }
  }

  _normalizeCode(code) {
    return (code || "").trim().replace(/\r\n/g, "\n").replace(/\s+/g, " ");
  }

  _resolveLanguageFromText(langText) {
    const raw = langText.trim();
    const name = raw || "C++";
    const ext = langExt(name);
    const langSlug = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    return { name, ext, slug: langSlug };
  }
}
