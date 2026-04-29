/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../../lib/debug.js";
import { fetchModelsForProvider } from "../../core/model-fetch.js";

export class BaseAIHandler {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.dbg = createDebugger(`${name}AIHandler`);
  }

  async review(code, problemContext) {
    throw new Error("Not implemented");
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
      lines.push(`You are helping with the ${context.difficulty || "coding"} problem "${context.title}".`);
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
    return this.review(prompt, { _rawPrompt: true, aiModelOverride: context.aiModelOverride });
  }

  async getAvailableModels() {
    try {
      return await fetchModelsForProvider(this.id);
    } catch (e) {
      this.dbg("getAvailableModels failed", e);
      return [];
    }
  }
}
