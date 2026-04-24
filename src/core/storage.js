/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { storage as browserStorage } from '../lib/browser-compat.js';
import { CONSTANTS } from './constants.js';
import { createDebugger } from '../lib/debug.js';
const dbg = createDebugger('Storage');

/**
 * Unified storage abstraction.
 */
export const Storage = {
  /**
   * Gets settings with defaults applied.
   */
  async getSettings() {
    const { [CONSTANTS.SK.SETTINGS]: settings } = await browserStorage.local.get(CONSTANTS.SK.SETTINGS);
    return settings || {};
  },

  async setSettings(settings) {
    await browserStorage.local.set({ [CONSTANTS.SK.SETTINGS]: settings });
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

  /**
   * IndexedDB access for large data (problems, history).
   */
  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CONSTANTS.IDB_NAME, CONSTANTS.IDB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        Object.values(CONSTANTS.IDB_STORES).forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id' });
          }
        });
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async queryDB(storeName, mode = 'readonly') {
    const db = await this.initDB();
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  },

  async saveProblem(problem) {
    const store = await this.queryDB(CONSTANTS.IDB_STORES.PROBLEMS, 'readwrite');
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
  }
};
