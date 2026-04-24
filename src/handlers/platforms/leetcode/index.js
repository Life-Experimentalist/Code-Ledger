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

export class LeetCodeHandler extends BasePlatformHandler {
  constructor() {
    super("leetcode", "LeetCode", {});
    this.mutationObserver = null;
    this.lastDetectedId = null;
  }

  languageToExt(langName) {
    if (!langName) return "txt";
    const n = langName.toLowerCase();
    if (n.includes("python")) return "py";
    if (n.includes("c++") || n === "cpp") return "cpp";
    if (n.includes("c#") || n === "csharp") return "cs";
    if (n.includes("java")) return "java";
    if (n.includes("javascript") || n === "js") return "js";
    if (n.includes("typescript") || n === "ts") return "ts";
    if (n.includes("ruby")) return "rb";
    if (n.includes("go")) return "go";
    if (n.includes("swift")) return "swift";
    return "txt";
  }

  getSettingsSchema() {
    return {
      id: this.id,
      title: "LeetCode Integration",
      order: 10,
      description: "Configure automated submission tracking for LeetCode.",
      fields: [
        {
          key: "leetcode_enable",
          label: "Enable Tracking",
          type: "toggle",
          default: true,
          description: "Automatically track successful LeetCode submissions.",
        },
        {
          key: "leetcode_sync_hints",
          label: "Sync Hints",
          type: "toggle",
          default: false,
          description:
            "Include official hints in the repository as a separate file.",
        },
      ],
    };
  }

  async init() {
    this.dbg.log("Initializing LeetCode handler");
    this.setupMutationObserver();

    // Check if we are on a problem page to inject QoL features
    const pageInfo = detectPage(window.location.pathname);
    if (pageInfo.type === "problem") {
      setTimeout(() => {
        const editor = this.safeQuery(SELECTORS.qol.editorContainer);
        if (editor) {
          this.dbg.log("Injecting QoL features into editor");
          injectQoL(editor, SELECTORS);
        }
      }, 2500); // Give the editor time to mount via React
    }
  }

  setupMutationObserver() {
    this.mutationObserver = new MutationObserver(() => {
      this.checkSubmission();
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  async checkSubmission() {
    const pageInfo = detectPage(window.location.pathname);

    // Only proceed for pages that can produce submissions
    if (
      !pageInfo ||
      (pageInfo.type !== PAGE_TYPES.PROBLEM &&
        pageInfo.type !== PAGE_TYPES.SUBMISSION)
    )
      return;

    // Use any visible success indicator as primary signal
    const successEl =
      this.safeQuery(SELECTORS.submission.successIndicator) ||
      Array.from(
        document.querySelectorAll(
          '[data-cy="submission-result"], .accepted, .success',
        ),
      ).find((e) => /accepted/i.test(e.textContent || ""));
    if (!successEl && pageInfo.type !== PAGE_TYPES.SUBMISSION) return;

    try {
      // If it's a submission detail page, fetch by ID; otherwise use slug from URL
      let slug = pageInfo.slug;
      let submissionDetail = null;

      if (pageInfo.type === PAGE_TYPES.SUBMISSION && pageInfo.submissionId) {
        // Attempt to fetch submission detail directly
        submissionDetail = await this.fetchGraphQL(QUERIES.SUBMISSION_DETAIL, {
          submissionId: parseInt(pageInfo.submissionId),
        });
        submissionDetail =
          submissionDetail.data?.submissionDetails || submissionDetail.data;
        slug = submissionDetail?.question?.titleSlug || slug;
      } else {
        // Problem page flow — pick the latest accepted submission for this question
        const listRes = await this.fetchGraphQL(QUERIES.SUBMISSION_LIST, {
          offset: 0,
          limit: 10,
          questionSlug: slug,
        });
        const subs = listRes.data?.questionSubmissionList?.submissions || [];
        const accepted =
          subs.find((s) => /accepted/i.test(s.statusDisplay)) || subs[0];
        if (!accepted) return;
        // Fetch detailed submission for code
        const detailRes = await this.fetchGraphQL(QUERIES.SUBMISSION_DETAIL, {
          submissionId: parseInt(accepted.id),
        });
        submissionDetail = detailRes.data?.submissionDetails || detailRes.data;
      }

      if (!submissionDetail) return;

      // Throttle duplicate detections: combine slug + submission timestamp
      const detectionId = `${slug}:${submissionDetail.timestamp || submissionDetail.id || Date.now()}`;
      if (detectionId === this.lastDetectedId) return;
      this.lastDetectedId = detectionId;

      // Load canonical map (best-effort)
      try {
        await canonicalMapper.loadMap();
      } catch (e) {
        /* ignore */
      }
      const canonical = canonicalMapper.resolve("leetcode", slug);

      const metadata = slug ? await this.getProblemMetadata(slug) : null;
      const settings = await Storage.getSettings();
      const topic =
        (metadata?.topicTags &&
          metadata.topicTags[0] &&
          metadata.topicTags[0].name) ||
        "Uncategorized";
      const basePath = `topics/${topic}/${metadata?.titleSlug || slug || "unknown"}/`;

      // Prefer code from submissionDetail; fallback to reading the editor
      let code = submissionDetail.code || submissionDetail.codeText || null;
      if (!code) {
        code = this.extractCodeFromEditor();
      }

      const langVerbose =
        submissionDetail.lang?.verboseName ||
        submissionDetail.lang ||
        "Solution";
      const langName =
        (submissionDetail.lang && submissionDetail.lang.name) ||
        submissionDetail.lang ||
        "txt";
      const ext = this.languageToExt(langName || langVerbose);

      const files = [];
      files.push({
        path: `${basePath}${langVerbose.replace(/\s+/g, "_") || "Solution"}.${ext}`,
        content: code || "// (no code retrieved)",
      });

      // Save description as HTML to preserve formatting safely
      if (metadata && metadata.content) {
        files.push({
          path: `${basePath}README.html`,
          content: `<!-- Auto-saved from LeetCode: ${metadata.title} -->\n${metadata.content}`,
        });
      }

      if (
        settings.leetcode_sync_hints &&
        metadata &&
        metadata.hints &&
        metadata.hints.length > 0
      ) {
        const hintsMd =
          `# Hints for ${metadata.title}\n\n` +
          metadata.hints.map((h, i) => `### Hint ${i + 1}\n${h}\n`).join("\n");
        files.push({ path: `${basePath}Hints.md`, content: hintsMd });
      }

      // Emit enriched event including canonical mapping
      eventBus.emit("problem:solved", {
        platform: "leetcode",
        id:
          metadata?.questionId ||
          submissionDetail?.question?.questionId ||
          null,
        title: metadata?.title || submissionDetail?.question?.title || null,
        titleSlug: metadata?.titleSlug || slug,
        difficulty: metadata?.difficulty || null,
        topic: topic,
        tags: metadata?.topicTags?.map((t) => t.name) || [],
        canonical: canonical
          ? { id: canonical.canonicalId, title: canonical.canonicalTitle }
          : null,
        code: code,
        files: files,
        lang: { name: langVerbose, ext },
        runtime: submissionDetail.runtime || null,
        memory: submissionDetail.memory || null,
        timestamp: submissionDetail.timestamp || Math.floor(Date.now() / 1000),
      });

      this.dbg.log("Solve processed", {
        slug,
        canonical: canonical?.canonicalId,
      });
    } catch (err) {
      this.dbg.error("Failed to process submission", err);
    }
  }

  extractCodeFromEditor() {
    try {
      // Monaco editor: read view-lines
      const lines = document.querySelectorAll(".view-line");
      if (lines && lines.length) {
        return Array.from(lines)
          .map((l) => l.textContent.replace(/\u00a0/g, " "))
          .join("\n");
      }

      // Generic editor fallbacks
      const pre =
        document.querySelector(".CodeMirror-code") ||
        document.querySelector("#editor") ||
        document.querySelector(".monaco-editor");
      if (pre) return pre.textContent || "";

      // Nothing found
      return "";
    } catch (e) {
      this.dbg.warn("extractCodeFromEditor failed", e);
      return "";
    }
  }

  async getProblemMetadata(slug) {
    const res = await this.fetchGraphQL(QUERIES.QUESTION, { titleSlug: slug });
    return res.data.question;
  }

  async getLatestSubmission(slug) {
    // LeetCode's Accepted status ID is typically 10 (though they use string 'Accepted' in display normally)
    const res = await this.fetchGraphQL(QUERIES.SUBMISSION_LIST, {
      offset: 0,
      limit: 1,
      questionSlug: slug,
    });

    if (!res.data.questionSubmissionList.submissions.length) {
      throw new Error("No submissions found");
    }

    // Find the first accepted submission or just the first if latest
    const sub =
      res.data.questionSubmissionList.submissions.find(
        (s) => s.statusDisplay === "Accepted",
      ) || res.data.questionSubmissionList.submissions[0];

    // Get strictly code payload
    const detail = await this.fetchGraphQL(QUERIES.SUBMISSION_DETAIL, {
      submissionId: parseInt(sub.id),
    });

    return detail.data.submissionDetails;
  }

  async fetchGraphQL(query, variables) {
    // Use same-origin GraphQL endpoint and include credentials so cookies are sent
    try {
      const endpoint = `${window.location.origin}/graphql`;
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ query, variables }),
      });

      const parsed = await res.json();
      if (parsed.errors)
        throw new Error(
          parsed.errors[0]?.message || JSON.stringify(parsed.errors),
        );
      return parsed;
    } catch (err) {
      this.dbg.error("GraphQL fetch failed", err);
      throw err;
    }
  }
}
