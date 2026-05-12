/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";
import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("DedupReviewQueue");

export function DedupReviewQueue({ onClose = () => {} }) {
    const [queue, setQueue] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);

    useEffect(() => {
        loadQueue();
    }, []);

    async function loadQueue() {
        try {
            const problems = await Storage.getAllProblems().catch(() => []);
            setQueue(
                (problems || []).filter(
                    (p) => p?.aiMergePending && p?.aiMergeProposedCode
                )
            );
        } catch (e) {
            dbg.error("Failed to load dedup queue:", e);
        } finally {
            setLoading(false);
        }
    }

    async function handleApprove(item) {
        setProcessingId(item.id);
        try {
            const p = await Storage.getProblem(item.id);
            if (!p) return;
            p.code = p.aiMergeProposedCode || p.code || "";
            delete p.aiMergePending;
            delete p.aiMergeOriginalCode;
            delete p.aiMergeProposedCode;
            delete p.aiMergeSources;
            await Storage.saveProblem(p);
            setQueue((q) => q.filter((x) => x.id !== item.id));
        } catch (e) {
            dbg.error("Approve merge failed:", e);
        } finally {
            setProcessingId(null);
        }
    }

    async function handleReject(item) {
        setProcessingId(item.id);
        try {
            const p = await Storage.getProblem(item.id);
            if (!p) return;
            if (p.aiMergeOriginalCode != null) {
                p.code = p.aiMergeOriginalCode;
            }
            delete p.aiMergePending;
            delete p.aiMergeOriginalCode;
            delete p.aiMergeProposedCode;
            delete p.aiMergeSources;
            await Storage.saveProblem(p);
            setQueue((q) => q.filter((x) => x.id !== item.id));
        } catch (e) {
            dbg.error("Reject merge failed:", e);
        } finally {
            setProcessingId(null);
        }
    }

    return html`
        <div class="fixed inset-0 z-50 flex items-center justify-center">
            <div class="absolute inset-0 bg-black/50" onClick=${onClose}></div>
            <div
                class="relative w-full max-w-3xl mx-4 bg-slate-900 p-6 rounded-lg border border-white/10 max-h-96 overflow-auto"
            >
                <div class="flex items-center justify-between gap-4 mb-4">
                    <h3 class="text-lg font-semibold">
                        Deduplication Review Queue
                    </h3>
                    <button
                        onClick=${onClose}
                        class="text-slate-400 hover:text-white"
                    >
                        Close
                    </button>
                </div>

                ${loading
                    ? html`<div class="text-sm text-slate-400">Loading…</div>`
                    : queue.length === 0
                      ? html`<div class="text-sm text-slate-400">
                            No duplicates detected. All solutions look unique!
                        </div>`
                      : html`
                            <div class="space-y-3">
                                ${queue.map(
                                    (item) => html`
                                        <div
                                            class="p-4 bg-white/3 border border-white/5 rounded-lg"
                                        >
                                            <div
                                                class="flex items-start justify-between gap-4"
                                            >
                                                <div>
                                                    <div
                                                        class="font-medium text-sm"
                                                    >
                                                        ${item.title}
                                                    </div>
                                                    <div
                                                        class="text-xs text-slate-400 mt-1"
                                                    >
                                                        AI merge proposal ·
                                                        ${item.lang?.name ||
                                                        item.lang?.slug ||
                                                        item.lang ||
                                                        "unknown language"}
                                                    </div>
                                                    <div
                                                        class="text-xs text-slate-500 mt-2 space-y-1"
                                                    >
                                                        <div>
                                                            Original:
                                                            ${String(
                                                                item.aiMergeOriginalCode ||
                                                                    ""
                                                            ).length}
                                                            chars
                                                        </div>
                                                        <div>
                                                            Proposed:
                                                            ${String(
                                                                item.aiMergeProposedCode ||
                                                                    ""
                                                            ).length}
                                                            chars
                                                        </div>
                                                        <div>
                                                            Sources:
                                                            ${(
                                                                item.aiMergeSources ||
                                                                []
                                                            ).join(", ") ||
                                                            "n/a"}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="flex gap-2">
                                                    <button
                                                        onClick=${() =>
                                                            handleApprove(item)}
                                                        disabled=${processingId ===
                                                        item.id}
                                                        class="px-3 py-1 bg-emerald-600/20 border border-emerald-500/30 text-emerald-200 text-xs rounded"
                                                    >
                                                        ${processingId ===
                                                        item.id
                                                            ? "Applying…"
                                                            : "Approve"}
                                                    </button>
                                                    <button
                                                        onClick=${() =>
                                                            handleReject(item)}
                                                        disabled=${processingId ===
                                                        item.id}
                                                        class="px-3 py-1 bg-white/5 border border-white/10 text-slate-300 text-xs rounded"
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    `
                                )}
                            </div>
                        `}
            </div>
        </div>
    `;
}
