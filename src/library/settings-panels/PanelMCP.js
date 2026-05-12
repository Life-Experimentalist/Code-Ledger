/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// @ts-nocheck

import { h } from "../../vendor/preact-bundle.js";
import { useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
import {
    getMCPConfig,
    updateMCPConfig,
    setMCPToolEnabled,
    getEnabledMCPTools,
} from "../../core/mcp-config.js";
import { createDebugger } from "../../lib/debug.js";

const html = htm.bind(h);
const dbg = createDebugger("PanelMCP");

const MCP_TOOL_INFO = {
    "query-problems": {
        name: "Query Problems",
        description:
            "Search for problems by platform, difficulty, topic, or time",
        category: "Context",
    },
    "get-problem-stats": {
        name: "Get Problem Stats",
        description:
            "Detailed statistics for a single problem (time, complexity, percentiles)",
        category: "Context",
    },
    "get-next-suggestion": {
        name: "Get Next Suggestion",
        description:
            "Analyze weak topics and suggest the next best problem to practice",
        category: "Suggestions",
    },
    "analyze-code-quality": {
        name: "Analyze Code Quality",
        description:
            "Analyze code for complexity, edge cases, and improvement opportunities",
        category: "Analysis",
    },
    "get-trend-analysis": {
        name: "Get Trend Analysis",
        description:
            "Analyze 30-day solving trends, platform distribution, difficulty progression",
        category: "Analysis",
    },
    "find-similar-problems": {
        name: "Find Similar Problems",
        description:
            "Find problems similar to a given one based on difficulty, platform, tags",
        category: "Context",
    },
    "get-user-profile": {
        name: "Get User Profile",
        description:
            "Comprehensive user context: total problems, top platforms/languages/topics",
        category: "Context",
    },
};

export function PanelMCP() {
    const [config, setConfig] = useState(null);
    const [enabledIds, setEnabledIds] = useState(new Set());
    const [showAdvanced, setShowAdvanced] = useState(false);

    useEffect(() => {
        (async () => {
            const cfg = await getMCPConfig();
            setConfig(cfg);
            const enabled = await getEnabledMCPTools();
            setEnabledIds(new Set(enabled));
        })();
    }, []);

    const handleToggleTool = async (toolId) => {
        const newEnabled = !enabledIds.has(toolId);
        const newSet = new Set(enabledIds);
        if (newEnabled) {
            newSet.add(toolId);
        } else {
            newSet.delete(toolId);
        }
        setEnabledIds(newSet);
        await setMCPToolEnabled(toolId, newEnabled);
        dbg.log(`Tool ${toolId} toggled to ${newEnabled}`);
    };

    const handleToggleSetting = async (key, value) => {
        const updates = { [key]: value };
        await updateMCPConfig(updates);
        setConfig({ ...config, ...updates });
        dbg.log(`Setting ${key} updated to ${value}`);
    };

    if (!config) {
        return html`<div class="p-4 text-slate-400">
            Loading MCP config...
        </div>`;
    }

    const categories = ["Context", "Suggestions", "Analysis"];
    const toolsByCategory = categories.reduce((acc, cat) => {
        acc[cat] = Object.entries(MCP_TOOL_INFO).filter(
            ([, info]) => info.category === cat
        );
        return acc;
    }, {});

    return html`
        <div class="flex flex-col gap-6 p-4">
            <!-- Overview -->
            <div
                class="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg p-4 border border-blue-500/20"
            >
                <h3 class="font-semibold text-white mb-2">
                    MCP (Model Context Protocol)
                </h3>
                <p class="text-sm text-slate-300 leading-relaxed">
                    AI providers can automatically invoke these tools to provide
                    richer analysis. Enable/disable individual tools based on
                    your preferences.
                </p>
            </div>

            <!-- Global Settings -->
            <div class="space-y-3">
                <h4 class="text-sm font-semibold text-slate-200">
                    Global Settings
                </h4>

                <label
                    class="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700 cursor-pointer hover:bg-slate-800"
                >
                    <input
                        type="checkbox"
                        checked=${config.useInChat === true}
                        onChange=${(e) =>
                            handleToggleSetting("useInChat", e.target.checked)}
                        class="w-4 h-4 rounded"
                    />
                    <div>
                        <div class="text-sm font-medium text-white">
                            Use MCP in Chat
                        </div>
                        <div class="text-xs text-slate-400">
                            AI uses tools during chat conversations
                        </div>
                    </div>
                </label>

                <label
                    class="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700 cursor-pointer hover:bg-slate-800"
                >
                    <input
                        type="checkbox"
                        checked=${config.useInReview === true}
                        onChange=${(e) =>
                            handleToggleSetting(
                                "useInReview",
                                e.target.checked
                            )}
                        class="w-4 h-4 rounded"
                    />
                    <div>
                        <div class="text-sm font-medium text-white">
                            Use MCP in Review
                        </div>
                        <div class="text-xs text-slate-400">
                            AI uses tools during code reviews
                        </div>
                    </div>
                </label>

                <label
                    class="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700 cursor-pointer hover:bg-slate-800"
                >
                    <input
                        type="checkbox"
                        checked=${config.cacheResults === true}
                        onChange=${(e) =>
                            handleToggleSetting(
                                "cacheResults",
                                e.target.checked
                            )}
                        class="w-4 h-4 rounded"
                    />
                    <div>
                        <div class="text-sm font-medium text-white">
                            Cache Tool Results
                        </div>
                        <div class="text-xs text-slate-400">
                            Cache results for 5 minutes
                        </div>
                    </div>
                </label>
            </div>

            <!-- Tools by Category -->
            ${categories.map(
                (category) => html`
                    <div>
                        <h4 class="text-sm font-semibold text-slate-200 mb-2">
                            ${category}
                        </h4>
                        <div class="space-y-2">
                            ${toolsByCategory[category].map(
                                ([toolId, toolInfo]) => html`
                                    <label
                                        class="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            checked=${enabledIds.has(toolId)}
                                            onChange=${() =>
                                                handleToggleTool(toolId)}
                                            class="w-4 h-4 rounded mt-1 flex-shrink-0"
                                        />
                                        <div class="flex-1">
                                            <div
                                                class="text-sm font-medium text-white"
                                            >
                                                ${toolInfo.name}
                                            </div>
                                            <div
                                                class="text-xs text-slate-400 mt-1"
                                            >
                                                ${toolInfo.description}
                                            </div>
                                        </div>
                                    </label>
                                `
                            )}
                        </div>
                    </div>
                `
            )}

            <!-- Advanced Settings -->
            <div class="pt-4 border-t border-slate-700">
                <button
                    onClick=${() => setShowAdvanced(!showAdvanced)}
                    class="text-sm text-slate-400 hover:text-slate-300 flex items-center gap-1"
                >
                    ${showAdvanced ? "▼" : "▶"} Advanced Settings
                </button>

                ${showAdvanced &&
                html`
                    <div class="mt-3 space-y-2 text-xs text-slate-400">
                        <div>
                            <label class="flex items-center gap-2">
                                Max tool calls per request:
                                <input
                                    type="number"
                                    value=${config.maxToolCallsPerRequest || 3}
                                    min="1"
                                    max="10"
                                    onChange=${(e) =>
                                        handleToggleSetting(
                                            "maxToolCallsPerRequest",
                                            parseInt(e.target.value)
                                        )}
                                    class="w-12 bg-slate-700 text-white rounded px-2 py-1"
                                />
                            </label>
                        </div>
                    </div>
                `}
            </div>

            <!-- Status -->
            <div class="text-xs text-slate-500 pt-2 border-t border-slate-700">
                Enabled Tools: ${enabledIds.size} /
                ${Object.keys(MCP_TOOL_INFO).length}
            </div>
        </div>
    `;
}
