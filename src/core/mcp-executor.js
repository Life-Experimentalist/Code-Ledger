/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MCP Tool Executor: Handles tool invocation and result processing.
 * Modal-agnostic execution layer for any AI provider to use.
 */

import { MCP_TOOLS } from "./mcp-tools.js";
import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("MCPExecutor");

/**
 * Execute an MCP tool by ID with provided arguments.
 * Returns structured result or error.
 */
export async function executeMCPTool(toolId, args = {}) {
  try {
    const tool = MCP_TOOLS.find((t) => t.id === toolId);
    if (!tool) {
      return { ok: false, error: `Tool not found: ${toolId}` };
    }

    dbg.log(`Executing tool: ${toolId}`, args);

    const result = await tool.handler(args);
    dbg.log(`Tool result: ${toolId}`, result);
    return result;
  } catch (e) {
    dbg.error(`Tool execution failed: ${toolId}`, e?.message || e);
    return { ok: false, error: `Tool execution failed: ${String(e)}` };
  }
}

/**
 * Get all available MCP tools as provider-ready schema.
 * Returns array of tool definitions formatted for the provider's expected format.
 */
export function getAvailableMCPTools(format = "generic") {
  dbg.log(`getAvailableMCPTools(): format=${format}`);
  // Generic format: returns tool definitions as-is
  if (format === "generic") {
    return MCP_TOOLS.map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  // OpenAI format: returns tools in function calling format
  if (format === "openai") {
    return MCP_TOOLS.map((tool) => ({
      type: "function",
      function: {
        name: tool.id,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  // Anthropic Claude format
  if (format === "claude") {
    return MCP_TOOLS.map((tool) => ({
      name: tool.id,
      description: tool.description,
      input_schema: {
        type: "object",
        properties: tool.parameters.properties || {},
        required: tool.parameters.required || [],
      },
    }));
  }

  // Google Gemini format (uses tool declarations)
  if (format === "gemini") {
    return MCP_TOOLS.map((tool) => ({
      name: tool.id,
      description: tool.description,
      parameters: {
        type: "OBJECT",
        properties: Object.entries(tool.parameters.properties || {}).reduce((acc, [key, value]) => {
          acc[key] = {
            type: (value.type || "string").toUpperCase(),
            description: value.description || "",
            enum: value.enum,
          };
          return acc;
        }, {}),
        required: tool.parameters.required || [],
      },
    }));
  }

  // DeepSeek format
  if (format === "deepseek") {
    return MCP_TOOLS.map((tool) => ({
      type: "function",
      function: {
        name: tool.id,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  return MCP_TOOLS;
}

/**
 * Process provider tool calls and return formatted results.
 * Each provider returns tool calls differently; this normalizes and executes them.
 */
export async function processMCPToolCalls(toolCalls, format = "generic") {
  if (!toolCalls || toolCalls.length === 0) {
    dbg.log(`processMCPToolCalls(): no tool calls`);
    return [];
  }
  dbg.log(`processMCPToolCalls(): processing ${toolCalls.length} calls (format=${format})`);
  const results = [];

  for (const call of toolCalls) {
    let toolId, args;

    // Parse tool call based on provider format
    if (format === "openai") {
      // OpenAI: call.function = { name, arguments (JSON string) }
      toolId = call.function?.name;
      args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
    } else if (format === "claude") {
      // Claude: call.name, call.input
      toolId = call.name;
      args = call.input || {};
    } else if (format === "gemini") {
      // Gemini: call.name, call.args
      toolId = call.name;
      args = call.args || {};
    } else if (format === "deepseek") {
      // DeepSeek: same as OpenAI
      toolId = call.function?.name;
      args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
    } else {
      // Generic: toolId and args direct
      toolId = call.toolId || call.id;
      args = call.args || call.arguments || {};
    }

    const result = await executeMCPTool(toolId, args);

    results.push({
      toolId,
      args,
      result,
    });
  }

  dbg.log(`processMCPToolCalls(): ✓ processed ${results.length} tool calls`);
  return results;
}

/**
 * Format MCP tool results into a string for inclusion in AI chat.
 * This is injected into the next AI message for context.
 */
export function formatToolResultsForAI(toolResults) {
  if (!toolResults || toolResults.length === 0) {
    return "";
  }

  let formatted = "\n\n**Tool Results:**\n\n";

  for (const { toolId, result } of toolResults) {
    const tool = MCP_TOOLS.find((t) => t.id === toolId);
    const toolName = tool?.name || toolId;

    if (result.ok) {
      formatted += `**${toolName}:**\n`;
      formatted += "```json\n";
      formatted += JSON.stringify(result, null, 2);
      formatted += "\n```\n\n";
    } else {
      formatted += `**${toolName}:** Error - ${result.error}\n\n`;
    }
  }

  return formatted;
}
