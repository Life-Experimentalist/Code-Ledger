/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from '../../../lib/debug.js';
const dbg = createDebugger('GeminiModelFetcher');

let _cache = null;

export async function fetchGeminiModels(apiKey) {
  if (_cache) return _cache;
  dbg.log('Fetching Gemini models from API');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    { headers: { 'Content-Type': 'application/json' } }
  );
  if (!res.ok) throw new Error(`Gemini models fetch failed: ${res.status}`);

  const { models } = await res.json();

  const textModels = (models || [])
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => ({
      id: m.name.replace('models/', ''),
      displayName: m.displayName,
      description: m.description,
      inputTokenLimit: m.inputTokenLimit,
      outputTokenLimit: m.outputTokenLimit,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  dbg.log(`Found ${textModels.length} Gemini models`);
  _cache = textModels;
  return textModels;
}

export function clearModelCache() { _cache = null; }
