/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sequential Dedup Review Queue
 * - Processes conflicts one-at-a-time (not all visible simultaneously)
 * - Per-item 5s countdown for user decision
 * - Individual freeze/resume controls
 * - Global freeze/resume buttons
 * - "Let AI Decide" button showing AI decision
 * - Comprehensive dedup logging
 */

import { h, useState, useEffect, useRef, useCallback } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";
import { createDebugger } from "../../lib/debug.js";
import { runtime } from "../../lib/browser-compat.js";
import { normalizeCode } from "../../core/duplicate-detector.js";
import { isAIActive } from "../../core/feature-flags.js";

const dbg = createDebugger("DedupReviewQueue");

const COUNTDOWN_SECONDS = 5;
const AI_DECIDE_TIMEOUT_MS = 10000;

function getProblemCommitKey(p) {
  if (!p?.titleSlug || !p?.lang?.slug) return null;
  return `${p.titleSlug}::${p.lang.slug}`;
}

function fmtDate(ts) {
  if (!ts) return "unknown";
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function CodeBlock({ code, label, meta }) {
  return html`
    <div class="flex-1 min-w-0">
      <div class="text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1">
        ${label}
      </div>
      ${meta && html`<div class="text-[10px] text-slate-500 mb-1">${meta}</div>`}
      <pre
        class="bg-black/30 border border-white/5 rounded-lg p-3 text-[11px] text-slate-300 overflow-auto max-h-48 whitespace-pre-wrap break-all"
      >
${code || "(no code)"}</pre
      >
    </div>
  `;
}

function ConflictItem({ item, candidate, onResolved, globalFrozen, onShowAIDecision, aiOn }) {
  const [seconds, setSeconds] = useState(COUNTDOWN_SECONDS);
  const [resolving, setResolving] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const [aiDecision, setAiDecision] = useState(null);
  const [aiDeciding, setAiDeciding] = useState(false);
  const timerRef = useRef(null);
  const cancelledRef = useRef(false);
  const effectivelyFrozen = isFrozen || globalFrozen;

  // Check at mount whether codes are actually identical (normalized).
  const codesAreIdentical = normalizeCode(item.code) === normalizeCode(candidate.code);
  const [identicalCountdown, setIdenticalCountdown] = useState(codesAreIdentical ? 3 : null);

  const cancelTimer = useCallback(() => {
    cancelledRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const freezeTimer = useCallback(() => {
    setIsFrozen(true);
    if (timerRef.current) clearInterval(timerRef.current);
    dbg.log(`[CodeLedger:DedupReviewQueue] ⏸ Froze timer for ${item.titleSlug}`);
  }, [item.titleSlug]);

  const resumeTimer = useCallback(() => {
    setIsFrozen(false);
    dbg.log(`[CodeLedger:DedupReviewQueue] ▶ Resumed timer for ${item.titleSlug}`);
  }, [item.titleSlug]);

  // Keep oldest (primary wins)
  const resolveKeepPrimary = useCallback(async () => {
    cancelTimer();
    setResolving(true);
    try {
      const primary = await Storage.getProblem(item.id);
      if (!primary) {
        dbg.error(`[CodeLedger:DedupReviewQueue] ✗ resolveKeepPrimary: item ${item.id} not found`);
        setResolving(false);
        return;
      }
      const updated = { ...primary, conflictPending: false };
      delete updated.conflictCandidates;
      await Storage.saveProblem(updated);
      if (candidate.id) {
        const dup = await Storage.getProblem(candidate.id).catch(() => null);
        if (dup) {
          await Storage.saveProblem({
            ...dup,
            isDuplicate: true,
            duplicateOf: primary.id,
          }).catch(() => {});
          dbg.log(
            `[CodeLedger:DedupReviewQueue] ✓ Marked ${dup.titleSlug} as duplicate of ${primary.titleSlug}`,
          );
        }
      }
      dbg.log(
        `[CodeLedger:DedupReviewQueue] ✓ Resolved ${primary.titleSlug} — kept primary (oldest)`,
      );
      onResolved(item.id);
    } catch (e) {
      dbg.error(`[CodeLedger:DedupReviewQueue] ✗ resolveKeepPrimary failed: ${e?.message}`);
      setResolving(false);
    }
  }, [item, candidate, cancelTimer, onResolved]);

  // Overwrite with candidate (newest wins)
  const resolveKeepCandidate = useCallback(async () => {
    cancelTimer();
    setResolving(true);
    try {
      const primary = await Storage.getProblem(item.id);
      if (!primary) {
        dbg.error(
          `[CodeLedger:DedupReviewQueue] ✗ resolveKeepCandidate: item ${item.id} not found`,
        );
        setResolving(false);
        return;
      }
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
          await Storage.saveProblem({
            ...dup,
            isDuplicate: true,
            duplicateOf: primary.id,
          }).catch(() => {});
          dbg.log(
            `[CodeLedger:DedupReviewQueue] ✓ Marked ${dup.titleSlug} as duplicate of ${primary.titleSlug}`,
          );
        }
      }
      dbg.log(
        `[CodeLedger:DedupReviewQueue] ✓ Resolved ${primary.titleSlug} — kept candidate (newest)`,
      );
      onResolved(item.id);
    } catch (e) {
      dbg.error(`[CodeLedger:DedupReviewQueue] ✗ resolveKeepCandidate failed: ${e?.message}`);
      setResolving(false);
    }
  }, [item, candidate, cancelTimer, onResolved]);

  // Store both as Methods on primary
  const resolveBothAsMethods = useCallback(async () => {
    cancelTimer();
    setResolving(true);
    try {
      const primary = await Storage.getProblem(item.id);
      if (!primary) {
        dbg.error(
          `[CodeLedger:DedupReviewQueue] ✗ resolveBothAsMethods: item ${item.id} not found`,
        );
        setResolving(false);
        return;
      }
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
          await Storage.saveProblem({
            ...dup,
            isDuplicate: true,
            duplicateOf: primary.id,
          }).catch(() => {});
          dbg.log(
            `[CodeLedger:DedupReviewQueue] ✓ Marked ${dup.titleSlug} as duplicate of ${primary.titleSlug}`,
          );
        }
      }
      dbg.log(`[CodeLedger:DedupReviewQueue] ✓ Resolved ${primary.titleSlug} — added as methods`);
      onResolved(item.id);
    } catch (e) {
      dbg.error(`[CodeLedger:DedupReviewQueue] ✗ resolveBothAsMethods failed: ${e?.message}`);
      setResolving(false);
    }
  }, [item, candidate, cancelTimer, onResolved]);

  // Fetch AI decision and show it (don't auto-apply)
  const requestAIDecision = useCallback(async () => {
    cancelTimer();
    setAiDeciding(true);
    try {
      const result = await Promise.race([
        new Promise((resolve) => {
          runtime.sendMessage(
            {
              type: "AI_COMPARE_SOLUTIONS",
              primary: { code: item.code, lang: item.lang?.name },
              candidate: { code: candidate.code, lang: candidate.lang?.name },
            },
            (r) => resolve(r || {}),
          );
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("AI timeout")), AI_DECIDE_TIMEOUT_MS),
        ),
      ]);
      setAiDecision(result);
      dbg.log(
        `[CodeLedger:DedupReviewQueue] 🤖 AI decision for ${item.titleSlug}: ${result?.same ? "same code" : "different approaches"}`,
      );
      if (onShowAIDecision) {
        onShowAIDecision({
          item,
          candidate,
          decision: result?.same ? "keep_primary" : "both_as_methods",
          reason: result?.same ? "Code is functionally identical" : "Different approaches detected",
        });
      }
    } catch (e) {
      dbg.warn(`[CodeLedger:DedupReviewQueue] ✗ AI decision failed: ${e?.message}`);
      setAiDecision({ error: e?.message });
    } finally {
      setAiDeciding(false);
    }
  }, [item, candidate, cancelTimer, onShowAIDecision]);

  // Apply AI decision
  const applyAIDecision = useCallback(async () => {
    if (aiDecision?.same) {
      await resolveKeepPrimary();
    } else {
      await resolveBothAsMethods();
    }
  }, [aiDecision, resolveKeepPrimary, resolveBothAsMethods]);

  // Identical code fast-path: 3s countdown then auto-merge
  useEffect(() => {
    if (!codesAreIdentical) return;
    const id = setInterval(() => {
      setIdenticalCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          if (!cancelledRef.current && !resolving && !effectivelyFrozen) {
            resolveKeepPrimary();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [effectivelyFrozen, resolving]); // eslint-disable-line react-hooks/exhaustive-deps

  // If codes are identical show a short notice
  if (codesAreIdentical) {
    return html`
      <div
        class="p-4 bg-emerald-900/20 border border-emerald-500/20 rounded-xl flex items-center gap-3 flex-wrap"
      >
        <span class="text-emerald-400 text-sm">✓ Identical code detected</span>
        <span class="text-slate-400 text-xs"
          >${item.title || item.titleSlug} · ${item.lang?.name}</span
        >
        ${identicalCountdown > 0 && !effectivelyFrozen
          ? html`<span class="ml-auto text-xs text-slate-500"
              >Auto-merging in ${identicalCountdown}s…</span
            >`
          : identicalCountdown > 0 && effectivelyFrozen
            ? html`<span class="ml-auto text-xs text-slate-400">⏸ Paused</span>`
            : html`<span class="ml-auto text-xs text-slate-400">Merging…</span>`}
      </div>
    `;
  }

  // Start per-item countdown for genuinely different codes (respects freeze state).
  // The countdown exists only to hand the decision to a model when the user does
  // not make one; with no provider switched on there is nothing to hand it to, so
  // the item simply waits.
  useEffect(() => {
    if (!aiOn) return;
    if (effectivelyFrozen || seconds <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          if (!cancelledRef.current && !resolving && !effectivelyFrozen) {
            requestAIDecision();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [aiOn, effectivelyFrozen, resolving, requestAIDecision]);

  const progress = Math.round((seconds / COUNTDOWN_SECONDS) * 100);

  return html`
    <div class="p-4 bg-white/3 border border-white/8 rounded-xl space-y-3">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-sm font-medium text-white">${item.title || item.titleSlug}</span>
        <span
          class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300"
        >
          ${item.lang?.name || "unknown"}
        </span>
        ${item.difficulty &&
        html`
          <span
            class="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-400"
          >
            ${item.difficulty}
          </span>
        `}
        ${aiDecision &&
        html`
          <span
            class="ml-auto text-[10px] px-2 py-0.5 rounded-full ${aiDecision.error
              ? "bg-red-500/15 border border-red-500/30 text-red-300"
              : aiDecision.same
                ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                : "bg-purple-500/15 border border-purple-500/30 text-purple-300"}"
          >
            🤖 ${aiDecision.error ? "Error" : aiDecision.same ? "Same" : "Different"}
          </span>
        `}
      </div>

      <div class="flex gap-3">
        <div class="flex-1 min-w-0">
          <div class="text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1">
            Primary (oldest)
          </div>
          <div class="text-[10px] text-slate-500 mb-1">
            ${new Date(item.timestamp).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </div>
          <pre
            class="bg-black/30 border border-white/5 rounded-lg p-3 text-[11px] text-slate-300 overflow-auto max-h-48 whitespace-pre-wrap break-all"
          >
${item.code || "(no code)"}</pre
          >
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1">
            Candidate
          </div>
          <div class="text-[10px] text-slate-500 mb-1">
            ${new Date(candidate.timestamp).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </div>
          <pre
            class="bg-black/30 border border-white/5 rounded-lg p-3 text-[11px] text-slate-300 overflow-auto max-h-48 whitespace-pre-wrap break-all"
          >
${candidate.code || "(no code)"}</pre
          >
        </div>
      </div>

      ${aiDecision
        ? html`
            <div class="p-3 bg-blue-900/20 border border-blue-500/20 rounded-lg">
              <div class="text-xs font-medium text-blue-200 mb-2">🤖 AI Decision</div>
              <div class="text-xs text-blue-100 mb-3">
                ${aiDecision.error
                  ? html`<span class="text-red-300">Error: ${aiDecision.error}</span>`
                  : aiDecision.same
                    ? html`<span
                        >Code is functionally identical. Recommendation:
                        <strong>Keep oldest</strong></span
                      >`
                    : html`<span
                        >Different approaches detected. Recommendation:
                        <strong>Add as methods</strong></span
                      >`}
              </div>
              <div class="flex gap-2 flex-wrap">
                <button
                  onClick=${applyAIDecision}
                  disabled=${resolving}
                  class="px-3 py-1 text-xs rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-200 hover:bg-blue-600/40 disabled:opacity-40 transition-colors"
                >
                  Apply Decision
                </button>
                <button
                  onClick=${() => setAiDecision(null)}
                  disabled=${resolving}
                  class="px-3 py-1 text-xs rounded-lg bg-slate-600/20 border border-slate-500/30 text-slate-200 hover:bg-slate-600/40 disabled:opacity-40 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          `
        : ""}

      <div class="flex items-center gap-2 flex-wrap">
        <button
          onClick=${() => {
            cancelTimer();
            resolveKeepPrimary();
          }}
          disabled=${resolving || effectivelyFrozen}
          class="px-3 py-1.5 text-xs rounded-lg bg-emerald-600/15 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-600/30 disabled:opacity-40 transition-colors"
        >
          Keep oldest
        </button>
        <button
          onClick=${() => {
            cancelTimer();
            resolveKeepCandidate();
          }}
          disabled=${resolving || effectivelyFrozen}
          class="px-3 py-1.5 text-xs rounded-lg bg-sky-600/15 border border-sky-500/30 text-sky-200 hover:bg-sky-600/30 disabled:opacity-40 transition-colors"
        >
          Keep newest
        </button>
        <button
          onClick=${() => {
            cancelTimer();
            resolveBothAsMethods();
          }}
          disabled=${resolving || effectivelyFrozen}
          class="px-3 py-1.5 text-xs rounded-lg bg-violet-600/15 border border-violet-500/30 text-violet-200 hover:bg-violet-600/30 disabled:opacity-40 transition-colors"
        >
          Both as Methods
        </button>

        ${aiOn
          ? html`
              <button
                onClick=${requestAIDecision}
                disabled=${resolving || aiDeciding}
                class="px-3 py-1.5 text-xs rounded-lg bg-purple-600/15 border border-purple-500/30 text-purple-200 hover:bg-purple-600/30 disabled:opacity-40 transition-colors"
              >
                ${aiDeciding ? "Asking AI…" : "Ask AI"}
              </button>
            `
          : ""}

        <button
          onClick=${isFrozen ? resumeTimer : freezeTimer}
          class="px-3 py-1.5 text-xs rounded-lg ${isFrozen
            ? "bg-orange-600/15 border border-orange-500/30 text-orange-200 hover:bg-orange-600/30"
            : "bg-slate-600/15 border border-slate-500/30 text-slate-200 hover:bg-slate-600/30"} transition-colors"
        >
          ${isFrozen ? "▶ Resume" : "⏸ Freeze"}
        </button>

        ${resolving
          ? html`<span class="ml-auto text-xs text-slate-400">Resolving…</span>`
          : aiOn && seconds > 0 && !effectivelyFrozen
            ? html`
                <span class="ml-auto flex items-center gap-2 text-xs text-slate-400">
                  Decide in
                  <span class="relative w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <span
                      class="absolute inset-y-0 left-0 bg-amber-400 rounded-full transition-all"
                      style="width: ${progress}%"
                    ></span>
                  </span>
                  ${seconds}s
                </span>
              `
            : effectivelyFrozen
              ? html`<span class="ml-auto text-xs text-orange-400">⏸ Paused</span>`
              : aiOn
                ? html`<span class="ml-auto text-xs text-slate-400">Will auto-ask AI…</span>`
                : html`<span class="ml-auto text-xs text-slate-400">Waiting on you</span>`}
      </div>
    </div>
  `;
}

export function DedupReviewQueue({ onClose = () => {} }) {
  const [allItems, setAllItems] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [globalFrozen, setGlobalFrozen] = useState(false);
  const [aiDecisionItem, setAiDecisionItem] = useState(null);
  const [aiOn, setAiOn] = useState(false);

  useEffect(() => {
    loadQueue();
    // Starts false so the five-second auto-ask cannot fire in the gap before
    // settings arrive — a conflict resolved by a model the user never enabled
    // is not recoverable by turning the switch back off.
    Storage.getSettings()
      .then((s) => setAiOn(isAIActive(s)))
      .catch(() => {});
  }, []);

  async function loadQueue() {
    try {
      const problems = await Storage.getAllProblems().catch(() => []);
      // Show new conflictPending items AND legacy aiMergePending items
      const conflictItems = (problems || [])
        .filter((p) => p?.conflictPending === true || p?.aiMergePending === true)
        .map((p, idx) => ({ ...p, _queueIdx: idx }));
      setAllItems(conflictItems);
      dbg.log(
        `[CodeLedger:DedupReviewQueue] Loaded ${conflictItems.length} conflict(s) into queue`,
      );
    } catch (e) {
      dbg.error("[CodeLedger:DedupReviewQueue] Failed to load queue:", e);
    } finally {
      setLoading(false);
    }
  }

  const handleResolved = useCallback((itemId) => {
    dbg.log(`[CodeLedger:DedupReviewQueue] ✓ Item resolved: ${itemId}`);
    setAllItems((items) => {
      const updated = items.filter((x) => x.id !== itemId);
      if (updated.length === 0) {
        dbg.log("[CodeLedger:DedupReviewQueue] ✓ All conflicts resolved!");
      } else {
        dbg.log(`[CodeLedger:DedupReviewQueue] Remaining: ${updated.length} conflict(s)`);
      }
      return updated;
    });
  }, []);

  const handleShowAIDecision = useCallback((decisionData) => {
    setAiDecisionItem(decisionData);
  }, []);

  // Legacy aiMergePending handlers
  async function handleLegacyApprove(item) {
    const p = await Storage.getProblem(item.id).catch(() => null);
    if (!p) return;
    p.code = p.aiMergeProposedCode || p.code;
    delete p.aiMergePending;
    delete p.aiMergeOriginalCode;
    delete p.aiMergeProposedCode;
    delete p.aiMergeSources;
    await Storage.saveProblem(p).catch(() => {});
    dbg.log(`[CodeLedger:DedupReviewQueue] ✓ Legacy item approved: ${item.titleSlug}`);
    handleResolved(item.id);
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
    dbg.log(`[CodeLedger:DedupReviewQueue] ✓ Legacy item rejected: ${item.titleSlug}`);
    handleResolved(item.id);
  }

  const currentItem = allItems[currentIdx];
  const hasMore = currentIdx < allItems.length - 1;

  const nextConflict = () => {
    if (hasMore) {
      setCurrentIdx((idx) => idx + 1);
      setAiDecisionItem(null);
      dbg.log(`[CodeLedger:DedupReviewQueue] → Next: item ${currentIdx + 2}/${allItems.length}`);
    }
  };

  const prevConflict = () => {
    if (currentIdx > 0) {
      setCurrentIdx((idx) => idx - 1);
      setAiDecisionItem(null);
      dbg.log(`[CodeLedger:DedupReviewQueue] ← Prev: item ${currentIdx}/${allItems.length}`);
    }
  };

  const jumpToIndex = (idx) => {
    if (idx >= 0 && idx < allItems.length) {
      setCurrentIdx(idx);
      setAiDecisionItem(null);
      dbg.log(`[CodeLedger:DedupReviewQueue] Jump to item ${idx + 1}/${allItems.length}`);
    }
  };

  return html`
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/60" onClick=${onClose}></div>
      <div
        class="relative w-full max-w-4xl mx-4 bg-slate-900 rounded-xl border border-white/10 flex flex-col max-h-[90vh]"
      >
        <!-- Header with global controls -->
        <div class="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/8">
          <div>
            <h3 class="text-base font-semibold text-white">
              ${allItems.length === 0
                ? "Conflict Review"
                : `Conflict Review — ${currentIdx + 1}/${allItems.length}`}
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">
              ${allItems.length === 0
                ? "No conflicts — all duplicates are resolved."
                : globalFrozen
                  ? "⏸ Global pause active — timers frozen"
                  : `Sequential review · 5s per item · ${allItems.length - currentIdx - 1} remaining`}
            </p>
          </div>
          <div class="flex gap-2">
            <button
              onClick=${() => setGlobalFrozen(!globalFrozen)}
              disabled=${allItems.length === 0}
              class="px-3 py-1.5 text-xs rounded-lg ${globalFrozen
                ? "bg-orange-600/20 border border-orange-500/30 text-orange-200"
                : "bg-slate-600/20 border border-slate-500/30 text-slate-200"} hover:opacity-80 disabled:opacity-50 transition-colors"
              title="${globalFrozen ? "Resume all timers" : "Pause all timers"}"
            >
              ${globalFrozen ? "▶ Resume All" : "⏸ Freeze All"}
            </button>
            <button onClick=${onClose} class="text-slate-400 hover:text-white text-xl leading-none">
              ✕
            </button>
          </div>
        </div>

        <!-- Content area -->
        <div class="overflow-y-auto flex-1 p-6 space-y-4">
          ${loading
            ? html`<div class="text-sm text-slate-400">Loading conflicts…</div>`
            : allItems.length === 0
              ? html`<div class="text-sm text-slate-400">
                  ✓ All done! No more conflicts to review.
                </div>`
              : currentItem
                ? html`
                    <!-- Display current item -->
                    ${currentItem.conflictPending && currentItem.conflictCandidates?.length
                      ? html`
                          <${ConflictItem}
                            item=${currentItem}
                            candidate=${currentItem.conflictCandidates[0]}
                            onResolved=${handleResolved}
                            globalFrozen=${globalFrozen}
                            onShowAIDecision=${handleShowAIDecision}
                            aiOn=${aiOn}
                          />
                        `
                      : html`
                          <!-- Legacy aiMergePending -->
                          <div class="p-4 bg-white/3 border border-white/8 rounded-xl space-y-3">
                            <div class="text-sm font-medium text-white">${currentItem.title}</div>
                            <div class="text-xs text-slate-400">
                              AI merge proposal · ${currentItem.lang?.name || "unknown"}
                            </div>
                            <div class="text-xs text-slate-500 space-y-1">
                              <div>
                                Original: ${String(currentItem.aiMergeOriginalCode || "").length}
                                chars
                              </div>
                              <div>
                                Proposed: ${String(currentItem.aiMergeProposedCode || "").length}
                                chars
                              </div>
                            </div>
                            <div class="flex gap-2">
                              <button
                                onClick=${() => handleLegacyApprove(currentItem)}
                                class="px-3 py-1 bg-emerald-600/20 border border-emerald-500/30 text-emerald-200 text-xs rounded hover:bg-emerald-600/40 transition-colors"
                              >
                                Approve
                              </button>
                              <button
                                onClick=${() => handleLegacyReject(currentItem)}
                                class="px-3 py-1 bg-white/5 border border-white/10 text-slate-300 text-xs rounded hover:bg-white/10 transition-colors"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        `}
                  `
                : html`<div class="text-sm text-slate-400">No item</div>`}
        </div>

        <!-- Footer with navigation -->
        ${allItems.length > 0
          ? html`
              <div
                class="flex items-center justify-between gap-4 px-6 py-4 border-t border-white/8"
              >
                <div class="flex gap-2">
                  <button
                    onClick=${prevConflict}
                    disabled=${currentIdx === 0}
                    class="px-3 py-1 text-xs rounded-lg bg-slate-600/20 border border-slate-500/30 text-slate-300 hover:bg-slate-600/40 disabled:opacity-30 transition-colors"
                  >
                    ← Previous
                  </button>
                  <button
                    onClick=${nextConflict}
                    disabled=${!hasMore}
                    class="px-3 py-1 text-xs rounded-lg bg-slate-600/20 border border-slate-500/30 text-slate-300 hover:bg-slate-600/40 disabled:opacity-30 transition-colors"
                  >
                    Next →
                  </button>
                </div>

                <!-- Quick jump -->
                <div class="flex gap-1">
                  ${allItems
                    .slice(Math.max(0, currentIdx - 2), Math.min(allItems.length, currentIdx + 3))
                    .map((item, relIdx) => {
                      const actualIdx = currentIdx - 2 + relIdx;
                      return html`
                        <button
                          onClick=${() => jumpToIndex(actualIdx)}
                          class="px-2 py-1 text-xs rounded-lg ${actualIdx === currentIdx
                            ? "bg-blue-600 border border-blue-500 text-white"
                            : "bg-slate-600/20 border border-slate-500/30 text-slate-300 hover:bg-slate-600/40"} transition-colors"
                        >
                          ${actualIdx + 1}
                        </button>
                      `;
                    })}
                </div>

                <div class="text-xs text-slate-500">${currentIdx + 1} / ${allItems.length}</div>
              </div>
            `
          : ""}
      </div>
    </div>
  `;
}
