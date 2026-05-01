/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Storage } from "./storage.js";

/**
 * AI Chat storage — IndexedDB abstraction for storing conversations.
 * Indexed by problem slug and date for efficient retrieval.
 */

const DB_NAME = "CodeLedger_AIChats";
const STORE_NAME = "chats";
let db = null;

/** Initialize IndexedDB with proper schema */
async function initDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }
        const request = indexedDB.open(DB_NAME, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        request.onupgradeneeded = (e) => {
            const newDB = e.target.result;
            if (!newDB.objectStoreNames.contains(STORE_NAME)) {
                const store = newDB.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
                store.createIndex("problemSlug", "problemSlug", { unique: false });
                store.createIndex("createdAt", "createdAt", { unique: false });
                store.createIndex("updatedAt", "updatedAt", { unique: false });
            }
        };
    });
}

/**
 * Save or create a new AI chat conversation
 * @param {string} problemSlug - The problem's titleSlug (e.g., "two-sum")
 * @param {string} problemURL - Full URL of the problem page
 * @param {Array} messages - Array of { role, content, timestamp }
 * @param {string} platform - Platform name (e.g., "leetcode", "geeksforgeeks")
 * @returns {Promise<number>} - The chat ID
 */
export async function saveAIChat(problemSlug, problemURL, messages, platform = "leetcode") {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const chat = {
            problemSlug,
            problemURL,
            platform,
            messages: messages || [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        const request = store.add(chat);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

/**
 * Update an existing chat with new messages
 * @param {number} chatId - The chat ID
 * @param {Array} messages - New messages array
 */
export async function updateAIChat(chatId, messages) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(chatId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const chat = request.result;
            if (!chat) {
                reject(new Error("Chat not found"));
                return;
            }
            chat.messages = messages;
            chat.updatedAt = Date.now();
            const updateRequest = store.put(chat);
            updateRequest.onerror = () => reject(updateRequest.error);
            updateRequest.onsuccess = () => resolve(chat);
        };
    });
}

/**
 * Get all chats for a specific problem (grouped by slug)
 * @param {string} problemSlug
 * @returns {Promise<Array>}
 */
export async function getChatsByProblem(problemSlug) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], "readonly");
        const store = tx.objectStore(STORE_NAME);
        const index = store.index("problemSlug");
        const request = index.getAll(problemSlug);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            // Sort by descending date (most recent first)
            resolve(request.result.sort((a, b) => b.createdAt - a.createdAt));
        };
    });
}

/**
 * Get all chats within a date range
 * @param {number} startTime - Unix milliseconds
 * @param {number} endTime - Unix milliseconds
 * @returns {Promise<Array>}
 */
export async function getChatsByDateRange(startTime, endTime) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], "readonly");
        const store = tx.objectStore(STORE_NAME);
        const index = store.index("createdAt");
        const range = IDBKeyRange.bound(startTime, endTime);
        const request = index.getAll(range);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            resolve(request.result.sort((a, b) => b.createdAt - a.createdAt));
        };
    });
}

/**
 * Get all chats (for search, etc.)
 * @returns {Promise<Array>}
 */
export async function getAllChats() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            resolve(request.result.sort((a, b) => b.createdAt - a.createdAt));
        };
    });
}

/**
 * Search chats by content or problem URL
 * @param {string} query
 * @returns {Promise<Array>}
 */
export async function searchChats(query) {
    const allChats = await getAllChats();
    const lowerQuery = query.toLowerCase();
    return allChats.filter((chat) => {
        const matchesURL = chat.problemURL.toLowerCase().includes(lowerQuery);
        const matchesSlug = chat.problemSlug.toLowerCase().includes(lowerQuery);
        const matchesMessage = chat.messages.some((m) => m.content.toLowerCase().includes(lowerQuery));
        return matchesURL || matchesSlug || matchesMessage;
    });
}

/**
 * Get a single chat by ID
 * @param {number} chatId
 * @returns {Promise<Object>}
 */
export async function getChat(chatId) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(chatId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

/**
 * Delete a chat
 * @param {number} chatId
 */
export async function deleteChat(chatId) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(chatId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

/**
 * Add a message to a chat (helper for appending single messages)
 * @param {number} chatId
 * @param {object} message - { role, content, timestamp }
 */
export async function addMessageToChat(chatId, message) {
    const chat = await getChat(chatId);
    if (!chat) throw new Error("Chat not found");
    chat.messages.push({
        ...message,
        timestamp: message.timestamp || Date.now(),
    });
    return updateAIChat(chatId, chat.messages);
}

/** Export schema for reference */
export const CHAT_SCHEMA = {
    id: "number (auto-increment)",
    problemSlug: "string",
    problemURL: "string",
    platform: "string",
    messages: [
        {
            role: "string (user | assistant | system)",
            content: "string",
            timestamp: "number",
        },
    ],
    createdAt: "number",
    updatedAt: "number",
};
