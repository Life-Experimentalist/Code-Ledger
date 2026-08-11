/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NeetCode platform handler.
 *
 * NeetCode runs its own judge, so a solve here is a first-class solve: the
 * source, the language, the verdict and the timings all come from the one
 * request the page makes when you press Submit. Nothing is scraped to decide
 * whether a submission passed.
 *
 * Detection flow:
 *   1. content/net-tap.js (MAIN world) sees POST /api/executeCodeFunctionHttp
 *   2. submission-detector.js pairs the request with its response and keeps
 *      only the accepted ones
 *   3. this file fills in the metadata and emits "problem:solved"
 *
 * NeetCode slugs are its own — "duplicate-integer", not "contains-duplicate" —
 * so the canonical lookup is done on the LeetCode slug derived from the title
 * as well as on the NeetCode slug. That is what makes a NeetCode solve and a
 * LeetCode solve of the same question land in one folder instead of two.
 */

import { BasePlatformHandler } from "../../_base/BasePlatformHandler.js";
import { SELECTORS, LEGACY_SELECTORS } from "./dom-selectors.js";
import { detectPage, PAGE_TYPES } from "./page-detector.js";
import { fetchProblemMetadata, normalizeDifficulty } from "./api.js";
import { resolveLang } from "./lang-utils.js";
import { watchSubmissions } from "./submission-detector.js";
import { registerPlatformPrompt } from "../../../core/ai-prompts.js";
import { Storage } from "../../../core/storage.js";
import { createDebugger } from "../../../lib/debug.js";
import { resolvePrimaryTopic } from "../../../core/topic-resolver.js";
import { solutionPath, readmePath } from "../../../core/path-builder.js";
import { createFloatingAI } from "../../../ui/floating-ai.js";
import { isAIActive } from "../../../core/feature-flags.js";

const dbg = createDebugger("NeetCodeHandler");

export class NeetCodeHandler extends BasePlatformHandler {
  constructor() {
    super("neetcode", "NeetCode", {});
    this._enableKey = "neetcode_enabled";
    this._processingLock = false;
    this._unwatch = null;
    this._navWatcher = null;
    this._currentSlug = null;
    this._aiPanel = null;
    this._aiPanelSlug = null;
    registerPlatformPrompt("neetcode", this.getDefaultPrompt());
  }

  getDefaultPrompt() {
    return `Review this {language} solution to '{title}' ({difficulty}).

Provide:
1. Time & space complexity (Big-O)
2. Whether this is the intended approach for this problem's pattern
3. One concrete improvement, if there is one worth making
4. The pattern this problem belongs to, named as an interviewer would name it

Be concise. Max 200 words.`;
  }

  getSettingsSchema() {
    return {
      id: this.id,
      title: "NeetCode",
      order: 25,
      fields: [
        {
          key: "neetcode_enabled",
          label: "Enable tracking",
          type: "toggle",
          default: true,
          description: "Auto-detect accepted NeetCode submissions and save them to CodeLedger.",
        },
        {
          key: "neetcode_readme",
          label: "Include problem description",
          type: "toggle",
          default: true,
          description: "Save the problem statement to README.md alongside your solution.",
        },
        {
          key: "neetcode_timer",
          label: "Show solve timer",
          type: "toggle",
          default: true,
          description: "Display a floating stopwatch overlay while solving NeetCode problems.",
        },
        {
          key: "neetcode_ai_panel",
          label: "Floating AI assistant",
          type: "toggle",
          default: true,
          description: "Show a floating AI chat panel on NeetCode problem pages.",
        },
      ],
    };
  }

  async init() {
    dbg.log("NeetCode handler active");

    // One subscription for the whole session. NeetCode never reloads the page,
    // so re-subscribing per problem would just stack duplicate listeners.
    this._unwatch = watchSubmissions((solve) => this._handleAccepted(solve));

    this._onNavigate();
    this._watchNavigation();
  }

  destroy() {
    this._unwatch?.();
    this._unwatch = null;
    this._navWatcher?.();
    this._navWatcher = null;
    this._stopAIPanel();
    this._timer.stopFloating?.();
  }

  /* ── SPA navigation ────────────────────────────────────────────────── */

  /**
   * Angular routes without a page load, so `popstate` alone misses every
   * in-app link. Patching the two history methods that Angular actually calls
   * is the only way to hear about them.
   */
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
    if (page.type !== PAGE_TYPES.PROBLEM) {
      if (this._currentSlug) {
        this._currentSlug = null;
        this._stopAIPanel();
      }
      return;
    }
    if (page.slug === this._currentSlug) return;
    this._currentSlug = page.slug;
    dbg.log(`Now on ${page.slug} (${page.tab})`);

    Storage.getSettings()
      .then((s) => {
        if (!this.isEnabled(s)) return;
        if (s.neetcode_timer !== false && s.floatingTimerEnabled !== false) {
          this._timer.startFloating(page.slug);
        }
        this._startAIPanel(page.slug);
      })
      .catch(() => {});
  }

  /* ── Submission processing ─────────────────────────────────────────── */

  /**
   * @param {{problemId: string, code: string, lang: string, verdict: object}} solve
   */
  async _handleAccepted(solve) {
    if (this._processingLock) return;
    this._processingLock = true;
    try {
      const settings = await Storage.getSettings();
      if (!this.isEnabled(settings)) {
        dbg.log("NeetCode tracking is off — ignoring accepted submission");
        return;
      }

      const slug = solve.problemId;

      // One commit per (problem, source) per tab. Resubmitting the same code
      // to check a timing is common and should not produce a second commit.
      const dedupKey = `cl_committed_nc_${slug}`;
      const fingerprint = String(solve.code.length) + ":" + hash(solve.code);
      if (sessionStorage.getItem(dedupKey) === fingerprint) {
        dbg.log("Same source already committed this session — skipping");
        return;
      }

      const meta = await this._collectMetadata(slug);
      const lang = resolveLang(solve.lang || this._readLanguage());
      const topic = resolvePrimaryTopic(meta.tags || []);
      const canonical = await this._resolveCanonicalForNeetCode(slug, meta.title);

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
        timestamp: solve.verdict.timestamp || Date.now(),
        elapsedSeconds: this._timer.getElapsedSeconds(),
      });

      dbg.log(`Solve emitted: ${slug} (${lang.name})`);
    } catch (err) {
      dbg.error("Failed to process NeetCode submission", err);
    } finally {
      this._processingLock = false;
    }
  }

  /**
   * NeetCode renames problems: its "duplicate-integer" is LeetCode's
   * "contains-duplicate". The canonical map is keyed on each platform's own
   * slug, so a NeetCode-only entry would never match a LeetCode solve of the
   * same question. Falling back to the slug derived from the shared title is
   * what merges the two.
   */
  async _resolveCanonicalForNeetCode(slug, title) {
    const direct = await this.resolveCanonical(slug);
    if (direct) return direct;
    if (!title) return null;

    const titleSlug = slugify(title);
    if (!titleSlug || titleSlug === slug) return null;
    return this.resolveCanonical(titleSlug);
  }

  /* ── Metadata ─────────────────────────────────────────────────────── */

  /**
   * The API knows the tags and the difficulty; the DOM only knows what is
   * currently rendered, which on the Solution or Discuss tab is not the
   * statement. So the API is asked first and the DOM fills the gaps.
   */
  async _collectMetadata(slug) {
    const fromApi = await fetchProblemMetadata(slug).catch(() => null);
    const fromDom = this._readDomMetadata();

    return {
      title: fromApi?.title || fromDom.title || null,
      difficulty: fromApi?.difficulty || fromDom.difficulty || null,
      tags: fromApi?.tags?.length ? fromApi.tags : fromDom.tags,
      description: fromApi?.description || fromDom.description || null,
    };
  }

  _readDomMetadata() {
    const title = this.extractText([SELECTORS.problem.title, LEGACY_SELECTORS.problem.title]);
    const difficulty = normalizeDifficulty(this.extractText(SELECTORS.problem.difficultyPill));

    // Two containers share this class: topics first, company tags second.
    // Company entries carry a trailing count ("Google7") and are not tags.
    const container = this.safeQuery(SELECTORS.problem.tagsContainer);
    const tags = container
      ? [...container.querySelectorAll(SELECTORS.problem.tagLink)]
          .map((a) => (a.textContent || "").trim())
          .filter((t) => t && !/\d+$/.test(t))
      : [];

    const descEl = this.safeQuery([
      SELECTORS.problem.description,
      LEGACY_SELECTORS.problem.description,
    ]);

    return { title, difficulty, tags, description: descEl?.innerHTML || null };
  }

  _readLanguage() {
    return this.extractText(SELECTORS.editor.languageButton) || "";
  }

  /** Monaco keeps its text in a model, so the DOM only has the visible lines. */
  async getSolutionCode() {
    const lines = this.safeQuery(SELECTORS.editor.monacoLines);
    if (!lines) return "";
    return [...lines.querySelectorAll(".view-line")]
      .map((l) => l.textContent.replace(/ /g, " "))
      .join("\n");
  }

  /** The tap does the detecting; nothing polls the page for a verdict. */
  async detectSubmission() {
    return null;
  }

  /* ── AI panel ─────────────────────────────────────────────────────── */

  _startAIPanel(slug) {
    Storage.getSettings()
      .then((settings) => {
        if (!isAIActive(settings)) return;
        if (settings.neetcode_ai_panel === false) return;
        if (settings.floatingAIEnabled === false) return;
        if (this._aiPanel && this._aiPanelSlug === slug) return;
        this._stopAIPanel();
        this._aiPanelSlug = slug;
        this._aiPanel = createFloatingAI(slug, {
          position: { bottom: "20px", right: "20px" },
          platform: {
            id: "neetcode",
            label: "NeetCode AI Assistant",
            chatPlatform: "neetcode",
            readPageMeta: () => {
              const m = this._readDomMetadata();
              return { title: m.title, difficulty: m.difficulty || "" };
            },
            readEditorCode: () => "",
            readEditorLang: () => this._readLanguage(),
            readProblemStatement: () =>
              (this.safeQuery(SELECTORS.problem.description)?.textContent || "")
                .trim()
                .slice(0, 3000),
            readTestFailures: () =>
              (this.safeQuery(SELECTORS.console.content)?.textContent || "").trim().slice(0, 1500),
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
        path: solutionPath(problemId, "neetcode", langObj, canonical, settings),
        content: solve.code,
      },
    ];

    if (settings.neetcode_readme !== false) {
      files.push({
        path: readmePath(problemId, canonical, settings, "neetcode"),
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
      `**Platform:** NeetCode  |  **Difficulty:** ${meta.difficulty || "?"}  |  **Language:** ${lang.name}`,
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
        .trim()
        .slice(0, 5000);
      if (plain) lines.push("", "## Problem", "", plain);
    }

    const stats = [];
    if (v.runtime) stats.push(`Runtime: ${v.runtime}`);
    if (v.memory) stats.push(`Memory: ${v.memory}`);
    if (v.totalTests) stats.push(`Test cases: ${v.passedTests ?? v.totalTests}/${v.totalTests}`);
    if (v.complexity) stats.push(`Complexity: ${v.complexity}`);
    if (stats.length) lines.push("", "## My Submission", "", ...stats.map((s) => `- ${s}`));

    lines.push("", `**Source:** https://neetcode.io/problems/${slug}`);
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
