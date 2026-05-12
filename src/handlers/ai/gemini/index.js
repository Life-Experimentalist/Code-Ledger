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

const dbg = createDebugger("GeminiHandler");

export class GeminiHandler extends BaseAIHandler {
    constructor() {
        super("gemini", "Google Gemini");
        this.keyPool = new APIKeyPool("gemini");
        this.dbg = dbg;
    }

    getSettingsSchema() {
        return {
            id: this.id,
            title: "Google Gemini (AI)",
            order: 2,
            description: "Use Gemini 1.5 Flash for automated code reviews.",
            fields: [
                {
                    key: "gemini_enabled",
                    label: "Enable Gemini",
                    type: "toggle",
                    default: false,
                    description: "Enable Google Gemini for AI code reviews.",
                },
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
                    placeholder:
                        "https://generativelanguage.googleapis.com/v1beta",
                    description: "Custom API base URL.",
                    advanced: true,
                },
                // Note: global model override may be provided in core settings via 'aiModel'.
            ],
        };
    }

    async review(code, problemContext) {
        dbg.log(
            `review(): starting Gemini review for ${problemContext?.titleSlug || "unknown"}`
        );
        const settings = await Storage.getSettings();
        const model =
            problemContext?.aiModelOverride ||
            settings.gemini_model ||
            settings.aiModel ||
            CONSTANTS.AI_PROVIDERS.gemini.defaultModel;
        const endpoint =
            settings.gemini_endpoint ||
            settings.aiEndpoint ||
            CONSTANTS.AI_PROVIDERS.gemini.endpoint;
        dbg.log(`review(): model=${model}, endpoint=${endpoint}`);
        const prompts = await Storage.getAIPrompts();
        const prompt = buildReviewPrompt(problemContext, code, prompts);

        const keyCount = await this.keyPool.getKeyCount();
        dbg.log(`review(): key pool has ${keyCount} key(s)`);
        if (!keyCount) throw new Error("No Gemini API key available.");

        let lastErr = null;
        for (let attempt = 0; attempt < keyCount; attempt++) {
            // eslint-disable-next-line no-await-in-loop
            const key = await this.keyPool.getNextKey();
            if (!key) break;

            try {
                dbg.log(
                    `review(): attempt ${attempt + 1}/${keyCount}, calling Gemini API...`
                );
                const url = `${endpoint}/models/${model}:generateContent?key=${key}`;
                const res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                    }),
                });

                if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);

                const data = await res.json();
                const content =
                    data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                if (!content) {
                    dbg.warn(
                        `review(): empty response at attempt ${attempt + 1}/${keyCount}`
                    );
                    throw new Error("Empty Gemini response");
                }
                dbg.log(
                    `review(): ✓ success (attempt ${attempt + 1}/${keyCount}, ${content.length} chars)`
                );
                return content;
            } catch (err) {
                lastErr = err;
                this.keyPool.markFailed(key);
                dbg.warn(
                    `review(): key failed (${err?.message}), trying next (${attempt + 1}/${keyCount})`
                );
            }
        }

        dbg.error(
            `review(): ✗ all ${keyCount} key(s) exhausted:`,
            lastErr?.message
        );
        throw (
            lastErr ||
            new Error("Gemini review failed with all available keys.")
        );
    }
}
