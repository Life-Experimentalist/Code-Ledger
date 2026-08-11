/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Codeforces platform handler — Alpha.
 *
 * Detection flow:
 *   1. On PROBLEM pages: hookSubmitButton() saves code + slug to sessionStorage.
 *   2. watchForVerdict() observes span[submissionverdict="OK"] on any CF page.
 *   3. On accepted verdict: read saved code, extract DOM metadata, emit solve.
 *
 * Alpha limitations:
 *   - No profile bulk import (CF API is CORS-blocked from content scripts).
 *   - Gym contest submissions are detected but the source URL in README points
 *     to the gym contest, not a permanent problemset URL.
 */

import { BasePlatformHandler } from "../../_base/BasePlatformHandler.js";
import { SELECTORS } from "./dom-selectors.js";
import { detectPage, PAGE_TYPES } from "./page-detector.js";
import { registerPlatformPrompt } from "../../../core/ai-prompts.js";
import { Storage } from "../../../core/storage.js";
import { createDebugger } from "../../../lib/debug.js";
import { runtime } from "../../../lib/browser-compat.js";
import { resolvePrimaryTopic } from "../../../core/topic-resolver.js";
import { solutionPath, readmePath } from "../../../core/path-builder.js";
import { resolveLang, normalizeCFRating } from "./lang-utils.js";
import {
  hookSubmitButton,
  watchForVerdict,
  readPendingSubmission,
  clearPendingSubmission,
  readCurrentTestOutput,
} from "./submission-detector.js";
import { injectCFQoL, removeCFQoL } from "./qol.js";
import { createFloatingAI } from "../../../ui/floating-ai.js";
import { isAIActive } from "../../../core/feature-flags.js";

const dbg = createDebugger("CFHandler");

export class CodeforcesHandler extends BasePlatformHandler {
  constructor() {
    super("codeforces", "Codeforces", {});
    this._enableKey = "cf_enable";
    this._processingLock = false;
    this._cleanupSubmitHook = null;
    this._verdictObserver = null;
    this.lastDetectedId = null;
    this._aiPanel = null;
    this._aiPanelSlug = null;
    registerPlatformPrompt("codeforces", this.getDefaultPrompt());
  }

  getDefaultPrompt() {
    return `Review this {language} competitive programming solution for '{title}'.

Provide:
1. Time & space complexity (Big-O)
2. Will it pass within typical CP constraints (10^8 ops/s rule of thumb)?
3. Potential TLE or MLE risks?
4. One concrete optimisation if applicable

Be concise. Max 200 words.`;
  }

  getSettingsSchema() {
    return {
      id: this.id,
      title: "Codeforces",
      order: 30,
      fields: [
        {
          key: "cf_enable",
          label: "Enable tracking",
          type: "toggle",
          default: true,
          description: "Auto-detect accepted Codeforces submissions and save them to CodeLedger.",
        },
        {
          key: "cf_readme",
          label: "Include problem description",
          type: "toggle",
          default: true,
          description: "Save the problem statement to README.md alongside your solution.",
        },
        {
          key: "cf_timer",
          label: "Show solve timer",
          type: "toggle",
          default: true,
          description: "Display a floating stopwatch overlay while solving Codeforces problems.",
        },
        {
          key: "cf_copy_btn",
          label: "Copy code button",
          type: "toggle",
          default: true,
          description: "Inject a copy-to-clipboard button above the Codeforces editor.",
        },
        {
          key: "cf_ai_panel",
          label: "Floating AI assistant",
          type: "toggle",
          default: true,
          description: "Show a floating AI chat panel on Codeforces problem pages.",
        },
        {
          key: "cf_handle",
          label: "Codeforces handle",
          type: "text",
          default: "",
          description: "Your Codeforces handle. Reserved for future profile import support.",
          advanced: true,
          placeholder: "e.g. tourist",
        },
      ],
    };
  }

  async init() {
    dbg.log("CF handler active");
    const page = detectPage(window.location.pathname);

    if (page.type === PAGE_TYPES.PROBLEM) {
      Storage.getSettings()
        .then((s) => {
          if (s.cf_timer !== false && s.floatingTimerEnabled !== false) {
            this._timer.startFloating(page.slug || "cf");
          }
          const opts = {
            showCopy: s.cf_copy_btn !== false,
            showAI: s.cf_ai_panel !== false && s.floatingAIEnabled !== false,
            onAIClick: () => this._aiPanel?.expand(),
          };
          setTimeout(() => injectCFQoL(opts), 1500);
          if (page.slug) this._startAIPanel(page.slug);
        })
        .catch(() => {});

      this._cleanupSubmitHook = hookSubmitButton(page);
    }

    // Watch for accepted verdict on ALL CF pages:
    //   - Problem page: inline submissions section updates via XHR
    //   - /contest/{id}/my: full page load after contest submission
    this._verdictObserver = watchForVerdict((submissionId, contestId) => {
      this._handleAcceptedVerdict(submissionId, contestId, page);
    });

    // On-demand metadata fetch (used by future profile import feature)
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("codeledger_fetch") && page.type === PAGE_TYPES.PROBLEM) {
        await this._handleOnDemandFetch(page);
      }
    } catch (_) {}
  }

  /* ── Submission processing ─────────────────────────────────────────── */

  async _handleAcceptedVerdict(submissionId, contestId, page) {
    if (this._processingLock) return;

    const detectionId = `cf-${submissionId}`;
    if (detectionId === this.lastDetectedId) return;
    this.lastDetectedId = detectionId;

    this._processingLock = true;
    try {
      const settings = await Storage.getSettings();
      if (!this.isEnabled(settings)) {
        clearPendingSubmission();
        return;
      }

      const pending = readPendingSubmission();

      // Resolve slug: pending → current page → bail
      let slug = pending?.slug;
      if (!slug && page.type === PAGE_TYPES.PROBLEM) slug = page.slug;
      if (!slug) {
        dbg.warn("No slug for accepted verdict, skipping");
        return;
      }

      // Session-level dedup: skip if same submission already committed
      const dedupKey = `cl_committed_cf_${slug}`;
      if (sessionStorage.getItem(dedupKey) === submissionId) {
        dbg.log("Skipping already-committed submission", submissionId);
        clearPendingSubmission();
        return;
      }

      const rawLang = pending?.lang || this._extractLanguage();
      const lang = resolveLang(rawLang);
      const code =
        pending?.code || document.querySelector(SELECTORS.submission.editor)?.value || "";

      if (!code.trim()) {
        dbg.warn("Code extraction failed, skipping commit");
        return;
      }

      // Build page context from pending data + live DOM
      const pageCtx = {
        type: page.type,
        contestId: pending?.contestId || contestId || page.contestId,
        letter: pending?.letter || page.letter,
      };
      const meta = this._extractMetadata(slug, pageCtx);
      const topic = resolvePrimaryTopic(meta.tags || []);
      const canonical = await this.resolveCanonical(slug);

      sessionStorage.setItem(dedupKey, submissionId);
      clearPendingSubmission();

      const files = this._buildFileSet(meta, code, lang, settings, slug, canonical);
      const readmeFile = files.find((f) => f.path.endsWith("README.md"));
      const elapsedSeconds = this._timer.getElapsedSeconds();

      this.emitSolved({
        id: this.makeProblemId(slug),
        title: meta.title || slug,
        titleSlug: slug,
        difficulty: meta.difficulty || null,
        topic,
        tags: meta.tags || [],
        canonical: canonical
          ? { id: canonical.canonicalId, title: canonical.canonicalTitle }
          : null,
        readmeContent: readmeFile?.content || null,
        code,
        files,
        lang: { name: lang.name, ext: lang.ext, slug: lang.slug },
        runtime: meta.runtime || null,
        memory: meta.memory || null,
        timestamp: pending?.ts || Date.now(),
        elapsedSeconds,
      });

      dbg.log("Solve emitted", { slug, lang: lang.name });
    } catch (err) {
      dbg.error("Failed to process CF submission", err);
    } finally {
      this._processingLock = false;
    }
  }

  /* ── DOM extractors ───────────────────────────────────────────────── */

  _extractMetadata(slug, page) {
    const titleEl = document.querySelector(SELECTORS.problem.title);
    const rawTitle = (titleEl?.textContent || "").trim();
    // CF prepends "A. " to titles — strip the letter prefix
    const title = rawTitle.replace(/^[A-Za-z0-9]+\.\s+/, "").trim() || rawTitle || slug;

    const rating = this._extractRating();
    const difficulty = rating ? normalizeCFRating(rating) : null;
    const tags = this._extractTags(rating);
    const descEl = document.querySelector(SELECTORS.problem.description);
    const description = descEl?.innerHTML || null;

    // Runtime/memory from the first row in the inline submissions table
    const firstRow = document.querySelector("tr[data-submission-id]");
    const cells = firstRow ? [...firstRow.querySelectorAll("td")] : [];
    const runtime = cells[4] ? (cells[4].textContent || "").trim() || null : null;
    const memory = cells[5] ? (cells[5].textContent || "").trim() || null : null;

    return {
      title,
      difficulty,
      rating,
      tags,
      description,
      runtime,
      memory,
      contestId: page?.contestId || null,
      letter: page?.letter || null,
    };
  }

  _extractRating() {
    for (const el of document.querySelectorAll(".tag-box")) {
      const title = el.getAttribute("title") || "";
      if (/Difficulty/i.test(title)) {
        const m = title.match(/(\d{3,4})/);
        if (m) return +m[1];
      }
      const text = (el.textContent || "").trim();
      if (/^\d{3,4}$/.test(text)) return +text;
    }
    return null;
  }

  _extractTags(ratingToExclude = null) {
    const tags = [];
    document.querySelectorAll(".roundbox .tag-box, .problemTags .tag-box").forEach((el) => {
      const t = (el.textContent || "").trim();
      if (!t) return;
      if (ratingToExclude !== null && t === String(ratingToExclude)) return;
      if (/^\d+$/.test(t)) return; // skip pure-numeric (ratings)
      if (!tags.includes(t)) tags.push(t);
    });
    return tags;
  }

  _extractLanguage() {
    const sel = document.querySelector(SELECTORS.submission.languageSelector);
    const opt = sel?.options?.[sel.selectedIndex];
    return (opt?.textContent || opt?.value || "").trim() || "C++";
  }

  /* ── AI panel ─────────────────────────────────────────────────────── */

  _startAIPanel(slug) {
    Storage.getSettings()
      .then((settings) => {
        // Nothing to chat with until a provider is switched on. A panel that
        // can only apologise is worse than no panel.
        if (!isAIActive(settings)) return;
        if (settings.cf_ai_panel === false) return;
        if (settings.floatingAIEnabled === false) return;
        if (this._aiPanel && this._aiPanelSlug === slug) return;
        this._stopAIPanel();
        this._aiPanelSlug = slug;
        this._aiPanel = createFloatingAI(slug, {
          position: { bottom: "20px", right: "20px" },
          platform: {
            id: "codeforces",
            label: "CF AI Assistant",
            chatPlatform: "codeforces",
            readPageMeta: () => this._readPageMeta(),
            readEditorCode: () => document.querySelector("#editor")?.value || "",
            readEditorLang: () => this._extractLanguage(),
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
    const titleEl = document.querySelector(SELECTORS.problem.title);
    const rawTitle = (titleEl?.textContent || "").trim();
    const title = rawTitle.replace(/^[A-Za-z0-9]+\.\s+/, "").trim() || rawTitle;
    const rating = this._extractRating();
    return {
      title,
      difficulty: rating ? normalizeCFRating(rating) : String(rating || ""),
    };
  }

  _readProblemStatement() {
    const el = document.querySelector(SELECTORS.problem.description);
    if (!el) return "";
    // Strip LaTeX-like math notation for cleaner AI context
    return (el.textContent || "").trim().slice(0, 3000);
  }

  _readTestFailures() {
    // 1. Live test output from submission-detector helper
    const liveOutput = readCurrentTestOutput();
    if (liveOutput) return liveOutput;

    // 2. Fallback: any pre/error elements on page
    try {
      const lines = [];
      document.querySelectorAll("pre, .error, [class*='error'], [class*='wrong']").forEach((el) => {
        const t = (el.textContent || "").trim();
        if (t && t.length > 4 && !lines.includes(t)) lines.push(t);
      });
      return lines.slice(0, 5).join("\n\n");
    } catch (_) {
      return "";
    }
  }

  /* ── File set builder ─────────────────────────────────────────────── */

  _buildFileSet(meta, code, lang, settings, slug, canonical) {
    const langObj = {
      verbose: lang.name.replace(/[^a-zA-Z0-9]/g, "_"),
      name: lang.name,
      ext: lang.ext,
    };
    const problemId = this.makeProblemId(slug);
    const files = [];

    files.push({
      path: solutionPath(problemId, "codeforces", langObj, canonical, settings),
      content: code,
    });

    if (settings.cf_readme !== false) {
      files.push({
        path: readmePath(problemId, canonical, settings, "codeforces"),
        content: this._buildReadme(meta, lang, slug),
      });
    }

    return files;
  }

  _buildReadme(meta, lang, slug) {
    const ratingStr = meta.rating ? ` (Rating: ${meta.rating})` : "";
    const lines = [
      `# ${meta.title || slug}`,
      "",
      `**Platform:** Codeforces  |  **Difficulty:** ${meta.difficulty || "?"}${ratingStr}`,
    ];

    if (meta.contestId) {
      const letter = meta.letter || slug.replace(String(meta.contestId), "");
      lines.push(`**Contest:** ${meta.contestId}  |  **Problem:** ${letter}`);
    }

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
        .trim()
        .slice(0, 5000);
      lines.push("", "## Problem", "", plain);
    }

    const stats = [];
    if (meta.runtime) stats.push(`Runtime: ${meta.runtime}`);
    if (meta.memory) stats.push(`Memory: ${meta.memory}`);
    if (stats.length) {
      lines.push("", "## My Submission", "", ...stats.map((s) => `- ${s}`));
    }

    if (meta.contestId) {
      const letter = meta.letter || slug.replace(String(meta.contestId), "");
      lines.push(
        "",
        `**Source:** https://codeforces.com/contest/${meta.contestId}/problem/${letter}`,
      );
    }

    return lines.join("\n");
  }

  /* ── On-demand metadata fetch ─────────────────────────────────────── */

  async _handleOnDemandFetch(page) {
    const params = new URLSearchParams(window.location.search);
    if (!params.get("codeledger_fetch")) return false;
    if (page.type !== PAGE_TYPES.PROBLEM) return false;

    const slug = page.slug;
    if (!slug) return false;

    const meta = this._extractMetadata(slug, page);
    const code = document.querySelector("#editor")?.value || "";
    const rawLang = this._extractLanguage();
    const lang = resolveLang(rawLang);

    const existing = await Storage.getProblem(this.makeProblemId(slug)).catch(() => null);

    await Storage.saveProblem({
      ...(existing || {}),
      platform: "codeforces",
      id: this.makeProblemId(slug),
      title: meta.title || existing?.title || slug,
      titleSlug: slug,
      difficulty: meta.difficulty || existing?.difficulty || null,
      tags: meta.tags?.length ? meta.tags : existing?.tags || [],
      code: code || existing?.code || "",
      lang: code ? { name: lang.name, ext: lang.ext, slug: lang.slug } : existing?.lang,
      problemStatement: meta.description || existing?.problemStatement || null,
      timestamp: existing?.timestamp || Date.now(),
    }).catch(() => {});

    await new Promise((resolve) => {
      try {
        runtime.sendMessage({ type: "REFRESH_METADATA_DONE", platform: "codeforces", slug }, () =>
          resolve(),
        );
      } catch (_) {
        resolve();
      }
    });

    try {
      window.close();
    } catch (_) {}
    return true;
  }
}
