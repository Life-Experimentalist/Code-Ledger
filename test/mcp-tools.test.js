/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Which tools an AI provider would actually be offered.
 *
 * `getAvailableMCPToolsForAI` converts every tool into the shape its provider
 * expects and then filters that list down to the ones the user left enabled.
 * The two steps disagreed: the converter nests the name under `function` for
 * the `openai` and `deepseek` formats, while the filter only looked at
 * `id || name`. Every tool therefore read as `undefined` and both formats
 * resolved to an empty list — a provider would have been told it had no tools
 * at all. Nothing caught it because no provider is wired up to call tools yet,
 * so the empty list was never sent anywhere.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

/** `browser-compat.js` falls back to localStorage when `chrome` is absent. */
const backing = new Map();
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: (k) => backing.delete(k),
};

const { MCP_TOOLS } = await import("../src/core/mcp-tools.js");
const { getAvailableMCPTools } = await import("../src/core/mcp-executor.js");
const { getAvailableMCPToolsForAI, setMCPToolEnabled } = await import("../src/core/mcp-config.js");

const FORMATS = ["generic", "openai", "claude", "gemini", "deepseek"];

beforeEach(() => backing.clear());

describe("MCP tool registry", () => {
  it("gives every tool a unique id, a name and a handler", () => {
    const ids = new Set();
    for (const tool of MCP_TOOLS) {
      assert.ok(tool.id, "a tool with no id can never be executed");
      assert.equal(ids.has(tool.id), false, `duplicate tool id: ${tool.id}`);
      ids.add(tool.id);
      assert.ok(tool.name, `${tool.id} has no display name`);
      assert.equal(typeof tool.handler, "function", `${tool.id} has no handler`);
    }
  });

  it("converts to every provider format without dropping a tool", () => {
    for (const format of FORMATS) {
      assert.equal(
        getAvailableMCPTools(format).length,
        MCP_TOOLS.length,
        `${format} lost tools in conversion`,
      );
    }
  });
});

describe("getAvailableMCPToolsForAI", () => {
  it("returns every tool in every format when all are enabled", async () => {
    for (const format of FORMATS) {
      const tools = await getAvailableMCPToolsForAI(format);
      assert.equal(
        tools.length,
        MCP_TOOLS.length,
        `${format} resolved to ${tools.length} of ${MCP_TOOLS.length} tools`,
      );
    }
  });

  it("drops exactly the tool the user turned off, in every format", async () => {
    await setMCPToolEnabled("query-problems", false);

    for (const format of FORMATS) {
      const tools = await getAvailableMCPToolsForAI(format);
      assert.equal(tools.length, MCP_TOOLS.length - 1, `${format} filtered the wrong number`);
      const names = tools.map((t) => t.id || t.name || t.function?.name);
      assert.equal(names.includes("query-problems"), false, `${format} kept the disabled tool`);
    }
  });
});
