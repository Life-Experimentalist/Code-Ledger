/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    h,
    useState,
    useEffect,
    useRef,
    useCallback,
} from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";
import { createDebugger } from "../../lib/debug.js";
import { runtime } from "../../lib/browser-compat.js";
import { normalizeCode } from "../../core/duplicate-detector.js";

const dbg = createDebugger("DedupReviewQueue");

const COUNTDOWN_SECONDS = 12;

function getProblemCommitKey(p) {
    if (!p?.titleSlug || !p?.lang?.slug) return null;
    return `${p.titleSlug}::${p.lang.slug}`;
}

function fmtDate(ts) {
    if (!ts) return "unknown";
    return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function CodeBlock({ code, label, meta }) {
    return html`
        <div class="flex-1 min-w-0">
            <div class="text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1">${label}</div>
            ${meta && html`<div class="text-[10px] text-slate-500 mb-1">${meta}</div>`}
            <pre class="bg-black/30 border border-white/5 rounded-lg p-3 text-[11px] text-slate-300 overflow-auto max-h-48 whitespace-pre-wrap break-all">${code || "(no code)"}</pre>
        </div>
    `;
}

function ConflictItem({ item, candidate, onResolved }) {
    const [seconds, setSeconds] = useState(COUNTDOWN_SECONDS);
    const [resolving, setResolving] = useState(false);
    const timerRef = useRef(null);
    const cancelledRef = useRef(false);

    // Check at mount whether codes are actually identical (normalized).
    // If so, skip the full conflict UI: show 3s notice then auto-merge.
    const codesAreIdentical = normalizeCode(item.code) === normalizeCode(candidate.code);
    const [identicalCountdown, setIdenticalCountdown] = useState(codesAreIdentical ? 3 : null);

    const cancelTimer = useCallback(() => {
        cancelledRef.current = true;
        if (timerRef.current) clearInterval(timerRef.current);
    }, []);

    // Keep oldest (primary wins)
    const resolveKeepPrimary = useCallback(async () => {
        cancelTimer();
        setResolving(true);
        try {
            const primary = await Storage.getProblem(item.id);
            if (!primary) return;
            const updated = { ...primary, conflictPending: false };
            delete updated.conflictCandidates;
            await Storage.saveProblem(updated);
            if (candidate.id) {
                const dup = await Storage.getProblem(candidate.id).catch(() => null);
                if (dup) {
                    await Storage.saveProblem({ ...dup, isDuplicate: true, duplicateOf: primary.id }).catch(() => {});
                }
            }
            dbg.log(`resolveKeepPrimary(): resolved ${primary.titleSlug}`);
            onResolved(item.id);
        } catch (e) {
            dbg.error("resolveKeepPrimary failed:", e);
            setResolving(false);
        }
    }, [item, candidate, cancelTimer, onResolved]);

    // Overwrite with candidate (newest wins)
    const resolveKeepCandidate = useCallback(async () => {
        cancelTimer();
        setResolving(true);
        try {
            const primary = await Storage.getProblem(item.id);
            if (!primary) return;
            const updated = {
                ...primary,
                code: candidate.code,
                lang: candidate.lang,
                runtime: candidate.runtime,
                memory: candidate.memory,
                runtimePct: candidate.runtimePct,
                memoryPct: candidate.memoryPct,
                conflictPending: false,
            };
            delete updated.conflictCandidates;
            await Storage.saveProblem(updated);
            if (candidate.id) {
                const dup = await Storage.getProblem(candidate.id).catch(() => null);
                if (dup) {
                    await Storage.saveProblem({ ...dup, isDuplicate: true, duplicateOf: primary.id }).catch(() => {});
                }
            }
            dbg.log(`resolveKeepCandidate(): resolved ${primary.titleSlug}`);
            onResolved(item.id);
        } catch (e) {
            dbg.error("resolveKeepCandidate failed:", e);
            setResolving(false);
        }
    }, [item, candidate, cancelTimer, onResolved]);

    // Store both as Methods on primary
    const resolveBothAsMethods = useCallback(async () => {
        cancelTimer();
        setResolving(true);
        try {
            const primary = await Storage.getProblem(item.id);
            if (!primary) return;
            const newMethod = {
                title: `Alt approach (${candidate.lang?.name || "unknown"}) — imported`,
                language: candidate.lang?.name || "unknown",
                code: candidate.code,
                description: `Submission #${candidate.submissionId || "?"}`,
                timestamp: candidate.timestamp || Date.now(),
            };
            const updated = {
                ...primary,
                methods: [...(primary.methods || []), newMethod],
                conflictPending: false,
            };
            delete updated.conflictCandidates;
            await Storage.saveProblem(updated);
            if (candidate.id) {
                const dup = await Storage.getProblem(candidate.id).catch(() => null);
                if (dup) {
                    await Storage.saveProblem({ ...dup, isDuplicate: true, duplicateOf: primary.id }).catch(() => {});
                }
            }
            dbg.log(`resolveBothAsMethods(): resolved ${primary.titleSlug}`);
            onResolved(item.id);
        } catch (e) {
            dbg.error("resolveBothAsMethods failed:", e);
            setResolving(false);
        }
    }, [item, candidate, cancelTimer, onResolved]);

    // AI auto-resolve
    const resolveWithAI = useCallback(async () => {
        cancelTimer();
        setResolving(true);
        try {
            const result = await new Promise((resolve) => {
                runtime.sendMessage({
                    type: "AI_COMPARE_SOLUTIONS",
                    primary: { code: item.code, lang: item.lang?.name },
                    candidate: { code: candidate.code, lang: candidate.lang?.name },
                }, (r) => resolve(r || {}));
            });
            if (result?.same) {
                await resolveKeepPrimary();
            } else {
                await resolveBothAsMethods();
            }
        } catch (e) {
            dbg.warn(`resolveWithAI(): AI compare failed, defaulting to keep oldest:`, e?.message);
            await resolveKeepPrimary();
        }
    }, [item, candidate, cancelTimer, resolveKeepPrimary, resolveBothAsMethods]);

    // Identical code fast-path: 3s countdown then auto-merge
    useEffect(() => {
        if (!codesAreIdentical) return;
        const id = setInterval(() => {
            setIdenticalCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(id);
                    if (!cancelledRef.current && !resolving) {
                        resolveKeepPrimary();
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // If codes are identical show a short notice and skip the rest of the UI
    if (codesAreIdentical) {
        return html`
            <div class="p-4 bg-emerald-900/20 border border-emerald-500/20 rounded-xl flex items-center gap-3 flex-wrap">
                <span class="text-emerald-400 text-sm">✓ Identical code detected</span>
                <span class="text-slate-400 text-xs">${item.title || item.titleSlug} · ${item.lang?.name}</span>
                <span class="ml-auto text-xs text-slate-500">Auto-merging in ${identicalCountdown}s…</span>
            </div>
        `;
    }

    // Start per-item AI countdown for genuinely different codes
    useEffect(() => {
        timerRef.current = setInterval(() => {
            setSeconds((prev) => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    if (!cancelledRef.current && !resolving) {
                        resolveWithAI();
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const progress = Math.round((seconds / COUNTDOWN_SECONDS) * 100);

    return html`
        <div class="p-4 bg-white/3 border border-white/8 rounded-xl space-y-3">
            <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-medium text-white">${item.title || item.titleSlug}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                    ${item.lang?.name || "unknown"}
                </span>
                ${item.difficulty && html`
                    <span class="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-400">
                        ${item.difficulty}
                    </span>
                `}
            </div>

            <div class="flex gap-3">
                <${CodeBlock}
                    code=${item.code}
                    label="Primary (oldest · ${fmtDate(item.timestamp)})"
                    meta=${item.runtime ? `${item.runtime} · ${item.memory}` : null}
                />
                <${CodeBlock}
                    code=${candidate.code}
                    label="Candidate (${fmtDate(candidate.timestamp)})"
                    meta=${candidate.runtime ? `${candidate.runtime} · ${candidate.memory}` : null}
                />
            </div>

            <div class="flex items-center gap-3 flex-wrap">
                <button
                    onClick=${() => { cancelTimer(); resolveKeepPrimary(); }}
                    disabled=${resolving}
                    class="px-3 py-1.5 text-xs rounded-lg bg-emerald-600/15 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-600/30 disabled:opacity-40 transition-colors"
                >
                    Keep oldest
                </button>
                <button
                    onClick=${() => { cancelTimer(); resolveKeepCandidate(); }}
                    disabled=${resolving}
                    class="px-3 py-1.5 text-xs rounded-lg bg-sky-600/15 border border-sky-500/30 text-sky-200 hover:bg-sky-600/30 disabled:opacity-40 transition-colors"
                >
                    Keep newest
                </button>
                <button
                    onClick=${() => { cancelTimer(); resolveBothAsMethods(); }}
                    disabled=${resolving}
                    class="px-3 py-1.5 text-xs rounded-lg bg-violet-600/15 border border-violet-500/30 text-violet-200 hover:bg-violet-600/30 disabled:opacity-40 transition-colors"
                >
                    Both as Methods
                </button>

                ${resolving
                    ? html`<span class="ml-auto text-xs text-slate-400">Resolving…</span>`
                    : seconds > 0
                    ? html`
                        <span class="ml-auto flex items-center gap-2 text-xs text-slate-400">
                            AI decides in
                            <span class="relative w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <span
                                    class="absolute inset-y-0 left-0 bg-amber-400 rounded-full transition-all"
                                    style="width: ${progress}%"
                                ></span>
                            </span>
                            ${seconds}s
                        </span>
                    `
                    : html`<span class="ml-auto text-xs text-slate-400">AI resolving…</span>`
                }
            </div>
        </div>
    `;
}

export function DedupReviewQueue({ onClose = () => {} }) {
    const [queue, setQueue] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadQueue();
    }, []);

    async function loadQueue() {
        try {
            const problems = await Storage.getAllProblems().catch(() => []);
            // Show new conflictPending items AND legacy aiMergePending items
            const items = (problems || []).filter(
                (p) => p?.conflictPending === true || p?.aiMergePending === true
            );
            setQueue(items);
        } catch (e) {
            dbg.error("Failed to load dedup queue:", e);
        } finally {
            setLoading(false);
        }
    }

    const handleResolved = useCallback((itemId) => {
        setQueue((q) => q.filter((x) => x.id !== itemId));
    }, []);

    // Legacy aiMergePending handlers (backward compat)
    async function handleLegacyApprove(item) {
        const p = await Storage.getProblem(item.id).catch(() => null);
        if (!p) return;
        p.code = p.aiMergeProposedCode || p.code;
        delete p.aiMergePending;
        delete p.aiMergeOriginalCode;
        delete p.aiMergeProposedCode;
        delete p.aiMergeSources;
        await Storage.saveProblem(p).catch(() => {});
        setQueue((q) => q.filter((x) => x.id !== item.id));
    }

    async function handleLegacyReject(item) {
        const p = await Storage.getProblem(item.id).catch(() => null);
        if (!p) return;
        if (p.aiMergeOriginalCode != null) p.code = p.aiMergeOriginalCode;
        delete p.aiMergePending;
        delete p.aiMergeOriginalCode;
        delete p.aiMergeProposedCode;
        delete p.aiMergeSources;
        await Storage.saveProblem(p).catch(() => {});
        setQueue((q) => q.filter((x) => x.id !== item.id));
    }

    return html`
        <div class="fixed inset-0 z-50 flex items-center justify-center">
            <div class="absolute inset-0 bg-black/60" onClick=${onClose}></div>
            <div class="relative w-full max-w-4xl mx-4 bg-slate-900 rounded-xl border border-white/10 flex flex-col max-h-[85vh]">
                <div class="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/8">
                    <div>
                        <h3 class="text-base font-semibold text-white">Conflict Review</h3>
                        <p class="text-xs text-slate-500 mt-0.5">
                            ${queue.length === 0 ? "No conflicts" : `${queue.length} conflict${queue.length === 1 ? "" : "s"} — AI auto-resolves in ${COUNTDOWN_SECONDS}s per item if you don't act`}
                        </p>
                    </div>
                    <button onClick=${onClose} class="text-slate-400 hover:text-white text-xl leading-none">✕</button>
                </div>

                <div class="overflow-y-auto flex-1 p-6 space-y-4">
                    ${loading
                        ? html`<div class="text-sm text-slate-400">Loading…</div>`
                        : queue.length === 0
                        ? html`<div class="text-sm text-slate-400">No conflicts — all duplicates are resolved.</div>`
                        : queue.map((item) => {
                            // New conflict format
                            if (item.conflictPending && item.conflictCandidates?.length) {
                                return item.conflictCandidates.map((candidate) => html`
                                    <${ConflictItem}
                                        key="${item.id}::${candidate.id}"
                                        item=${item}
                                        candidate=${candidate}
                                        onResolved=${handleResolved}
                                    />
                                `);
                            }
                            // Legacy aiMergePending format
                            return html`
                                <div key=${item.id} class="p-4 bg-white/3 border border-white/8 rounded-xl space-y-2">
                                    <div class="text-sm font-medium text-white">${item.title}</div>
                                    <div class="text-xs text-slate-400">AI merge proposal · ${item.lang?.name || "unknown"}</div>
                                    <div class="text-xs text-slate-500 space-y-1">
                                        <div>Original: ${String(item.aiMergeOriginalCode || "").length} chars</div>
                                        <div>Proposed: ${String(item.aiMergeProposedCode || "").length} chars</div>
                                    </div>
                                    <div class="flex gap-2">
                                        <button onClick=${() => handleLegacyApprove(item)} class="px-3 py-1 bg-emerald-600/20 border border-emerald-500/30 text-emerald-200 text-xs rounded">Approve</button>
                                        <button onClick=${() => handleLegacyReject(item)} class="px-3 py-1 bg-white/5 border border-white/10 text-slate-300 text-xs rounded">Reject</button>
                                    </div>
                                </div>
                            `;
                        })
                    }
                </div>
            </div>
        </div>
    `;
}
