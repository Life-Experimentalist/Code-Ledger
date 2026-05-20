/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GFG submission detection: hooks the submit button + keyboard shortcut,
 * then polls for the result panel after submission fires.
 */

import { createDebugger } from "../../../lib/debug.js";
const dbg = createDebugger("GFGDetector");

const SUBMIT_BTN_SEL = '[class^="ui button problems_submit_button"], .problems-submit-btn, button.ui.button[class*="submit"]';
const RESULT_SEL = '[class^="problems_content"], .problems-content, #problems-content';
const SUCCESS_TEXTS = ["problem solved successfully", "correct answer"];

const MAX_POLL_ATTEMPTS = 60; // 60 s
const POLL_INTERVAL_MS = 1000;

/**
 * Set up submit button hook. Returns a cleanup function.
 * @param {Function} onAccepted - called when "Accepted" result is detected
 * @returns {() => void} cleanup
 */
export function setupSubmitHook(onAccepted) {
    let observer = null;
    let pollTimer = null;

    const hookBtn = (btn) => {
        if (btn._clHooked) return;
        btn._clHooked = true;
        btn.addEventListener("click", () => {
            dbg.log("Submit button clicked — starting result poll");
            startResultPoll(onAccepted, () => {
                pollTimer = null;
            });
        });
        dbg.log("Submit button hooked");
    };

    const tryHook = () => {
        const btn = document.querySelector(SUBMIT_BTN_SEL);
        if (btn) hookBtn(btn);
    };

    tryHook(); // immediate attempt

    observer = new MutationObserver(tryHook);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
        observer?.disconnect();
        if (pollTimer) clearInterval(pollTimer);
    };
}

/**
 * Poll the result panel until a terminal state (accepted/failed) or timeout.
 * @param {Function} onAccepted
 * @param {Function} onDone - called regardless of outcome
 */
function startResultPoll(onAccepted, onDone) {
    let attempts = 0;
    let initialText = _getResultText(); // snapshot before judging clears it
    let sawClear = initialText === null;

    const timer = setInterval(() => {
        attempts++;
        if (attempts > MAX_POLL_ATTEMPTS) {
            clearInterval(timer);
            onDone();
            dbg.log("Result poll timed out");
            return;
        }

        const text = _getResultText();

        // Result cleared / not yet shown → wait for it to appear
        if (!text || text.length === 0) {
            sawClear = true;
            return;
        }

        const low = text.toLowerCase();

        // Still judging — treat as cleared
        if (/judging|running|compiling|submitting/i.test(low)) {
            sawClear = true;
            return;
        }

        // Haven't seen reset yet (old stale result)
        if (!sawClear) return;

        // Terminal state reached — stop polling
        clearInterval(timer);
        onDone();

        const isAccepted = SUCCESS_TEXTS.some((t) => low.includes(t));
        dbg.log(`Result: "${text.slice(0, 80)}" — accepted=${isAccepted}`);

        if (isAccepted) {
            onAccepted();
        }
    }, POLL_INTERVAL_MS);
}

function _getResultText() {
    const el = document.querySelector(RESULT_SEL);
    return el ? (el.innerText || el.textContent || "").trim() : null;
}

/**
 * Returns true if "Problem Solved Successfully" is currently visible.
 * Used by the passive MutationObserver fallback.
 */
export function isAcceptedVisible() {
    const text = _getResultText();
    if (!text) return false;
    const low = text.toLowerCase();
    return SUCCESS_TEXTS.some((t) => low.includes(t));
}
