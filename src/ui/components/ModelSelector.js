/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from '../../vendor/preact-bundle.js';
import { useState, useEffect } from '../../vendor/preact-bundle.js';
import { htm } from '../../vendor/preact-bundle.js';
const html = htm.bind(h);

export function ModelSelector({ providerId, apiKey, selectedModel, onSelect, endpoint }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!providerId) return;
    if (providerId !== 'ollama' && !apiKey) {
      setModels([]);
      return;
    }

    setLoading(true);
    setError(null);

    loadModels(providerId, apiKey, endpoint)
      .then(setModels)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [providerId, apiKey, endpoint]);

  if (loading) return html`<span class="p-2 text-gray-500 italic">Loading models...</span>`;
  if (error)   return html`<span class="p-2 text-red-500">⚠ ${error}</span>`;
  if (!models.length) return html`<span class="p-2 text-gray-400">No models found</span>`;

  return html`
    <select
      class="w-full p-2 border rounded bg-white dark:bg-gray-800 dark:border-gray-600 text-sm"
      value=${selectedModel}
      onChange=${e => onSelect(e.target.value)}
    >
      ${models.map(m => html`
        <option key=${m.id} value=${m.id}>
          ${m.displayName || m.id}
        </option>
      `)}
    </select>
  `;
}

async function loadModels(providerId, apiKey, endpoint) {
  switch (providerId) {
    case 'gemini': {
      const { fetchGeminiModels } = await import('../../handlers/ai/gemini/model-fetcher.js');
      return fetchGeminiModels(apiKey);
    }
    // ... other providers would follow similar pattern
    default: return [{ id: 'default', displayName: 'Default Model' }];
  }
}
