/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../lib/debug.js";
import { CONSTANTS } from "./constants.js";

const dbg = createDebugger("MarkdownGenerator");

/**
 * Generates a markdown file for a single problem.
 * Includes problem metadata, solution code, stats, and links.
 *
 * @param {object} problem - Problem object with title, code, difficulty, tags, etc.
 * @returns {string} Markdown content
 */
export function generateProblemMarkdown(problem) {
    const {
        title = "Untitled",
        titleSlug = "",
        platform = "unknown",
        difficulty = "Unknown",
        tags = [],
        code = "",
        lang = {},
        aiReview = "",
        runtime = null,
        memory = null,
        runtimePct = null,
        memoryPct = null,
        elapsedSeconds = 0,
        timestamp = null,
        problemStatement = "",
        hints = [],
        similar = [],
        acRate = null,
    } = problem;

    const langName = lang.name || lang.slug || "Unknown";
    const langExt = lang.ext || "txt";

    const problemUrl = CONSTANTS.makeProblemUrl(platform.toLowerCase(), titleSlug);

    // Format timestamp
    const dateStr = timestamp
        ? new Date(timestamp).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
          })
        : "Unknown";

    // Build markdown
    const lines = [
        `# ${title}`,
        "",
        `**Platform:** [${platform}](${problemUrl})  `,
        `**Difficulty:** ${difficulty}  `,
        `**Language:** ${langName}`,
        "",
    ];

    // Add metadata
    if (tags.length > 0) {
        lines.push(`**Topics:** ${tags.join(", ")}`);
        lines.push("");
    }

    if (acRate !== null && acRate !== undefined) {
        lines.push(`**Acceptance Rate:** ${(acRate * 100).toFixed(1)}%`);
        lines.push("");
    }

    // Add solve stats
    const statsLines = [];
    if (runtime !== null && runtime !== undefined) {
        statsLines.push(`Runtime: ${runtime}`);
    }
    if (runtimePct !== null && runtimePct !== undefined) {
        statsLines.push(`(${runtimePct}%)`);
    }
    if (memory !== null && memory !== undefined) {
        statsLines.push(`Memory: ${memory}`);
    }
    if (memoryPct !== null && memoryPct !== undefined) {
        statsLines.push(`(${memoryPct}%)`);
    }
    if (elapsedSeconds > 0) {
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;
        statsLines.push(`Solve Time: ${minutes}m ${seconds}s`);
    }

    if (statsLines.length > 0) {
        lines.push("## Solve Stats");
        lines.push(statsLines.join(" | "));
        lines.push("");
    }

    // Add problem statement
    if (problemStatement) {
        lines.push("## Problem");
        lines.push(problemStatement);
        lines.push("");
    }

    // Add solution code
    lines.push("## Solution");
    lines.push("");
    lines.push(`\`\`\`${langExt}`);
    lines.push(code);
    lines.push("```");
    lines.push("");

    // Add AI review if available
    if (aiReview) {
        lines.push("## AI Review");
        lines.push(aiReview);
        lines.push("");
    }

    // Add hints
    if (hints && hints.length > 0) {
        lines.push("## Hints");
        for (const hint of hints) {
            lines.push(`- ${hint}`);
        }
        lines.push("");
    }

    // Add similar problems
    if (similar && similar.length > 0) {
        lines.push("## Similar Problems");
        for (const sim of similar.slice(0, 5)) {
            if (sim.title && sim.titleSlug) {
                let simUrl = "#";
                if (platform.toLowerCase() === "leetcode") {
                    simUrl = CONSTANTS.PLATFORMS.leetcode.problemsBase + sim.titleSlug + "/";
                }
                lines.push(`- [${sim.title}](${simUrl})`);
            }
        }
        lines.push("");
    }

    // Add metadata footer
    lines.push("---");
    lines.push(`*Solved on ${dateStr}*`);

    return lines.join("\n");
}

/**
 * Generates a directory index markdown file for a topic folder.
 * Lists all problems in that topic.
 *
 * @param {string} topic - Topic name
 * @param {array} problems - Array of problems in this topic
 * @returns {string} Markdown content
 */
export function generateTopicIndexMarkdown(topic, problems) {
    const lines = [
        `# ${topic}`,
        "",
        `This folder contains solutions for **${topic}** problems.`,
        "",
        "## Problems",
        "",
    ];

    // Group by difficulty
    const byDifficulty = {
        Easy: [],
        Medium: [],
        Hard: [],
        Unknown: [],
    };

    for (const p of problems) {
        const diff = p.difficulty || "Unknown";
        if (!byDifficulty[diff]) byDifficulty[diff] = [];
        byDifficulty[diff].push(p);
    }

    // Render by difficulty
    for (const [difficulty, probs] of Object.entries(byDifficulty)) {
        if (probs.length === 0) continue;

        lines.push(`### ${difficulty}`);
        lines.push("");

        for (const p of probs) {
            const mdFile = `${p.titleSlug}.md`;
            lines.push(`- [${p.title}](./${mdFile})`);
        }

        lines.push("");
    }

    return lines.join("\n");
}

/**
 * Generates a root-level problems index markdown.
 * Lists all problems organized by topic.
 *
 * @param {array} problems - All problems
 * @returns {string} Markdown content
 */
export function generateProblemsIndexMarkdown(problems) {
    const byTopic = {};

    for (const p of problems) {
        const topic = p.topic || "Untagged";
        if (!byTopic[topic]) byTopic[topic] = [];
        byTopic[topic].push(p);
    }

    const lines = [
        "# All Problems",
        "",
        `Total: **${problems.length}** problems`,
        "",
    ];

    // Sort topics
    const sortedTopics = Object.keys(byTopic).sort();

    for (const topic of sortedTopics) {
        const probs = byTopic[topic];
        lines.push(`## ${topic}`);
        lines.push(`*${probs.length} problems*`);
        lines.push("");

        for (const p of probs) {
            const mdFile = `${p.titleSlug}.md`;
            const badge =
                p.difficulty === "Easy"
                    ? "🟢"
                    : p.difficulty === "Medium"
                      ? "🟡"
                      : "🔴";
            lines.push(`- ${badge} [${p.title}](./${mdFile})`);
        }

        lines.push("");
    }

    return lines.join("\n");
}
