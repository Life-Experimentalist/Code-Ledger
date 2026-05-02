/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import {
  useEffect,
  useCallback,
  useState,
  useRef,
} from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
import {
  testAIKey,
  testProviderEndpoint,
  fetchModelsForProvider,
} from "../../core/model-fetch.js";
import { Storage } from "../../core/storage.js";
import { ModelSelector } from "./ModelSelector.js";
import { CONSTANTS } from "../../core/constants.js";
import { getQueryParam, updateQueryParams } from "../../core/url-state.js";
import {
  getDefaultAIPrompts,
  normalizeAIPrompts,
  getRegisteredPlatforms,
} from "../../core/ai-prompts.js";
import { DifficultyMapPanel } from "./DifficultyMapPanel.js";
import { MirrorsPanel } from "./MirrorsPanel.js";
const html = htm.bind(h);

// ── Backup / Restore helpers (rendered at bottom of git tab) ──────────────────

async function _exportData() {
  const [problems, settings] = await Promise.all([
    Storage.getAllProblems(),
    Storage.getSettings(),
  ]);
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    problems: problems || [],
    settings: settings || {},
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `codeledger-backup-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return (problems || []).length;
}

async function _importData(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data.problems || !Array.isArray(data.problems)) {
    throw new Error("Invalid backup file: missing problems array");
  }
  for (const p of data.problems) await Storage.saveProblem(p);
  return data.problems.length;
}

function BackupRestorePanel() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    setStatus("");
    try {
      const count = await _exportData();
      setStatus(`Exported ${count} problems successfully.`);
    } catch (e) {
      setStatus(`Export failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus("");
    try {
      const count = await _importData(file);
      setStatus(`Imported ${count} problems. Reload to see them.`);
    } catch (err) {
      setStatus(`Import failed: ${err.message}`);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return html`
    <div class="p-6 bg-[#0a0a0f] rounded-2xl border border-white/5">
      <h3 class="text-sm font-bold text-white uppercase tracking-widest mb-1">Backup & Restore</h3>
      <p class="text-[11px] text-slate-500 mb-4">Export all solved problems and settings to a JSON file, or restore from a previous backup.</p>
      <div class="flex flex-wrap gap-3 items-center">
        <button
          onClick=${doExport}
          disabled=${busy}
          class="px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors disabled:opacity-50"
        >${busy ? "Working…" : "Export backup"}</button>
        <label class="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg cursor-pointer transition-colors ${busy ? "opacity-50 pointer-events-none" : ""}">
          Import backup
          <input type="file" accept=".json,application/json" class="sr-only" onChange=${doImport} disabled=${busy} />
        </label>
      </div>
      ${status ? html`<p class="mt-3 text-xs ${status.includes("failed") ? "text-rose-400" : "text-emerald-400"}">${status}</p>` : ""}
    </div>
  `;
}

function LeetCodeImportPanel({ username }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const doImport = async () => {
    if (!username) {
      setStatus("Enter your LeetCode username above first.");
      return;
    }
    setBusy(true);
    setStatus("Fetching recent accepted submissions…");
    try {
      const query = `query recentAcSubmissions($username: String!, $limit: Int!) {
        recentAcSubmissionList(username: $username, limit: $limit) {
          id title titleSlug timestamp lang
        }
      }`;
      const res = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { username, limit: 20 } }),
      });
      if (!res.ok) throw new Error("LeetCode API returned " + res.status);
      const data = await res.json();
      const submissions = data?.data?.recentAcSubmissionList || [];
      let imported = 0;
      for (const sub of submissions) {
        const slug = (sub.lang || "").toLowerCase().replace(/\s+/g, "");
        const problemId = `${sub.titleSlug}::${slug || "unknown"}`;
        const existing = await Storage.getProblem?.(problemId).catch(() => null);
        if (existing) continue;
        await Storage.saveProblem({
          id: problemId,
          title: sub.title,
          titleSlug: sub.titleSlug,
          platform: "leetcode",
          difficulty: "Unknown",
          lang: { name: slug, ext: slug, slug },
          tags: [],
          timestamp: Number(sub.timestamp) * 1000,
          code: "",
          url: "https://leetcode.com/problems/" + sub.titleSlug + "/",
        });
        await Storage.markPendingProblemKey(`${sub.titleSlug}::${slug || "unknown"}`).catch(() => { });
        imported++;
      }
      setStatus(
        imported > 0
          ? "Imported " + imported + " new problem" + (imported !== 1 ? "s" : "") + " (of " + submissions.length + " recent solves). Reload to see them."
          : "No new problems to import (" + submissions.length + " recent solves already tracked)."
      );
    } catch (e) {
      setStatus("Import failed: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  return html`
    <div class="mt-4 p-4 bg-orange-950/20 rounded-xl border border-orange-500/15">
      <p class="text-[11px] text-slate-400 mb-3">
        Import your last 20 accepted submissions from LeetCode's public API.
        For full history, visit your profile page on LeetCode and use the in-page import button.
      </p>
      <div class="flex items-center gap-3 flex-wrap">
        ${username
      ? html`<span class="text-xs text-slate-400">Username: <strong class="text-white">${username}</strong></span>`
      : html`<span class="text-xs text-slate-500 italic">Set username above to enable</span>`}
        <button
          onClick=${doImport}
          disabled=${busy || !username}
          class="px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-300 text-xs rounded-lg transition-colors disabled:opacity-50"
        >${busy ? "Importing…" : "Import recent solves"}</button>
      </div>
      ${status ? html`<p class="mt-2 text-xs ${status.includes("failed") || status.includes("Error") ? "text-rose-400" : status.includes("No new") ? "text-slate-400" : "text-emerald-400"}">${status}</p>` : ""}
    </div>
  `;
}

const KEY_STRATEGY_OPTIONS = [
  { value: "round-robin", label: "Round Robin" },
  { value: "random", label: "Random" },
  { value: "sticky-first", label: "Sticky First" },
];

function parseKeys(raw) {
  return String(raw || "")
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function maskKey(k) {
  const s = String(k || "");
  if (s.length <= 8)
    return `${"*".repeat(Math.max(0, s.length - 2))}${s.slice(-2)}`;
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

export function SettingsSchema({ schema, values, onChange, onSetupRepo }) {
  const [testResults, setTestResults] = useState({});
  const [testing, setTesting] = useState({});
  const [savedAIKeys, setSavedAIKeys] = useState({});
  const [advancedMap, setAdvancedMap] = useState({});
  const [activeTab, setActiveTab] = useState("general");
  const [showAdvancedProviders, setShowAdvancedProviders] = useState(false);
  const [promptDraft, setPromptDraft] = useState(getDefaultAIPrompts());
  const [promptStatus, setPromptStatus] = useState("");
  const [promptBusy, setPromptBusy] = useState(false);
  // Repo sync state per provider
  const [repoSyncing, setRepoSyncing] = useState({});
  const [repoSyncStatus, setRepoSyncStatus] = useState({});
  // Commit-mode dialog: null = hidden, { provider, count } = shown
  const [syncConfirm, setSyncConfirm] = useState(null);
  const initializedFromQueryRef = useRef(false);
  const scrolledFromQueryRef = useRef(false);
  const prevRepoRef = useRef(values?.["github_repo"] || null);

  useEffect(() => {
    let mounted = true;
    Storage.getAIPrompts()
      .then((raw) => {
        if (!mounted) return;
        setPromptDraft(normalizeAIPrompts(raw));
      })
      .catch(() => {
        if (!mounted) return;
        setPromptDraft(getDefaultAIPrompts());
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    Storage.getAIKeys()
      .then((all) => {
        if (!mounted) return;
        setSavedAIKeys(all || {});
      })
      .catch(() => {
        if (!mounted) return;
        setSavedAIKeys({});
      });
    return () => {
      mounted = false;
    };
  }, []);

  const providerFromField = (key) => {
    const k = (key || "").toLowerCase();
    if (k.includes("gemini")) return "gemini";
    if (k.includes("openai")) return "openai";
    if (k.includes("claude") || k.includes("anthropic")) return "claude";
    if (k.includes("ollama")) return "ollama";
    if (k.includes("deepseek")) return "deepseek";
    if (k.includes("openrouter")) return "openrouter";
    return null;
  };

  const getSectionCategory = (section) => {
    if (section.id === "core") return "general";
    if (CONSTANTS.PLATFORMS?.[section.id]) return "platforms";
    if (CONSTANTS.GIT_PROVIDERS?.[section.id]) return "git";
    if (CONSTANTS.AI_PROVIDERS?.[section.id]) return "ai";
    return "general";
  };

  useEffect(() => {
    if (initializedFromQueryRef.current) return;
    initializedFromQueryRef.current = true;

    const routeTab = getQueryParam("settingsTab", "");
    const routeSection = getQueryParam("settingsSection", "");
    const routeProvider = getQueryParam("settingsProvider", "");
    const routeAdvanced = getQueryParam("settingsAdvanced", "");
    const validTabs = new Set(["general", "ai", "platforms", "git", "prompts"]);

    if (routeAdvanced === "1") setShowAdvancedProviders(true);

    if (validTabs.has(routeTab)) {
      setActiveTab(routeTab);
      return;
    }

    if (routeProvider && CONSTANTS.AI_PROVIDERS?.[routeProvider]) {
      setActiveTab("ai");
      return;
    }

    if (routeSection && Array.isArray(schema)) {
      const section = schema.find((s) => s.id === routeSection);
      if (section) {
        setActiveTab(getSectionCategory(section));
      }
    }
  }, [schema]);

  useEffect(() => {
    updateQueryParams({
      settingsTab: activeTab,
      settingsAdvanced: showAdvancedProviders ? "1" : null,
    });
  }, [activeTab, showAdvancedProviders]);

  useEffect(() => {
    if (scrolledFromQueryRef.current) return;

    const routeProvider = getQueryParam("settingsProvider", "");
    const routeSection = getQueryParam("settingsSection", "");
    if (!routeProvider && !routeSection) return;

    const targetId = routeProvider
      ? `settings-provider-${routeProvider}`
      : `settings-section-${routeSection}`;

    const el = document.getElementById(targetId);
    if (!el) return;

    scrolledFromQueryRef.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeTab, schema]);

  // When a provider is selected as primary/secondary, auto-enable it
  useEffect(() => {
    const selected = [values?.aiProvider, values?.aiSecondary].filter(Boolean);
    selected.forEach((pid) => {
      if (values?.[`${pid}_enabled`] !== true) {
        onChange(`${pid}_enabled`, true);
      }
    });
  }, [values?.aiProvider, values?.aiSecondary, onChange]);

  // Open welcome tab the first time a repo is linked
  useEffect(() => {
    const prev = prevRepoRef.current;
    const curr = values?.["github_repo"] || null;
    prevRepoRef.current = curr;
    if (!prev && curr) {
      // First-time repo link — open welcome if not already shown
      Storage.getSettings().then((s) => {
        if (s.welcomeShown) return;
        Storage.setSettings({ ...s, welcomeShown: true }).catch(() => { });
        if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: "OPEN_WELCOME" });
        }
      }).catch(() => { });
    }
  }, [values?.["github_repo"]]);

  const persistProviderKeys = async (providerId, rawVal) => {
    const all = await Storage.getAIKeys();
    const existing = Array.isArray(all[providerId]) ? all[providerId] : [];
    const incoming = parseKeys(rawVal);
    const merged = [...existing, ...incoming].map((k) => String(k || "").trim()).filter(Boolean);
    all[providerId] = [...new Set(merged)];
    await Storage.setAIKeys(all);
    setSavedAIKeys(all);
  };

  const handleProviderKeysChange = async (_providerId, fieldKey, rawVal) => {
    onChange(fieldKey, rawVal);
  };

  const handleSaveAllKeys = async (providerId, keyField, rawVal) => {
    const keys = parseKeys(rawVal);
    if (!keys.length) {
      setTestResults((s) => ({ ...s, [`${keyField}:all`]: "No keys to save" }));
      return;
    }
    try {
      await persistProviderKeys(providerId, rawVal);
      onChange(keyField, "");
      setTestResults((s) => ({ ...s, [`${keyField}:all`]: `Saved ${keys.length} key(s)` }));
    } catch (e) {
      setTestResults((s) => ({ ...s, [`${keyField}:all`]: e.message || "Failed to save keys" }));
    }
  };

  const handleTestKey = async (
    providerId,
    keyVal,
    resultKey,
    endpointOverride = ""
  ) => {
    if (!providerId) return;
    const key = String(keyVal || "").trim();
    if (!key) {
      setTestResults((s) => ({ ...s, [resultKey]: "No key provided" }));
      return false;
    }

    setTesting((s) => ({ ...s, [resultKey]: true }));
    try {
      const res = await testAIKey(providerId, key, endpointOverride);
      setTestResults((s) => ({
        ...s,
        [resultKey]: res.ok ? "OK" : res.error || "Failed",
      }));
      return !!res.ok;
    } catch (e) {
      setTestResults((s) => ({ ...s, [resultKey]: e.message || "Failed" }));
      return false;
    } finally {
      setTesting((s) => ({ ...s, [resultKey]: false }));
    }
  };

  const handleTestAllKeys = async (providerId, rawVal, baseResultKey) => {
    const keys = parseKeys(rawVal);
    if (!keys.length) {
      setTestResults((s) => ({
        ...s,
        [`${baseResultKey}:all`]: "No keys to test",
      }));
      return;
    }
    let allPassed = true;
    for (let i = 0; i < keys.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await handleTestKey(
        providerId,
        keys[i],
        `${baseResultKey}:${i}`,
        values?.[`${providerId}_endpoint`] || ""
      );
      if (!ok) allPassed = false;
    }
    if (allPassed) {
      await persistProviderKeys(providerId, rawVal);
      onChange(baseResultKey, "");
      setTestResults((s) => ({
        ...s,
        [`${baseResultKey}:all`]: `Tested and saved ${keys.length} key(s)`,
      }));
      return;
    }
    setTestResults((s) => ({
      ...s,
      [`${baseResultKey}:all`]: `Tested ${keys.length} key(s)`,
    }));
  };

  const handleRemoveFailedKeys = (providerId, keyField, rawVal) => {
    const keys = parseKeys(rawVal);
    const validKeys = keys.filter((_, idx) => {
      const result = testResults[`${keyField}:${idx}`];
      // Keep keys that haven't been tested yet, or that passed
      return !result || result === "OK";
    });
    const newVal = validKeys.join(", ");
    handleProviderKeysChange(providerId, keyField, newVal);
    setTestResults((s) => {
      const updated = { ...s };
      keys.forEach((_, idx) => delete updated[`${keyField}:${idx}`]);
      delete updated[`${keyField}:all`];
      return updated;
    });
  };

  const handleTestEndpoint = async (providerId, endpointVal, fieldKey) => {
    if (!providerId) return;
    const ep = String(endpointVal || "").trim();
    if (!ep) {
      setTestResults((s) => ({ ...s, [fieldKey]: "No endpoint provided" }));
      return;
    }

    setTesting((s) => ({ ...s, [fieldKey]: true }));
    try {
      const res = await testProviderEndpoint(providerId, ep);
      if (res.ok) {
        setTestResults((s) => ({ ...s, [fieldKey]: "OK" }));
        await fetchModelsForProvider(providerId, ep);
      } else {
        setTestResults((s) => ({ ...s, [fieldKey]: res.error || "Failed" }));
      }
    } catch (e) {
      setTestResults((s) => ({ ...s, [fieldKey]: e.message || "Failed" }));
    } finally {
      setTesting((s) => ({ ...s, [fieldKey]: false }));
    }
  };

  const handleOAuth = useCallback(
    (provider, key) => {
      const backendUrl = `${CONSTANTS.URLS.AUTH_WORKER}/auth/${provider}`;
      const popup = window.open(backendUrl, "OAuth", "width=600,height=700");
      if (!popup) {
        alert("Please allow popups to connect your account.");
        return;
      }

      const receiveMessage = async (ev) => {
        try {
          const data = ev && ev.data;
          if (!data) return;
          if (data.type !== "CODELEDGER_AUTH") return;
          if (data.provider !== provider) return;
          if (!data.token) return;
          await Storage.setAuthToken(provider, data.token);
          onChange(key, data.token);
          setTestResults((s) => ({ ...s, [key]: "OK" }));

          // For GitHub: fetch the authenticated user's login
          if (provider === "github") {
            try {
              const u = await fetch("https://api.github.com/user", {
                headers: { Authorization: `Bearer ${data.token}` },
              }).then((r) => (r.ok ? r.json() : null));
              if (u?.login) onChange("github_username", u.login);
            } catch (_) { /* ignore */ }
            // Repo setup wizard is handled by GitHubOnboardingModal in library.js
            // — no inline wizard trigger here to avoid duplicate UI
          }
        } catch (e) {
          // ignore
        } finally {
          window.removeEventListener("message", receiveMessage);
          try { popup.close(); } catch (_) { }
        }
      };

      window.addEventListener("message", receiveMessage);
      const poll = setInterval(() => {
        if (popup.closed) {
          clearInterval(poll);
          window.removeEventListener("message", receiveMessage);
        }
      }, 500);
    },
    [onChange]
  );

  const handleDisconnect = useCallback(
    async (provider, key) => {
      try {
        await Storage.clearAuthToken(provider);
      } catch (_) { }
      onChange(key, "");
      setTestResults((s) => ({ ...s, [key]: "" }));
    },
    [onChange]
  );

  const doResyncAll = useCallback(async (provider, mode) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.id) return;
    setRepoSyncing((s) => ({ ...s, [provider]: true }));
    setRepoSyncStatus((s) => ({ ...s, [provider]: "" }));
    try {
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "RESYNC_ALL", mode }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (resp?.ok) resolve(resp);
          else reject(new Error(resp?.error || "Sync failed"));
        });
      });
      const msg = result.committed === 0
        ? "Already in sync — no missing problems found."
        : `Synced ${result.committed} problem(s) to GitHub.`;
      setRepoSyncStatus((s) => ({ ...s, [provider]: msg }));
    } catch (e) {
      setRepoSyncStatus((s) => ({ ...s, [provider]: `Sync failed: ${e.message}` }));
    } finally {
      setRepoSyncing((s) => ({ ...s, [provider]: false }));
    }
  }, []);

  const handleResyncAll = useCallback(async (provider) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.id) return;
    // Count unsynced problems first; ask mode if more than one
    try {
      const countRes = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "RESYNC_COUNT" }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (resp?.ok) resolve(resp);
          else reject(new Error(resp?.error || "Count failed"));
        });
      });
      if (countRes.count === 0) {
        setRepoSyncStatus((s) => ({ ...s, [provider]: "Already in sync — no missing problems found." }));
        return;
      }
      if (countRes.count > 1) {
        setSyncConfirm({ provider, count: countRes.count });
        return;
      }
      // Single problem — just commit directly (bulk and individual are identical for 1 problem)
      await doResyncAll(provider, "bulk");
    } catch (_) {
      // If count fails, fall back to direct sync
      await doResyncAll(provider, "bulk");
    }
  }, [doResyncAll]);

  const isProviderEffectivelyEnabled = (providerId) => {
    if (!providerId) return false;
    if (values?.aiProvider === providerId || values?.aiSecondary === providerId) return true;
    return values?.[`${providerId}_enabled`] === true;
  };

  const savePromptDraft = async () => {
    setPromptBusy(true);
    setPromptStatus("");
    try {
      const normalized = normalizeAIPrompts(promptDraft);
      await Storage.setAIPrompts(normalized);
      setPromptDraft(normalized);
      setPromptStatus("Saved");
    } catch (e) {
      setPromptStatus(`Save failed: ${e.message || "Unknown error"}`);
    } finally {
      setPromptBusy(false);
    }
  };

  const resetPromptDraft = () => {
    setPromptDraft(getDefaultAIPrompts());
    setPromptStatus("Reset to defaults (not saved yet)");
  };

  const shouldRenderField = (section, field) => {
    if (section.id !== "core") return true;
    if (activeTab === "general") {
      // AI-routing fields are owned by the AI tab; hide them here to avoid duplication
      return !["aiProvider", "aiSecondary", "aiModel"].includes(field.key);
    }
    return true;
  };

  const renderStandardField = (section, f) => html`
    <div
      class="flex items-center justify-between py-3 border-b border-white/5 last:border-0"
      key=${f.key}
    >
      <div class="flex flex-col gap-1 w-2/3 pr-4">
        <span class="text-sm font-medium text-slate-300">${f.label}</span>
        ${f.description
      ? html`<span class="text-[10px] text-slate-500 leading-tight"
              >${f.description}</span
            >`
      : ""}
      </div>

      <div class="w-1/3 flex flex-col items-end gap-2">
        ${f.type === "toggle"
      ? html`
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  class="sr-only peer"
                  checked=${values[f.key] ?? f.default}
                  onChange=${(e) => onChange(f.key, e.target.checked)}
                />
                <div
                  class="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"
                ></div>
              </label>
            `
      : ""}
        ${f.type === "url" || f.type === "text" || f.type === "password"
      ? html`
              <div class="flex items-center gap-2 w-full">
                <input
                  type=${f.type}
                  value=${values[f.key] ?? f.default}
                  placeholder=${f.placeholder || ""}
                  class="px-3 py-1.5 bg-black border border-white/10 rounded text-sm text-white w-full"
                  onChange=${(e) => onChange(f.key, e.target.value)}
                />
                ${(() => {
          const prov = providerFromField(f.key);
          if (!prov) return "";
          const isEndpoint = String(f.key || "")
            .toLowerCase()
            .includes("_endpoint");
          return html`
                    <button
                      onClick=${() =>
              isEndpoint
                ? handleTestEndpoint(
                  prov,
                  values[f.key] ?? "",
                  f.key
                )
                : handleTestKey(
                  prov,
                  parseKeys(values[f.key] ?? "")[0] || "",
                  f.key,
                  values?.[`${prov}_endpoint`] || ""
                )}
                      class="px-3 py-1.5 bg-[#1f2937] hover:bg-[#334155] text-xs text-white rounded"
                    >
                      ${testing[f.key]
              ? "Testing..."
              : isEndpoint
                ? "Check"
                : "Test"}
                    </button>
                  `;
        })()}
              </div>
              ${testResults[f.key]
          ? html`<div class="text-[11px] mt-1 text-slate-400">
                    ${testResults[f.key]}
                  </div>`
          : ""}
            `
      : ""}
        ${f.type === "select"
      ? html`
              <div class="flex items-center gap-2 w-full">
                <select
                  class="px-3 py-1.5 bg-black border border-white/10 rounded text-sm text-white w-full"
                  value=${values[f.key] ?? f.default}
                  onChange=${(e) => onChange(f.key, e.target.value)}
                >
                  ${f.options && f.options.length === 0
          ? html`<option disabled value="">No options</option>`
          : ""}
                  ${f.options
          ? f.options.map(
            (opt) =>
              html`<option value=${opt.value}>${opt.label}</option>`
          )
          : ""}
                </select>
              </div>
            `
      : ""}
        ${f.type === "oauth"
      ? html`
              <div class="flex flex-col gap-2 items-end">
                <div class="flex items-center gap-2">
                  ${values[f.key]
          ? html`
                        <span
                          title="Connected"
                          class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                        ></span>
                        <span class="text-xs text-emerald-400 font-medium">Connected</span>
                        <button
                          onClick=${() => handleOAuth(f.provider, f.key)}
                          class="px-3 py-1.5 bg-[#24292e] hover:bg-[#2f363d] text-white text-xs font-medium border border-white/10 rounded-lg transition-colors"
                        >
                          Reconnect
                        </button>
                        <button
                          onClick=${() => handleDisconnect(f.provider, f.key)}
                          class="px-3 py-1.5 bg-red-900/40 hover:bg-red-900/70 text-red-300 text-xs font-medium border border-red-700/30 rounded-lg transition-colors"
                        >
                          Disconnect
                        </button>
                      `
          : html`
                        <button
                          onClick=${() => handleOAuth(f.provider, f.key)}
                          class="px-4 py-2 bg-[#24292e] hover:bg-[#2f363d] text-white text-xs font-medium border border-white/10 rounded-lg flex items-center gap-2 transition-colors"
                        >
                          Connect
                        </button>
                      `}
                </div>

                ${values[f.key] && f.provider === "github"
          ? html`
                      ${(() => {
              const savedRepo = values["github_repo"];
              const owner = values["github_owner"]?.trim() || values["github_username"] || "";
              const repoUrl = savedRepo && owner ? `https://github.com/${owner}/${savedRepo}` : null;
              const isSyncing = repoSyncing[f.provider];
              const syncMsg = repoSyncStatus[f.provider];
              const isExtension = typeof chrome !== "undefined" && !!chrome.runtime?.id;

              if (savedRepo) {
                // ── Repository configured ──────────────────────
                return html`
                  <div class="flex flex-col gap-1.5 mt-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-[11px] text-emerald-400">
                        ${owner ? html`<span class="text-slate-400">${owner}/</span>` : ""}<strong>${savedRepo}</strong>
                      </span>
                      ${repoUrl ? html`<a
                        href=${repoUrl} target="_blank" rel="noreferrer"
                        class="text-[11px] text-cyan-400 underline hover:text-cyan-300"
                      >View on GitHub ↗</a>` : ""}
                      ${isExtension ? html`
                        <button
                          onClick=${() => handleResyncAll(f.provider)}
                          disabled=${isSyncing}
                          class="px-2.5 py-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          title="Push all locally-saved problems to your GitHub repo — commits any that are missing from the repo"
                        >
                          ${isSyncing
                      ? html`<svg class="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12a8 8 0 018-8v8z" fill="currentColor" stroke="none"/></svg> Syncing…`
                      : html`↑ Push to GitHub`
                    }
                        </button>
                      ` : ""}
                      ${onSetupRepo ? html`
                        <button
                          onClick=${() => onSetupRepo(values[f.key], owner)}
                          class="text-[10px] text-slate-500 hover:text-slate-300 underline ml-auto transition-colors"
                        >Change repo</button>
                      ` : ""}
                    </div>
                    ${syncMsg ? html`<p class="text-[10px] ${syncMsg.includes("failed") || syncMsg.includes("Failed") ? "text-rose-400" : "text-emerald-400"}">${syncMsg}</p>` : ""}
                  </div>
                `;
              }

              // ── No repo configured yet ─────────────────────
              return html`
                <div class="flex flex-col gap-2 w-full mt-2 p-3 bg-cyan-950/30 border border-cyan-500/20 rounded-lg">
                  <p class="text-[11px] text-cyan-300 font-medium">Repository not configured</p>
                  <p class="text-[10px] text-slate-500">Set up a repository to automatically commit your solutions to GitHub.</p>
                  ${onSetupRepo ? html`
                    <button
                      onClick=${() => onSetupRepo(values[f.key], owner)}
                      class="self-start px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors"
                    >Set up repository →</button>
                  ` : html`<p class="text-[10px] text-amber-400">Open the Library page to set up your repository.</p>`}
                </div>
              `;
            })()}
                    `
          : ""}
              </div>
            `
      : ""}
      </div>
    </div>
  `;

  const renderSection = (section) => {
    const allFields = (section.fields || []).filter((f) =>
      shouldRenderField(section, f)
    );
    if (!allFields.length) return "";

    const normalFields = allFields.filter((f) => !f.advanced);
    const advancedFields = allFields.filter((f) => f.advanced);
    const showAdv = !!advancedMap[section.id];

    const isGitProvider = !!CONSTANTS.GIT_PROVIDERS?.[section.id];
    const enabledField = `${section.id}_enabled`;
    const gitEnabled = isGitProvider
      ? typeof values?.[enabledField] === "undefined"
        ? true
        : !!values[enabledField]
      : true;

    return html`
      <div
        id=${`settings-section-${section.id}`}
        key=${section.id}
        class="p-6 bg-[#0a0a0f] rounded-2xl border border-white/5 flex flex-col gap-4"
      >
        <div class="flex items-center justify-between">
          <h3
            class="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2"
          >
            ${section.icon ? html`<span>${section.icon}</span>` : ""}
            ${section.title || section.label}
          </h3>
          ${isGitProvider
        ? html`
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    class="sr-only peer"
                    checked=${gitEnabled}
                    onChange=${(e) => onChange(enabledField, e.target.checked)}
                  />
                  <div
                    class="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"
                  ></div>
                </label>
              `
        : ""}
        </div>

        ${section.id === "github" && values?.["github_token"] && !values?.["github_repo"] ? html`
          <div class="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-300">
            <span class="text-base shrink-0">⚠️</span>
            <div class="flex-1">
              <strong>Setup incomplete</strong> — GitHub is connected but no repository is linked.
            </div>
            <button
              onClick=${() => onSetupRepo?.()}
              class="shrink-0 px-2 py-1 bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/30 rounded text-amber-200 transition-colors"
            >Setup repo →</button>
          </div>
        ` : ""}

        ${section.id === "github" && values?.["github_token"] && values?.["github_repo"] ? html`
          <div class="flex items-center gap-2 text-[11px] text-emerald-400">
            <span>✓</span>
            <span>Connected & repository linked — syncing is active.</span>
          </div>
        ` : ""}

        ${isGitProvider && section.id !== "github"
        ? html`
              <div
                class="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2"
              >
                ⚠️ ${CONSTANTS.GIT_PROVIDERS[section.id]?.name || section.id}
                support is in testing — do not use in production yet.
              </div>
            `
        : ""}

        <div class="space-y-4">
          ${normalFields.map((f) => renderStandardField(section, f))}
        </div>

        ${advancedFields.length
        ? html`
              <div class="border-t border-white/5 pt-3">
                <button
                  onClick=${() =>
            setAdvancedMap((m) => ({
              ...m,
              [section.id]: !m[section.id],
            }))}
                  class="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <svg
                    class="w-3 h-3 transition-transform ${showAdv
            ? "rotate-90"
            : ""}"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  Advanced
                </button>
                ${showAdv
            ? html`<div class="mt-3 space-y-4 pl-1 border-l border-white/5">
                      ${advancedFields.map((f) =>
              renderStandardField(section, f)
            )}
                      ${section.id === "leetcode"
                ? html`<${LeetCodeImportPanel} username=${values?.leetcode_username || ""} />`
                : ""}
                    </div>`
            : ""}
              </div>
            `
        : ""}
      </div>
    `;
  };

  const renderAIRouting = () => {
    const primaryProvider = values.aiProvider || "";
    const secondaryProvider = values.aiSecondary || "";
    const selectableProviders = Object.keys(
      CONSTANTS.AI_PROVIDERS || {}
    ).filter((pid) => isProviderEffectivelyEnabled(pid));

    return html`
      <div
        class="p-6 bg-[#0a0a0f] rounded-2xl border border-white/5 flex flex-col gap-4"
      >
        <h3 class="text-sm font-bold text-white uppercase tracking-widest">
          AI Routing
        </h3>
        <div class="flex items-center justify-end">
          <button
            onClick=${() => setShowAdvancedProviders((v) => !v)}
            class="text-xs px-2 py-1 bg-white/5 rounded border border-white/10 text-slate-300"
          >
            ${showAdvancedProviders
        ? "Hide advanced provider settings"
        : "Show advanced provider settings"}
          </button>
        </div>

        <div class="space-y-4">
          <div
            class="flex items-center justify-between py-3 border-b border-white/5"
          >
            <div class="flex flex-col gap-1 w-2/3 pr-4">
              <span class="text-sm font-medium text-slate-300"
                >Enable AI Review</span
              >
              <span class="text-[10px] text-slate-500 leading-tight"
                >Automatically analyze code using AI upon completion.</span
              >
            </div>
            <div class="w-1/3 flex justify-end">
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  class="sr-only peer"
                  checked=${values.autoReview ?? true}
                  onChange=${(e) => onChange("autoReview", e.target.checked)}
                />
                <div
                  class="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"
                ></div>
              </label>
            </div>
          </div>

          <div
            class="flex items-start justify-between py-3 border-b border-white/5"
          >
            <div class="flex flex-col gap-1 w-2/3 pr-4">
              <span class="text-sm font-medium text-slate-300"
                >Primary AI Provider</span
              >
              <span class="text-[10px] text-slate-500 leading-tight"
                >Preferred AI provider to use for automated reviews.</span
              >
            </div>
            <div class="w-1/3 flex flex-col items-end gap-2">
              <div class="flex flex-col w-full gap-2">
                <select
                  class="px-3 py-1.5 bg-black border border-white/10 rounded text-sm text-white w-full"
                  value=${primaryProvider}
                  onChange=${(e) => onChange("aiProvider", e.target.value)}
                >
                  <option value="">None</option>
                  ${selectableProviders.map(
          (pid) =>
            html`<option value=${pid}>
                        ${CONSTANTS.AI_PROVIDERS[pid].name}
                      </option>`
        )}
                </select>

                ${primaryProvider
        ? html`<${ModelSelector}
                      providerId=${primaryProvider}
                      apiKey=${values[`${primaryProvider}_keys`] || ""}
                      selectedModel=${values.aiPrimaryModel || ""}
                      onSelect=${(v) => onChange("aiPrimaryModel", v)}
                      endpoint=${values[`${primaryProvider}_endpoint`] || ""}
                      providerEnabled=${isProviderEffectivelyEnabled(
          primaryProvider
        )}
                      onToggleEnabled=${(val) =>
            onChange(`${primaryProvider}_enabled`, val)}
                    />`
        : ""}
              </div>
            </div>
          </div>

          <div
            class="flex items-start justify-between py-3 border-b border-white/5"
          >
            <div class="flex flex-col gap-1 w-2/3 pr-4">
              <span class="text-sm font-medium text-slate-300"
                >Secondary AI Provider</span
              >
              <span class="text-[10px] text-slate-500 leading-tight"
                >Fallback provider to be used if the primary fails.</span
              >
            </div>
            <div class="w-1/3 flex flex-col items-end gap-2">
              <div class="flex flex-col w-full gap-2">
                <select
                  class="px-3 py-1.5 bg-black border border-white/10 rounded text-sm text-white w-full"
                  value=${secondaryProvider}
                  onChange=${(e) => onChange("aiSecondary", e.target.value)}
                >
                  <option value="">None</option>
                  ${selectableProviders.map(
          (pid) =>
            html`<option value=${pid}>
                        ${CONSTANTS.AI_PROVIDERS[pid].name}
                      </option>`
        )}
                </select>

                ${secondaryProvider
        ? html`<${ModelSelector}
                      providerId=${secondaryProvider}
                      apiKey=${values[`${secondaryProvider}_keys`] || ""}
                      selectedModel=${values.aiSecondaryModel || ""}
                      onSelect=${(v) => onChange("aiSecondaryModel", v)}
                      endpoint=${values[`${secondaryProvider}_endpoint`] || ""}
                      providerEnabled=${isProviderEffectivelyEnabled(
          secondaryProvider
        )}
                      onToggleEnabled=${(val) =>
            onChange(`${secondaryProvider}_enabled`, val)}
                    />`
        : ""}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  };

  const renderAIProviderCards = () => {
    const providerIds = Object.keys(CONSTANTS.AI_PROVIDERS || {});
    return html`
      <div class="space-y-6">
        ${providerIds.map((pid) => {
      const p = CONSTANTS.AI_PROVIDERS[pid];
      const keyField = `${pid}_keys`;
      const endpointField = `${pid}_endpoint`;
      const modelField = `${pid}_model`;
      const enabledField = `${pid}_enabled`;
      const strategyField = `${pid}_keyStrategy`;
      const rawKeys = values[keyField] || "";
      const keyList = parseKeys(rawKeys);
      const savedKeys = Array.isArray(savedAIKeys[pid]) ? savedAIKeys[pid] : [];
      const endpoint = values[endpointField] || p.endpoint || "";
      const providerEnabled =
        typeof values[enabledField] === "undefined"
          ? true
          : !!values[enabledField];
      const isPinned =
        values?.aiProvider === pid || values?.aiSecondary === pid;

      return html`
            <div
              id=${`settings-provider-${pid}`}
              key=${pid}
              class="p-6 bg-[#0a0a0f] rounded-2xl border border-white/5 flex flex-col gap-4"
            >
              <div class="flex items-center justify-between">
                <div>
                  <h3
                    class="text-sm font-bold text-white uppercase tracking-widest"
                  >
                    ${p.name}
                  </h3>
                  <p class="text-[10px] text-slate-500 mt-1">
                    Provider configuration and key management.
                  </p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    class="sr-only peer"
                    checked=${providerEnabled}
                    disabled=${isPinned}
                    onChange=${(e) => onChange(enabledField, e.target.checked)}
                  />
                  <div
                    class="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500 disabled:opacity-50"
                  ></div>
                </label>
              </div>
              ${isPinned
          ? html`<p class="text-[11px] text-amber-400">
                    This provider is active as
                    ${values?.aiProvider === pid ? " primary " : " secondary "}and
                    cannot be disabled.
                  </p>`
          : ""}
              ${p.keyRequired
          ? html`
                    <div class="space-y-3">
                      <label
                        class="text-xs uppercase tracking-wider text-slate-400"
                        >API Keys</label
                      >
                      <textarea
                        value=${rawKeys}
                        onInput=${(e) =>
              handleProviderKeysChange(
                pid,
                keyField,
                e.target.value
              )}
                        placeholder="Enter keys separated by commas or new lines"
                        class="w-full min-h-[90px] px-3 py-2 bg-black border border-white/10 rounded text-sm text-white"
                      ></textarea>
                      <div class="flex items-center justify-between">
                        <span class="text-[11px] text-slate-500"
                          >${savedKeys.length} saved • ${keyList.length} draft</span
                        >
                        <div class="flex items-center gap-2">
                          <button
                            onClick=${() =>
              handleSaveAllKeys(pid, keyField, rawKeys)}
                            class="px-3 py-1.5 bg-[#0f766e]/30 hover:bg-[#0f766e]/45 text-xs text-cyan-100 rounded"
                          >
                            Save Keys
                          </button>
                          <button
                            onClick=${() =>
              handleTestAllKeys(pid, rawKeys, keyField)}
                            class="px-3 py-1.5 bg-[#1f2937] hover:bg-[#334155] text-xs text-white rounded"
                          >
                            Test All
                          </button>
                        </div>
                      </div>
                      ${testResults[`${keyField}:all`]
              ? html`<div class="text-[11px] text-slate-400">
                            ${testResults[`${keyField}:all`]}
                          </div>`
              : ""}

                      <div class="space-y-2">
                        ${keyList.map(
                (k, idx) => html`
                            <div
                              key=${`${pid}-${idx}`}
                              class="flex items-center justify-between bg-black/40 border border-white/10 rounded px-3 py-2"
                            >
                              <span class="text-xs text-slate-300 font-mono"
                                >${maskKey(k)}</span
                              >
                              <div class="flex items-center gap-2">
                                <button
                                  onClick=${() =>
                    handleTestKey(
                      pid,
                      k,
                      `${keyField}:${idx}`,
                      endpoint
                    )}
                                  class="px-2 py-1 bg-[#1f2937] hover:bg-[#334155] text-xs text-white rounded"
                                >
                                  ${testing[`${keyField}:${idx}`]
                    ? "Testing..."
                    : "Test"}
                                </button>
                                ${(() => {
                    const r = testResults[`${keyField}:${idx}`];
                    if (!r) return "";
                    const ok = r === "OK";
                    return html`<span class="text-[11px] ${ok ? "text-emerald-400" : "text-rose-400"}">${r}</span>`;
                  })()}
                              </div>
                            </div>
                          `
              )}
                      </div>

                      ${(() => {
              const hasFailed = keyList.some((_, idx) => {
                const r = testResults[`${keyField}:${idx}`];
                return r && r !== "OK";
              });
              return hasFailed ? html`
                <button
                  onClick=${() => handleRemoveFailedKeys(pid, keyField, rawKeys)}
                  class="self-start px-3 py-1.5 bg-rose-600/15 hover:bg-rose-600/30 border border-rose-500/30 text-rose-400 text-xs rounded transition-colors"
                >Remove failed keys</button>
              ` : "";
            })()}

                      <div class="flex items-center gap-2">
                        <label
                          class="text-xs uppercase tracking-wider text-slate-400 min-w-[98px]"
                          >Key Strategy</label
                        >
                        <select
                          class="px-3 py-1.5 bg-black border border-white/10 rounded text-sm text-white w-full"
                          value=${values[strategyField] || "round-robin"}
                          onChange=${(e) =>
              onChange(strategyField, e.target.value)}
                        >
                          ${KEY_STRATEGY_OPTIONS.map(
                (opt) =>
                  html`<option value=${opt.value}>
                                ${opt.label}
                              </option>`
              )}
                        </select>
                      </div>
                    </div>
                  `
          : html`<div class="text-xs text-slate-500">
                    No API key required for this provider.
                  </div>`}
              ${showAdvancedProviders
          ? html`<div class="space-y-2">
                    <label
                      class="text-xs uppercase tracking-wider text-slate-400"
                      >Endpoint</label
                    >
                    <div class="flex items-center gap-2">
                      <input
                        type="text"
                        value=${endpoint}
                        onChange=${(e) =>
              onChange(endpointField, e.target.value)}
                        class="px-3 py-1.5 bg-black border border-white/10 rounded text-sm text-white w-full"
                      />
                      <button
                        onClick=${() =>
              handleTestEndpoint(pid, endpoint, endpointField)}
                        class="px-3 py-1.5 bg-[#1f2937] hover:bg-[#334155] text-xs text-white rounded"
                      >
                        ${testing[endpointField] ? "Checking..." : "Check"}
                      </button>
                    </div>
                    ${testResults[endpointField]
              ? html`<div class="text-[11px] text-slate-400">
                          ${testResults[endpointField]}
                        </div>`
              : ""}
                  </div>`
          : ""}

              <div class="space-y-2">
                <label class="text-xs uppercase tracking-wider text-slate-400"
                  >Default Provider Model</label
                >
                <${ModelSelector}
                  providerId=${pid}
                  apiKey=${rawKeys}
                  selectedModel=${values[modelField] || ""}
                  onSelect=${(v) => onChange(modelField, v)}
                  endpoint=${endpoint}
                  providerEnabled=${providerEnabled}
                  onToggleEnabled=${(val) => onChange(enabledField, val)}
                />
              </div>
            </div>
          `;
    })}
      </div>
    `;
  };

  const tabs = [
    { id: "general", label: "General" },
    { id: "ai", label: "AI" },
    { id: "prompts", label: "Prompts" },
    { id: "platforms", label: "Platforms" },
    { id: "git", label: "Git" },
  ];

  const standardSections = (schema || []).filter((section) => {
    const cat = getSectionCategory(section);
    if (activeTab === "ai" || activeTab === "prompts") return false;
    return cat === activeTab;
  });

  const renderPromptsTab = () => {
    // Build ordered platform list from registered handlers — no hardcoded keys
    const registeredPlatforms = getRegisteredPlatforms();
    const allPlatformKeys = [...registeredPlatforms, "default"];

    return html`
      <div
        class="p-6 bg-[#0a0a0f] rounded-2xl border border-amber-500/30 flex flex-col gap-4"
      >
        <h3 class="text-sm font-bold text-white uppercase tracking-widest">
          AI Review Prompts
        </h3>
        <div
          class="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded p-3"
        >
          Warning: changing prompts can reduce review quality. Restore with
          "Reset to defaults".
        </div>
        <div
          class="text-[11px] text-slate-400 bg-black/30 border border-white/5 rounded px-3 py-2"
        >
          Template variables:${" "}
          <code class="text-cyan-400">{"{title}"}</code>,${" "}
          <code class="text-cyan-400">{"{difficulty}"}</code>,${" "}
          <code class="text-cyan-400">{"{language}"}</code>,${" "}
          <code class="text-cyan-400">{"{platform}"}</code>
        </div>

        ${allPlatformKeys.map(
      (platform) => html`
            <div key=${platform} class="flex flex-col gap-2">
              <label class="text-xs uppercase tracking-wider text-slate-400">
                ${platform === "default"
          ? "Default (all other platforms)"
          : platform.charAt(0).toUpperCase() + platform.slice(1)}
              </label>
              <textarea
                value=${promptDraft[platform] || ""}
                onInput=${(e) =>
          setPromptDraft((s) => ({
            ...s,
            [platform]: e.target.value,
          }))}
                rows="6"
                class="w-full px-3 py-2 bg-black border border-white/10 rounded text-sm text-white font-mono resize-y"
              ></textarea>
            </div>
          `
    )}

        <div class="flex items-center gap-2 pt-2">
          <button
            onClick=${savePromptDraft}
            disabled=${promptBusy}
            class="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-xs text-white rounded disabled:opacity-50"
          >
            ${promptBusy ? "Saving..." : "Save prompts"}
          </button>
          <button
            onClick=${resetPromptDraft}
            class="px-3 py-1.5 bg-[#1f2937] hover:bg-[#334155] text-xs text-white rounded"
          >
            Reset to defaults
          </button>
        </div>
        ${promptStatus
        ? html`<div class="text-[11px] text-slate-400">${promptStatus}</div>`
        : ""}
      </div>
    `;
  };

  return html`
    <div class="space-y-6">
      <div class="flex flex-wrap gap-2">
        ${tabs.map(
    (t) => html`
            <button
              key=${t.id}
              onClick=${() => setActiveTab(t.id)}
              class="px-3 py-1.5 rounded-lg text-xs uppercase tracking-wider border ${activeTab ===
        t.id
        ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
        : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"}"
            >
              ${t.label}
            </button>
          `
  )}
      </div>

      ${activeTab === "ai"
      ? html` ${renderAIRouting()} ${renderAIProviderCards()} `
      : activeTab === "prompts"
        ? html`${renderPromptsTab()}`
        : html`
              <div class="space-y-6">
                ${standardSections.map((section) => renderSection(section))}
                ${activeTab === "git" ? html`<${BackupRestorePanel} /><${MirrorsPanel} />` : ""}
                ${activeTab === "general" ? html`<${DifficultyMapPanel} />` : ""}
              </div>
            `}

      ${syncConfirm ? html`
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick=${() => setSyncConfirm(null)}>
          <div class="bg-[#0d1117] border border-white/10 rounded-2xl p-6 w-80 shadow-2xl flex flex-col gap-4" onClick=${(e) => e.stopPropagation()}>
            <h3 class="text-sm font-bold text-white">Sync ${syncConfirm.count} problems</h3>
            <p class="text-[11px] text-slate-400">How would you like to commit them to GitHub?</p>
            <div class="flex flex-col gap-2">
              <button
                onClick=${() => { const p = syncConfirm.provider; setSyncConfirm(null); doResyncAll(p, "bulk"); }}
                class="w-full px-3 py-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-medium hover:bg-cyan-500/25 transition-colors text-left"
              >
                <div class="font-semibold mb-0.5">Single commit <span class="text-cyan-500/60 font-normal">(recommended)</span></div>
                <div class="text-[10px] text-slate-500">All problems in one atomic commit — avoids GitHub API rate limits.</div>
              </button>
              <button
                onClick=${() => { const p = syncConfirm.provider; setSyncConfirm(null); doResyncAll(p, "individual"); }}
                class="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs font-medium hover:bg-white/10 transition-colors text-left"
              >
                <div class="font-semibold mb-0.5">Individual commits</div>
                <div class="text-[10px] text-slate-500">One backdated commit per problem — slower, may hit rate limits.</div>
              </button>
            </div>
            <button onClick=${() => setSyncConfirm(null)} class="text-[11px] text-slate-600 hover:text-slate-400 self-end">Cancel</button>
          </div>
        </div>
      ` : ""}
    </div>
  `;
}
