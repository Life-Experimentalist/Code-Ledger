/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasePlatformHandler } from "../../_base/BasePlatformHandler.js";
import { SELECTORS } from "./dom-selectors.js";
import { detectPage } from "./page-detector.js";
import { registerPlatformPrompt } from "../../../core/ai-prompts.js";
import { Storage } from "../../../core/storage.js";
import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("CodeforcesHandler");

export class CodeforcesHandler extends BasePlatformHandler {
    constructor() {
        super("codeforces", "Codeforces", {});
        this._enableKey = "cf_enable";
        registerPlatformPrompt("codeforces", this.getDefaultPrompt());
    }

    getDefaultPrompt() {
        return `Review this {language} competitive programming solution for '{title}'.

Provide:
1. Time complexity (Big-O) and space complexity
2. Will it pass within typical CP constraints (10^8 ops/s)?
3. Potential TLE or MLE risks?
4. One optimisation if applicable

Be concise. Max 200 words.`;
    }

    getSettingsSchema() {
        return {
            id: this.id,
            title: "Codeforces",
            order: 30,
            fields: [
                {
                    key: "cf_enable",
                    label: "Enable tracking",
                    type: "toggle",
                    default: true,
                    description:
                        "Auto-detect accepted submissions on Codeforces and save them to CodeLedger.",
                },
                {
                    key: "cf_readme",
                    label: "Include problem description",
                    type: "toggle",
                    default: true,
                    description:
                        "Save the problem statement to README.md alongside your solution.",
                },
                {
                    key: "cf_timer",
                    label: "Show solve timer",
                    type: "toggle",
                    default: true,
                    description:
                        "Display a floating stopwatch overlay while solving Codeforces problems.",
                },
            ],
        };
    }

    async init() {
        this.dbg.log("Initializing Codeforces handler");
        const page = detectPage(window.location.pathname);
        await this._handleOnDemandFetch(page).catch(() => {});

        if (page.type === "problem") {
            Storage.getSettings()
                .then((s) => {
                    if (
                        s.cf_timer !== false &&
                        s.floatingTimerEnabled !== false
                    ) {
                        this._timer.startFloating(page.slug || "cf");
                    }
                })
                .catch(() => {});
        }
    }

    async _handleOnDemandFetch(page) {
        const params = new URLSearchParams(window.location.search);
        if (!params.get("codeledger_fetch")) return false;
        if (page.type !== "problem") return false;

        const slug = params.get("cl_fetch_id") || page.slug;
        if (!slug) return false;

        const statementEl = document.querySelector(
            SELECTORS.problem.description
        );
        const titleEl = document.querySelector(SELECTORS.problem.title);
        const titleText = (titleEl?.textContent || "").trim() || slug;
        const statementHtml = statementEl?.innerHTML || null;

        const existing = await Storage.getProblem(String(slug)).catch(
            () => null
        );
        await Storage.saveProblem({
            ...(existing || {}),
            platform: "codeforces",
            id: this.makeProblemId(String(slug)),
            title: existing?.title || titleText,
            titleSlug: slug,
            tags: existing?.tags || [],
            problemStatement:
                statementHtml || existing?.problemStatement || null,
            timestamp: existing?.timestamp || Date.now(),
        }).catch(() => {});

        await new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage(
                    {
                        type: "REFRESH_METADATA_DONE",
                        platform: "codeforces",
                        slug,
                    },
                    () => resolve()
                );
            } catch (_) {
                resolve();
            }
        });

        try {
            window.close();
        } catch (_) {}
        return true;
    }
}
