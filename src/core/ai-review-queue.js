/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Persistent AI Review Queue Manager
 * Manages enqueuing, processing, persistence, and retry of AI reviews across browser sessions.
 * Respects rate limits with exponential backoff.
 */

import { Storage } from "./storage.js";
import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("AIReviewQueue");

const QUEUE_STORE = "ai-review-queue";
const QUEUE_STATE_KEY = "review_queue_state";
const RETRY_BASE_DELAY_MS = 5000; // Start with 5s backoff
const RETRY_MAX_DELAY_MS = 300000; // Cap at 5 minutes
const MAX_RETRIES = 5;
const RATE_LIMIT_DELAY_MS = 2000; // Space between review requests

/** Queue item status */
const STATUS = {
    PENDING: "pending",
    PROCESSING: "processing",
    DONE: "done",
    FAILED: "failed",
};

/**
 * Initialize IndexedDB store for review queue if not exists.
 * @returns {Promise<void>}
 */
export async function initializeReviewQueueStore() {
    try {
        const db = await _openDB();
        const tx = db.transaction([QUEUE_STORE], "readwrite");
        const store = tx.objectStore(QUEUE_STORE);
        // Ensure index on status + problemId for efficient queries
        try {
            store.createIndex("statusIndex", "status", { unique: false });
            store.createIndex("problemIdIndex", "problemId", { unique: false });
        } catch (_) {
            // Index already exists
        }
        db.close();
    } catch (e) {
        dbg.warn("Failed to initialize review queue store:", e?.message);
    }
}

/**
 * Open IndexedDB connection (uses browser's IndexedDB via Storage layer).
 * @returns {Promise<IDBDatabase>}
 */
async function _openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("codeledger-queue", 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onupgradeneeded = (evt) => {
            const db = evt.target.result;
            if (!db.objectStoreNames.contains(QUEUE_STORE)) {
                const store = db.createObjectStore(QUEUE_STORE, {
                    keyPath: "id",
                });
                store.createIndex("statusIndex", "status", { unique: false });
                store.createIndex("problemIdIndex", "problemId", {
                    unique: false,
                });
            }
        };
    });
}

/**
 * Add a problem to the review queue.
 * @param {string} problemId - problem ID
 * @param {number} priority - lower = higher priority (0 = highest)
 * @returns {Promise<{id: string, status: string}>}
 */
export async function enqueueReview(problemId, priority = 100) {
    // Dedup: skip if already pending or processing for this problem
    const existing = await getPendingReviewsForProblem(problemId);
    if (existing.length > 0) {
        dbg.log(`enqueueReview: ${problemId} already queued — skipping duplicate`);
        return { id: existing[0].id, status: existing[0].status, skipped: true };
    }

    const id = `review-${problemId}-${Date.now()}`;
    const item = {
        id,
        problemId,
        status: STATUS.PENDING,
        priority,
        retryCount: 0,
        lastAttempt: null,
        error: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    try {
        const db = await _openDB();
        const tx = db.transaction([QUEUE_STORE], "readwrite");
        const store = tx.objectStore(QUEUE_STORE);
        store.add(item);
        db.close();
        dbg.log(`Enqueued review for ${problemId} (id=${id})`);
    } catch (e) {
        dbg.warn("Failed to enqueue review:", e?.message);
        throw e;
    }

    return { id, status: item.status };
}

/**
 * Cancel all pending (not yet processing) queue items.
 * Items currently processing are left to finish naturally.
 * @returns {Promise<number>} count of cancelled items
 */
export async function cancelPendingReviews() {
    try {
        const db = await _openDB();
        const tx = db.transaction([QUEUE_STORE], "readwrite");
        const store = tx.objectStore(QUEUE_STORE);
        return new Promise((resolve) => {
            const req = store.getAll();
            req.onsuccess = () => {
                const items = req.result || [];
                let cancelled = 0;
                for (const item of items) {
                    if (item.status === STATUS.PENDING) {
                        store.delete(item.id);
                        cancelled++;
                    }
                }
                db.close();
                dbg.log(`cancelPendingReviews: removed ${cancelled} pending item(s)`);
                resolve(cancelled);
            };
            req.onerror = () => { db.close(); resolve(0); };
        });
    } catch (e) {
        dbg.warn("cancelPendingReviews failed:", e?.message);
        return 0;
    }
}

/**
 * Get the next pending review item from the queue.
 * @returns {Promise<object|null>}
 */
export async function getNextPendingReview() {
    try {
        const db = await _openDB();
        const tx = db.transaction([QUEUE_STORE], "readonly");
        const store = tx.objectStore(QUEUE_STORE);
        const statusIdx = store.index("statusIndex");

        return new Promise((resolve) => {
            const req = statusIdx.getAll(STATUS.PENDING);
            req.onsuccess = () => {
                const items = req.result || [];
                const now = Date.now();
                // Skip items whose retry cooldown hasn't elapsed yet
                const ready = items.filter(
                    (i) => !i.nextRetryAt || i.nextRetryAt <= now
                );
                // Sort by priority (lower = higher priority), then by createdAt
                ready.sort((a, b) => {
                    if (a.priority !== b.priority)
                        return a.priority - b.priority;
                    return a.createdAt - b.createdAt;
                });
                db.close();
                const picked = ready[0] || null;
                if (picked)
                    dbg.log(
                        `getNextPendingReview: selected ${picked.id} for problem ${picked.problemId}`
                    );
                else
                    dbg.log(
                        `getNextPendingReview: no ready items (${items.length - ready.length} in backoff)`
                    );
                resolve(picked);
            };
            req.onerror = () => {
                db.close();
                resolve(null);
            };
        });
    } catch (e) {
        dbg.warn("Failed to get next pending review:", e?.message);
        return null;
    }
}

/**
 * Mark a queue item as processing.
 * @param {string} itemId
 * @returns {Promise<void>}
 */
export async function markProcessing(itemId) {
    dbg.log(`markProcessing: ${itemId}`);
    await _updateQueueItem(itemId, {
        status: STATUS.PROCESSING,
        updatedAt: Date.now(),
    });
}

/**
 * Mark a queue item as done.
 * @param {string} itemId
 * @returns {Promise<void>}
 */
export async function markDone(itemId) {
    dbg.log(`markDone: ${itemId}`);
    await _updateQueueItem(itemId, {
        status: STATUS.DONE,
        updatedAt: Date.now(),
    });
}

/**
 * Mark a queue item as failed and schedule retry with exponential backoff.
 * @param {string} itemId
 * @param {string} error - error message
 * @returns {Promise<boolean>} - true if retry scheduled, false if max retries exceeded
 */
export async function markFailedWithRetry(itemId, error) {
    try {
        const db = await _openDB();
        const tx = db.transaction([QUEUE_STORE], "readwrite");
        const store = tx.objectStore(QUEUE_STORE);

        return new Promise((resolve) => {
            const req = store.get(itemId);
            req.onsuccess = () => {
                const item = req.result;
                if (!item) {
                    db.close();
                    resolve(false);
                    return;
                }

                const nextRetryCount = (item.retryCount || 0) + 1;
                if (nextRetryCount > MAX_RETRIES) {
                    // Max retries exceeded — mark as failed permanently
                    const updateReq = store.put({
                        ...item,
                        status: STATUS.FAILED,
                        retryCount: nextRetryCount,
                        error: `Max retries (${MAX_RETRIES}) exceeded: ${error}`,
                        updatedAt: Date.now(),
                    });
                    updateReq.onsuccess = () => {
                        db.close();
                        dbg.warn(`Review ${itemId} max retries exceeded`);
                        resolve(false);
                    };
                    updateReq.onerror = () => {
                        db.close();
                        resolve(false);
                    };
                } else {
                    // Schedule retry with exponential backoff
                    const backoffMs = Math.min(
                        RETRY_BASE_DELAY_MS * Math.pow(2, nextRetryCount - 1),
                        RETRY_MAX_DELAY_MS
                    );
                    const updateReq = store.put({
                        ...item,
                        status: STATUS.PENDING,
                        retryCount: nextRetryCount,
                        error: `Retry ${nextRetryCount}/${MAX_RETRIES}: ${error}`,
                        lastAttempt: Date.now(),
                        nextRetryAt: Date.now() + backoffMs,
                        updatedAt: Date.now(),
                    });
                    updateReq.onsuccess = () => {
                        db.close();
                        dbg.log(
                            `Review ${itemId} scheduled retry ${nextRetryCount}/${MAX_RETRIES} after ${backoffMs}ms`
                        );
                        resolve(true);
                    };
                    updateReq.onerror = () => {
                        db.close();
                        resolve(false);
                    };
                }
            };
            req.onerror = () => {
                db.close();
                resolve(false);
            };
        });
    } catch (e) {
        dbg.warn("Failed to mark failed with retry:", e?.message);
        return false;
    }
}

/**
 * Get queue statistics (pending, processing, done, failed counts).
 * @returns {Promise<{pending: number, processing: number, done: number, failed: number, total: number}>}
 */
export async function getQueueStats() {
    try {
        const db = await _openDB();
        const tx = db.transaction([QUEUE_STORE], "readonly");
        const store = tx.objectStore(QUEUE_STORE);

        return new Promise((resolve) => {
            const req = store.getAll();
            req.onsuccess = () => {
                const items = req.result || [];
                const stats = {
                    pending: items.filter((i) => i.status === STATUS.PENDING)
                        .length,
                    processing: items.filter(
                        (i) => i.status === STATUS.PROCESSING
                    ).length,
                    done: items.filter((i) => i.status === STATUS.DONE).length,
                    failed: items.filter((i) => i.status === STATUS.FAILED)
                        .length,
                    total: items.length,
                };
                db.close();
                resolve(stats);
            };
            req.onerror = () => {
                db.close();
                resolve({
                    pending: 0,
                    processing: 0,
                    done: 0,
                    failed: 0,
                    total: 0,
                });
            };
        });
    } catch (e) {
        dbg.warn("Failed to get queue stats:", e?.message);
        return { pending: 0, processing: 0, done: 0, failed: 0, total: 0 };
    }
}

/**
 * Get all pending reviews for a given problem.
 * @param {string} problemId
 * @returns {Promise<object[]>}
 */
export async function getPendingReviewsForProblem(problemId) {
    try {
        const db = await _openDB();
        const tx = db.transaction([QUEUE_STORE], "readonly");
        const store = tx.objectStore(QUEUE_STORE);
        const problemIdx = store.index("problemIdIndex");

        return new Promise((resolve) => {
            const req = problemIdx.getAll(problemId);
            req.onsuccess = () => {
                const items = req.result || [];
                const pending = items.filter((i) =>
                    [STATUS.PENDING, STATUS.PROCESSING].includes(i.status)
                );
                db.close();
                resolve(pending);
            };
            req.onerror = () => {
                db.close();
                resolve([]);
            };
        });
    } catch (e) {
        dbg.warn("Failed to get pending reviews for problem:", e?.message);
        return [];
    }
}

/**
 * Clear all done/failed items from the queue (cleanup).
 * @returns {Promise<number>} - number of items cleared
 */
export async function clearCompletedReviews() {
    try {
        const db = await _openDB();
        const tx = db.transaction([QUEUE_STORE], "readwrite");
        const store = tx.objectStore(QUEUE_STORE);

        return new Promise((resolve) => {
            const req = store.getAll();
            req.onsuccess = () => {
                const items = req.result || [];
                let cleared = 0;
                for (const item of items) {
                    if ([STATUS.DONE, STATUS.FAILED].includes(item.status)) {
                        store.delete(item.id);
                        cleared++;
                    }
                }
                db.close();
                dbg.log(`Cleared ${cleared} completed reviews`);
                resolve(cleared);
            };
            req.onerror = () => {
                db.close();
                resolve(0);
            };
        });
    } catch (e) {
        dbg.warn("Failed to clear completed reviews:", e?.message);
        return 0;
    }
}

/**
 * Export queue state (for debugging/export).
 * @returns {Promise<object[]>}
 */
export async function exportQueueState() {
    try {
        const db = await _openDB();
        const tx = db.transaction([QUEUE_STORE], "readonly");
        const store = tx.objectStore(QUEUE_STORE);

        return new Promise((resolve) => {
            const req = store.getAll();
            req.onsuccess = () => {
                const items = req.result || [];
                db.close();
                resolve(items);
            };
            req.onerror = () => {
                db.close();
                resolve([]);
            };
        });
    } catch (e) {
        dbg.warn("Failed to export queue state:", e?.message);
        return [];
    }
}

/**
 * Internal: Update a queue item.
 * @param {string} itemId
 * @param {object} updates - fields to update
 * @returns {Promise<void>}
 */
async function _updateQueueItem(itemId, updates) {
    try {
        const db = await _openDB();
        const tx = db.transaction([QUEUE_STORE], "readwrite");
        const store = tx.objectStore(QUEUE_STORE);

        return new Promise((resolve) => {
            const req = store.get(itemId);
            req.onsuccess = () => {
                const item = req.result;
                if (!item) {
                    db.close();
                    resolve();
                    return;
                }
                const updated = { ...item, ...updates };
                const putReq = store.put(updated);
                putReq.onsuccess = () => {
                    db.close();
                    resolve();
                };
                putReq.onerror = () => {
                    db.close();
                    resolve();
                };
            };
            req.onerror = () => {
                db.close();
                resolve();
            };
        });
    } catch (e) {
        dbg.warn("Failed to update queue item:", e?.message);
    }
}

export const RATE_LIMIT_DELAY_MS_EXPORT = RATE_LIMIT_DELAY_MS;
