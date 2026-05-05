/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Duplicate Detection & Merge Modal
 * Shows side-by-side comparison of identical problems and allows merge/delete.
 */

import { h, useState } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";
import { createDebugger } from "../../lib/debug.js";
const dbg = createDebugger("DuplicateDetectionModal");

/**
 * Compute a simple hash for deduplication (title + platform + lang).
 * Used to group identical problems.
 */
function computeHash(problem) {
    const title = (problem.title || "").toLowerCase().trim();
    const platform = (problem.platform || "").toLowerCase();
    const lang = (problem.lang?.name || problem.lang?.slug || "").toLowerCase();
    return `${title}::${platform}::${lang}`;
}

/**
 * Find all duplicate groups in the problem list.
 * Returns an array of groups where each group has 2+ problems with the same hash.
 */
export function findDuplicates(problems) {
    const groups = new Map();
    for (const p of problems) {
        const hash = computeHash(p);
        if (!groups.has(hash)) groups.set(hash, []);
        groups.get(hash).push(p);
    }
    return Array.from(groups.values()).filter(g => g.length > 1);
}

/**
 * Side-by-side duplicate comparison and merge/delete UI.
 * Shows the first 2 items from a duplicate group.
 */
export function DuplicateDetectionModal({ duplicateGroup, onResolve, onClose }) {
    const [resolving, setResolving] = useState(false);
    const [action, setAction] = useState(null); // "keep-first", "keep-second", "merge"

    if (!duplicateGroup || duplicateGroup.length < 2) return null;

    const primary = duplicateGroup[0];
    const secondary = duplicateGroup[1];

    const handleDelete = async (keepIndex) => {
        setResolving(true);
        try {
            const toDelete = keepIndex === 0 ? secondary : primary;
            await Storage.deleteProblem(toDelete.id).catch(() => { });
            dbg.log("Deleted duplicate:", toDelete.id);
            onResolve?.(toDelete.id, "delete");
        } catch (e) {
            dbg.error("Delete failed:", e);
        } finally {
            setResolving(false);
        }
    };

    const handleMerge = async () => {
        setResolving(true);
        try {
            // Merge: combine all non-null fields from both, with primary taking precedence
            const merged = {
                ...secondary,
                ...primary,
                id: primary.id,
                titleSlug: primary.titleSlug,
                timestamp: Math.max(primary.timestamp || 0, secondary.timestamp || 0),
                // Combine tags, hints, etc. if present
                tags: [...new Set([...(primary.tags || []), ...(secondary.tags || [])])],
                hints: [...new Set([...(primary.hints || []), ...(secondary.hints || [])])],
            };
            await Storage.saveProblem(merged);
            await Storage.deleteProblem(secondary.id).catch(() => { });
            dbg.log("Merged duplicates:", primary.id, "←", secondary.id);
            onResolve?.(secondary.id, "merge");
        } catch (e) {
            dbg.error("Merge failed:", e);
        } finally {
            setResolving(false);
        }
    };

    const fields = [
        { key: "title", label: "Title" },
        { key: "difficulty", label: "Difficulty" },
        { key: "platform", label: "Platform" },
        { key: "lang.name", label: "Language", value: (p) => p.lang?.name || p.language },
        { key: "tags", label: "Tags", value: (p) => (p.tags || []).join(", ") },
        { key: "topic", label: "Topic" },
        { key: "problemStatement", label: "Problem Statement", value: (p) => (p.problemStatement || "").slice(0, 100) + "..." },
        { key: "timestamp", label: "Timestamp", value: (p) => p.timestamp ? new Date(p.timestamp < 1e12 ? p.timestamp * 1000 : p.timestamp).toLocaleString() : "—" },
        { key: "elapsedSeconds", label: "Solve Time", value: (p) => p.elapsedSeconds ? `${Math.floor(p.elapsedSeconds / 60)}m ${p.elapsedSeconds % 60}s` : "—" },
    ];

    return html`
    <div
      class="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      style="background:rgba(0,0,0,0.9);backdrop-filter:blur(6px)"
      onClick=${(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div class="w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#0d1117] border border-rose-500/30 rounded-2xl shadow-2xl overflow-hidden">
        <!-- Header -->
        <div class="p-6 border-b border-white/5 bg-rose-950/20">
          <h2 class="text-base font-bold text-rose-300 mb-1">Duplicate Problems Detected</h2>
          <p class="text-xs text-slate-400">
            These entries appear identical. Choose an action: keep one and delete the other, or merge both.
          </p>
        </div>

        <!-- Comparison Table -->
        <div class="flex-1 overflow-y-auto p-6">
          <div class="space-y-3">
            ${fields.map((f) => {
        const v1 = typeof f.value === "function" ? f.value(primary) : primary[f.key];
        const v2 = typeof f.value === "function" ? f.value(secondary) : secondary[f.key];
        const same = String(v1 || "").trim() === String(v2 || "").trim();
        return html`
                <div class="grid grid-cols-3 gap-4 p-3 rounded-lg border ${same ? "border-white/5 bg-white/[0.02]" : "border-rose-500/20 bg-rose-950/10"}">
                  <div class="text-xs font-medium text-slate-400 uppercase tracking-wide">${f.label}</div>
                  <div class="text-sm text-slate-300 font-mono break-all">${v1 || "—"}</div>
                  <div class="text-sm text-slate-300 font-mono break-all">${v2 || "—"}</div>
                </div>
              `;
    })}
          </div>
        </div>

        <!-- Footer: Actions -->
        <div class="p-6 border-t border-white/5 bg-[#0a0a0f] flex items-center gap-3 flex-wrap">
          <button
            onClick=${onClose}
            disabled=${resolving}
            class="px-4 py-2 text-xs font-medium rounded-lg text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50"
          >Cancel</button>
          <button
            onClick=${() => handleDelete(0)}
            disabled=${resolving}
            class="px-4 py-2 text-xs font-medium rounded-lg text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors disabled:opacity-50"
          >${resolving ? "⏳" : "✓"} Keep left, delete right</button>
          <button
            onClick=${() => handleDelete(1)}
            disabled=${resolving}
            class="px-4 py-2 text-xs font-medium rounded-lg text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors disabled:opacity-50"
          >${resolving ? "⏳" : "✓"} Keep right, delete left</button>
          <div class="flex-1"></div>
          <button
            onClick=${handleMerge}
            disabled=${resolving}
            class="px-4 py-2 text-xs font-medium rounded-lg text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 transition-colors disabled:opacity-50"
          >${resolving ? "⏳" : "⇄"} Merge both</button>
        </div>
      </div>
    </div>
  `;
}
