/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { h, useState } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

/**
 * ConflictResolutionModal
 *
 * Props:
 *   conflicts    — Array<{ local: Problem, remote: Problem }>
 *   remoteOnly   — Problem[]  (auto-imported after resolution, shown as info)
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
    const [choices, setChoices] = useState(() =>
        new Array(conflicts.length).fill(null)
    );

    const allResolved = choices.every((c) => c !== null);
    const resolvedCount = choices.filter(Boolean).length;

    function choose(i, side) {
        setChoices((prev) => {
            const n = [...prev];
            n[i] = side;
            return n;
        });
    }

    function acceptAll(side) {
        setChoices(new Array(conflicts.length).fill(side));
    }

    function handleApply() {
        const resolved = conflicts.map((c, i) =>
            choices[i] === "remote" ? c.remote : c.local
        );
        onResolve([...resolved, ...remoteOnly]);
    }

    const DIFF_FIELDS = [
        "title",
        "difficulty",
        "code",
        "aiReview",
        "tags",
        "lang",
        "notes",
        "methodTitle",
        "isDuplicate",
        "duplicateOf",
    ];

    function diffSummary(local, remote) {
        return DIFF_FIELDS.filter((k) => {
            const l =
                typeof local[k] === "object"
                    ? JSON.stringify(local[k])
                    : String(local[k] ?? "");
            const r =
                typeof remote[k] === "object"
                    ? JSON.stringify(remote[k])
                    : String(remote[k] ?? "");
            return l !== r;
        });
    }

    return html`
        <div
            class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
            <div
                class="bg-[#0a0a0f] border border-cyan-500/20 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
            >
                <div
                    class="px-6 py-5 border-b border-white/5 flex items-center justify-between shrink-0"
                >
                    <div>
                        <h2 class="text-lg font-bold text-white">
                            Import from ${providerName}
                        </h2>
                        <p class="text-xs text-slate-500 mt-0.5">
                            ${conflicts.length}
                            conflict${conflicts.length !== 1 ? "s" : ""} ·
                            ${resolvedCount} resolved
                            ${remoteOnly.length > 0
                                ? html` · ${remoteOnly.length} new
                                  problem${remoteOnly.length !== 1 ? "s" : ""}
                                  will be auto-imported`
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

                <div
                    class="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-3"
                >
                    ${conflicts.map((c, i) => {
                        const diffs = diffSummary(c.local, c.remote);
                        const choice = choices[i];
                        return html`
                            <div
                                key=${c.local.id || i}
                                class="border border-white/10 rounded-xl overflow-hidden"
                            >
                                <div
                                    class="px-4 py-2.5 bg-white/[0.02] flex items-center justify-between"
                                >
                                    <span
                                        class="text-sm font-medium text-slate-200"
                                        >${c.local.title || c.local.id}</span
                                    >
                                    <span class="text-[10px] text-slate-500"
                                        >differs:
                                        ${diffs.join(", ") ||
                                        "timestamps only"}</span
                                    >
                                </div>
                                <div
                                    class="grid grid-cols-2 divide-x divide-white/5"
                                >
                                    ${["local", "remote"].map((side) => {
                                        const p = c[side];
                                        const active = choice === side;
                                        return html`
                                            <button
                                                onClick=${() => choose(i, side)}
                                                class="text-left px-4 py-3 transition-colors ${active
                                                    ? "bg-cyan-500/10 border-l-2 border-cyan-500"
                                                    : "hover:bg-white/[0.03]"}"
                                            >
                                                <div
                                                    class="flex items-center gap-2 mb-1.5"
                                                >
                                                    <span
                                                        class="text-[11px] font-semibold uppercase tracking-wide ${active
                                                            ? "text-cyan-400"
                                                            : "text-slate-500"}"
                                                        >${side}</span
                                                    >
                                                    ${active
                                                        ? html`<span
                                                              class="text-[10px] text-cyan-400"
                                                              >✓ selected</span
                                                          >`
                                                        : ""}
                                                </div>
                                                <div
                                                    class="text-[11px] text-slate-400 space-y-0.5"
                                                >
                                                    <div>
                                                        ${p.difficulty || "?"} ·
                                                        ${p.lang?.name || "?"}
                                                    </div>
                                                    <div class="text-slate-600">
                                                        ${new Date(
                                                            p.timestamp || 0
                                                        ).toLocaleDateString()}
                                                    </div>
                                                    ${p.code
                                                        ? html`<div
                                                              class="font-mono text-[10px] text-slate-600 truncate max-w-[220px]"
                                                          >
                                                              ${p.code.slice(
                                                                  0,
                                                                  60
                                                              )}${p.code
                                                                  .length > 60
                                                                  ? "…"
                                                                  : ""}
                                                          </div>`
                                                        : ""}
                                                </div>
                                            </button>
                                        `;
                                    })}
                                </div>
                            </div>
                        `;
                    })}
                </div>

                <div
                    class="px-6 py-4 border-t border-white/5 flex items-center justify-between shrink-0"
                >
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
                        Apply & Import ${remoteOnly.length + conflicts.length}
                        problem${remoteOnly.length + conflicts.length !== 1
                            ? "s"
                            : ""}
                    </button>
                </div>
            </div>
        </div>
    `;
}
