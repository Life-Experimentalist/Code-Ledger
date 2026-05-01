/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAIHandler } from "../../_base/BaseAIHandler.js";
import { APIKeyPool } from "../../../core/api-key-pool.js";
import { Storage } from "../../../core/storage.js";
import { CONSTANTS } from "../../../core/constants.js";
import { buildReviewPrompt } from "../../../core/ai-prompts.js";

export class OpenAIHandler extends BaseAIHandler {
  constructor() {
    super("openai", "OpenAI");
    this.keyPool = new APIKeyPool("openai");
  }

  getSettingsSchema() {
    return {
      id: this.id,
      title: "OpenAI (AI)",
      order: 4,
      fields: [
        { key: "openai_enabled", label: "Enable OpenAI", type: "toggle", default: false,
          description: "Enable OpenAI (GPT) for AI code reviews." },
        { key: "openai_keys", label: "API Keys", type: "text", default: "",
          description: "Comma-separated API keys for rate-limit pooling." },
        { key: "openai_model", label: "Model", type: "text", default: "", advanced: true,
          placeholder: "gpt-4o" },
        { key: "openai_endpoint", label: "Endpoint", type: "text", default: "", advanced: true,
          placeholder: "https://api.openai.com/v1" },
      ],
    };
  }

  async review(code, problemContext) {
    const settings = await Storage.getSettings();
    const model =
      problemContext?.aiModelOverride ||
      settings.openai_model ||
      settings.aiModel ||
      CONSTANTS.AI_PROVIDERS.openai.defaultModel;
    const endpoint =
      settings.openai_endpoint ||
      settings.aiEndpoint ||
      CONSTANTS.AI_PROVIDERS.openai.endpoint;

    const prompts = await Storage.getAIPrompts();
    const prompt = buildReviewPrompt(problemContext, code, prompts);

    const keyCount = await this.keyPool.getKeyCount();
    if (!keyCount) throw new Error("No OpenAI API key available.");

    let lastErr = null;
    for (let attempt = 0; attempt < keyCount; attempt++) {
      // eslint-disable-next-line no-await-in-loop
      const key = await this.keyPool.getNextKey();
      if (!key) break;

      try {
        const res = await fetch(`${endpoint}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);

        const data = await res.json();
        return data.choices?.[0]?.message?.content || "";
      } catch (err) {
        lastErr = err;
        this.keyPool.markFailed(key);
        this.dbg.warn(
          `OpenAI key failed, trying next key (${attempt + 1}/${keyCount})`,
        );
      }
    }

    this.dbg.error("OpenAI review failed", lastErr);
    throw lastErr || new Error("OpenAI review failed with all available keys.");
  }
}
