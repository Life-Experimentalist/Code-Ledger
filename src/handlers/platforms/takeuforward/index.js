/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * takeuforward platform handler.
 *
 * The site is really two products, and this handler serves both:
 *
 *   TUF+ (/plus/dsa/problems/{slug}) — a real editor with a real judge, behind
 *     the subscription. A solve here is a first-class solve: the source comes
 *     from the submit request and the verdict from the poll that follows it.
 *
 *   The sheets (/dsa/{sheet}) — free, public, and where most people work. They
 *     link out to LeetCode rather than hosting a judge, so nothing is ever
 *     committed from them. All this handler does there is mark the rows whose
 *     problems are already in the ledger — see ./sheet.js.
 *
 * Metadata is read from the page's own `/v2/plus/problem/{slug}` response
 * rather than requested directly. Unauthenticated, that endpoint replaces
 * `difficulty` and `topic_tags` with the literal string "Subscribe to TUF+",
 * and the extension has no way to obtain the bearer token that would unlock
 * them. The page already has it, so its response is the only source of the
 * real values.
 *
 * ⚠️ The judge's verdict payload could not be observed — it is behind the
 * subscription. `readVerdict` in ./api.js is written so an unrecognised shape
 * commits nothing rather than committing something wrong.
 */

import { BasePlatformHandler } from "../../_base/BasePlatformHandler.js";
import { SELECTORS } from "./dom-selectors.js";
import { detectPage, PAGE_TYPES } from "./page-detector.js";
import { TAP_PATHS, readProblemMeta } from "./api.js";
import { resolveLang } from "./lang-utils.js";
import { watchSubmissions } from "./submission-detector.js";
import { watchSheet } from "./sheet.js";
import { subscribeTap, parseJsonSafe } from "../../../lib/net-tap-client.js";
import { registerPlatformPrompt } from "../../../core/ai-prompts.js";
import { Storage } from "../../../core/storage.js";
import { createDebugger } from "../../../lib/debug.js";
import { resolvePrimaryTopic } from "../../../core/topic-resolver.js";
import { solutionPath, readmePath } from "../../../core/path-builder.js";
import { createFloatingAI } from "../../../ui/floating-ai.js";
import { isAIActive } from "../../../core/feature-flags.js";

const dbg = createDebugger("TUFHandler");

export class TakeUForwardHandler extends BasePlatformHandler {
  constructor() {
    super("takeuforward", "takeuforward", {});
    this._enableKey = "takeuforward_enabled";
    this._processingLock = false;
    this._unwatch = null;
    this._unwatchMeta = null;
    this._unwatchSheet = null;
    this._navWatcher = null;
    this._currentSlug = null;
    this._aiPanel = null;
    this._aiPanelSlug = null;
    /** @type {Map<string, ReturnType<typeof readProblemMeta>>} */
    this._metaCache = new Map();
    registerPlatformPrompt("takeuforward", this.getDefaultPrompt());
  }

  getDefaultPrompt() {
    return `Review this {language} solution to '{title}' ({difficulty}).

Provide:
1. Time & space complexity (Big-O)
2. Whether this matches the approach the Striver sheet teaches for this step
3. One concrete improvement, if there is one worth making
4. The pattern this problem belongs to, named as an interviewer would name it

Be concise. Max 200 words.`;
  }

  getSettingsSchema() {
    return {
      id: this.id,
      title: "takeuforward (Striver)",
      order: 26,
      fields: [
        {
          key: "takeuforward_enabled",
          label: "Enable tracking",
          type: "toggle",
          default: true,
          description:
            "Auto-detect accepted TUF+ submissions and save them to CodeLedger. Requires a TUF+ subscription — the free sheets have no judge.",
        },
        {
          key: "takeuforward_sheet_marks",
          label: "Mark solved rows on Striver sheets",
          type: "toggle",
          default: true,
          description:
            "Show a ✓ next to sheet problems you have already committed, including ones you solved on LeetCode.",
        },
        {
          key: "takeuforward_readme",
          label: "Include problem description",
          type: "toggle",
          default: true,
          description: "Save the problem statement to README.md alongside your solution.",
        },
        {
          key: "takeuforward_timer",
          label: "Show solve timer",
          type: "toggle",
          default: true,
          description: "Display a floating stopwatch overlay while solving TUF+ problems.",
        },
        {
          key: "takeuforward_ai_panel",
          label: "Floating AI assistant",
          type: "toggle",
          default: true,
          description: "Show a floating AI chat panel on TUF+ problem pages.",
        },
      ],
    };
  }

  async init() {
    dbg.log("takeuforward handler active");

    // Both subscriptions last the whole session: the site is a Next.js app and
    // never reloads, so per-page subscribing would just stack listeners.
    this._unwatch = watchSubmissions((solve) => this._handleAccepted(solve));
    this._unwatchMeta = subscribeTap(
      (url) => url.includes(TAP_PATHS.problem),
      (payload) => this._cacheMetadata(payload),
    );

    this._onNavigate();
    this._watchNavigation();
  }

  destroy() {
    this._unwatch?.();
    this._unwatch = null;
    this._unwatchMeta?.();
    this._unwatchMeta = null;
    this._unwatchSheet?.();
    this._unwatchSheet = null;
    this._navWatcher?.();
    this._navWatcher = null;
    this._stopAIPanel();
    this._timer.stopFloating?.();
  }

  /* ── SPA navigation ────────────────────────────────────────────────── */

  /** Next.js routes client-side, so `popstate` alone misses in-app links. */
  _watchNavigation() {
    const fire = () => this._scheduleDebounce(() => this._onNavigate(), 300);
    const { pushState, replaceState } = window.history;

    window.history.pushState = function (...args) {
      const out = pushState.apply(this, args);
      fire();
      return out;
    };
    window.history.replaceState = function (...args) {
      const out = replaceState.apply(this, args);
      fire();
      return out;
    };
    window.addEventListener("popstate", fire);

    this._navWatcher = () => {
      window.history.pushState = pushState;
      window.history.replaceState = replaceState;
      window.removeEventListener("popstate", fire);
    };
  }

  _onNavigate() {
    const page = detectPage(window.location.pathname);

    // Leaving a sheet tears down its observer; leaving a problem tears down
    // the panel. Neither should survive into the other kind of page.
    if (page.type !== PAGE_TYPES.SHEET) {
      this._unwatchSheet?.();
      this._unwatchSheet = null;
    }
    if (page.type !== PAGE_TYPES.PROBLEM && this._currentSlug) {
      this._currentSlug = null;
      this._stopAIPanel();
    }

    if (page.type === PAGE_TYPES.SHEET) return this._onSheet();
    if (page.type !== PAGE_TYPES.PROBLEM) return;
    if (page.slug === this._currentSlug) return;

    this._currentSlug = page.slug;
    dbg.log(`Now on TUF+ problem ${page.slug}`);

    Storage.getSettings()
      .then((s) => {
        if (!this.isEnabled(s)) return;
        if (s.takeuforward_timer !== false && s.floatingTimerEnabled !== false) {
          this._timer.startFloating(page.slug);
        }
        this._startAIPanel(page.slug);
      })
      .catch(() => {});
  }

  _onSheet() {
    if (this._unwatchSheet) return;
    Storage.getSettings()
      .then(async (s) => {
        if (s.takeuforward_sheet_marks === false) return;
        this._unwatchSheet = await watchSheet();
      })
      .catch(() => {});
  }

  /* ── Metadata ─────────────────────────────────────────────────────── */

  /**
   * Keep whatever the page learned about a problem. Called for every tapped
   * metadata response, including ones for problems the user only browsed.
   *
   * @param {{status: number, responseBody: string|null}} payload
   */
  _cacheMetadata(payload) {
    if (payload.status && payload.status !== 200) return;
    const meta = readProblemMeta(parseJsonSafe(payload.responseBody));
    if (!meta) return;
    this._metaCache.set(meta.slug, meta);
    dbg.log(`Cached metadata for ${meta.slug}${meta.difficulty ? "" : " (difficulty redacted)"}`);
  }

  /** @param {string} slug */
  _metadataFor(slug) {
    return (
      this._metaCache.get(slug) || {
        slug,
        title: this.extractText(SELECTORS.problem.title) || null,
        difficulty: null,
        tags: [],
        statement: null,
        constraints: null,
        examples: [],
      }
    );
  }

  /* ── Submission processing ─────────────────────────────────────────── */

  /**
   * @param {{slug: string|null, code: string, lang: string, verdict: object}} solve
   */
  async _handleAccepted(solve) {
    if (this._processingLock) return;
    this._processingLock = true;
    try {
      const settings = await Storage.getSettings();
      if (!this.isEnabled(settings)) {
        dbg.log("takeuforward tracking is off — ignoring accepted submission");
        return;
      }

      // The submit request does not always name the problem; the url always
      // does, because a submission can only be made from its own page.
      const slug = solve.slug || detectPage(window.location.pathname).slug;
      if (!slug) {
        dbg.warn("Accepted submission with no identifiable problem — skipping");
        return;
      }

      // One commit per (problem, source) per tab. Resubmitting the same code
      // to check a timing should not produce a second commit.
      const dedupKey = `cl_committed_tuf_${slug}`;
      const fingerprint = String(solve.code.length) + ":" + hash(solve.code);
      if (sessionStorage.getItem(dedupKey) === fingerprint) {
        dbg.log("Same source already committed this session — skipping");
        return;
      }

      const meta = this._metadataFor(slug);
      const lang = resolveLang(solve.lang);
      const topic = resolvePrimaryTopic(meta.tags || []);
      const canonical = await this._resolveCanonicalForTUF(slug, meta.title);

      sessionStorage.setItem(dedupKey, fingerprint);

      const files = this._buildFileSet(meta, solve, lang, settings, slug, canonical);
      const readmeFile = files.find((f) => f.path.endsWith("README.md"));

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
        code: solve.code,
        files,
        lang: { name: lang.name, ext: lang.ext, slug: lang.slug },
        runtime: solve.verdict.runtime,
        memory: solve.verdict.memory,
        timestamp: Date.now(),
        elapsedSeconds: this._timer.getElapsedSeconds(),
      });

      dbg.log(`Solve emitted: ${slug} (${lang.name})`);
    } catch (err) {
      dbg.error("Failed to process takeuforward submission", err);
    } finally {
      this._processingLock = false;
    }
  }

  /**
   * TUF names problems its own way, so its slug rarely matches the LeetCode
   * one the canonical map is keyed on. The title is shared, though, so the
   * slug derived from it is the second thing to try — that is what merges a
   * TUF+ solve with a LeetCode solve of the same question.
   */
  async _resolveCanonicalForTUF(slug, title) {
    const direct = await this.resolveCanonical(slug);
    if (direct) return direct;
    if (!title) return null;

    const titleSlug = slugify(title);
    if (!titleSlug || titleSlug === slug) return null;
    return this.resolveCanonical(titleSlug);
  }

  /** The tap does the detecting; nothing polls the page for a verdict. */
  async detectSubmission() {
    return null;
  }

  /** The judged source comes from the request, so the editor is never read. */
  async getSolutionCode() {
    return "";
  }

  /* ── AI panel ─────────────────────────────────────────────────────── */

  _startAIPanel(slug) {
    Storage.getSettings()
      .then((settings) => {
        if (!isAIActive(settings)) return;
        if (settings.takeuforward_ai_panel === false) return;
        if (settings.floatingAIEnabled === false) return;
        if (this._aiPanel && this._aiPanelSlug === slug) return;
        this._stopAIPanel();
        this._aiPanelSlug = slug;
        this._aiPanel = createFloatingAI(slug, {
          position: { bottom: "20px", right: "20px" },
          platform: {
            id: "takeuforward",
            label: "takeuforward AI Assistant",
            chatPlatform: "takeuforward",
            readPageMeta: () => {
              const m = this._metadataFor(slug);
              return { title: m.title, difficulty: m.difficulty || "" };
            },
            readEditorCode: () => "",
            readEditorLang: () => "",
            readProblemStatement: () =>
              String(this._metadataFor(slug).statement || "")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 3000),
            readTestFailures: () => "",
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

  /* ── File set ─────────────────────────────────────────────────────── */

  _buildFileSet(meta, solve, lang, settings, slug, canonical) {
    const langObj = {
      verbose: lang.name.replace(/[^a-zA-Z0-9]/g, "_"),
      name: lang.name,
      ext: lang.ext,
    };
    const problemId = this.makeProblemId(slug);
    const files = [
      {
        path: solutionPath(problemId, "takeuforward", langObj, canonical, settings),
        content: solve.code,
      },
    ];

    if (settings.takeuforward_readme !== false) {
      files.push({
        path: readmePath(problemId, canonical, settings, "takeuforward"),
        content: this._buildReadme(meta, solve, lang, slug),
      });
    }

    return files;
  }

  _buildReadme(meta, solve, lang, slug) {
    const v = solve.verdict;
    const lines = [
      `# ${meta.title || slug}`,
      "",
      `**Platform:** takeuforward (TUF+)  |  **Difficulty:** ${meta.difficulty || "?"}  |  **Language:** ${lang.name}`,
    ];

    if (meta.tags?.length) {
      lines.push("", `**Tags:** ${meta.tags.map((t) => `\`${t}\``).join(", ")}`);
    }

    if (meta.statement) {
      const plain = String(meta.statement)
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, 5000);
      if (plain) lines.push("", "## Problem", "", plain);
    }

    if (meta.constraints) {
      const plain = String(meta.constraints)
        .replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 1000);
      if (plain) lines.push("", "## Constraints", "", plain);
    }

    const stats = [];
    if (v.runtime) stats.push(`Runtime: ${v.runtime}`);
    if (v.memory) stats.push(`Memory: ${v.memory}`);
    if (v.totalTests) stats.push(`Test cases: ${v.passedTests ?? v.totalTests}/${v.totalTests}`);
    if (stats.length) lines.push("", "## My Submission", "", ...stats.map((s) => `- ${s}`));

    lines.push("", `**Source:** https://takeuforward.org/plus/dsa/problems/${slug}`);
    return lines.join("\n");
  }
}

/** Lowercase-hyphenated, the shape every platform slug already has. */
function slugify(title) {
  return String(title)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Small non-cryptographic digest — only ever compared against itself. */
function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h << 5) - h + text.charCodeAt(i);
    h |= 0;
  }
  return String(h >>> 0);
}
