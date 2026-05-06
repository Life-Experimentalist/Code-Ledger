/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { CONSTANTS } from "../../core/constants.js";

const PLATFORMS = Object.values(CONSTANTS.PLATFORMS);
const DIFFICULTY_LABELS = ["Easy", "Medium", "Hard"];

const PLATFORM_SYNC_URLS = {
  leetcode: {
    profile: "https://leetcode.com/",
    progress: "https://leetcode.com/progress/",
  },
  geeksforgeeks: {
    profile: "https://www.geeksforgeeks.org/",
  },
  codeforces: {
    profile: "https://codeforces.com/",
  },
};

export function PanelPlatforms({ settings, onSettingsChange }) {
  const [importMsg, setImportMsg] = useState({});

  const isPlatformEnabled = (pid) => {
    const key = `${pid}_enabled`;
    return settings?.[key] !== false;
  };

  const togglePlatform = (pid) => {
    const key = `${pid}_enabled`;
    onSettingsChange(key, !isPlatformEnabled(pid));
  };

  const getDifficultyMap = (pid) => settings?.[`${pid}_difficultyMap`] || {};

  const setDifficultyAlias = (pid, level, alias) => {
    const current = getDifficultyMap(pid);
    onSettingsChange(`${pid}_difficultyMap`, { ...current, [level]: alias });
  };

  const openAndFlash = (pid, url, message) => {
    setImportMsg((m) => ({ ...m, [pid]: message }));
    try {
      if (typeof chrome !== "undefined" && chrome.tabs?.create) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, "_blank");
      }
    } catch (e) {
      setImportMsg((m) => ({ ...m, [pid]: "Error: " + e.message }));
    }
    setTimeout(() => setImportMsg((m) => ({ ...m, [pid]: "" })), 5000);
  };

  return html`
    <div class="space-y-6 max-w-xl">
      <div>
        <h2 class="text-base font-semibold text-white mb-1">Platforms</h2>
        <p class="text-xs text-slate-500 mb-4">Enable tracking per platform, customize difficulty labels, and trigger profile imports.</p>
      </div>

      ${PLATFORMS.map((p) => {
        const enabled = isPlatformEnabled(p.id);
        const diffMap = getDifficultyMap(p.id);
        const syncUrls = PLATFORM_SYNC_URLS[p.id] || {};

        return html`
          <div key=${p.id} class="p-4 rounded-xl border ${enabled ? "border-white/10" : "border-white/5 opacity-60"} bg-white/2 space-y-4 transition-opacity">
            <!-- Header -->
            <div class="flex items-center gap-3">
              <span class="w-2.5 h-2.5 rounded-full shrink-0" style=${"background:" + p.color}></span>
              <span class="text-sm font-semibold text-slate-200 flex-1">${p.name}</span>
              <button
                onClick=${() => togglePlatform(p.id)}
                class="relative inline-flex h-5 w-9 items-center rounded-full border transition-colors
                  ${enabled ? "bg-cyan-500/30 border-cyan-500/40" : "bg-white/5 border-white/10"}"
                title=${enabled ? "Disable " + p.name : "Enable " + p.name}
              >
                <span class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
                  ${enabled ? "translate-x-4" : "translate-x-0.5"}">
                </span>
              </button>
            </div>

            ${enabled && html`
              <!-- Difficulty map -->
              <div>
                <p class="text-[11px] text-slate-500 mb-2">Difficulty label aliases (leave blank to use default)</p>
                <div class="grid grid-cols-3 gap-2">
                  ${DIFFICULTY_LABELS.map((level) => html`
                    <div key=${level} class="space-y-1">
                      <label class="text-[10px] text-slate-500">${level}</label>
                      <input
                        type="text"
                        placeholder=${level}
                        value=${diffMap[level] || ""}
                        onInput=${(e) => setDifficultyAlias(p.id, level, e.target.value)}
                        class="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                      />
                    </div>
                  `)}
                </div>
              </div>

              <!-- Import / sync actions -->
              <div class="space-y-2">
                <p class="text-[11px] text-slate-500">Open pages to trigger in-page import buttons:</p>
                <div class="flex flex-wrap gap-2">
                  ${syncUrls.profile && html`
                    <button
                      onClick=${() => openAndFlash(p.id, syncUrls.profile, "Navigate to your profile and click the CodeLedger import button.")}
                      class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors"
                    >Open Profile →</button>
                  `}
                  ${syncUrls.progress && html`
                    <button
                      onClick=${() => openAndFlash(p.id, syncUrls.progress, "Click the CodeLedger import button on the progress page to sync all submissions.")}
                      class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors"
                    >Open Progress →</button>
                  `}
                </div>

                ${p.id === "leetcode" && html`
                  <p class="text-[10px] text-slate-600 leading-snug">
                    Profile import syncs your public solve count. Progress page imports full submission history (first-time only for each problem+language).
                  </p>
                `}

                ${importMsg[p.id] && html`
                  <p class="text-[11px] text-emerald-400">${importMsg[p.id]}</p>
                `}
              </div>

              <!-- LeetCode-specific settings -->
              ${p.id === "leetcode" && html`
                <div class="pt-1 border-t border-white/5 space-y-3">
                  <p class="text-[11px] text-slate-500 uppercase tracking-widest font-medium">LeetCode Settings</p>

                  <label class="flex items-start gap-3 cursor-pointer">
                    <div class="flex-1">
                      <p class="text-xs text-slate-300">Submission polling</p>
                      <p class="text-[10px] text-slate-600">Poll for accepted verdict after you click Submit (catches submissions that don't trigger the solve event).</p>
                    </div>
                    <button
                      onClick=${() => onSettingsChange("leetcode_submission_poll", settings?.leetcode_submission_poll !== false ? false : true)}
                      class="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
                        ${settings?.leetcode_submission_poll !== false ? "bg-cyan-500/30 border-cyan-500/40" : "bg-white/5 border-white/10"}"
                    >
                      <span class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
                        ${settings?.leetcode_submission_poll !== false ? "translate-x-4" : "translate-x-0.5"}">
                      </span>
                    </button>
                  </label>

                  <label class="flex items-start gap-3 cursor-pointer">
                    <div class="flex-1">
                      <p class="text-xs text-slate-300">Notifications on commit</p>
                      <p class="text-[10px] text-slate-600">Show a browser notification each time a solution is committed.</p>
                    </div>
                    <button
                      onClick=${() => onSettingsChange("notifications", settings?.notifications !== false ? false : true)}
                      class="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
                        ${settings?.notifications !== false ? "bg-cyan-500/30 border-cyan-500/40" : "bg-white/5 border-white/10"}"
                    >
                      <span class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
                        ${settings?.notifications !== false ? "translate-x-4" : "translate-x-0.5"}">
                      </span>
                    </button>
                  </label>
                </div>
              `}
            `}
          </div>
        `;
      })}
    </div>
  `;
}
