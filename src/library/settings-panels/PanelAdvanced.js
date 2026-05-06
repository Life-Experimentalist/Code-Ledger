/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";

export function PanelAdvanced({ settings, onSettingsChange }) {
  const [problems, setProblems] = useState([]);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [commitCacheClearedMsg, setCommitCacheClearedMsg] = useState("");

  useEffect(() => {
    Storage.getAllProblems?.().then((all) => setProblems(all || [])).catch(() => {});
  }, []);

  const missingCount = problems.filter((p) => !p.tags || p.tags.length === 0).length;

  const handleRefreshMissing = async () => {
    if (!missingCount || refreshBusy) return;
    setRefreshBusy(true);
    setRefreshMsg("Queuing background refresh…");
    try {
      await new Promise((resolve, reject) => {
        if (typeof chrome === "undefined" || !chrome.runtime?.id) {
          reject(new Error("Extension not available"));
          return;
        }
        chrome.runtime.sendMessage({ type: "REFRESH_METADATA", problems }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (resp?.ok) resolve(resp);
          else reject(new Error(resp?.error || "Refresh failed"));
        });
      });
      setRefreshMsg(`Queued ${missingCount} problem(s) for refresh`);
    } catch (e) {
      setRefreshMsg("Failed: " + e.message);
    } finally {
      setRefreshBusy(false);
    }
  };

  const clearCommitCache = async () => {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local?.remove) {
        await new Promise((res) => chrome.storage.local.remove(
          ["cl.committed.submissions", "cl.committed.sluglangs"],
          res
        ));
        setCommitCacheClearedMsg("Commit cache cleared — re-open LeetCode to re-commit.");
      } else {
        setCommitCacheClearedMsg("Not available outside extension context.");
      }
    } catch (e) {
      setCommitCacheClearedMsg("Error: " + e.message);
    }
    setTimeout(() => setCommitCacheClearedMsg(""), 4000);
  };

  const handleFactoryReset = async () => {
    if (!confirm("Factory reset will delete ALL local problems, settings, and auth tokens. This cannot be undone.\n\nContinue?")) return;
    setResetBusy(true);
    setResetMsg("");
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local?.clear) {
        await new Promise((res, rej) => chrome.storage.local.clear(() => {
          if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message));
          else res();
        }));
      }
      setResetMsg("Reset complete. Please reload the extension.");
    } catch (e) {
      setResetMsg("Reset failed: " + e.message);
    } finally {
      setResetBusy(false);
    }
  };

  function ToggleRow({ settingKey, label, desc, defaultOn = false }) {
    const isOn = settings?.[settingKey] !== undefined ? !!settings[settingKey] : defaultOn;
    return html`
      <div class="flex items-start gap-3">
        <button
          onClick=${() => onSettingsChange(settingKey, !isOn)}
          class="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
            ${isOn ? "bg-cyan-500/30 border-cyan-500/40" : "bg-white/5 border-white/10"}"
        >
          <span class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
            ${isOn ? "translate-x-4" : "translate-x-0.5"}">
          </span>
        </button>
        <div>
          <p class="text-sm text-slate-300">${label}</p>
          <p class="text-[11px] text-slate-500 leading-snug">${desc}</p>
        </div>
      </div>
    `;
  }

  return html`
    <div class="space-y-6 max-w-xl">
      <div>
        <h2 class="text-base font-semibold text-white mb-1">Advanced</h2>
        <p class="text-xs text-slate-500 mb-4">Developer tools, diagnostics, and maintenance operations.</p>
      </div>

      <!-- LeetCode QoL -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-4">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">LeetCode Quality-of-Life</h3>
        <${ToggleRow}
          settingKey="qolEnabled"
          label="Copy / Paste buttons"
          desc="Injects Copy and Paste buttons into the LeetCode editor toolbar (no auto-indent on paste)."
          defaultOn=${true}
        />
        <${ToggleRow}
          settingKey="floatingTimerEnabled"
          label="Floating solve timer"
          desc="Shows a draggable stopwatch that records how long you spend on each problem."
          defaultOn=${true}
        />
        <${ToggleRow}
          settingKey="floatingAIEnabled"
          label="Floating AI assistant"
          desc="Shows the AI chat bubble on LeetCode, GeeksForGeeks, and Codeforces problem pages."
          defaultOn=${true}
        />
      </div>

      <!-- Tracking & privacy -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-4">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Tracking & Privacy</h3>
        <${ToggleRow}
          settingKey="behaviorBankEnabled"
          label="Behavior bank"
          desc="Records solve patterns and chat usage to improve AI suggestions. Opt out to disable."
          defaultOn=${true}
        />
        <${ToggleRow}
          settingKey="telemetryEnabled"
          label="Anonymous telemetry"
          desc="Sends a daily solve count ping to counter.vkrishna04.me. No personal data is included."
          defaultOn=${true}
        />
      </div>

      <!-- Developer -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-4">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Developer</h3>
        <${ToggleRow}
          settingKey="debugMode"
          label="Debug mode"
          desc="Enables verbose logging via createDebugger(). Check DevTools console for output."
          defaultOn=${false}
        />
        <${ToggleRow}
          settingKey="aiCopyable"
          label="AI chat copyable mode"
          desc="Makes AI response text freely selectable and copyable in the library."
          defaultOn=${false}
        />
      </div>

      <!-- Metadata refresh -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Metadata Refresh</h3>
        <p class="text-[11px] text-slate-500">
          ${missingCount > 0
            ? `${missingCount} problem${missingCount !== 1 ? "s are" : " is"} missing tags or difficulty. Background refresh fetches them one at a time without interrupting your workflow.`
            : "All problems have complete metadata."
          }
        </p>
        <button
          onClick=${handleRefreshMissing}
          disabled=${refreshBusy || !missingCount}
          class="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-200 text-xs rounded-lg transition-colors disabled:opacity-50"
        >${refreshBusy ? "Queuing…" : `Refresh ${missingCount} problem${missingCount !== 1 ? "s" : ""}`}</button>
        ${refreshMsg && html`
          <p class="text-xs ${refreshMsg.includes("Failed") ? "text-rose-400" : "text-emerald-400"}">${refreshMsg}</p>
        `}
      </div>

      <!-- Commit cache -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Commit Cache</h3>
        <p class="text-[11px] text-slate-500">
          CodeLedger tracks which problems have already been committed to avoid duplicates.
          If you deleted your repository and want to re-commit existing solutions, clear the cache.
        </p>
        <button
          onClick=${clearCommitCache}
          class="px-4 py-2 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/30 text-amber-200 text-xs rounded-lg transition-colors"
        >Clear commit cache</button>
        ${commitCacheClearedMsg && html`
          <p class="text-xs text-emerald-400">${commitCacheClearedMsg}</p>
        `}
      </div>

      <!-- Factory reset -->
      <div class="p-4 rounded-xl border border-rose-500/15 bg-rose-950/10 space-y-3">
        <h3 class="text-xs font-medium text-rose-400 uppercase tracking-widest">Danger Zone</h3>
        <p class="text-[11px] text-slate-500">
          Factory reset erases all local data: problems, settings, auth tokens, and commit history.
          Your GitHub repository is not affected.
        </p>
        <button
          onClick=${handleFactoryReset}
          disabled=${resetBusy}
          class="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/30 text-rose-300 text-xs rounded-lg transition-colors disabled:opacity-50"
        >${resetBusy ? "Resetting…" : "Factory reset"}</button>
        ${resetMsg && html`
          <p class="text-xs ${resetMsg.includes("failed") ? "text-rose-400" : "text-emerald-400"}">${resetMsg}</p>
        `}
      </div>
    </div>
  `;
}
