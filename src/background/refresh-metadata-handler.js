import { createDebugger } from "../lib/debug.js";

const refreshQueueState = {
    queue: [],
    current: null,
};

function openNextRefreshTab() {
    if (refreshQueueState.current || refreshQueueState.queue.length === 0) {
        return;
    }

    const next = refreshQueueState.queue.shift();
    refreshQueueState.current = next;

    chrome.tabs.create({ url: next.url, active: false }, (tab) => {
        if (chrome.runtime.lastError) {
            const dbg = createDebugger("handleRefreshMetadata");
            dbg.error(`Failed to open tab for ${next.url}:`, chrome.runtime.lastError);
            refreshQueueState.current = null;
            setTimeout(openNextRefreshTab, 0);
            return;
        }

        refreshQueueState.current = { ...next, tabId: tab.id };

        const dbg = createDebugger("handleRefreshMetadata");
        dbg.log(`Opened background tab ${tab.id} for metadata refresh`);
    });
}

export function completeRefreshMetadata(tabId) {
    if (!refreshQueueState.current) return { queued: refreshQueueState.queue.length, completed: true };
    if (tabId && refreshQueueState.current.tabId && refreshQueueState.current.tabId !== tabId) {
        return { queued: refreshQueueState.queue.length, completed: false };
    }

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
    const dbg = createDebugger("handleRefreshMetadata");
    const toRefresh = problems.filter(p => !p.tags || p.tags.length === 0).slice(0, 50);

    if (toRefresh.length === 0) {
        return { queued: 0, message: "No problems need metadata refresh" };
    }

    // Build URLs for each problem
    const urlsToOpen = toRefresh.map(p => {
        const { titleSlug, platform } = p;
        if (!titleSlug || !platform) return null;

        const base = {
            "leetcode": `https://leetcode.com/problems/${titleSlug}/`,
            "geeksforgeeks": `https://practice.geeksforgeeks.org/problems/${titleSlug}`,
            "codeforces": `https://codeforces.com/problemset/problem/${titleSlug}`,
        }[platform];

        if (!base) return null;
        const url = new URL(base);
        url.searchParams.set("codeledger_fetch", "1");
        url.searchParams.set("cl_fetch_id", titleSlug);
        return url.toString();
    }).filter(Boolean);

    if (urlsToOpen.length === 0) {
        return { queued: 0, message: "No valid URLs to refresh" };
    }

    dbg.log(`Queueing ${urlsToOpen.length} problems for background metadata refresh`);

    refreshQueueState.queue = urlsToOpen.map((url) => ({ url }));
    refreshQueueState.current = null;
    openNextRefreshTab();

    return { queued: urlsToOpen.length, message: `Queued ${urlsToOpen.length} problems for background refresh` };
}
