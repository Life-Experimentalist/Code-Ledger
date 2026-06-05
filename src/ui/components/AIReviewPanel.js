/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
import { AIMarkdownRenderer } from "./AIMarkdownRenderer.js";
const html = htm.bind(h);

import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("AIReviewPanel");

function formatDuration(ms) {
  if (ms == null) return null;
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.ceil(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function QueueStatusCard({
  queueStatus,
  onRunQueueNow,
  runQueueBusy,
  queueError,
  onRemoveFromQueue,
  removeFromQueueBusy,
}) {
  if (!queueStatus) return "";
  const pending = queueStatus.pending || 0;
  const processing = queueStatus.processing || 0;
  const done = queueStatus.done || 0;
  const failed = queueStatus.failed || 0;
  const total = pending + processing + done + failed;
  if (total === 0) return "";

  const nextRunIn =
    queueStatus.nextRunInMs != null
      ? formatDuration(queueStatus.nextRunInMs)
      : null;
  const pausedIn =
    queueStatus.isPaused && queueStatus.pausedUntil
      ? formatDuration(queueStatus.pausedUntil - Date.now())
      : null;
  const nextLabel =
    pending === 0 && processing === 0
      ? done > 0
        ? "AI review complete."
        : failed > 0
          ? `${failed} review(s) failed.`
          : "No queued AI reviews."
      : pausedIn
        ? `Paused for ${pausedIn}`
        : queueStatus.nextRunInMs == null || queueStatus.nextRunInMs <= 0
          ? `Ready now · ${queueStatus.readyCount || 0} ready`
          : `Next auto review in ${nextRunIn}`;

  return html`
    <div
      class="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <p
            class="text-xs font-semibold uppercase tracking-widest text-cyan-300"
          >
            AI Review Queue
          </p>
          <p class="mt-1 text-sm text-slate-200">${nextLabel}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            onClick=${onRunQueueNow}
            disabled=${runQueueBusy ||
            (pending === 0 && processing === 0) ||
            !onRunQueueNow}
            class="px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest border transition-colors ${runQueueBusy ||
            (pending === 0 && processing === 0) ||
            !onRunQueueNow
              ? "bg-white/5 border-white/10 text-slate-500 opacity-60"
              : "bg-cyan-500/10 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20"}"
          >
            ${runQueueBusy ? "Starting…" : "Run now"}
          </button>
          ${onRemoveFromQueue
            ? html`<button
                onClick=${onRemoveFromQueue}
                disabled=${removeFromQueueBusy}
                title="Remove this problem from the review queue"
                class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-40"
              >
                ✕
              </button>`
            : ""}
        </div>
      </div>
      <div class="flex flex-wrap gap-2 text-[11px] text-slate-400">
        ${pending > 0
          ? html`<span
              class="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-300"
            >
              ${pending} pending
            </span>`
          : ""}
        ${processing > 0
          ? html`<span
              class="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-cyan-300"
            >
              ${processing} processing
            </span>`
          : ""}
        ${done > 0
          ? html`<span
              class="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-300"
            >
              ${done} done
            </span>`
          : ""}
        ${failed > 0
          ? html`<span
              class="rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-rose-300"
            >
              ${failed} failed
            </span>`
          : ""}
        ${queueStatus.isPaused && queueStatus.pausedUntil
          ? html`<span
              class="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-300"
            >
              paused
            </span>`
          : ""}
      </div>
      ${queueError
        ? html`<p class="text-xs text-rose-400">${queueError}</p>`
        : ""}
    </div>
  `;
}

export function AIReviewPanel({
  review,
  onGenerate,
  loading,
  error,
  queueStatus,
  onRunQueueNow,
  runQueueBusy,
  queueError,
  onRemoveFromQueue,
  removeFromQueueBusy,
}) {
  const queueCard = html`<${QueueStatusCard}
    queueStatus=${queueStatus}
    onRunQueueNow=${onRunQueueNow}
    runQueueBusy=${runQueueBusy}
    queueError=${queueError}
    onRemoveFromQueue=${onRemoveFromQueue}
    removeFromQueueBusy=${removeFromQueueBusy}
  />`;

  if (loading) {
    return html`
      <div
        class="p-6 bg-[#0a0a0f] rounded-2xl border border-cyan-500/20 animate-pulse flex flex-col gap-4"
      >
        ${queueCard}
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full bg-cyan-500"></div>
          <span class="text-xs font-mono text-cyan-400">AI Reviewing...</span>
        </div>
        <div class="space-y-2">
          <div class="h-3 bg-white/5 rounded w-3/4"></div>
          <div class="h-3 bg-white/5 rounded w-full"></div>
          <div class="h-3 bg-white/5 rounded w-5/6"></div>
        </div>
      </div>
    `;
  }

  if (!review) {
    return html`
      <div
        class="p-6 bg-[#0a0a0f] rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center gap-4"
      >
        ${queueCard}
        <p class="text-sm text-slate-400">
          Get an instant AI review on time/space complexity and optimization.
        </p>
        <button
          onClick=${onGenerate}
          class="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold uppercase tracking-widest text-cyan-400 transition-colors"
        >
          Start Review
        </button>
        ${error ? html`<p class="text-xs text-rose-400">${error}</p>` : ""}
      </div>
    `;
  }

  return html`
    <div
      class="p-6 bg-gradient-to-br from-[#0a0a0f] to-cyan-900/10 rounded-2xl border border-cyan-500/20 flex flex-col gap-4 relative"
    >
      ${queueCard}
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">✨</span>
        <h3 class="text-sm font-semibold text-white">AI Analysis</h3>
      </div>
      <div class="max-w-none text-slate-300">
        <${AIMarkdownRenderer} content=${review} />
      </div>
      <div class="flex justify-end">
        <button
          onClick=${onGenerate}
          class="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold uppercase tracking-widest text-cyan-400 transition-colors"
        >
          Regenerate Review
        </button>
      </div>
      ${error ? html`<p class="text-xs text-rose-400">${error}</p>` : ""}
    </div>
  `;
}
