/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Extension root IS src/ — paths must NOT include a 'src/' prefix.
async function loadHandler() {
  const hostname = window.location.hostname;

  try {
    if (hostname.includes("leetcode.com")) {
      const url = chrome.runtime.getURL("handlers/platforms/leetcode/index.js");
      const { LeetCodeHandler } = await import(url);
      const handler = new LeetCodeHandler();
      await handler.init();

    } else if (hostname.includes("geeksforgeeks.org")) {
      const url = chrome.runtime.getURL("handlers/platforms/geeksforgeeks/index.js");
      const { GFGHandler } = await import(url);
      const handler = new GFGHandler();
      await handler.init();

    } else if (hostname.includes("codeforces.com")) {
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
