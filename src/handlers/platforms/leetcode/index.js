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
import { createFloatingTimer } from "../../../ui/floating-timer.js";
import { createFloatingAI } from "../../../ui/floating-ai.js";

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
    this._timer = null;
    this._timerSlug = null;
    this._aiPanel = null;
    this._aiPanelSlug = null;
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
        {
          key: "leetcode_enable",
          label: "Enable tracking",
          type: "toggle", default: true,
          description: "Auto-detect accepted submissions and save them."
        },
        { key: "leetcode_readme",       label: "Include problem description", type: "toggle", default: true,
          description: "Commit a README.md with the full problem statement and your stats." },
        { key: "leetcode_similar",      label: "Include similar problems",    type: "toggle", default: true,
          description: "Add a Similar Problems section to the README." },
        { key: "leetcode_qol",          label: "Quality-of-life features",   type: "toggle", default: true,
          description: "Show daily challenge banner, 'Sync to CodeLedger' button on submission pages, and quick-open button." },
        { key: "leetcode_timer",         label: "Floating solve timer",       type: "toggle", default: true,
          description: "Show a floating stopwatch overlay on problem pages to track your solve time." },
        { key: "leetcode_ai_panel",      label: "Floating AI assistant",      type: "toggle", default: true,
          description: "Show a floating AI chat panel on problem pages for instant help about your solution." },
        { key: "leetcode_sync_hints",   label: "Include hints in commit",    type: "toggle", default: false,
          description: "Commit a separate hints.md file alongside your solution.", advanced: true },
        { key: "leetcode_auto_review",  label: "AI review after acceptance", type: "toggle", default: true,
          description: "Run AI code review immediately after a new accepted submission.", advanced: true },
        { key: "leetcode_username",     label: "LeetCode username",          type: "text",   default: "",
          description: "Your public LeetCode username — used for profile import.", advanced: true,
          placeholder: "e.g. vkrishna04" },
      ],
    };
  }

  async init() {
    dbg.log("LeetCode handler active");
    this._setupMutationObserver();
    this._setupSyncButtons();
    this._handlePageSpecific();
  }

  /** Handle page-specific init logic on load and SPA navigation. */
  _handlePageSpecific() {
    const page = detectPage(window.location.pathname);

    // QoL buttons on problem pages — always inject (not blocked by QoL toggle)
    if (page.type === PAGE_TYPES.PROBLEM) {
      // Start retry loop — toolbar may not be rendered yet
      setTimeout(() => injectQoL(), 1500);
      this._startTimer(page.slug);
      this._startAIPanel(page.slug);
    } else {
      this._stopTimer();
      this._stopAIPanel();
    }

    // Profile page import button
    if (page.type === PAGE_TYPES.PROFILE) {
      this._injectProfileImportBtn(page.username).catch(() => {});
    }
  }

  _startTimer(slug) {
    Storage.getSettings().then((settings) => {
      if (settings.leetcode_timer === false) return;
      if (this._timer && this._timerSlug === slug) return; // already running for this slug
      this._stopTimer();
      this._timerSlug = slug;
      this._timer = createFloatingTimer(slug, { autoStart: true });
    }).catch(() => {});
  }

  _stopTimer() {
    if (this._timer) {
      this._timer.pause();
      this._timer.destroy();
      this._timer = null;
      this._timerSlug = null;
    }
  }

  _startAIPanel(slug) {
    Storage.getSettings().then((settings) => {
      if (settings.leetcode_ai_panel === false) return;
      if (this._aiPanel && this._aiPanelSlug === slug) return;
      this._stopAIPanel();
      this._aiPanelSlug = slug;
      this._aiPanel = createFloatingAI(slug, { position: { bottom: "70px", right: "20px" } });
    }).catch(() => {});
  }

  _stopAIPanel() {
    if (this._aiPanel) {
      this._aiPanel.destroy();
      this._aiPanel = null;
      this._aiPanelSlug = null;
    }
  }

  _getElapsedSeconds() {
    if (!this._timer) return null;
    const ms = this._timer.getElapsed();
    return ms > 0 ? Math.round(ms / 1000) : null;
  }

  _setupMutationObserver() {
    let lastPath = window.location.pathname;

    this.mutationObserver = new MutationObserver(() => {
      // Detect SPA navigation
      const currentPath = window.location.pathname;
      if (currentPath !== lastPath) {
        lastPath = currentPath;
        this._onNavigate(currentPath);
      }

      // Debounce submission check — 600ms lets result banners settle without missing them
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => this._checkSubmission(), 600);
    });
    this.mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  /** Called when LeetCode SPA navigates to a new page. */
  _onNavigate(pathname) {
    const page = detectPage(pathname);
    dbg.log("SPA navigate →", page.type, pathname);

    // Re-inject QoL on problem pages
    if (page.type === PAGE_TYPES.PROBLEM) {
      import("./qol.js").then(({ resetQoL }) => resetQoL()).catch(() => {});
      setTimeout(() => injectQoL(), 1500);
      // Start a fresh timer and AI panel for the new slug
      this._startTimer(page.slug);
      this._startAIPanel(page.slug);
    } else {
      this._stopTimer();
      this._stopAIPanel();
    }

    // On submission detail pages, trigger a check immediately after render settles
    if (page.type === PAGE_TYPES.SUBMISSION) {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => this._checkSubmission(), 1200);
    }

    // Profile page import button
    if (page.type === PAGE_TYPES.PROFILE) {
      this._injectProfileImportBtn(page.username).catch(() => {});
    }
  }

  /* ── Sync button on submission detail + submission list pages ──────── */
  _setupSyncButtons() {
    const observer = new MutationObserver(() => {
      const page = detectPage(window.location.pathname);

      if (page.type === PAGE_TYPES.SUBMISSION && !document.getElementById("cl-sync-btn")) {
        this._injectDetailSyncBtn(page);
      }

      if (page.type === PAGE_TYPES.SUBMISSION_LIST) {
        this._injectListSyncBtns(page);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  _injectDetailSyncBtn(page) {
    // Try multiple toolbar selectors for submission detail page
    const toolbar =
      document.querySelector(".flex.flex-none.gap-2:not(.justify-center):not(.justify-between)") ||
      document.querySelector("[class*='submission'] .flex.gap-2") ||
      document.querySelector("div[class*='flex'][class*='gap'] > div.flex.items-center");
    if (!toolbar) return;

    const btn = document.createElement("button");
    btn.id = "cl-sync-btn";
    btn.title = "Sync this submission to CodeLedger";
    btn.className =
      "whitespace-nowrap focus:outline-none flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition-colors";
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M4 12a8 8 0 018-8V2.5a.5.5 0 01.854-.354l3 3a.5.5 0 010 .708l-3 3A.5.5 0 0112 8.5V7a5 5 0 105 5h1.5a6.5 6.5 0 11-14.5 0z"/></svg> Sync to Ledger`;
    btn.addEventListener("click", () => this._manualSync(page, btn));
    toolbar.prepend(btn);
  }

  _injectListSyncBtns(page) {
    // Add a "Sync" button to each submission row in the list
    const rows = document.querySelectorAll("div[class*='submission-list'] tr:not(.cl-synced), table tr[class*='ac']:not(.cl-synced)");
    for (const row of rows) {
      if (row.querySelector(".cl-row-sync")) continue;
      const statusCell = row.querySelector("td:nth-child(1), [class*='status']");
      if (!statusCell || !/accepted/i.test(statusCell.textContent || "")) continue;

      const submissionId = row.getAttribute("data-submission-id") ||
        row.querySelector("a[href*='/submissions/']")?.href?.match(/\/submissions\/(\d+)/)?.[1];

      if (!submissionId) continue;

      const btn = document.createElement("button");
      btn.className = "cl-row-sync text-[10px] px-2 py-0.5 rounded border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition-colors ml-2";
      btn.textContent = "Sync";
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        btn.textContent = "⏳";
        btn.disabled = true;
        try {
          await this._processSubmission(
            { type: PAGE_TYPES.SUBMISSION, slug: page.slug, submissionId },
            true,
          );
          btn.textContent = "✓";
          btn.className = btn.className.replace("text-cyan-400", "text-emerald-400");
          row.classList.add("cl-synced");
        } catch {
          btn.textContent = "✗";
          btn.disabled = false;
        }
      });

      const lastCell = row.querySelector("td:last-child");
      if (lastCell) lastCell.appendChild(btn);
    }
  }

  async _manualSync(page, btn) {
    if (btn) { btn.textContent = "⏳ Syncing…"; btn.disabled = true; }
    try {
      await this._processSubmission(page, true);
      if (btn) {
        btn.textContent = "✓ Synced";
        setTimeout(() => { if (btn) { btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M4 12a8 8 0 018-8V2.5a.5.5 0 01.854-.354l3 3a.5.5 0 010 .708l-3 3A.5.5 0 0112 8.5V7a5 5 0 105 5h1.5a6.5 6.5 0 11-14.5 0z"/></svg> Sync to Ledger`; btn.disabled = false; } }, 3000);
      }
    } catch (e) {
      dbg.error("Manual sync failed", e);
      if (btn) { btn.textContent = "✗ Failed"; btn.disabled = false; }
    }
  }

  /* ── Profile page import ───────────────────────────────────────────── */
  async _injectProfileImportBtn(pageUsername) {
    if (!pageUsername) return;

    const settings = await Storage.getSettings().catch(() => ({}));
    const savedUsername = (settings.leetcode_username || "").toLowerCase();

    // Hide on other users' profiles only when a username IS configured and it doesn't match
    if (savedUsername && savedUsername !== pageUsername.toLowerCase()) return;

    // Wait for the profile header to render
    await new Promise((resolve) => setTimeout(resolve, 1500));

    if (document.getElementById("cl-profile-import")) return;

    // Find the profile header area
    const profileHeader =
      document.querySelector("[class*='profile-header']") ||
      document.querySelector("div[class*='flex'][class*='items-center'] h1")?.closest("div") ||
      document.querySelector("h1")?.parentElement;

    if (!profileHeader) return;

    const btn = document.createElement("button");
    btn.id = "cl-profile-import";
    btn.className =
      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-cyan-500/40 text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors mt-3";
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm1 14H11v-4H8l4-4 4 4h-3v4z"/></svg> Import All Solves to CodeLedger`;

    btn.addEventListener("click", () => this._runProfileImport(pageUsername, btn));

    const container = document.createElement("div");
    container.style.cssText = "margin-top:12px;display:flex;flex-direction:column;gap:8px;";
    container.appendChild(btn);

    const progress = document.createElement("div");
    progress.id = "cl-import-progress";
    progress.style.cssText = "font-size:12px;color:#94a3b8;display:none;";
    container.appendChild(progress);

    profileHeader.appendChild(container);
  }

  async _runProfileImport(username, btn) {
    btn.disabled = true;
    const progress = document.getElementById("cl-import-progress");
    const show = (msg) => { if (progress) { progress.textContent = msg; progress.style.display = "block"; } };

    const AC_QUERY = `query submissionList($offset:Int!,$limit:Int!,$questionSlug:String,$lang:Int,$status:Int){
      submissionList(offset:$offset,limit:$limit,questionSlug:$questionSlug,lang:$lang,status:$status){
        lastKey hasNext
        submissions{id title titleSlug lang langName runtime timestamp status statusDisplay}
      }
    }`;

    try {
      let offset = 0;
      const limit = 20;
      let totalImported = 0;
      let hasNext = true;
      let page = 0;

      while (hasNext) {
        show(`Fetching page ${++page} (offset ${offset})…`);

        const res = await fetch("https://leetcode.com/graphql/", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-csrftoken": this._getCsrf() },
          body: JSON.stringify({
            query: AC_QUERY,
            variables: { offset, limit, status: 10 }, // status 10 = Accepted
          }),
          credentials: "include",
        });

        if (!res.ok) throw new Error("GraphQL request failed: " + res.status);
        const json = await res.json();
        const list = json?.data?.submissionList;
        if (!list) throw new Error("Unexpected API response");

        const subs = (list.submissions || []).filter((s) => s.statusDisplay === "Accepted");

        for (const sub of subs) {
          const ts = Number(sub.timestamp || 0);
          eventBus.emit("problem:solved", {
            id: sub.titleSlug,
            platform: "leetcode",
            title: sub.title,
            titleSlug: sub.titleSlug,
            difficulty: "Unknown",
            lang: { name: sub.langName || sub.lang, ext: sub.lang },
            tags: [],
            topic: "Uncategorized",
            code: "",
            files: [],
            timestamp: ts,
          });
          totalImported++;
        }

        hasNext = list.hasNext;
        offset += limit;

        show(`Imported ${totalImported} so far (page ${page})…`);

        // Polite delay between pages to avoid rate limiting
        if (hasNext) await new Promise((r) => setTimeout(r, 1200));
      }

      show(`Done! Imported ${totalImported} accepted submissions.`);
      btn.textContent = `✓ Imported ${totalImported} solves`;
    } catch (e) {
      dbg.error("Profile import failed", e);
      show(`Import failed: ${e.message}`);
      btn.disabled = false;
      btn.textContent = "Retry Import";
    }
  }

  /** Extract the CSRF token from LeetCode cookies. */
  _getCsrf() {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : "";
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

    return false;
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
      const files = this._buildFileSet(submission, meta, settings, slug, elapsedSeconds);

      // Canonical mapping
      try { await canonicalMapper.loadMap(); } catch (_) {}
      const canonical = canonicalMapper.resolve("leetcode", slug);

      const lang = resolveLang(submission.lang);

      const elapsedSeconds = this._getElapsedSeconds();

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
        lang:       { name: lang.verbose, ext: lang.ext },
        runtime:    submission.runtimeDisplay || submission.runtime || null,
        memory:     submission.memoryDisplay  || submission.memory  || null,
        runtimePct: submission.runtimePercentile || null,
        memoryPct:  submission.memoryPercentile  || null,
        timestamp:  submission.timestamp || Math.floor(Date.now() / 1000),
        acRate:     meta?.acRate || null,
        likes:      meta?.likes  || null,
        dislikes:   meta?.dislikes || null,
        similar:    (meta?.similarQuestionList || []).filter(q => !q.isPaidOnly),
        elapsedSeconds,
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
    const { verbose: langVerbose, ext } = resolveLang(submission.lang);
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
      const stats = this._formatStats(submission, meta, elapsedSeconds);
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

  _formatStats(submission, meta, elapsedSeconds = null) {
    const parts = [];
    if (submission.runtimeDisplay)  parts.push(`Runtime: ${submission.runtimeDisplay}${submission.runtimePercentile ? ` (beats ${submission.runtimePercentile.toFixed(1)}%)` : ""}`);
    if (submission.memoryDisplay)   parts.push(`Memory: ${submission.memoryDisplay}${submission.memoryPercentile  ? ` (beats ${submission.memoryPercentile.toFixed(1)}%)`  : ""}`);
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
