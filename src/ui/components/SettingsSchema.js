/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import {
  useEffect,
  useCallback,
  useState,
} from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
import { fetchAIModels, testAIKey } from "../../core/model-fetch.js";
import { Storage } from "../../core/storage.js";
import { CONSTANTS } from "../../core/constants.js";
const html = htm.bind(h);

export function SettingsSchema({ schema, values, onChange }) {
  const [models, setModels] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [testing, setTesting] = useState({});

  useEffect(() => {
    // Only auto-fetch models when the user has entered at least one API key
    const keyFields = [
      "gemini_key",
      "openai_key",
      "claude_key",
      "deepseek_key",
      "ollama_key",
    ];
    const hasKey = keyFields.some((k) => !!(values && values[k]));
    if (!hasKey) return;

    let mounted = true;
    fetchAIModels()
      .then((res) => mounted && setModels(res))
      .catch(() => mounted && setModels([]));
    return () => (mounted = false);
  }, [
    values.gemini_key,
    values.openai_key,
    values.claude_key,
    values.deepseek_key,
    values.ollama_key,
  ]);

  const providerFromField = (key) => {
    const k = (key || "").toLowerCase();
    if (k.includes("gemini")) return "gemini";
    if (k.includes("openai")) return "openai";
    if (k.includes("claude") || k.includes("anthropic")) return "claude";
    if (k.includes("ollama")) return "ollama";
    if (k.includes("deepseek")) return "deepseek";
    return null;
  };

  const handleTestKey = async (providerId, rawVal, fieldKey) => {
    if (!providerId) return;
    const first = (rawVal || "").split(",")[0]?.trim();
    if (!first) {
      setTestResults((s) => ({ ...s, [fieldKey]: "No key provided" }));
      return;
    }
    setTesting((s) => ({ ...s, [fieldKey]: true }));
    try {
      const res = await testAIKey(providerId, first);
      if (res.ok) {
        // persist keys for provider
        const existing = await Storage.getAIKeys();
        existing[providerId] = (rawVal || "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
        await Storage.setAIKeys(existing);
        setTestResults((s) => ({ ...s, [fieldKey]: "OK" }));
        // refresh models
        const ms = await fetchAIModels();
        setModels(ms);
      } else {
        setTestResults((s) => ({ ...s, [fieldKey]: res.error || "Failed" }));
      }
    } catch (e) {
      setTestResults((s) => ({ ...s, [fieldKey]: e.message }));
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
          const ms = await fetchAIModels();
          setModels(ms);
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

  return html`
    <div class="space-y-6">
      ${schema.map(
        (section) => html`
          <div
            key=${section.id}
            class="p-6 bg-[#0a0a0f] rounded-2xl border border-white/5 flex flex-col gap-4"
          >
            <h3
              class="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2"
            >
              ${section.icon ? html`<span>${section.icon}</span>` : ""}
              ${section.title || section.label}
            </h3>

            <div class="space-y-4">
              ${section.fields.map(
                (f) => html`
                  <div
                    class="flex items-center justify-between py-3 border-b border-white/5 last:border-0"
                    key=${f.key}
                  >
                    <div class="flex flex-col gap-1 w-2/3 pr-4">
                      <span class="text-sm font-medium text-slate-300"
                        >${f.label}</span
                      >
                      ${f.description
                        ? html`<span
                            class="text-[10px] text-slate-500 leading-tight"
                            >${f.description}</span
                          >`
                        : ""}
                    </div>

                    <div class="w-1/3 flex justify-end">
                      ${f.type === "toggle"
                        ? html`
                            <label
                              class="relative inline-flex items-center cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                class="sr-only peer"
                                checked=${values[f.key] ?? f.default}
                                onChange=${(e) =>
                                  onChange(f.key, e.target.checked)}
                              />
                              <div
                                class="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"
                              ></div>
                            </label>
                          `
                        : ""}
                      ${f.type === "url" ||
                      f.type === "text" ||
                      f.type === "password"
                        ? html`
                            <div class="flex items-center gap-2 w-full">
                              <input
                                type=${f.type}
                                value=${values[f.key] ?? f.default}
                                placeholder=${f.placeholder || ""}
                                class="px-3 py-1.5 bg-black border border-white/10 rounded text-sm text-white w-full"
                                onChange=${(e) =>
                                  onChange(f.key, e.target.value)}
                              />
                              ${(() => {
                                const prov = providerFromField(f.key);
                                return prov
                                  ? html`
                                      <button
                                        onClick=${() =>
                                          handleTestKey(
                                            prov,
                                            values[f.key] ?? "",
                                            f.key,
                                          )}
                                        class="px-3 py-1.5 bg-[#1f2937] hover:bg-[#334155] text-xs text-white rounded"
                                      >
                                        ${testing[f.key]
                                          ? "Testing..."
                                          : "Test"}
                                      </button>
                                    `
                                  : "";
                              })()}
                            </div>
                            ${testResults[f.key]
                              ? html`<div
                                  class="text-[11px] mt-1 text-slate-400"
                                >
                                  ${testResults[f.key]}
                                </div>`
                              : ""}
                          `
                        : ""}
                      ${f.type === "model-select"
                        ? html`
                            <div class="flex items-center gap-2 w-full">
                              <select
                                class="px-3 py-1.5 bg-black border border-white/10 rounded text-sm text-white w-full"
                                value=${values[f.key] ?? f.default}
                                onChange=${(e) =>
                                  onChange(f.key, e.target.value)}
                              >
                                ${models === null
                                  ? html`<option disabled value="">
                                      Fetching models...
                                    </option>`
                                  : ""}
                                ${models !== null && models.length === 0
                                  ? html`<option disabled value="">
                                      Enter API Key above to load
                                    </option>`
                                  : ""}
                                ${(models || []).length > 0 &&
                                !(models || []).find(
                                  (m) => m.id === values[f.key],
                                ) &&
                                values[f.key]
                                  ? html`<option value=${values[f.key]}>
                                      ${values[f.key]}
                                    </option>`
                                  : ""}
                                ${Array.from(
                                  new Set((models || []).map((m) => m.group)),
                                ).map(
                                  (group) => html`
                                    <optgroup label=${group}>
                                      ${(models || [])
                                        .filter((m) => m.group === group)
                                        .map(
                                          (m) => html`
                                            <option value=${m.id}>
                                              ${m.label}
                                            </option>
                                          `,
                                        )}
                                    </optgroup>
                                  `,
                                )}
                              </select>
                              <button
                                onClick=${async () => {
                                  setModels(null);
                                  const ms = await fetchAIModels();
                                  setModels(ms);
                                }}
                                class="px-2 py-1 text-xs bg-[#111827] rounded text-white"
                              >
                                Refresh
                              </button>
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
                                <svg
                                  role="img"
                                  viewBox="0 0 24 24"
                                  class="w-3.5 h-3.5 fill-current"
                                >
                                  <path
                                    d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                                  />
                                </svg>
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
                `,
              )}
            </div>
          </div>
        `,
      )}
    </div>
  `;
}
