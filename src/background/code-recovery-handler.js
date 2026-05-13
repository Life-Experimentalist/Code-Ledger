/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../lib/debug.js";
import { Storage } from "../core/storage.js";
import { tabs, runtime } from "../lib/browser-compat.js";

const dbg = createDebugger("CodeRecovery");

const RECOVERY_TIMEOUT_MS = 30000;

/**
 * Open a hidden LeetCode tab to fetch the latest accepted submission code + tags.
 * Resolves with { ok: true, code, lang, tags, runtime, memory, runtimePct, memoryPct }
 * or { ok: false, error } on failure/timeout.
 *
 * @param {{ id: string, titleSlug: string }} problem
 * @returns {Promise<{ ok: boolean, code?: string, lang?: object, tags?: string[], error?: string }>}
 */
export async function triggerCodeRecovery(problem) {
    const { id: problemId, titleSlug } = problem;
    if (!titleSlug) {
        return { ok: false, error: "Problem has no titleSlug — cannot open recovery tab" };
    }
    if (!problemId) {
        return { ok: false, error: "Problem has no id — cannot match recovery response" };
    }

    const url = `https://leetcode.com/problems/${encodeURIComponent(titleSlug)}/?codeledger_code_fetch=1&codeledger_problemid=${encodeURIComponent(problemId)}`;
    dbg.log(`triggerCodeRecovery(${titleSlug}): opening background tab`);

    return new Promise((resolve) => {
        let tabId = null;
        let settled = false;

        const timeoutHandle = setTimeout(() => {
            if (settled) return;
            settled = true;
            dbg.warn(`triggerCodeRecovery(${titleSlug}): timed out after ${RECOVERY_TIMEOUT_MS}ms`);
            if (tabId != null) {
                tabs.remove?.(tabId)?.catch?.(() => {});
            }
            runtime.onMessage.removeListener?.(listener);
            resolve({ ok: false, error: `Recovery timed out after ${RECOVERY_TIMEOUT_MS / 1000}s` });
        }, RECOVERY_TIMEOUT_MS);

        function listener(msg) {
            if (msg?.type !== "CODELEDGER_CODE_FETCHED") return;
            if (msg.problemId !== problemId) return;
            if (settled) return;
            settled = true;
            clearTimeout(timeoutHandle);
            runtime.onMessage.removeListener?.(listener);
            if (tabId != null) {
                tabs.remove?.(tabId)?.catch?.(() => {});
            }
            if (msg.error) {
                dbg.warn(`triggerCodeRecovery(${titleSlug}): content script error: ${msg.error}`);
                resolve({ ok: false, error: msg.error });
            } else {
                dbg.log(`triggerCodeRecovery(${titleSlug}): ✓ received code (${(msg.code || "").length} chars)`);
                // Save code + tags to storage immediately
                Storage.getProblem(problemId)
                    .then((stored) => {
                        if (!stored) return;
                        const updated = {
                            ...stored,
                            code: msg.code || stored.code,
                            lang: msg.lang || stored.lang,
                            runtime: msg.runtime || stored.runtime,
                            memory: msg.memory || stored.memory,
                            runtimePct: msg.runtimePct ?? stored.runtimePct,
                            memoryPct: msg.memoryPct ?? stored.memoryPct,
                        };
                        if (msg.tags?.length && (!stored.tags || !stored.tags.length)) {
                            updated.tags = msg.tags;
                            updated.topic = msg.tags[0];
                        }
                        return Storage.saveProblem(updated);
                    })
                    .catch((e) => dbg.warn(`triggerCodeRecovery(): save failed:`, e?.message))
                    .finally(() => {
                        resolve({
                            ok: true,
                            code: msg.code,
                            lang: msg.lang,
                            tags: msg.tags || [],
                            runtime: msg.runtime,
                            memory: msg.memory,
                            runtimePct: msg.runtimePct,
                            memoryPct: msg.memoryPct,
                        });
                    });
            }
        }

        runtime.onMessage.addListener(listener);
        tabs.create({ url, active: false })
            .then((tab) => {
                if (settled) {
                    tabs.remove?.(tab.id)?.catch?.(() => {});
                    return;
                }
                tabId = tab.id;
                dbg.log(`triggerCodeRecovery(${titleSlug}): ✓ opened tab ${tabId}`);
            })
            .catch((e) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutHandle);
                runtime.onMessage.removeListener?.(listener);
                dbg.error(`triggerCodeRecovery(${titleSlug}): ✗ tab creation failed:`, e?.message);
                resolve({ ok: false, error: `Tab creation failed: ${e?.message}` });
            });
    });
}
