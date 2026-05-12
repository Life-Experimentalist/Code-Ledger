/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MCP Tools Sidebar: Display available MCP tools for quick access.
 * Modal-agnostic component that can be embedded in any context.
 */

import { h, useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { MCP_TOOLS } from "../../core/mcp-tools.js";
import { executeMCPTool } from "../../core/mcp-executor.js";
import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("MCPToolsSidebar");

export function MCPToolsSidebar({
    onToolResult,
    selectedTool,
    onToolSelect,
    compact = false,
}) {
    const [expanded, setExpanded] = useState(selectedTool ? true : false);
    const [executing, setExecuting] = useState(false);
    const [result, setResult] = useState(null);
    const [activeTab, setActiveTab] = useState(selectedTool || "overview");

    const categoryMap = {
        Context: [
            "query-problems",
            "get-problem-stats",
            "find-similar-problems",
            "get-user-profile",
        ],
        Suggestions: ["get-next-suggestion"],
        Analysis: ["analyze-code-quality", "get-trend-analysis"],
    };

    const handleToolInvoke = async (toolId) => {
        setExecuting(true);
        setActiveTab(toolId);
        onToolSelect?.(toolId);

        try {
            const result = await executeMCPTool(toolId, {});
            setResult({ toolId, result });
            onToolResult?.({ toolId, result });
        } catch (e) {
            dbg.error(`Tool execution failed: ${toolId}`, e);
            setResult({ toolId, result: { ok: false, error: String(e) } });
        } finally {
            setExecuting(false);
        }
    };

    const renderToolResult = (toolId, res) => {
        if (!res) return null;

        if (!res.ok) {
            return html`
                <div
                    class="p-3 bg-rose-950/30 border border-rose-500/30 rounded-lg"
                >
                    <p class="text-xs text-rose-400">Error: ${res.error}</p>
                </div>
            `;
        }

        switch (toolId) {
            case "get-user-profile":
                return html`
                    <div class="space-y-3 text-xs">
                        <div class="p-2 bg-white/5 rounded">
                            <p class="font-medium text-slate-300">
                                Total Problems:
                                <span class="text-cyan-300"
                                    >${res.profile.totalProblems}</span
                                >
                            </p>
                            <p class="text-slate-400">
                                Avg time:
                                ${formatTime(res.profile.averageTimePerProblem)}
                            </p>
                        </div>
                        ${res.profile.topPlatforms.length > 0 &&
                        html`
                            <div class="p-2 bg-white/5 rounded">
                                <p class="font-medium text-slate-300 mb-1">
                                    Top Platforms:
                                </p>
                                ${res.profile.topPlatforms.map(
                                    (p) => html`
                                        <p class="text-slate-400">
                                            <span class="font-mono"
                                                >${p.name}</span
                                            >: ${p.count}
                                        </p>
                                    `
                                )}
                            </div>
                        `}
                        ${res.profile.weakTopics.length > 0 &&
                        html`
                            <div
                                class="p-2 bg-amber-950/20 border border-amber-500/20 rounded"
                            >
                                <p class="font-medium text-amber-300 mb-1">
                                    Weak Topics (opportunities):
                                </p>
                                ${res.profile.weakTopics.map(
                                    (t) => html`
                                        <p class="text-slate-400">
                                            <span class="font-mono"
                                                >${t.name}</span
                                            >: ${t.count}
                                        </p>
                                    `
                                )}
                            </div>
                        `}
                    </div>
                `;

            case "get-next-suggestion":
                return html`
                    <div class="space-y-3 text-xs">
                        ${res.weakTopics.length > 0 &&
                        html`
                            <div class="p-2 bg-white/5 rounded">
                                <p class="font-medium text-slate-300 mb-1">
                                    Weak Topics:
                                </p>
                                ${res.weakTopics
                                    .slice(0, 3)
                                    .map(
                                        (t) => html`
                                            <p class="text-slate-400">
                                                <span class="font-mono"
                                                    >${t.topic}</span
                                                >: ${t.count} problems
                                            </p>
                                        `
                                    )}
                            </div>
                        `}
                        ${res.suggested &&
                        html`
                            <div
                                class="p-2 bg-cyan-950/20 border border-cyan-500/30 rounded"
                            >
                                <p class="font-medium text-cyan-300 mb-1">
                                    Suggested:
                                </p>
                                <p class="text-slate-300">
                                    <strong>${res.suggested.title}</strong>
                                </p>
                                <p class="text-slate-400 text-[10px]">
                                    ${res.suggested.platform} •
                                    ${res.suggested.difficulty}
                                </p>
                                <p class="text-slate-500 text-[10px] mt-1">
                                    ${res.suggested.rationale}
                                </p>
                            </div>
                        `}
                    </div>
                `;

            case "get-trend-analysis":
                return html`
                    <div class="space-y-2 text-xs">
                        <div class="p-2 bg-white/5 rounded">
                            <p class="font-medium text-slate-300">
                                Period: ${res.period}
                            </p>
                            <p class="text-slate-400">
                                Total Solves: ${res.totalSolves}
                            </p>
                            <p class="text-slate-400">
                                Avg time: ${formatTime(res.averageTimePerSolve)}
                            </p>
                        </div>
                        ${Object.keys(res.platforms).length > 0 &&
                        html`
                            <div class="p-2 bg-white/5 rounded">
                                <p class="font-medium text-slate-300 mb-1">
                                    By Platform:
                                </p>
                                ${Object.entries(res.platforms).map(
                                    ([name, count]) => html`
                                        <p class="text-slate-400">
                                            <span class="font-mono"
                                                >${name}</span
                                            >: ${count}
                                        </p>
                                    `
                                )}
                            </div>
                        `}
                    </div>
                `;

            case "find-similar-problems":
                return html`
                    <div class="space-y-2 text-xs">
                        <div class="p-2 bg-white/5 rounded">
                            <p class="font-medium text-slate-300">
                                Similar to:
                            </p>
                            <p class="text-slate-400">
                                <strong>${res.target.title}</strong>
                            </p>
                        </div>
                        ${res.similar.length > 0 &&
                        html`
                            <div class="space-y-1">
                                ${res.similar.map(
                                    (p) => html`
                                        <div class="p-2 bg-white/5 rounded">
                                            <p class="text-slate-300">
                                                <strong>${p.title}</strong>
                                            </p>
                                            <p
                                                class="text-[10px] text-slate-400"
                                            >
                                                ${p.platform} • ${p.difficulty}
                                                (similarity: ${p.similarity})
                                            </p>
                                        </div>
                                    `
                                )}
                            </div>
                        `}
                    </div>
                `;

            case "query-problems":
                return html`
                    <div class="text-xs">
                        <p class="font-medium text-slate-300 mb-2">
                            Found ${res.count} problems
                        </p>
                        <div class="space-y-1 max-h-[200px] overflow-y-auto">
                            ${res.problems.slice(0, 5).map(
                                (p) => html`
                                    <div
                                        class="p-1 bg-white/5 rounded text-slate-400"
                                    >
                                        <p><strong>${p.title}</strong></p>
                                        <p class="text-[10px]">
                                            ${p.platform} • ${p.difficulty}
                                        </p>
                                    </div>
                                `
                            )}
                            ${res.problems.length > 5 &&
                            html`
                                <p class="text-slate-500 text-[10px] mt-2">
                                    ... and ${res.count - 5} more
                                </p>
                            `}
                        </div>
                    </div>
                `;

            default:
                return html`
                    <pre
                        class="text-xs bg-black/30 p-2 rounded overflow-auto max-h-[300px]"
                    >
${JSON.stringify(res, null, 2)}
          </pre
                    >
                `;
        }
    };

    if (compact) {
        return html`
            <button
                onClick=${() => setExpanded(!expanded)}
                title="MCP Tools"
                class="p-2 rounded hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
            >
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                >
                    <circle cx="12" cy="5" r="1.5" />
                    <circle cx="19" cy="12" r="1.5" />
                    <circle cx="12" cy="19" r="1.5" />
                    <circle cx="5" cy="12" r="1.5" />
                    <path
                        d="M12 6.5v11M6.5 12h11M15 9l-6 6M9 9l6 6"
                        stroke="currentColor"
                        stroke-width="0.5"
                    />
                </svg>
            </button>
            ${expanded &&
            html`
                <div
                    class="fixed bottom-4 right-4 w-96 bg-[#0a0a0f] border border-white/5 rounded-lg shadow-lg z-50"
                >
                    <div
                        class="p-4 border-b border-white/5 flex items-center justify-between"
                    >
                        <h3 class="text-sm font-medium text-white">
                            MCP Tools
                        </h3>
                        <button
                            onClick=${() => setExpanded(false)}
                            class="text-slate-400 hover:text-slate-200"
                        >
                            ✕
                        </button>
                    </div>
                    <div class="p-4 max-h-[500px] overflow-y-auto space-y-2">
                        ${Object.entries(categoryMap).map(
                            ([category, toolIds]) => html`
                                <div>
                                    <p
                                        class="text-xs font-medium text-slate-400 mb-1"
                                    >
                                        ${category}
                                    </p>
                                    ${toolIds.map((id) => {
                                        const tool = MCP_TOOLS.find(
                                            (t) => t.id === id
                                        );
                                        return html`
                                            <button
                                                onClick=${() =>
                                                    handleToolInvoke(id)}
                                                disabled=${executing}
                                                class="w-full text-left px-2 py-1.5 text-xs rounded bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
                                            >
                                                ${executing && activeTab === id
                                                    ? "⏳"
                                                    : "→"}
                                                ${tool.name}
                                            </button>
                                        `;
                                    })}
                                </div>
                            `
                        )}
                    </div>
                    ${result &&
                    html`
                        <div class="p-4 border-t border-white/5 bg-white/2">
                            ${renderToolResult(result.toolId, result.result)}
                        </div>
                    `}
                </div>
            `}
        `;
    }

    // Full expanded view
    return html`
        <div class="flex flex-col h-full border-l border-white/5 bg-white/1">
            <div class="p-4 border-b border-white/5 shrink-0">
                <h3 class="text-sm font-medium text-white mb-2">MCP Tools</h3>
                <p class="text-xs text-slate-400">
                    Powerful context and analysis tools
                </p>
            </div>

            <div class="flex-1 overflow-hidden flex flex-col">
                <!-- Tool list -->
                <div
                    class="flex-1 overflow-y-auto p-4 space-y-3 border-b border-white/5"
                >
                    ${Object.entries(categoryMap).map(
                        ([category, toolIds]) => html`
                            <div>
                                <p
                                    class="text-xs font-medium text-slate-400 uppercase mb-2"
                                >
                                    ${category}
                                </p>
                                <div class="space-y-1">
                                    ${toolIds.map((id) => {
                                        const tool = MCP_TOOLS.find(
                                            (t) => t.id === id
                                        );
                                        const isActive = activeTab === id;
                                        return html`
                                            <button
                                                onClick=${() =>
                                                    handleToolInvoke(id)}
                                                disabled=${executing}
                                                class="w-full text-left px-3 py-2 text-xs rounded transition-colors
                        ${isActive
                                                    ? "bg-cyan-600/20 border border-cyan-500/30 text-cyan-200"
                                                    : "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"}
                        disabled:opacity-50"
                                            >
                                                <div
                                                    class="flex items-center justify-between"
                                                >
                                                    <span>${tool.name}</span>
                                                    ${executing &&
                                                    activeTab === id &&
                                                    html`<span
                                                        class="text-[10px]"
                                                        >⏳</span
                                                    >`}
                                                </div>
                                                <p
                                                    class="text-[11px] text-slate-500 mt-0.5"
                                                >
                                                    ${tool.description}
                                                </p>
                                            </button>
                                        `;
                                    })}
                                </div>
                            </div>
                        `
                    )}
                </div>

                <!-- Result view -->
                ${result &&
                html`
                    <div class="flex-1 overflow-y-auto p-4 bg-white/1">
                        ${renderToolResult(result.toolId, result.result)}
                    </div>
                `}
            </div>
        </div>
    `;
}

function formatTime(seconds) {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.round(mins / 60);
    return `${hours}h`;
}
