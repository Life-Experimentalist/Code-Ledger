/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Queue detail modal — shows pending/processing/done/failed AI review queue items.
 * Allows removing items (any status) and opening the problem modal.
 */

import { h } from "../../vendor/preact-bundle.js";
import {
    useState,
    useEffect,
    useCallback,
} from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("QueueModal");

const TABS = [
    { id: "all", label: "All" },
    { id: "pending", label: "Pending" },
    { id: "processing", label: "Processing" },
    { id: "done", label: "Done" },
    { id: "failed", label: "Failed" },
];

const STATUS_STYLES = {
    pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    processing: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    done: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    failed: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

function timeAgo(ts) {
    if (!ts) return "";
    const diff = Date.now() - ts;
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export function QueueModal({ onClose, onOpenProblem }) {
    const [activeTab, setActiveTab] = useState("all");
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [removing, setRemoving] = useState(new Set());
    const [cancellingAll, setCancellingAll] = useState(false);
    const [clearingDone, setClearingDone] = useState(false);

    const isExtension = typeof chrome !== "undefined" && !!chrome.runtime?.id;

    const fetchItems = useCallback(() => {
        if (!isExtension) {
            setLoading(false);
            return;
        }
        chrome.runtime.sendMessage({ type: "GET_QUEUE_ITEMS" }, (resp) => {
            if (chrome.runtime.lastError || !resp?.ok) {
                setLoading(false);
                return;
            }
            setItems(resp.items || []);
            setLoading(false);
        });
    }, [isExtension]);

    useEffect(() => {
        fetchItems();
        const id = setInterval(fetchItems, 5000);
        return () => clearInterval(id);
    }, [fetchItems]);

    const handleRemove = async (itemId) => {
        if (!isExtension) return;
        setRemoving((prev) => new Set([...prev, itemId]));
        chrome.runtime.sendMessage(
            { type: "REMOVE_QUEUE_ITEM", itemId },
            () => {
                setRemoving((prev) => {
                    const n = new Set(prev);
                    n.delete(itemId);
                    return n;
                });
                fetchItems();
            }
        );
    };

    const handleCancelAllPending = () => {
        if (!isExtension || cancellingAll) return;
        setCancellingAll(true);
        chrome.runtime.sendMessage({ type: "CANCEL_AI_REVIEW_QUEUE" }, () => {
            setCancellingAll(false);
            fetchItems();
        });
    };

    const handleClearDone = () => {
        if (!isExtension || clearingDone) return;
        setClearingDone(true);
        // Remove all done items individually
        const doneItems = items.filter((i) => i.status === "done");
        let remaining = doneItems.length;
        if (!remaining) {
            setClearingDone(false);
            return;
        }
        for (const item of doneItems) {
            chrome.runtime.sendMessage(
                { type: "REMOVE_QUEUE_ITEM", itemId: item.id },
                () => {
                    remaining--;
                    if (remaining === 0) {
                        setClearingDone(false);
                        fetchItems();
                    }
                }
            );
        }
    };

    const filtered =
        activeTab === "all"
            ? items
            : items.filter((i) => i.status === activeTab);

    const counts = {
        all: items.length,
        pending: items.filter((i) => i.status === "pending").length,
        processing: items.filter((i) => i.status === "processing").length,
        done: items.filter((i) => i.status === "done").length,
        failed: items.filter((i) => i.status === "failed").length,
    };

    return html`
        <div
            class="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick=${(e) => e.target === e.currentTarget && onClose()}
        >
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
            <div
                class="relative z-10 w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl bg-[#0d0d14] border border-white/10 shadow-2xl overflow-hidden"
            >
                <!-- Header -->
                <div
                    class="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0"
                >
                    <div class="flex items-center gap-3">
                        <span class="text-base font-semibold text-white"
                            >AI Review Queue</span
                        >
                        <span class="text-xs text-slate-500 font-mono"
                            >${counts.all} items</span
                        >
                    </div>
                    <button
                        onClick=${onClose}
                        class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors text-sm"
                    >
                        ✕
                    </button>
                </div>

                <!-- Tabs -->
                <div
                    class="flex items-center gap-1 px-4 py-2 border-b border-white/5 shrink-0 overflow-x-auto"
                >
                    ${TABS.map(
                        (tab) => html`
                            <button
                                key=${tab.id}
                                onClick=${() => setActiveTab(tab.id)}
                                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${activeTab ===
                                tab.id
                                    ? "bg-white/10 text-white"
                                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"}"
                            >
                                ${tab.label}
                                ${counts[tab.id] > 0
                                    ? html`<span
                                          class="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-white/10 text-slate-300"
                                          >${counts[tab.id]}</span
                                      >`
                                    : ""}
                            </button>
                        `
                    )}

                    <!-- Action buttons aligned right -->
                    <div class="ml-auto flex items-center gap-2 shrink-0">
                        ${activeTab === "done" && counts.done > 0
                            ? html`
                                  <button
                                      onClick=${handleClearDone}
                                      disabled=${clearingDone}
                                      class="px-2.5 py-1 rounded-lg text-[11px] bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
                                  >
                                      ${clearingDone
                                          ? "Clearing…"
                                          : "Clear done"}
                                  </button>
                              `
                            : ""}
                        ${(activeTab === "pending" || activeTab === "all") &&
                        counts.pending > 0
                            ? html`
                                  <button
                                      onClick=${handleCancelAllPending}
                                      disabled=${cancellingAll}
                                      class="px-2.5 py-1 rounded-lg text-[11px] bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-40"
                                  >
                                      ${cancellingAll
                                          ? "Cancelling…"
                                          : "Cancel pending"}
                                  </button>
                              `
                            : ""}
                    </div>
                </div>

                <!-- Item list -->
                <div class="flex-1 overflow-y-auto">
                    ${loading
                        ? html`
                              <div
                                  class="flex items-center justify-center py-12 text-slate-500 text-sm"
                              >
                                  Loading…
                              </div>
                          `
                        : filtered.length === 0
                          ? html`
                                <div
                                    class="flex items-center justify-center py-12 text-slate-500 text-sm"
                                >
                                    No ${activeTab === "all" ? "" : activeTab}
                                    items
                                </div>
                            `
                          : html`
                                <div class="divide-y divide-white/5">
                                    ${filtered.map(
                                        (item) => html`
                                            <div
                                                key=${item.id}
                                                class="flex items-start gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors group"
                                            >
                                                <!-- Status badge -->
                                                <span
                                                    class="mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${STATUS_STYLES[
                                                        item.status
                                                    ] || ""}"
                                                >
                                                    ${item.status}
                                                </span>

                                                <!-- Problem info -->
                                                <div class="flex-1 min-w-0">
                                                    <button
                                                        onClick=${() => {
                                                            onClose();
                                                            onOpenProblem &&
                                                                onOpenProblem(
                                                                    item.problemId
                                                                );
                                                        }}
                                                        class="text-sm text-slate-200 hover:text-cyan-300 transition-colors text-left truncate w-full font-medium"
                                                        title=${item.problemTitle}
                                                    >
                                                        ${item.problemTitle}
                                                    </button>
                                                    <div
                                                        class="flex items-center gap-2 mt-0.5"
                                                    >
                                                        ${item.problemPlatform
                                                            ? html`<span
                                                                  class="text-[10px] text-slate-500 capitalize"
                                                                  >${item.problemPlatform}</span
                                                              >`
                                                            : ""}
                                                        ${item.problemDifficulty
                                                            ? html`<span
                                                                  class="text-[10px] ${item.problemDifficulty ===
                                                                  "Easy"
                                                                      ? "text-emerald-500"
                                                                      : item.problemDifficulty ===
                                                                          "Medium"
                                                                        ? "text-amber-500"
                                                                        : "text-rose-500"}"
                                                                  >${item.problemDifficulty}</span
                                                              >`
                                                            : ""}
                                                        <span
                                                            class="text-[10px] text-slate-600"
                                                            >${timeAgo(
                                                                item.updatedAt
                                                            )}</span
                                                        >
                                                        ${item.retryCount > 0
                                                            ? html`<span
                                                                  class="text-[10px] text-slate-600"
                                                                  >${item.retryCount}
                                                                  retr${item.retryCount ===
                                                                  1
                                                                      ? "y"
                                                                      : "ies"}</span
                                                              >`
                                                            : ""}
                                                    </div>
                                                    ${item.error
                                                        ? html`
                                                              <p
                                                                  class="mt-1 text-[11px] text-rose-400 font-mono bg-rose-500/5 border border-rose-500/15 rounded px-2 py-1 break-words"
                                                              >
                                                                  ${item.error}
                                                              </p>
                                                          `
                                                        : ""}
                                                </div>

                                                <!-- Remove button -->
                                                <button
                                                    onClick=${() =>
                                                        handleRemove(item.id)}
                                                    disabled=${removing.has(
                                                        item.id
                                                    )}
                                                    title="Remove from queue"
                                                    class="shrink-0 w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-30 text-xs mt-0.5"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        `
                                    )}
                                </div>
                            `}
                </div>
            </div>
        </div>
    `;
}

