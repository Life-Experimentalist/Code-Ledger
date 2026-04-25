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
}) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    if (!providerId) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const ms = await fetchModelsForProvider(providerId);
        if (!mounted) return;
        setModels(ms || []);
      } catch (e) {
        if (!mounted) return;
        setError(e.message || "Failed to load models");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => (mounted = false);
  }, [providerId, apiKey, endpoint]);

  if (loading)
    return html`<span class="p-2 text-gray-500 italic"
      >Loading models...</span
    >`;
  if (error) return html`<span class="p-2 text-red-500">⚠ ${error}</span>`;
  if (!models || !models.length)
    return html`<span class="p-2 text-gray-400">No models found</span>`;
  return html`
    <select
      class="w-full p-2 border rounded bg-white dark:bg-gray-800 dark:border-gray-600 text-sm"
      value=${selectedModel}
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
  `;
}
