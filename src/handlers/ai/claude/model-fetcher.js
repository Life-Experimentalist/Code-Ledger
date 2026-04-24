/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export async function fetchClaudeModels(apiKey, endpoint = 'https://api.anthropic.com/v1') {
  // Anthropic API expects strict headers and cross-origin resource sharing from extensions requires bg-script proxy or exact headers.
  const res = await fetch(`${endpoint}/models`, {
    headers: { 
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
  });
  if (!res.ok) throw new Error(`Claude models fetch failed: ${res.status}`);
  const { data } = await res.json();
  return (data || [])
    .filter(m => m.id.includes('claude'))
    .map(m => ({ id: m.id, displayName: m.display_name || m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
