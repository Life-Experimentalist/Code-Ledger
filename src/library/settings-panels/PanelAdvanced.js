/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("PanelAdvanced");

import { Storage } from "../../core/storage.js";
import { runHealthCheck, overallStatus } from "../../core/health-check.js";
import { registry } from "../../core/handler-registry.js";
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
  const [settingsSyncBusy, setSettingsSyncBusy] = useState(false);
  const [settingsSyncMsg, setSettingsSyncMsg] = useState("");
  const [auditProgress, setAuditProgress] = useState(null);
  const [auditResults, setAuditResults] = useState(null);

  const startAudit = async () => {
    try {
      const activeSettings = await Storage.getSettings();
      const primaryProviderId = activeSettings.aiProvider || "gemini";

      const enabledKey = `${primaryProviderId}_enabled`;
      if (activeSettings[enabledKey] === false) {
        alert(
          `The selected AI provider (${primaryProviderId}) is disabled. Please enable it in Settings -> AI.`,
        );
        return;
      }

      const provider = registry.getAIProvider(primaryProviderId);
      if (!provider) {
        alert(`AI Provider "${primaryProviderId}" is not available.`);
        return;
      }

      setAuditProgress({ current: 0, total: problems.length, status: "Preparing problems..." });

      const CHUNK_SIZE = 15;
      const corrections = [];

      for (let i = 0; i < problems.length; i += CHUNK_SIZE) {
        const chunk = problems.slice(i, i + CHUNK_SIZE);

        // Wait 3 seconds before next chunk to avoid rate limiting
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }

        const stats =
          typeof provider.getRateLimitStats === "function" ? provider.getRateLimitStats() : null;
        const limitStr =
          stats && stats.limit ? ` [Limits: ${stats.remaining}/${stats.limit} remaining]` : "";

        setAuditProgress({
          current: i,
          total: problems.length,
          status: `Auditing problems ${i + 1} to ${Math.min(i + CHUNK_SIZE, problems.length)}...${limitStr}`,
        });

        const payload = chunk.map((p) => ({
          id: p.id,
          title: p.title,
          topic: p.topic || "None",
          tags: p.tags || [],
          difficulty: p.difficulty || "Unknown",
        }));

        const prompt = `You are a DSA Metadata Auditor. Audit and normalize the tags, primary topics, patterns, and difficulty levels for these solved problems.
Ensure:
1. Standardized Title Case names (e.g. "Array", "Linked List", "Stack", "Queue", "Heap (Priority Queue)", "Trie", "Binary Search Tree", "Segment Tree", "Binary Indexed Tree", "Graph", "Union Find", "Hash Table", "Tree", "Dynamic Programming", "Greedy", "Recursion", "Backtracking", "Divide and Conquer", "Two Pointers", "Sliding Window", "Binary Search", "Sorting").
2. Classify primary topics accurately (e.g. "Array" vs "Dynamic Programming").
3. Suggest appropriate tags, pattern, and difficulty if missing or incorrect.
4. Distinguish clearly between data structures (e.g. "Array", "Linked List", "Stack", "Queue", "Heap (Priority Queue)", "Trie", "Binary Search Tree", "Segment Tree", "Binary Indexed Tree", "Graph", "Union Find", "Hash Table", "Tree") and algorithmic techniques (e.g. "Dynamic Programming", "Greedy", "Recursion", "Backtracking", "Divide and Conquer", "Two Pointers", "Sliding Window", "Binary Search", "Sorting").

Here is the list of problems:
${JSON.stringify(payload, null, 2)}

Return ONLY a JSON array of objects representing suggestions where the current metadata should be corrected or filled. Do not include markdown code blocks, backticks, or any conversational text. If a problem is already correct, omit it from the response. Format:
[
  {
    "id": "problem_id_here",
    "suggestedTopic": "Canonical Topic Name",
    "suggestedTags": ["Tag One", "Tag Two"],
    "suggestedPattern": "Optional Pattern Name",
    "suggestedDifficulty": "Easy/Medium/Hard"
  }
]`;

        let responseText = "";
        let success = false;
        let retries = 3;
        let delayMs = 3500;

        while (retries > 0 && !success) {
          try {
            responseText = await provider.review(prompt, { _rawPrompt: true });
            success = true;
          } catch (err) {
            retries--;
            const isRateLimit =
              String(err?.message || "").includes("429") || String(err || "").includes("429");
            const errStats =
              typeof provider.getRateLimitStats === "function"
                ? provider.getRateLimitStats()
                : null;
            const errLimitStr =
              errStats && errStats.limit
                ? ` [Limits: ${errStats.remaining}/${errStats.limit} remaining]`
                : "";
            if (retries > 0) {
              const waitTime = isRateLimit ? delayMs * 2.5 : delayMs;
              setAuditProgress((prev) => ({
                ...prev,
                status: `⚠ Rate limit or API error. Retrying in ${Math.round(waitTime / 1000)}s... (${retries} retries left)${errLimitStr}`,
              }));
              await new Promise((resolve) => setTimeout(resolve, waitTime));
              delayMs = waitTime;
            } else {
              throw err;
            }
          }
        }

        let cleanedJsonText = responseText.trim();
        if (cleanedJsonText.startsWith("```")) {
          cleanedJsonText = cleanedJsonText
            .replace(/^```json\s*/i, "")
            .replace(/```$/, "")
            .trim();
        }

        try {
          const suggestions = JSON.parse(cleanedJsonText);
          if (Array.isArray(suggestions)) {
            for (const sug of suggestions) {
              const original = chunk.find((p) => p.id === sug.id);
              if (original) {
                corrections.push({
                  id: sug.id,
                  title: original.title,
                  currentTopic: original.topic,
                  currentTags: original.tags,
                  suggestedTopic: sug.suggestedTopic,
                  suggestedTags: sug.suggestedTags,
                  suggestedPattern: sug.suggestedPattern || original.pattern || "",
                  suggestedDifficulty: sug.suggestedDifficulty || original.difficulty || "",
                });
              }
            }
          }
        } catch (e) {
          dbg.error("Failed to parse AI response chunk", e, responseText);
        }
      }

      setAuditProgress(null);
      setAuditResults(corrections);
    } catch (err) {
      alert("Audit failed: " + err.message);
      setAuditProgress(null);
    }
  };

  const applyAuditResults = async () => {
    if (!auditResults || auditResults.length === 0) return;
    try {
      setRefreshBusy(true);
      setRefreshMsg("Applying corrections...");

      for (const res of auditResults) {
        const original = problems.find((p) => p.id === res.id);
        if (original) {
          const updated = {
            ...original,
            topic: res.suggestedTopic,
            tags: res.suggestedTags,
            pattern: res.suggestedPattern,
            difficulty: res.suggestedDifficulty,
          };
          await Storage.saveProblem(updated);
        }
      }

      setAuditResults(null);
      setRefreshMsg(`✓ Applied ${auditResults.length} metadata corrections!`);
      const all = await Storage.getAllProblems();
      setProblems(all || []);
    } catch (e) {
      setRefreshMsg("Failed to apply corrections: " + e.message);
    } finally {
      setRefreshBusy(false);
      setTimeout(() => setRefreshMsg(""), 5000);
    }
  };

  useEffect(() => {
    // Reload problems whenever settings change (catches new solves, metadata refreshes, etc.)
    Storage.getAllProblems?.()
      .then((all) => setProblems(all || []))
      .catch(() => {});

    // Load ignored metadata IDs from settings
    Storage.getSettings?.()
      .then((s) => {
        const ignored = s?.metadata_ignored_ids || [];
        setIgnoredMetadataIds(new Set(ignored));
      })
      .catch(() => {});

    return undefined;
  }, [settings]);

  // Count problems missing BOTH tags AND difficulty (not just one or the other), excluding ignored
  const missingCount = problems.filter((p) => {
    if (ignoredMetadataIds.has(p.id)) return false; // Exclude ignored
    const noTags = !p.tags || p.tags.length === 0;
    const noDifficulty = !p.difficulty || !["Easy", "Medium", "Hard"].includes(p.difficulty);
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
        await new Promise((res) =>
          chrome.storage.local.remove(["cl.committed.submissions", "cl.committed.sluglangs"], res),
        );
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
    if (
      !confirm(
        "Factory reset will delete ALL local problems, settings, and auth tokens. This cannot be undone.\n\nContinue?",
      )
    )
      return;
    setResetBusy(true);
    setResetMsg("");
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local?.clear) {
        await new Promise((res, rej) =>
          chrome.storage.local.clear(() => {
            if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message));
            else res();
          }),
        );
      }
      setResetMsg("Reset complete. Please reload the extension.");
    } catch (e) {
      setResetMsg("Reset failed: " + e.message);
    } finally {
      setResetBusy(false);
    }
  };

  const handleSyncSettingsToGitHub = async () => {
    if (settingsSyncBusy) return;
    setSettingsSyncBusy(true);
    setSettingsSyncMsg("Pushing settings to GitHub…");
    try {
      if (typeof chrome === "undefined" || !chrome.runtime?.id)
        throw new Error("Extension not available");
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
      if (typeof chrome === "undefined" || !chrome.runtime?.id)
        throw new Error("Extension not available");
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
          <span
            class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
            ${isOn ? "translate-x-4" : "translate-x-0.5"}"
          >
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
    <div class="space-y-6 w-full">
      ${showMissingModal &&
      html`<${MissingMetadataModal}
        problems=${problems}
        onClose=${() => setShowMissingModal(false)}
      />`}
      ${showDedupQueue && html`<${DedupReviewQueue} onClose=${() => setShowDedupQueue(false)} />`}
      <div>
        <h2 class="text-base font-semibold text-white mb-1">Advanced</h2>
        <p class="text-xs text-slate-500 mb-4">
          Developer tools, diagnostics, and maintenance operations.
        </p>
      </div>

      <!-- Connection check -->
      <${ConnectionCheck} />

      <!-- Tracking & privacy -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-4">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">
          Tracking & Privacy
        </h3>
        <${ToggleRow}
          settingKey="behaviorBankEnabled"
          label="Behavior bank"
          desc="Records solve patterns and chat usage to improve AI suggestions. Opt out to disable."
          defaultOn=${true}
        />
        <${ToggleRow}
          settingKey="telemetryOptIn"
          label="Anonymous telemetry (opt-in)"
          desc="Sends an anonymous solve-count ping to counter.vkrishna04.me. No personal data or code is included. Off by default."
          defaultOn=${false}
        />
      </div>

      <!-- Background Operations -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-4">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">
          Background Operations
        </h3>
        <${ToggleRow}
          settingKey="selfHealEnabled"
          label="Auto-repair incomplete problems"
          desc="Quietly refetches missing descriptions and tags for LeetCode, GeeksForGeeks and Codeforces problems, a couple every few minutes. Never overwrites anything you have already written."
          defaultOn=${true}
        />
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm text-slate-300">Code Recovery Queue</p>
            <p class="text-[11px] text-slate-500 leading-snug mt-0.5 max-w-[280px]">
              Auto-recovers missing code for imported problems by opening background tabs.
            </p>
          </div>
          <select
            value=${settings?.codeRecoveryQueueSpeed || "disabled"}
            onChange=${(e) => onSettingsChange("codeRecoveryQueueSpeed", e.target.value)}
            class="bg-[#1e1e1e] text-xs text-slate-300 border border-white/10 rounded px-2 py-1 outline-none focus:border-cyan-500/50"
          >
            <option value="disabled">Disabled (Manual)</option>
            <option value="slow">Slow (1 per 5 min)</option>
            <option value="fast">Fast (1 per 10 sec)</option>
          </select>
        </div>
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
        >
          Review Deduplication Queue
        </button>
        <button
          onClick=${async () => {
            if (forceBusy) return;
            if (
              !confirm(
                "Force rebuild will clear remote problem files and re-commit every local problem one by one. Continue?",
              )
            )
              return;
            setForceBusy(true);
            setForceMsg("Starting force rebuild…");
            try {
              if (typeof chrome === "undefined" || !chrome.runtime?.id)
                throw new Error("Extension not available");
              const res = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ type: "FORCE_REBUILD_REPO" }, (resp) => {
                  if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                  else if (resp?.ok) resolve(resp);
                  else reject(new Error(resp?.error || "Force rebuild failed"));
                });
              });
              setForceMsg(
                `Force rebuild complete — committed ${res.committed || 0} problems, deleted ${res.deleted || 0} files.`,
              );
            } catch (e) {
              setForceMsg(`Force rebuild failed: ${e.message}`);
            } finally {
              setForceBusy(false);
              setTimeout(() => setForceMsg(""), 6000);
            }
          }}
          disabled=${forceBusy}
          class="px-4 py-2 w-full bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/30 text-rose-200 text-xs rounded-lg transition-colors disabled:opacity-50"
        >
          ${forceBusy ? "Rebuilding…" : "Force Rebuild Repository"}
        </button>
        ${forceMsg
          ? html`<p
              class="text-xs ${forceMsg.includes("failed") ? "text-rose-400" : "text-emerald-400"}"
            >
              ${forceMsg}
            </p>`
          : ""}
      </div>

      <!-- Metadata refresh -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">
          Metadata Refresh
        </h3>
        <p class="text-[11px] text-slate-500">
          ${missingCount > 0
            ? `${missingCount} problem${missingCount !== 1 ? "s are" : " is"} missing tags or difficulty. Background refresh fetches them one at a time without interrupting your workflow.`
            : "All problems have complete metadata."}
        </p>
        <div class="flex items-center gap-3">
          <button
            onClick=${handleRefreshMissing}
            disabled=${refreshBusy || !missingCount}
            class="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-200 text-xs rounded-lg transition-colors disabled:opacity-50"
          >
            ${refreshBusy
              ? "Queuing…"
              : `Refresh ${missingCount} problem${missingCount !== 1 ? "s" : ""}`}
          </button>

          <button
            onClick=${() => setShowMissingModal(true)}
            disabled=${!missingCount && ignoredMetadataIds.size === 0}
            class="px-3 py-2 bg-white/3 border border-white/6 text-sm rounded-lg disabled:opacity-50"
          >
            View Details
          </button>
        </div>
        ${refreshMsg &&
        html`
          <p
            class="text-xs ${refreshMsg.includes("Failed") ? "text-rose-400" : "text-emerald-400"}"
          >
            ${refreshMsg}
          </p>
        `}
      </div>

      <!-- Settings Sync -->
      <div class="p-4 rounded-xl border border-cyan-500/20 bg-cyan-950/10 space-y-3">
        <h3 class="text-xs font-medium text-cyan-400 uppercase tracking-widest">Settings Sync</h3>
        <p class="text-[11px] text-slate-500">
          Sync portable settings to/from your GitHub repository in
          <code class="text-[10px] bg-black/20 px-1 rounded">.codeledger/config.json</code>
          for cross-device access. Authentication tokens and API keys are never synced.
        </p>
        <div class="flex items-center gap-3">
          <button
            onClick=${handleSyncSettingsToGitHub}
            disabled=${settingsSyncBusy}
            class="px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors disabled:opacity-50"
          >
            ${settingsSyncBusy ? "Syncing…" : "Push to Repository"}
          </button>
          <button
            onClick=${handleSyncSettingsFromGitHub}
            disabled=${settingsSyncBusy}
            class="px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors disabled:opacity-50"
          >
            ${settingsSyncBusy ? "Syncing…" : "Pull from Repository"}
          </button>
          <button
            onClick=${async () => {
              if (settingsSyncBusy) return;
              setSettingsSyncBusy(true);
              setSettingsSyncMsg("Force committing settings to repository…");
              try {
                if (typeof chrome === "undefined" || !chrome.runtime?.id)
                  throw new Error("Extension not available");
                const res = await new Promise((resolve, reject) => {
                  chrome.runtime.sendMessage({ type: "FORCE_COMMIT_SETTINGS" }, (resp) => {
                    if (chrome.runtime.lastError)
                      reject(new Error(chrome.runtime.lastError.message));
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
          >
            Force Commit Now
          </button>
        </div>
        ${settingsSyncMsg &&
        html`
          <p
            class="text-xs ${settingsSyncMsg.includes("Failed")
              ? "text-rose-400"
              : "text-emerald-400"}"
          >
            ${settingsSyncMsg}
          </p>
        `}
      </div>

      <!-- Commit cache -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Commit Cache</h3>
        <p class="text-[11px] text-slate-500">
          CodeLedger tracks which problems have already been committed to avoid duplicates. If you
          deleted your repository and want to re-commit existing solutions, clear the cache.
        </p>
        <button
          onClick=${clearCommitCache}
          class="px-4 py-2 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/30 text-amber-200 text-xs rounded-lg transition-colors"
        >
          Clear commit cache
        </button>
        ${commitCacheClearedMsg &&
        html` <p class="text-xs text-emerald-400">${commitCacheClearedMsg}</p> `}
      </div>

      <!-- AI Metadata Auditor -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-4">
        <h3
          class="text-xs font-medium text-slate-400 uppercase tracking-widest flex items-center gap-1.5"
        >
          ✨ AI Metadata Auditor
        </h3>
        <p class="text-[11px] text-slate-500 leading-snug">
          Audit and normalize the tags, topics, patterns, and difficulty levels of all your saved
          problems using AI. This helps classify your list cleanly into Data Structures and
          Algorithms.
        </p>

        ${auditProgress
          ? html`
              <div class="space-y-2">
                <div class="flex items-center justify-between text-xs text-slate-400">
                  <span>Auditing: ${auditProgress.current} / ${auditProgress.total} problems</span>
                  <span>${Math.round((auditProgress.current / auditProgress.total) * 100)}%</span>
                </div>
                <div class="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-cyan-500 transition-all duration-300"
                    style=${`width: ${(auditProgress.current / auditProgress.total) * 100}%`}
                  ></div>
                </div>
                ${auditProgress.status &&
                html`<p class="text-[10px] text-slate-500 font-mono italic">
                  ${auditProgress.status}
                </p>`}
              </div>
            `
          : auditResults?.length > 0
            ? html`
                <div class="space-y-3">
                  <p class="text-xs text-emerald-400 font-medium">
                    ✓ Audit complete! Found ${auditResults.length} suggested corrections.
                  </p>
                  <div
                    class="max-h-60 overflow-y-auto border border-white/5 rounded-lg bg-black/20 divide-y divide-white/5"
                  >
                    ${auditResults.map(
                      (res) => html`
                        <div key=${res.id} class="p-2.5 space-y-1.5 text-xs">
                          <div class="font-medium text-white">${res.title}</div>
                          <div class="grid grid-cols-2 gap-2 text-[10px]">
                            <div>
                              <span class="text-slate-500">Current:</span>
                              <div class="text-slate-400 mt-0.5">
                                Topic:
                                <span class="text-slate-300 font-mono"
                                  >${res.currentTopic || "None"}</span
                                ><br />
                                Tags:
                                <span class="text-slate-300 font-mono"
                                  >${res.currentTags?.join(", ") || "None"}</span
                                >
                              </div>
                            </div>
                            <div>
                              <span class="text-cyan-400">AI Suggested:</span>
                              <div class="text-cyan-300 mt-0.5">
                                Topic:
                                <span class="font-mono text-cyan-200 font-semibold"
                                  >${res.suggestedTopic}</span
                                ><br />
                                Tags:
                                <span class="font-mono text-cyan-200 font-semibold"
                                  >${res.suggestedTags?.join(", ")}</span
                                >
                              </div>
                            </div>
                          </div>
                        </div>
                      `,
                    )}
                  </div>
                  <div class="flex gap-2">
                    <button
                      onClick=${applyAuditResults}
                      class="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      Apply All ${auditResults.length} Corrections
                    </button>
                    <button
                      onClick=${() => setAuditResults(null)}
                      class="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              `
            : html`
                <button
                  onClick=${startAudit}
                  class="px-4 py-2 w-full bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors"
                >
                  Start AI Metadata Audit
                </button>
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
        >
          ${resetBusy ? "Resetting…" : "Factory reset"}
        </button>
        ${resetMsg &&
        html`
          <p class="text-xs ${resetMsg.includes("failed") ? "text-rose-400" : "text-emerald-400"}">
            ${resetMsg}
          </p>
        `}
      </div>
    </div>
  `;
}

/**
 * "What state am I actually in?" for the GitHub connection.
 *
 * The store rejection was a reviewer who could not tell why repository creation
 * failed. The causes are fixed; this is the part that tells someone which one
 * they hit, in a form they can screenshot.
 *
 * It runs on demand, not on mount: it costs three GitHub API calls, and a
 * settings page that spends rate limit every time it is opened is its own bug.
 */
function ConnectionCheck() {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);

  const run = async () => {
    setBusy(true);
    try {
      const settings = (await Storage.getSettings()) || {};
      const oauth = await Storage.getAuthToken("github").catch(() => "");
      const pat = settings.github_token || "";
      setResults(
        await runHealthCheck({
          token: oauth || pat,
          tokenSource: oauth ? "GitHub sign-in" : pat ? "personal access token" : "",
          owner: settings.github_owner || settings.github_username || "",
          repo: settings.github_repo || settings.gitRepo || "",
        }),
      );
    } catch (e) {
      dbg.error("connection check failed", e?.message || e);
      setResults([
        {
          id: "error",
          label: "Connection check",
          status: "fail",
          detail: e?.message || "The check itself failed.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const TONE = {
    ok: "text-emerald-400",
    warn: "text-amber-400",
    fail: "text-rose-400",
    skipped: "text-slate-500",
  };
  const MARK = { ok: "✓", warn: "!", fail: "✗", skipped: "–" };
  const HEADLINE = {
    ok: "Everything the extension needs is in place.",
    warn: "It works, but something below is worth knowing about.",
    fail: "Something is broken. The line marked ✗ says which.",
    skipped: "",
  };

  return html`
    <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">
            Connection check
          </h3>
          <p class="text-[11px] text-slate-500 leading-snug mt-1 max-w-[320px]">
            Asks GitHub what your token is, what it may do, and whether your repository is
            reachable. Nothing is changed and nothing is sent anywhere else.
          </p>
        </div>
        <button
          onClick=${run}
          disabled=${busy}
          class="px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/20 disabled:opacity-50 shrink-0"
        >
          ${busy ? "Checking…" : "Run check"}
        </button>
      </div>
      ${results &&
      html`
        <div class="space-y-2">
          <p class="text-xs ${TONE[overallStatus(results)]}">${HEADLINE[overallStatus(results)]}</p>
          ${results.map(
            (r) => html`
              <div key=${r.id} class="flex items-start gap-2">
                <span class="text-xs ${TONE[r.status]} w-3 shrink-0 mt-0.5">${MARK[r.status]}</span>
                <div class="min-w-0">
                  <p class="text-sm text-slate-300">${r.label}</p>
                  <p class="text-[11px] text-slate-500 leading-snug">${r.detail}</p>
                  ${r.fix &&
                  html`<p class="text-[11px] text-cyan-400/80 leading-snug">${r.fix}</p>`}
                </div>
              </div>
            `,
          )}
        </div>
      `}
    </div>
  `;
}
