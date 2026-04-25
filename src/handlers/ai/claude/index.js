/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAIHandler } from "../../_base/BaseAIHandler.js";
import { APIKeyPool } from "../../../core/api-key-pool.js";
import { Storage } from "../../../core/storage.js";
import { CONSTANTS } from "../../../core/constants.js";

export class ClaudeHandler extends BaseAIHandler {
  constructor() {
    super("claude", "Anthropic Claude");
    this.keyPool = new APIKeyPool("claude");
  }

  async review(code, problemContext) {
    const settings = await Storage.getSettings();
    const model =
      problemContext?.aiModelOverride ||
      settings.claude_model ||
      settings.aiModel ||
      CONSTANTS.AI_PROVIDERS.claude.defaultModel;
    const endpoint =
      settings.claude_endpoint ||
      settings.aiEndpoint ||
      CONSTANTS.AI_PROVIDERS.claude.endpoint;

    const prompt = `Review this DSA solution for "${problemContext.title}". Language: ${problemContext.language}, Difficulty: ${problemContext.difficulty}. Code: \`${code}\`. Provide Time/Space complexity, optimizations, and key patterns.`;

    const keyCount = await this.keyPool.getKeyCount();
    if (!keyCount) throw new Error("No Claude API key available.");

    let lastErr = null;
    for (let attempt = 0; attempt < keyCount; attempt++) {
      // eslint-disable-next-line no-await-in-loop
      const key = await this.keyPool.getNextKey();
      if (!key) break;

      try {
        const res = await fetch(`${endpoint}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerously-allow-browser": "true", // Caution: requires bg proxy or this header depending on exact extension env
          },
          body: JSON.stringify({
            model,
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (!res.ok) throw new Error(`Claude API error: ${res.status}`);

        const data = await res.json();
        return data.content?.[0]?.text || "";
      } catch (err) {
        lastErr = err;
        this.keyPool.markFailed(key);
        this.dbg.warn(
          `Claude key failed, trying next key (${attempt + 1}/${keyCount})`,
        );
      }
    }

    this.dbg.error("Claude review failed", lastErr);
    throw lastErr || new Error("Claude review failed with all available keys.");
  }
}
