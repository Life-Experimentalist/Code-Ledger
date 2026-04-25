/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAIHandler } from "../../_base/BaseAIHandler.js";
import { APIKeyPool } from "../../../core/api-key-pool.js";
import { Storage } from "../../../core/storage.js";
import { CONSTANTS } from "../../../core/constants.js";

export class OpenRouterHandler extends BaseAIHandler {
  constructor() {
    super("openrouter", "OpenRouter");
    this.keyPool = new APIKeyPool("openrouter");
  }

  async review(code, problemContext) {
    const settings = await Storage.getSettings();
    const model =
      problemContext?.aiModelOverride ||
      settings.openrouter_model ||
      settings.aiModel ||
      CONSTANTS.AI_PROVIDERS.openrouter.defaultModel;
    const endpoint =
      settings.openrouter_endpoint ||
      settings.aiEndpoint ||
      CONSTANTS.AI_PROVIDERS.openrouter.endpoint;

    const prompt = `Review this DSA solution for "${problemContext.title}". Language: ${problemContext.language}, Difficulty: ${problemContext.difficulty}. Code: \`${code}\`. Provide Time/Space complexity, optimizations, and key patterns.`;

    const keyCount = await this.keyPool.getKeyCount();
    if (!keyCount) throw new Error("No OpenRouter API key available.");

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

        if (!res.ok) throw new Error(`OpenRouter API error: ${res.status}`);

        const data = await res.json();
        return data.choices?.[0]?.message?.content || "";
      } catch (err) {
        lastErr = err;
        this.keyPool.markFailed(key);
        this.dbg.warn(
          `OpenRouter key failed, trying next key (${attempt + 1}/${keyCount})`,
        );
      }
    }

    this.dbg.error("OpenRouter review failed", lastErr);
    throw (
      lastErr || new Error("OpenRouter review failed with all available keys.")
    );
  }
}
