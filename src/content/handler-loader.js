/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Extension root IS src/ — paths must NOT include a 'src/' prefix.
function isHost(domain, host) {
  return host === domain || host.endsWith(`.${domain}`);
}

async function loadHandler() {
  const hostname = window.location.hostname;

  try {
    // Read debug state from storage so createDebugger() calls work in this context.
    const debugUrl = chrome.runtime.getURL("lib/debug.js");
    const { initDebug } = await import(debugUrl);
    await initDebug();
  } catch (_) {}

  try {
    if (isHost("leetcode.com", hostname)) {
      const url = chrome.runtime.getURL("handlers/platforms/leetcode/index.js");
      const { LeetCodeHandler } = await import(url);
      const handler = new LeetCodeHandler();
      await handler.init();

    } else if (isHost("geeksforgeeks.org", hostname)) {
      const url = chrome.runtime.getURL("handlers/platforms/geeksforgeeks/index.js");
      const { GFGHandler } = await import(url);
      const handler = new GFGHandler();
      await handler.init();

    } else if (isHost("codeforces.com", hostname)) {
      const url = chrome.runtime.getURL("handlers/platforms/codeforces/index.js");
      const { CodeforcesHandler } = await import(url);
      const handler = new CodeforcesHandler();
      await handler.init();
    }
  } catch (err) {
    console.error("[CodeLedger] Failed to load platform handler:", err);
  }
}

loadHandler();
