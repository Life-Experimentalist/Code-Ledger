/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasePlatformHandler } from "../../_base/BasePlatformHandler.js";
import { SELECTORS, LEGACY_SELECTORS } from "./dom-selectors.js";
import { detectPage, PAGE_TYPES } from "./page-detector.js";
import { eventBus } from "../../../core/event-bus.js";
import { Storage } from "../../../core/storage.js";
import { canonicalMapper } from "../../../core/canonical-mapper.js";
import { createDebugger } from "../../../lib/debug.js";
import { registerPlatformPrompt } from "../../../core/ai-prompts.js";
import { normalizeDifficulty } from "../../../core/difficulty-map.js";
import { resolvePrimaryTopic } from "../../../core/topic-resolver.js";
import { solutionPath, readmePath } from "../../../core/path-builder.js";

const dbg = createDebugger("GFG");

let _debounceTimer = null;

const LANG_EXT = {
  c: "c", "c++": "cpp", cpp: "cpp", "c#": "cs", java: "java",
  python: "py", python3: "py", javascript: "js", js: "js",
  typescript: "ts", go: "go", golang: "go", swift: "swift",
  kotlin: "kt", rust: "rs", php: "php", scala: "scala", ruby: "rb",
};

function langExt(name = "") {
  return LANG_EXT[name.toLowerCase().replace(/[^a-z0-9]/g, "")] || "txt";
}

export class GFGHandler extends BasePlatformHandler {
  constructor() {
    super("geeksforgeeks", "GeeksForGeeks", {});
    this.mutationObserver = null;
    this.lastDetectedId = null;
    this._processingLock = false;
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
          description: "Auto-detect accepted submissions on GeeksForGeeks and save them to CodeLedger.",
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
      ],
    };
  }

  async init() {
    dbg.log("GFG handler active");
    this._setupMutationObserver();
    // Inject timer on problem pages
    const page = detectPage(window.location.pathname);
    if (page.type === PAGE_TYPES.PROBLEM) {
      Storage.getSettings().then((s) => {
        if (s.gfg_timer !== false && s.floatingTimerEnabled !== false) {
          this._timer.startFloating(page.slug || "gfg");
        }
      }).catch(() => { });
    }
    // Handle on-demand fetch requests opened by Library: ?codeledger_fetch=1&cl_fetch_id=<slug>
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("codeledger_fetch") && page.type === PAGE_TYPES.PROBLEM) {
        (async () => {
          try {
            const slug = page.slug || params.get("cl_fetch_id");
            if (!slug) return;
            const meta = this._extractMetadata(slug);
            const problem = {
              platform: "geeksforgeeks",
              id: String(slug),
              title: meta.title || slug,
              titleSlug: slug,
              difficulty: meta.difficulty || null,
              tags: meta.tags || [],
              problemStatement: meta.description || null,
              timestamp: Date.now(),
            };
            await Storage.saveProblem(problem).catch(() => { });
            await new Promise((resolve) => {
              try {
                chrome.runtime.sendMessage({ type: "REFRESH_METADATA_DONE", platform: "geeksforgeeks", slug }, () => resolve());
              } catch (_) {
                resolve();
              }
            });
            try { window.close(); } catch (e) { }
          } catch (e) { dbg.error('gfg fetch-save failed', e); }
        })();
      }
    } catch (e) { /* ignore */ }
  }

  _setupMutationObserver() {
    this.mutationObserver = new MutationObserver(() => {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => this._checkSubmission(), 2000);
    });
    this.mutationObserver.observe(document.body, { childList: true, subtree: true });
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
    return candidates.find((el) => {
      const t = (el.textContent || "").toLowerCase();
      return t.includes("problem solved") || t.includes("correct answer") || t.includes("accepted");
    }) || null;
  }

  async _processSubmission(page) {
    this._processingLock = true;
    try {
      const settings = await Storage.getSettings();
      if (!settings.gfg_enable) return;

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
      const code = this._extractCode();
      const lang = this._extractLanguage();
      const topic = resolvePrimaryTopic(meta.tags || []);

      if (!code || code.includes("extraction failed")) {
        dbg.warn("Code extraction failed, skipping commit");
        return;
      }

      sessionStorage.setItem(dedupKey, "1");

      // Canonical mapping
      try { await canonicalMapper.loadMap(); } catch (_) { }
      const canonical = canonicalMapper.resolve("geeksforgeeks", slug);

      // Build file set
      const files = this._buildFileSet(meta, code, lang, settings, slug, canonical);
      const readmeFile = files.find(f => f.path.endsWith("README.md"));

      const elapsedSeconds = this._timer.getElapsedSeconds();

      eventBus.emit("problem:solved", {
        platform: "geeksforgeeks",
        id: meta.platformId || null,
        title: meta.title || slug,
        titleSlug: slug,
        difficulty: meta.difficulty || null,
        topic,
        tags: meta.tags || [],
        canonical: canonical ? { id: canonical.canonicalId, title: canonical.canonicalTitle } : null,
        readmeContent: readmeFile?.content || null,
        code,
        files,
        lang: { name: lang.name, ext: lang.ext },
        runtime: meta.runtime || null,
        memory: meta.memory || null,
        timestamp: Math.floor(Date.now() / 1000),
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
      difficulty: diffEl ? normalizeDifficulty(diffEl.textContent.trim()) : null,
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
    const langObj = { verbose: lang.name.replace(/[^a-zA-Z0-9]/g, "_"), name: lang.name, ext: lang.ext };
    const files = [];

    files.push({
      path: solutionPath(slug, "geeksforgeeks", langObj, canonical, settings),
      content: code,
    });

    if (settings.gfg_readme !== false) {
      const readmeContent = this._buildReadme(meta, lang, slug);
      files.push({
        path: readmePath(slug, canonical, settings),
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
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
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

}
