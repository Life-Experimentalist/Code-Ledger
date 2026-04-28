/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import { useState, useMemo, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { ProblemCard } from "../../ui/components/ProblemCard.js";

const PLATFORMS = [
  {
    id:    "leetcode",
    name:  "LeetCode",
    url:   "https://leetcode.com/problemset/",
    color: "#FFA116",
    bg:    "rgba(255,161,22,0.08)",
    border:"rgba(255,161,22,0.25)",
    icon: html`<svg viewBox="0 0 95 111" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-10 h-10">
      <path d="M68.2 78.6H27.7c-3 0-5.4-2.4-5.4-5.4s2.4-5.4 5.4-5.4h40.5c3 0 5.4 2.4 5.4 5.4s-2.4 5.4-5.4 5.4z" fill="#FFA116"/>
      <path d="M43.3 110.1c-7.4 0-14.4-2.9-19.7-8.2L5.3 83.6c-5.3-5.3-5.3-13.9 0-19.2L43.8 25.9c2.4-2.4 5.5-3.7 8.9-3.7s6.5 1.3 8.9 3.7l.5.5-7.7 7.7-.5-.5c-.7-.7-1.7-1.1-2.7-1.1-1 0-1.9.4-2.6 1.1L10.2 71.9c-1.4 1.4-1.4 3.7 0 5.2l18.3 18.3c1.4 1.4 3.2 2.1 5.1 2.1 1.8 0 3.6-.7 4.9-2l8.2-8.2c.7-.7 1.7-1.1 2.7-1.1 1 0 1.9.4 2.7 1.1.7.7 1.1 1.7 1.1 2.7 0 1-.4 1.9-1.1 2.7l-8.2 8.2c-5.3 5.3-12.2 8.2-19.6 8.2z" fill="#B3B3B3"/>
      <path d="M52.6 88.2c-3.4 0-6.5-1.3-8.9-3.7l-.5-.5 7.7-7.7.5.5c.7.7 1.7 1.1 2.7 1.1 1 0 1.9-.4 2.6-1.1l38.5-38.5c1.4-1.4 1.4-3.7 0-5.2L77 14.8c-1.4-1.4-3.2-2.1-5.1-2.1-1.8 0-3.6.7-4.9 2l-8.2 8.2c-.7.7-1.7 1.1-2.7 1.1-1 0-1.9-.4-2.7-1.1C52.7 22.2 52.3 21.2 52.3 20.2c0-1 .4-1.9 1.1-2.7l8.2-8.2C66.9 4 74 1.1 81.4 1.1c7.4 0 14.4 2.9 19.7 8.2l18.3 18.3c5.3 5.3 5.3 13.9 0 19.2L80.9 85.3c-.8 1.7-3.6 2.9-5.8 2.9H52.6z" fill="#B3B3B3"/>
    </svg>`,
  },
  {
    id:    "geeksforgeeks",
    name:  "GeeksForGeeks",
    url:   "https://practice.geeksforgeeks.org/explore",
    color: "#2F8D46",
    bg:    "rgba(47,141,70,0.08)",
    border:"rgba(47,141,70,0.25)",
    icon: html`<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-10 h-10">
      <rect width="48" height="48" rx="8" fill="#2F8D46" fill-opacity="0.15"/>
      <text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" font-size="22" font-weight="bold" fill="#2F8D46">GFG</text>
    </svg>`,
  },
  {
    id:    "codeforces",
    name:  "Codeforces",
    url:   "https://codeforces.com/problemset",
    color: "#1F8ACB",
    bg:    "rgba(31,138,203,0.08)",
    border:"rgba(31,138,203,0.25)",
    icon: html`<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-10 h-10">
      <rect width="48" height="48" rx="8" fill="#1F8ACB" fill-opacity="0.15"/>
      <text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" font-size="22" font-weight="bold" fill="#1F8ACB">CF</text>
    </svg>`,
  },
];

export function ProblemsView({ problems, searchQuery }) {
  const [filterDelay, setFilterDelay] = useState("All");
  const [filterPlatform, setFilterPlatform] = useState("All");
  const [query, setQuery] = useState(searchQuery || "");

  useEffect(() => {
    setQuery(searchQuery || "");
  }, [searchQuery]);

  const platformCounts = useMemo(() => {
    const counts = {};
    (problems || []).forEach((p) => {
      counts[p.platform] = (counts[p.platform] || 0) + 1;
    });
    return counts;
  }, [problems]);

  const filtered = useMemo(() => {
    let out = problems || [];
    if (filterDelay !== "All")
      out = out.filter((p) => p.difficulty === filterDelay);
    if (filterPlatform !== "All")
      out = out.filter((p) => p.platform === filterPlatform);
    if (query && String(query).trim()) {
      const ql = String(query).toLowerCase();
      out = out.filter(
        (p) =>
          (p.title && p.title.toLowerCase().includes(ql)) ||
          (p.platform && p.platform.toLowerCase().includes(ql)),
      );
    }
    return out;
  }, [problems, filterDelay, filterPlatform, query]);

  return html`
    <div class="flex flex-col gap-6 w-full">

      <!-- Platform hub -->
      <div class="grid grid-cols-3 gap-4">
        ${PLATFORMS.map((plat) => {
          const count = platformCounts[plat.id] || 0;
          const active = filterPlatform === plat.id;
          return html`
            <div
              class="relative group flex flex-col items-center gap-3 p-5 rounded-2xl border cursor-pointer transition-all select-none"
              style=${{
                background: active ? plat.bg : "rgba(10,10,15,1)",
                borderColor: active ? plat.color : "rgba(255,255,255,0.05)",
                boxShadow: active ? `0 0 20px ${plat.bg}` : "none",
              }}
              onClick=${() =>
                setFilterPlatform(active ? "All" : plat.id)}
            >
              ${plat.icon}
              <div class="flex flex-col items-center gap-0.5">
                <span
                  class="text-sm font-semibold"
                  style=${{ color: active ? plat.color : "#94a3b8" }}
                >${plat.name}</span>
                <span class="text-[11px] text-slate-500">${count} solved</span>
              </div>
              <a
                href=${plat.url}
                target="_blank"
                rel="noreferrer"
                onClick=${(e) => e.stopPropagation()}
                class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-slate-400 hover:text-cyan-400 px-1.5 py-0.5 rounded bg-white/5 border border-white/10"
              >Practice ↗</a>
            </div>
          `;
        })}
      </div>

      <!-- Filter bar -->
      <div
        class="flex justify-between items-center bg-[#0a0a0f] p-4 rounded-xl border border-white/5"
      >
        <div class="flex gap-2 flex-wrap">
          ${["All", "Easy", "Medium", "Hard"].map(
            (d) => html`
              <button
                onClick=${() => setFilterDelay(d)}
                class="px-3 py-1 text-xs rounded transition-colors ${filterDelay === d
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                  : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"}"
              >
                ${d}
              </button>
            `,
          )}
        </div>
        <div class="flex items-center gap-2">
          <input
            value=${query}
            placeholder="Search problems or platforms"
            onInput=${(e) => setQuery(e.target.value)}
            class="px-3 py-1.5 bg-black border border-white/10 rounded text-sm text-white"
          />
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        ${filtered.map(
          (p) => html`<${ProblemCard} key=${p.id} problem=${p} />`,
        )}
        ${filtered.length === 0
          ? html`<p
              class="col-span-full py-12 text-center text-slate-500 uppercase tracking-widest text-[10px]"
            >
              No problems found matching filters.
            </p>`
          : ""}
      </div>
    </div>
  `;
}
