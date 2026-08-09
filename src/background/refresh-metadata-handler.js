/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../lib/debug.js";
import { CONSTANTS } from "../core/constants.js";
import { cleanGfgSlug } from "../core/gfg-utils.js";
import { Storage } from "../core/storage.js";
import { fetchGFGProblemData } from "./gfg-api.js";

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
        const cf = CONSTANTS.PLATFORMS.codeforces;
        const base = {
          leetcode: `${lc.problemsBase}${titleSlug}/`,
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

    tabsQueued = urlsToOpen.length;
    if (tabsQueued > 0) {
      dbg.log(`handleRefreshMetadata(): queueing ${tabsQueued} URL(s) for background tab refresh`);
      refreshQueueState.queue = urlsToOpen.map((url) => ({ url }));
      refreshQueueState.current = null;
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

/**
 * Refresh a SINGLE GFG problem via the API.
 * Used by the modal's "Fetch Description" button for GFG problems.
 *
 * @param {string} problemId  - Storage ID (e.g. "gfg-compare-two-fractions4438")
 * @param {string} titleSlug  - GFG slug (e.g. "compare-two-fractions4438")
 * @returns {Promise<{ok: boolean, data?: object, error?: string}>}
 */
export async function refreshSingleGFGProblem(problemId, titleSlug) {
  try {
    const slug = cleanGfgSlug(titleSlug || problemId?.replace(/^gfg-/, "") || "");
    if (!slug) return { ok: false, error: "Could not determine problem slug" };

    dbg.log(`refreshSingleGFGProblem(): fetching slug=${slug}`);
    const apiData = await fetchGFGProblemData(slug);

    if (!apiData) {
      return { ok: false, error: `GFG API returned no data for slug: ${slug}` };
    }

    const existing = await Storage.getProblem(problemId).catch(() => null);
    if (!existing) {
      return { ok: false, error: `Problem not found in storage: ${problemId}` };
    }

    const updated = {
      ...existing,
      title:
        existing.title && existing.title !== slug
          ? existing.title
          : apiData.title || existing.title,
      difficulty: existing.difficulty || apiData.difficulty || null,
      tags: apiData.tags?.length ? apiData.tags : existing.tags || [],
      problemStatement: apiData.problemStatement || existing.problemStatement || null,
    };

    await Storage.saveProblem(updated);

    // Notify any open library pages
    try {
      chrome.runtime.sendMessage({
        type: "REFRESH_METADATA_DONE",
        platform: "geeksforgeeks",
        slug,
        problemId,
      });
    } catch (_) {}

    dbg.log(`refreshSingleGFGProblem(): ✓ saved slug=${slug}`, {
      tags: updated.tags.length,
      hasStatement: !!updated.problemStatement,
    });

    return { ok: true, data: updated };
  } catch (e) {
    dbg.error(`refreshSingleGFGProblem(): ✗ error:`, e?.message);
    return { ok: false, error: e?.message || "Unknown error" };
  }
}
