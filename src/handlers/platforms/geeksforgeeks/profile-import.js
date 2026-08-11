/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GFG bulk profile import — reads solved problems from the GFG user profile
 * page (__NEXT_DATA__ JSON) and saves them to IndexedDB.
 */

import { createDebugger } from "../../../lib/debug.js";
import { Storage } from "../../../core/storage.js";
import { normalizeDifficulty } from "../../../core/difficulty-map.js";
import { resolvePrimaryTopic } from "../../../core/topic-resolver.js";
import { runtime } from "../../../lib/browser-compat.js";
import { detectPage, PAGE_TYPES } from "./page-detector.js";
import { cleanGfgSlug } from "../../../core/gfg-utils.js";

const dbg = createDebugger("GFGProfileImport");

const DIFFICULTY_ORDER = ["school", "basic", "easy", "medium", "hard"];

function findSubmissionsObject(obj) {
  if (!obj || typeof obj !== "object") return null;

  const validKeys = ["school", "basic", "easy", "medium", "hard"];
  const keys = Object.keys(obj);

  // Check if this object has any of the difficulty keys and contains inner objects
  const hasDiffKey = keys.some(
    (k) => validKeys.includes(k.toLowerCase()) && obj[k] && typeof obj[k] === "object",
  );
  if (hasDiffKey) {
    const hasData = keys.some(
      (k) => validKeys.includes(k.toLowerCase()) && Object.keys(obj[k] || {}).length > 0,
    );
    if (hasData) return obj;
  }

  for (const k of keys) {
    if (obj[k] && typeof obj[k] === "object") {
      const res = findSubmissionsObject(obj[k]);
      if (res) return res;
    }
  }
  return null;
}

function scrapeDomForSubmissions() {
  const map = new Map();
  document.querySelectorAll('a[href*="/problems/"]').forEach((a) => {
    const href = a.getAttribute("href");
    const match = href.match(/\/problems\/([^\/\?#]+)/);
    if (!match) return;
    const rawSlug = match[1].toLowerCase().trim();
    let slug = cleanGfgSlug(rawSlug);

    if (slug === "all" || slug.length < 2) return;
    if (href.includes("/edit") || href.includes("/submissions")) return;

    // Only extract the FIRST direct text node — child spans hold difficulty/date
    let title = "";
    for (const node of a.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent.trim();
        if (t.length > 1) {
          title = t;
          break;
        }
      }
    }
    // Fallback: try aria-label or title attribute
    if (!title) title = a.getAttribute("aria-label") || a.getAttribute("title") || "";
    // Final fallback: humanize slug
    if (!title || title.length > 120)
      title = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    // Clean title: remove trailing spaces and numeric IDs e.g. " 1235 102404" or " 102404"
    const cleanTitle = title.replace(/[\s\d]+$/, "").trim();

    // Determine difficulty from sibling/child span text
    let difficulty = "Unknown";
    const diffText = a.textContent;
    if (/easy/i.test(diffText)) difficulty = "Easy";
    else if (/medium/i.test(diffText)) difficulty = "Medium";
    else if (/hard/i.test(diffText)) difficulty = "Hard";

    if (!map.has(slug)) {
      map.set(slug, { slug, title: cleanTitle || title, difficulty });
    }
  });
  return Array.from(map.values());
}

function findUserHandle(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (typeof obj.handle === "string" && obj.handle.trim()) return obj.handle.trim();
  if (typeof obj.userName === "string" && obj.userName.trim()) return obj.userName.trim();
  if (typeof obj.username === "string" && obj.username.trim()) return obj.username.trim();

  for (const k of Object.keys(obj)) {
    if (obj[k] && typeof obj[k] === "object") {
      const res = findUserHandle(obj[k]);
      if (res) return res;
    }
  }
  return null;
}

/**
 * Fetches a URL with automatic retry and exponential backoff.
 * - Respects the `Retry-After` response header on 429/503.
 * - Detects Cloudflare challenge pages (status 403/503 with cf-ray header).
 * - Returns the response body text on success, or null after exhausting retries.
 *
 * @param {string} url
 * @param {RequestInit} opts
 * @param {{ maxRetries?: number, baseDelayMs?: number }} [retryOpts]
 * @returns {Promise<string|null>}
 */
async function fetchWithBackoff(url, opts = {}, { maxRetries = 3, baseDelayMs = 1000 } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res;
    try {
      res = await fetch(url, opts);
    } catch (networkErr) {
      // Network failure (offline, DNS, etc.) — wait then retry
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        dbg.warn(
          `fetchWithBackoff: network error on attempt ${attempt + 1}, retrying in ${delay}ms…`,
          networkErr.message,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw networkErr;
    }

    if (res.ok) {
      return res.text();
    }

    // Cloudflare challenge — cannot retry meaningfully in content-script context
    if (res.headers.get("cf-ray")) {
      dbg.warn("fetchWithBackoff: Cloudflare challenge detected, giving up.");
      return null;
    }

    if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
      // Honour Retry-After header (value is seconds or an HTTP date)
      const retryAfterRaw = res.headers.get("Retry-After");
      let waitMs = baseDelayMs * Math.pow(2, attempt); // default exponential

      if (retryAfterRaw) {
        const seconds = parseInt(retryAfterRaw, 10);
        if (!isNaN(seconds)) {
          waitMs = Math.max(waitMs, seconds * 1000);
        } else {
          const date = Date.parse(retryAfterRaw);
          if (!isNaN(date)) waitMs = Math.max(waitMs, date - Date.now());
        }
      }

      // Cap wait at 30 seconds so we don't hang forever in a content script
      waitMs = Math.min(waitMs, 30_000);
      dbg.warn(
        `fetchWithBackoff: ${res.status} on attempt ${attempt + 1}, waiting ${Math.round(waitMs / 1000)}s before retry…`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    // Non-retryable error (404, 401, etc.)
    dbg.warn(`fetchWithBackoff: non-retryable status ${res.status} for ${url}`);
    return null;
  }
  return null;
}

/**
 * GFG-polite throttled fetch.
 * Enforces a minimum gap between consecutive requests so bulk code scraping
 * doesn't get rate-limited. Shared state is module-level so all callers share
 * the same token bucket.
 *
 * @param {string} url
 * @param {RequestInit} [opts]
 * @returns {Promise<string|null>}
 */
let _lastGfgFetchAt = 0;
const GFG_MIN_GAP_MS = 800; // minimum 800ms between GFG page fetches

export async function gfgThrottledFetch(url, opts = {}) {
  const now = Date.now();
  const gap = now - _lastGfgFetchAt;
  if (gap < GFG_MIN_GAP_MS) {
    await new Promise((r) => setTimeout(r, GFG_MIN_GAP_MS - gap));
  }
  _lastGfgFetchAt = Date.now();
  return fetchWithBackoff(url, opts);
}

// ── Solve dates ─────────────────────────────────────────────────────────────
//
// The solved-problems list on the profile carries no dates at all. Stamping the
// import time on every record meant a back catalogue of 200 problems became 200
// solves on one day: 200 backdated commits all dated today, one enormous block
// on the contribution graph, and a points total that all landed in a single
// square of the heatmap.
//
// GFG does publish the dates, just somewhere else — a month-scoped submissions
// endpoint. Walking it month by month is slow, so it runs once per import and
// only far enough back to account for the problems on the profile.

const SUBMISSIONS_API = "https://practiceapi.geeksforgeeks.org/api/v1/user/problems/submissions/";
/** How far back to look. GFG Practice did not exist meaningfully before this. */
const MAX_MONTHS_BACK = 120;
/** Give up early once this many consecutive months come back empty. */
const EMPTY_MONTH_RUN = 18;

/** `YYYY-MM-DD` in any separator, optionally with a time after it. */
const DATE_KEY_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/;

/**
 * Pull `{slug: epochMs}` out of one month's response.
 *
 * Deliberately strict about what it recognises. A response whose shape does not
 * match is skipped rather than guessed at — a wrong date written into a commit
 * is worse than no date, because nothing downstream can tell it is wrong.
 *
 * @param {any} result the `result` field of the API response
 * @returns {Record<string, number>}
 */
export function parseSubmissionDates(result) {
  const out = {};
  if (!result || typeof result !== "object") return out;

  for (const key of Object.keys(result)) {
    const m = DATE_KEY_RE.exec(key);
    if (!m) continue; // not a date-keyed bucket — not the shape we understand
    const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isFinite(ts)) continue;

    const bucket = result[key];
    const entries = Array.isArray(bucket) ? bucket : Object.values(bucket || {});
    for (const entry of entries) {
      const raw = entry?.slug || entry?.problem_slug || entry?.pslug;
      if (typeof raw !== "string" || !raw.trim()) continue;
      const slug = cleanGfgSlug(raw.toLowerCase().trim());
      // Earliest wins: a re-submission months later is not when it was solved.
      if (!(slug in out) || ts < out[slug]) out[slug] = ts;
    }
  }
  return out;
}

/**
 * Build a `{slug: epochMs}` map of when each problem was first solved.
 *
 * @param {string} handle GFG user handle
 * @param {number} wanted how many problems are waiting for a date
 * @param {(msg: string) => void} show progress reporter
 * @returns {Promise<Record<string, number>>}
 */
async function fetchSolveDates(handle, wanted, show) {
  const dates = {};
  if (!handle) return dates;

  const now = new Date();
  let emptyRun = 0;

  for (let back = 0; back < MAX_MONTHS_BACK; back++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;

    let payload;
    try {
      const body = await gfgThrottledFetch(SUBMISSIONS_API, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, requestType: "", year, month }),
      });
      payload = body ? JSON.parse(body) : null;
    } catch (e) {
      dbg.warn(`fetchSolveDates(): ${year}-${month} failed:`, e?.message);
      payload = null;
    }

    const found = parseSubmissionDates(payload?.result);
    const added = Object.keys(found).filter((s) => !(s in dates));
    for (const slug of added) dates[slug] = found[slug];

    emptyRun = added.length ? 0 : emptyRun + 1;

    const have = Object.keys(dates).length;
    show(
      `Reading solve dates — ${have}/${wanted} found (back to ${year}-${String(month).padStart(2, "0")})…`,
    );

    if (have >= wanted) break;
    if (emptyRun >= EMPTY_MONTH_RUN) {
      dbg.log(
        `fetchSolveDates(): ${emptyRun} empty months in a row — stopping at ${year}-${month}`,
      );
      break;
    }
  }

  dbg.log(`fetchSolveDates(): resolved ${Object.keys(dates).length}/${wanted} solve date(s)`);
  return dates;
}

/**
 * Parse the __NEXT_DATA__ script tag on the current GFG profile page.
 * @returns {Promise<{ username: string, submissions: Array<{slug, title, difficulty}> } | null>}
 */
async function parseProfileData() {
  try {
    let script = document.getElementById("__NEXT_DATA__");
    let json = script ? JSON.parse(script.textContent || "{}") : null;
    let username = json ? findUserHandle(json) || "" : "";

    const urlPage = detectPage(window.location.pathname);
    const urlUsername = urlPage.type === PAGE_TYPES.PROFILE ? urlPage.username : "";

    const submissionsInfo =
      json?.props?.pageProps?.userSubmissionsInfo || findSubmissionsObject(json);
    const hasSubmissions = !!submissionsInfo && Object.keys(submissionsInfo).length > 0;
    const isMatchingUser =
      !urlUsername || !username || username.toLowerCase() === urlUsername.toLowerCase();

    if (!script || !hasSubmissions || !isMatchingUser) {
      dbg.log("NEXT_DATA missing, stale, or mismatching. Fetching fresh page from server...");
      try {
        const html = await fetchWithBackoff(window.location.href, {
          credentials: "include",
          headers: { Accept: "text/html", "Cache-Control": "no-cache" },
        });
        if (html) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          script = doc.getElementById("__NEXT_DATA__");
          if (script) {
            json = JSON.parse(script.textContent || "{}");
          }
        }
      } catch (err) {
        dbg.error("Fetch fresh page failed after retries:", err);
      }
    }

    username = findUserHandle(json) || urlUsername || "Anonymous";

    let finalSubmissionsInfo =
      json?.props?.pageProps?.userSubmissionsInfo || findSubmissionsObject(json) || {};
    let submissions = [];

    for (const diff of DIFFICULTY_ORDER) {
      const bucket =
        finalSubmissionsInfo[diff] ||
        finalSubmissionsInfo[diff.charAt(0).toUpperCase() + diff.slice(1)] ||
        {};
      for (const key of Object.keys(bucket)) {
        const entry = bucket[key] || {};
        const rawSlug = entry.slug || entry.pname?.toLowerCase().replace(/\s+/g, "-") || key;
        const rawTitle = entry.pname || key;

        // Clean slug: remove double-hyphen numeric ID suffix e.g., --102404
        const cleanSlug = cleanGfgSlug(rawSlug);

        // Clean title: remove trailing spaces and numeric IDs e.g. " 1235 102404" or " 102404"
        const cleanTitle = rawTitle.replace(/[\s\d]+$/, "").trim();

        submissions.push({
          slug: cleanSlug,
          title: cleanTitle || rawTitle,
          difficulty: normalizeDifficulty(diff),
        });
      }
    }

    // Fallback: If NEXT_DATA strategy yielded 0 problems, scrape the DOM directly
    if (submissions.length === 0) {
      dbg.log("NEXT_DATA strategy yielded 0 problems, attempting DOM scrape...");
      submissions = scrapeDomForSubmissions();
    }

    dbg.log(`parseProfileData(): ${submissions.length} problems for user "${username}"`);
    return { username, submissions };
  } catch (e) {
    dbg.error("parseProfileData() failed", e);
    // Ultimate fallback if NEXT_DATA parse throws exception
    const domSubs = scrapeDomForSubmissions();
    if (domSubs.length > 0) {
      dbg.log(`DOM scrape fallback found ${domSubs.length} problems`);
      const urlPage = detectPage(window.location.pathname);
      const urlUsername = urlPage.type === PAGE_TYPES.PROFILE ? urlPage.username : "Anonymous";
      return { username: urlUsername, submissions: domSubs };
    }
    return null;
  }
}

/**
 * Inject the "Import All Solves" button on the GFG profile page.
 * @param {Function} makeProblemId - bound method from the handler
 */
export async function injectProfileImportBtn(makeProblemId) {
  if (document.getElementById("cl-gfg-profile-import")) return;

  const MAX_ATTEMPTS = 20;
  const RETRY_MS = 500;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (document.getElementById("cl-gfg-profile-import")) return;

    // Check if Edit Profile is present on the page (indicating it's the user's own profile)
    const hasEditProfile = !!(
      document.querySelector('a[href*="/profile/edit"]') ||
      document.querySelector('a[href*="profile/edit"]') ||
      [...document.querySelectorAll("a, button, span, div")].some((el) =>
        /edit\s+profile/i.test(el.textContent),
      )
    );

    if (!hasEditProfile) {
      if (attempt === MAX_ATTEMPTS - 1) {
        dbg.log(
          "injectProfileImportBtn: 'Edit Profile' button not found, skipping button injection (not own profile)",
        );
        return;
      }
      await new Promise((r) => setTimeout(r, RETRY_MS));
      continue;
    }

    // Find a suitable anchor (profile header, stat card, or tabs container)
    const buttonRow =
      document.querySelector('a[href*="/profile/edit"]')?.parentElement ||
      document.querySelector('[class*="profileInfo"] + div') ||
      document.querySelector('[class*="profileInfo"] ~ div.flex');

    const tabsContainer = document.querySelector('[class*="tabsContainer"]');
    const profileInfo = document.querySelector('[class*="profileInfo"]');
    const profileContainer = document.querySelector('[class*="profileContainer"]');
    const legacyHead =
      document.querySelector('[class*="profile_head"]') ||
      document.querySelector('[class*="scoreCard_head"]') ||
      document.querySelector('[class*="userHandle"]');

    let anchor = null;
    let injectAsButtonRow = false;

    if (
      buttonRow &&
      (buttonRow.classList.contains("flex") ||
        buttonRow.className.includes("flex") ||
        buttonRow.querySelector("a"))
    ) {
      anchor = buttonRow;
      injectAsButtonRow = true;
    } else if (tabsContainer) {
      anchor = tabsContainer;
    } else if (profileInfo) {
      anchor = profileInfo;
    } else if (profileContainer) {
      anchor = profileContainer;
    } else if (legacyHead) {
      anchor = legacyHead;
    }

    if (anchor) {
      const btn = _createImportButton();
      const prog = document.createElement("div");
      prog.id = "cl-gfg-import-progress";
      prog.style.cssText =
        "font-size:12px;color:#cbd5e1;display:none;position:absolute;top:100%;right:0;margin-top:8px;background:#1e293b;padding:6px 12px;border-radius:6px;border:1px solid #334155;z-index:9999;box-shadow:0 10px 15px -3px rgba(0,0,0,0.5);white-space:nowrap;";

      if (injectAsButtonRow) {
        // Inject with a relative wrapper so absolute positioning works correctly
        const wrapper = document.createElement("div");
        wrapper.id = "cl-gfg-profile-import-wrapper";
        wrapper.style.cssText =
          "position:relative;display:inline-flex;align-items:center;margin-left:12px;";
        wrapper.appendChild(btn);
        wrapper.appendChild(prog);
        anchor.appendChild(wrapper);
      } else {
        // Use a block container wrapper
        const container = document.createElement("div");
        container.id = "cl-gfg-profile-import-wrapper";
        container.style.cssText =
          "margin:12px 0;position:relative;display:flex;align-items:center;justify-content:flex-end;gap:10px;width:100%;";

        container.appendChild(btn);
        container.appendChild(prog);

        const parent = anchor.parentElement;
        if (parent) {
          parent.insertBefore(container, anchor);
        } else {
          document.body.appendChild(container);
        }
      }

      btn.addEventListener("click", () => runProfileImport(makeProblemId, btn));
      return;
    }

    await new Promise((r) => setTimeout(r, RETRY_MS));
  }

  // Floating fallback
  if (!document.getElementById("cl-gfg-profile-import")) {
    const floater = document.createElement("div");
    floater.id = "cl-gfg-profile-import-floater";
    floater.style.cssText =
      "position:fixed;bottom:80px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:6px;align-items:flex-end;";
    const btn = _createImportButton();
    btn.style.boxShadow = "0 4px 24px rgba(6,182,212,0.12)";
    const prog = document.createElement("div");
    prog.id = "cl-gfg-import-progress";
    prog.style.cssText =
      "font-size:12px;color:#94a3b8;display:none;max-width:320px;text-align:right;";
    floater.appendChild(prog);
    floater.appendChild(btn);
    document.body.appendChild(floater);
    btn.addEventListener("click", () => runProfileImport(makeProblemId, btn));
  }
}

function _createImportButton() {
  const btn = document.createElement("button");
  btn.id = "cl-gfg-profile-import";
  btn.style.cssText =
    "display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;" +
    "font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;" +
    "border:1px solid rgba(6,182,212,0.4);color:#67e8f9;" +
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

export function removeProfileImportBtn() {
  document.getElementById("cl-gfg-profile-import")?.remove();
  document.getElementById("cl-gfg-import-progress")?.remove();
  document.getElementById("cl-gfg-profile-import-wrapper")?.remove();
  document.getElementById("cl-gfg-profile-import-floater")?.remove();
}

async function runProfileImport(makeProblemId, btn) {
  btn.disabled = true;
  const progressEl = document.getElementById("cl-gfg-import-progress");
  const show = (msg) => {
    dbg.log("[import]", msg);
    if (progressEl) {
      progressEl.textContent = msg;
      progressEl.style.display = "block";
    }
  };

  try {
    show("Reading profile data…");
    const profileData = await parseProfileData();

    if (!profileData) {
      show(
        "Could not read profile data. Make sure you are on your GFG profile page and logged in.",
      );
      btn.disabled = false;
      return;
    }

    const { username, submissions } = profileData;
    if (submissions.length === 0) {
      show("No solved problems found in your profile.");
      btn.disabled = false;
      return;
    }

    show(`Found ${submissions.length} solved problems. Reading solve dates…`);

    // Dates first: the profile list has none, and a record that says it was
    // solved today when it was solved two years ago corrupts the commit
    // history, the heatmap and the streak all at once.
    const solveDates = await fetchSolveDates(username, submissions.length, show).catch((e) => {
      dbg.warn("solve date lookup failed:", e?.message);
      return {};
    });

    const undated = submissions.filter((s) => !solveDates[s.slug]).length;
    show(
      `Building import — ${submissions.length - undated} dated, ${undated} without a published date…`,
    );

    const bulkProblems = submissions.map((sub) => {
      const tags = [];
      const topic = resolvePrimaryTopic(tags);
      const solvedAt = solveDates[sub.slug] || null;

      return {
        id: makeProblemId(`${sub.slug}`),
        platform: "geeksforgeeks",
        title: sub.title,
        titleSlug: sub.slug,
        difficulty: sub.difficulty || "Unknown",
        lang: { name: "Unknown", ext: "txt", slug: "unknown" },
        tags,
        topic,
        code: "",
        files: [],
        // Null, not Date.now(). Everything that groups by day treats an unknown
        // date as unknown; stamping the import time would put the whole back
        // catalogue on one square of the calendar and one day of commits.
        timestamp: solvedAt,
        importedAt: Date.now(),
        _solveDateUnknown: !solvedAt,
        runtime: null,
        memory: null,
        problemStatement: null,
        _importedFromProfile: true,
        _needsCodeFetch: true,
      };
    });

    show(`Checking ${bulkProblems.length} problems against existing library…`);

    // Fetch all existing problem IDs in one message
    const existingIds = await new Promise((res) => {
      runtime.sendMessage({ type: "GET_ALL_PROBLEM_IDS" }, (r) => res(new Set(r?.ids || [])));
    }).catch(() => new Set());

    // Fetch all GFG problems currently in the library
    const gfgIdsInLibrary = Array.from(existingIds).filter((id) => id.startsWith("gfg-"));
    const existingGfgProblems = await new Promise((res) => {
      if (gfgIdsInLibrary.length === 0) return res([]);
      runtime.sendMessage({ type: "GET_PROBLEMS_BY_IDS", ids: gfgIdsInLibrary }, (r) =>
        res(r?.problems || []),
      );
    }).catch(() => []);

    const cleanGfgSlugForComparison = (slug) => {
      if (!slug) return "";
      return slug
        .toLowerCase()
        .replace(/--\d+$/, "") // remove double hyphen and digits
        .replace(/\d+$/, "") // remove trailing digits
        .replace(/[^a-z0-9]/g, ""); // remove non-alphanumeric
    };

    // Map of clean slug -> existing GFG problem
    const existingGfgCleanSlugs = new Map();
    for (const rec of existingGfgProblems) {
      const cleanSlug = cleanGfgSlugForComparison(rec.titleSlug || rec.id.replace(/^gfg-/, ""));
      if (cleanSlug) {
        existingGfgCleanSlugs.set(cleanSlug, rec);
      }
    }

    const filteredProblems = [];
    const idsToDelete = [];

    for (const p of bulkProblems) {
      const cleanSlug = cleanGfgSlugForComparison(p.titleSlug);
      const existing = existingGfgCleanSlugs.get(cleanSlug);
      if (existing) {
        // If existing has code or was not imported from profile, skip
        if (existing.code?.trim().length > 0 || !existing._importedFromProfile) {
          continue;
        }
        // If existing is a legacy corrupt import (contains "--"), queue it for deletion and import clean one
        if (existing.titleSlug?.includes("--")) {
          idsToDelete.push(existing.id);
          filteredProblems.push(p);
        } else {
          // Already clean in library, skip
          continue;
        }
      } else {
        filteredProblems.push(p);
      }
    }

    // Delete queued legacy problems
    if (idsToDelete.length > 0) {
      show(`Cleaning up ${idsToDelete.length} legacy GFG problem placeholders…`);
      for (const id of idsToDelete) {
        await new Promise((res) => {
          runtime.sendMessage({ type: "DELETE_PROBLEM", id }, () => res());
        }).catch(() => {});
      }
    }
    const skipped = bulkProblems.length - filteredProblems.length;

    if (filteredProblems.length === 0) {
      show(`All ${bulkProblems.length} problems already imported. Nothing new to add.`);
      btn.textContent = "✓ Already up to date";
      btn.style.color = "#34d399";
      btn.disabled = false;
      return;
    }

    // Chunk imports into batches of 15 with 350ms gaps to avoid RTE / message channel pressure
    const BATCH_SIZE = 15;
    const BATCH_DELAY_MS = 350;
    let totalSaved = 0;

    for (let i = 0; i < filteredProblems.length; i += BATCH_SIZE) {
      const batch = filteredProblems.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(filteredProblems.length / BATCH_SIZE);
      show(
        `Saving batch ${batchNum}/${totalBatches} (${Math.min(i + BATCH_SIZE, filteredProblems.length)}/${filteredProblems.length} problems)…` +
          (skipped > 0 ? ` · ${skipped} skipped (already exist)` : ""),
      );

      const result = await new Promise((resolve) => {
        runtime.sendMessage({ type: "BULK_IMPORT", problems: batch }, (res) => resolve(res || {}));
      }).catch(() => ({}));

      totalSaved += result.saved ?? batch.length;

      // Pause between batches (skip pause after last batch)
      if (i + BATCH_SIZE < filteredProblems.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    show(`Done! Imported ${totalSaved} problem(s)${skipped > 0 ? ` · ${skipped} skipped` : ""}.`);
    btn.textContent = `✓ Imported ${totalSaved} solves`;
    btn.style.color = "#34d399";
    btn.style.borderColor = "rgba(52,211,153,0.4)";
  } catch (e) {
    dbg.error("GFG profile import failed", e);
    show(`Import failed: ${e.message}`);
    btn.disabled = false;
    btn.textContent = "↺ Retry Import";
  }
}
