/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../lib/debug.js";
import { CONSTANTS } from "../core/constants.js";

const dbg = createDebugger("RefreshMetadataHandler");

const refreshQueueState = {
  queue: [],
  current: null,
};

function openNextRefreshTab() {
  if (refreshQueueState.current || refreshQueueState.queue.length === 0) {
    if (refreshQueueState.current) {
      dbg.log(`openNextRefreshTab(): tab already open, skipping`);
    }
    return;
  }

  const next = refreshQueueState.queue.shift();
  refreshQueueState.current = next;
  dbg.log(`openNextRefreshTab(): opening tab for ${next.url.substring(0, 60)}...`);

  chrome.tabs.create({ url: next.url, active: false }, (tab) => {
    if (chrome.runtime.lastError) {
      dbg.error(`openNextRefreshTab(): ✗ failed to open tab:`, chrome.runtime.lastError.message);
      refreshQueueState.current = null;
      setTimeout(openNextRefreshTab, 0);
      return;
    }

    refreshQueueState.current = { ...next, tabId: tab.id };
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
  setTimeout(openNextRefreshTab, 0);
  return { queued: refreshQueueState.queue.length, completed: true };
}

/**
 * Refresh missing metadata for problems via background tab opens.
 * Opens each problem URL with ?codeledger_fetch=1 flag in a background tab.
 * The handler will save metadata and close the tab when done.
 */
export async function handleRefreshMetadata(problems = []) {
  const toRefresh = problems.filter((p) => !p.tags || p.tags.length === 0).slice(0, 50);
  dbg.log(
    `handleRefreshMetadata(): filtering ${problems.length} problems, ${toRefresh.length} need refresh (max 50)`,
  );

  if (toRefresh.length === 0) {
    dbg.log(`handleRefreshMetadata(): no problems need metadata refresh`);
    return { queued: 0, message: "No problems need metadata refresh" };
  }

  // Build URLs for each problem
  const urlsToOpen = toRefresh
    .map((p, idx) => {
      const { titleSlug, platform } = p;
      if (!titleSlug || !platform) {
        dbg.warn(`handleRefreshMetadata(): problem ${idx} missing titleSlug or platform`);
        return null;
      }

      const lc = CONSTANTS.PLATFORMS.leetcode;
      const gfg = CONSTANTS.PLATFORMS.geeksforgeeks;
      const cf = CONSTANTS.PLATFORMS.codeforces;
      const base = {
        leetcode: `${lc.problemsBase}${titleSlug}/`,
        geeksforgeeks: `${gfg.practiceBase}${titleSlug}`,
        codeforces: `${cf.problemsBase}${titleSlug}`,
      }[platform];

      if (!base) {
        dbg.warn(`handleRefreshMetadata(): unknown platform=${platform}`);
        return null;
      }
      const url = new URL(base);
      url.searchParams.set("codeledger_fetch", "1");
      url.searchParams.set("cl_fetch_id", titleSlug);
      return url.toString();
    })
    .filter(Boolean);

  if (urlsToOpen.length === 0) {
    dbg.log(`handleRefreshMetadata(): no valid URLs generated`);
    return { queued: 0, message: "No valid URLs to refresh" };
  }

  dbg.log(
    `handleRefreshMetadata(): queueing ${urlsToOpen.length} URL(s) for background metadata refresh`,
  );

  refreshQueueState.queue = urlsToOpen.map((url) => ({ url }));
  refreshQueueState.current = null;
  openNextRefreshTab();

  return {
    queued: urlsToOpen.length,
    message: `Queued ${urlsToOpen.length} problems for background refresh`,
  };
}
