/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { storage as browserStorage } from "../lib/browser-compat.js";
import { CONSTANTS } from "./constants.js";
import { createDebugger } from "../lib/debug.js";
import { normalizeAIPrompts } from "./ai-prompts.js";
const dbg = createDebugger("Storage");

/**
 * Unified storage abstraction.
 */
export const Storage = {
  /**
   * Gets settings with defaults applied.
   */
  async getSettings() {
    const { [CONSTANTS.SK.SETTINGS]: settings } =
      await browserStorage.local.get(CONSTANTS.SK.SETTINGS);
    const s = settings || {};
    // Migration: if legacy primaryModel/secondaryModel were used to store provider ids,
    // copy them to new keys `aiProvider` / `aiSecondary` when appropriate.
    try {
      const providerIds = Object.keys(CONSTANTS.AI_PROVIDERS || {});
      if (
        !s.aiProvider &&
        s.primaryModel &&
        providerIds.includes(s.primaryModel)
      ) {
        s.aiProvider = s.primaryModel;
      }
      if (
        !s.aiSecondary &&
        s.secondaryModel &&
        providerIds.includes(s.secondaryModel)
      ) {
        s.aiSecondary = s.secondaryModel;
      }
    } catch (e) {
      // ignore migration errors
    }

    return s;
  },

  async setSettings(settings) {
    await browserStorage.local.set({ [CONSTANTS.SK.SETTINGS]: settings });
  },

  // AI key helpers: store a mapping { providerId: [keys...] }
  async getAIKeys() {
    const res = await browserStorage.local.get(CONSTANTS.SK.AI_KEYS);
    const all = res[CONSTANTS.SK.AI_KEYS] || {};
    return all;
  },

  async setAIKeys(map) {
    // map: { providerId: [key1,key2] }
    const payload = { [CONSTANTS.SK.AI_KEYS]: map };
    await browserStorage.local.set(payload);
  },

  async getAIPrompts() {
    const res = await browserStorage.local.get(CONSTANTS.SK.AI_PROMPTS);
    return normalizeAIPrompts(res[CONSTANTS.SK.AI_PROMPTS] || {});
  },

  async setAIPrompts(prompts) {
    const normalized = normalizeAIPrompts(prompts || {});
    await browserStorage.local.set({ [CONSTANTS.SK.AI_PROMPTS]: normalized });
  },

  async getAuthToken(provider) {
    const keys = await browserStorage.local.get(CONSTANTS.SK.AUTH_TOKENS);
    const tokens = keys[CONSTANTS.SK.AUTH_TOKENS] || {};
    return tokens[provider];
  },

  async setAuthToken(provider, token) {
    const keys = await browserStorage.local.get(CONSTANTS.SK.AUTH_TOKENS);
    const tokens = keys[CONSTANTS.SK.AUTH_TOKENS] || {};
    tokens[provider] = token;
    await browserStorage.local.set({ [CONSTANTS.SK.AUTH_TOKENS]: tokens });
  },

  async setDebugEnabled(enabled) {
    await browserStorage.local.set({ [CONSTANTS.SK.DEBUG]: !!enabled });
  },

  async clearAuthToken(provider) {
    const keys = await browserStorage.local.get(CONSTANTS.SK.AUTH_TOKENS);
    const tokens = keys[CONSTANTS.SK.AUTH_TOKENS] || {};
    delete tokens[provider];
    await browserStorage.local.set({ [CONSTANTS.SK.AUTH_TOKENS]: tokens });
  },

  /**
   * IndexedDB access for large data (problems, history).
   */
  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CONSTANTS.IDB_NAME, CONSTANTS.IDB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        Object.values(CONSTANTS.IDB_STORES).forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: "id" });
          }
        });
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async queryDB(storeName, mode = "readonly") {
    const db = await this.initDB();
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  },

  async saveProblem(problem) {
    const store = await this.queryDB(
      CONSTANTS.IDB_STORES.PROBLEMS,
      "readwrite",
    );
    return new Promise((resolve, reject) => {
      const request = store.put(problem);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getProblem(id) {
    const store = await this.queryDB(CONSTANTS.IDB_STORES.PROBLEMS);
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async getAllProblems() {
    const store = await this.queryDB(CONSTANTS.IDB_STORES.PROBLEMS);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // ── First-commit tracking ──────────────────────────────────────────────
  // Stores which (titleSlug, langName) pairs have been auto-committed so the
  // extension never double-pushes the same problem+language combination.
  async getCommittedSlugLangs() {
    const key = "cl.committed.sluglangs";
    const res = await browserStorage.local.get(key);
    return res[key] || {};
  },

  async markSlugLangCommitted(titleSlug, langName) {
    const key = "cl.committed.sluglangs";
    const map = await this.getCommittedSlugLangs();
    map[`${titleSlug}::${String(langName || "").toLowerCase()}`] = Date.now();
    await browserStorage.local.set({ [key]: map });
  },

  async isSlugLangCommitted(titleSlug, langName) {
    const map = await this.getCommittedSlugLangs();
    return !!map[`${titleSlug}::${String(langName || "").toLowerCase()}`];
  },
};
