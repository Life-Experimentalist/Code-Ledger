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
    // Try multiple toolbar selectors — LeetCode changes class names frequently
    const toolbar =
      document.querySelector("[class*='action-bar']") ||
      document.querySelector(".flex.flex-none.gap-2:not(.justify-center):not(.justify-between)") ||
      document.querySelector("[class*='submission-detail'] .flex.gap-2") ||
      document.querySelector("div[class*='flex'][class*='gap-2']:has(button)") ||
      (() => {
        // Find any container near a "Copy" or "Definition" button — that's the toolbar
        const copy = Array.from(document.querySelectorAll("button")).find(
          b => /^copy$/i.test(b.textContent.trim())
        );
        return copy?.closest("div.flex, div[class*='gap']") || null;
      })();
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
    // LeetCode renders submissions as both table rows and div-based rows — handle both
    const rowCandidates = [
      ...document.querySelectorAll("table tbody tr:not(.cl-synced)"),
      ...document.querySelectorAll("div[class*='submission'] [class*='row']:not(.cl-synced)"),
      // New LeetCode UI: each submission is a div with a link to /submissions/<id>
      ...Array.from(document.querySelectorAll("div[class*='flex']:not(.cl-synced)")).filter(
        el => el.querySelector("a[href*='/submissions/']") && el.textContent
      ),
    ];

    for (const row of rowCandidates) {
      if (row.querySelector(".cl-row-sync")) continue;

      // Only process Accepted submissions
      const rowText = row.textContent || "";
      if (!/accepted/i.test(rowText)) continue;

      const submissionId =
        row.getAttribute("data-submission-id") ||
        row.querySelector("a[href*='/submissions/']")?.href?.match(/\/submissions\/(\d+)/)?.[1];

      if (!submissionId) continue;

      const btn = document.createElement("button");
      btn.className = "cl-row-sync text-[10px] px-2 py-0.5 rounded border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition-colors ml-2 shrink-0";
      btn.textContent = "Add to Ledger";
      btn.style.cssText = "font-family:inherit;cursor:pointer;white-space:nowrap;";
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        e.preventDefault();
        btn.textContent = "⏳";
        btn.disabled = true;
        try {
          await this._processSubmission(
            { type: PAGE_TYPES.SUBMISSION, slug: page.slug, submissionId },
            true,
          );
          btn.textContent = "✓ Added";
          btn.style.color = "#34d399";
          btn.style.borderColor = "rgba(52,211,153,0.3)";
          row.classList.add("cl-synced");
        } catch {
          btn.textContent = "✗ Failed";
          btn.disabled = false;
        }
      });

      // Append to the last cell / end of row
      const anchor = row.querySelector("td:last-child") || row;
      anchor.appendChild(btn);
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

  /**
   * Inject the "Import All Solves" button on a LeetCode profile page.
   * Uses a retry loop (MutationObserver fallback) so the button appears even
   * after React finishes rendering the profile header.
   */
  async _injectProfileImportBtn(pageUsername) {
    if (!pageUsername) return;

    // Honour explicit username filter — only skip if we KNOW it's a different user
    const settings = await Storage.getSettings().catch(() => ({}));
    const savedUsername = (settings.leetcode_username || "").toLowerCase();
    if (savedUsername && savedUsername !== pageUsername.toLowerCase()) return;

    // If no explicit username saved, verify with a lightweight userStatus query.
    // On any failure (CSRF, network, not-signed-in) we still show the button;
    // the import itself will surface any auth error clearly.
    if (!savedUsername) {
      try {
        const res = await this._gql(QUERIES.GLOBAL_DATA, {});
        const status = res?.data?.userStatus;
        if (status?.isSignedIn === false) return; // definitely not logged in — no button
        if (status?.username && status.username.toLowerCase() !== pageUsername.toLowerCase()) return;
        // else: signed in as this user, or could not determine → show button
      } catch (_) {
        // Network / auth error — still show the button; import will explain the issue
      }
    }

    // Retry injecting the DOM element for up to 8 seconds (React renders lazily)
    const MAX_ATTEMPTS = 16;
    const RETRY_MS     = 500;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (document.getElementById("cl-profile-import")) return; // already injected

      const anchor = this._findProfileAnchor(pageUsername);
      if (anchor) {
        this._mountProfileImportBtn(pageUsername, anchor);
        return;
      }

      await new Promise((r) => setTimeout(r, RETRY_MS));
    }

    // Last resort: floating fixed button at bottom-right so the import is always accessible
    if (!document.getElementById("cl-profile-import")) {
      const floater = document.createElement("div");
      floater.style.cssText =
        "position:fixed;bottom:80px;right:20px;z-index:9999;" +
        "display:flex;flex-direction:column;gap:6px;align-items:flex-end;";

      const btn = this._createImportBtn(pageUsername);
      btn.style.boxShadow = "0 4px 24px rgba(6,182,212,0.25)";

      const progress = document.createElement("div");
      progress.id = "cl-import-progress";
      progress.style.cssText =
        "font-size:11px;color:#94a3b8;background:#0a0a0f;border:1px solid #1e293b;" +
        "padding:4px 8px;border-radius:6px;max-width:240px;text-align:right;display:none;";

      floater.appendChild(progress);
      floater.appendChild(btn);
      document.body.appendChild(floater);
    }
  }

  /** Find a stable DOM anchor near the profile username heading. */
  _findProfileAnchor(pageUsername) {
    const lower = pageUsername.toLowerCase();

    // 1. Look for a heading that contains exactly this username
    const headings = [...document.querySelectorAll("h1, h2, [class*='username'], [class*='realname']")];
    for (const el of headings) {
      if (el.textContent.trim().toLowerCase() === lower) {
        return el.closest("div") || el.parentElement;
      }
    }

    // 2. Look for canonical profile selectors LeetCode has used historically
    const byClass =
      document.querySelector("[class*='profile-info']") ||
      document.querySelector("[class*='profile-header']") ||
      document.querySelector("[class*='user-info']") ||
      document.querySelector("[class*='userInfo']");
    if (byClass) return byClass;

    // 3. Find the avatar + heading container
    const avatar = document.querySelector("img[class*='avatar'], img[alt*='avatar'], img[class*='user']");
    if (avatar) return avatar.closest("div[class]") || avatar.parentElement;

    return null;
  }

  /** Build and mount the import button + progress div onto a DOM anchor. */
  _mountProfileImportBtn(pageUsername, anchor) {
    if (document.getElementById("cl-profile-import")) return;

    const container = document.createElement("div");
    container.style.cssText = "margin-top:12px;display:flex;flex-direction:column;gap:6px;";

    const btn = this._createImportBtn(pageUsername);
    const progress = document.createElement("div");
    progress.id = "cl-import-progress";
    progress.style.cssText = "font-size:12px;color:#94a3b8;display:none;";

    container.appendChild(btn);
    container.appendChild(progress);
    anchor.appendChild(container);
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

    // Global accepted-submissions query (cross-problem, paginated)
    const AC_QUERY = `
      query submissionList($offset: Int!, $limit: Int!, $status: Int) {
        submissionList(offset: $offset, limit: $limit, status: $status) {
          lastKey
          hasNext
          submissions {
            id title titleSlug lang langName runtime timestamp status statusDisplay
          }
        }
      }
    `;

    try {
      // ── Phase 1: Bulk problem index (difficulty + title from REST API) ──
      show("Building problem index…");
      const diffMap  = {}; // slug → "Easy"|"Medium"|"Hard"
      const titleMap = {}; // slug → display title
      const tagsMap  = {}; // slug → string[]

      try {
        const apiRes = await fetch("https://leetcode.com/api/problems/all/", { credentials: "include" });
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          const LEVEL = { 1: "Easy", 2: "Medium", 3: "Hard" };
          for (const pair of (apiData.stat_status_pairs || [])) {
            const slug  = pair.stat?.question__title_slug;
            const level = pair.difficulty?.level;
            const title = pair.stat?.question__title;
            if (slug) {
              if (level) diffMap[slug]  = LEVEL[level];
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

      // ── Phase 2: Paginate all accepted submissions ──
      show("Fetching submission history…");
      let offset  = 0;
      const PAGE  = 20;
      let hasNext = true;
      let pageNum = 0;
      const allSubs = [];

      while (hasNext) {
        show(`Fetching submissions page ${++pageNum}…`);
        let json;
        try {
          json = await this._gql(AC_QUERY, { offset, limit: PAGE, status: 10 });
        } catch (e) {
          throw new Error(`Submission fetch failed (page ${pageNum}): ${e.message}. Make sure you are logged in to LeetCode.`);
        }

        const list = json?.data?.submissionList;
        if (!list) throw new Error("Unexpected API response — submissionList was null. LeetCode may have changed their API.");

        const accepted = (list.submissions || []).filter((s) => s.statusDisplay === "Accepted");
        allSubs.push(...accepted);
        hasNext = list.hasNext;
        offset += PAGE;
        if (hasNext) await new Promise((r) => setTimeout(r, 600));
      }

      if (allSubs.length === 0) {
        show("No accepted submissions found. Make sure you are logged in.");
        btn.disabled = false;
        return;
      }

      // ── Phase 3: Dedup — keep newest accepted per (titleSlug, lang) ──
      const dedupMap = new Map();
      for (const s of allSubs) {
        const key = `${s.titleSlug}::${s.lang}`;
        const ts  = Number(s.timestamp || 0);
        const cur = dedupMap.get(key);
        if (!cur || ts > Number(cur.timestamp || 0)) dedupMap.set(key, s);
      }
      const picks = Array.from(dedupMap.values());
      show(`Found ${picks.length} unique accepted submissions.`);

      // ── Phase 4: Fetch metadata for slugs missing difficulty / tags ──
      const needMeta = [...new Set(picks.filter(s => !diffMap[s.titleSlug]).map(s => s.titleSlug))];
      if (needMeta.length > 0) {
        show(`Fetching metadata for ${needMeta.length} problems…`);
        for (let i = 0; i < needMeta.length; i++) {
          const slug = needMeta[i];
          try {
            const meta = await this._fetchMetadata(slug);
            if (meta) {
              if (meta.difficulty)        diffMap[slug]  = meta.difficulty;
              if (meta.title)             titleMap[slug] = meta.title;
              if (meta.topicTags?.length) tagsMap[slug]  = meta.topicTags.map(t => t.name);
            }
          } catch (_) {}
          if (i < needMeta.length - 1) await new Promise((r) => setTimeout(r, 250));
          if ((i + 1) % 10 === 0) show(`Metadata… ${i + 1}/${needMeta.length}`);
        }
      }

      // ── Phase 5: Emit problem:solved (skipCommit=true — no git commits) ──
      show(`Importing ${picks.length} submissions…`);
      let imported = 0;

      for (const sub of picks) {
        const lang  = resolveLang(sub.lang || sub.langName);
        const ts    = Number(sub.timestamp || 0) * 1000; // seconds → ms
        const tags  = tagsMap[sub.titleSlug] || [];
        const topic = tags[0] || "Uncategorized";

        eventBus.emit("problem:solved", {
          id:         `${sub.titleSlug}::${lang.slug}`,
          platform:   "leetcode",
          title:      titleMap[sub.titleSlug] || sub.title || sub.titleSlug,
          titleSlug:  sub.titleSlug,
          difficulty: diffMap[sub.titleSlug] || "Unknown",
          lang:       { name: lang.verbose, ext: lang.ext, slug: lang.slug },
          tags,
          topic,
          code:       "",
          files:      [],
          timestamp:  ts,
          skipCommit: true,
        });

        imported++;
        if (imported % 10 === 0) {
          show(`Importing… ${imported}/${picks.length}`);
          await new Promise((r) => setTimeout(r, 25)); // yield to SW message queue
        }
      }

      show(`Done! Imported ${imported} submissions.`);
      btn.textContent = `✓ Imported ${imported} solves`;
      btn.style.color = "#34d399";
      btn.style.borderColor = "rgba(52,211,153,0.4)";
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

      // Canonical mapping
      try { await canonicalMapper.loadMap(); } catch (_) {}
      const canonical = canonicalMapper.resolve("leetcode", slug);

      const lang = resolveLang(submission.lang);
      const elapsedSeconds = this._getElapsedSeconds();

      // Build file list for the single atomic commit
      const files = this._buildFileSet(submission, meta, settings, slug, elapsedSeconds);

      // Normalize timestamp to ms — LeetCode API returns Unix seconds
      const tsMs = submission.timestamp
        ? Number(submission.timestamp) * 1000
        : Date.now();

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
        timestamp:  tsMs,
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
    const csrf = this._getCsrf();
    const res = await fetch("https://leetcode.com/graphql/", {
      method:      "POST",
      credentials: "include",
      headers: {
        "Content-Type":     "application/json",
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

  /* ── Legacy compat ─────────────────────────────────────────────── */
  async checkSubmission() { return this._checkSubmission(); }
  async fetchGraphQL(q, v) { return this._gql(q, v); }
  async getProblemMetadata(slug) { return this._fetchMetadata(slug); }
}
