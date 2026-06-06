/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../../lib/debug.js";
import { fetchModelsForProvider } from "../../core/model-fetch.js";
import {
  getAvailableMCPTools,
  processMCPToolCalls,
  executeMCPTool,
  formatToolResultsForAI,
} from "../../core/mcp-executor.js";
import { getAvailableMCPToolsForAI, shouldUseToolsForAI } from "../../core/mcp-config.js";

export class BaseAIHandler {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.dbg = createDebugger(`${name}AIHandler`);
    this.supportsMCPTools = false; // Override in subclass if supported
    this.mcpToolFormat = "generic"; // Override with provider format: "openai" | "claude" | "gemini" | "deepseek"
  }

  async review(code, problemContext) {
    throw new Error("Not implemented");
  }

  /**
   * Build MCP tools context to prepend to prompt.
   * Informs AI which tools are available and enabled.
   */
  async _buildMCPToolsContext() {
    const canUseMCP = await shouldUseToolsForAI("review");
    if (!canUseMCP || !this.supportsMCPTools) return "";

    try {
      const tools = await getAvailableMCPToolsForAI(this.mcpToolFormat);
      if (!tools || tools.length === 0) return "";

      const toolDescriptions = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");

      return `\n\n[AVAILABLE_MCP_TOOLS]\nYou can use these tools to enhance your analysis:\n${toolDescriptions}\n[END_MCP_TOOLS]`;
    } catch (e) {
      this.dbg.warn("Failed to build MCP tools context:", e.message);
      return "";
    }
  }

  /**
   * Multi-turn chat about a problem.
   * Builds a single prompt from context + history and delegates to review().
   * @param {Array<{role: "user"|"assistant", content: string}>} messages
   * @param {{ title?: string, difficulty?: string, code?: string, lang?: {name?: string}, aiReview?: string, aiModelOverride?: string }} [context]
   */
  async chat(messages = [], context = {}) {
    const lines = [];

    if (context.title) {
      lines.push(
        `You are helping with the ${context.difficulty || "coding"} problem "${context.title}".`,
      );
    } else {
      lines.push("You are a helpful coding assistant.");
    }

    if (context.code) {
      const lang = context.lang?.name || "";
      lines.push(`\nSolution (${lang}):\n\`\`\`${lang}\n${context.code}\n\`\`\``);
    }

    if (context.aiReview) {
      lines.push(`\nPrior AI review:\n${context.aiReview}`);
    }

    // Add MCP tools context if available
    const mcpContext = await this._buildMCPToolsContext();
    if (mcpContext) {
      lines.push(mcpContext);
    }

    if (messages.length > 1) {
      lines.push("\n---");
      for (const msg of messages.slice(0, -1)) {
        lines.push(`${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`);
      }
    }

    const last = messages[messages.length - 1];
    if (last) {
      lines.push(`\nUser: ${last.content}\nAssistant:`);
    }

    const prompt = lines.join("\n");
    return this.review(prompt, {
      _rawPrompt: true,
      aiModelOverride: context.aiModelOverride,
    });
  }

  async getAvailableModels() {
    try {
      return await fetchModelsForProvider(this.id);
    } catch (e) {
      this.dbg("getAvailableModels failed", e);
      return [];
    }
  }

  /**
   * Get MCP tools available for this provider.
   * Can be overridden by subclass to filter or customize tools.
   */
  async getSupportedMCPTools() {
    if (!this.supportsMCPTools) return [];
    return getAvailableMCPTools(this.mcpToolFormat);
  }

  /**
   * Execute a tool call made by the provider.
   * @param {string} toolId - Tool ID to execute
   * @param {object} args - Tool arguments
   */
  async executeMCPTool(toolId, args = {}) {
    return executeMCPTool(toolId, args);
  }

  /**
   * Process tool call results for inclusion in next AI prompt.
   * @param {Array} toolCalls - Tool calls from provider response
   */
  async processMCPToolCalls(toolCalls) {
    const results = await processMCPToolCalls(toolCalls, this.mcpToolFormat);
    return formatToolResultsForAI(results);
  }
}
