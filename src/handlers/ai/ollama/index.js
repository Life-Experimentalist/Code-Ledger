/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAIHandler } from "../../_base/BaseAIHandler.js";
import { Storage } from "../../../core/storage.js";
import { CONSTANTS } from "../../../core/constants.js";

export class OllamaHandler extends BaseAIHandler {
  constructor() {
    super("ollama", "Ollama (Local)");
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
          default: true,
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
    const endpoint =
      settings.ollama_endpoint || CONSTANTS.AI_PROVIDERS.ollama.endpoint;

    const prompt = `Review this DSA solution for "${problemContext.title}". Language: ${problemContext.language}, Difficulty: ${problemContext.difficulty}. Code: \`${code}\`. Provide Time/Space complexity, optimizations, and key patterns.`;

    try {
      const res = await fetch(`${endpoint}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
        }),
      });

      if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);

      const data = await res.json();
      return data.response;
    } catch (err) {
      this.dbg.error("Ollama review failed", err);
      throw err;
    }
  }
}
