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
import { injectProfileImportBtn } from "./profile-import.js";
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
          description:
            "Save full problem statement and your stats to README.md.",
        },
        {
          key: "gfg_timer",
          label: "Show solve timer",
          type: "toggle",
          default: true,
          description:
            "Display a floating stopwatch overlay while solving problems on GFG.",
        },
        {
          key: "gfg_copy_btn",
          label: "Copy code button",
          type: "toggle",
          default: true,
          description:
            "Inject a copy-to-clipboard button into the GFG editor area.",
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
          description:
            "Your GeeksForGeeks username for importing your profile history.",
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
      injectProfileImportBtn((slug) => this.makeProblemId(slug)).catch(
        () => {},
      );
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
    const diffEl = document.querySelector(
      '[class*="difficulty"], .difficulty-tag',
    );
    return {
      title: (titleEl?.textContent || "").trim(),
      difficulty: (diffEl?.textContent || "").trim(),
    };
  }

  _readProblemStatement() {
    const el = document.querySelector(
      '[class^="problems_problem_content"], .problem-statement',
    );
    return el ? (el.textContent || "").trim().slice(0, 3000) : "";
  }

  async _handleOnDemandFetch(page) {
    const params = new URLSearchParams(window.location.search);
    if (!params.get("codeledger_fetch")) return false;
    if (page.type !== PAGE_TYPES.PROBLEM) return false;

    const slug = page.slug || params.get("cl_fetch_id");
    if (!slug) return false;

    try {
      // Wait for editor to load
      await new Promise((r) => setTimeout(r, 1500));
      const code = await extractEditorCode();

      const meta = this._extractMetadata(slug);
      const lang = this._extractLanguage();
      const langSlug = lang.name.toLowerCase().replace(/[^a-z0-9]/g, "");

      const existing = await Storage.getProblem(this.makeProblemId(slug)).catch(
        () => null,
      );
      const problem = {
        ...(existing || {}),
        platform: "geeksforgeeks",
        id: this.makeProblemId(slug),
        title: meta.title || existing?.title || slug,
        titleSlug: slug,
        difficulty: meta.difficulty || existing?.difficulty || null,
        tags: meta.tags?.length ? meta.tags : existing?.tags || [],
        code: code || existing?.code || "",
        lang: code
          ? { name: lang.name, ext: lang.ext, slug: langSlug }
          : existing?.lang,
        problemStatement:
          meta.description || existing?.problemStatement || null,
        timestamp: existing?.timestamp || Date.now(),
      };

      await Storage.saveProblem(problem).catch(() => {});

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

      try {
        window.close();
      } catch (_) {}
      return true;
    } catch (e) {
      dbg.error("on-demand fetch failed", e);
      return false;
    }
  }

  _setupMutationObserver() {
    // Primary: hook submit button (fires only after user submits)
    this._cleanupSubmitHook = setupSubmitHook(() =>
      this._processSubmission(detectPage(window.location.pathname)),
    );

    // Fallback: passive MutationObserver for edge cases (e.g., page opened mid-result)
    let debounce = null;
    this.mutationObserver = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (!this._processingLock && isAcceptedVisible()) {
          this._checkSubmission();
        }
      }, 1500);
    });
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
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
      ...document.querySelectorAll(
        '[class*="success"], [class*="accepted"], [class*="correct"]',
      ),
    ];
    return (
      candidates.find((el) => {
        const t = (el.textContent || "").toLowerCase();
        return (
          t.includes("problem solved") ||
          t.includes("correct answer") ||
          t.includes("accepted")
        );
      }) || null
    );
  }

  async _processSubmission(page) {
    this._processingLock = true;
    try {
      const settings = await Storage.getSettings();
      if (!this.isEnabled(settings)) return;

      const slug = page.slug;
      if (!slug) return;

      // Dedup: skip if already committed this problem this session
      const dedupKey = `cl_committed_gfg_${slug}`;
      const committed = sessionStorage.getItem(dedupKey);
      if (committed === "1") {
        dbg.log("Skipping already-committed GFG problem", slug);
        return;
      }

      // Module-level dedup
      if (slug === this.lastDetectedId) return;
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
      const files = this._buildFileSet(
        meta,
        code,
        lang,
        settings,
        slug,
        canonical,
      );
      const readmeFile = files.find((f) => f.path.endsWith("README.md"));

      const elapsedSeconds = this._timer.getElapsedSeconds();
      const langSlug = lang.name.toLowerCase().replace(/[^a-z0-9]/g, "");

      this.emitSolved({
        id: this.makeProblemId(slug),
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
      });

      dbg.log("Solve emitted", { slug, lang: lang.name });
    } catch (err) {
      dbg.error("Failed to process GFG submission", err);
    } finally {
      this._processingLock = false;
    }
  }

  /* ── DOM extractors ──────────────────────────────────────────────── */
  _extractMetadata(slug) {
    const titleEl = this._queryFirst([
      SELECTORS.problem.title,
      ...(LEGACY_SELECTORS["problem.title"] || []),
    ]);
    const diffEl = this.safeQuery(SELECTORS.problem.difficulty);

    const tags = this._extractTags();
    const runtime = this.safeQuery(SELECTORS.submission.runtime);
    const memory = this.safeQuery(SELECTORS.submission.memory);

    return {
      title: titleEl ? titleEl.textContent.trim() : slug,
      difficulty: diffEl
        ? normalizeDifficulty(diffEl.textContent.trim())
        : null,
      tags,
      runtime: runtime ? runtime.textContent.trim() : null,
      memory: memory ? memory.textContent.trim() : null,
      description: this._extractDescription(),
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
    return tags;
  }

  _extractDescription() {
    const descEl = this.safeQuery(SELECTORS.problem.description);
    if (!descEl) return null;
    return descEl.innerHTML;
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
      return [...cm.querySelectorAll(".CodeMirror-line")]
        .map((l) => l.textContent)
        .join("\n");
    }
    const ace = document.querySelector(".ace_content .ace_text-layer");
    if (ace) {
      return [...ace.querySelectorAll(".ace_line")]
        .map((l) => l.textContent)
        .join("\n");
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
      const SKIP =
        /problem\s+solved|correct\s+answer|accepted|compilation\s+success/i;

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
          if (
            t &&
            t.length > 4 &&
            !lines.some((l) => l.includes(t.slice(0, 40)))
          ) {
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
          if (
            t &&
            t.length > 4 &&
            !lines.some((l) => l.includes(t.slice(0, 40)))
          ) {
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
      path: solutionPath(
        problemId,
        "geeksforgeeks",
        langObj,
        canonical,
        settings,
      ),
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
      lines.push(
        "",
        `**Tags:** ${meta.tags.map((t) => `\`${t}\``).join(", ")}`,
      );
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

    lines.push(
      "",
      `**Source:** https://www.geeksforgeeks.org/problems/${slug}/`,
    );

    return lines.join("\n");
  }
}
