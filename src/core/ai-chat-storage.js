/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Storage } from "./storage.js";
import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("AIChatStorage");

/**
 * AI Chat storage — IndexedDB abstraction for storing conversations.
 * Indexed by problem slug and date for efficient retrieval.
 */

const DB_NAME = "CodeLedger_AIChats";
const STORE_NAME = "chats";
let db = null;

/** Initialize IndexedDB with proper schema */
async function initDB() {
  dbg.log(`initDB(): initializing AI chat database`);
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
        const store = newDB.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("problemSlug", "problemSlug", {
          unique: false,
        });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
  });
}

function normalizeChatRecord(record = {}) {
  return {
    problemSlug: record.problemSlug || "",
    problemURL: record.problemURL || "",
    platform: record.platform || "leetcode",
    messages: Array.isArray(record.messages) ? record.messages : [],
    problemTitle: record.problemTitle || "",
    problemTags: Array.isArray(record.problemTags) ? record.problemTags : [],
    attachedProblemSlugs: Array.isArray(record.attachedProblemSlugs)
      ? record.attachedProblemSlugs
      : [],
    attachedProblems: Array.isArray(record.attachedProblems) ? record.attachedProblems : [],
    surface: record.surface || "problem-modal",
    requestType: record.requestType || "",
    usedCommands: Array.isArray(record.usedCommands) ? record.usedCommands : [],
    requestTemplate: record.requestTemplate || "",
    summary: record.summary || "",
    createdAt: record.createdAt || Date.now(),
    updatedAt: record.updatedAt || Date.now(),
  };
}

/**
 * Save or create a new AI chat conversation.
 * The optional `meta` object lets callers centralize chats across the modal,
 * floating panel, and library view without duplicating storage logic.
 */
export async function saveAIChat(
  problemSlug,
  problemURL,
  messages,
  platform = "leetcode",
  meta = {},
) {
  dbg.log(`saveAIChat(): ${platform} problem ${problemSlug} (${(messages || []).length} messages)`);
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const chat = normalizeChatRecord({
      problemSlug,
      problemURL,
      platform,
      messages: messages || [],
      ...meta,
    });
    chat._pendingSync = true;
    const request = store.add(chat);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbg.log(`saveAIChat(): ✓ saved chat ${request.result}`);
      resolve(request.result);
    };
  });
}

/**
 * Update an existing chat with new messages
 * @param {number} chatId - The chat ID
 * @param {Array} messages - New messages array
 */
export async function updateAIChat(chatId, messages, meta = {}) {
  dbg.log(`updateAIChat(): ${chatId} (${(messages || []).length} messages)`);
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
      chat._pendingSync = true;
      Object.assign(chat, meta);
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
  dbg.log(`getChatsByProblem(): ${problemSlug}`);
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("problemSlug");
    const request = index.getAll(problemSlug);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const primary = request.result || [];
      const attached = [];
      const slug = String(problemSlug || "").toLowerCase();
      (primary || []).forEach((chat) => attached.push(chat));

      const scanRequest = store.getAll();
      scanRequest.onsuccess = () => {
        const all = scanRequest.result || [];
        all.forEach((chat) => {
          const attachments = Array.isArray(chat.attachedProblemSlugs)
            ? chat.attachedProblemSlugs
            : [];
          if (attachments.some((item) => String(item || "").toLowerCase() === slug)) {
            if (!attached.some((item) => item.id === chat.id)) attached.push(chat);
          }
        });
        resolve(attached.sort((a, b) => b.createdAt - a.createdAt));
      };
      scanRequest.onerror = () =>
        resolve((primary || []).sort((a, b) => b.createdAt - a.createdAt));
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
  dbg.log(`getAllChats(): retrieving all chats`);
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve((request.result || []).sort((a, b) => b.createdAt - a.createdAt));
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
    const matchesURL = String(chat.problemURL || "")
      .toLowerCase()
      .includes(lowerQuery);
    const matchesSlug = String(chat.problemSlug || "")
      .toLowerCase()
      .includes(lowerQuery);
    const matchesTitle = String(chat.problemTitle || "")
      .toLowerCase()
      .includes(lowerQuery);
    const matchesTag = (chat.problemTags || []).some((tag) =>
      String(tag || "")
        .toLowerCase()
        .includes(lowerQuery),
    );
    const matchesAttachment = (chat.attachedProblemSlugs || []).some((slug) =>
      String(slug || "")
        .toLowerCase()
        .includes(lowerQuery),
    );
    const matchesMessage = (chat.messages || []).some((m) =>
      String(m.content || "")
        .toLowerCase()
        .includes(lowerQuery),
    );
    const matchesSurface = String(chat.surface || "")
      .toLowerCase()
      .includes(lowerQuery);
    const matchesRequestType = String(chat.requestType || "")
      .toLowerCase()
      .includes(lowerQuery);
    const matchesTemplate = String(chat.requestTemplate || "")
      .toLowerCase()
      .includes(lowerQuery);
    const matchesCommands = (chat.usedCommands || []).some((command) =>
      String(command || "")
        .toLowerCase()
        .includes(lowerQuery),
    );
    return (
      matchesURL ||
      matchesSlug ||
      matchesTitle ||
      matchesTag ||
      matchesAttachment ||
      matchesMessage ||
      matchesSurface ||
      matchesRequestType ||
      matchesTemplate ||
      matchesCommands
    );
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
  dbg.log(`deleteChat(): ${chatId}`);
  const db = await initDB();
  // Capture the github path before deleting so the sync can remove it from the repo
  const existing = await getChat(chatId).catch(() => null);
  if (existing?._githubPath) {
    await _addDeletedChatPath(existing._githubPath);
  }
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

// ── Sync support ──────────────────────────────────────────────────────────────

const DELETED_PATHS_KEY = "_deletedChatPaths";

async function _addDeletedChatPath(path) {
  await Storage.updateSettings((settings) => {
    const existing = Array.isArray(settings[DELETED_PATHS_KEY]) ? settings[DELETED_PATHS_KEY] : [];
    if (existing.includes(path)) return null;
    return { [DELETED_PATHS_KEY]: [...existing, path] };
  });
}

export async function getDeletedChatPaths() {
  const settings = await Storage.getSettings();
  return Array.isArray(settings[DELETED_PATHS_KEY]) ? settings[DELETED_PATHS_KEY] : [];
}

export async function clearDeletedChatPaths() {
  await Storage.updateSettings({ [DELETED_PATHS_KEY]: [] });
}

export async function getPendingSyncChats() {
  const db = await initDB();
  return new Promise((resolve) => {
    const tx = db.transaction([STORE_NAME], "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result || []).filter((c) => c._pendingSync === true));
    req.onerror = () => resolve([]);
  });
}

export async function markChatSynced(chatId, githubPath) {
  const db = await initDB();
  return new Promise((resolve) => {
    const tx = db.transaction([STORE_NAME], "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(chatId);
    req.onsuccess = () => {
      const chat = req.result;
      if (!chat) {
        resolve();
        return;
      }
      chat._pendingSync = false;
      chat._githubPath = githubPath;
      store.put(chat);
      tx.oncomplete = () => resolve();
    };
    req.onerror = () => resolve();
  });
}

export async function importChatsLocal(items) {
  if (!Array.isArray(items) || !items.length) return;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], "readwrite");
    const store = tx.objectStore(STORE_NAME);
    items.forEach((item) =>
      store.add({
        ...normalizeChatRecord(item),
        _githubPath: item._githubPath,
        _pendingSync: false,
      }),
    );
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Export schema for reference */
export const CHAT_SCHEMA = {
  id: "number (auto-increment)",
  problemSlug: "string",
  problemURL: "string",
  platform: "string",
  problemTitle: "string",
  problemTags: ["string"],
  attachedProblemSlugs: ["string"],
  attachedProblems: ["{ slug, title, platform, url }"],
  surface: "string",
  requestType: "string",
  usedCommands: ["string"],
  requestTemplate: "string",
  messages: [
    {
      role: "string (user | assistant | system)",
      content: "string",
      timestamp: "number",
    },
  ],
  createdAt: "number",
  updatedAt: "number",
  summary: "string",
};
