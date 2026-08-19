/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";
import { CONSTANTS } from "../../core/constants.js";
import { ModelSelector } from "../../ui/components/ModelSelector.js";
import { testAIKey } from "../../core/model-fetch.js";
import { QueueModal } from "../../ui/components/QueueModal.js";
import {
  getMCPConfig,
  updateMCPConfig,
  setMCPToolEnabled,
  getEnabledMCPTools,
} from "../../core/mcp-config.js";
import { getDefaultAIPrompts, normalizeAIPrompts } from "../../core/ai-prompts.js";
import { canToggleAI } from "../../core/feature-flags.js";

const PROVIDERS = Object.values(CONSTANTS.AI_PROVIDERS);

function maskKey(k) {
  const s = String(k || "");
  if (s.length <= 8) return "*".repeat(Math.max(0, s.length - 2)) + s.slice(-2);
  return s.slice(0, 4) + "..." + s.slice(-4);
}

function parseKeys(raw) {
  return String(raw || "")
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

const MCP_TOOL_INFO = {
  "query-problems": {
    name: "Query Problems",
    description: "Search for problems by platform, difficulty, topic, or time",
    category: "Context",
  },
  "get-problem-stats": {
    name: "Get Problem Stats",
    description: "Detailed statistics for a single problem (time, complexity, percentiles)",
    category: "Context",
  },
  "get-next-suggestion": {
    name: "Get Next Suggestion",
    description: "Analyze weak topics and suggest the next best problem to practice",
    category: "Suggestions",
  },
  "analyze-code-quality": {
    name: "Analyze Code Quality",
    description: "Analyze code for complexity, edge cases, and improvement opportunities",
    category: "Analysis",
  },
  "get-trend-analysis": {
    name: "Get Trend Analysis",
    description: "Analyze 30-day solving trends, platform distribution, difficulty progression",
    category: "Analysis",
  },
  "find-similar-problems": {
    name: "Find Similar Problems",
    description: "Find problems similar to a given one based on difficulty, platform, tags",
    category: "Context",
  },
  "get-user-profile": {
    name: "Get User Profile",
    description: "Comprehensive user context: total problems, top platforms/languages/topics",
    category: "Context",
  },
  remember: {
    name: "Remember Insight",
    description: "Save a note, preference, or observation to your knowledge bank",
    category: "Knowledge",
  },
  recall: {
    name: "Recall Insights",
    description: "Read stored insights back, optionally filtered by topic",
    category: "Knowledge",
  },
  forget: {
    name: "Forget Insight",
    description: "Delete a single insight from the knowledge bank",
    category: "Knowledge",
  },
  "set-roadmap": {
    name: "Set Roadmap",
    description: "Save a study roadmap as an ordered list of problems",
    category: "Roadmap",
  },
  "get-roadmap-progress": {
    name: "Get Roadmap Progress",
    description: "How far through the active roadmap you are, and what comes next",
    category: "Roadmap",
  },
  "get-chats": {
    name: "Get Saved Chats",
    description: "Retrieve saved conversations, optionally filtered by problem",
    category: "Chats",
  },
  "delete-chat": {
    name: "Delete Chat",
    description: "Permanently delete a saved chat — asks you to confirm first",
    category: "Chats",
  },
  "open-problem": {
    name: "Open Problem",
    description: "Open a LeetCode, GeeksforGeeks, or Codeforces problem in a new tab",
    category: "Navigation",
  },
};

// Categories in display order, taken from the map above so a tool added there
// shows up here without a second edit. The list used to be hardcoded to three
// names, which is why eight registered tools had no toggle at all.
const MCP_CATEGORIES = [...new Set(Object.values(MCP_TOOL_INFO).map((i) => i.category))];

export function PanelAI({ settings, onSettingsChange }) {
  const [savedKeys, setSavedKeys] = useState({});
  const [keyDraft, setKeyDraft] = useState({});
  const [testResult, setTestResult] = useState({});
  const [testing, setTesting] = useState({});
  const [saving, setSaving] = useState({});
  const [endpointDraft, setEndpointDraft] = useState({});
  const [mcpConfig, setMcpConfig] = useState(null);
  const [mcpEnabledIds, setMcpEnabledIds] = useState(new Set());
  const [mcpOpen, setMcpOpen] = useState(false);
  const [queueStats, setQueueStats] = useState({
    pending: 0,
    processing: 0,
    done: 0,
    failed: 0,
    total: 0,
  });
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueMsg, setQueueMsg] = useState("");
  const [showQueueModal, setShowQueueModal] = useState(false);
  // Review-prompt overrides. buildReviewPrompt() has always preferred the
  // stored override over the registered template; the only editor for it died
  // with SettingsSchema, so the setting was write-only. Loaded lazily on open.
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState(null);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptMsg, setPromptMsg] = useState("");

  useEffect(() => {
    if (!promptsOpen || promptDraft !== null) return;
    let mounted = true;
    Storage.getAIPrompts()
      .then((raw) => mounted && setPromptDraft(normalizeAIPrompts(raw)))
      .catch(() => mounted && setPromptDraft(getDefaultAIPrompts()));
    return () => {
      mounted = false;
    };
  }, [promptsOpen]);

  useEffect(() => {
    Storage.getAIKeys()
      .then((all) => setSavedKeys(all || {}))
      .catch(() => {});
    // Populate endpoint drafts from settings
    const drafts = {};
    PROVIDERS.forEach((p) => {
      const key = `${p.id}_endpoint`;
      if (settings?.[key]) drafts[p.id] = settings[key];
    });
    setEndpointDraft(drafts);
    // Load MCP config
    Promise.all([getMCPConfig(), getEnabledMCPTools()])
      .then(([cfg, enabled]) => {
        setMcpConfig(cfg);
        setMcpEnabledIds(new Set(enabled));
      })
      .catch(() => {});
    // Poll queue stats
    const pollStats = () => {
      if (typeof chrome !== "undefined" && chrome.runtime?.id) {
        chrome.runtime.sendMessage({ type: "GET_QUEUE_STATS" }, (resp) => {
          if (!chrome.runtime.lastError && resp?.ok) {
            setQueueStats({
              pending: resp.pending || 0,
              processing: resp.processing || 0,
              done: resp.done || 0,
              failed: resp.failed || 0,
              total:
                (resp.pending || 0) +
                (resp.processing || 0) +
                (resp.done || 0) +
                (resp.failed || 0),
            });
          }
        });
      }
    };
    pollStats();
    const statsTimer = setInterval(pollStats, 3000);
    return () => clearInterval(statsTimer);
  }, []);

  const primaryProvider = settings?.aiProvider || CONSTANTS.AI_DEFAULT_PRIMARY;
  const fallbackProvider = settings?.aiSecondary || "";
  const autoReview = settings?.autoReview !== false;

  const isProviderEnabled = (id) => settings?.[`${id}_enabled`] === true;

  const toggleProvider = (id) => {
    const nextVal = !isProviderEnabled(id);
    onSettingsChange(`${id}_enabled`, nextVal);
    if (!nextVal) {
      if (settings?.aiProvider === id) {
        onSettingsChange("aiProvider", "");
        onSettingsChange("aiPrimaryModel", "");
      }
      if (settings?.aiSecondary === id) {
        onSettingsChange("aiSecondary", "");
        onSettingsChange("aiSecondaryModel", "");
      }
    }
  };

  const saveKeys = async (providerId) => {
    const raw = keyDraft[providerId] || "";
    const keys = parseKeys(raw);
    if (!keys.length) return;
    setSaving((s) => ({ ...s, [providerId]: true }));
    try {
      const all = { ...savedKeys };
      const existing = Array.isArray(all[providerId]) ? all[providerId] : [];
      all[providerId] = [...new Set([...existing, ...keys])];
      await Storage.setAIKeys(all);
      setSavedKeys(all);
      setKeyDraft((d) => ({ ...d, [providerId]: "" }));
      // Auto-enable provider when a key is added
      if (!isProviderEnabled(providerId)) {
        onSettingsChange(`${providerId}_enabled`, true);
      }
      setTestResult((r) => ({
        ...r,
        [providerId]: `Saved ${keys.length} key(s)`,
      }));
    } catch (e) {
      setTestResult((r) => ({
        ...r,
        [providerId]: "Save failed: " + e.message,
      }));
    } finally {
      setSaving((s) => ({ ...s, [providerId]: false }));
    }
  };

  const removeKey = async (providerId, idx) => {
    const all = { ...savedKeys };
    const keys = Array.isArray(all[providerId]) ? [...all[providerId]] : [];
    keys.splice(idx, 1);
    all[providerId] = keys;
    await Storage.setAIKeys(all);
    setSavedKeys(all);
  };

  const copyKey = (key, providerId) => {
    navigator.clipboard
      .writeText(key)
      .then(() => {
        setTestResult((r) => ({
          ...r,
          [providerId]: "Key copied!",
        }));
        setTimeout(() => {
          setTestResult((r) => {
            const updated = { ...r };
            delete updated[providerId];
            return updated;
          });
        }, 1500);
      })
      .catch(() => {});
  };

  const copyAllKeys = (providerId) => {
    const keys = Array.isArray(savedKeys[providerId]) ? savedKeys[providerId] : [];
    if (keys.length === 0) return;
    const joined = keys.join(", ");
    navigator.clipboard
      .writeText(joined)
      .then(() => {
        setTestResult((r) => ({
          ...r,
          [providerId]: "All keys copied!",
        }));
        setTimeout(() => {
          setTestResult((r) => {
            const updated = { ...r };
            delete updated[providerId];
            return updated;
          });
        }, 1500);
      })
      .catch(() => {});
  };

  const testKey = async (providerId) => {
    const raw = keyDraft[providerId] || "";
    const key = raw.trim();
    if (!key) return;
    setTesting((t) => ({ ...t, [providerId]: true }));
    try {
      const res = await testAIKey(providerId, key);
      setTestResult((r) => ({
        ...r,
        [providerId]: res.ok ? "✓ Key valid" : "✗ " + (res.error || "Invalid"),
      }));
    } catch (e) {
      setTestResult((r) => ({ ...r, [providerId]: "✗ " + e.message }));
    } finally {
      setTesting((t) => ({ ...t, [providerId]: false }));
    }
  };

  const saveEndpoint = (providerId) => {
    const ep = (endpointDraft[providerId] || "").trim();
    onSettingsChange(`${providerId}_endpoint`, ep || null);
    setTestResult((r) => ({
      ...r,
      [providerId]: ep ? "Endpoint saved" : "Reset to default",
    }));
    setTimeout(
      () =>
        setTestResult((r) => ({
          ...r,
          [providerId]:
            r[providerId] === "Endpoint saved" || r[providerId] === "Reset to default"
              ? ""
              : r[providerId],
        })),
      2000,
    );
  };

  const _sendQueueMsg = (type) =>
    new Promise((resolve, reject) => {
      if (typeof chrome === "undefined" || !chrome.runtime?.id)
        return reject(new Error("Extension not available"));
      chrome.runtime.sendMessage({ type }, (resp) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (resp?.ok) return resolve(resp);
        reject(new Error(resp?.error || "Failed"));
      });
    });

  const handleQueueMissing = async () => {
    if (queueBusy) return;
    setQueueBusy(true);
    setQueueMsg("Queuing missing reviews…");
    try {
      const res = await _sendQueueMsg("QUEUE_MISSING_AI_REVIEWS");
      setQueueMsg(`Queued ${res.queued || 0} problem(s).`);
      setTimeout(() => setQueueMsg(""), 5000);
    } catch (e) {
      setQueueMsg(`Failed: ${e.message}`);
    } finally {
      setQueueBusy(false);
    }
  };

  const handleRequeueAll = async () => {
    if (queueBusy) return;
    setQueueBusy(true);
    setQueueMsg("Queuing all reviews…");
    try {
      const res = await _sendQueueMsg("QUEUE_ALL_AI_REVIEWS");
      setQueueMsg(`Queued ${res.queued || 0} problem(s).`);
      setTimeout(() => setQueueMsg(""), 5000);
    } catch (e) {
      setQueueMsg(`Failed: ${e.message}`);
    } finally {
      setQueueBusy(false);
    }
  };

  const handleCancelQueue = async () => {
    if (!confirm("Cancel pending reviews? The current one will finish first.")) return;
    try {
      const res = await _sendQueueMsg("CANCEL_AI_REVIEW_QUEUE");
      setQueueMsg(`Cancelled ${res.cancelled || 0} pending review(s).`);
      setTimeout(() => setQueueMsg(""), 4000);
    } catch (e) {
      setQueueMsg(`Failed: ${e.message}`);
    }
  };

  const handleRunQueueNow = async () => {
    if (queueBusy) return;
    setQueueBusy(true);
    setQueueMsg("Running queue now…");
    try {
      await _sendQueueMsg("PROCESS_REVIEW_QUEUE_NOW");
      setQueueMsg("Queue run triggered.");
      setTimeout(() => setQueueMsg(""), 4000);
    } catch (e) {
      setQueueMsg(`Failed: ${e.message}`);
    } finally {
      setQueueBusy(false);
    }
  };

  return html`
    <div class="space-y-6 w-full">
      ${showQueueModal &&
      html`<${QueueModal}
        onClose=${() => setShowQueueModal(false)}
        onOpenProblem=${() => setShowQueueModal(false)}
      />`}
      <div>
        <h2 class="text-base font-semibold text-white mb-1">AI Providers</h2>
        <p class="text-xs text-slate-500 mb-4">
          Configure AI providers for code review and chat. Providers are disabled by default until
          you add a key.
        </p>
      </div>

      <!-- Master AI switch — offered only once a provider is configured, so a
           fresh install never sees a toggle that can do nothing. The stored key
           records an explicit "no": providers stay configured, all AI UI hides. -->
      ${canToggleAI(settings) &&
      html`
        <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-2">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-300">AI features</p>
              <p class="text-[11px] text-slate-500">
                Turn off to hide every AI surface — reviews, chats, prompts — without removing your
                provider keys.
              </p>
            </div>
            <button
              onClick=${() => onSettingsChange("aiEnabled", settings.aiEnabled === false)}
              class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
                ${settings.aiEnabled !== false
                ? "bg-cyan-500/30 border-cyan-500/40"
                : "bg-white/5 border-white/10"}"
            >
              <span
                class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
                ${settings.aiEnabled !== false ? "translate-x-4" : "translate-x-0.5"}"
              >
              </span>
            </button>
          </div>
        </div>
      `}

      <!-- Auto-review toggle -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-2">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-slate-300">Auto-review on solve</p>
            <p class="text-[11px] text-slate-500">
              Automatically run AI review each time a solution is committed to GitHub.
            </p>
          </div>
          <button
            onClick=${() => onSettingsChange("autoReview", !autoReview)}
            class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
              ${autoReview ? "bg-cyan-500/30 border-cyan-500/40" : "bg-white/5 border-white/10"}"
          >
            <span
              class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
              ${autoReview ? "translate-x-4" : "translate-x-0.5"}"
            >
            </span>
          </button>
        </div>
        <!-- Queue action buttons — beside the auto-review toggle -->
        <div class="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick=${handleQueueMissing}
            disabled=${queueBusy}
            class="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-200 text-xs rounded-lg transition-colors disabled:opacity-50"
            title="Add only problems without an AI review"
          >
            ${queueBusy ? "Queuing…" : "Queue Missing"}
          </button>
          <button
            onClick=${handleRequeueAll}
            disabled=${queueBusy}
            class="px-3 py-1.5 bg-purple-600/10 hover:bg-purple-600/30 border border-purple-500/20 text-purple-300 text-xs rounded-lg transition-colors disabled:opacity-50"
            title="Re-queue all problems including those already reviewed"
          >
            Requeue All
          </button>
          <button
            onClick=${() => setShowQueueModal(true)}
            class="px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 text-violet-200 text-xs rounded-lg transition-colors"
          >
            View Queue
            ${queueStats.total > 0
              ? html`<span class="ml-1 text-[10px] opacity-70"
                  >(${queueStats.pending}p
                  ${queueStats.done}d${queueStats.failed > 0 ? ` ${queueStats.failed}!` : ""})</span
                >`
              : ""}
          </button>
          ${(queueStats.pending > 0 || queueStats.processing > 0) &&
          html`
            <button
              onClick=${handleRunQueueNow}
              disabled=${queueBusy}
              class="px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors disabled:opacity-50"
              title="Skip wait and run next batch now"
            >
              Run Now
            </button>
            <button
              onClick=${handleCancelQueue}
              class="px-3 py-1.5 bg-rose-600/15 hover:bg-rose-600/30 border border-rose-500/25 text-rose-300 text-xs rounded-lg transition-colors"
              title="Stop after current item — removes remaining pending reviews"
            >
              Cancel Queue
            </button>
          `}
        </div>
        ${queueMsg &&
        html`<p
          class="text-xs ${queueMsg.includes("Failed") ? "text-rose-400" : "text-emerald-400"}"
        >
          ${queueMsg}
        </p>`}
        ${queueStats.total > 0 &&
        html`
          <div class="flex flex-wrap gap-2 text-[11px] text-slate-400 pt-1">
            ${queueStats.pending > 0 &&
            html`<span class="text-amber-300">${queueStats.pending} pending</span>`}
            ${queueStats.processing > 0 &&
            html`<span class="text-cyan-300">${queueStats.processing} processing</span>`}
            ${queueStats.done > 0 &&
            html`<span class="text-emerald-400">${queueStats.done} done</span>`}
            ${queueStats.failed > 0 &&
            html`<span class="text-rose-400">${queueStats.failed} failed</span>`}
          </div>
        `}
      </div>

      <!-- Snail Mode (background AI review rate limiting) -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
        <div>
          <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Snail Mode</h3>
          <p class="text-[11px] text-slate-500 mt-1">
            Background AI review processes in small batches to avoid API rate limits. Reviews run
            automatically — no user action needed.
          </p>
        </div>
        <div class="flex flex-wrap gap-4">
          <label class="flex flex-col gap-1">
            <span class="text-[11px] text-slate-400">Batch size (problems per run)</span>
            <input
              type="number"
              min="1"
              max="20"
              value=${settings?.snailMode_batchSize ?? CONSTANTS.SNAIL_MODE.BATCH_SIZE}
              onInput=${(e) =>
                onSettingsChange(
                  "snailMode_batchSize",
                  Math.max(
                    1,
                    Math.min(20, Number(e.target.value) || CONSTANTS.SNAIL_MODE.BATCH_SIZE),
                  ),
                )}
              class="w-20 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-[11px] text-slate-400">Interval between batches (hours)</span>
            <input
              type="number"
              min="0.25"
              max="24"
              step="0.25"
              value=${settings?.snailMode_batchIntervalHours ??
              CONSTANTS.SNAIL_MODE.BATCH_INTERVAL_MS / 3600000}
              onInput=${(e) =>
                onSettingsChange(
                  "snailMode_batchIntervalHours",
                  Math.max(0.25, Math.min(24, Number(e.target.value) || 1)),
                )}
              class="w-24 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50"
            />
          </label>
        </div>
        <p class="text-[11px] text-slate-600">
          Default: ${CONSTANTS.SNAIL_MODE.BATCH_SIZE} problems every
          ${CONSTANTS.SNAIL_MODE.BATCH_INTERVAL_MS / 3600000}h. Pauses automatically after
          ${CONSTANTS.SNAIL_MODE.ERROR_THRESHOLD} consecutive errors.
        </p>
      </div>

      <!-- Chats visibility -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-2">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-slate-300">
              Show problem-linked chats in global list
            </p>
            <p class="text-[11px] text-slate-500">
              Show chats associated with specific problems in the main AI Chats tab.
            </p>
          </div>
          <button
            onClick=${() =>
              onSettingsChange(
                "showProblemChats",
                settings.showProblemChats !== false ? false : true,
              )}
            class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
              ${settings.showProblemChats !== false
              ? "bg-cyan-500/30 border-cyan-500/40"
              : "bg-white/5 border-white/10"}"
          >
            <span
              class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
              ${settings.showProblemChats !== false ? "translate-x-4" : "translate-x-0.5"}"
            >
            </span>
          </button>
        </div>
      </div>

      <!-- Primary + Fallback selectors -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-4">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Provider Order</h3>

        <div class="space-y-2">
          <label class="block text-xs text-slate-400">Primary provider</label>
          <select
            value=${primaryProvider}
            onChange=${(e) => onSettingsChange("aiProvider", e.target.value)}
            class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-cyan-500/40"
          >
            <option value="">None</option>
            ${PROVIDERS.filter((p) => isProviderEnabled(p.id)).map(
              (p) => html` <option key=${p.id} value=${p.id}>${p.name}</option> `,
            )}
          </select>
          <${ModelSelector}
            providerId=${primaryProvider}
            selectedModel=${settings?.aiPrimaryModel || ""}
            onSelect=${(v) => onSettingsChange("aiPrimaryModel", v)}
            endpoint=${settings?.[`${primaryProvider}_endpoint`] || ""}
            providerEnabled=${isProviderEnabled(primaryProvider)}
          />
        </div>

        <div class="space-y-2">
          <label class="block text-xs text-slate-400">Fallback provider</label>
          <select
            value=${fallbackProvider}
            onChange=${(e) => onSettingsChange("aiSecondary", e.target.value)}
            class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-cyan-500/40"
          >
            <option value="">None</option>
            ${PROVIDERS.filter((p) => isProviderEnabled(p.id)).map(
              (p) => html` <option key=${p.id} value=${p.id}>${p.name}</option> `,
            )}
          </select>
          <p class="text-[11px] text-cyan-400/80">
            You can reuse the same provider as primary if the fallback model is different.
          </p>
          ${fallbackProvider &&
          html`
            <${ModelSelector}
              providerId=${fallbackProvider}
              selectedModel=${settings?.aiSecondaryModel || ""}
              onSelect=${(v) => onSettingsChange("aiSecondaryModel", v)}
              endpoint=${settings?.[`${fallbackProvider}_endpoint`] || ""}
              providerEnabled=${isProviderEnabled(fallbackProvider)}
              excludeModel=${primaryProvider === fallbackProvider ? settings?.aiPrimaryModel : ""}
            />
          `}
        </div>
      </div>

      <!-- Per-provider configuration -->
      <div class="space-y-3">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">
          Provider Configuration
        </h3>
        ${PROVIDERS.map((p) => {
          const enabled = isProviderEnabled(p.id);
          const keys = Array.isArray(savedKeys[p.id]) ? savedKeys[p.id] : [];
          const res = testResult[p.id] || "";
          const isOk =
            res.startsWith("✓") ||
            res.startsWith("Saved") ||
            res.startsWith("Endpoint") ||
            res.startsWith("Reset");
          const customEndpoint = endpointDraft[p.id] ?? (settings?.[`${p.id}_endpoint`] || "");
          const defaultEp = CONSTANTS.AI_PROVIDERS[p.id]?.endpoint || "";

          return html`
            <div
              key=${p.id}
              class="p-4 rounded-xl border ${enabled
                ? "border-white/10"
                : "border-white/5"} bg-white/2 space-y-3 transition-all"
            >
              <!-- Header: name + enable toggle -->
              <div class="flex items-center gap-3">
                <div class="flex-1">
                  <span class="text-sm font-medium text-slate-300">${p.name}</span>
                  ${!enabled &&
                  html`<span class="ml-2 text-[10px] text-slate-600 uppercase tracking-wide"
                    >disabled</span
                  >`}
                </div>
                <button
                  onClick=${() => toggleProvider(p.id)}
                  class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
                    ${enabled ? "bg-cyan-500/30 border-cyan-500/40" : "bg-white/5 border-white/10"}"
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
                <!-- API keys (only for key-required providers) -->
                ${p.keyRequired &&
                html`
                  <div class="space-y-2">
                    ${keys.length > 0 &&
                    html`
                      <div
                        class="flex items-center justify-between text-[11px] text-slate-500 mb-1"
                      >
                        <span>Saved Keys (${keys.length})</span>
                        <button
                          onClick=${() => copyAllKeys(p.id)}
                          class="text-cyan-400 hover:text-cyan-300 transition-colors bg-transparent border-none p-0 cursor-pointer text-xs"
                        >
                          Copy All
                        </button>
                      </div>
                      <div class="flex flex-wrap gap-1.5">
                        ${keys.map(
                          (k, i) => html`
                            <span
                              key=${i}
                              class="flex items-center gap-1 px-2 py-0.5 bg-white/5 rounded text-[11px] text-slate-400 font-mono"
                            >
                              ${maskKey(k)}
                              <button
                                onClick=${() => copyKey(k, p.id)}
                                class="text-slate-600 hover:text-white transition-colors ml-1"
                                title="Copy key"
                              >
                                📋
                              </button>
                              <button
                                onClick=${() => removeKey(p.id, i)}
                                class="text-slate-600 hover:text-rose-400 transition-colors ml-0.5 font-bold"
                                title="Remove key"
                              >
                                ×
                              </button>
                            </span>
                          `,
                        )}
                      </div>
                    `}
                    <div class="flex gap-2">
                      <input
                        type="password"
                        placeholder="Paste API key(s), comma or newline separated"
                        value=${keyDraft[p.id] || ""}
                        onInput=${(e) =>
                          setKeyDraft((d) => ({
                            ...d,
                            [p.id]: e.target.value,
                          }))}
                        class="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-300 font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                      />
                      <button
                        onClick=${() => testKey(p.id)}
                        disabled=${testing[p.id] || !keyDraft[p.id]?.trim()}
                        class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors disabled:opacity-40"
                      >
                        ${testing[p.id] ? "…" : "Test"}
                      </button>
                      <button
                        onClick=${() => saveKeys(p.id)}
                        disabled=${saving[p.id] || !keyDraft[p.id]?.trim()}
                        class="px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors disabled:opacity-40"
                      >
                        ${saving[p.id] ? "…" : "Save"}
                      </button>
                    </div>
                  </div>
                `}

                <!-- Endpoint override -->
                <details class="group">
                  <summary
                    class="text-[11px] text-slate-500 cursor-pointer select-none hover:text-slate-400 transition-colors list-none flex items-center gap-1"
                  >
                    <span class="group-open:hidden">▸</span>
                    <span class="hidden group-open:inline">▾</span>
                    Advanced: custom endpoint
                  </summary>
                  <div class="mt-2 space-y-1">
                    <p class="text-[10px] text-slate-600">
                      Default:
                      <code class="text-slate-500">${defaultEp}</code>
                    </p>
                    <div class="flex gap-2">
                      <input
                        type="url"
                        placeholder=${defaultEp}
                        value=${customEndpoint}
                        onInput=${(e) =>
                          setEndpointDraft((d) => ({
                            ...d,
                            [p.id]: e.target.value,
                          }))}
                        class="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300 font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                      />
                      <button
                        onClick=${() => saveEndpoint(p.id)}
                        class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors"
                      >
                        Save
                      </button>
                      ${settings?.[`${p.id}_endpoint`] &&
                      html`
                        <button
                          onClick=${() => {
                            setEndpointDraft((d) => ({
                              ...d,
                              [p.id]: "",
                            }));
                            onSettingsChange(`${p.id}_endpoint`, null);
                          }}
                          class="px-2 py-1.5 text-slate-500 hover:text-slate-300 text-xs transition-colors"
                          title="Reset to default"
                        >
                          Reset
                        </button>
                      `}
                    </div>
                  </div>
                </details>
              `}
              ${res &&
              html`
                <p class="text-[11px] ${isOk ? "text-emerald-400" : "text-rose-400"}">${res}</p>
              `}
            </div>
          `;
        })}
      </div>

      <!-- MCP Tools (collapsed by default) -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2">
        <button
          onClick=${() => setMcpOpen((v) => !v)}
          class="flex items-center justify-between w-full text-left"
        >
          <div>
            <p class="text-xs font-medium text-slate-400 uppercase tracking-widest">MCP Tools</p>
            <p class="text-[11px] text-slate-600 mt-0.5">
              Context tools available to AI providers during chat and review
            </p>
          </div>
          <span class="text-slate-500 text-xs">${mcpOpen ? "▲" : "▼"}</span>
        </button>

        ${mcpOpen && mcpConfig
          ? html`
              <div class="mt-4 flex flex-col gap-4">
                <div class="flex flex-wrap gap-3">
                  ${[
                    ["useInChat", "Use in Chat"],
                    ["useInReview", "Use in Review"],
                  ].map(
                    ([k, label]) => html`
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked=${mcpConfig[k] === true}
                          onChange=${async (e) => {
                            const v = e.target.checked;
                            await updateMCPConfig({ [k]: v });
                            setMcpConfig((c) => ({ ...c, [k]: v }));
                          }}
                          class="w-3.5 h-3.5 rounded"
                        />
                        <span class="text-xs text-slate-400">${label}</span>
                      </label>
                    `,
                  )}
                </div>
                ${MCP_CATEGORIES.map((cat) => {
                  const tools = Object.entries(MCP_TOOL_INFO).filter(([, i]) => i.category === cat);
                  return html`
                    <div>
                      <p
                        class="text-[10px] font-medium text-slate-500 uppercase tracking-widest mb-2"
                      >
                        ${cat}
                      </p>
                      <div class="flex flex-col gap-1">
                        ${tools.map(
                          ([toolId, toolInfo]) => html`
                            <label
                              class="flex items-start gap-3 p-2.5 rounded-lg bg-white/3 border border-white/6 cursor-pointer hover:bg-white/5 transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked=${mcpEnabledIds.has(toolId)}
                                onChange=${async () => {
                                  const on = !mcpEnabledIds.has(toolId);
                                  await setMCPToolEnabled(toolId, on);
                                  setMcpEnabledIds((prev) => {
                                    const next = new Set(prev);
                                    on ? next.add(toolId) : next.delete(toolId);
                                    return next;
                                  });
                                }}
                                class="w-3.5 h-3.5 rounded mt-0.5 flex-shrink-0"
                              />
                              <div>
                                <p class="text-xs font-medium text-slate-300">${toolInfo.name}</p>
                                <p class="text-[10px] text-slate-500">${toolInfo.description}</p>
                              </div>
                            </label>
                          `,
                        )}
                      </div>
                    </div>
                  `;
                })}
              </div>
            `
          : mcpOpen
            ? html`<p class="mt-3 text-xs text-slate-500">Loading MCP config…</p>`
            : ""}
      </div>

      <!-- Review prompt templates (collapsed by default) -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2">
        <button
          onClick=${() => setPromptsOpen((v) => !v)}
          class="flex items-center justify-between w-full text-left"
        >
          <div>
            <p class="text-xs font-medium text-slate-400 uppercase tracking-widest">
              Review Prompts
            </p>
            <p class="text-[11px] text-slate-600 mt-0.5">
              The instructions the AI review starts from, per platform. Variables:
              <code class="text-slate-500">{title}</code>
              <code class="text-slate-500">{difficulty}</code>
              <code class="text-slate-500">{language}</code>
              <code class="text-slate-500">{platform}</code>
            </p>
          </div>
          <span class="text-slate-500 text-xs">${promptsOpen ? "▲" : "▼"}</span>
        </button>

        ${promptsOpen && promptDraft
          ? html`
              <div class="mt-4 flex flex-col gap-4">
                ${Object.keys(promptDraft).map((key) => {
                  const label =
                    key === "default"
                      ? "Default (all platforms)"
                      : CONSTANTS.PLATFORMS?.[key]?.name || key;
                  const defaults = getDefaultAIPrompts();
                  return html`
                    <div key=${key}>
                      <div class="flex items-center justify-between mb-1">
                        <label class="text-[11px] text-slate-500">${label}</label>
                        ${promptDraft[key] !== defaults[key] &&
                        html`
                          <button
                            onClick=${() => setPromptDraft((d) => ({ ...d, [key]: defaults[key] }))}
                            class="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                          >
                            Reset to default
                          </button>
                        `}
                      </div>
                      <textarea
                        value=${promptDraft[key] || ""}
                        onInput=${(e) => {
                          const v = e.target.value;
                          setPromptDraft((d) => ({ ...d, [key]: v }));
                        }}
                        rows="6"
                        class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono placeholder-slate-600 resize-y focus:outline-none focus:border-cyan-500/40"
                      />
                    </div>
                  `;
                })}
                <div class="flex items-center gap-3">
                  <button
                    onClick=${async () => {
                      setPromptSaving(true);
                      setPromptMsg("");
                      try {
                        await Storage.setAIPrompts(promptDraft);
                        setPromptMsg("Saved");
                      } catch (e) {
                        setPromptMsg("Save failed: " + (e?.message || e));
                      } finally {
                        setPromptSaving(false);
                        setTimeout(() => setPromptMsg(""), 4000);
                      }
                    }}
                    disabled=${promptSaving}
                    class="px-4 py-2 bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/30 text-cyan-300 text-xs rounded-lg transition-colors disabled:opacity-40"
                  >
                    ${promptSaving ? "Saving…" : "Save Prompts"}
                  </button>
                  ${promptMsg &&
                  html`
                    <p
                      class="text-[11px] ${promptMsg === "Saved"
                        ? "text-emerald-400"
                        : "text-rose-400"}"
                    >
                      ${promptMsg}
                    </p>
                  `}
                </div>
              </div>
            `
          : promptsOpen
            ? html`<p class="mt-3 text-xs text-slate-500">Loading prompts…</p>`
            : ""}
      </div>
    </div>
  `;
}
