/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAIHandler } from "../../_base/BaseAIHandler.js";
import { APIKeyPool } from "../../../core/api-key-pool.js";
import { Storage } from "../../../core/storage.js";
import { CONSTANTS } from "../../../core/constants.js";

export class GeminiHandler extends BaseAIHandler {
  constructor() {
    super("gemini", "Google Gemini");
    this.keyPool = new APIKeyPool("gemini");
  }

  getSettingsSchema() {
    return {
      id: this.id,
      title: "Google Gemini (AI)",
      order: 2,
      description: "Use Gemini 1.5 Flash for automated code reviews.",
      fields: [
        {
          key: "gemini_keys",
          label: "API Keys",
          type: "text",
          default: "",
          description:
            "Comma separated list of API keys for rate-limit pooling.",
        },
        {
          key: "gemini_endpoint",
          label: "Endpoint",
          type: "text",
          default: "",
          placeholder: "https://generativelanguage.googleapis.com/v1beta",
          description: "Custom API base URL.",
          advanced: true,
        },
        // Note: global model override may be provided in core settings via 'aiModel'.
      ],
    };
  }

  async review(code, problemContext) {
    const key = await this.keyPool.getNextKey();
    if (!key) throw new Error("No Gemini API key available.");

    const settings = await Storage.getSettings();
    // Prefer per-provider model, then a global model override (`aiModel`), then provider-specific default.
    const model =
      settings.gemini_model ||
      settings.aiModel ||
      CONSTANTS.AI_PROVIDERS.gemini.defaultModel;
    const endpoint =
      settings.gemini_endpoint ||
      settings.aiEndpoint ||
      CONSTANTS.AI_PROVIDERS.gemini.endpoint;

    const prompt = `
      Review the following DSA solution for the problem: "${problemContext.title}".
      Language: ${problemContext.language || problemContext.lang?.name || "Unknown"}
      Difficulty: ${problemContext.difficulty}

      Code:
      \`\`\`
      ${code}
      \`\`\`

      Please provide a brief, professional analysis:
      1. Time & Space Complexity (using Big-O notation).
      2. Potential optimizations or cleaner approaches.
      3. Key take-away patterns.
    `;

    try {
      const url = `${endpoint}/models/${model}:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      if (!res.ok) {
        if (res.status === 429) this.keyPool.markFailed(key);
        throw new Error(`Gemini API error: ${res.status}`);
      }

      const data = await res.json();
      return data.candidates[0].content.parts[0].text;
    } catch (err) {
      this.dbg.error("Gemini review failed", err);
      throw err;
    }
  }
}
