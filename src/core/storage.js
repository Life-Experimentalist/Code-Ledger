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

  async getTheme() {
    const res = await browserStorage.local.get(CONSTANTS.SK.THEME);
    return res[CONSTANTS.SK.THEME] || null;
  },

  async setTheme(theme) {
    await browserStorage.local.set({ [CONSTANTS.SK.THEME]: theme });
  },

  async getBehaviorBank() {
    const res = await browserStorage.local.get(CONSTANTS.SK.BEHAVIOR_BANK);
    return res[CONSTANTS.SK.BEHAVIOR_BANK] || {};
  },

  async setBehaviorBank(data) {
    await browserStorage.local.set({ [CONSTANTS.SK.BEHAVIOR_BANK]: data });
  },

  async updateBehaviorRecord(slug, delta) {
    const bank = await this.getBehaviorBank();
    const existing = bank[slug] || {};
    bank[slug] = { ...existing, ...delta };
    await this.setBehaviorBank(bank);
  },

  // ── Backup store: { manual: [], scheduled: [], rolling: null } ──────────

  async _getBackupStore() {
    const res = await browserStorage.local.get(CONSTANTS.SK.ROLLING_BACKUPS);
    const raw = res[CONSTANTS.SK.ROLLING_BACKUPS] || {};
    // Migrate old array format (pre-3-type) → manual list
    if (Array.isArray(raw)) return { manual: raw.slice(0, 10), scheduled: [], rolling: null };
    return { manual: raw.manual || [], scheduled: raw.scheduled || [], rolling: raw.rolling || null };
  },

  async _saveBackupStore(store) {
    await browserStorage.local.set({ [CONSTANTS.SK.ROLLING_BACKUPS]: store });
  },

  // Manual backups (up to 10, full CRUD)
  async getManualBackups() { return (await this._getBackupStore()).manual; },

  async addManualBackup(payload, name = "") {
    const store = await this._getBackupStore();
    store.manual.unshift({ id: `m-${Date.now()}`, ts: Date.now(), name, data: payload });
    store.manual = store.manual.slice(0, 10);
    await this._saveBackupStore(store);
    return store.manual[0];
  },

  async deleteManualBackup(id) {
    const store = await this._getBackupStore();
    store.manual = store.manual.filter((b) => b.id !== id);
    await this._saveBackupStore(store);
  },

  // Scheduled backups (event-driven triggers: on-solve, on-export)
  async getScheduledBackups() { return (await this._getBackupStore()).scheduled; },

  async addScheduledBackup(payload, trigger = "manual") {
    const store = await this._getBackupStore();
    store.scheduled.unshift({ id: `s-${Date.now()}`, ts: Date.now(), trigger, data: payload });
    store.scheduled = store.scheduled.slice(0, 5);
    await this._saveBackupStore(store);
  },

  async deleteScheduledBackup(id) {
    const store = await this._getBackupStore();
    store.scheduled = store.scheduled.filter((b) => b.id !== id);
    await this._saveBackupStore(store);
  },

  // Rolling backup: single always-current snapshot
  async getRollingBackup() { return (await this._getBackupStore()).rolling; },

  async updateRollingBackup(payload) {
    const store = await this._getBackupStore();
    store.rolling = { ts: Date.now(), data: payload };
    await this._saveBackupStore(store);
  },

  // Legacy compat (used by PanelBackups before redesign)
  async getRollingBackups() { return await this.getManualBackups(); },
  async addRollingBackup(payload) { await this.addManualBackup(payload); },

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

  async deleteProblem(id) {
    const store = await this.queryDB(CONSTANTS.IDB_STORES.PROBLEMS, "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
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

  async getCommittedSubmissions() {
    const key = "cl.committed.submissions";
    const res = await browserStorage.local.get(key);
    return res[key] || {};
  },

  async markSubmissionCommitted(commitKey) {
    const key = "cl.committed.submissions";
    const map = await this.getCommittedSubmissions();
    map[String(commitKey || "")] = Date.now();
    await browserStorage.local.set({ [key]: map });
  },

  async isSubmissionCommitted(commitKey) {
    const map = await this.getCommittedSubmissions();
    return !!map[String(commitKey || "")];
  },

  async getPendingProblemKeys() {
    const key = "cl.pending.problemkeys";
    const res = await browserStorage.local.get(key);
    return res[key] || {};
  },

  async markPendingProblemKey(problemCommitKey) {
    const key = "cl.pending.problemkeys";
    const map = await this.getPendingProblemKeys();
    const commitKey = String(problemCommitKey || "").trim();
    if (!commitKey) return;
    map[commitKey] = Date.now();
    await browserStorage.local.set({ [key]: map });
  },

  async markPendingProblemKeys(problemCommitKeys = []) {
    const key = "cl.pending.problemkeys";
    const map = await this.getPendingProblemKeys();
    const now = Date.now();
    for (const raw of problemCommitKeys) {
      const commitKey = String(raw || "").trim();
      if (commitKey) map[commitKey] = now;
    }
    await browserStorage.local.set({ [key]: map });
  },

  async clearPendingProblemKeys(problemCommitKeys = []) {
    const key = "cl.pending.problemkeys";
    const map = await this.getPendingProblemKeys();
    for (const raw of problemCommitKeys || []) {
      const commitKey = String(raw || "").trim();
      if (!commitKey) continue;
      delete map[commitKey];
    }
    await browserStorage.local.set({ [key]: map });
  },

  async markRenameNeeded(id, { oldBase, newBase }) {
    const all = await this._getRenames();
    const filtered = all.filter(r => r.id !== id);
    filtered.push({ id, oldBase, newBase, ts: Date.now() });
    await browserStorage.local.set({ "cl.renames": JSON.stringify(filtered) });
  },

  async getPendingRenames() {
    return this._getRenames();
  },

  async clearPendingRenames() {
    await browserStorage.local.set({ "cl.renames": "[]" });
  },

  async _getRenames() {
    const raw = await browserStorage.local.get("cl.renames");
    try { return JSON.parse(raw["cl.renames"] || "[]"); } catch { return []; }
  },
};
