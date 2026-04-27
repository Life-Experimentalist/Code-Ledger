/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAIHandler } from "../../_base/BaseAIHandler.js";
import { APIKeyPool } from "../../../core/api-key-pool.js";
import { Storage } from "../../../core/storage.js";
import { CONSTANTS } from "../../../core/constants.js";
import { buildReviewPrompt } from "../../../core/ai-prompts.js";

export class DeepSeekHandler extends BaseAIHandler {
  constructor() {
    super("deepseek", "DeepSeek");
    this.keyPool = new APIKeyPool("deepseek");
  }

  async review(code, problemContext) {
    const settings = await Storage.getSettings();
    const model =
      problemContext?.aiModelOverride ||
      settings.deepseek_model ||
      settings.aiModel ||
      CONSTANTS.AI_PROVIDERS.deepseek.defaultModel;

    const prompts = await Storage.getAIPrompts();
    const prompt = buildReviewPrompt(problemContext, code, prompts);

    const endpoint =
      settings.deepseek_endpoint ||
      settings.aiEndpoint ||
      CONSTANTS.AI_PROVIDERS.deepseek.endpoint;

    const keyCount = await this.keyPool.getKeyCount();
    if (!keyCount) throw new Error("No DeepSeek API key available.");

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

        if (!res.ok) throw new Error(`DeepSeek API error: ${res.status}`);

        const data = await res.json();
        return data.choices?.[0]?.message?.content || "";
      } catch (err) {
        lastErr = err;
        this.keyPool.markFailed(key);
        this.dbg.warn(
          `DeepSeek key failed, trying next key (${attempt + 1}/${keyCount})`,
        );
      }
    }

    this.dbg.error("DeepSeek review failed", lastErr);
    throw (
      lastErr || new Error("DeepSeek review failed with all available keys.")
    );
  }
}
