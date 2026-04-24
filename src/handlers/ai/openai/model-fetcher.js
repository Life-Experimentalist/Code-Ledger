/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Works for OpenAI AND any OpenAI-compatible endpoint (Groq, Together, etc.)
export async function fetchOpenAIModels(apiKey, endpoint = 'https://api.openai.com/v1') {
  const res = await fetch(`${endpoint}/models`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenAI models fetch failed: ${res.status}`);
  const { data } = await res.json();
  return (data || [])
    .filter(m => m.id.includes('gpt') || m.id.includes('chat'))
    .map(m => ({ id: m.id, displayName: m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
