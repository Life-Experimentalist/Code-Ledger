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

const PROVIDERS = Object.values(CONSTANTS.AI_PROVIDERS);

function maskKey(k) {
  const s = String(k || "");
  if (s.length <= 8) return "*".repeat(Math.max(0, s.length - 2)) + s.slice(-2);
  return s.slice(0, 4) + "..." + s.slice(-4);
}

function parseKeys(raw) {
  return String(raw || "").split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
}

export function PanelAI({ settings, onSettingsChange }) {
  const [savedKeys, setSavedKeys] = useState({});
  const [keyDraft, setKeyDraft] = useState({});
  const [testResult, setTestResult] = useState({});
  const [testing, setTesting] = useState({});
  const [saving, setSaving] = useState({});
  const [endpointDraft, setEndpointDraft] = useState({});

  useEffect(() => {
    Storage.getAIKeys().then((all) => setSavedKeys(all || {})).catch(() => {});
    // Populate endpoint drafts from settings
    const drafts = {};
    PROVIDERS.forEach((p) => {
      const key = `${p.id}_endpoint`;
      if (settings?.[key]) drafts[p.id] = settings[key];
    });
    setEndpointDraft(drafts);
  }, []);

  const primaryProvider = settings?.aiProvider || CONSTANTS.AI_DEFAULT_PRIMARY;
  const fallbackProvider = settings?.aiSecondary || "";
  const autoReview = settings?.autoReview !== false;

  const isProviderEnabled = (id) => settings?.[`${id}_enabled`] !== false;

  const toggleProvider = (id) => onSettingsChange(`${id}_enabled`, !isProviderEnabled(id));

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
      setTestResult((r) => ({ ...r, [providerId]: `Saved ${keys.length} key(s)` }));
    } catch (e) {
      setTestResult((r) => ({ ...r, [providerId]: "Save failed: " + e.message }));
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

  const testKey = async (providerId) => {
    const raw = keyDraft[providerId] || "";
    const key = raw.trim();
    if (!key) return;
    setTesting((t) => ({ ...t, [providerId]: true }));
    try {
      const res = await testAIKey(providerId, key);
      setTestResult((r) => ({ ...r, [providerId]: res.ok ? "✓ Key valid" : "✗ " + (res.error || "Invalid") }));
    } catch (e) {
      setTestResult((r) => ({ ...r, [providerId]: "✗ " + e.message }));
    } finally {
      setTesting((t) => ({ ...t, [providerId]: false }));
    }
  };

  const saveEndpoint = (providerId) => {
    const ep = (endpointDraft[providerId] || "").trim();
    onSettingsChange(`${providerId}_endpoint`, ep || null);
    setTestResult((r) => ({ ...r, [providerId]: ep ? "Endpoint saved" : "Reset to default" }));
    setTimeout(() => setTestResult((r) => ({ ...r, [providerId]: r[providerId] === "Endpoint saved" || r[providerId] === "Reset to default" ? "" : r[providerId] })), 2000);
  };

  return html`
    <div class="space-y-6 max-w-xl">
      <div>
        <h2 class="text-base font-semibold text-white mb-1">AI Providers</h2>
        <p class="text-xs text-slate-500 mb-4">Configure AI providers for code review and chat. Providers are disabled by default until you add a key.</p>
      </div>

      <!-- Auto-review toggle -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-2">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-slate-300">Auto-review on solve</p>
            <p class="text-[11px] text-slate-500">Automatically run AI review each time a solution is committed to GitHub.</p>
          </div>
          <button
            onClick=${() => onSettingsChange("autoReview", !autoReview)}
            class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
              ${autoReview ? "bg-cyan-500/30 border-cyan-500/40" : "bg-white/5 border-white/10"}"
          >
            <span class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
              ${autoReview ? "translate-x-4" : "translate-x-0.5"}">
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
            ${PROVIDERS.map((p) => html`
              <option key=${p.id} value=${p.id}>${p.name}</option>
            `)}
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
            ${PROVIDERS.filter((p) => p.id !== primaryProvider).map((p) => html`
              <option key=${p.id} value=${p.id}>${p.name}</option>
            `)}
          </select>
          ${fallbackProvider && html`
            <${ModelSelector}
              providerId=${fallbackProvider}
              selectedModel=${settings?.aiSecondaryModel || ""}
              onSelect=${(v) => onSettingsChange("aiSecondaryModel", v)}
              endpoint=${settings?.[`${fallbackProvider}_endpoint`] || ""}
              providerEnabled=${isProviderEnabled(fallbackProvider)}
            />
          `}
        </div>
      </div>

      <!-- Per-provider configuration -->
      <div class="space-y-3">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Provider Configuration</h3>
        ${PROVIDERS.map((p) => {
          const enabled = isProviderEnabled(p.id);
          const keys = Array.isArray(savedKeys[p.id]) ? savedKeys[p.id] : [];
          const res = testResult[p.id] || "";
          const isOk = res.startsWith("✓") || res.startsWith("Saved") || res.startsWith("Endpoint") || res.startsWith("Reset");
          const customEndpoint = endpointDraft[p.id] ?? (settings?.[`${p.id}_endpoint`] || "");
          const defaultEp = CONSTANTS.AI_PROVIDERS[p.id]?.endpoint || "";

          return html`
            <div key=${p.id} class="p-4 rounded-xl border ${enabled ? "border-white/10" : "border-white/5"} bg-white/2 space-y-3 transition-all">
              <!-- Header: name + enable toggle -->
              <div class="flex items-center gap-3">
                <div class="flex-1">
                  <span class="text-sm font-medium text-slate-300">${p.name}</span>
                  ${!enabled && html`<span class="ml-2 text-[10px] text-slate-600 uppercase tracking-wide">disabled</span>`}
                </div>
                <button
                  onClick=${() => toggleProvider(p.id)}
                  class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
                    ${enabled ? "bg-cyan-500/30 border-cyan-500/40" : "bg-white/5 border-white/10"}"
                  title=${enabled ? "Disable " + p.name : "Enable " + p.name}
                >
                  <span class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
                    ${enabled ? "translate-x-4" : "translate-x-0.5"}">
                  </span>
                </button>
              </div>

              ${enabled && html`
                <!-- API keys (only for key-required providers) -->
                ${p.keyRequired && html`
                  <div class="space-y-2">
                    ${keys.length > 0 && html`
                      <div class="flex flex-wrap gap-1.5">
                        ${keys.map((k, i) => html`
                          <span key=${i} class="flex items-center gap-1 px-2 py-0.5 bg-white/5 rounded text-[11px] text-slate-400 font-mono">
                            ${maskKey(k)}
                            <button
                              onClick=${() => removeKey(p.id, i)}
                              class="text-slate-600 hover:text-rose-400 transition-colors ml-0.5"
                              title="Remove key"
                            >×</button>
                          </span>
                        `)}
                      </div>
                    `}
                    <div class="flex gap-2">
                      <input
                        type="password"
                        placeholder="Paste API key(s), comma or newline separated"
                        value=${keyDraft[p.id] || ""}
                        onInput=${(e) => setKeyDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                        class="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-300 font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                      />
                      <button
                        onClick=${() => testKey(p.id)}
                        disabled=${testing[p.id] || !keyDraft[p.id]?.trim()}
                        class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors disabled:opacity-40"
                      >${testing[p.id] ? "…" : "Test"}</button>
                      <button
                        onClick=${() => saveKeys(p.id)}
                        disabled=${saving[p.id] || !keyDraft[p.id]?.trim()}
                        class="px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors disabled:opacity-40"
                      >${saving[p.id] ? "…" : "Save"}</button>
                    </div>
                  </div>
                `}

                <!-- Endpoint override -->
                <details class="group">
                  <summary class="text-[11px] text-slate-500 cursor-pointer select-none hover:text-slate-400 transition-colors list-none flex items-center gap-1">
                    <span class="group-open:hidden">▸</span>
                    <span class="hidden group-open:inline">▾</span>
                    Advanced: custom endpoint
                  </summary>
                  <div class="mt-2 space-y-1">
                    <p class="text-[10px] text-slate-600">Default: <code class="text-slate-500">${defaultEp}</code></p>
                    <div class="flex gap-2">
                      <input
                        type="url"
                        placeholder=${defaultEp}
                        value=${customEndpoint}
                        onInput=${(e) => setEndpointDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                        class="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300 font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                      />
                      <button
                        onClick=${() => saveEndpoint(p.id)}
                        class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors"
                      >Save</button>
                      ${settings?.[`${p.id}_endpoint`] && html`
                        <button
                          onClick=${() => { setEndpointDraft((d) => ({ ...d, [p.id]: "" })); onSettingsChange(`${p.id}_endpoint`, null); }}
                          class="px-2 py-1.5 text-slate-500 hover:text-slate-300 text-xs transition-colors"
                          title="Reset to default"
                        >Reset</button>
                      `}
                    </div>
                  </div>
                </details>
              `}

              ${res && html`
                <p class="text-[11px] ${isOk ? "text-emerald-400" : "text-rose-400"}">${res}</p>
              `}
            </div>
          `;
        })}
      </div>
    </div>
  `;
}
