/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAIHandler } from "../../_base/BaseAIHandler.js";
import { APIKeyPool } from "../../../core/api-key-pool.js";
import { Storage } from "../../../core/storage.js";
import { CONSTANTS } from "../../../core/constants.js";

export class OpenAIHandler extends BaseAIHandler {
  constructor() {
    super("openai", "OpenAI");
    this.keyPool = new APIKeyPool("openai");
  }

  async review(code, problemContext) {
    const key = await this.keyPool.getNextKey();
    if (!key) throw new Error("No OpenAI API key available.");

    const settings = await Storage.getSettings();
    const model =
      settings.openai_model ||
      settings.aiModel ||
      CONSTANTS.AI_PROVIDERS.openai.defaultModel;
    const endpoint =
      settings.openai_endpoint ||
      settings.aiEndpoint ||
      CONSTANTS.AI_PROVIDERS.openai.endpoint;

    const prompt = `Review this DSA solution for "${problemContext.title}". Language: ${problemContext.language}, Difficulty: ${problemContext.difficulty}. Code: \`${code}\`. Provide Time/Space complexity, optimizations, and key patterns.`;

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

      if (!res.ok) {
        if (res.status === 429) this.keyPool.markFailed(key);
        throw new Error(`OpenAI API error: ${res.status}`);
      }

      const data = await res.json();
      return data.choices[0].message.content;
    } catch (err) {
      this.dbg.error("OpenAI review failed", err);
      throw err;
    }
  }
}
