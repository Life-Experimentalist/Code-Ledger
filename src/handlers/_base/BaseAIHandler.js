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
    // Provider-driven tool calling is not switched on for any provider yet, so
    // this stays false everywhere. Leave it that way until the handler also
    // sends the tool array to its provider's API and feeds the returned calls
    // through processMCPToolCalls(). Flipping the flag alone only prepends a
    // list of tool names to the prompt, which is worse than saying nothing: the
    // model emits tool calls nothing executes and answers from a result it
    // never got. Manual invocation from MCPToolsSidebar works today and does
    // not depend on this. See docs/reference/mcp-tools.md.
    this.supportsMCPTools = false;
    this.mcpToolFormat = "generic"; // Override with provider format: "openai" | "claude" | "gemini" | "deepseek"
    this.rateLimitStats = null;
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
      this.dbg.warn("getAvailableModels failed", e);
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

  getRateLimitStats() {
    return this.rateLimitStats;
  }

  _updateRateLimits(headers) {
    if (!headers) return;
    try {
      // Check OpenAI standard headers
      const reqLimit =
        headers.get("x-ratelimit-limit-requests") || headers.get("x-ratelimit-limit");
      const reqRemaining =
        headers.get("x-ratelimit-remaining-requests") || headers.get("x-ratelimit-remaining");
      const reqReset =
        headers.get("x-ratelimit-reset-requests") || headers.get("x-ratelimit-reset");

      // Check Anthropic standard headers
      const antLimit = headers.get("anthropic-ratelimit-requests-limit");
      const antRemaining = headers.get("anthropic-ratelimit-requests-remaining");
      const antReset = headers.get("anthropic-ratelimit-requests-reset");

      const limit = reqLimit || antLimit;
      const remaining = reqRemaining || antRemaining;
      const reset = reqReset || antReset;

      if (limit !== null && limit !== undefined) {
        this.rateLimitStats = {
          limit: parseInt(limit, 10),
          remaining: parseInt(remaining || "0", 10),
          reset: reset || "",
        };
      }
    } catch (_) {}
  }
}
