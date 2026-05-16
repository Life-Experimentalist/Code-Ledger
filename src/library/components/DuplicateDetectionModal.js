/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Duplicate Detection & Intelligent Merge Modal
 *
 * Uses the same conflict-intelligence as ConflictResolutionModal:
 *   same-code     → 10s countdown, auto-keeps the "better" metadata version
 *   diff-approach → side-by-side syntax-highlighted code, manual pick required
 */

import { h, useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
import { highlightCode } from "../../lib/syntax-highlight.js";
import { normalizeCode } from "../../core/ai-deduplication.js";
import { Storage } from "../../core/storage.js";
import { createDebugger } from "../../lib/debug.js";
import { CONSTANTS } from "../../core/constants.js";

const html = htm.bind(h);
const dbg = createDebugger("DuplicateDetectionModal");

// ── Exported helpers ──────────────────────────────────────────────────────────

function computeHash(problem) {
    const title = (problem.title || "").toLowerCase().trim();
    const platform = (problem.platform || "").toLowerCase();
    const lang = (problem.lang?.name || problem.lang?.slug || "").toLowerCase();
    return `${title}::${platform}::${lang}`;
}

/** Group problems by (title, platform, lang). Skips already-resolved duplicates. */
export function findDuplicates(problems) {
    const groups = new Map();
    for (const p of problems) {
        if (p?.isDuplicate === true) continue; // already resolved — skip
        const hash = computeHash(p);
        if (!groups.has(hash)) groups.set(hash, []);
        groups.get(hash).push(p);
    }
    return Array.from(groups.values()).filter((g) => g.length > 1);
}

/**
 * Classify a duplicate pair — same logic as ConflictResolutionModal.
 * Returns "same-code" | "diff-approach".
 * Exported so library.js can sort groups before displaying.
 */
export function classifyDuplicatePair(a, b) {
    return normalizeCode(a?.code || "") === normalizeCode(b?.code || "")
        ? "same-code"
        : "diff-approach";
}

// ── Internal helpers (exported for auto-resolve in library.js) ───────────────

export function pickBetter(a, b) {
    const score = (p) => {
        let s = 0;
        if (p.aiReview) s += 10;
        if (Array.isArray(p.tags)) s += p.tags.length;
        if (p.difficulty && p.difficulty !== "?") s += 2;
        if (p.notes) s += 3;
        return s;
    };
    const sa = score(a), sb = score(b);
    if (sa !== sb) return sa > sb ? "first" : "second";
    return (a.timestamp || 0) >= (b.timestamp || 0) ? "first" : "second";
}

function fmtDate(ts) {
    if (!ts) return "—";
    return new Date(ts < 1e12 ? ts * 1000 : ts).toLocaleDateString(undefined, {
        year: "numeric", month: "short", day: "numeric",
    });
}

// ── Action executor ───────────────────────────────────────────────────────────

export function buildPendingKey(problem) {
    const slug = String(problem.titleSlug || problem.id || "").trim();
    const lang = problem.lang?.name || problem.lang?.slug || problem.lang?.ext || "";
    const normLang = String(lang).toLowerCase().replace(/\s+/g, "");
    return slug ? (normLang ? `${slug}::${normLang}` : slug) : "";
}

/**
 * Execute a resolution action in IndexedDB, then mark the keeper pending for
 * a GitHub re-commit so the repo reflects the correct post-resolution state.
 * Returns the id of the problem that was deleted / subordinated.
 */
export async function executeAction(action, first, second) {
    if (action === "keep-first") {
        await Storage.deleteProblem(second.id).catch((e) =>
            dbg.warn("keep-first: deleteProblem failed", e?.message)
        );
        // Re-commit the keeper so GitHub reverts any overwrite from the duplicate.
        const key = buildPendingKey(first);
        if (key) await Storage.markPendingProblemKey(key).catch(() => {});
        return second.id;
    }

    if (action === "keep-second") {
        await Storage.deleteProblem(first.id).catch((e) =>
            dbg.warn("keep-second: deleteProblem failed", e?.message)
        );
        const key = buildPendingKey(second);
        if (key) await Storage.markPendingProblemKey(key).catch(() => {});
        return first.id;
    }

    if (action === "both-methods") {
        // Keep the "better" problem as the primary entry.
        // Add the other's code as a Method on it, then delete the subordinated one.
        const betterSide = pickBetter(first, second);
        const [keeper, subordinate] = betterSide === "first"
            ? [first, second]
            : [second, first];

        const primaryRecord = await Storage.getProblem(keeper.id).catch(() => null);
        if (primaryRecord) {
            const newMethod = {
                title: `Alt approach (${subordinate.lang?.name || "unknown"})`,
                language: subordinate.lang?.name || "unknown",
                code: subordinate.code,
                description: `Duplicate resolved — ${fmtDate(subordinate.timestamp)}`,
                timestamp: subordinate.timestamp || Date.now(),
            };
            await Storage.saveProblem({
                ...primaryRecord,
                methods: [...(primaryRecord.methods || []), newMethod],
            }).catch((e) => dbg.warn("both-methods: saveProblem failed", e?.message));
        }
        await Storage.deleteProblem(subordinate.id).catch((e) =>
            dbg.warn("both-methods: deleteProblem failed", e?.message)
        );
        // Commit the updated keeper (now includes the subordinate as a method).
        const key = buildPendingKey(keeper);
        if (key) await Storage.markPendingProblemKey(key).catch(() => {});
        return subordinate.id;
    }

    dbg.warn("executeAction: unknown action", action);
    return second.id;
}

// ── Same-code card ────────────────────────────────────────────────────────────

function SameCodeCard({ first, second, onResolved, onCancel }) {
    const autoSide = pickBetter(first, second);
    const [countdown, setCountdown] = useState(CONSTANTS.DEDUP.SAME_CODE_COUNTDOWN_S);
    const [chosen, setChosen] = useState(null); // null | "first" | "second"
    const [resolving, setResolving] = useState(false);

    // Countdown — stops when chosen or resolving
    useEffect(() => {
        if (chosen !== null || resolving) return;
        if (countdown <= 0) {
            apply(autoSide);
            return;
        }
        const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
        return () => clearTimeout(t);
    }, [countdown, chosen, resolving]); // eslint-disable-line react-hooks/exhaustive-deps

    async function apply(side) {
        if (resolving) return; // guard double-fire
        setChosen(side);
        setResolving(true);
        try {
            const action = side === "first" ? "keep-first" : "keep-second";
            const deletedId = await executeAction(action, first, second);
            dbg.log("SameCodeCard resolved:", action, deletedId);
            onResolved(deletedId);
        } catch (e) {
            dbg.error("SameCodeCard resolve failed:", e);
            setChosen(null);
        } finally {
            // Always reset — prevents permanent stuck state if the modal
            // doesn't unmount immediately after onResolved fires.
            setResolving(false);
        }
    }

    const sides = [
        { key: "first", label: "Left (older)" },
        { key: "second", label: "Right (newer)" },
    ];

    return html`
        <div class="border border-white/10 rounded-xl overflow-hidden">
            <!-- Header -->
            <div class="px-4 py-2.5 bg-white/[0.02] flex items-center justify-between gap-4">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="text-sm font-medium text-slate-200 truncate">
                        ${first.title || first.titleSlug}
                    </span>
                    <span class="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                        same code
                    </span>
                </div>
                ${resolving
                    ? html`<span class="text-[10px] text-slate-400 shrink-0">Resolving…</span>`
                    : chosen !== null
                    ? html`<span class="text-[10px] text-cyan-400 shrink-0">✓ resolved</span>`
                    : html`<span class="text-[10px] text-amber-400 shrink-0">
                          Auto-keeping ${autoSide === "first" ? "left" : "right"} in ${countdown}s…
                      </span>`}
            </div>

            <!-- Side choosers -->
            <div class="grid grid-cols-2 divide-x divide-white/5">
                ${sides.map(({ key, label }) => {
                    const p = key === "first" ? first : second;
                    const active = chosen === key;
                    const isAuto = key === autoSide;
                    return html`
                        <button
                            onClick=${() => apply(key)}
                            disabled=${resolving}
                            class="text-left px-4 py-3 transition-colors disabled:opacity-40 ${active
                                ? "bg-cyan-500/10 border-l-2 border-cyan-500"
                                : "hover:bg-white/[0.03]"}"
                        >
                            <div class="flex items-center gap-2 mb-1.5">
                                <span class="text-[11px] font-semibold uppercase tracking-wide ${active ? "text-cyan-400" : "text-slate-500"}">
                                    ${label}
                                </span>
                                ${isAuto && !chosen
                                    ? html`<span class="text-[10px] text-amber-400/70">← auto</span>`
                                    : ""}
                                ${active ? html`<span class="text-[10px] text-cyan-400">✓</span>` : ""}
                            </div>
                            <div class="text-[11px] text-slate-400 space-y-1">
                                <div>${p.difficulty || "?"} · ${p.lang?.name || "?"}</div>
                                <div class="text-slate-600">${fmtDate(p.timestamp)}</div>
                                ${p.aiReview ? html`<div class="text-emerald-600 text-[10px]">has AI review</div>` : ""}
                                ${Array.isArray(p.tags) && p.tags.length
                                    ? html`<div class="text-slate-600 text-[10px]">${p.tags.length} tag${p.tags.length !== 1 ? "s" : ""}</div>`
                                    : ""}
                            </div>
                        </button>
                    `;
                })}
            </div>

            <!-- Footer -->
            <div class="px-4 py-2 bg-black/20 border-t border-white/5 flex items-center justify-between gap-3">
                <p class="text-[10px] text-slate-600">
                    Code is identical after normalisation — only metadata differs. Keeping the richer version automatically.
                </p>
                <button
                    onClick=${onCancel}
                    disabled=${resolving}
                    class="shrink-0 text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10 text-slate-500 hover:text-white disabled:opacity-40 transition-colors"
                >
                    Skip
                </button>
            </div>
        </div>
    `;
}

// ── Diff-approach card ────────────────────────────────────────────────────────

function hasNoCode(p) {
    const c = (p?.code || "").trim();
    return !c || c === "// (no code)";
}

function DiffApproachCard({ first, second, onResolved, onCancel }) {
    const [chosen, setChosen] = useState(null); // null | "keep-first" | "keep-second" | "both-methods"
    const [resolving, setResolving] = useState(false);

    const firstLang = first.lang?.slug || first.lang?.name || "";
    const secondLang = second.lang?.slug || second.lang?.name || "";
    // Compute highlighted once — they don't change
    const firstHighlighted = highlightCode(first.code || "// (no code)", firstLang);
    const secondHighlighted = highlightCode(second.code || "// (no code)", secondLang);

    // Auto-resolve when one side has no code
    useEffect(() => {
        const firstEmpty = hasNoCode(first);
        const secondEmpty = hasNoCode(second);
        if (firstEmpty && !secondEmpty) {
            apply("keep-second");
        } else if (secondEmpty && !firstEmpty) {
            apply("keep-first");
        } else if (firstEmpty && secondEmpty) {
            apply(pickBetter(first, second) === "first" ? "keep-first" : "keep-second");
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    async function apply(action) {
        if (resolving) return; // guard double-fire
        setChosen(action);
        setResolving(true);
        try {
            const deletedId = await executeAction(action, first, second);
            dbg.log("DiffApproachCard resolved:", action, deletedId);
            onResolved(deletedId);
        } catch (e) {
            dbg.error("DiffApproachCard resolve failed:", e);
            setChosen(null);
        } finally {
            // Always reset — prevents permanent stuck state.
            setResolving(false);
        }
    }

    const sides = [
        { action: "keep-first", label: "Left (older)", p: first, highlighted: firstHighlighted, lang: firstLang },
        { action: "keep-second", label: "Right (newer)", p: second, highlighted: secondHighlighted, lang: secondLang },
    ];

    return html`
        <div class="border border-white/10 rounded-xl overflow-hidden">
            <!-- Header -->
            <div class="px-4 py-2.5 bg-white/[0.02] flex items-center justify-between gap-4">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="text-sm font-medium text-slate-200 truncate">
                        ${first.title || first.titleSlug}
                    </span>
                    <span class="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/20">
                        different approach
                    </span>
                </div>
                ${resolving
                    ? html`<span class="text-[10px] text-slate-400 shrink-0">Resolving…</span>`
                    : chosen
                    ? html`<span class="text-[10px] text-cyan-400 shrink-0">✓ resolved</span>`
                    : ""}
            </div>

            <!-- Code panels — always visible -->
            <div class="grid grid-cols-2 divide-x divide-white/5 border-t border-white/5">
                ${sides.map(({ label, highlighted, lang }) => html`
                    <div class="flex flex-col">
                        <div class="px-3 py-1.5 bg-black/30 flex items-center justify-between border-b border-white/5">
                            <span class="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">${label}</span>
                            <span class="text-[10px] font-mono text-cyan-500/60">${lang}</span>
                        </div>
                        <pre
                            class="text-[11px] leading-relaxed overflow-x-auto bg-black/40 p-3 whitespace-pre font-mono m-0 max-h-64"
                            dangerouslySetInnerHTML=${{ __html: highlighted }}
                        ></pre>
                    </div>
                `)}
            </div>

            <!-- Side choosers -->
            <div class="grid grid-cols-2 divide-x divide-white/5 border-t border-white/5">
                ${sides.map(({ action, label, p }) => {
                    const active = chosen === action;
                    return html`
                        <button
                            onClick=${() => apply(action)}
                            disabled=${resolving}
                            class="text-left px-4 py-3 transition-colors disabled:opacity-40 ${active
                                ? "bg-cyan-500/10 border-l-2 border-cyan-500"
                                : "hover:bg-white/[0.03]"}"
                        >
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-[11px] font-semibold uppercase tracking-wide ${active ? "text-cyan-400" : "text-slate-500"}">
                                    ${label}
                                </span>
                                ${active ? html`<span class="text-[10px] text-cyan-400">✓</span>` : ""}
                            </div>
                            <div class="text-[11px] text-slate-400 space-y-0.5">
                                <div>${p.difficulty || "?"} · ${p.lang?.name || "?"}</div>
                                <div class="text-slate-600">${fmtDate(p.timestamp)}</div>
                                ${p.aiReview ? html`<div class="text-emerald-600 text-[10px]">has AI review</div>` : ""}
                            </div>
                        </button>
                    `;
                })}
            </div>

            <!-- Footer -->
            <div class="px-4 py-2 bg-black/20 border-t border-white/5 flex items-center justify-between gap-3">
                <button
                    onClick=${() => apply("both-methods")}
                    disabled=${resolving}
                    class="text-[10px] px-3 py-1.5 rounded-lg bg-violet-600/15 border border-violet-500/30 text-violet-300 hover:bg-violet-600/30 disabled:opacity-40 transition-colors"
                >
                    ${chosen === "both-methods" ? "✓ Saved as methods" : "⊕ Keep both as Methods"}
                </button>
                <button
                    onClick=${onCancel}
                    disabled=${resolving}
                    class="text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10 text-slate-500 hover:text-white disabled:opacity-40 transition-colors"
                >
                    Skip
                </button>
            </div>
        </div>
    `;
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function DuplicateDetectionModal({
    duplicateGroup,
    remaining,
    diffApproachCount,
    sameCodeCount,
    onAutoResolveAll,
    onResolve,
    onClose,
}) {
    if (!duplicateGroup || duplicateGroup.length < 2) return null;

    const first = duplicateGroup[0];
    const second = duplicateGroup[1];
    const type = classifyDuplicatePair(first, second);
    const [autoResolving, setAutoResolving] = useState(false);

    function handleResolved(deletedId) {
        setTimeout(() => onResolve?.(deletedId, "resolved"), CONSTANTS.DEDUP.ADVANCE_DELAY_MS);
    }

    async function handleAutoResolveAll() {
        if (autoResolving) return;
        setAutoResolving(true);
        try {
            await onAutoResolveAll?.();
        } finally {
            setAutoResolving(false);
        }
    }

    const moreAfter = (remaining || 1) - 1;

    return html`
        <div
            class="fixed inset-0 z-[10000] flex items-center justify-center p-4"
            style="background:rgba(0,0,0,0.85);backdrop-filter:blur(6px)"
            onClick=${(e) => { if (e.target === e.currentTarget) onClose?.(); }}
        >
            <div class="w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#0a0a0f] border border-rose-500/20 rounded-2xl shadow-2xl overflow-hidden">

                <!-- Header -->
                <div class="px-6 py-5 border-b border-white/5 flex items-center justify-between shrink-0 gap-4">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-3 flex-wrap">
                            <h2 class="text-base font-bold text-rose-300 shrink-0">
                                Duplicate Problem Detected
                            </h2>
                            ${(diffApproachCount > 0 || sameCodeCount > 0)
                                ? html`<div class="flex items-center gap-2 text-[11px]">
                                    ${diffApproachCount > 0
                                        ? html`<span class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
                                            ${diffApproachCount} need review
                                        </span>`
                                        : ""}
                                    ${sameCodeCount > 0
                                        ? html`<span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                                            ${sameCodeCount} auto-resolvable
                                        </span>`
                                        : ""}
                                </div>`
                                : remaining > 1
                                ? html`<span class="text-xs text-slate-500">(${remaining} remaining)</span>`
                                : ""}
                        </div>
                        <p class="text-xs text-slate-500 mt-1">
                            ${type === "same-code"
                                ? "Identical code — auto-keeping the version with richer metadata."
                                : "Different code — review both approaches and choose how to resolve."}
                            ${moreAfter > 0
                                ? html`<span class="ml-1 text-slate-600">${moreAfter} more will follow.</span>`
                                : ""}
                        </p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        ${sameCodeCount > 0 && onAutoResolveAll
                            ? html`<button
                                onClick=${handleAutoResolveAll}
                                disabled=${autoResolving}
                                class="text-[11px] px-3 py-1.5 rounded-lg bg-emerald-600/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-40 transition-colors"
                            >
                                ${autoResolving
                                    ? "Resolving…"
                                    : `Auto-resolve ${sameCodeCount} same-code`}
                            </button>`
                            : ""}
                        <button
                            onClick=${onClose}
                            class="text-slate-400 hover:text-white text-xl leading-none transition-colors"
                        >✕</button>
                    </div>
                </div>

                <!-- Card -->
                <div class="overflow-y-auto flex-1 p-6">
                    ${type === "same-code"
                        ? html`<${SameCodeCard}
                              first=${first}
                              second=${second}
                              onResolved=${handleResolved}
                              onCancel=${onClose}
                          />`
                        : html`<${DiffApproachCard}
                              first=${first}
                              second=${second}
                              onResolved=${handleResolved}
                              onCancel=${onClose}
                          />`}
                </div>

            </div>
        </div>
    `;
}
