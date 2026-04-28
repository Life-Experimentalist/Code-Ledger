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
const html = htm.bind(h);

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

export function SettingsSchema({ schema, values, onChange }) {
  const [testResults, setTestResults] = useState({});
  const [testing, setTesting] = useState({});
  const [advancedMap, setAdvancedMap] = useState({});
  const [activeTab, setActiveTab] = useState("general");
  const [showAdvancedProviders, setShowAdvancedProviders] = useState(false);
  const [promptDraft, setPromptDraft] = useState(getDefaultAIPrompts());
  const [promptStatus, setPromptStatus] = useState("");
  const [promptBusy, setPromptBusy] = useState(false);
  // Repo setup: tracks "new" | "existing" | null per provider
  const [repoSetup, setRepoSetup] = useState({});
  const initializedFromQueryRef = useRef(false);
  const scrolledFromQueryRef = useRef(false);

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

  useEffect(() => {
    const selected = [values?.aiProvider, values?.aiSecondary].filter(Boolean);
    selected.forEach((pid) => {
      if (values?.[`${pid}_enabled`] === false) {
        onChange(`${pid}_enabled`, true);
      }
    });
  }, [values?.aiProvider, values?.aiSecondary, onChange]);

  const persistProviderKeys = async (providerId, rawVal) => {
    const all = await Storage.getAIKeys();
    all[providerId] = parseKeys(rawVal);
    await Storage.setAIKeys(all);
  };

  const handleProviderKeysChange = async (providerId, fieldKey, rawVal) => {
    onChange(fieldKey, rawVal);
    try {
      await persistProviderKeys(providerId, rawVal);
    } catch (e) {
      // ignore persistence failure in UI layer
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
      return;
    }

    setTesting((s) => ({ ...s, [resultKey]: true }));
    try {
      const res = await testAIKey(providerId, key, endpointOverride);
      setTestResults((s) => ({
        ...s,
        [resultKey]: res.ok ? "OK" : res.error || "Failed",
      }));
    } catch (e) {
      setTestResults((s) => ({ ...s, [resultKey]: e.message || "Failed" }));
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
    for (let i = 0; i < keys.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await handleTestKey(
        providerId,
        keys[i],
        `${baseResultKey}:${i}`,
        values?.[`${providerId}_endpoint`] || ""
      );
    }
    setTestResults((s) => ({
      ...s,
      [`${baseResultKey}:all`]: `Tested ${keys.length} key(s)`,
    }));
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
        } catch (e) {
          // ignore
        } finally {
          window.removeEventListener("message", receiveMessage);
          try {
            popup.close();
          } catch (e) {
            // ignore
          }
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
      } catch (_) {}
      onChange(key, "");
      setTestResults((s) => ({ ...s, [key]: "" }));
    },
    [onChange]
  );

  const isProviderEffectivelyEnabled = (providerId) => {
    if (!providerId) return false;
    if (
      values?.aiProvider === providerId ||
      values?.aiSecondary === providerId
    ) {
      return true;
    }
    return values?.[`${providerId}_enabled`] !== false;
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
                        const rs = repoSetup[f.provider];
                        const savedRepo = values["github_repo"];

                        // ── Edit: create new repo ──────────────────────
                        if (rs === "new") return html`
                          <div class="flex flex-col gap-2 w-full mt-1 p-3 bg-cyan-950/30 border border-cyan-500/20 rounded-lg">
                            <p class="text-[11px] text-cyan-300 font-medium">New repository name</p>
                            <div class="flex gap-2">
                              <input
                                type="text"
                                value=${savedRepo || "CodeLedger-Sync"}
                                placeholder="CodeLedger-Sync"
                                class="flex-1 px-3 py-1.5 bg-black border border-white/10 rounded text-sm text-white"
                                onChange=${(e) => onChange("github_repo", e.target.value)}
                              />
                              <button
                                onClick=${() => setRepoSetup((s) => ({ ...s, [f.provider]: null }))}
                                class="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs rounded"
                              >Save</button>
                            </div>
                            <p class="text-[10px] text-slate-500">Created automatically on first commit.</p>
                            <button onClick=${() => setRepoSetup((s) => ({ ...s, [f.provider]: null }))} class="text-[10px] text-slate-500 underline self-start">← Back</button>
                          </div>
                        `;

                        // ── Edit: link existing repo ────────────────────
                        if (rs === "existing") return html`
                          <div class="flex flex-col gap-2 w-full mt-1 p-3 bg-cyan-950/30 border border-cyan-500/20 rounded-lg">
                            <p class="text-[11px] text-cyan-300 font-medium">Existing repository name</p>
                            <div class="flex gap-2">
                              <input
                                type="text"
                                value=${savedRepo || ""}
                                placeholder="repo-name (no owner prefix)"
                                class="flex-1 px-3 py-1.5 bg-black border border-white/10 rounded text-sm text-white"
                                onChange=${(e) => onChange("github_repo", e.target.value.split("/").pop())}
                              />
                              <button
                                onClick=${() => setRepoSetup((s) => ({ ...s, [f.provider]: null }))}
                                class="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs rounded"
                              >Link</button>
                            </div>
                            <p class="text-[10px] text-slate-500">Enter only the repository name, not the full URL.</p>
                            <button onClick=${() => setRepoSetup((s) => ({ ...s, [f.provider]: null }))} class="text-[10px] text-slate-500 underline self-start">← Back</button>
                          </div>
                        `;

                        // ── Configured ─────────────────────────────────
                        if (savedRepo) {
                          const owner = values["github_owner"]?.trim() || "";
                          const repoUrl = owner
                            ? `https://github.com/${owner}/${savedRepo}`
                            : `https://github.com/search?q=${encodeURIComponent(savedRepo)}&type=repositories`;
                          return html`
                            <div class="flex items-center gap-2 mt-1 flex-wrap">
                              <span class="text-[11px] text-emerald-400">
                                ${owner ? html`<span class="text-slate-400">${owner}/</span>` : ""}<strong>${savedRepo}</strong>
                              </span>
                              <a
                                href=${repoUrl}
                                target="_blank"
                                rel="noreferrer"
                                class="text-[11px] text-cyan-400 underline hover:text-cyan-300"
                              >View on GitHub ↗</a>
                              <button
                                onClick=${() => setRepoSetup((s) => ({ ...s, [f.provider]: "existing" }))}
                                class="text-[10px] text-slate-500 underline ml-auto"
                              >Change</button>
                            </div>
                          `;
                        }

                        // ── First-time setup prompt ─────────────────────
                        return html`
                          <div class="flex flex-col gap-2 w-full mt-1 p-3 bg-cyan-950/30 border border-cyan-500/20 rounded-lg">
                            <p class="text-[11px] text-cyan-300 font-medium">Set up your repository</p>
                            <div class="flex gap-2">
                              <button
                                onClick=${() => setRepoSetup((s) => ({ ...s, [f.provider]: "new" }))}
                                class="flex-1 px-3 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors"
                              >Create new repo</button>
                              <button
                                onClick=${() => setRepoSetup((s) => ({ ...s, [f.provider]: "existing" }))}
                                class="flex-1 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors"
                              >Link existing repo</button>
                            </div>
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
                    ${values?.aiProvider === pid ? "primary" : "secondary"} and
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
                          >${keyList.length} key(s) detected</span
                        >
                        <button
                          onClick=${() =>
                            handleTestAllKeys(pid, rawKeys, keyField)}
                          class="px-3 py-1.5 bg-[#1f2937] hover:bg-[#334155] text-xs text-white rounded"
                        >
                          Test All
                        </button>
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
                                <span class="text-[11px] text-slate-400"
                                  >${testResults[`${keyField}:${idx}`] ||
                                  ""}</span
                                >
                              </div>
                            </div>
                          `
                        )}
                      </div>

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
              </div>
            `}
    </div>
  `;
}
