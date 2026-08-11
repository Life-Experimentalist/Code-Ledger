/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, render } from "../vendor/preact-bundle.js";
import { useState, useEffect } from "../vendor/preact-bundle.js";
import { htm } from "../vendor/preact-bundle.js";
const html = htm.bind(h);
import { Storage } from "../core/storage.js";
import { tabs, runtime } from "../lib/browser-compat.js";
import { createDebugger } from "../lib/debug.js";
import { applyThemeFromStorage, setupThemeListener } from "../core/theme-engine.js";
import { isAIActive, isGamificationActive } from "../core/feature-flags.js";
import { loadSnapshot } from "../core/gamification-state.js";
import { countByDifficulty, loadUserDifficultyMap } from "../core/difficulty-map.js";

const dbg = createDebugger("PopupApp");

/**
 * The streak, today's progress toward it, and what it would take to save it.
 *
 * The toolbar badge has room for the number alone; this is where the number
 * gets its sentence. Both read the same snapshot, so they cannot disagree.
 */
function StreakStrip({ snapshot }) {
  if (!snapshot) return "";

  const target = Math.max(1, snapshot.effectiveTarget || 1);
  const points = Math.max(0, snapshot.todayPoints || 0);
  const done = snapshot.todayDone === true || snapshot.vacationActive === true;
  const rescue = snapshot.rescue && snapshot.rescue.remaining > 0 ? snapshot.rescue : null;
  const pct = Math.round(Math.min(1, points / target) * 100);

  const line = snapshot.vacationActive
    ? "Vacation day — the streak is safe."
    : rescue
      ? `${rescue.remaining} more points restores ${rescue.restoresDay}.`
      : done
        ? `Today's ${target} points are in.`
        : `${points} / ${target} points today`;

  return html`
    <div class="mb-4 rounded-lg bg-white/5 border border-white/5 p-3">
      <div class="flex items-baseline justify-between">
        <div class="flex items-baseline gap-1.5">
          <span class="text-base leading-none">🔥</span>
          <span
            class="text-xl font-bold ${snapshot.currentStreak > 0
              ? "text-amber-300"
              : "text-slate-600"}"
            >${snapshot.currentStreak}</span
          >
          <span class="text-[10px] uppercase tracking-widest text-slate-500">
            ${snapshot.currentStreak === 1 ? "day" : "days"}
          </span>
        </div>
        <div class="flex items-baseline gap-2 text-[10px] text-slate-500">
          ${snapshot.freezes > 0
            ? html`<span title="Streak freezes earned">❄ ${snapshot.freezes}</span>`
            : ""}
          <span>Lv ${snapshot.level}</span>
        </div>
      </div>
      <div class="mt-2 h-1.5 rounded-full bg-black/40 overflow-hidden">
        <div
          class="h-full transition-[width] ${done
            ? "bg-emerald-400"
            : rescue
              ? "bg-rose-400"
              : "bg-cyan-400"}"
          style=${`width:${done ? 100 : pct}%`}
        ></div>
      </div>
      <p class="mt-1.5 text-[10px] ${rescue ? "text-rose-300" : "text-slate-500"}">${line}</p>
    </div>
  `;
}

applyThemeFromStorage().catch(() => {});
setupThemeListener();

function PopupApp() {
  const [stats, setStats] = useState({
    total: 0,
    easy: 0,
    medium: 0,
    hard: 0,
  });
  const [recent, setRecent] = useState([]);
  const [pendingConflicts, setPendingConflicts] = useState(0);
  const [settings, setSettings] = useState(null);
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    Promise.all([Storage.getAllProblems(), loadUserDifficultyMap()]).then(([problems, diffMap]) => {
      // Strict equality against "Easy" missed every GeeksForGeeks School/Basic
      // grade and anything the user had remapped, so the popup could report
      // 0 / 0 / 0 above a non-zero total.
      setStats({ total: problems.length, ...countByDifficulty(problems, diffMap) });
      // Sort by timestamp desc and take top 3
      setRecent(problems.sort((a, b) => b.timestamp - a.timestamp).slice(0, 3));
    });
    Storage.getSettings()
      .then((s) => {
        setPendingConflicts(Number(s?._pendingConflicts) || 0);
        setSettings(s || {});
        // Only computed when it is going to be shown — the popup opens often
        // and reading every problem back is the expensive part.
        if (isGamificationActive(s)) {
          loadSnapshot(s)
            .then(setSnapshot)
            .catch((e) => dbg.warn("streak snapshot failed:", e?.message));
        }
      })
      .catch(() => {});
  }, []);

  const openLibrary = (tab = "solutions", settingsTab = null) => {
    let url = runtime.getURL(`library/library.html?tab=${tab}`);
    if (settingsTab) url += `&settingsTab=${settingsTab}`;
    try {
      if (tabs && typeof tabs.create === "function") {
        tabs.create({ url });
      } else {
        window.open(url, "_blank");
      }
    } catch (e) {
      window.open(url, "_blank");
    }
  };

  const searchLibrary = (q) => {
    const url = runtime.getURL(`library/library.html?tab=search&q=${encodeURIComponent(q)}`);
    try {
      tabs.create({ url });
    } catch {
      window.open(url, "_blank");
    }
  };

  return html`
    <div class="flex flex-col h-full bg-[#050508] p-4 text-white">
      <div class="flex items-center gap-3 mb-6">
        <img
          src="../assets/images/icon-transparent.png"
          class="w-8 h-8 object-contain drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]"
          alt="CL Logo"
        />
        <h1 class="text-lg font-semibold tracking-tight">CodeLedger</h1>
      </div>

      ${isGamificationActive(settings) ? html`<${StreakStrip} snapshot=${snapshot} />` : ""}

      <div class="grid grid-cols-3 gap-2 mb-4">
        <div class="bg-white/5 border border-white/5 rounded p-2 flex flex-col items-center">
          <span class="text-emerald-400 font-bold">${stats.easy}</span>
          <span class="text-[10px] text-slate-500 uppercase">Easy</span>
        </div>
        <div class="bg-white/5 border border-white/5 rounded p-2 flex flex-col items-center">
          <span class="text-amber-400 font-bold">${stats.medium}</span>
          <span class="text-[10px] text-slate-500 uppercase">Med</span>
        </div>
        <div class="bg-white/5 border border-white/5 rounded p-2 flex flex-col items-center">
          <span class="text-rose-400 font-bold">${stats.hard}</span>
          <span class="text-[10px] text-slate-500 uppercase">Hard</span>
        </div>
      </div>

      <div class="mb-4 flex-1">
        <div class="mb-3">
          <input
            id="popup-search"
            placeholder="Search problems or topics"
            class="w-full px-3 py-2 rounded bg-black border border-white/10 text-sm text-white"
          />
          <div class="mt-2">
            <button
              class="w-full py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400 text-xs font-bold uppercase tracking-widest"
              onClick=${() => searchLibrary(document.getElementById("popup-search").value || "")}
            >
              Search
            </button>
          </div>
        </div>
        <h2 class="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Recent Solves</h2>
        ${recent.length === 0
          ? html`
              <div
                class="text-[10px] text-slate-600 italic py-2 text-center bg-white/5 rounded border border-white/5"
              >
                No problems tracked yet.
              </div>
            `
          : html`
              <div class="flex flex-col gap-2">
                ${recent.map(
                  (p) => html`
                    <div
                      class="p-2 bg-white/5 border border-white/5 rounded flex justify-between items-center group cursor-default"
                    >
                      <div class="truncate max-w-[200px]">
                        <p
                          class="text-xs truncate text-slate-300 group-hover:text-cyan-400 transition-colors"
                        >
                          ${p.title}
                        </p>
                        <p class="text-[9px] text-slate-500 uppercase hidden sm:block">
                          ${p.platform} • ${p.difficulty}
                        </p>
                      </div>
                      <span
                        class="text-[10px] font-mono text-slate-500 border border-white/10 px-1 rounded"
                        >${p.lang?.ext || "js"}</span
                      >
                    </div>
                  `,
                )}
              </div>
            `}
      </div>

      ${pendingConflicts > 0
        ? html`
            <button
              onClick=${() => openLibrary("settings", "git")}
              class="w-full mb-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-left hover:bg-amber-500/20 transition-colors"
            >
              <span class="text-amber-400 text-base leading-none">⚠</span>
              <div class="flex-1 min-w-0">
                <p class="text-[11px] font-medium text-amber-300">
                  ${pendingConflicts} conflict${pendingConflicts !== 1 ? "s" : ""} need review
                </p>
                <p class="text-[10px] text-amber-500/80 truncate">
                  Go to Settings → Git to resolve
                </p>
              </div>
              <span class="text-amber-500 text-xs shrink-0">→</span>
            </button>
          `
        : ""}
      <div class="flex flex-col gap-2 mb-2">
        <button
          class="w-full py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400 text-xs font-bold uppercase tracking-widest hover:bg-cyan-500/20 transition-colors"
          onClick=${() => openLibrary("solutions")}
        >
          Open Library
        </button>
        ${isAIActive(settings)
          ? html`
              <button
                class="w-full py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs font-bold uppercase tracking-widest hover:bg-emerald-500/20 transition-colors"
                onClick=${() => openLibrary("ai-chats")}
              >
                AI Chats
              </button>
            `
          : ""}
        <button
          class="w-full py-2 bg-white/5 border border-white/10 rounded-lg text-slate-300 text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-colors"
          onClick=${() => openLibrary("settings")}
        >
          Settings
        </button>
      </div>

      <div class="mt-auto pt-4 border-t border-white/5 flex gap-2 items-center justify-between">
        <div class="flex items-center gap-1.5">
          <div
            class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
          ></div>
          <span class="text-[9px] uppercase tracking-widest text-emerald-500/70">Ready</span>
        </div>
        <span class="text-[9px] text-slate-600">${stats.total} tracked</span>
      </div>
    </div>
  `;
}

render(html`<${PopupApp} />`, document.getElementById("root"));
