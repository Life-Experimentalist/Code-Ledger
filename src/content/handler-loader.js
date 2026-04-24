/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// This is the entry point for content scripts.
// In MV3, ES modules loaded by content scripts dynamically must use the chrome-extension:// URL.

async function loadHandler() {
  const hostname = window.location.hostname;

  try {
    if (hostname.includes('leetcode.com')) {
      console.log('[CodeLedger] Loading LeetCode handler...');
      const url = chrome.runtime.getURL('src/handlers/platforms/leetcode/index.js');
      const { LeetCodeHandler } = await import(url);
      const handler = new LeetCodeHandler();
      handler.init();
    }
    // GeeksForGeeks and CodeForces handlers follow the same pattern
  } catch (err) {
    console.error('[CodeLedger] Failed to load platform handler:', err);
  }
}

loadHandler();
