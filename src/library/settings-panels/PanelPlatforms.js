/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("PanelPlatforms");

import { CONSTANTS } from "../../core/constants.js";

const PLATFORMS = Object.values(CONSTANTS.PLATFORMS);
const DIFFICULTY_LABELS = ["Easy", "Medium", "Hard"];

const PLATFORM_SYNC_URLS = {
  leetcode: {
    profile: CONSTANTS.PLATFORMS.leetcode.baseUrl + "/",
    progress: CONSTANTS.PLATFORMS.leetcode.baseUrl + "/progress/",
  },
  geeksforgeeks: {
    profile: CONSTANTS.PLATFORMS.geeksforgeeks.baseUrl + "/",
  },
  codeforces: {
    profile: CONSTANTS.PLATFORMS.codeforces.baseUrl + "/",
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
    onSettingsChange(`${pid}_difficultyMap`, {
      ...current,
      [level]: alias,
    });
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
    <div class="space-y-6 w-full">
      <div>
        <h2 class="text-base font-semibold text-white mb-1">Platforms</h2>
        <p class="text-xs text-slate-500 mb-4">
          Enable tracking per platform, customize difficulty labels, and trigger
          profile imports.
        </p>
      </div>

      ${PLATFORMS.map((p) => {
        const enabled = isPlatformEnabled(p.id);
        const diffMap = getDifficultyMap(p.id);
        const syncUrls = PLATFORM_SYNC_URLS[p.id] || {};

        return html`
          <div
            key=${p.id}
            class="p-4 rounded-xl border ${enabled
              ? "border-white/10"
              : "border-white/5 opacity-60"} bg-white/2 space-y-4 transition-opacity"
          >
            <!-- Header -->
            <div class="flex items-center gap-3">
              <span
                class="w-2.5 h-2.5 rounded-full shrink-0"
                style=${"background:" + p.color}
              ></span>
              <span class="text-sm font-semibold text-slate-200 flex-1"
                >${p.name}</span
              >
              ${(() => {
                const s = p.status;
                if (!s || s === CONSTANTS.FEATURE_STATUS.STABLE) return null;
                const meta = CONSTANTS.FEATURE_STATUS_META[s];
                if (!meta) return null;
                return html`<span
                  class="text-[10px] font-medium px-1.5 py-0.5 rounded border ${meta.className}"
                  >${meta.label}</span
                >`;
              })()}
              <button
                onClick=${() => togglePlatform(p.id)}
                class="relative inline-flex h-5 w-9 items-center rounded-full border transition-colors
                  ${enabled
                  ? "bg-cyan-500/30 border-cyan-500/40"
                  : "bg-white/5 border-white/10"}"
                title=${enabled ? "Disable " + p.name : "Enable " + p.name}
              >
                <span
                  class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
                  ${enabled ? "translate-x-4" : "translate-x-0.5"}"
                >
                </span>
              </button>
            </div>

            ${enabled &&
            html`
              <!-- Difficulty map -->
              <div>
                <p class="text-[11px] text-slate-500 mb-2">
                  Difficulty label aliases (leave blank to use default)
                </p>
                <div class="grid grid-cols-3 gap-2">
                  ${DIFFICULTY_LABELS.map(
                    (level) => html`
                      <div key=${level} class="space-y-1">
                        <label class="text-[10px] text-slate-500"
                          >${level}</label
                        >
                        <input
                          type="text"
                          placeholder=${level}
                          value=${diffMap[level] || ""}
                          onInput=${(e) =>
                            setDifficultyAlias(p.id, level, e.target.value)}
                          class="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                        />
                      </div>
                    `,
                  )}
                </div>
              </div>

              <!-- Import / sync actions -->
              <div class="space-y-2">
                <p class="text-[11px] text-slate-500">
                  Open pages to trigger in-page import buttons:
                </p>
                <div class="flex flex-wrap gap-2">
                  ${syncUrls.profile &&
                  html`
                    <button
                      onClick=${() =>
                        openAndFlash(
                          p.id,
                          syncUrls.profile,
                          "Navigate to your profile and click the CodeLedger import button.",
                        )}
                      class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors"
                    >
                      Open Profile →
                    </button>
                  `}
                  ${syncUrls.progress &&
                  html`
                    <button
                      onClick=${() =>
                        openAndFlash(
                          p.id,
                          syncUrls.progress,
                          "Click the CodeLedger import button on the progress page to sync all submissions.",
                        )}
                      class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors"
                    >
                      Open Progress →
                    </button>
                  `}
                </div>

                ${p.id === "leetcode" &&
                html`
                  <p class="text-[10px] text-slate-600 leading-snug">
                    Profile import syncs your public solve count. Progress page
                    imports full submission history (first-time only for each
                    problem+language).
                  </p>
                `}
                ${importMsg[p.id] &&
                html`
                  <p class="text-[11px] text-emerald-400">${importMsg[p.id]}</p>
                `}
              </div>

              <!-- LeetCode-specific settings -->
              ${p.id === "leetcode" &&
              html`
                <div class="pt-1 border-t border-white/5 space-y-3">
                  <p
                    class="text-[11px] text-slate-500 uppercase tracking-widest font-medium"
                  >
                    LeetCode Settings
                  </p>

                  ${[
                    {
                      key: "leetcode_submission_poll",
                      label: "Submission polling",
                      desc: "Poll for accepted verdict after you click Submit (catches submissions that don't trigger the solve event).",
                    },
                    {
                      key: "notifications",
                      label: "Notifications on commit",
                      desc: "Show a browser notification each time a solution is committed.",
                    },
                  ].map(
                    ({ key, label, desc }) => html`
                      <label
                        key=${key}
                        class="flex items-start gap-3 cursor-pointer"
                      >
                        <div class="flex-1">
                          <p class="text-xs text-slate-300">${label}</p>
                          <p class="text-[10px] text-slate-600">${desc}</p>
                        </div>
                        <button
                          onClick=${() =>
                            onSettingsChange(
                              key,
                              settings?.[key] !== false ? false : true,
                            )}
                          class="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
                          ${settings?.[key] !== false
                            ? "bg-cyan-500/30 border-cyan-500/40"
                            : "bg-white/5 border-white/10"}"
                        >
                          <span
                            class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
                          ${settings?.[key] !== false
                              ? "translate-x-4"
                              : "translate-x-0.5"}"
                          >
                          </span>
                        </button>
                      </label>
                    `,
                  )}
                </div>

                <div class="pt-1 border-t border-white/5 space-y-3">
                  <p
                    class="text-[11px] text-slate-500 uppercase tracking-widest font-medium"
                  >
                    Quality of Life
                  </p>

                  ${[
                    {
                      key: "leetcode_copy_btn",
                      label: "Copy code button",
                      desc: "Adds a copy button to the editor toolbar that copies your code cleanly (strips Monaco whitespace markers).",
                    },
                    {
                      key: "leetcode_paste_btn",
                      label: "Paste without auto-indent button",
                      desc: "Adds a paste button that bypasses Monaco's auto-indentation for clean clipboard pastes.",
                    },
                    {
                      key: "floatingTimerEnabled",
                      label: "Floating solve timer",
                      desc: "Shows a draggable stopwatch that records how long you spend on each problem.",
                      defaultOn: true,
                    },
                    {
                      key: "floatingAIEnabled",
                      label: "Floating AI assistant",
                      desc: "Shows the AI chat panel on problem pages.",
                      defaultOn: true,
                    },
                  ].map(
                    ({ key, label, desc, defaultOn = true }) => html`
                      <label
                        key=${key}
                        class="flex items-start gap-3 cursor-pointer"
                      >
                        <div class="flex-1">
                          <p class="text-xs text-slate-300">${label}</p>
                          <p class="text-[10px] text-slate-600">${desc}</p>
                        </div>
                        <button
                          onClick=${() =>
                            onSettingsChange(
                              key,
                              settings?.[key] !== undefined
                                ? !settings[key]
                                : !defaultOn,
                            )}
                          class="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
                          ${(
                            settings?.[key] !== undefined
                              ? !!settings[key]
                              : defaultOn
                          )
                            ? "bg-cyan-500/30 border-cyan-500/40"
                            : "bg-white/5 border-white/10"}"
                        >
                          <span
                            class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
                          ${(
                              settings?.[key] !== undefined
                                ? !!settings[key]
                                : defaultOn
                            )
                              ? "translate-x-4"
                              : "translate-x-0.5"}"
                          >
                          </span>
                        </button>
                      </label>
                    `,
                  )}
                </div>
              `}
            `}
          </div>
        `;
      })}
    </div>
  `;
}
