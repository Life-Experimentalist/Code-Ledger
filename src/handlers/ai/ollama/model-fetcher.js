/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export async function fetchOllamaModels(endpoint = 'http://localhost:11434') {
  try {
    const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const { models } = await res.json();
    return (models || []).map(m => ({
      id: m.name,
      displayName: m.name,
      size: m.size,
      modifiedAt: m.modified_at,
    }));
  } catch (_) {
    return []; // Ollama not running — return empty list, not error
  }
}
