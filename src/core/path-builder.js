/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * path-builder.js — Layout v3 problem-path computation.
 *
 * With canonical:    problems/{canonicalId}/{platform}/{platformId}[-{method}].{ext}
 *                    problems/{canonicalId}/{platform}/{platformId}.md
 * Without canonical: problems/{platformId}/{platformId}[-{method}].{ext}
 *                    problems/{platformId}/{platformId}.md
 *
 * platformId = {prefix}-{id}  e.g. lc-1, lc-two-sum, gfg-reverse-string
 *
 * @ts-check
 */

import { CONSTANTS } from "./constants.js";
import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("PathBuilder");

/** Increment when the directory layout changes. Stored in index.json. */
export const LAYOUT_VERSION = 3;

/** Root directory for all problems in the user repo. Fixed — never changes. */
export const PROBLEMS_ROOT = "problems";

// ── Path helpers ──────────────────────────────────────────────────────────────

/**
 * Build the platform-prefixed problem ID string, e.g. "lc-1" or "gfg-two-sum".
 * Idempotent: if id already starts with the prefix, returns it unchanged.
 */
export function platformId(platform, id) {
  const prefix =
    CONSTANTS.PLATFORM_CODE[platform] ||
    String(platform).slice(0, 3).toLowerCase();
  // Strip ::submissionId suffix that LeetCode bulk importer appends (e.g. "two-sum::1427680302")
  const s = String(id).split("::")[0];
  if (s.startsWith(`${prefix}-`)) return s;
  return `${prefix}-${s}`;
}

/**
 * Top-level directory for a problem (shared across platforms for canonical).
 *
 * With canonical:    problems/{canonicalId}
 * Without canonical: problems/{platformId}   e.g. problems/lc-two-sum
 *
 * Used for shared files: notes.md, ai-chats/, etc.
 *
 * @param {string} id         Platform-scoped problem ID (e.g. "1", "two-sum")
 * @param {object} [canonical] { canonicalId: string } if resolved
 * @param {object} [_settings] Reserved
 * @param {string} [platform]  Platform name — required when canonical is absent
 */
export function problemBase(id, canonical, _settings = {}, platform = "") {
  if (canonical?.canonicalId)
    return `${PROBLEMS_ROOT}/${canonical.canonicalId}`;
  const pid = platform ? platformId(platform, id) : id;
  return `${PROBLEMS_ROOT}/${pid}`;
}

/**
 * Directory where solution + description files live.
 *
 * With canonical:    problems/{canonicalId}/{platform}
 * Without canonical: problems/{platformId}
 */
export function problemDir(id, platform, canonical) {
  const platId = platformId(platform, id);
  if (canonical?.canonicalId) {
    return `${PROBLEMS_ROOT}/${canonical.canonicalId}/${platform}`;
  }
  return `${PROBLEMS_ROOT}/${platId}`;
}

/**
 * Full path for a solution file.
 *
 * Filename is always {platformId}[-{method}].{ext}
 * e.g. problems/two-sum/leetcode/lc-two-sum.py
 *      problems/lc-two-sum/lc-two-sum-greedy.py
 *
 * @param {string} id           Platform-scoped problem ID (e.g. "1" or "two-sum")
 * @param {string} platform     Platform name (e.g. "leetcode")
 * @param {object} lang         { ext: string, name?: string }
 * @param {object} [canonical]  { canonicalId: string } if resolved
 * @param {object} [_settings]  Reserved for future use
 * @param {string} [methodTitle] Optional approach title (e.g. "greedy")
 */
export function solutionPath(
  id,
  platform,
  lang,
  canonical,
  _settings = {},
  methodTitle = "",
) {
  const dir = problemDir(id, platform, canonical);
  const pid = platformId(platform, id);
  const ext = lang?.ext || "txt";
  const method = _safeMethod(methodTitle);
  return `${dir}/${pid}${method ? `-${method}` : ""}.${ext}`;
}

/**
 * Path for the per-platform markdown file (description + AI review + solve info).
 * Uses README.md so GitHub renders it automatically when browsing the directory.
 */
export function descriptionPath(id, platform, canonical) {
  const dir = problemDir(id, platform, canonical);
  return `${dir}/README.md`;
}

/** Backwards-compat alias. New code should use descriptionPath(). */
export function readmePath(id, canonical, _settings = {}, platform = "") {
  const dir = problemBase(id, canonical, _settings, platform);
  return `${dir}/README.md`;
}

/** Backwards-compat alias. New code should use descriptionPath(). */
export function hintsPath(id, canonical, _settings = {}, platform = "") {
  return readmePath(id, canonical, _settings, platform);
}

// ── Markdown builder ──────────────────────────────────────────────────────────

/**
 * Build rich markdown content for a problem.
 * Covers: metadata table, problem statement, code approaches, AI review, notes.
 */
export function buildProblemMarkdown(problem) {
  const platform = problem.platform || "unknown";
  const id = problem.id || problem.titleSlug || "unknown";
  const pid = platformId(platform, id);
  const approaches = _collectApproaches(problem);

  const lines = [];

  lines.push(`# ${problem.title || pid}`);
  lines.push("");

  // Metadata table
  const rows = [];
  if (problem.difficulty) rows.push(`| Difficulty | ${problem.difficulty} |`);
  if (platform !== "unknown")
    rows.push(`| Platform | ${_capitalise(platform)} |`);
  rows.push(`| Problem ID | \`${pid}\` |`);
  if (problem.tags?.length)
    rows.push(`| Topics | ${problem.tags.join(", ")} |`);
  if (problem.timestamp)
    rows.push(
      `| Solved | ${new Date(problem.timestamp).toISOString().slice(0, 10)} |`,
    );
  if (problem.elapsedSeconds)
    rows.push(`| Solve Time | ${_formatTime(problem.elapsedSeconds)} |`);
  if (problem.runtime)
    rows.push(
      `| Runtime | ${problem.runtime}${problem.runtimePct ? ` (beats ${problem.runtimePct}%)` : ""} |`,
    );
  if (problem.memory)
    rows.push(
      `| Memory | ${problem.memory}${problem.memoryPct ? ` (beats ${problem.memoryPct}%)` : ""} |`,
    );

  if (rows.length) {
    lines.push("| Field | Value |");
    lines.push("|-------|-------|");
    lines.push(...rows);
    lines.push("");
  }

  // Problem statement
  const stmt = problem.description || problem.problemStatement;
  if (stmt) {
    lines.push("## Problem Statement");
    lines.push("");
    lines.push(_htmlToMarkdown(stmt));
    lines.push("");
  }

  // Collapsible hints
  const hints = Array.isArray(problem.hints)
    ? problem.hints.filter(Boolean)
    : [];
  if (hints.length > 0) {
    lines.push("## Hints");
    lines.push("");
    for (let i = 0; i < hints.length; i++) {
      lines.push(`<details>`);
      lines.push(`<summary>Hint ${i + 1}</summary>`);
      lines.push("");
      lines.push(_htmlToMarkdown(hints[i]));
      lines.push("");
      lines.push(`</details>`);
      lines.push("");
    }
  }

  // Code approaches
  if (approaches.length > 0) {
    lines.push("## Solutions");
    lines.push("");
    for (let i = 0; i < approaches.length; i++) {
      const a = approaches[i];
      const heading =
        a.title || (approaches.length > 1 ? `Approach ${i + 1}` : "");
      if (heading) {
        lines.push(`### ${heading}`);
        lines.push("");
      }
      if (a.description) {
        lines.push(a.description);
        lines.push("");
      }
      if (a.code) {
        lines.push("```" + (a.langName || ""));
        lines.push(a.code);
        lines.push("```");
        lines.push("");
      }
    }
  }

  // AI review
  if (problem.aiReview) {
    lines.push("## AI Review");
    lines.push("");
    lines.push(problem.aiReview);
    lines.push("");
  }

  // Notes
  if (problem.notes) {
    lines.push("## Notes");
    lines.push("");
    lines.push(problem.notes);
    lines.push("");
  }

  return lines.join("\n");
}

// ── File builder ──────────────────────────────────────────────────────────────

/**
 * Build the complete file list for a solved problem.
 * Always recomputes from stored fields — never uses a pre-built files array.
 *
 * @param {object} problem   Stored problem record
 * @param {object} [_settings]  Reserved for future use
 * @returns {Array<{path:string, content:string}>}
 */
export function buildProblemFiles(problem, _settings = {}) {
  const canonical = problem.canonical || null;
  const platform = problem.platform || "unknown";
  const id = problem.id || problem.titleSlug || "unknown";
  const approaches = _collectApproaches(problem);

  const files = [];

  for (const approach of approaches) {
    if (!approach.code) continue;
    const lang = _normLangObj(approach.lang || problem.lang);
    files.push({
      path: solutionPath(
        id,
        platform,
        lang,
        canonical,
        {},
        approach.title || "",
      ),
      content: approach.code,
    });
  }

  // One markdown file per platform directory
  files.push({
    path: descriptionPath(id, platform, canonical),
    content: buildProblemMarkdown(problem),
  });

  return files;
}

/**
 * Rebase a file path from oldBase to newBase.
 * Used during canonical-ID reassignment to compute rename targets.
 */
export function rebasePath(oldPath, oldBase, newBase) {
  if (!oldPath.startsWith(oldBase + "/")) return oldPath;
  return `${newBase}/${oldPath.slice(oldBase.length + 1)}`;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _collectApproaches(problem) {
  if (Array.isArray(problem.methods) && problem.methods.length > 0) {
    return problem.methods.map((m) => ({
      title: m.title || "",
      description: m.description || "",
      code: m.code || "",
      lang: m.lang || problem.lang,
      langName: _normLangObj(m.lang || problem.lang).name,
    }));
  }
  if (problem.code) {
    return [
      {
        title: problem.methodTitle || "",
        description: "",
        code: problem.code,
        lang: problem.lang,
        langName: _normLangObj(problem.lang).name,
      },
    ];
  }
  return [];
}

function _normLangObj(lang) {
  if (!lang) return { ext: "txt", name: "text" };
  if (typeof lang === "string") return { ext: lang, name: lang };
  return {
    ext: lang.ext || "txt",
    name: lang.name || lang.verbose || lang.slug || "text",
  };
}

function _safeMethod(title) {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function _capitalise(str) {
  return (
    String(str || "")
      .charAt(0)
      .toUpperCase() + String(str || "").slice(1)
  );
}

function _formatTime(seconds) {
  if (!seconds) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function _htmlToMarkdown(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "_$1_")
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "_$1_")
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "\n```\n$1\n```\n")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    .replace(/<[uo]l[^>]*>|<\/[uo]l>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
