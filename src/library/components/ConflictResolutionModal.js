/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { h, useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
import { highlightCode } from "../../lib/syntax-highlight.js";
import { normalizeCode } from "../../core/ai-deduplication.js";
const html = htm.bind(h);

/**
 * Classify a conflict pair into one of:
 *   "same-code"      — code normalizes identically (whitespace/comment diffs only)
 *   "diff-approach"  — same language, genuinely different algorithms
 *
 * Note: diff-lang conflicts cannot arise from the current sync engine
 * (different lang → different commitKey → remoteOnly, not a conflict).
 * Timestamp is not in COMPARE_FIELDS, so "timestamp-only" is also impossible.
 * This classifier handles what actually arrives.
 */
function classifyConflict(local, remote) {
    const DIFF_FIELDS = [
        "title", "difficulty", "code", "aiReview", "tags",
        "lang", "notes", "methodTitle", "isDuplicate", "duplicateOf",
    ];

    const diffFields = DIFF_FIELDS.filter((k) => {
        const l = typeof local[k] === "object"
            ? JSON.stringify(local[k])
            : String(local[k] ?? "");
        const r = typeof remote[k] === "object"
            ? JSON.stringify(remote[k])
            : String(remote[k] ?? "");
        return l !== r;
    });

    // If normalized code is identical, only metadata differs — auto-resolvable
    if (normalizeCode(local.code || "") === normalizeCode(remote.code || "")) {
        return { type: "same-code", diffFields };
    }

    return { type: "diff-approach", diffFields };
}

/**
 * Pick the "better" version based on metadata completeness.
 * Prefers: has aiReview > more tags > more recent timestamp.
 */
function pickBetterVersion(local, remote) {
    const score = (p) => {
        let s = 0;
        if (p.aiReview) s += 10;
        if (Array.isArray(p.tags)) s += p.tags.length;
        if (p.difficulty && p.difficulty !== "?") s += 2;
        if (p.notes) s += 3;
        return s;
    };
    const ls = score(local);
    const rs = score(remote);
    if (ls !== rs) return ls > rs ? "local" : "remote";
    // Tie-break: more recent timestamp
    return (local.timestamp || 0) >= (remote.timestamp || 0) ? "local" : "remote";
}

// ── Single conflict card ──────────────────────────────────────────────────────

function SameCodeCard({ conflict, index, choice, onChoose }) {
    const { local, remote } = conflict;
    const [countdown, setCountdown] = useState(10);

    useEffect(() => {
        if (choice !== null) return; // already resolved, stop countdown
        if (countdown <= 0) {
            const auto = pickBetterVersion(local, remote);
            onChoose(index, auto);
            return;
        }
        const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
        return () => clearTimeout(t);
    }, [countdown, choice]);

    const chosen = choice;
    const autoSide = pickBetterVersion(local, remote);

    return html`
        <div class="border border-white/10 rounded-xl overflow-hidden">
            <div class="px-4 py-2.5 bg-white/[0.02] flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-slate-200">
                        ${local.title || local.id}
                    </span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                        same code
                    </span>
                </div>
                ${chosen === null
                    ? html`<span class="text-[10px] text-amber-400">
                          Auto-selecting ${autoSide} in ${countdown}s…
                      </span>`
                    : html`<span class="text-[10px] text-cyan-400">✓ resolved</span>`}
            </div>
            <div class="grid grid-cols-2 divide-x divide-white/5">
                ${["local", "remote"].map((side) => {
                    const p = conflict[side];
                    const active = chosen === side;
                    const isAuto = side === autoSide;
                    return html`
                        <button
                            onClick=${() => { setCountdown(10); onChoose(index, side); }}
                            class="text-left px-4 py-3 transition-colors ${active
                                ? "bg-cyan-500/10 border-l-2 border-cyan-500"
                                : "hover:bg-white/[0.03]"}"
                        >
                            <div class="flex items-center gap-2 mb-1.5">
                                <span class="text-[11px] font-semibold uppercase tracking-wide ${active ? "text-cyan-400" : "text-slate-500"}">
                                    ${side}
                                </span>
                                ${isAuto && chosen === null
                                    ? html`<span class="text-[10px] text-amber-400/70">← auto</span>`
                                    : ""}
                                ${active ? html`<span class="text-[10px] text-cyan-400">✓</span>` : ""}
                            </div>
                            <div class="text-[11px] text-slate-400 space-y-1">
                                <div>${p.difficulty || "?"} · ${p.lang?.name || "?"}</div>
                                <div class="text-slate-600">
                                    ${new Date(p.timestamp || 0).toLocaleDateString()}
                                </div>
                                ${p.aiReview
                                    ? html`<div class="text-emerald-600 text-[10px]">has AI review</div>`
                                    : ""}
                                ${Array.isArray(p.tags) && p.tags.length
                                    ? html`<div class="text-slate-600 text-[10px]">${p.tags.length} tag${p.tags.length !== 1 ? "s" : ""}</div>`
                                    : ""}
                            </div>
                        </button>
                    `;
                })}
            </div>
            <div class="px-4 py-2 bg-black/20 border-t border-white/5">
                <p class="text-[10px] text-slate-600">
                    Code is identical after normalisation — only metadata differs.
                    Selecting the version with better metadata automatically.
                </p>
            </div>
        </div>
    `;
}

function DiffApproachCard({ conflict, index, choice, onChoose }) {
    const { local, remote } = conflict;
    const [expanded, setExpanded] = useState(false);

    const localLang = local.lang?.slug || local.lang?.name || local.language || "";
    const remoteLang = remote.lang?.slug || remote.lang?.name || remote.language || "";
    const localHighlighted = highlightCode(local.code || "// (no code)", localLang);
    const remoteHighlighted = highlightCode(remote.code || "// (no code)", remoteLang);

    return html`
        <div class="border border-white/10 rounded-xl overflow-hidden">
            <div class="px-4 py-2.5 bg-white/[0.02] flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-slate-200">
                        ${local.title || local.id}
                    </span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/20">
                        different approach
                    </span>
                    <span class="text-[10px] text-slate-600">
                        differs: ${conflict._diffFields?.join(", ") || "code"}
                    </span>
                </div>
                <div class="flex items-center gap-2">
                    ${choice !== null
                        ? html`<span class="text-[10px] text-cyan-400">✓ ${choice} selected</span>`
                        : ""}
                    <button
                        onClick=${() => setExpanded((e) => !e)}
                        class="text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors"
                    >
                        ${expanded ? "Hide code" : "Show code"}
                    </button>
                </div>
            </div>

            ${expanded
                ? html`
                    <div class="grid grid-cols-2 divide-x divide-white/5 border-t border-white/5">
                        ${["local", "remote"].map((side) => {
                            const p = conflict[side];
                            const isLocal = side === "local";
                            const highlighted = isLocal ? localHighlighted : remoteHighlighted;
                            const lang = isLocal ? localLang : remoteLang;
                            return html`
                                <div class="flex flex-col">
                                    <div class="px-3 py-1.5 bg-black/30 flex items-center justify-between border-b border-white/5">
                                        <span class="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">${side}</span>
                                        <span class="text-[10px] font-mono text-cyan-500/60">${lang}</span>
                                    </div>
                                    <pre
                                        class="text-[11px] leading-relaxed overflow-x-auto bg-black/40 p-3 whitespace-pre font-mono m-0 max-h-64"
                                        dangerouslySetInnerHTML=${{ __html: highlighted }}
                                    ></pre>
                                </div>
                            `;
                        })}
                    </div>
                  `
                : ""}

            <div class="grid grid-cols-2 divide-x divide-white/5 border-t border-white/5">
                ${["local", "remote"].map((side) => {
                    const p = conflict[side];
                    const active = choice === side;
                    return html`
                        <button
                            onClick=${() => onChoose(index, side)}
                            class="text-left px-4 py-3 transition-colors ${active
                                ? "bg-cyan-500/10 border-l-2 border-cyan-500"
                                : "hover:bg-white/[0.03]"}"
                        >
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-[11px] font-semibold uppercase tracking-wide ${active ? "text-cyan-400" : "text-slate-500"}">
                                    ${side}
                                </span>
                                ${active ? html`<span class="text-[10px] text-cyan-400">✓ selected</span>` : ""}
                            </div>
                            <div class="text-[11px] text-slate-400 space-y-0.5">
                                <div>${p.difficulty || "?"} · ${p.lang?.name || "?"}</div>
                                <div class="text-slate-600">
                                    ${new Date(p.timestamp || 0).toLocaleDateString()}
                                </div>
                                ${p.aiReview
                                    ? html`<div class="text-emerald-600 text-[10px]">has AI review</div>`
                                    : ""}
                            </div>
                        </button>
                    `;
                })}
            </div>
        </div>
    `;
}

// ── Main modal ────────────────────────────────────────────────────────────────

/**
 * ConflictResolutionModal
 *
 * Props:
 *   conflicts    — Array<{ local: Problem, remote: Problem }>
 *   remoteOnly   — Problem[]  (auto-imported after resolution)
 *   onResolve    — (resolved: Problem[]) => void
 *   onCancel     — () => void
 *   providerName — string  e.g. "GitHub"
 */
export function ConflictResolutionModal({
    conflicts,
    remoteOnly = [],
    onResolve,
    onCancel,
    providerName = "Remote",
}) {
    // Classify every conflict upfront — skip any item missing local/remote
    const classified = conflicts
        .filter((c) => c && c.local && c.remote)
        .map((c) => {
            try {
                const cls = classifyConflict(c.local, c.remote);
                return { ...c, _type: cls.type, _diffFields: cls.diffFields };
            } catch (_) {
                return { ...c, _type: "diff-approach", _diffFields: ["code"] };
            }
        });

    // Same-code conflicts: pre-populate choices with the "better" version
    const initialChoices = classified.map((c) =>
        c._type === "same-code" ? null : null  // all start unresolved, same-code gets auto via countdown
    );

    const [choices, setChoices] = useState(initialChoices);

    const allResolved = classified.length === 0 || choices.every((c) => c !== null);
    const resolvedCount = choices.filter((c) => c !== null).length;

    function choose(i, side) {
        setChoices((prev) => {
            const n = [...prev];
            n[i] = side;
            return n;
        });
    }

    function acceptAll(side) {
        setChoices(new Array(classified.length).fill(side));
    }

    function handleApply() {
        const resolved = classified.map((c, i) =>
            choices[i] === "remote" ? c.remote : c.local
        );
        onResolve([...resolved, ...remoteOnly]);
    }

    const sameCodeCount = classified.filter((c) => c._type === "same-code").length;
    const diffApproachCount = classified.filter((c) => c._type === "diff-approach").length;

    return html`
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div class="bg-[#0a0a0f] border border-cyan-500/20 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl">

                <!-- Header -->
                <div class="px-6 py-5 border-b border-white/5 flex items-center justify-between shrink-0">
                    <div>
                        <h2 class="text-lg font-bold text-white">
                            Sync Conflicts — ${providerName}
                        </h2>
                        <p class="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                            <span>${conflicts.length} conflict${conflicts.length !== 1 ? "s" : ""}</span>
                            <span>·</span>
                            <span>${resolvedCount} resolved</span>
                            ${sameCodeCount > 0
                                ? html`<span>·</span><span class="text-emerald-500">${sameCodeCount} same-code (auto)</span>`
                                : ""}
                            ${diffApproachCount > 0
                                ? html`<span>·</span><span class="text-amber-500">${diffApproachCount} need review</span>`
                                : ""}
                            ${remoteOnly.length > 0
                                ? html`<span>·</span><span class="text-slate-400">${remoteOnly.length} new auto-imported</span>`
                                : ""}
                        </p>
                    </div>
                    <div class="flex gap-2">
                        <button
                            onClick=${() => acceptAll("local")}
                            class="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-colors"
                        >
                            Keep all local
                        </button>
                        <button
                            onClick=${() => acceptAll("remote")}
                            class="text-xs px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                        >
                            Keep all remote
                        </button>
                    </div>
                </div>

                <!-- Conflict list -->
                <div class="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-3">
                    ${classified.length === 0
                        ? html`
                            <div class="flex flex-col items-center justify-center py-12 gap-3 text-center">
                                <span class="text-2xl">✅</span>
                                <p class="text-slate-300 text-sm font-medium">No conflicts to resolve</p>
                                <p class="text-slate-500 text-xs max-w-sm">
                                    All problems are already in sync. If you expected conflicts here,
                                    try running Sync again to re-check the remote repository.
                                </p>
                            </div>
                          `
                        : classified.map((c, i) =>
                            c._type === "same-code"
                                ? html`<${SameCodeCard}
                                      key=${c.local.id || i}
                                      conflict=${c}
                                      index=${i}
                                      choice=${choices[i]}
                                      onChoose=${choose}
                                  />`
                                : html`<${DiffApproachCard}
                                      key=${c.local.id || i}
                                      conflict=${c}
                                      index=${i}
                                      choice=${choices[i]}
                                      onChoose=${choose}
                                  />`
                        )}
                </div>

                <!-- Footer -->
                <div class="px-6 py-4 border-t border-white/5 flex items-center justify-between shrink-0">
                    <button
                        onClick=${onCancel}
                        class="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick=${handleApply}
                        disabled=${!allResolved}
                        class="px-5 py-2 rounded-xl text-sm font-medium transition-colors ${allResolved
                            ? "bg-cyan-500 text-black hover:bg-cyan-400"
                            : "bg-white/5 text-slate-600 cursor-not-allowed"}"
                    >
                        Apply & Import ${remoteOnly.length + conflicts.length} problem${remoteOnly.length + conflicts.length !== 1 ? "s" : ""}
                    </button>
                </div>
            </div>
        </div>
    `;
}
