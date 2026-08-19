/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../lib/debug.js";
import { CONSTANTS } from "../core/constants.js";
import { cleanGfgSlug } from "../core/gfg-utils.js";
import { cfProblemUrl } from "../core/cf-utils.js";
import { Storage } from "../core/storage.js";
import { storage } from "../lib/browser-compat.js";
import { fetchGFGProblemData } from "./gfg-api.js";

const dbg = createDebugger("RefreshMetadataHandler");

const refreshQueueState = {
  queue: [],
  current: null,
};

// The queue lives in storage.session so a mid-queue MV3 service-worker
// shutdown does not silently drop the remaining tabs — session scope means it
// also does not surprise the user with tab-opening at the next browser launch.
function persistQueueState() {
  storage.session
    .set({
      [CONSTANTS.SK.REFRESH_TAB_QUEUE]: {
        queue: refreshQueueState.queue,
        current: refreshQueueState.current,
      },
    })
    .catch(() => {});
}

/**
 * Restore a queue interrupted by a service-worker restart. Called from the
 * service worker's init on every wake; a no-op when nothing was persisted.
 */
export async function resumeRefreshQueue() {
  let saved;
  try {
    const res = await storage.session.get(CONSTANTS.SK.REFRESH_TAB_QUEUE);
    saved = res?.[CONSTANTS.SK.REFRESH_TAB_QUEUE];
  } catch (_) {
    return;
  }
  if (!saved || (!saved.queue?.length && !saved.current)) return;
  // In-memory state wins: if this wake already started a queue, don't clobber it.
  if (refreshQueueState.current || refreshQueueState.queue.length > 0) return;

  refreshQueueState.queue = Array.isArray(saved.queue) ? saved.queue : [];
  refreshQueueState.current = saved.current || null;
  dbg.log(
    `resumeRefreshQueue(): restored ${refreshQueueState.queue.length} queued, current=${!!refreshQueueState.current}`,
  );

  if (refreshQueueState.current?.tabId != null) {
    // The tab may have closed while the worker was asleep — its onRemoved
    // event is gone, so waiting on it would stall the queue forever.
    chrome.tabs.get(refreshQueueState.current.tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        refreshQueueState.current = null;
        persistQueueState();
        openNextRefreshTab();
      }
    });
  } else {
    // Persisted mid-creation: no tab id to wait for, so re-open the URL.
    if (refreshQueueState.current) refreshQueueState.queue.unshift(refreshQueueState.current);
    refreshQueueState.current = null;
    openNextRefreshTab();
  }
}

function openNextRefreshTab() {
  if (refreshQueueState.current || refreshQueueState.queue.length === 0) {
    if (refreshQueueState.current) {
      dbg.log(`openNextRefreshTab(): tab already open, skipping`);
    }
    return;
  }

  const next = refreshQueueState.queue.shift();
  refreshQueueState.current = next;
  persistQueueState();
  dbg.log(`openNextRefreshTab(): opening tab for ${next.url.substring(0, 60)}...`);

  chrome.tabs.create({ url: next.url, active: false }, (tab) => {
    if (chrome.runtime.lastError) {
      dbg.error(`openNextRefreshTab(): ✗ failed to open tab:`, chrome.runtime.lastError.message);
      refreshQueueState.current = null;
      persistQueueState();
      setTimeout(openNextRefreshTab, 0);
      return;
    }

    refreshQueueState.current = { ...next, tabId: tab.id };
    persistQueueState();
    dbg.log(`openNextRefreshTab(): ✓ opened background tab ${tab.id} for metadata refresh`);
  });
}

export function completeRefreshMetadata(tabId) {
  if (!refreshQueueState.current) {
    const queued = refreshQueueState.queue.length;
    dbg.log(`completeRefreshMetadata(): no current tab, ${queued} queued`);
    return { queued, completed: true };
  }
  if (tabId && refreshQueueState.current.tabId && refreshQueueState.current.tabId !== tabId) {
    dbg.log(
      `completeRefreshMetadata(): tab mismatch (${tabId} vs ${refreshQueueState.current.tabId}), not completing`,
    );
    return { queued: refreshQueueState.queue.length, completed: false };
  }

  dbg.log(
    `completeRefreshMetadata(): completing tab ${refreshQueueState.current.tabId || "unknown"}`,
  );
  refreshQueueState.current = null;
  persistQueueState();
  setTimeout(openNextRefreshTab, 0);
  return { queued: refreshQueueState.queue.length, completed: true };
}

/**
 * Refresh GFG problem metadata directly via the GFG API (no tab opening).
 * Updates the problem in storage with title, difficulty, tags, and problemStatement.
 *
 * @param {object[]} gfgProblems - Array of GFG problem objects from storage
 * @returns {Promise<{refreshed: number, failed: number}>}
 */
async function refreshGFGProblemsViaAPI(gfgProblems) {
  let refreshed = 0;
  let failed = 0;

  for (const problem of gfgProblems) {
    try {
      // Verified-dead URLs can only 404 — don't count them as fetch failures.
      if (problem.urlBroken) {
        dbg.log(`refreshGFGProblemsViaAPI(): skipping urlBroken problem=${problem.id}`);
        continue;
      }
      const slug = cleanGfgSlug(problem.titleSlug || problem.id?.replace(/^gfg-/, "") || "");
      if (!slug) {
        failed++;
        continue;
      }

      dbg.log(`refreshGFGProblemsViaAPI(): fetching slug=${slug}`);
      const apiData = await fetchGFGProblemData(slug);

      if (!apiData) {
        dbg.warn(`refreshGFGProblemsViaAPI(): no data returned for slug=${slug}`);
        failed++;
        continue;
      }

      // Merge into existing problem — always update tags/description, only update
      // title/difficulty if existing values are missing/default.
      const updated = {
        ...problem,
        title:
          problem.title && problem.title !== slug ? problem.title : apiData.title || problem.title,
        difficulty: problem.difficulty || apiData.difficulty || null,
        tags: apiData.tags?.length ? apiData.tags : problem.tags || [],
        problemStatement: apiData.problemStatement || problem.problemStatement || null,
      };

      await Storage.saveProblem(updated);

      // Broadcast REFRESH_METADATA_DONE so library modals can update
      try {
        chrome.runtime.sendMessage({
          type: "REFRESH_METADATA_DONE",
          platform: "geeksforgeeks",
          slug,
          problemId: problem.id,
        });
      } catch (_) {
        // Library might not be open — not an error
      }

      refreshed++;
      dbg.log(`refreshGFGProblemsViaAPI(): ✓ updated slug=${slug}`, {
        tags: updated.tags.length,
        hasStatement: !!updated.problemStatement,
      });
    } catch (e) {
      dbg.error(
        `refreshGFGProblemsViaAPI(): ✗ error for problem=${problem.titleSlug}:`,
        e?.message,
      );
      failed++;
    }
  }

  return { refreshed, failed };
}

/**
 * Refresh missing metadata for problems.
 * - GFG: calls the GFG API directly (no tab opening needed)
 * - LeetCode/Codeforces: opens background tabs with ?codeledger_fetch=1
 */
export async function handleRefreshMetadata(problems = []) {
  const toRefresh = problems
    .filter((p) => !p.tags || p.tags.length === 0 || !p.problemStatement)
    .slice(0, 50);
  dbg.log(
    `handleRefreshMetadata(): filtering ${problems.length} problems, ${toRefresh.length} need refresh (max 50)`,
  );

  if (toRefresh.length === 0) {
    dbg.log(`handleRefreshMetadata(): no problems need metadata refresh`);
    return { queued: 0, message: "No problems need metadata refresh" };
  }

  // Split by platform
  const gfgProblems = toRefresh.filter((p) => p.platform === "geeksforgeeks");
  const otherProblems = toRefresh.filter((p) => p.platform !== "geeksforgeeks");

  // Handle GFG via direct API
  let gfgResult = { refreshed: 0, failed: 0 };
  if (gfgProblems.length > 0) {
    dbg.log(`handleRefreshMetadata(): refreshing ${gfgProblems.length} GFG problem(s) via API`);
    gfgResult = await refreshGFGProblemsViaAPI(gfgProblems);
    dbg.log(
      `handleRefreshMetadata(): GFG API refresh done: ${gfgResult.refreshed} updated, ${gfgResult.failed} failed`,
    );
  }

  // Handle LeetCode/Codeforces via background tab
  let tabsQueued = 0;
  if (otherProblems.length > 0) {
    const urlsToOpen = otherProblems
      .map((p, idx) => {
        const { titleSlug, platform } = p;
        if (!titleSlug || !platform) {
          dbg.warn(`handleRefreshMetadata(): problem ${idx} missing titleSlug or platform`);
          return null;
        }
        const lc = CONSTANTS.PLATFORMS.leetcode;
        const base = {
          leetcode: `${lc.problemsBase}${titleSlug}/`,
          // A CF slug is contest + letter glued together; problemsBase + "4A"
          // opens a 404, so the refresh tab would never see a problem page.
          codeforces: cfProblemUrl(titleSlug),
        }[platform];

        if (!base) {
          dbg.warn(
            `handleRefreshMetadata(): no refresh URL for platform=${platform} slug=${titleSlug}`,
          );
          return null;
        }
        const url = new URL(base);
        url.searchParams.set("codeledger_fetch", "1");
        url.searchParams.set("cl_fetch_id", titleSlug);
        return url.toString();
      })
      .filter(Boolean);

    tabsQueued = urlsToOpen.length;
    if (tabsQueued > 0) {
      dbg.log(`handleRefreshMetadata(): queueing ${tabsQueued} URL(s) for background tab refresh`);
      refreshQueueState.queue = urlsToOpen.map((url) => ({ url }));
      refreshQueueState.current = null;
      persistQueueState();
      openNextRefreshTab();
    }
  }

  return {
    queued: tabsQueued,
    gfgRefreshed: gfgResult.refreshed,
    gfgFailed: gfgResult.failed,
    message: `GFG: ${gfgResult.refreshed} updated via API. Others: ${tabsQueued} queued via tab.`,
  };
}

// Refreshing one problem on request now goes through `refreshEntireProblem` in
// the service worker, which handles every platform the same way and repairs the
// missing code in the same press. The GFG-only version that used to live here
// had no callers left.
