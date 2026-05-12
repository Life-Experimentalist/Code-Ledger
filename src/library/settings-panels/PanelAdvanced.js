/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";
import { MissingMetadataModal } from "../../ui/components/MissingMetadataModal.js";
import { DedupReviewQueue } from "../../ui/components/DedupReviewQueue.js";

export function PanelAdvanced({ settings, onSettingsChange }) {
  const [problems, setProblems] = useState([]);
  const [ignoredMetadataIds, setIgnoredMetadataIds] = useState(new Set());
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [commitCacheClearedMsg, setCommitCacheClearedMsg] = useState("");
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [showDedupQueue, setShowDedupQueue] = useState(false);
  const [forceBusy, setForceBusy] = useState(false);
  const [forceMsg, setForceMsg] = useState("");
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueMsg, setQueueMsg] = useState("");
  const [queueStats, setQueueStats] = useState({ pending: 0, processing: 0, done: 0, failed: 0, total: 0 });
  const [settingsSyncBusy, setSettingsSyncBusy] = useState(false);
  const [settingsSyncMsg, setSettingsSyncMsg] = useState("");

  useEffect(() => {
    // Reload problems whenever settings change (catches new solves, metadata refreshes, etc.)
    Storage.getAllProblems?.().then((all) => setProblems(all || [])).catch(() => { });

    // Load ignored metadata IDs from settings
    Storage.getSettings?.().then((s) => {
      const ignored = s?.metadata_ignored_ids || [];
      setIgnoredMetadataIds(new Set(ignored));
    }).catch(() => { });

    // Poll queue stats every 2 seconds
    const pollStats = () => {
      if (typeof chrome !== "undefined" && chrome.runtime?.id) {
        chrome.runtime.sendMessage({ type: "GET_QUEUE_STATS" }, (resp) => {
          if (!chrome.runtime.lastError && resp?.ok) {
            setQueueStats({
              pending: resp.pending || 0,
              processing: resp.processing || 0,
              done: resp.done || 0,
              failed: resp.failed || 0,
              total: resp.total || 0,
            });
          }
        });
      }
    };
    const interval = setInterval(pollStats, 2000);
    pollStats(); // Initial poll
    return () => clearInterval(interval);
  }, [settings]);

  // Count problems missing BOTH tags AND difficulty (not just one or the other), excluding ignored
  const missingCount = problems.filter((p) => {
    if (ignoredMetadataIds.has(p.id)) return false; // Exclude ignored
    const noTags = !p.tags || p.tags.length === 0;
    const noDifficulty = !p.difficulty || !['Easy', 'Medium', 'Hard'].includes(p.difficulty);
    return noTags || noDifficulty;
  }).length;

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

  const handleQueueAllAIReviews = async () => {
    if (queueBusy) return;
    const toQueue = problems.filter((p) => !p.aiReview || p.aiReview.trim() === "");
    if (!toQueue.length) {
      setQueueMsg("All problems already have AI reviews!");
      setTimeout(() => setQueueMsg(""), 4000);
      return;
    }
    if (!confirm(`Queue ${toQueue.length} problem(s) for AI review? Reviews will be processed in the background and committed on next sync.`)) return;

    setQueueBusy(true);
    setQueueMsg("Queuing reviews…");
    try {
      if (typeof chrome === "undefined" || !chrome.runtime?.id) throw new Error("Extension not available");
      const res = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "QUEUE_ALL_AI_REVIEWS" }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (resp?.ok) resolve(resp);
          else reject(new Error(resp?.error || "Queue failed"));
        });
      });
      setQueueMsg(`Queued ${res.queued || 0} problem(s). Processing will start in the background.`);
      setTimeout(() => setQueueMsg(""), 5000);
    } catch (e) {
      setQueueMsg(`Failed: ${e.message}`);
    } finally {
      setQueueBusy(false);
    }
  };

  const handleSyncSettingsToGitHub = async () => {
    if (settingsSyncBusy) return;
    setSettingsSyncBusy(true);
    setSettingsSyncMsg("Pushing settings to GitHub…");
    try {
      if (typeof chrome === "undefined" || !chrome.runtime?.id) throw new Error("Extension not available");
      const res = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "SYNC_SETTINGS_TO_GITHUB" }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (resp?.ok) resolve(resp);
          else reject(new Error(resp?.error || "Sync failed"));
        });
      });
      setSettingsSyncMsg(`✓ Settings synced to .codeledger/config.json`);
      setTimeout(() => setSettingsSyncMsg(""), 4000);
    } catch (e) {
      setSettingsSyncMsg(`Failed: ${e.message}`);
    } finally {
      setSettingsSyncBusy(false);
    }
  };

  const handleSyncSettingsFromGitHub = async () => {
    if (settingsSyncBusy) return;
    setSettingsSyncBusy(true);
    setSettingsSyncMsg("Pulling settings from GitHub…");
    try {
      if (typeof chrome === "undefined" || !chrome.runtime?.id) throw new Error("Extension not available");
      const res = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "SYNC_SETTINGS_FROM_GITHUB" }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (resp?.ok) resolve(resp);
          else reject(new Error(resp?.error || "Sync failed"));
        });
      });
      setSettingsSyncMsg(`✓ Settings updated from repository`);
      setTimeout(() => setSettingsSyncMsg(""), 4000);
    } catch (e) {
      setSettingsSyncMsg(`Failed: ${e.message}`);
    } finally {
      setSettingsSyncBusy(false);
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
      ${showMissingModal && html`<${MissingMetadataModal} problems=${problems} onClose=${() => setShowMissingModal(false)} />`}
      ${showDedupQueue && html`<${DedupReviewQueue} onClose=${() => setShowDedupQueue(false)} />`}
      <div>
        <h2 class="text-base font-semibold text-white mb-1">Advanced</h2>
        <p class="text-xs text-slate-500 mb-4">Developer tools, diagnostics, and maintenance operations.</p>
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
        <button
          onClick=${() => setShowDedupQueue(true)}
          class="px-4 py-2 w-full bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-200 text-xs rounded-lg transition-colors"
        >Review Deduplication Queue</button>
        <button
          onClick=${async () => {
      if (forceBusy) return;
      if (!confirm("Force rebuild will clear remote problem files and re-commit every local problem one by one. Continue?")) return;
      setForceBusy(true);
      setForceMsg("Starting force rebuild…");
      try {
        if (typeof chrome === "undefined" || !chrome.runtime?.id) throw new Error("Extension not available");
        const res = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: "FORCE_REBUILD_REPO" }, (resp) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else if (resp?.ok) resolve(resp);
            else reject(new Error(resp?.error || "Force rebuild failed"));
          });
        });
        setForceMsg(`Force rebuild complete — committed ${res.committed || 0} problems, deleted ${res.deleted || 0} files.`);
      } catch (e) {
        setForceMsg(`Force rebuild failed: ${e.message}`);
      } finally {
        setForceBusy(false);
        setTimeout(() => setForceMsg(""), 6000);
      }
    }}
          disabled=${forceBusy}
          class="px-4 py-2 w-full bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/30 text-rose-200 text-xs rounded-lg transition-colors disabled:opacity-50"
        >${forceBusy ? "Rebuilding…" : "Force Rebuild Repository"}</button>
        ${forceMsg ? html`<p class="text-xs ${forceMsg.includes('failed') ? 'text-rose-400' : 'text-emerald-400'}">${forceMsg}</p>` : ""}
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
        <div class="flex items-center gap-3">
          <button
            onClick=${handleRefreshMissing}
            disabled=${refreshBusy || !missingCount}
            class="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-200 text-xs rounded-lg transition-colors disabled:opacity-50"
          >${refreshBusy ? "Queuing…" : `Refresh ${missingCount} problem${missingCount !== 1 ? "s" : ""}`}</button>

          <button
            onClick=${() => setShowMissingModal(true)}
            disabled=${!missingCount && ignoredMetadataIds.size === 0}
            class="px-3 py-2 bg-white/3 border border-white/6 text-sm rounded-lg disabled:opacity-50"
          >View Details</button>
        </div>
        ${refreshMsg && html`
          <p class="text-xs ${refreshMsg.includes("Failed") ? "text-rose-400" : "text-emerald-400"}">${refreshMsg}</p>
        `}
      </div>

      <!-- AI Review Queue -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">AI Review Queue</h3>
        <p class="text-[11px] text-slate-500">
          Queue AI reviews for all problems without them. Reviews are processed in the background with rate limiting, retries, and automatic resumption on browser restart.
        </p>
        <div class="flex items-center gap-3">
          <button
            onClick=${handleQueueAllAIReviews}
            disabled=${queueBusy || problems.every((p) => p.aiReview && p.aiReview.trim())}
            class="px-4 py-2 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-200 text-xs rounded-lg transition-colors disabled:opacity-50"
          >${queueBusy ? "Queuing…" : "Queue All Reviews"}</button>
        </div>
        ${queueStats.total > 0 && html`
          <div class="text-xs text-slate-400 space-y-1">
            <p><span class="font-medium">Pending:</span> ${queueStats.pending}</p>
            <p><span class="font-medium">Processing:</span> ${queueStats.processing}</p>
            <p><span class="font-medium">Done:</span> ${queueStats.done}</p>
            ${queueStats.failed > 0 && html`<p class="text-rose-400"><span class="font-medium">Failed:</span> ${queueStats.failed}</p>`}
          </div>
        `}
        ${queueMsg && html`
          <p class="text-xs ${queueMsg.includes("Failed") ? "text-rose-400" : "text-emerald-400"}">${queueMsg}</p>
        `}
      </div>

      <!-- Settings Sync -->
      <div class="p-4 rounded-xl border border-cyan-500/20 bg-cyan-950/10 space-y-3">
        <h3 class="text-xs font-medium text-cyan-400 uppercase tracking-widest">Settings Sync</h3>
        <p class="text-[11px] text-slate-500">
          Sync portable settings to/from your GitHub repository in <code class="text-[10px] bg-black/20 px-1 rounded">.codeledger/config.json</code> for cross-device access.
          Authentication tokens and API keys are never synced.
        </p>
        <div class="flex items-center gap-3">
          <button
            onClick=${handleSyncSettingsToGitHub}
            disabled=${settingsSyncBusy}
            class="px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors disabled:opacity-50"
          >${settingsSyncBusy ? "Syncing…" : "Push to Repository"}</button>
          <button
            onClick=${handleSyncSettingsFromGitHub}
            disabled=${settingsSyncBusy}
            class="px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors disabled:opacity-50"
          >${settingsSyncBusy ? "Syncing…" : "Pull from Repository"}</button>
          <button
            onClick=${async () => {
      if (settingsSyncBusy) return;
      setSettingsSyncBusy(true);
      setSettingsSyncMsg("Force committing settings to repository…");
      try {
        if (typeof chrome === "undefined" || !chrome.runtime?.id) throw new Error("Extension not available");
        const res = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: "FORCE_COMMIT_SETTINGS" }, (resp) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else if (resp?.ok) resolve(resp);
            else reject(new Error(resp?.error || "Force commit failed"));
          });
        });
        setSettingsSyncMsg(`✓ Force commit complete`);
        setTimeout(() => setSettingsSyncMsg(""), 4000);
      } catch (e) {
        setSettingsSyncMsg(`Failed: ${e.message}`);
      } finally {
        setSettingsSyncBusy(false);
      }
    }}
            disabled=${settingsSyncBusy}
            class="px-4 py-2 bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/30 text-cyan-100 text-xs rounded-lg transition-colors disabled:opacity-50"
          >Force Commit Now</button>
        </div>
        ${settingsSyncMsg && html`
          <p class="text-xs ${settingsSyncMsg.includes("Failed") ? "text-rose-400" : "text-emerald-400"}">${settingsSyncMsg}</p>
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
