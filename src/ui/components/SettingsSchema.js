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
  PROMPT_PLACEHOLDERS,
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
    endpointOverride = "",
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
        values?.[`${providerId}_endpoint`] || "",
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
          if (data.provider !== provider) return;
          if (!data.token) return;
          const existing = await Storage.getAIKeys();
          existing[provider] = [data.token];
          await Storage.setAIKeys(existing);
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
    [onChange],
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
      return !["autoReview", "aiProvider", "aiSecondary", "aiModel"].includes(
        field.key,
      );
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
              ${f.advanced && !advancedMap[section.id]
                ? html`<div class="text-xs text-slate-500 italic">
                    Advanced field hidden
                  </div>`
                : html`
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
                                    f.key,
                                  )
                                : handleTestKey(
                                    prov,
                                    parseKeys(values[f.key] ?? "")[0] || "",
                                    f.key,
                                    values?.[`${prov}_endpoint`] || "",
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
                  `}
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
                          html`<option value=${opt.value}>
                            ${opt.label}
                          </option>`,
                      )
                    : ""}
                </select>
              </div>
            `
          : ""}
        ${f.type === "oauth"
          ? html`
              <div class="flex items-center gap-3">
                <button
                  onClick=${() => handleOAuth(f.provider, f.key)}
                  class="px-4 py-2 bg-[#24292e] hover:bg-[#2f363d] text-white text-xs font-medium border border-white/10 rounded-lg flex items-center gap-2 transition-colors"
                >
                  ${values[f.key] ? "Reconnect" : "Connect"}
                </button>
                ${values[f.key]
                  ? html`<span
                      title="Connected"
                      class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                    ></span>`
                  : ""}
              </div>
            `
          : ""}
      </div>
    </div>
  `;

  const renderSection = (section) => {
    const fields = (section.fields || []).filter((f) =>
      shouldRenderField(section, f),
    );
    if (!fields.length) return "";

    return html`
      <div
        id=${`settings-section-${section.id}`}
        key=${section.id}
        class="p-6 bg-[#0a0a0f] rounded-2xl border border-white/5 flex flex-col gap-4"
      >
        <h3
          class="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2"
        >
          ${section.icon ? html`<span>${section.icon}</span>` : ""}
          ${section.title || section.label}
          <button
            onClick=${() =>
              setAdvancedMap((m) => ({
                ...m,
                [section.id]: !m[section.id],
              }))}
            class="ml-3 text-xs px-2 py-0.5 bg-white/5 rounded"
          >
            ${advancedMap[section.id] ? "Hide advanced" : "Show advanced"}
          </button>
        </h3>

        <div class="space-y-4">
          ${fields.map((f) => renderStandardField(section, f))}
        </div>
      </div>
    `;
  };

  const renderAIRouting = () => {
    const primaryProvider = values.aiProvider || "";
    const secondaryProvider = values.aiSecondary || "";
    const selectableProviders = Object.keys(
      CONSTANTS.AI_PROVIDERS || {},
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
                      </option>`,
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
                        primaryProvider,
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
                      </option>`,
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
                        secondaryProvider,
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
                            e.target.value,
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
                                      endpoint,
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
                          `,
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
                              </option>`,
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

  const renderPromptsTab = () => html`
    <div
      class="p-6 bg-[#0a0a0f] rounded-2xl border border-amber-500/30 flex flex-col gap-4"
    >
      <h3 class="text-sm font-bold text-white uppercase tracking-widest">
        AI Prompts
      </h3>
      <div
        class="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded p-3"
      >
        Warning: changing prompts can reduce review quality or expose sensitive
        context.
      </div>
      <div class="text-[11px] text-slate-400">
        Placeholders: ${PROMPT_PLACEHOLDERS.join(", ")}
      </div>
      <label class="text-xs uppercase tracking-wider text-slate-400"
        >Review Prompt Template</label
      >
      <textarea
        value=${promptDraft.review || ""}
        onInput=${(e) =>
          setPromptDraft((s) => ({ ...s, review: e.target.value }))}
        class="w-full min-h-[140px] px-3 py-2 bg-black border border-white/10 rounded text-sm text-white"
      ></textarea>
      <div class="flex items-center gap-2">
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
          Reset to default
        </button>
      </div>
      ${promptStatus
        ? html`<div class="text-[11px] text-slate-400">${promptStatus}</div>`
        : ""}
    </div>
  `;

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
          `,
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
