/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import { useState, useMemo, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { ProblemCard } from "../../ui/components/ProblemCard.js";
import { ProblemModal } from "../components/ProblemModal.js";

const PLATFORMS = [
  {
    id:         "leetcode",
    name:       "LeetCode",
    url:        "https://leetcode.com/problemset/",
    profileUrl: (s) => s?.leetcode_username ? `https://leetcode.com/u/${s.leetcode_username}/` : null,
    progressUrl: () => "https://leetcode.com/progress",
    color:      "#FFA116",
    bg:         "rgba(255,161,22,0.08)",
    border:     "rgba(255,161,22,0.25)",
    favicon:    "https://assets.leetcode.com/static_assets/public/icons/favicon.ico",
  },
  {
    id:         "geeksforgeeks",
    name:       "GeeksForGeeks",
    url:        "https://practice.geeksforgeeks.org/explore",
    profileUrl: (s) => s?.gfg_username ? `https://auth.geeksforgeeks.org/user/${s.gfg_username}/` : null,
    color:      "#2F8D46",
    bg:         "rgba(47,141,70,0.08)",
    border:     "rgba(47,141,70,0.25)",
    favicon:    "https://www.geeksforgeeks.org/favicon.ico",
  },
  {
    id:         "codeforces",
    name:       "Codeforces",
    url:        "https://codeforces.com/problemset",
    profileUrl: (s) => s?.cf_username ? `https://codeforces.com/profile/${s.cf_username}` : null,
    color:      "#1F8ACB",
    bg:         "rgba(31,138,203,0.08)",
    border:     "rgba(31,138,203,0.25)",
    favicon:    "https://codeforces.com/favicon.ico",
  },
];

const SORT_OPTIONS = [
  { value: "newest",    label: "Newest First" },
  { value: "oldest",    label: "Oldest First" },
  { value: "diff-asc",  label: "Easy → Hard" },
  { value: "diff-desc", label: "Hard → Easy" },
  { value: "title",     label: "Title A–Z" },
];
const DIFF_ORDER = { Easy: 0, Medium: 1, Hard: 2, Unknown: 3 };

export function ProblemsView({ problems, searchQuery, onProblemUpdate, onProblemDelete, settings }) {
  const [filterDifficulty, setFilterDifficulty] = useState("All");
  const [filterPlatform, setFilterPlatform]     = useState("All");
  const [query, setQuery]                       = useState(searchQuery || "");
  const [sortBy, setSortBy]                     = useState("newest");
  const [selectedProblem, setSelectedProblem]   = useState(null);

  const handleProblemUpdate = (updated) => {
    setSelectedProblem(updated);
    if (onProblemUpdate) onProblemUpdate(updated);
  };

  const handleProblemDelete = (id) => {
    setSelectedProblem(null);
    if (onProblemDelete) onProblemDelete(id);
  };

  useEffect(() => { setQuery(searchQuery || ""); }, [searchQuery]);

  const platformCounts = useMemo(() => {
    const counts = {};
    (problems || []).forEach((p) => { counts[p.platform] = (counts[p.platform] || 0) + 1; });
    return counts;
  }, [problems]);

  const filtered = useMemo(() => {
    let out = problems || [];
    if (filterDifficulty !== "All") out = out.filter((p) => p.difficulty === filterDifficulty);
    if (filterPlatform !== "All")   out = out.filter((p) => p.platform === filterPlatform);
    if (query && String(query).trim()) {
      const ql = String(query).toLowerCase();
      out = out.filter((p) =>
        (p.title && p.title.toLowerCase().includes(ql)) ||
        (p.platform && p.platform.toLowerCase().includes(ql)) ||
        (Array.isArray(p.tags) && p.tags.some(t => t.toLowerCase().includes(ql)))
      );
    }
    // Apply sort
    const arr = [...out];
    switch (sortBy) {
      case "newest":    arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); break;
      case "oldest":    arr.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)); break;
      case "diff-asc":  arr.sort((a, b) => (DIFF_ORDER[a.difficulty] ?? 3) - (DIFF_ORDER[b.difficulty] ?? 3)); break;
      case "diff-desc": arr.sort((a, b) => (DIFF_ORDER[b.difficulty] ?? 3) - (DIFF_ORDER[a.difficulty] ?? 3)); break;
      case "title":     arr.sort((a, b) => (a.title || "").localeCompare(b.title || "")); break;
    }
    return arr;
  }, [problems, filterDifficulty, filterPlatform, query, sortBy]);

  return html`
    <div class="flex flex-col gap-6 w-full">

      <!-- Platform hub -->
      <div class="grid grid-cols-3 gap-4">
        ${PLATFORMS.map((plat) => {
          const count  = platformCounts[plat.id] || 0;
          const active = filterPlatform === plat.id;
          return html`
            <div
              class="relative group flex flex-col items-center gap-3 p-5 rounded-2xl border cursor-pointer transition-all select-none"
              style=${{
                background:  active ? plat.bg : "rgba(10,10,15,1)",
                borderColor: active ? plat.color : "rgba(255,255,255,0.05)",
                boxShadow:   active ? `0 0 20px ${plat.bg}` : "none",
              }}
              onClick=${() => setFilterPlatform(active ? "All" : plat.id)}
            >
              <div
                class="w-12 h-12 rounded-xl flex items-center justify-center"
                style=${{ background: plat.bg, border: `1px solid ${plat.border}` }}
              >
                <img
                  src=${plat.favicon} alt=${plat.name} class="w-7 h-7 object-contain"
                  onError=${(e) => {
                    e.target.style.display = "none";
                    e.target.parentElement.innerHTML =
                      `<span style="color:${plat.color};font-size:18px;font-weight:700">${plat.name.slice(0, 2)}</span>`;
                  }}
                />
              </div>
              <div class="flex flex-col items-center gap-0.5">
                <span class="text-sm font-semibold" style=${{ color: active ? plat.color : "#94a3b8" }}>${plat.name}</span>
                <span class="text-[11px] text-slate-500">${count} solved</span>
              </div>
              <!-- Top-right action links: Practice + Profile -->
              <div class="absolute top-2 right-2 flex flex-col gap-1 items-end opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href=${plat.url} target="_blank" rel="noreferrer"
                  onClick=${(e) => e.stopPropagation()}
                  class="text-[10px] text-slate-400 hover:text-cyan-400 px-1.5 py-0.5 rounded bg-white/5 border border-white/10"
                >Practice ↗</a>
                ${plat.profileUrl?.(settings) ? html`
                  <a
                    href=${plat.profileUrl(settings)} target="_blank" rel="noreferrer"
                    onClick=${(e) => e.stopPropagation()}
                    class="text-[10px] text-slate-400 hover:text-cyan-400 px-1.5 py-0.5 rounded bg-white/5 border border-white/10"
                  >Profile ↗</a>
                ` : ""}
                ${plat.progressUrl ? html`
                  <a
                    href=${plat.progressUrl()} target="_blank" rel="noreferrer"
                    onClick=${(e) => e.stopPropagation()}
                    class="text-[10px] text-slate-400 hover:text-cyan-400 px-1.5 py-0.5 rounded bg-white/5 border border-white/10"
                  >Progress ↗</a>
                ` : ""}
              </div>
            </div>
          `;
        })}
      </div>

      <!-- Filter bar -->
      <div class="flex justify-between items-center bg-[#0a0a0f] p-4 rounded-xl border border-white/5 gap-3 flex-wrap">
        <div class="flex gap-2 flex-wrap">
          ${["All", "Easy", "Medium", "Hard"].map((d) => html`
            <button
              onClick=${() => setFilterDifficulty(d)}
              class="px-3 py-1 text-xs rounded transition-colors ${filterDifficulty === d
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"}"
            >${d}</button>
          `)}
        </div>
        <div class="flex items-center gap-2">
          <select
            value=${sortBy}
            onChange=${(e) => setSortBy(e.target.value)}
            class="px-2 py-1.5 bg-black border border-white/10 rounded text-xs text-slate-300"
          >
            ${SORT_OPTIONS.map(o => html`<option value=${o.value}>${o.label}</option>`)}
          </select>
          <input
            value=${query}
            placeholder="Search title, tag, or platform…"
            onInput=${(e) => setQuery(e.target.value)}
            class="px-3 py-1.5 bg-black border border-white/10 rounded text-sm text-white min-w-[220px]"
          />
          ${query ? html`
            <button onClick=${() => setQuery("")} class="text-slate-500 hover:text-slate-300 text-xs px-2">✕</button>
          ` : ""}
        </div>
      </div>

      <!-- Results count -->
      <div class="flex items-center justify-between -mt-2">
        <p class="text-[10px] text-slate-600 uppercase tracking-wider">
          ${filtered.length} solution${filtered.length !== 1 ? "s" : ""}
          ${filterDifficulty !== "All" || filterPlatform !== "All" || query ? " (filtered)" : ""}
        </p>
        ${(filterDifficulty !== "All" || filterPlatform !== "All" || query) ? html`
          <button
            onClick=${() => { setFilterDifficulty("All"); setFilterPlatform("All"); setQuery(""); }}
            class="text-[10px] text-slate-500 hover:text-slate-300 underline"
          >Clear filters</button>
        ` : ""}
      </div>

      <!-- Cards grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        ${filtered.map((p) => html`
          <${ProblemCard}
            key=${p.id || p.titleSlug}
            problem=${p}
            onSelect=${setSelectedProblem}
          />
        `)}
        ${filtered.length === 0 ? html`
          <p class="col-span-full py-12 text-center text-slate-500 uppercase tracking-widest text-[10px]">
            No solutions found matching filters.
          </p>
        ` : ""}
      </div>

      <!-- Problem detail modal -->
      <${ProblemModal}
        problem=${selectedProblem}
        onClose=${() => setSelectedProblem(null)}
        onUpdate=${handleProblemUpdate}
        onDelete=${handleProblemDelete}
      />
    </div>
  `;
}
