/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Knowledge Bank — persistent AI memory store.
 * Stores user insights, preferences, roadmaps, and notes.
 * Persisted in IndexedDB locally and synced to .codeledger/knowledge.json in the repo.
 */

import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("KnowledgeBank");
const DB_NAME = "CodeLedger";
const STORE = "knowledge-bank";

// ── DB helpers ────────────────────────────────────────────────────────────────

function _openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 2);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onupgradeneeded = (evt) => {
            const db = evt.target.result;
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: "id" });
                store.createIndex("topicIdx", "topic", { unique: false });
                store.createIndex("typeIdx", "type", { unique: false });
            }
        };
    });
}

async function _tx(mode, fn) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE], mode);
        const store = tx.objectStore(STORE);
        const result = fn(store);
        if (result && typeof result.then === "function") {
            result.then(resolve).catch(reject);
        } else {
            tx.oncomplete = () => { db.close(); resolve(result); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        }
    });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save an insight or note to the knowledge bank.
 * @param {object} entry - { topic, content, tags?, type? }
 * @returns {Promise<string>} id of created entry
 */
export async function saveInsight({ topic, content, tags = [], type = "insight" }) {
    const id = `kb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const item = {
        id,
        topic: String(topic || "general").trim().toLowerCase(),
        content: String(content || "").trim(),
        tags: Array.isArray(tags) ? tags : [],
        type,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    const db = await _openDB();
    await new Promise((res, rej) => {
        const tx = db.transaction([STORE], "readwrite");
        const req = tx.objectStore(STORE).add(item);
        tx.oncomplete = () => { db.close(); res(); };
        tx.onerror = () => { db.close(); rej(tx.error); };
        req.onerror = () => rej(req.error);
    });
    dbg.log(`saveInsight: saved ${id} topic=${item.topic}`);
    return id;
}

/**
 * Get insights, optionally filtered by topic.
 * @param {string} [topic]
 * @param {number} [limit]
 * @returns {Promise<object[]>}
 */
export async function getInsights(topic = null, limit = 50) {
    const db = await _openDB();
    return new Promise((resolve) => {
        const tx = db.transaction([STORE], "readonly");
        const store = tx.objectStore(STORE);
        let req;
        if (topic) {
            req = store.index("topicIdx").getAll(String(topic).trim().toLowerCase());
        } else {
            req = store.getAll();
        }
        req.onsuccess = () => {
            const items = (req.result || []).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
            db.close();
            resolve(items);
        };
        req.onerror = () => { db.close(); resolve([]); };
    });
}

/**
 * Delete an insight by id.
 * @param {string} id
 */
export async function deleteInsight(id) {
    const db = await _openDB();
    await new Promise((res, rej) => {
        const tx = db.transaction([STORE], "readwrite");
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => { db.close(); res(); };
        tx.onerror = () => { db.close(); rej(tx.error); };
    });
    dbg.log(`deleteInsight: deleted ${id}`);
}

/**
 * Get all entries (for GitHub sync).
 * @returns {Promise<object[]>}
 */
export async function getAllInsights() {
    const db = await _openDB();
    return new Promise((resolve) => {
        const tx = db.transaction([STORE], "readonly");
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => { db.close(); resolve(req.result || []); };
        req.onerror = () => { db.close(); resolve([]); };
    });
}

/**
 * Replace all local insights from a remote snapshot (used on repo import).
 * @param {object[]} items
 */
export async function importInsights(items) {
    if (!Array.isArray(items) || !items.length) return;
    const db = await _openDB();
    await new Promise((res, rej) => {
        const tx = db.transaction([STORE], "readwrite");
        const store = tx.objectStore(STORE);
        items.forEach(item => store.put(item));
        tx.oncomplete = () => { db.close(); res(); };
        tx.onerror = () => { db.close(); rej(tx.error); };
    });
    dbg.log(`importInsights: imported ${items.length} entries`);
}

/**
 * Build the JSON blob for .codeledger/knowledge.json.
 * @returns {Promise<string>}
 */
export async function buildKnowledgeJson() {
    const items = await getAllInsights();
    return JSON.stringify({ updatedAt: new Date().toISOString(), entries: items }, null, 2);
}

/**
 * Build a compact context string for inclusion in AI system prompts.
 * Returns top N recent insights summarised by topic.
 * @param {number} [limit=20]
 * @returns {Promise<string>}
 */
export async function buildKnowledgeContext(limit = 20) {
    const items = await getInsights(null, limit);
    if (!items.length) return "";
    const byTopic = {};
    items.forEach(item => {
        const t = item.topic || "general";
        (byTopic[t] = byTopic[t] || []).push(item.content);
    });
    const parts = Object.entries(byTopic).map(([topic, contents]) =>
        `[${topic}] ${contents.slice(0, 3).join(" | ")}`
    );
    return "User knowledge bank:\n" + parts.join("\n");
}
