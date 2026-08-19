/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Broken Imports Review Modal
 *
 * Lists records verification marked `urlBroken` — the platform gave a
 * definitive "no such problem" for the stored slug. Nothing is deleted
 * automatically: the user opens the link to check for themselves, can re-run
 * the check per row (platforms occasionally resurrect problems), and removes
 * only what they select, behind a two-step confirm. Removal deletes the local
 * record only — anything already committed to GitHub stays in the repo.
 */

import { h, useState } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
import { createDebugger } from "../../lib/debug.js";
import { PLATFORM_META } from "./ProblemModal.js";

const html = htm.bind(h);
const dbg = createDebugger("BrokenImportsModal");

function problemUrl(p) {
  const meta = PLATFORM_META[p.platform];
  try {
    return meta && p.titleSlug ? meta.url(p.titleSlug) : "#";
  } catch (_) {
    return "#";
  }
}

function platformLabel(p) {
  return PLATFORM_META[p.platform]?.label || p.platform || "the platform";
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    if (!window.chrome?.runtime?.sendMessage) return resolve(null);
    try {
      chrome.runtime.sendMessage(msg, (res) => resolve(res || null));
    } catch (_) {
      resolve(null);
    }
  });
}

/**
 * @param {object} props
 * @param {object[]} props.problems  the urlBroken records
 * @param {() => void} props.onClose
 * @param {() => void} props.onChanged  reload problems after re-check / removal
 */
export function BrokenImportsModal({ problems, onClose, onChanged }) {
  const [selected, setSelected] = useState(new Set());
  const [busyIds, setBusyIds] = useState(new Set());
  const [recheckAllBusy, setRecheckAllBusy] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [rowStatus, setRowStatus] = useState({});
  const [fixingId, setFixingId] = useState(null);
  const [fixDraft, setFixDraft] = useState("");
  const [fixBusy, setFixBusy] = useState(false);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmingRemove(false);
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === problems.length ? new Set() : new Set(problems.map((p) => p.id)),
    );
    setConfirmingRemove(false);
  };

  const recheckOne = async (p) => {
    setBusyIds((prev) => new Set(prev).add(p.id));
    const res = await sendMessage({ type: "LINK_VERIFY_ONE", id: p.id });
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(p.id);
      return next;
    });
    if (res?.ok && res.status === "ok") {
      setRowStatus((prev) => ({ ...prev, [p.id]: "recovered" }));
      onChanged?.();
    } else if (res?.ok && res.status === "error") {
      setRowStatus((prev) => ({ ...prev, [p.id]: "retry" }));
    } else if (res?.ok && res.status === "unverified") {
      setRowStatus((prev) => ({ ...prev, [p.id]: "unverified" }));
    } else {
      setRowStatus((prev) => ({ ...prev, [p.id]: "still-broken" }));
    }
  };

  const recheckAll = async () => {
    setRecheckAllBusy(true);
    for (const p of problems) {
      // Sequential on purpose — parallel would hammer the platform APIs.
      await recheckOne(p);
    }
    setRecheckAllBusy(false);
  };

  const removeSelected = async () => {
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      return;
    }
    setRemoveBusy(true);
    const ids = Array.from(selected);
    for (const id of ids) {
      const res = await sendMessage({ type: "DELETE_PROBLEM", id });
      if (!res?.ok) dbg.warn(`removeSelected(): delete failed for ${id}: ${res?.error}`);
    }
    setRemoveBusy(false);
    setConfirmingRemove(false);
    setSelected(new Set());
    onChanged?.();
    if (ids.length >= problems.length) onClose?.();
  };

  const openFix = (p) => {
    setFixingId((prev) => (prev === p.id ? null : p.id));
    setFixDraft("");
  };

  const applyFix = async (p) => {
    const url = fixDraft.trim();
    if (!url || fixBusy) return;
    setFixBusy(true);
    const res = await sendMessage({ type: "LINK_APPLY", id: p.id, url });
    setFixBusy(false);
    if (res?.ok && res.status === "ok") {
      setRowStatus((prev) => ({ ...prev, [p.id]: "recovered" }));
      setFixingId(null);
      setFixDraft("");
      onChanged?.();
    } else if (res?.ok && res.status === "unverified") {
      setRowStatus((prev) => ({ ...prev, [p.id]: "unverified" }));
      setFixingId(null);
      setFixDraft("");
      onChanged?.();
    } else if (res?.ok && res.status === "invalid") {
      setRowStatus((prev) => ({ ...prev, [p.id]: "invalid" }));
    } else if (res?.ok && res.status === "notfound") {
      setRowStatus((prev) => ({ ...prev, [p.id]: "notfound" }));
    } else {
      setRowStatus((prev) => ({ ...prev, [p.id]: "retry" }));
    }
  };

  const statusLabel = {
    recovered: html`<span class="text-emerald-400 text-[11px]">✓ link works now — restored</span>`,
    retry: html`<span class="text-slate-400 text-[11px]">couldn't check — try again</span>`,
    "still-broken": html`<span class="text-rose-400/90 text-[11px]">still not found</span>`,
    invalid: html`<span class="text-rose-400/90 text-[11px]"
      >that doesn't look like a problem link for this platform</span
    >`,
    notfound: html`<span class="text-rose-400/90 text-[11px]"
      >that link isn't found on the platform either</span
    >`,
    unverified: html`<span class="text-amber-400/90 text-[11px]"
      >saved — this platform can't be auto-checked; open the link to confirm</span
    >`,
  };

  return html`
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        class="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl"
      >
        <div
          class="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-slate-800"
        >
          <div>
            <h2 class="text-base font-semibold text-slate-100">Broken problem links</h2>
            <p class="text-xs text-slate-400 mt-1 max-w-lg">
              These problems no longer match any live URL on their platform — the platform answered
              "not found" for the stored link. Open a link to verify for yourself, paste the correct
              URL with "Fix link" if you know it, then remove the ones you don't want to keep.
              Nothing is deleted until you confirm, and files already committed to GitHub are not
              touched.
            </p>
          </div>
          <button
            onClick=${onClose}
            class="text-slate-500 hover:text-slate-300 text-xl leading-none transition-colors"
            title="Close"
          >
            ×
          </button>
        </div>

        <div class="px-5 py-2 flex items-center gap-3 border-b border-slate-800/60">
          <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked=${selected.size === problems.length && problems.length > 0}
              onChange=${toggleAll}
              class="accent-cyan-500"
            />
            Select all (${problems.length})
          </label>
          <button
            onClick=${recheckAll}
            disabled=${recheckAllBusy}
            class="ml-auto text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/10 disabled:opacity-50 px-2 py-1 rounded transition-colors"
          >
            ${recheckAllBusy ? "Re-checking…" : "Re-check all"}
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-2 divide-y divide-slate-800/60">
          ${problems.map(
            (p) => html`
              <div key=${p.id} class="py-2.5">
                <div class="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked=${selected.has(p.id)}
                    onChange=${() => toggle(p.id)}
                    class="accent-cyan-500 shrink-0"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="text-sm text-slate-200 truncate">${p.title || p.titleSlug || p.id}</p>
                    <p class="text-[11px] text-slate-500 truncate font-mono">
                      ${platformLabel(p)} · ${p.titleSlug || "—"}
                    </p>
                    ${rowStatus[p.id] ? statusLabel[rowStatus[p.id]] : ""}
                  </div>
                  <a
                    href=${problemUrl(p)}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="shrink-0 text-xs text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-2 py-1 rounded transition-colors"
                    >Open ↗</a
                  >
                  <button
                    onClick=${() => recheckOne(p)}
                    disabled=${busyIds.has(p.id) || recheckAllBusy}
                    class="shrink-0 text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/10 disabled:opacity-50 px-2 py-1 rounded transition-colors"
                  >
                    ${busyIds.has(p.id) ? "…" : "Re-check"}
                  </button>
                  <button
                    onClick=${() => openFix(p)}
                    class="shrink-0 text-xs px-2 py-1 rounded border transition-colors ${fixingId ===
                    p.id
                      ? "text-cyan-300 border-cyan-500/50 bg-cyan-500/10"
                      : "text-slate-400 hover:text-slate-200 border-slate-700 hover:border-slate-500"}"
                  >
                    Fix link
                  </button>
                </div>
                ${fixingId === p.id
                  ? html`
                      <div class="mt-2 ml-7 flex items-center gap-2">
                        <input
                          type="text"
                          value=${fixDraft}
                          onInput=${(e) => setFixDraft(e.target.value)}
                          onKeyDown=${(e) => {
                            if (e.key === "Enter") applyFix(p);
                            if (e.key === "Escape") setFixingId(null);
                          }}
                          placeholder="Paste the problem's ${platformLabel(p)} URL (or slug)…"
                          autofocus
                          class="flex-1 min-w-0 px-3 py-1.5 bg-black border border-white/10 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
                        />
                        <button
                          onClick=${() => applyFix(p)}
                          disabled=${!fixDraft.trim() || fixBusy}
                          class="shrink-0 text-xs font-medium text-cyan-300 border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          ${fixBusy ? "Checking…" : "Verify & apply"}
                        </button>
                      </div>
                      <p class="mt-1 ml-7 text-[11px] text-slate-500">
                        Where the platform can be queried, the link is checked before anything is
                        saved — a fix can't replace one broken link with another. Platforms that
                        can't be auto-checked save the link marked unverified.
                      </p>
                    `
                  : ""}
              </div>
            `,
          )}
          ${problems.length === 0
            ? html`<p class="text-sm text-slate-400 py-6 text-center">
                Nothing left to review — all clear.
              </p>`
            : ""}
        </div>

        <div class="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-800">
          <p class="text-[11px] text-slate-500">
            ${selected.size} selected
            ${confirmingRemove
              ? html`<span class="text-rose-400/90">
                  — this removes them from your library only. Click again to confirm.</span
                >`
              : ""}
          </p>
          <div class="flex items-center gap-2">
            <button
              onClick=${onClose}
              class="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
            >
              Close
            </button>
            <button
              onClick=${removeSelected}
              disabled=${selected.size === 0 || removeBusy}
              class="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${confirmingRemove
                ? "bg-rose-500/25 hover:bg-rose-500/40 border-rose-500/40 text-rose-200"
                : "bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-300"}"
            >
              ${removeBusy
                ? "Removing…"
                : confirmingRemove
                  ? `Confirm remove ${selected.size}`
                  : `Remove selected`}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}
