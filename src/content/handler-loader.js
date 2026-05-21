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
    console.log(
        `[CodeLedger:HandlerLoader] loadHandler(): detected hostname=${hostname}`
    );

    try {
        // Read debug state from storage so createDebugger() calls work in this context.
        console.log(
            `[CodeLedger:HandlerLoader] loadHandler(): initializing debug module...`
        );
        const debugUrl = chrome.runtime.getURL("lib/debug.js");
        const { initDebug } = await import(debugUrl);
        await initDebug();
        console.log(
            `[CodeLedger:HandlerLoader] loadHandler(): ✓ debug initialized`
        );
    } catch (e) {
        console.warn(
            `[CodeLedger:HandlerLoader] loadHandler(): debug init failed (non-blocking):`,
            e?.message
        );
    }

    try {
        if (isHost("leetcode.com", hostname)) {
            console.log(
                `[CodeLedger:HandlerLoader] loadHandler(): platform detected = LeetCode`
            );
            const url = chrome.runtime.getURL(
                "handlers/platforms/leetcode/index.js"
            );
            const { LeetCodeHandler } = await import(url);
            const handler = new LeetCodeHandler();
            console.log(
                `[CodeLedger:HandlerLoader] loadHandler(): initializing LeetCodeHandler...`
            );
            await handler.init();
            console.log(
                `[CodeLedger:HandlerLoader] loadHandler(): ✓ LeetCodeHandler initialized`
            );
        } else if (isHost("geeksforgeeks.org", hostname)) {
            console.log(
                `[CodeLedger:HandlerLoader] loadHandler(): platform detected = GeeksForGeeks`
            );
            const gfgUrl = chrome.runtime.getURL(
                "handlers/platforms/geeksforgeeks/index.js"
            );
            const { GFGHandler } = await import(gfgUrl);
            const gfgHandler = new GFGHandler();
            console.log(
                `[CodeLedger:HandlerLoader] loadHandler(): initializing GFGHandler...`
            );
            await gfgHandler.init();
            console.log(
                `[CodeLedger:HandlerLoader] loadHandler(): ✓ GFGHandler initialized`
            );
        } else if (isHost("codeforces.com", hostname)) {
            console.log(
                `[CodeLedger:HandlerLoader] loadHandler(): platform detected = Codeforces`
            );
            const cfUrl = chrome.runtime.getURL(
                "handlers/platforms/codeforces/index.js"
            );
            const { CodeforcesHandler } = await import(cfUrl);
            const cfHandler = new CodeforcesHandler();
            console.log(
                `[CodeLedger:HandlerLoader] loadHandler(): initializing CodeforcesHandler...`
            );
            await cfHandler.init();
            console.log(
                `[CodeLedger:HandlerLoader] loadHandler(): ✓ CodeforcesHandler initialized`
            );
        } else {
            console.log(
                `[CodeLedger:HandlerLoader] loadHandler(): hostname not recognized (${hostname}) — CodeLedger not applicable`
            );
        }
    } catch (err) {
        console.error(
            `[CodeLedger:HandlerLoader] loadHandler(): ✗ handler initialization failed:`,
            err?.message || err
        );
    }
}

console.log(`[CodeLedger:HandlerLoader] script loaded`);

// Code recovery mode: opened by code-recovery-handler.js with a flag in the URL
const _urlParams = new URLSearchParams(window.location.search);
if (_urlParams.get("codeledger_code_fetch") === "1" && window.location.hostname.includes("leetcode.com")) {
    // Prefer the query param; fall back to the hash fragment which survives LeetCode
    // server-side redirects that may strip the query string.
    const _hashParams = new URLSearchParams(
        window.location.hash.replace(/^#/, "")
    );
    const _problemId =
        _urlParams.get("codeledger_problemid") ||
        _hashParams.get("cl-pid") ||
        "";
    console.log(`[CodeLedger:HandlerLoader] code-fetch mode detected, problemId=${_problemId}`);
    (async () => {
        try {
            const { initDebug } = await import(chrome.runtime.getURL("lib/debug.js"));
            await initDebug();
        } catch (_) {}
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
    console.log(`[CodeLedger:HandlerLoader] calling loadHandler()...`);
    loadHandler();
}
