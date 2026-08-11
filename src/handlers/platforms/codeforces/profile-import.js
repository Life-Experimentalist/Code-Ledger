/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Codeforces bulk profile import — reads every accepted submission from the
 * public `user.status` API and saves the problems behind them to IndexedDB.
 *
 * The records carry no source code: Codeforces publishes the submission list but
 * not the submission text, and the problem page cannot be made to give up code
 * you wrote years ago. So an imported problem is a dated, tagged, rated entry in
 * the library with an empty solution — which is what the analytics, the streak
 * and the heatmap need — and nothing is queued for a code fetch that could never
 * succeed.
 */

import { createDebugger } from "../../../lib/debug.js";
import { resolvePrimaryTopic } from "../../../core/topic-resolver.js";
import { runtime } from "../../../lib/browser-compat.js";
import {
  buildUserStatusUrl,
  extractSolves,
  mergeSolves,
  CF_MIN_GAP_MS,
  CF_PAGE_SIZE,
} from "./api.js";

const dbg = createDebugger("CFProfileImport");

const BTN_ID = "cl-cf-profile-import";
const PROGRESS_ID = "cl-cf-import-progress";
const WRAPPER_ID = "cl-cf-profile-import-wrapper";

/** 20 pages of 1000 covers every handle on the site with room to spare. */
const MAX_PAGES = 20;
const BATCH_SIZE = 15;
const BATCH_DELAY_MS = 350;

let _lastFetchAt = 0;

/**
 * Fetch one page of `user.status`, never faster than Codeforces allows.
 * @param {string} url
 * @returns {Promise<any|null>} the parsed body, or null if it was unreadable
 */
async function throttledJson(url) {
  const gap = Date.now() - _lastFetchAt;
  if (gap < CF_MIN_GAP_MS) await new Promise((r) => setTimeout(r, CF_MIN_GAP_MS - gap));
  _lastFetchAt = Date.now();

  // The API is public, so no cookies are sent — an import reads nothing the
  // handle's own profile page does not already show to everyone.
  const res = await fetch(url, { credentials: "omit" });
  // A rejected call still answers with a JSON body carrying the reason, so the
  // status code is not worth branching on before reading it.
  return res.json().catch(() => null);
}

/** The handle of whoever is signed in, read from the header. */
function loggedInHandle() {
  const href = document.querySelector('.lang-chooser a[href^="/profile/"]')?.getAttribute("href");
  const m = /^\/profile\/([^/?#]+)/.exec(href || "");
  return m ? m[1] : "";
}

/**
 * Inject the "Import All Solves" button on a Codeforces profile page.
 *
 * Only on your own profile: the API would answer for any handle, and importing
 * someone else's solves into your ledger is not an import, it is a fabrication.
 *
 * @param {(slug: string) => string} makeProblemId bound from the handler
 * @param {string} pageHandle the handle in the URL
 */
export function injectProfileImportBtn(makeProblemId, pageHandle) {
  if (document.getElementById(BTN_ID)) return;

  const handle = String(pageHandle || "").trim();
  const me = loggedInHandle();
  if (!handle || !me || me.toLowerCase() !== handle.toLowerCase()) {
    dbg.log("not the signed-in user's own profile — no import button");
    return;
  }

  const btn = _createImportButton();
  const prog = document.createElement("div");
  prog.id = PROGRESS_ID;
  prog.style.cssText =
    "font-size:12px;color:#94a3b8;display:none;max-width:340px;margin-top:6px;line-height:1.4;";

  const wrapper = document.createElement("div");
  wrapper.id = WRAPPER_ID;

  const anchor = document.querySelector(".userbox");
  if (anchor) {
    wrapper.style.cssText = "margin:10px 0;display:flex;flex-direction:column;align-items:center;";
    wrapper.appendChild(btn);
    wrapper.appendChild(prog);
    anchor.appendChild(wrapper);
  } else {
    wrapper.style.cssText =
      "position:fixed;bottom:80px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:6px;align-items:flex-end;";
    btn.style.boxShadow = "0 4px 24px rgba(6,182,212,0.12)";
    prog.style.textAlign = "right";
    wrapper.appendChild(prog);
    wrapper.appendChild(btn);
    document.body.appendChild(wrapper);
  }

  btn.addEventListener("click", () => runProfileImport(makeProblemId, btn, handle));
}

function _createImportButton() {
  const btn = document.createElement("button");
  btn.id = BTN_ID;
  btn.style.cssText =
    "display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;" +
    "font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;" +
    "border:1px solid rgba(6,182,212,0.4);color:#0e7490;" +
    "background:rgba(6,182,212,0.08);transition:background 0.2s;";
  btn.onmouseenter = () => {
    btn.style.background = "rgba(6,182,212,0.18)";
  };
  btn.onmouseleave = () => {
    btn.style.background = "rgba(6,182,212,0.08)";
  };
  btn.innerHTML =
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">` +
    `<path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm1 14H11v-4H8l4-4 4 4h-3v4z"/>` +
    `</svg> Import All Solves to CodeLedger`;
  return btn;
}

/**
 * Page through the submission history and collect the first accepted submission
 * of every problem.
 *
 * @param {string} handle
 * @param {(msg: string) => void} show
 * @returns {Promise<{ solves: Array<object>, error: string|null }>}
 */
async function collectSolves(handle, show) {
  const bySlug = new Map();
  let from = 1;

  for (let page = 0; page < MAX_PAGES; page++) {
    const payload = await throttledJson(buildUserStatusUrl(handle, from, CF_PAGE_SIZE));
    const { ok, error, solves, seen } = extractSolves(payload);
    if (!ok) return { solves: [], error };

    mergeSolves(bySlug, solves);
    show(
      `Read ${from + seen - 1} submission(s) — ${bySlug.size} distinct problem(s) solved so far…`,
    );

    if (seen < CF_PAGE_SIZE) return { solves: [...bySlug.values()], error: null };
    from += seen;
  }

  // Hit the ceiling rather than reached the end. Say so — a silent cap reads as
  // "that was everything".
  dbg.warn(`collectSolves(): stopped at the ${MAX_PAGES}-page ceiling for ${handle}`);
  show(
    `Read the most recent ${MAX_PAGES * CF_PAGE_SIZE} submissions — anything older was not imported.`,
  );
  return { solves: [...bySlug.values()], error: null };
}

async function runProfileImport(makeProblemId, btn, handle) {
  btn.disabled = true;
  const progressEl = document.getElementById(PROGRESS_ID);
  const show = (msg) => {
    dbg.log("[import]", msg);
    if (progressEl) {
      progressEl.textContent = msg;
      progressEl.style.display = "block";
    }
  };

  try {
    show("Reading your submission history from Codeforces…");
    const { solves, error } = await collectSolves(handle, show);

    if (error) {
      show(`Codeforces would not answer: ${error}`);
      btn.disabled = false;
      btn.textContent = "↺ Retry Import";
      return;
    }
    if (solves.length === 0) {
      show("No accepted submissions found for this handle.");
      btn.disabled = false;
      return;
    }

    const bulkProblems = solves.map((s) => ({
      id: makeProblemId(s.slug),
      platform: "codeforces",
      title: s.title,
      titleSlug: s.slug,
      difficulty: s.difficulty,
      lang: s.lang,
      tags: s.tags,
      topic: resolvePrimaryTopic(s.tags),
      // Empty, and staying empty: Codeforces does not publish submission source,
      // so there is no point queueing a code fetch that has nothing to fetch.
      code: "",
      files: [],
      timestamp: s.timestamp,
      importedAt: Date.now(),
      runtime: s.runtime,
      memory: s.memory,
      problemStatement: null,
      _importedFromProfile: true,
    }));

    show(`Checking ${bulkProblems.length} problem(s) against your library…`);

    const existingIds = await new Promise((res) => {
      runtime.sendMessage({ type: "GET_ALL_PROBLEM_IDS" }, (r) => res(new Set(r?.ids || [])));
    }).catch(() => new Set());

    // A Codeforces slug is exact, so an id collision is the same problem. Never
    // overwrite: whatever is already there was either solved live, with code, or
    // imported before — both beat a second empty record.
    const fresh = bulkProblems.filter((p) => !existingIds.has(p.id));
    const skipped = bulkProblems.length - fresh.length;

    if (fresh.length === 0) {
      show(`All ${bulkProblems.length} problem(s) are already in your library.`);
      btn.textContent = "✓ Already up to date";
      btn.style.color = "#0f766e";
      btn.disabled = false;
      return;
    }

    let totalSaved = 0;
    for (let i = 0; i < fresh.length; i += BATCH_SIZE) {
      const batch = fresh.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(fresh.length / BATCH_SIZE);
      show(
        `Saving batch ${batchNum}/${totalBatches} (${Math.min(i + BATCH_SIZE, fresh.length)}/${fresh.length})…` +
          (skipped > 0 ? ` · ${skipped} already present` : ""),
      );

      const result = await new Promise((resolve) => {
        runtime.sendMessage({ type: "BULK_IMPORT", problems: batch }, (res) => resolve(res || {}));
      }).catch(() => ({}));

      totalSaved += result.saved ?? batch.length;

      if (i + BATCH_SIZE < fresh.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    show(
      `Done — imported ${totalSaved} problem(s)${skipped > 0 ? `, ${skipped} already present` : ""}. ` +
        `Codeforces does not publish submission source, so these arrive without code.`,
    );
    btn.textContent = `✓ Imported ${totalSaved} solves`;
    btn.style.color = "#0f766e";
    btn.style.borderColor = "rgba(15,118,110,0.4)";
  } catch (e) {
    dbg.error("CF profile import failed", e);
    show(`Import failed: ${e.message}`);
    btn.disabled = false;
    btn.textContent = "↺ Retry Import";
  }
}
