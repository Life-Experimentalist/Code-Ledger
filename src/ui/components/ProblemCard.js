/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { createDebugger } from "../../lib/debug.js";
import { CONSTANTS } from "../../core/constants.js";
import { cleanGfgSlug } from "../../core/gfg-utils.js";
import { cfProblemUrl } from "../../core/cf-utils.js";
import { classifyTopic, KIND, KIND_ORDER, KIND_LABEL } from "../../core/topic-taxonomy.js";

const dbg = createDebugger("ProblemCard");

const PLATFORM_META = {
  leetcode: {
    favicon: "https://assets.leetcode.com/static_assets/public/icons/favicon.ico",
    label: "LeetCode",
    color: CONSTANTS.PLATFORMS.leetcode.color,
    url: (slug) => CONSTANTS.PLATFORMS.leetcode.problemsBase + slug + "/",
  },
  geeksforgeeks: {
    favicon: "https://www.geeksforgeeks.org/favicon.ico",
    label: "GeeksForGeeks",
    color: CONSTANTS.PLATFORMS.geeksforgeeks.color,
    url: (slug) => CONSTANTS.PLATFORMS.geeksforgeeks.practiceBase + cleanGfgSlug(slug) + "/1",
  },
  codeforces: {
    favicon: "https://codeforces.com/favicon.ico",
    label: "Codeforces",
    color: CONSTANTS.PLATFORMS.codeforces.color,
    url: (slug) => cfProblemUrl(slug) || CONSTANTS.PLATFORMS.codeforces.problemsetUrl,
  },
};

const DIFF_STYLE = {
  Easy: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
  Medium: "bg-amber-500/10 text-amber-400 border border-amber-500/30",
  Hard: "bg-red-500/10 text-red-400 border border-red-500/30",
};

/**
 * ProblemCard — shows a solved problem.
 *
 * @param {object} problem  - the problem object
 * @param {function} [onSelect] - if provided, clicking the card body opens the modal;
 *                                 the "↗" link still navigates directly to the platform.
 */
export function ProblemCard({
  problem,
  onSelect,
  onRefresh,
  selectionMode = false,
  selected = false,
  onToggleSelect,
}) {
  const diffStyle =
    DIFF_STYLE[problem.difficulty] || "bg-slate-500/10 text-slate-400 border border-slate-500/30";
  const meta = PLATFORM_META[problem.platform] || {
    label: problem.platform,
    color: "#64748b",
    url: () => "#",
    favicon: null,
  };
  const problemUrl = meta.url(problem.titleSlug || problem.id || "");
  // Canonical topics, algorithms first — the interesting chip ("Binary
  // Search") leads and the container chip ("Array") trails, on every card.
  const topics = (() => {
    const raw =
      Array.isArray(problem.tags) && problem.tags.length
        ? problem.tags
        : problem.topic
          ? [problem.topic]
          : [];
    const seen = new Map();
    for (const t of raw) {
      if (!t) continue;
      const { topic, kind } = classifyTopic(t);
      if (!topic || seen.has(topic)) continue;
      seen.set(topic, kind);
    }
    const rank = (k) => {
      const i = KIND_ORDER.indexOf(k);
      return i === -1 ? KIND_ORDER.length : i;
    };
    const out = [...seen.entries()]
      .sort((a, b) => rank(a[1]) - rank(b[1]) || a[0].localeCompare(b[0]))
      .map(([topic, kind]) => ({ topic, kind }));
    return out.length ? out : [{ topic: "General", kind: null }];
  })();
  const langName = problem.lang?.name || problem.language || null;

  const handleClick = onSelect
    ? (e) => {
        e.preventDefault();
        onSelect(problem);
      }
    : null;

  return html`
    <div
      class="cl-problem-card p-5 bg-[#0a0a0f] rounded-2xl border border-white/5 relative overflow-hidden group
             hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(6,182,212,0.1)] transition-all flex flex-col gap-3
             ${onSelect ? "cursor-pointer" : ""} ${selectionMode && selected
        ? "border-cyan-500/50"
        : ""}"
      onClick=${handleClick}
    >
      <!-- Background glow on hover -->
      <div
        class="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(6,182,212,0.05),transparent)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
      ></div>

      ${selectionMode
        ? html`
            <label
              class="absolute top-3 right-3 z-20 flex items-center gap-1 text-[10px] text-slate-300 bg-black/60 border border-white/10 rounded px-1.5 py-1"
              onClick=${(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked=${selected}
                onChange=${() => onToggleSelect?.(problem)}
                class="accent-cyan-500"
              />
              Select
            </label>
          `
        : ""}

      <!-- Header: title + platform badge -->
      <div class="flex items-start justify-between gap-2 z-10">
        <h3 class="text-sm font-semibold text-white leading-snug">${problem.title}</h3>
        <div
          class="flex items-center gap-1.5 shrink-0 px-2 py-1 bg-white/5 border border-white/10 rounded"
        >
          ${meta.favicon
            ? html`<img
                src=${meta.favicon}
                alt=${meta.label}
                class="w-3 h-3 object-contain"
                onError=${(e) => {
                  e.target.style.display = "none";
                }}
              />`
            : ""}
          <span class="text-[10px] font-mono uppercase tracking-wider text-slate-400"
            >${meta.label}</span
          >
        </div>
      </div>

      <!-- Difficulty + language -->
      <div class="flex items-center gap-2 z-10">
        <span class="px-2 py-0.5 text-[10px] font-bold rounded uppercase ${diffStyle}"
          >${problem.difficulty || "?"}</span
        >
        ${langName
          ? html`<span class="text-[10px] font-mono text-cyan-500/70">${langName}</span>`
          : ""}
      </div>

      <!-- All topics -->
      <div class="flex flex-wrap gap-1 z-10">
        ${topics
          .slice(0, 5)
          .map(
            (t) => html`
              <span
                class="px-1.5 py-0.5 rounded text-[9px] border ${t.kind === KIND.ALGO
                  ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-300"
                  : t.kind === KIND.DS
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-300/90"
                    : "bg-white/5 border-white/10 text-slate-400"}"
                title=${KIND_LABEL[t.kind] || ""}
                >${t.topic}</span
              >
            `,
          )}
        ${topics.length > 5
          ? html`<span class="text-[9px] text-slate-600">+${topics.length - 5}</span>`
          : ""}
      </div>

      <!-- Footer: date + actions -->
      <div
        class="mt-auto pt-3 flex justify-between items-center z-10 border-t border-white/5 gap-2"
      >
        <span class="text-[10px] font-mono text-slate-600">
          ${problem.timestamp
            ? new Date(
                problem.timestamp < 1e10 ? problem.timestamp * 1000 : problem.timestamp,
              ).toLocaleDateString()
            : ""}
        </span>
        <div class="flex items-center gap-2">
          ${!problem.problemStatement && onRefresh
            ? html`
                <button
                  onClick=${(e) => {
                    e.stopPropagation();
                    onRefresh(problem);
                  }}
                  class="text-[10px] px-2 py-0.5 rounded border border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                >
                  Refresh data
                </button>
              `
            : ""}
          <a
            href=${problemUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open on ${meta.label}"
            onClick=${(e) => e.stopPropagation()}
            class="text-[10px] text-slate-500 hover:text-cyan-400 transition-colors"
            >↗</a
          >
        </div>
      </div>
    </div>
  `;
}
