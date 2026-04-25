/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import { useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { fetchModelsForProvider } from "../../core/model-fetch.js";

export function ModelSelector({
  providerId,
  apiKey,
  selectedModel,
  onSelect,
  endpoint,
  providerEnabled = true,
  onToggleEnabled = () => {},
}) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [paused, setPaused] = useState(false);
  const [manualTrigger, setManualTrigger] = useState(0);

  // Clear paused when endpoint changes so we attempt again.
  useEffect(() => setPaused(false), [endpoint]);

  useEffect(() => {
    let mounted = true;
    if (!providerId) return;
    if (!providerEnabled) {
      setModels([]);
      setLoading(false);
      setError(null);
      return;
    }

    // For Ollama, if paused we wait until the user triggers a retry.
    if (providerId === "ollama" && paused && manualTrigger === 0) return;

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const ms = await fetchModelsForProvider(providerId, endpoint, {
          throwOnError: providerId === "ollama",
        });
        if (!mounted) return;
        setModels(ms || []);
        setError(null);
      } catch (e) {
        if (!mounted) return;
        const msg = e && e.message ? e.message : "Failed to load models";
        setError(msg);
        if (providerId === "ollama") setPaused(true);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => (mounted = false);
  }, [providerId, apiKey, endpoint, providerEnabled, manualTrigger]);

  if (!providerEnabled)
    return html`<div class="p-2 text-sm text-slate-400">
      Provider disabled
      <button
        class="ml-3 px-2 py-1 bg-cyan-600 text-white rounded text-xs"
        onClick=${() => onToggleEnabled(true)}
      >
        Enable
      </button>
    </div>`;

  if (loading)
    return html`<span class="p-2 text-gray-500 italic"
      >Loading models...</span
    >`;

  if (error && providerId === "ollama" && paused)
    return html`<div class="p-2 text-sm text-red-400">
      Endpoint appears unreachable: ${error}
      <div class="mt-2 flex gap-2">
        <button
          class="px-2 py-1 bg-cyan-600 text-white rounded text-xs"
          onClick=${() => {
            setPaused(false);
            setManualTrigger((n) => n + 1);
          }}
        >
          Connect / Retry
        </button>
        <button
          class="px-2 py-1 bg-gray-700 text-white rounded text-xs"
          onClick=${() => onToggleEnabled(false)}
        >
          Disable provider
        </button>
      </div>
    </div>`;

  if (error) return html`<span class="p-2 text-red-500">⚠ ${error}</span>`;

  if (!models || !models.length)
    return html`<div class="p-2 text-sm text-slate-400">
      No models found
      <button
        class="ml-3 px-2 py-1 bg-gray-700 text-white rounded text-xs"
        onClick=${() => setManualTrigger((n) => n + 1)}
      >
        Refresh
      </button>
    </div>`;

  return html`
    <div class="flex items-center gap-2 w-full">
      <select
        class="w-full p-2 border rounded bg-white dark:bg-gray-800 dark:border-gray-600 text-sm"
        value=${selectedModel || ""}
        onChange=${(e) => onSelect(e.target.value)}
      >
        ${selectedModel && !(models || []).find((mm) => mm.id === selectedModel)
          ? html`<option value=${selectedModel}>${selectedModel}</option>`
          : ""}
        ${models.map(
          (m) => html`
            <option key=${m.id} value=${m.id}>
              ${m.label || m.displayName || m.id}
            </option>
          `,
        )}
      </select>
      <button
        class="px-2 py-1 text-xs bg-[#111827] rounded text-white"
        onClick=${() => setManualTrigger((n) => n + 1)}
      >
        Refresh
      </button>
    </div>
  `;
}
