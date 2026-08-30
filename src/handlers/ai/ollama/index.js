/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAIHandler } from "../../_base/BaseAIHandler.js";
import { Storage } from "../../../core/storage.js";
import { CONSTANTS } from "../../../core/constants.js";
import { buildReviewPrompt } from "../../../core/ai-prompts.js";
import { resolveEndpoint } from "../../../core/ai-endpoint.js";
import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("OllamaHandler");

export class OllamaHandler extends BaseAIHandler {
  constructor() {
    super("ollama", "Ollama (Local)");
    this.dbg = dbg;
  }

  getSettingsSchema() {
    return {
      id: this.id,
      title: "Ollama (Local Backup)",
      order: 3,
      description: "Configure local Ollama instance as backup for AI reviews.",
      fields: [
        {
          key: "ollama_enabled",
          label: "Enable Ollama",
          type: "toggle",
          default: false,
          description: "Enable using the local Ollama instance for AI reviews.",
        },
        {
          key: "ollama_endpoint",
          label: "Endpoint",
          type: "text",
          default: "http://localhost:11434/api",
          placeholder: "http://localhost:11434/api",
          description: "The endpoint for your local Ollama instance.",
          advanced: true,
        },
        {
          key: "ollama_model",
          label: "Model Name",
          type: "text",
          default: "llama3.2",
          placeholder: "llama3.2",
          description: "The model to use for AI reviews.",
        },
      ],
    };
  }

  async review(code, problemContext) {
    const settings = await Storage.getSettings();
    const model =
      problemContext?.aiModelOverride ||
      settings.ollama_model ||
      CONSTANTS.AI_PROVIDERS.ollama.defaultModel;
    const endpoint = resolveEndpoint("ollama", settings);

    const prompts = await Storage.getAIPrompts();
    const prompt = buildReviewPrompt(problemContext, code, prompts);

    try {
      const res = await fetch(`${endpoint}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
        }),
        // Local models generate slowly — give them longer than cloud providers.
        signal: AbortSignal.timeout(120_000),
      });

      if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);

      const data = await res.json();
      if (!data.response) throw new Error("Empty Ollama response");
      return data.response;
    } catch (err) {
      this.dbg.error("Ollama review failed", err);
      throw err;
    }
  }
}
