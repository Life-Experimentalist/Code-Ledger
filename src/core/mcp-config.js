/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * @ts-check
 */

import { Storage } from "./storage.js";
import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("MCPConfig");

/**
 * MCP Configuration: Track enabled/disabled MCP tools and user preferences.
 * Persisted in chrome.storage.local at `mcp.config`.
 */

const DEFAULT_MCP_CONFIG = {
  enabled: {
    "query-problems": true,
    "get-problem-stats": true,
    "get-next-suggestion": true,
    "analyze-code-quality": true,
    "get-trend-analysis": true,
    "find-similar-problems": true,
    "get-user-profile": true,
    remember: true,
    recall: true,
    forget: true,
    "set-roadmap": true,
    "get-roadmap-progress": true,
    "get-chats": true,
    "delete-chat": true,
    "open-problem": true,
  },
  useInChat: true, // Tools offered in chat
  useInReview: true, // Tools offered during AI review
};

/**
 * Initialize MCP config if not present.
 */
export async function initMCPConfig() {
  try {
    const existing = await getMCPConfig();
    if (!existing) {
      await Storage.updateSettings({ "mcp.config": DEFAULT_MCP_CONFIG });
      dbg.log("MCP config initialized with defaults");
    }
  } catch (e) {
    dbg.error("Failed to init MCP config:", e);
  }
}

/**
 * Get full MCP configuration.
 */
export async function getMCPConfig() {
  try {
    const settings = await Storage.getSettings();
    return settings["mcp.config"] || DEFAULT_MCP_CONFIG;
  } catch (e) {
    dbg.warn("Failed to fetch MCP config:", e.message);
    return DEFAULT_MCP_CONFIG;
  }
}

/**
 * Check if a specific MCP tool is enabled.
 */
export async function isMCPToolEnabled(toolId) {
  const config = await getMCPConfig();
  return config.enabled[toolId] !== false;
}

/**
 * Get list of enabled MCP tool IDs.
 */
export async function getEnabledMCPTools() {
  const config = await getMCPConfig();
  return Object.entries(config.enabled || {})
    .filter(([, enabled]) => enabled === true)
    .map(([id]) => id);
}

/**
 * Toggle a MCP tool on/off.
 */
export async function setMCPToolEnabled(toolId, enabled) {
  try {
    const config = await getMCPConfig();
    config.enabled[toolId] = enabled;
    await Storage.updateSettings({ "mcp.config": config });
    dbg.log(`MCP tool ${toolId} set to ${enabled}`);
  } catch (e) {
    dbg.error(`Failed to toggle MCP tool ${toolId}:`, e);
  }
}

/**
 * Update MCP config setting (useInChat, useInReview, etc).
 */
export async function updateMCPConfig(updates) {
  try {
    const config = await getMCPConfig();
    Object.assign(config, updates);
    await Storage.updateSettings({ "mcp.config": config });
    dbg.log("MCP config updated:", updates);
  } catch (e) {
    dbg.error("Failed to update MCP config:", e);
  }
}

/**
 * Read a tool's id out of whichever provider shape it was converted into.
 * The `openai` and `deepseek` formats nest the name under `function`, so a
 * top-level `id || name` lookup reads `undefined` for both of them.
 */
function toolIdOf(tool) {
  return tool?.id || tool?.name || tool?.function?.name;
}

/**
 * Get MCP tool availability info for AI provider.
 * Returns tools that are enabled + provider supports.
 */
export async function getAvailableMCPToolsForAI(providerFormat) {
  const { getAvailableMCPTools } = await import("./mcp-executor.js");
  const enabledIds = await getEnabledMCPTools();

  // Get all tools in provider format
  const allTools = getAvailableMCPTools(providerFormat);

  // Filter to only enabled tools
  return allTools.filter((tool) => enabledIds.includes(toolIdOf(tool)));
}

/**
 * Check if AI should attempt to use MCP tools for a given context.
 */
export async function shouldUseToolsForAI(context) {
  const config = await getMCPConfig();

  if (context === "chat" && !config.useInChat) return false;
  if (context === "review" && !config.useInReview) return false;

  return true;
}

/**
 * Reset MCP config to defaults.
 */
export async function resetMCPConfig() {
  try {
    await Storage.updateSettings({ "mcp.config": DEFAULT_MCP_CONFIG });
    dbg.log("MCP config reset to defaults");
  } catch (e) {
    dbg.error("Failed to reset MCP config:", e);
  }
}
