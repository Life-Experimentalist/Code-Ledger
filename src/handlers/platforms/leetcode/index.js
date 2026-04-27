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

function langExt(name = "") {
  return LANG_EXT[name.toLowerCase().replace(/\s+/g, "")] || "txt";
}

export class LeetCodeHandler extends BasePlatformHandler {
  constructor() {
    super("leetcode", "LeetCode", {});
    this.mutationObserver = null;
    this.lastDetectedId = null;
    this._processingLock = false;
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
        { key: "leetcode_enable",     label: "Enable tracking",             type: "toggle", default: true },
        { key: "leetcode_sync_hints", label: "Include hints in commit",     type: "toggle", default: false },
        { key: "leetcode_similar",    label: "Include similar problems",    type: "toggle", default: true },
        { key: "leetcode_readme",     label: "Include problem description", type: "toggle", default: true },
      ],
    };
  }

  async init() {
    dbg.log("LeetCode handler active");
    this._setupMutationObserver();
    this._injectManualSyncBtn();

    // QoL on problem pages
    const page = detectPage(window.location.pathname);
    if (page.type === PAGE_TYPES.PROBLEM) {
      setTimeout(() => {
        const editor = this.safeQuery(SELECTORS.qol.editorContainer);
        if (editor) injectQoL(editor, SELECTORS);
      }, 2500);
    }
  }

  _setupMutationObserver() {
    this.mutationObserver = new MutationObserver(() => {
      // Debounce: wait 2 s after DOM settles before checking submission
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => this._checkSubmission(), 2000);
    });
    this.mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  /* ── Manual sync button on submission detail pages ────────────────── */
  _injectManualSyncBtn() {
    // Watch for the submission page toolbar and inject "Sync to CodeLedger" button
    const observer = new MutationObserver(() => {
      const page = detectPage(window.location.pathname);
      if (page.type !== PAGE_TYPES.SUBMISSION) return;
      if (document.getElementById("cl-sync-btn")) return;

      // LeetCode's submission toolbar — same selector pattern as LeetHub inspiration
      const toolbar = document.querySelector(
        ".flex.flex-none.gap-2:not(.justify-center):not(.justify-between)"
      );
      if (!toolbar) return;

      const btn = document.createElement("button");
      btn.id = "cl-sync-btn";
      btn.title = "Sync this submission to GitHub via CodeLedger";
      btn.className =
        "group whitespace-nowrap focus:outline-none flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium bg-transparent hover:bg-fill-secondary text-text-secondary";
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 5v6l5 3-1 1.7-6-3.7V7h2z" fill="currentColor"/><path d="M5 12H2l4-4 4 4H7a5 5 0 005 5v2a7 7 0 01-7-7z" fill="currentColor" opacity=".5"/></svg> Sync`;
      btn.addEventListener("click", () => this._manualSync(page));
      toolbar.appendChild(btn);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async _manualSync(page) {
    const btn = document.getElementById("cl-sync-btn");
    if (btn) { btn.textContent = "⏳ Syncing…"; btn.disabled = true; }
    try {
      await this._processSubmission(page, true);
      if (btn) { btn.textContent = "✓ Synced"; setTimeout(() => { btn.textContent = "Sync"; btn.disabled = false; }, 3000); }
    } catch (e) {
      dbg.error("Manual sync failed", e);
      if (btn) { btn.textContent = "✗ Failed"; btn.disabled = false; }
    }
  }

  /* ── Automatic submission detection ──────────────────────────────── */
  async _checkSubmission() {
    if (this._processingLock) return;

    const page = detectPage(window.location.pathname);
    if (page.type !== PAGE_TYPES.PROBLEM && page.type !== PAGE_TYPES.SUBMISSION) return;

    // Only fire when an "Accepted" banner is visible (problem pages)
    if (page.type === PAGE_TYPES.PROBLEM) {
      const accepted =
        this.safeQuery(SELECTORS.submission.successIndicator) ||
        [...document.querySelectorAll('[data-cy="submission-result"], .accepted, [class*="accepted"]')]
          .find(el => /accepted/i.test(el.textContent || ""));
      if (!accepted) return;
    }

    await this._processSubmission(page, false);
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

        sessionStorage.setItem(dedupKey, String(latest.id));
      }

      // Module-level dedup (same JS runtime, catches fast double-fires)
      const detectionId = `${slug}:${submission.timestamp || submission.id || Date.now()}`;
      if (!isManual && detectionId === this.lastDetectedId) return;
      this.lastDetectedId = detectionId;

      // Fetch rich metadata
      const meta = await this._fetchMetadata(slug);

      // Build file list for the single atomic commit
      const files = this._buildFileSet(submission, meta, settings, slug);

      // Canonical mapping
      try { await canonicalMapper.loadMap(); } catch (_) {}
      const canonical = canonicalMapper.resolve("leetcode", slug);

      const langVerbose = submission.lang?.verboseName || submission.lang?.name || "Solution";
      const langName   = submission.lang?.name || "txt";

      eventBus.emit("problem:solved", {
        platform:   "leetcode",
        id:         meta?.questionId || submission.question?.questionId || null,
        title:      meta?.title || submission.question?.title || slug,
        titleSlug:  slug,
        difficulty: meta?.difficulty || submission.question?.difficulty || null,
        topic:      meta?.topicTags?.[0]?.name || "Uncategorized",
        tags:       meta?.topicTags?.map(t => t.name) || [],
        canonical:  canonical ? { id: canonical.canonicalId, title: canonical.canonicalTitle } : null,
        code:       submission.code || "",
        files,
        lang:       { name: langVerbose, ext: langExt(langName) },
        runtime:    submission.runtimeDisplay || submission.runtime || null,
        memory:     submission.memoryDisplay  || submission.memory  || null,
        runtimePct: submission.runtimePercentile || null,
        memoryPct:  submission.memoryPercentile  || null,
        timestamp:  submission.timestamp || Math.floor(Date.now() / 1000),
        acRate:     meta?.acRate || null,
        likes:      meta?.likes  || null,
        dislikes:   meta?.dislikes || null,
        similar:    (meta?.similarQuestionList || []).filter(q => !q.isPaidOnly),
      });

      dbg.log("Solve emitted", { slug, canonical: canonical?.canonicalId, lang: langVerbose });
    } catch (err) {
      dbg.error("Failed to process submission", err);
    } finally {
      this._processingLock = false;
    }
  }

  /* ── File set builder ────────────────────────────────────────────── */
  _buildFileSet(submission, meta, settings, slug) {
    const langVerbose = submission.lang?.verboseName || submission.lang?.name || "Solution";
    const langName   = submission.lang?.name || "txt";
    const ext        = langExt(langName);
    const topic      = meta?.topicTags?.[0]?.name || "Uncategorized";
    const title      = meta?.title || slug;
    const base       = `topics/${topic}/${slug}/`;

    const files = [];

    // 1. Solution file
    files.push({
      path: `${base}${langVerbose.replace(/\s+/g, "_")}.${ext}`,
      content: submission.code || "// (no code retrieved)",
    });

    // 2. README (problem description + stats)
    if (settings.leetcode_readme !== false && meta?.content) {
      const stats = this._formatStats(submission, meta);
      const similar = this._formatSimilar(meta, settings);
      const hints   = this._formatHints(meta, settings);

      files.push({
        path: `${base}README.md`,
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
            .replace(/<[^>]+>/g, "")   // strip HTML tags for plain text
            .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
            .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
            .replace(/\n{3,}/g, "\n\n")
            .trim(),
          "",
          stats,
          similar,
          hints,
        ].filter(Boolean).join("\n"),
      });
    }

    // 3. Hints (separate file if enabled)
    if (settings.leetcode_sync_hints && meta?.hints?.length) {
      files.push({
        path: `${base}hints.md`,
        content: [
          `# Hints — ${title}`,
          "",
          ...meta.hints.map((h, i) => `### Hint ${i + 1}\n\n${h}\n`),
        ].join("\n"),
      });
    }

    return files;
  }

  _formatStats(submission, meta) {
    const parts = [];
    if (submission.runtimeDisplay)  parts.push(`Runtime: ${submission.runtimeDisplay}${submission.runtimePercentile ? ` (beats ${submission.runtimePercentile.toFixed(1)}%)` : ""}`);
    if (submission.memoryDisplay)   parts.push(`Memory: ${submission.memoryDisplay}${submission.memoryPercentile  ? ` (beats ${submission.memoryPercentile.toFixed(1)}%)`  : ""}`);
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

  _formatHints(meta, settings) {
    if (settings.leetcode_sync_hints || !meta?.hints?.length) return "";
    return "";  // hints go in separate file when that setting is on
  }

  /* ── GraphQL + metadata ──────────────────────────────────────────── */
  async _fetchMetadata(slug) {
    try {
      const res = await this._gql(QUERIES.QUESTION, { titleSlug: slug });
      return res.data?.question || null;
    } catch (_) {
      return null;
    }
  }

  async _gql(query, variables) {
    const res = await fetch(`${window.location.origin}/graphql`, {
      method:      "POST",
      credentials: "include",
      headers: {
        "Content-Type":    "application/json",
        "X-Requested-With":"XMLHttpRequest",
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0]?.message || "GraphQL error");
    return json;
  }

  /* ── Legacy compat ─────────────────────────────────────────────── */
  async checkSubmission() { return this._checkSubmission(); }
  async fetchGraphQL(q, v) { return this._gql(q, v); }
  async getProblemMetadata(slug) { return this._fetchMetadata(slug); }
}
