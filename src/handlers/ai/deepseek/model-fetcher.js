/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CONSTANTS } from '../../../core/constants.js';
import { createDebugger } from '../../../lib/debug.js';
const dbg = createDebugger('DeepSeekModelFetcher');

/**
 * Fetches available models from DeepSeek API.
 * DeepSeek has a standard set of models usually, but we implement this for consistency.
 * @param {string} apiKey 
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function fetchAvailableModels(apiKey) {
  try {
    const res = await fetch(`${CONSTANTS.AI_PROVIDERS.deepseek.endpoint}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch DeepSeek models: ${res.status}`);
    }

    const data = await res.json();
    return data.data.map(model => ({
      id: model.id,
      name: model.id // DeepSeek uses the id as the display name typically
    }));
  } catch (error) {
    dbg.error('DeepSeek model fetch failed', error);
    // Fallback to defaults
    return [
      { id: CONSTANTS.AI_PROVIDERS.deepseek.defaultModel, name: 'DeepSeek Coder V2' }
    ];
  }
}
