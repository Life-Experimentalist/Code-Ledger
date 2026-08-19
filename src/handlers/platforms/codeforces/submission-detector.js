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
 *
 * Why the metadata travels with it:
 *   The verdict is read on /my, where the problem statement is not on the page:
 *   no title, no tags, no rating, no text. Extracting metadata at that point
 *   yields a solve named after its own slug with an empty README. The title,
 *   tags and statement are all on screen at submit time, so they are captured
 *   alongside the code and carried across the navigation.
 */

import { createDebugger } from "../../../lib/debug.js";
import { cfSlugFromHref, isPendingFresh, isRowOwn } from "./verdict-match.js";

const dbg = createDebugger("CFSubmissionDetector");

const KEYS = {
  SLUG: "cl_cf_pending_slug",
  CODE: "cl_cf_pending_code",
  LANG: "cl_cf_pending_lang",
  TS: "cl_cf_pending_ts",
  CONTEST_ID: "cl_cf_pending_contestid",
  LETTER: "cl_cf_pending_letter",
  META: "cl_cf_pending_meta",
};

/**
 * Ceiling on the captured statement, in characters.
 *
 * sessionStorage is a few megabytes per origin and a Codeforces statement is
 * rarely past 30 KB, but an interactive problem with a long sample section can
 * run much larger, and a quota error at submit time would lose the code as well
 * as the metadata. The README truncates to 5000 characters anyway.
 */
const MAX_STATEMENT_CHARS = 60000;

const SUBMIT_SELECTORS = [
  "#singlePageSubmitButton",
  '.submit-form button[type="submit"]',
  'form.submit-form input[type="submit"]',
  ".submitButton",
];

/**
 * Hook the submit button so we capture code + language at click time.
 *
 * @param {object} page the detected page, from `detectPage()`
 * @param {() => object} [readMeta] returns the problem metadata visible on the
 *   page. Called at submit time, because /my cannot answer for it. Kept as a
 *   callback so the DOM extraction stays in the handler.
 * @returns {() => void} cleanup that removes the listener / observer
 */
export function hookSubmitButton(page, readMeta) {
  if (page.type !== "problem") return () => {};

  const savePending = () => {
    const code = document.querySelector("#editor")?.value || "";
    const langSel = document.querySelector('#programTypeForTesting, select[name="programTypeId"]');
    const opt = langSel?.options?.[langSel.selectedIndex];
    // No guessed default — an empty string resolves to .txt downstream.
    const lang = (opt?.textContent || opt?.value || "").trim();

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

    // The statement is only readable here. Losing it costs metadata, not the
    // solve, so a failure to capture it must not stop the code being saved.
    try {
      const meta = readMeta?.();
      if (meta) {
        const trimmed = {
          ...meta,
          description:
            typeof meta.description === "string"
              ? meta.description.slice(0, MAX_STATEMENT_CHARS)
              : null,
        };
        sessionStorage.setItem(KEYS.META, JSON.stringify(trimmed));
      }
    } catch (err) {
      dbg.warn("Could not capture problem metadata at submit", err);
    }
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
 * Read the problem a submission row is about.
 *
 * Every row on a Codeforces status table links to its problem; the inline box
 * on a problem page does not, because there is only one problem it could mean.
 *
 * @returns {string} the slug, or "" when the row does not say
 */
function readRowSlug(row) {
  for (const a of row?.querySelectorAll?.("a[href]") || []) {
    const slug = cfSlugFromHref(a.getAttribute("href"));
    if (slug) return slug;
  }
  return "";
}

/**
 * Read the handle a submission row belongs to.
 *
 * Status tables link each row's party cell to `/profile/{handle}`; the inline
 * box on a problem page shows only the user's own submissions and has no such
 * link, which is why "" is a valid answer.
 */
function readRowOwner(row) {
  for (const a of row?.querySelectorAll?.("a[href]") || []) {
    const m = /\/profile\/([^/?#]+)/.exec(a.getAttribute("href") || "");
    if (m) return decodeURIComponent(m[1]);
  }
  return "";
}

/** The signed-in user's handle, from the profile link in the page header. */
function readOwnHandle() {
  const a = document.querySelector('#header a[href*="/profile/"]');
  const m = /\/profile\/([^/?#]+)/.exec(a?.getAttribute("href") || "");
  return m ? decodeURIComponent(m[1]) : "";
}

/**
 * Read runtime and memory off a submission row.
 *
 * By class, never by column index: the columns differ between the problem
 * page's inline box and /contest/{id}/my, and the fixed indices this used to
 * read reported the language and the verdict as the runtime and the memory on
 * the second of those. A missing cell is reported as nothing, because a wrong
 * number is worse than an absent one.
 */
function readRowStats(row) {
  const cell = (sel) => (row?.querySelector?.(sel)?.textContent || "").trim() || null;
  return {
    runtime: cell(".time-consumed-cell"),
    memory: cell(".memory-consumed-cell"),
  };
}

/**
 * Watch for span[submissionverdict="OK"] appearing anywhere in the DOM.
 *
 * Calls `onAccepted({ submissionId, contestId, rowSlug, stats })` once per
 * accepted row. Deciding whether a row is *ours* is the caller's job — see
 * `matchAcceptedRow` — because it needs the pending capture to decide.
 *
 * @returns {MutationObserver} call .disconnect() to stop
 */
export function watchForVerdict(onAccepted) {
  const processedIds = new Set();

  const check = () => {
    const okSpans = document.querySelectorAll('span[submissionverdict="OK"]');
    for (const span of okSpans) {
      const row = span.closest("tr[data-submission-id]");
      const submissionId = row?.getAttribute("data-submission-id");
      if (!submissionId || processedIds.has(submissionId)) continue;

      // Contest-wide /status tables list everyone's submissions — a row that
      // provably belongs to another handle is never ours, whatever problem it
      // names. See isRowOwn for why unknowns pass.
      const rowOwner = readRowOwner(row);
      if (!isRowOwn(rowOwner, readOwnHandle())) {
        processedIds.add(submissionId);
        dbg.log("Accepted row belongs to another user, ignoring", { submissionId, rowOwner });
        continue;
      }

      const contestIdMatch = window.location.pathname.match(/\/contest\/(\d+)\//);
      const contestId = contestIdMatch?.[1] || null;
      const rowSlug = readRowSlug(row);

      dbg.log("Accepted verdict detected", { submissionId, contestId, rowSlug });
      processedIds.add(submissionId);
      onAccepted({ submissionId, contestId, rowSlug, stats: readRowStats(row) });
    }
  };

  // Check immediately — page may already have results (e.g. /my loaded with OK)
  setTimeout(check, 600);

  const obs = new MutationObserver(check);
  obs.observe(document.body, { childList: true, subtree: true });
  return obs;
}

/**
 * The submission captured at the last submit click, if it is still current.
 *
 * A capture older than the TTL is dropped rather than returned: sessionStorage
 * outlives the solve by the whole tab session, and an expired capture would
 * attach this morning's code to this afternoon's accepted row.
 *
 * @returns {object|null}
 */
export function readPendingSubmission() {
  const slug = sessionStorage.getItem(KEYS.SLUG);
  const code = sessionStorage.getItem(KEYS.CODE);
  const lang = sessionStorage.getItem(KEYS.LANG);
  const ts = sessionStorage.getItem(KEYS.TS);
  const contestId = sessionStorage.getItem(KEYS.CONTEST_ID);
  const letter = sessionStorage.getItem(KEYS.LETTER);
  if (!slug && !code) return null;

  if (!isPendingFresh(ts ? +ts : null)) {
    dbg.log("Discarding a stale pending submission", { slug, ts });
    clearPendingSubmission();
    return null;
  }

  let meta = null;
  try {
    const raw = sessionStorage.getItem(KEYS.META);
    if (raw) meta = JSON.parse(raw);
  } catch (_) {
    // Unreadable metadata costs the title and the statement, not the solve.
  }

  return { slug, code, lang, ts: +ts, contestId, letter, meta };
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
