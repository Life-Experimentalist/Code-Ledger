/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MCP Tools: Model Context Protocol tools for AI providers.
 * Modal-agnostic, provider-specific tool definitions and handlers.
 * Each AI provider decides how to invoke these tools and format results.
 */

import { Storage } from "./storage.js";
import { canonicalMapper } from "./canonical-mapper.js";
import { createDebugger } from "../lib/debug.js";
import { saveInsight, getInsights, deleteInsight, buildKnowledgeContext } from "./memory/knowledge-bank.js";
import { getAllChats, deleteChat, getChatsByProblem } from "./ai-chat-storage.js";

const dbg = createDebugger("MCPTools");

/**
 * Query problems by filters.
 * Returns list of problems matching criteria.
 */
export async function queryProblems(filters = {}) {
    try {
        const allProblems = (await Storage.getAllProblems()) || [];
        const { platform, difficulty, topic, minSolveTime, maxSolveTime, limit = 20 } = filters;

        let results = allProblems;

        if (platform) {
            results = results.filter((p) => p.platform === platform);
        }
        if (difficulty) {
            results = results.filter((p) => p.difficulty === difficulty);
        }
        if (topic) {
            const topicLower = String(topic).toLowerCase();
            results = results.filter((p) => {
                const tags = (p.tags || []).map((t) => String(t).toLowerCase());
                return tags.includes(topicLower);
            });
        }
        if (minSolveTime !== undefined) {
            results = results.filter((p) => (p.elapsedSeconds || 0) >= minSolveTime);
        }
        if (maxSolveTime !== undefined) {
            results = results.filter((p) => (p.elapsedSeconds || 0) <= maxSolveTime);
        }

        return {
            ok: true,
            count: results.length,
            problems: results.slice(0, limit).map((p) => ({
                id: p.id,
                title: p.title,
                platform: p.platform,
                difficulty: p.difficulty,
                tags: p.tags,
                timestamp: p.timestamp,
                elapsedSeconds: p.elapsedSeconds,
            })),
        };
    } catch (e) {
        dbg.error("queryProblems failed", e?.message || e);
        return { ok: false, error: String(e) };
    }
}

/**
 * Get aggregated stats for a single problem.
 */
export async function getProblemStats(problemId) {
    try {
        const problem = await Storage.getProblem(problemId);
        if (!problem) return { ok: false, error: "Problem not found" };

        return {
            ok: true,
            problem: {
                id: problem.id,
                title: problem.title,
                platform: problem.platform,
                difficulty: problem.difficulty,
                tags: problem.tags,
                solveTime: problem.elapsedSeconds || 0,
                runtime: problem.runtime || "N/A",
                memory: problem.memory || "N/A",
                runtimePercentile: problem.runtimePct || 0,
                memoryPercentile: problem.memoryPct || 0,
                timestamp: problem.timestamp,
                aiReviewAvailable: !!problem.aiReview,
            },
        };
    } catch (e) {
        dbg.error("getProblemStats failed", e?.message || e);
        return { ok: false, error: String(e) };
    }
}

/**
 * Analyze weak topics and suggest next problem.
 */
export async function getNextProblemSuggestion() {
    try {
        const allProblems = (await Storage.getAllProblems()) || [];

        // Count solves by topic
        const topicStats = {};
        allProblems.forEach((p) => {
            const topic = (p.tags && p.tags[0]) || "uncategorized";
            topicStats[topic] = topicStats[topic] || { count: 0, avgTime: 0, totalTime: 0 };
            topicStats[topic].count += 1;
            topicStats[topic].totalTime += p.elapsedSeconds || 0;
        });

        Object.keys(topicStats).forEach((topic) => {
            if (topicStats[topic].count > 0) {
                topicStats[topic].avgTime = Math.round(topicStats[topic].totalTime / topicStats[topic].count);
            }
        });

        // Find weak topics (fewest solves)
        const weakestTopics = Object.entries(topicStats)
            .sort((a, b) => a[1].count - b[1].count)
            .slice(0, 3)
            .map(([topic, stats]) => ({ topic, ...stats }));

        // Suggest problem from weakest topic
        const suggestion = weakestTopics.length > 0
            ? allProblems.find((p) => (p.tags && p.tags[0]) === weakestTopics[0].topic)
            : allProblems[0];

        return {
            ok: true,
            weakTopics: weakestTopics,
            suggested: suggestion
                ? {
                    id: suggestion.id,
                    title: suggestion.title,
                    platform: suggestion.platform,
                    difficulty: suggestion.difficulty,
                    topic: weakestTopics[0]?.topic || "general",
                    rationale: `You have only solved ${weakestTopics[0]?.count || 0} problems in ${weakestTopics[0]?.topic || "this topic"}. Strengthening this area will improve your overall performance.`,
                }
                : null,
        };
    } catch (e) {
        dbg.error("getNextProblemSuggestion failed", e?.message || e);
        return { ok: false, error: String(e) };
    }
}

/**
 * Analyze code quality (complexity, edge cases, patterns).
 * Requires code and optional problem context.
 */
export async function analyzeCodeQuality(code, problemId) {
    try {
        if (!code || typeof code !== "string") {
            return { ok: false, error: "Code is required" };
        }

        const problem = problemId ? await Storage.getProblem(problemId) : null;

        // Basic heuristics for code quality
        const analysis = {
            ok: true,
            code: {
                lineCount: code.split("\n").length,
                hasComments: /\/\/|\/\*/.test(code),
                hasTypeAnnotations: /:\s*(int|str|bool|list|dict|void|function)/i.test(code),
                estimatedComplexity: estimateComplexity(code),
                edgeCasesDetected: detectEdgeCases(code),
            },
            problem: problem
                ? {
                    title: problem.title,
                    difficulty: problem.difficulty,
                    constraints: "See problem statement for full constraints",
                }
                : null,
            suggestions: generateSuggestions(code, problem),
        };

        return analysis;
    } catch (e) {
        dbg.error("analyzeCodeQuality failed", e?.message || e);
        return { ok: false, error: String(e) };
    }
}

/**
 * Get trend analysis over time.
 */
export async function getTrendAnalysis(days = 30) {
    try {
        const allProblems = (await Storage.getAllProblems()) || [];
        const now = Date.now();
        const cutoff = now - days * 24 * 60 * 60 * 1000;

        const recent = allProblems.filter((p) => p.timestamp >= cutoff);

        // Group by day
        const byDay = {};
        recent.forEach((p) => {
            const day = new Date(p.timestamp).toISOString().split("T")[0];
            byDay[day] = byDay[day] || { count: 0, totalTime: 0, topics: {} };
            byDay[day].count += 1;
            byDay[day].totalTime += p.elapsedSeconds || 0;
            const topic = (p.tags && p.tags[0]) || "uncategorized";
            byDay[day].topics[topic] = (byDay[day].topics[topic] || 0) + 1;
        });

        // Calculate trends
        const dailyData = Object.entries(byDay)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, stats]) => ({
                date,
                problemsSolved: stats.count,
                avgTimePerProblem: stats.count > 0 ? Math.round(stats.totalTime / stats.count) : 0,
                topTopics: Object.entries(stats.topics)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([topic, count]) => ({ topic, count })),
            }));

        const platformDist = {};
        allProblems.forEach((p) => {
            platformDist[p.platform] = (platformDist[p.platform] || 0) + 1;
        });

        const difficultyDist = {};
        allProblems.forEach((p) => {
            const difficulty = p.difficulty || "unknown";
            difficultyDist[difficulty] = (difficultyDist[difficulty] || 0) + 1;
        });

        return {
            ok: true,
            period: `Last ${days} days`,
            totalSolves: recent.length,
            averageTimePerSolve: recent.length > 0 ? Math.round(recent.reduce((s, p) => s + (p.elapsedSeconds || 0), 0) / recent.length) : 0,
            daily: dailyData,
            platforms: platformDist,
            difficulties: difficultyDist,
        };
    } catch (e) {
        dbg.error("getTrendAnalysis failed", e?.message || e);
        return { ok: false, error: String(e) };
    }
}

/**
 * Find similar problems based on tags/difficulty/platform.
 */
export async function findSimilarProblems(problemId, limit = 5) {
    try {
        const targetProblem = await Storage.getProblem(problemId);
        if (!targetProblem) return { ok: false, error: "Problem not found" };

        const allProblems = (await Storage.getAllProblems()) || [];

        // Score by similarity
        const scored = allProblems
            .filter((p) => p.id !== problemId)
            .map((p) => {
                let score = 0;

                // Same difficulty +2
                if (p.difficulty === targetProblem.difficulty) score += 2;

                // Same platform +1
                if (p.platform === targetProblem.platform) score += 1;

                // Shared tags +1 per tag
                const commonTags = (p.tags || []).filter((t) => (targetProblem.tags || []).includes(t)).length;
                score += commonTags;

                return { ...p, similarity: score };
            })
            .filter((p) => p.similarity > 0)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);

        return {
            ok: true,
            target: {
                id: targetProblem.id,
                title: targetProblem.title,
                tags: targetProblem.tags,
                difficulty: targetProblem.difficulty,
            },
            similar: scored.map((p) => ({
                id: p.id,
                title: p.title,
                platform: p.platform,
                difficulty: p.difficulty,
                tags: p.tags,
                similarity: p.similarity,
            })),
        };
    } catch (e) {
        dbg.error("findSimilarProblems failed", e?.message || e);
        return { ok: false, error: String(e) };
    }
}

/**
 * Get user profile context: solved problems, weak topics, platforms.
 */
export async function getUserProfileContext() {
    try {
        const allProblems = (await Storage.getAllProblems()) || [];

        const platformDist = {};
        const languageDist = {};
        const topicDist = {};
        const difficultyDist = {};
        let totalTime = 0;

        allProblems.forEach((p) => {
            platformDist[p.platform] = (platformDist[p.platform] || 0) + 1;
            if (p.lang) languageDist[p.lang.name || p.lang] = (languageDist[p.lang.name || p.lang] || 0) + 1;
            const topic = (p.tags && p.tags[0]) || "uncategorized";
            topicDist[topic] = (topicDist[topic] || 0) + 1;
            difficultyDist[p.difficulty || "unknown"] = (difficultyDist[p.difficulty || "unknown"] || 0) + 1;
            totalTime += p.elapsedSeconds || 0;
        });

        const topPlatforms = Object.entries(platformDist)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));

        const topLanguages = Object.entries(languageDist)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));

        const topTopics = Object.entries(topicDist)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, count]) => ({ name, count }));

        const weakTopics = Object.entries(topicDist)
            .sort((a, b) => a[1] - b[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));

        return {
            ok: true,
            profile: {
                totalProblems: allProblems.length,
                totalTime,
                averageTimePerProblem: allProblems.length > 0 ? Math.round(totalTime / allProblems.length) : 0,
                topPlatforms,
                topLanguages,
                topTopics,
                weakTopics,
                difficulties: difficultyDist,
            },
        };
    } catch (e) {
        dbg.error("getUserProfileContext failed", e?.message || e);
        return { ok: false, error: String(e) };
    }
}

// ===== Internal Helpers =====

function estimateComplexity(code) {
    const hasNestedLoop = /for.*for|while.*while|for.*while|while.*for/.test(code);
    const hasRecursion = /function.*{[\s\S]*?\(/.test(code) || /def.*:[\s\S]*?\(/.test(code);
    const hasSort = /sort|sorted/.test(code);

    if (hasNestedLoop) return "O(n²) or worse (nested loops)";
    if (hasRecursion) return "Likely exponential or linear (recursion detected)";
    if (hasSort) return "O(n log n) (sort detected)";
    return "O(n) or better (linear scan)";
}

function detectEdgeCases(code) {
    const cases = [];
    if (/length.*===?.*0|empty|null|undefined/.test(code)) cases.push("Empty input");
    if (/length.*===?.*1|single/.test(code)) cases.push("Single element");
    if (/===?\s*null|===?\s*undefined/.test(code)) cases.push("Null/undefined check");
    if (/negative|< 0/.test(code)) cases.push("Negative values");
    if (/overflow|MAX|MIN/.test(code)) cases.push("Integer overflow");
    return cases.length > 0 ? cases : ["No explicit edge case handling detected"];
}

function generateSuggestions(code, problem) {
    const suggestions = [];

    if (!code.includes("//") && !code.includes("/*")) {
        suggestions.push("Add comments explaining the algorithm and key steps");
    }

    if (code.split("\n").length > 100) {
        suggestions.push("Consider breaking the solution into smaller helper functions");
    }

    if (/\.includes|\.indexOf|\.find/.test(code) && code.includes("for")) {
        suggestions.push("Consider using a Set or Map instead of nested loop searches for better performance");
    }

    if (!detectEdgeCases(code).some((c) => c !== "No explicit edge case handling detected")) {
        suggestions.push("Add explicit edge case handling for empty inputs, null values, and boundary conditions");
    }

    return suggestions.length > 0 ? suggestions : ["Code looks clean. Consider testing edge cases thoroughly."];
}

// ── Knowledge Bank tools ──────────────────────────────────────────────────────

export async function rememberInsight({ topic, content, tags }) {
    try {
        const id = await saveInsight({ topic: topic || "general", content, tags });
        return { ok: true, id, message: `Remembered: "${content}" under topic "${topic || "general"}"` };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

export async function recallInsights({ topic, limit }) {
    try {
        const items = await getInsights(topic || null, limit || 20);
        return { ok: true, count: items.length, insights: items };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

export async function forgetInsight({ id }) {
    try {
        await deleteInsight(id);
        return { ok: true, message: `Forgotten insight ${id}` };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

export async function getKnowledgeContext() {
    try {
        const ctx = await buildKnowledgeContext(30);
        return { ok: true, context: ctx };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

// ── Roadmap tools ─────────────────────────────────────────────────────────────

export async function setRoadmap({ name, problems }) {
    try {
        const settings = await Storage.getSettings();
        const roadmap = { name: name || "My Roadmap", problems: Array.isArray(problems) ? problems : [], createdAt: Date.now() };
        await Storage.setSettings({ ...settings, _activeRoadmap: roadmap });
        return { ok: true, message: `Roadmap "${roadmap.name}" saved with ${roadmap.problems.length} problems.` };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

export async function getRoadmapProgress() {
    try {
        const settings = await Storage.getSettings();
        const roadmap = settings._activeRoadmap;
        if (!roadmap) return { ok: true, roadmap: null, message: "No active roadmap set. Share one with 'set-roadmap'." };
        const allProblems = await Storage.getAllProblems();
        const solvedSlugs = new Set(allProblems.map(p => p.titleSlug || p.id));
        const total = roadmap.problems.length;
        const done = roadmap.problems.filter(p => {
            const slug = typeof p === "string" ? p : (p.slug || p.titleSlug || p.id || "");
            return solvedSlugs.has(slug);
        }).length;
        const nextProblem = roadmap.problems.find(p => {
            const slug = typeof p === "string" ? p : (p.slug || p.titleSlug || p.id || "");
            return !solvedSlugs.has(slug);
        });
        return { ok: true, roadmap: roadmap.name, total, done, remaining: total - done, nextProblem: nextProblem || null };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

// ── Chat tools ────────────────────────────────────────────────────────────────

export async function getChats({ problemSlug, limit }) {
    try {
        const chats = problemSlug
            ? await getChatsByProblem(problemSlug)
            : await getAllChats();
        const sliced = (chats || []).slice(0, limit || 20);
        return { ok: true, count: sliced.length, chats: sliced.map(c => ({ id: c.id, title: c.meta?.title || c.meta?.summary || "(untitled)", problemSlug: c.problemSlug, createdAt: c.createdAt, messageCount: (c.messages || []).length })) };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

export async function deleteChatById({ id }) {
    try {
        await deleteChat(id);
        return { ok: true, message: `Chat ${id} deleted.` };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

// ── Navigation tools ──────────────────────────────────────────────────────────

export async function openProblem({ url, platform }) {
    // Navigation must be handled by the content script / floating-ai layer.
    // This tool returns the URL for the caller to open.
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl) return { ok: false, error: "url is required" };
    return { ok: true, action: "open_url", url: cleanUrl, platform: platform || "leetcode" };
}

/**
 * Standard MCP tools export for provider registration.
 */
export const MCP_TOOLS = [
    {
        id: "query-problems",
        name: "Query Problems",
        description: "Search for problems by platform, difficulty, topic, or solve time",
        parameters: {
            type: "object",
            properties: {
                platform: { type: "string", description: "Platform filter (e.g., 'leetcode')" },
                difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] },
                topic: { type: "string", description: "Topic/tag filter" },
                minSolveTime: { type: "number", description: "Minimum solve time in seconds" },
                maxSolveTime: { type: "number", description: "Maximum solve time in seconds" },
                limit: { type: "number", description: "Max results to return (default 20)" },
            },
        },
        handler: (args) => queryProblems(args),
    },
    {
        id: "get-problem-stats",
        name: "Get Problem Stats",
        description: "Get aggregated statistics for a single problem",
        parameters: {
            type: "object",
            properties: {
                problemId: { type: "string", description: "Problem ID to analyze" },
            },
            required: ["problemId"],
        },
        handler: (args) => getProblemStats(args.problemId),
    },
    {
        id: "get-next-suggestion",
        name: "Get Next Problem Suggestion",
        description: "Analyze weak topics and suggest the next best problem to solve",
        parameters: {
            type: "object",
            properties: {},
        },
        handler: () => getNextProblemSuggestion(),
    },
    {
        id: "analyze-code-quality",
        name: "Analyze Code Quality",
        description: "Analyze code for complexity, edge cases, and improvement opportunities",
        parameters: {
            type: "object",
            properties: {
                code: { type: "string", description: "Code to analyze" },
                problemId: { type: "string", description: "Optional problem context" },
            },
            required: ["code"],
        },
        handler: (args) => analyzeCodeQuality(args.code, args.problemId),
    },
    {
        id: "get-trend-analysis",
        name: "Get Trend Analysis",
        description: "Analyze solving trends over time, platform distribution, and difficulty progression",
        parameters: {
            type: "object",
            properties: {
                days: { type: "number", description: "Number of days to analyze (default 30)" },
            },
        },
        handler: (args) => getTrendAnalysis(args.days),
    },
    {
        id: "find-similar-problems",
        name: "Find Similar Problems",
        description: "Find problems similar to a given problem based on tags, difficulty, and platform",
        parameters: {
            type: "object",
            properties: {
                problemId: { type: "string", description: "Problem ID to find similar problems for" },
                limit: { type: "number", description: "Max similar problems to return (default 5)" },
            },
            required: ["problemId"],
        },
        handler: (args) => findSimilarProblems(args.problemId, args.limit),
    },
    {
        id: "get-user-profile",
        name: "Get User Profile",
        description: "Get comprehensive user profile: solved problems, weak topics, platform distribution, preferred languages",
        parameters: {
            type: "object",
            properties: {},
        },
        handler: () => getUserProfileContext(),
    },
    // ── Knowledge Bank ────────────────────────────────────────────────────────
    {
        id: "remember",
        name: "Remember Insight",
        description: "Save a note, preference, or observation to the user's persistent knowledge bank",
        parameters: {
            type: "object",
            properties: {
                topic: { type: "string", description: "Topic category (e.g. 'trees', 'learning-style', 'roadmap')" },
                content: { type: "string", description: "The insight or note to remember" },
                tags: { type: "array", items: { type: "string" }, description: "Optional tags" },
            },
            required: ["content"],
        },
        handler: (args) => rememberInsight(args),
    },
    {
        id: "recall",
        name: "Recall Insights",
        description: "Retrieve stored insights from the knowledge bank, optionally filtered by topic",
        parameters: {
            type: "object",
            properties: {
                topic: { type: "string", description: "Filter by topic (omit for all)" },
                limit: { type: "number", description: "Max results (default 20)" },
            },
        },
        handler: (args) => recallInsights(args),
    },
    {
        id: "forget",
        name: "Forget Insight",
        description: "Delete a specific insight from the knowledge bank by id",
        parameters: {
            type: "object",
            properties: {
                id: { type: "string", description: "Insight id to delete" },
            },
            required: ["id"],
        },
        handler: (args) => forgetInsight(args),
    },
    // ── Roadmap ───────────────────────────────────────────────────────────────
    {
        id: "set-roadmap",
        name: "Set Roadmap",
        description: "Save a DSA study roadmap (list of problem slugs or objects with slug/title)",
        parameters: {
            type: "object",
            properties: {
                name: { type: "string", description: "Roadmap name" },
                problems: { type: "array", description: "Array of problem slugs or {slug, title, difficulty} objects" },
            },
            required: ["problems"],
        },
        handler: (args) => setRoadmap(args),
    },
    {
        id: "get-roadmap-progress",
        name: "Get Roadmap Progress",
        description: "Get progress on the active DSA roadmap: how many done, what's next",
        parameters: { type: "object", properties: {} },
        handler: () => getRoadmapProgress(),
    },
    // ── Chats ─────────────────────────────────────────────────────────────────
    {
        id: "get-chats",
        name: "Get Saved Chats",
        description: "Retrieve saved AI chat conversations, optionally filtered by problem slug",
        parameters: {
            type: "object",
            properties: {
                problemSlug: { type: "string", description: "Filter by problem slug (omit for all chats)" },
                limit: { type: "number", description: "Max results (default 20)" },
            },
        },
        handler: (args) => getChats(args),
    },
    {
        id: "delete-chat",
        name: "Delete Chat",
        description: "Permanently delete a saved chat by id (requires user confirmation before calling)",
        parameters: {
            type: "object",
            properties: {
                id: { type: "string", description: "Chat id to delete" },
            },
            required: ["id"],
        },
        handler: (args) => deleteChatById(args),
    },
    // ── Navigation ────────────────────────────────────────────────────────────
    {
        id: "open-problem",
        name: "Open Problem",
        description: "Open a LeetCode/GFG/Codeforces problem URL in a new tab",
        parameters: {
            type: "object",
            properties: {
                url: { type: "string", description: "Full problem URL" },
                platform: { type: "string", description: "Platform hint: leetcode|geeksforgeeks|codeforces" },
            },
            required: ["url"],
        },
        handler: (args) => openProblem(args),
    },
];
