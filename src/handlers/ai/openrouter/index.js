/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAIHandler } from "../../_base/BaseAIHandler.js";
import { APIKeyPool } from "../../../core/api-key-pool.js";
import { Storage } from "../../../core/storage.js";
import { CONSTANTS } from "../../../core/constants.js";
import { buildReviewPrompt } from "../../../core/ai-prompts.js";
import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("OpenRouterHandler");

export class OpenRouterHandler extends BaseAIHandler {
    constructor() {
        super("openrouter", "OpenRouter");
        this.keyPool = new APIKeyPool("openrouter");
    }

    getSettingsSchema() {
        return {
            id: this.id,
            title: "OpenRouter (AI)",
            order: 7,
            fields: [
                {
                    key: "openrouter_enabled",
                    label: "Enable OpenRouter",
                    type: "toggle",
                    default: false,
                    description: "Enable OpenRouter for AI code reviews.",
                },
                {
                    key: "openrouter_keys",
                    label: "API Keys",
                    type: "text",
                    default: "",
                    description: "Comma-separated API keys.",
                },
                {
                    key: "openrouter_model",
                    label: "Model",
                    type: "text",
                    default: "",
                    advanced: true,
                    placeholder: "meta-llama/llama-3.1-8b-instruct:free",
                },
                {
                    key: "openrouter_endpoint",
                    label: "Endpoint",
                    type: "text",
                    default: "",
                    advanced: true,
                    placeholder: "https://openrouter.ai/api/v1",
                },
            ],
        };
    }

    async review(code, problemContext) {
        dbg.log(`review(): starting OpenRouter review for ${problemContext?.titleSlug || "unknown"}`);
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
        dbg.log(`review(): model=${model}, endpoint=${endpoint}`);

        const prompts = await Storage.getAIPrompts();
        const prompt = buildReviewPrompt(problemContext, code, prompts);

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
                        "HTTP-Referer": "https://codeledger.vkrishna04.me",
                        "X-Title": "CodeLedger",
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: "user", content: prompt }],
                    }),
                });

                if (!res.ok)
                    throw new Error(`OpenRouter API error: ${res.status}`);

                const data = await res.json();
                return data.choices?.[0]?.message?.content || "";
            } catch (err) {
                lastErr = err;
                this.keyPool.markFailed(key);
                this.dbg.warn(
                    `OpenRouter key failed, trying next key (${attempt + 1}/${keyCount})`
                );
            }
        }

        this.dbg.error("OpenRouter review failed", lastErr);
        throw (
            lastErr ||
            new Error("OpenRouter review failed with all available keys.")
        );
    }
}
