/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Codeforces submission detection.
 *
 * Architecture:
 *   1. hookSubmitButton() intercepts the submit click and saves code + metadata
 *      to sessionStorage BEFORE the page navigates away.
 *   2. watchForVerdict() sets up a MutationObserver watching for
 *      span[submissionverdict="OK"] — this fires whether the user is on the
 *      problem page (inline submissions table) or the /my page (full reload).
 *   3. readPendingSubmission() / clearPendingSubmission() manage sessionStorage.
 *
 * Why sessionStorage?
 *   CF does full page reloads between problem and /my pages. sessionStorage
 *   persists across same-origin navigations in the same tab, so code captured
 *   on the problem page survives to the /my page content-script instance.
 */

import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("CFSubmissionDetector");

const KEYS = {
  SLUG: "cl_cf_pending_slug",
  CODE: "cl_cf_pending_code",
  LANG: "cl_cf_pending_lang",
  TS: "cl_cf_pending_ts",
  CONTEST_ID: "cl_cf_pending_contestid",
  LETTER: "cl_cf_pending_letter",
};

const SUBMIT_SELECTORS = [
  "#singlePageSubmitButton",
  '.submit-form button[type="submit"]',
  'form.submit-form input[type="submit"]',
  ".submitButton",
];

/**
 * Hook the submit button so we capture code + language at click time.
 * Returns a cleanup function that removes the listener / observer.
 */
export function hookSubmitButton(page) {
  if (page.type !== "problem") return () => {};

  const savePending = () => {
    const code = document.querySelector("#editor")?.value || "";
    const langSel = document.querySelector('#programTypeForTesting, select[name="programTypeId"]');
    const opt = langSel?.options?.[langSel.selectedIndex];
    const lang = (opt?.textContent || opt?.value || "").trim() || "C++";

    dbg.log("Submit fired — saving pending code", {
      slug: page.slug,
      lang,
      codeLen: code.length,
    });
    sessionStorage.setItem(KEYS.SLUG, page.slug || "");
    sessionStorage.setItem(KEYS.CODE, code);
    sessionStorage.setItem(KEYS.LANG, lang);
    sessionStorage.setItem(KEYS.TS, String(Date.now()));
    sessionStorage.setItem(KEYS.CONTEST_ID, page.contestId || "");
    sessionStorage.setItem(KEYS.LETTER, page.letter || "");
  };

  const tryHook = () => {
    for (const sel of SUBMIT_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn && !btn._clHooked) {
        btn.addEventListener("click", savePending, true);
        btn._clHooked = true;
        dbg.log("Submit button hooked via", sel);
        return btn;
      }
    }
    return null;
  };

  // Immediate attempt
  const btn = tryHook();
  if (btn) {
    return () => btn.removeEventListener("click", savePending, true);
  }

  // Button not yet in DOM — wait for it
  const obs = new MutationObserver(() => {
    const found = tryHook();
    if (found) obs.disconnect();
  });
  obs.observe(document.body, { childList: true, subtree: true });
  return () => obs.disconnect();
}

/**
 * Watch for span[submissionverdict="OK"] appearing anywhere in the DOM.
 * Calls onAccepted(submissionId, contestId) for each new accepted verdict found.
 * Returns the MutationObserver (call .disconnect() to stop).
 */
export function watchForVerdict(onAccepted) {
  const processedIds = new Set();

  const check = () => {
    const okSpans = document.querySelectorAll('span[submissionverdict="OK"]');
    for (const span of okSpans) {
      const row = span.closest("tr[data-submission-id]");
      const submissionId = row?.getAttribute("data-submission-id");
      if (!submissionId || processedIds.has(submissionId)) continue;

      const contestIdMatch = window.location.pathname.match(/\/contest\/(\d+)\//);
      const contestId = contestIdMatch?.[1] || null;

      dbg.log("Accepted verdict detected", { submissionId, contestId });
      processedIds.add(submissionId);
      onAccepted(submissionId, contestId);
    }
  };

  // Check immediately — page may already have results (e.g. /my loaded with OK)
  setTimeout(check, 600);

  const obs = new MutationObserver(check);
  obs.observe(document.body, { childList: true, subtree: true });
  return obs;
}

export function readPendingSubmission() {
  const slug = sessionStorage.getItem(KEYS.SLUG);
  const code = sessionStorage.getItem(KEYS.CODE);
  const lang = sessionStorage.getItem(KEYS.LANG);
  const ts = sessionStorage.getItem(KEYS.TS);
  const contestId = sessionStorage.getItem(KEYS.CONTEST_ID);
  const letter = sessionStorage.getItem(KEYS.LETTER);
  if (!slug && !code) return null;
  return { slug, code, lang, ts: ts ? +ts : Date.now(), contestId, letter };
}

export function clearPendingSubmission() {
  Object.values(KEYS).forEach((k) => sessionStorage.removeItem(k));
}

/**
 * Read the current test/verdict output visible on the page.
 * Used by the AI panel readTestFailures hook.
 */
export function readCurrentTestOutput() {
  try {
    const lines = [];

    // Non-accepted verdict cells in submission table
    document.querySelectorAll(".status-verdict-cell span[submissionverdict]").forEach((el) => {
      const verdict = el.getAttribute("submissionverdict") || "";
      if (verdict === "OK") return;
      const t = (el.textContent || "").trim();
      if (t) lines.push(`Verdict: ${t}`);
    });

    // Error / wrong answer test output blocks
    document
      .querySelectorAll(
        ".wrong-answer pre, .runtime-error pre, .test-output pre, " +
          ".roundbox pre, .error pre, .checker-message",
      )
      .forEach((el) => {
        const t = (el.textContent || "").trim();
        if (t && t.length > 4 && !lines.includes(t)) lines.push(t);
      });

    return lines.slice(0, 6).join("\n\n");
  } catch (_) {
    return "";
  }
}
