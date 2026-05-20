/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LeetCode file-set builder and GraphQL metadata fetcher.
 * All GitHub commit file content is built here.
 */

import { CONSTANTS } from "../../../core/constants.js";
import { createDebugger } from "../../../lib/debug.js";
import { solutionPath, readmePath, hintsPath } from "../../../core/path-builder.js";

const dbg = createDebugger("LeetCodeFileBuilder");

/**
 * Execute a LeetCode GraphQL query.
 * @param {string} query
 * @param {object} variables
 * @param {string} csrfToken
 * @returns {Promise<object>}
 */
export async function gql(query, variables, csrfToken) {
    const res = await fetch(CONSTANTS.PLATFORMS.leetcode.graphqlUrl, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            ...(csrfToken ? { "x-csrftoken": csrfToken } : {}),
        },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors[0]?.message || "GraphQL error");
    return json;
}

/**
 * Fetch rich problem metadata via GraphQL.
 * Returns { title, difficulty, content, topicTags, hints, acRate, likes, dislikes,
 *           similarQuestionList, hasSimilar }
 */
export async function fetchMetadata(slug, queries, csrfToken) {
    try {
        const res = await gql(queries.QUESTION, { titleSlug: slug }, csrfToken);
        const question = res.data?.question || null;
        if (!question) return null;
        const similar = question.similarQuestionList || [];
        return {
            ...question,
            hasSimilar: similar.length > 0,
            similarQuestionList: similar.filter((q) => !q.isPaidOnly),
        };
    } catch (_) {
        return null;
    }
}

/**
 * Build the file array for a single-submission commit.
 * @param {object} submission
 * @param {object|null} meta
 * @param {object} settings
 * @param {string} slug
 * @param {object} lang - { verbose, slug, ext }
 * @param {object|null} canonical
 * @param {number|null} elapsedSeconds
 */
export function buildFileSet(submission, meta, settings, slug, lang, canonical, elapsedSeconds = null) {
    const problemId = `lc-${slug}`;
    const title = meta?.title || slug;
    const files = [];

    // 1. Solution file
    files.push({
        path: solutionPath(problemId, "leetcode", lang, canonical, settings),
        content: submission.code || "// (no code retrieved)",
    });

    // 2. README (problem description + stats)
    if (settings.leetcode_readme !== false && meta?.content) {
        const stats = formatStats(submission, meta, elapsedSeconds);
        const similar = formatSimilar(meta, settings);

        files.push({
            path: readmePath(problemId, canonical, settings, "leetcode"),
            content: [
                `# ${meta.questionFrontendId ? `[${meta.questionFrontendId}] ` : ""}${title}`,
                "",
                `**Difficulty:** ${meta.difficulty || "?"}  |  **Acceptance:** ${meta.acRate ? meta.acRate.toFixed(1) + "%" : "?"}  |  **Likes:** ${meta.likes ?? "?"} / **Dislikes:** ${meta.dislikes ?? "?"}`,
                "",
                `**Tags:** ${(meta.topicTags || []).map((t) => `\`${t.name}\``).join(", ") || "—"}`,
                "",
                "## Problem",
                "",
                meta.content
                    .replace(/<[^>]+>/g, "")
                    .replace(/&lt;/g, "<")
                    .replace(/&gt;/g, ">")
                    .replace(/&amp;/g, "&")
                    .replace(/&#39;/g, "'")
                    .replace(/&quot;/g, '"')
                    .replace(/\n{3,}/g, "\n\n")
                    .trim(),
                "",
                stats,
                similar,
            ]
                .filter(Boolean)
                .join("\n"),
        });
    }

    // 3. Hints (separate file if enabled)
    if (settings.leetcode_sync_hints && meta?.hints?.length) {
        files.push({
            path: hintsPath(problemId, canonical, settings, "leetcode"),
            content: [
                `# Hints — ${title}`,
                "",
                ...meta.hints.map((h, i) => `### Hint ${i + 1}\n\n${h}\n`),
            ].join("\n"),
        });
    }

    return files;
}

export function formatStats(submission, meta, elapsedSeconds = null) {
    const parts = [];
    if (submission.runtimeDisplay)
        parts.push(
            `Runtime: ${submission.runtimeDisplay}${submission.runtimePercentile ? ` (beats ${submission.runtimePercentile.toFixed(1)}%)` : ""}`
        );
    if (submission.memoryDisplay)
        parts.push(
            `Memory: ${submission.memoryDisplay}${submission.memoryPercentile ? ` (beats ${submission.memoryPercentile.toFixed(1)}%)` : ""}`
        );
    if (elapsedSeconds && elapsedSeconds > 0) {
        const h = Math.floor(elapsedSeconds / 3600);
        const m = Math.floor((elapsedSeconds % 3600) / 60);
        const s = elapsedSeconds % 60;
        const timeStr =
            h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
        parts.push(`Solve time: ${timeStr}`);
    }
    if (!parts.length) return "";
    return `## My Submission\n\n${parts.map((p) => `- ${p}`).join("\n")}\n`;
}

export function formatSimilar(meta, settings) {
    if (settings.leetcode_similar === false) return "";
    const similar = (meta?.similarQuestionList || [])
        .filter((q) => !q.isPaidOnly)
        .slice(0, 5);
    if (!similar.length) return "";
    return [
        "## Similar Problems",
        "",
        ...similar.map(
            (q) =>
                `- [${q.title}](${CONSTANTS.PLATFORMS.leetcode.problemsBase}${q.titleSlug}/) — ${q.difficulty}`
        ),
        "",
    ].join("\n");
}

export function buildBulkReadme(sub, { title, difficulty, tags, acRate, similar, descHtml }) {
    const tagStr = tags.length ? tags.map((t) => `\`${t}\``).join(", ") : "—";
    const simList = (similar || []).filter((q) => !q.isPaidOnly).slice(0, 5);
    const parts = [
        `# ${title}`,
        "",
        `**Difficulty:** ${difficulty || "?"}  |  **Acceptance:** ${acRate != null ? acRate.toFixed(1) + "%" : "?"}`,
        "",
        `**Tags:** ${tagStr}`,
        "",
    ];
    if (descHtml) {
        parts.push(
            "## Problem",
            "",
            descHtml
                .replace(/<[^>]+>/g, "")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&amp;/g, "&")
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/\n{3,}/g, "\n\n")
                .trim(),
            ""
        );
    }
    if (sub.runtime || sub.memory) {
        const perf = [];
        if (sub.runtime) perf.push(`Runtime: ${sub.runtime}`);
        if (sub.memory) perf.push(`Memory: ${sub.memory}`);
        parts.push("## My Submission", "", ...perf.map((p) => `- ${p}`), "");
    }
    if (simList.length) {
        parts.push(
            "## Similar Problems",
            "",
            ...simList.map(
                (q) =>
                    `- [${q.title}](${CONSTANTS.PLATFORMS.leetcode.problemsBase}${q.titleSlug}/) — ${q.difficulty}`
            ),
            ""
        );
    }
    return parts.join("\n");
}
