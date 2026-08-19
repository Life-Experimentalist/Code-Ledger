/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Extension root IS src/ — paths must NOT include a 'src/' prefix.
function isHost(domain, host) {
  return host === domain || host.endsWith(`.${domain}`);
}

// This is a classic content script, so debug.js arrives via dynamic import.
// Until it does, logging is a no-op — a visitor's console must stay clean
// unless they opted into debug mode. Errors always reach the console.
let dbg = { log() {}, warn() {} };

async function initLogging() {
  try {
    const { initDebug, createDebugger } = await import(chrome.runtime.getURL("lib/debug.js"));
    await initDebug();
    dbg = createDebugger("HandlerLoader");
  } catch (e) {
    // Non-blocking: handlers still load, they just log silently.
  }
}

async function loadHandler() {
  const hostname = window.location.hostname;
  await initLogging();
  dbg.log(`loadHandler(): detected hostname=${hostname}`);

  try {
    if (isHost("leetcode.com", hostname)) {
      dbg.log(`loadHandler(): platform detected = LeetCode`);
      const url = chrome.runtime.getURL("handlers/platforms/leetcode/index.js");
      const { LeetCodeHandler } = await import(url);
      const handler = new LeetCodeHandler();
      await handler.init();
      dbg.log(`loadHandler(): ✓ LeetCodeHandler initialized`);
    } else if (isHost("geeksforgeeks.org", hostname)) {
      dbg.log(`loadHandler(): platform detected = GeeksForGeeks`);
      const gfgUrl = chrome.runtime.getURL("handlers/platforms/geeksforgeeks/index.js");
      const { GFGHandler } = await import(gfgUrl);
      const gfgHandler = new GFGHandler();
      await gfgHandler.init();
      dbg.log(`loadHandler(): ✓ GFGHandler initialized`);
    } else if (isHost("codeforces.com", hostname)) {
      dbg.log(`loadHandler(): platform detected = Codeforces`);
      const cfUrl = chrome.runtime.getURL("handlers/platforms/codeforces/index.js");
      const { CodeforcesHandler } = await import(cfUrl);
      const cfHandler = new CodeforcesHandler();
      await cfHandler.init();
      dbg.log(`loadHandler(): ✓ CodeforcesHandler initialized`);
    } else if (isHost("neetcode.io", hostname)) {
      dbg.log(`loadHandler(): platform detected = NeetCode`);
      const ncUrl = chrome.runtime.getURL("handlers/platforms/neetcode/index.js");
      const { NeetCodeHandler } = await import(ncUrl);
      const ncHandler = new NeetCodeHandler();
      await ncHandler.init();
      dbg.log(`loadHandler(): ✓ NeetCodeHandler initialized`);
    } else if (isHost("takeuforward.org", hostname)) {
      dbg.log(`loadHandler(): platform detected = takeuforward`);
      const tufUrl = chrome.runtime.getURL("handlers/platforms/takeuforward/index.js");
      const { TakeUForwardHandler } = await import(tufUrl);
      const tufHandler = new TakeUForwardHandler();
      await tufHandler.init();
      dbg.log(`loadHandler(): ✓ TakeUForwardHandler initialized`);
    } else {
      dbg.log(`loadHandler(): hostname not recognized (${hostname}) — CodeLedger not applicable`);
    }
  } catch (err) {
    // A failed handler means solves silently stop being captured — that must
    // stay visible even with debug mode off.
    console.error(
      `[CodeLedger:HandlerLoader] loadHandler(): ✗ handler initialization failed:`,
      err?.message || err,
    );
  }
}

// Code recovery mode: opened by code-recovery-handler.js with a flag in the URL
const _urlParams = new URLSearchParams(window.location.search);
if (
  _urlParams.get("codeledger_code_fetch") === "1" &&
  window.location.hostname.includes("leetcode.com")
) {
  // Prefer the query param; fall back to the hash fragment which survives LeetCode
  // server-side redirects that may strip the query string.
  const _hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const _problemId = _urlParams.get("codeledger_problemid") || _hashParams.get("cl-pid") || "";
  (async () => {
    await initLogging();
    dbg.log(`code-fetch mode detected, problemId=${_problemId}`);
    const url = chrome.runtime.getURL("handlers/platforms/leetcode/index.js");
    const { LeetCodeHandler } = await import(url);
    await new LeetCodeHandler().handleCodeFetch(_problemId);
  })().catch((e) => {
    console.error("[CodeLedger:HandlerLoader] code-fetch failed:", e?.message);
    chrome.runtime.sendMessage({
      type: "CODELEDGER_CODE_FETCHED",
      problemId: _problemId,
      error: e?.message || "Unknown error in handler-loader code-fetch path",
    });
  });
} else {
  loadHandler();
}
