/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  h,
  useState,
  useEffect,
  useCallback,
} from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
import { highlightCode } from "../../lib/syntax-highlight.js";
import { normalizeCode } from "../../core/ai-deduplication.js";
const html = htm.bind(h);

function classifyConflict(local, remote) {
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
  const diffFields = DIFF_FIELDS.filter((k) => {
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
  if (normalizeCode(local.code || "") === normalizeCode(remote.code || "")) {
    return { type: "same-code", diffFields };
  }
  return { type: "diff-approach", diffFields };
}

function pickBetterVersion(local, remote) {
  const score = (p) => {
    let s = 0;
    if (p.aiReview) s += 10;
    if (Array.isArray(p.tags)) s += p.tags.length;
    if (p.difficulty && p.difficulty !== "?") s += 2;
    if (p.notes) s += 3;
    return s;
  };
  const ls = score(local),
    rs = score(remote);
  if (ls !== rs) return ls > rs ? "local" : "remote";
  return (local.timestamp || 0) >= (remote.timestamp || 0) ? "local" : "remote";
}

function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(Number(ts) < 1e12 ? Number(ts) * 1000 : Number(ts));
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Same-code step ────────────────────────────────────────────────────────────

function SameCodeStep({ conflict, choice, onChoose, onNext }) {
  const { local, remote } = conflict;
  const autoSide = pickBetterVersion(local, remote);
  const [countdown, setCountdown] = useState(8);

  useEffect(() => {
    if (choice !== null) return;
    if (countdown <= 0) {
      onChoose(autoSide);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, choice]);

  // Auto-advance once resolved
  useEffect(() => {
    if (choice === null) return;
    const t = setTimeout(onNext, 700);
    return () => clearTimeout(t);
  }, [choice]);

  return html`
    <div class="flex flex-col gap-4">
      <div class="flex items-center gap-2 flex-wrap">
        <span
          class="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-semibold"
          >same code</span
        >
        <span class="text-[11px] text-slate-500"
          >Code is identical — only metadata differs</span
        >
      </div>

      <div class="grid grid-cols-3 gap-2">
        ${["local", "remote", "both"].map((side) => {
          const p = side === "both" ? null : conflict[side];
          const active = choice === side;
          const isAuto = side === autoSide;
          return html`
            <button
              onClick=${() => {
                setCountdown(8);
                onChoose(side);
              }}
              class="text-left p-3.5 rounded-xl border transition-all ${active
                ? side === "both"
                  ? "bg-violet-500/10 border-violet-500/40 ring-1 ring-violet-500/30"
                  : "bg-cyan-500/10 border-cyan-500/40 ring-1 ring-cyan-500/30"
                : "bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]"}"
            >
              <div class="flex items-center gap-1.5 mb-2">
                <span
                  class="text-xs font-bold uppercase tracking-widest ${active
                    ? side === "both"
                      ? "text-violet-400"
                      : "text-cyan-400"
                    : "text-slate-500"}"
                  >${side}</span
                >
                ${active
                  ? html`<span
                      class="text-[10px] ${side === "both"
                        ? "text-violet-400"
                        : "text-cyan-400"}"
                      >✓</span
                    >`
                  : ""}
                ${isAuto && choice === null && side !== "both"
                  ? html`<span class="text-[9px] text-amber-400/80"
                      >auto ${countdown}s</span
                    >`
                  : ""}
              </div>
              ${side === "both"
                ? html`<div class="text-[11px] text-slate-400 leading-snug">
                    Keep both versions as separate entries
                  </div>`
                : html`
                    <div class="space-y-1 text-[11px] text-slate-400">
                      <div class="font-medium">
                        ${p?.difficulty || "?"} ·
                        ${p?.lang?.name || p?.language || "?"}
                      </div>
                      <div class="text-slate-500">${fmtDate(p?.timestamp)}</div>
                      ${p?.aiReview
                        ? html`<div class="text-emerald-500/80 text-[10px]">
                            ✓ AI review
                          </div>`
                        : ""}
                      ${Array.isArray(p?.tags) && p?.tags.length
                        ? html`<div class="text-slate-600 text-[10px]">
                            ${p?.tags.length}
                            tag${p?.tags.length !== 1 ? "s" : ""}
                          </div>`
                        : ""}
                    </div>
                  `}
            </button>
          `;
        })}
      </div>

      ${choice === null
        ? html`
            <div
              class="flex items-center gap-3 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/15"
            >
              <div class="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  class="h-full bg-amber-400/60 rounded-full transition-all duration-1000"
                  style=${{ width: `${(countdown / 8) * 100}%` }}
                ></div>
              </div>
              <span class="text-[10px] text-amber-400/80 shrink-0"
                >Auto → ${autoSide} in ${countdown}s</span
              >
            </div>
          `
        : html`
            <div class="text-center text-[11px] text-emerald-400/70">
              ✓ Resolved — advancing…
            </div>
          `}
    </div>
  `;
}

// ── Diff-approach step ────────────────────────────────────────────────────────

function DiffApproachStep({ conflict, choice, onChoose }) {
  const { local, remote } = conflict;
  const [expanded, setExpanded] = useState(true);
  const localLang =
    local.lang?.slug || local.lang?.name || local.language || "";
  const remoteLang =
    remote.lang?.slug || remote.lang?.name || remote.language || "";
  const localHighlighted = highlightCode(
    local.code || "// (no code)",
    localLang,
  );
  const remoteHighlighted = highlightCode(
    remote.code || "// (no code)",
    remoteLang,
  );

  return html`
    <div class="flex flex-col gap-4">
      <div class="flex items-center gap-2 flex-wrap">
        <span
          class="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/20 font-semibold"
          >different approach</span
        >
        <span class="text-[11px] text-slate-500"
          >differs: ${conflict._diffFields?.join(", ") || "code"}</span
        >
      </div>

      <!-- Three-way choice -->
      <div class="grid grid-cols-3 gap-2">
        ${["local", "remote", "both"].map((side) => {
          const p = side === "both" ? null : conflict[side];
          const active = choice === side;
          return html`
            <button
              onClick=${() => onChoose(side)}
              class="text-left p-3.5 rounded-xl border transition-all ${active
                ? side === "both"
                  ? "bg-violet-500/10 border-violet-500/40 ring-1 ring-violet-500/30"
                  : "bg-cyan-500/10 border-cyan-500/40 ring-1 ring-cyan-500/30"
                : "bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]"}"
            >
              <div class="flex items-center gap-1.5 mb-2">
                <span
                  class="text-xs font-bold uppercase tracking-widest ${active
                    ? side === "both"
                      ? "text-violet-400"
                      : "text-cyan-400"
                    : "text-slate-500"}"
                  >${side}</span
                >
                ${active
                  ? html`<span
                      class="text-[10px] ${side === "both"
                        ? "text-violet-400"
                        : "text-cyan-400"}"
                      >✓</span
                    >`
                  : ""}
              </div>
              ${side === "both"
                ? html`<div class="text-[11px] text-slate-400 leading-snug">
                    Archive both approaches separately
                  </div>`
                : html`
                    <div class="space-y-1 text-[11px] text-slate-400">
                      <div class="font-medium">
                        ${p?.difficulty || "?"} ·
                        ${p?.lang?.name || p?.language || "?"}
                      </div>
                      <div class="text-slate-500">${fmtDate(p?.timestamp)}</div>
                      ${p?.aiReview
                        ? html`<div class="text-emerald-500/80 text-[10px]">
                            ✓ AI review
                          </div>`
                        : ""}
                    </div>
                  `}
            </button>
          `;
        })}
      </div>

      <!-- Code diff -->
      <button
        onClick=${() => setExpanded((e) => !e)}
        class="self-start text-[11px] px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20 transition-colors"
      >
        ${expanded ? "Hide code ↑" : "Show code diff ↓"}
      </button>

      ${expanded
        ? html`
            <div
              class="grid grid-cols-2 gap-1 rounded-xl overflow-hidden border border-white/10"
            >
              ${["local", "remote"].map((side) => {
                const isLocal = side === "local";
                const highlighted = isLocal
                  ? localHighlighted
                  : remoteHighlighted;
                const lang = isLocal ? localLang : remoteLang;
                return html`
                  <div class="flex flex-col min-w-0">
                    <div
                      class="px-3 py-1.5 bg-black/40 flex items-center justify-between border-b border-white/5"
                    >
                      <span
                        class="text-[10px] uppercase tracking-wide text-slate-500 font-bold"
                        >${side}</span
                      >
                      <span class="text-[10px] font-mono text-cyan-500/60"
                        >${lang}</span
                      >
                    </div>
                    <pre
                      class="text-[11px] leading-relaxed overflow-auto bg-black/30 p-3 whitespace-pre font-mono m-0 max-h-52"
                      dangerouslySetInnerHTML=${{ __html: highlighted }}
                    ></pre>
                  </div>
                `;
              })}
            </div>
          `
        : ""}
      ${!choice
        ? html`
            <p class="text-[11px] text-amber-400/70 text-center">
              Select a version above to continue
            </p>
          `
        : ""}
    </div>
  `;
}

// ── Main modal ────────────────────────────────────────────────────────────────

/**
 * onCancel(resolvedSoFar, remainingConflicts)
 *   resolvedSoFar   — Problem[] already chosen by the user (may be empty)
 *   remainingConflicts — raw conflict objects not yet resolved
 * Caller should apply resolvedSoFar and re-queue remainingConflicts.
 */
export function ConflictResolutionModal({
  conflicts,
  remoteOnly = [],
  onResolve,
  onCancel,
  providerName = "Remote",
}) {
  // Classify and sort: diff-approach (need review) first, same-code (auto) last
  const classified = conflicts
    .filter((c) => c && c.local && c.remote)
    .map((c) => {
      try {
        const cls = classifyConflict(c.local, c.remote);
        return { ...c, _type: cls.type, _diffFields: cls.diffFields };
      } catch (_) {
        return { ...c, _type: "diff-approach", _diffFields: ["code"] };
      }
    })
    .sort((a, b) => {
      if (a._type === b._type) return 0;
      return a._type === "diff-approach" ? -1 : 1; // diff-approach first
    });

  const [choices, setChoices] = useState(() =>
    new Array(classified.length).fill(null),
  );
  const [cursor, setCursor] = useState(0);

  const current = classified[cursor] || null;
  const currentChoice = choices[cursor] ?? null;
  const resolvedCount = choices.filter((c) => c !== null).length;
  const allResolved =
    classified.length === 0 || resolvedCount === classified.length;
  const sameCodeCount = classified.filter(
    (c) => c._type === "same-code",
  ).length;
  const diffApproachCount = classified.filter(
    (c) => c._type === "diff-approach",
  ).length;

  const choose = useCallback(
    (side) => {
      setChoices((prev) => {
        const n = [...prev];
        n[cursor] = side;
        return n;
      });
    },
    [cursor],
  );

  const goNext = useCallback(() => {
    setCursor((c) => Math.min(c + 1, classified.length - 1));
  }, [classified.length]);

  const goPrev = useCallback(() => setCursor((c) => Math.max(c - 1, 0)), []);

  const handleNext = useCallback(() => {
    if (cursor < classified.length - 1) {
      goNext();
    } else {
      const first = choices.findIndex((c) => c === null);
      if (first >= 0) setCursor(first);
    }
  }, [cursor, classified.length, choices, goNext]);

  function acceptAll(side) {
    setChoices(new Array(classified.length).fill(side));
    setCursor(classified.length - 1);
  }

  function buildResolved(chArr) {
    const resolved = [];
    classified.forEach((c, i) => {
      const ch = chArr[i];
      if (ch === null) return; // skip unresolved
      if (ch === "both") {
        resolved.push(c.local);
        const remoteId =
          (c.remote.id || c.remote.titleSlug || "r") +
          "-alt-" +
          Date.now() +
          "-" +
          i;
        resolved.push({ ...c.remote, id: remoteId });
      } else if (ch === "remote") {
        resolved.push(c.remote);
      } else {
        resolved.push(c.local);
      }
    });
    return resolved;
  }

  function handleApply() {
    onResolve([...buildResolved(choices), ...remoteOnly]);
  }

  function handleCancel() {
    const resolvedSoFar = buildResolved(choices);
    const remaining = classified.filter((_, i) => choices[i] === null);
    onCancel(resolvedSoFar, remaining);
  }

  const showDots = classified.length <= 20;

  return html`
    <div
      class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onClick=${(e) => e.target === e.currentTarget && handleCancel()}
    >
      <div
        class="bg-[#0a0a0f] border border-cyan-500/20 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
      >
        <!-- Header -->
        <div class="px-5 py-4 border-b border-white/5 shrink-0">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <h2 class="text-base font-bold text-white truncate">
                Sync Conflicts — ${providerName}
              </h2>
              <p
                class="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5"
              >
                <span
                  >${classified.length}
                  conflict${classified.length !== 1 ? "s" : ""}</span
                >
                <span>·</span>
                <span
                  class="${resolvedCount === classified.length &&
                  classified.length > 0
                    ? "text-emerald-400"
                    : "text-slate-400"}"
                  >${resolvedCount} resolved</span
                >
                ${diffApproachCount > 0
                  ? html`<span>·</span
                      ><span class="text-amber-400"
                        >${diffApproachCount} need review</span
                      >`
                  : ""}
                ${sameCodeCount > 0
                  ? html`<span>·</span
                      ><span class="text-slate-400"
                        >${sameCodeCount} auto</span
                      >`
                  : ""}
                ${remoteOnly.length > 0
                  ? html`<span>·</span
                      ><span class="text-slate-400"
                        >${remoteOnly.length} new</span
                      >`
                  : ""}
              </p>
            </div>
            <div class="flex gap-1.5 shrink-0">
              <button
                onClick=${() => acceptAll("local")}
                class="text-[11px] px-2.5 py-1 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-colors"
              >
                All local
              </button>
              <button
                onClick=${() => acceptAll("remote")}
                class="text-[11px] px-2.5 py-1 rounded-lg border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition-colors"
              >
                All remote
              </button>
              <button
                onClick=${() => acceptAll("both")}
                class="text-[11px] px-2.5 py-1 rounded-lg border border-violet-500/30 text-violet-400 hover:bg-violet-500/10 transition-colors"
              >
                Keep all both
              </button>
            </div>
          </div>

          <!-- Progress bar -->
          <div class="mt-3 flex items-center gap-3">
            <div class="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                class="h-full bg-cyan-500 rounded-full transition-all duration-300"
                style=${{
                  width: classified.length
                    ? `${(resolvedCount / classified.length) * 100}%`
                    : "0%",
                }}
              ></div>
            </div>
            <span
              class="text-[11px] text-slate-500 shrink-0 font-mono tabular-nums"
              >${cursor + 1} / ${classified.length}</span
            >
          </div>

          ${showDots
            ? html`
                <div class="mt-2.5 flex flex-wrap gap-1.5">
                  ${classified.map(
                    (c, i) => html`
                      <button
                        key=${i}
                        onClick=${() => setCursor(i)}
                        title=${c.local?.title || `Conflict ${i + 1}`}
                        class="w-2 h-2 rounded-full transition-all ${i ===
                        cursor
                          ? "bg-cyan-400 scale-[1.4]"
                          : choices[i] === "both"
                            ? "bg-violet-400/70"
                            : choices[i] !== null
                              ? "bg-emerald-500/60"
                              : c._type === "diff-approach"
                                ? "bg-amber-400/50"
                                : "bg-white/20"}"
                      ></button>
                    `,
                  )}
                </div>
              `
            : ""}
        </div>

        <!-- Single conflict step -->
        <div class="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          ${classified.length === 0
            ? html`
                <div
                  class="flex flex-col items-center justify-center py-16 gap-3 text-center"
                >
                  <span class="text-3xl">✅</span>
                  <p class="text-slate-300 text-sm font-medium">
                    No conflicts to resolve
                  </p>
                  <p class="text-slate-500 text-xs max-w-xs">
                    All problems are already in sync.
                  </p>
                </div>
              `
            : html`
                <div class="mb-4">
                  <h3 class="text-sm font-semibold text-white leading-tight">
                    ${current?.local?.title || current?.local?.id || "Unknown"}
                  </h3>
                  ${current?._type === "diff-approach"
                    ? html`<p class="text-[10px] text-amber-400/70 mt-0.5">
                        Manual review required
                      </p>`
                    : html`<p class="text-[10px] text-slate-500 mt-0.5">
                        Auto-selectable — same code, metadata only differs
                      </p>`}
                </div>

                ${current?._type === "same-code"
                  ? html`<${SameCodeStep}
                      key=${cursor}
                      conflict=${current}
                      choice=${currentChoice}
                      onChoose=${choose}
                      onNext=${handleNext}
                    />`
                  : html`<${DiffApproachStep}
                      key=${cursor}
                      conflict=${current}
                      choice=${currentChoice}
                      onChoose=${choose}
                    />`}
              `}
        </div>

        <!-- Footer -->
        <div
          class="px-5 py-3.5 border-t border-white/5 flex items-center justify-between shrink-0 gap-3"
        >
          <div class="flex items-center gap-2">
            <button
              onClick=${handleCancel}
              class="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              ${resolvedCount > 0 ? "Save & Close" : "Cancel"}
            </button>
            ${classified.length > 1
              ? html`
                  <button
                    onClick=${goPrev}
                    disabled=${cursor === 0}
                    class="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Prev
                  </button>
                `
              : ""}
          </div>

          <div class="flex items-center gap-2">
            ${!allResolved && classified.length > 1
              ? html`
                  <button
                    onClick=${handleNext}
                    class="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white transition-colors"
                  >
                    ${cursor < classified.length - 1
                      ? "Next →"
                      : "Review unresolved →"}
                  </button>
                `
              : ""}
            <button
              onClick=${handleApply}
              disabled=${!allResolved}
              class="px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${allResolved
                ? "bg-cyan-500 text-black hover:bg-cyan-400"
                : "bg-white/5 text-slate-600 cursor-not-allowed"}"
            >
              Apply & Import ${remoteOnly.length + classified.length}
              problem${remoteOnly.length + classified.length !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}
