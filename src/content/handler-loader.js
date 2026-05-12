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
            const url = chrome.runtime.getURL(
                "handlers/platforms/geeksforgeeks/index.js"
            );
            const { GFGHandler } = await import(url);
            const handler = new GFGHandler();
            console.log(
                `[CodeLedger:HandlerLoader] loadHandler(): initializing GFGHandler...`
            );
            await handler.init();
            console.log(
                `[CodeLedger:HandlerLoader] loadHandler(): ✓ GFGHandler initialized`
            );
        } else if (isHost("codeforces.com", hostname)) {
            console.log(
                `[CodeLedger:HandlerLoader] loadHandler(): platform detected = Codeforces`
            );
            const url = chrome.runtime.getURL(
                "handlers/platforms/codeforces/index.js"
            );
            const { CodeforcesHandler } = await import(url);
            const handler = new CodeforcesHandler();
            console.log(
                `[CodeLedger:HandlerLoader] loadHandler(): initializing CodeforcesHandler...`
            );
            await handler.init();
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

console.log(
    `[CodeLedger:HandlerLoader] script loaded, calling loadHandler()...`
);
loadHandler();
