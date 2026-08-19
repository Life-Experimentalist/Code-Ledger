/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { storage as browserStorage } from "../lib/browser-compat.js";
import { CONSTANTS } from "./constants.js";
import { createDebugger } from "../lib/debug.js";
import { normalizeAIPrompts } from "./ai-prompts.js";
import { normalizeTag } from "./topic-resolver.js";
import { canonicalMapper } from "./canonical-mapper.js";
import { withLock } from "./async-lock.js";
const dbg = createDebugger("Storage");

/** One name, so every settings writer in every context queues behind the rest. */
const SETTINGS_LOCK = "codeledger:settings";

/**
 * Unified storage abstraction.
 */
export const Storage = {
  /**
   * Gets settings with defaults applied.
   */
  async getSettings() {
    const { [CONSTANTS.SK.SETTINGS]: settings } = await browserStorage.local.get(
      CONSTANTS.SK.SETTINGS,
    );
    const s = settings || {};
    dbg.log(`getSettings(): loaded settings with ${Object.keys(s).length} keys`);
    // Migration: if legacy primaryModel/secondaryModel were used to store provider ids,
    // copy them to new keys `aiProvider` / `aiSecondary` when appropriate.
    try {
      const providerIds = Object.keys(CONSTANTS.AI_PROVIDERS || {});
      if (!s.aiProvider && s.primaryModel && providerIds.includes(s.primaryModel)) {
        s.aiProvider = s.primaryModel;
      }
      if (!s.aiSecondary && s.secondaryModel && providerIds.includes(s.secondaryModel)) {
        s.aiSecondary = s.secondaryModel;
      }
    } catch (e) {
      // ignore migration errors
    }

    return s;
  },

  /**
   * Replace the entire settings object.
   *
   * Whole-object writes are only correct when the caller has just read the
   * settings and is writing back everything it read. Anything narrower loses
   * the keys it left out — silently, and permanently. Use `updateSettings`
   * unless you genuinely mean "these are now all the settings there are".
   *
   * @param {Record<string, any>} settings
   */
  async setSettings(settings) {
    dbg.log(`setSettings(): saving ${Object.keys(settings || {}).length} settings keys`);
    return withLock(SETTINGS_LOCK, async () => {
      const s = { ...(settings || {}), __updatedAt: new Date().toISOString() };
      await browserStorage.local.set({ [CONSTANTS.SK.SETTINGS]: s });
      return s;
    });
  },

  /**
   * Merge a patch into the stored settings, atomically with respect to every
   * other context.
   *
   * The read and the write happen inside one lock, so two pages changing two
   * different settings at the same moment both survive. The old shape —
   * `setSettings({ ...await getSettings(), key: value })` — reads outside any
   * lock, and whichever page wrote second erased the other's edit.
   *
   * Pass a function to decide the patch from the current values, for cases like
   * appending to a list where the starting point matters. Return a falsy value
   * from it to write nothing at all.
   *
   * A key set to `undefined` is removed rather than stored, which is how an
   * unlink drops `github_repo` without having to rewrite the whole object.
   *
   * @param {Record<string, any> | ((current: Record<string, any>) => Record<string, any> | Promise<Record<string, any>>)} patch
   * @returns {Promise<Record<string, any>>} the settings as they now stand
   */
  async updateSettings(patch) {
    return withLock(SETTINGS_LOCK, async () => {
      const current = await this.getSettings();
      const delta = typeof patch === "function" ? await patch(current) : patch;
      if (!delta || typeof delta !== "object") return current;
      const next = { ...current, ...delta, __updatedAt: new Date().toISOString() };
      for (const [k, v] of Object.entries(delta)) {
        if (v === undefined) delete next[k];
      }
      dbg.log(`updateSettings(): merged ${Object.keys(delta).length} key(s)`);
      await browserStorage.local.set({ [CONSTANTS.SK.SETTINGS]: next });
      return next;
    });
  },

  // AI key helpers: store a mapping { providerId: [keys...] }
  async getAIKeys() {
    const res = await browserStorage.local.get(CONSTANTS.SK.AI_KEYS);
    const all = res[CONSTANTS.SK.AI_KEYS] || {};
    dbg.log(`getAIKeys(): found keys for ${Object.keys(all).length} provider(s)`);
    return all;
  },

  async setAIKeys(map) {
    // map: { providerId: [key1,key2] }
    const payload = { [CONSTANTS.SK.AI_KEYS]: map };
    const totalKeys = Object.values(map || {}).reduce(
      (sum, keys) => sum + (Array.isArray(keys) ? keys.length : 0),
      0,
    );
    dbg.log(
      `setAIKeys(): saving ${totalKeys} key(s) across ${Object.keys(map || {}).length} provider(s)`,
    );
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

  // ── Gamification state ──────────────────────────────────────────────────
  // Only the parts that cannot be derived from the ledger live here. See
  // src/core/gamification.js for why streaks are never stored.
  async getGamificationState() {
    const res = await browserStorage.local.get(CONSTANTS.SK.GAMIFICATION);
    const s = res[CONSTANTS.SK.GAMIFICATION] || {};
    return {
      vacations: Array.isArray(s.vacations) ? s.vacations : [],
      seenAchievements: Array.isArray(s.seenAchievements) ? s.seenAchievements : [],
      // Whether the seen-list has ever been written. Without it an empty list
      // is ambiguous — a fresh install and a long-time user who has not opened
      // the shelf yet look identical, and only one of them should have their
      // whole back catalogue announced as new.
      achievementsSeeded: s.achievementsSeeded === true,
    };
  },

  async setGamificationState(state) {
    await browserStorage.local.set({ [CONSTANTS.SK.GAMIFICATION]: state });
  },

  async addVacation(start, end = null, note = "") {
    const state = await this.getGamificationState();
    state.vacations.push({ start, end, note });
    await this.setGamificationState(state);
    return state.vacations;
  },

  /** Close the open-ended vacation, if there is one. Returns the updated list. */
  async endVacation(endDay) {
    const state = await this.getGamificationState();
    const open = state.vacations.filter((v) => v && !v.end);
    for (const v of open) v.end = endDay;
    await this.setGamificationState(state);
    return state.vacations;
  },

  async deleteVacation(start) {
    const state = await this.getGamificationState();
    state.vacations = state.vacations.filter((v) => v?.start !== start);
    await this.setGamificationState(state);
    return state.vacations;
  },

  /** Record achievements as announced so the same one is never flagged twice. */
  async markAchievementsSeen(ids) {
    const state = await this.getGamificationState();
    state.seenAchievements = [...new Set([...state.seenAchievements, ...ids])];
    state.achievementsSeeded = true;
    await this.setGamificationState(state);
    return state.seenAchievements;
  },

  // ── Roadmaps store: Array<Roadmap> ──────────────────────────────────────
  async getRoadmaps() {
    const res = await browserStorage.local.get(CONSTANTS.SK.ROADMAPS);
    return res[CONSTANTS.SK.ROADMAPS] || [];
  },

  async setRoadmaps(roadmaps) {
    await browserStorage.local.set({ [CONSTANTS.SK.ROADMAPS]: roadmaps });
  },

  async saveRoadmap(roadmap) {
    const list = await this.getRoadmaps();
    const idx = list.findIndex((r) => r.id === roadmap.id);
    if (idx >= 0) list[idx] = roadmap;
    else list.push(roadmap);
    await this.setRoadmaps(list);
  },

  async deleteRoadmap(id) {
    const list = await this.getRoadmaps();
    await this.setRoadmaps(list.filter((r) => r.id !== id));
  },

  // ── Backup store: { manual: [], scheduled: [], rolling: null } ──────────

  async _getBackupStore() {
    const res = await browserStorage.local.get(CONSTANTS.SK.ROLLING_BACKUPS);
    const raw = res[CONSTANTS.SK.ROLLING_BACKUPS] || {};
    // Migrate old array format (pre-3-type) → manual list
    if (Array.isArray(raw)) return { manual: raw.slice(0, 10), scheduled: [], rolling: null };
    return {
      manual: raw.manual || [],
      scheduled: raw.scheduled || [],
      rolling: raw.rolling || null,
    };
  },

  async _saveBackupStore(store) {
    await browserStorage.local.set({
      [CONSTANTS.SK.ROLLING_BACKUPS]: store,
    });
  },

  // Manual backups (up to 10, full CRUD)
  async getManualBackups() {
    return (await this._getBackupStore()).manual;
  },

  async addManualBackup(payload, name = "") {
    const store = await this._getBackupStore();
    store.manual.unshift({
      id: `m-${Date.now()}`,
      ts: Date.now(),
      name,
      data: payload,
    });
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
  async getScheduledBackups() {
    return (await this._getBackupStore()).scheduled;
  },

  async addScheduledBackup(payload, trigger = "manual") {
    const store = await this._getBackupStore();
    store.scheduled.unshift({
      id: `s-${Date.now()}`,
      ts: Date.now(),
      trigger,
      data: payload,
    });
    store.scheduled = store.scheduled.slice(0, 5);
    await this._saveBackupStore(store);
  },

  async deleteScheduledBackup(id) {
    const store = await this._getBackupStore();
    store.scheduled = store.scheduled.filter((b) => b.id !== id);
    await this._saveBackupStore(store);
  },

  // Rolling backup: single always-current snapshot
  async getRollingBackup() {
    return (await this._getBackupStore()).rolling;
  },

  async updateRollingBackup(payload) {
    const store = await this._getBackupStore();
    store.rolling = { ts: Date.now(), data: payload };
    await this._saveBackupStore(store);
  },

  // Legacy compat (used by PanelBackups before redesign)
  async getRollingBackups() {
    return await this.getManualBackups();
  },
  async addRollingBackup(payload) {
    await this.addManualBackup(payload);
  },

  // ── Local canonical entries ──────────────────────────────────────────────
  // User-owned overrides merged with the CDN canonical-map on lookup.

  async getLocalCanonicalEntries() {
    const res = await browserStorage.local.get(CONSTANTS.SK.CANONICAL_LOCAL_ENTRIES);
    return res[CONSTANTS.SK.CANONICAL_LOCAL_ENTRIES] || [];
  },

  async setLocalCanonicalEntries(entries) {
    await browserStorage.local.set({
      [CONSTANTS.SK.CANONICAL_LOCAL_ENTRIES]: entries,
    });
  },

  async addLocalCanonicalEntry(entry) {
    const entries = await this.getLocalCanonicalEntries();
    const idx = entries.findIndex((e) => e.canonicalId === entry.canonicalId);
    if (idx >= 0) {
      entries[idx] = entry;
    } else {
      entries.push(entry);
    }
    await this.setLocalCanonicalEntries(entries);
  },

  async deleteLocalCanonicalEntry(canonicalId) {
    const entries = await this.getLocalCanonicalEntries();
    await this.setLocalCanonicalEntries(entries.filter((e) => e.canonicalId !== canonicalId));
  },

  async getAIPrompts() {
    const res = await browserStorage.local.get(CONSTANTS.SK.AI_PROMPTS);
    return normalizeAIPrompts(res[CONSTANTS.SK.AI_PROMPTS] || {});
  },

  async setAIPrompts(prompts) {
    const normalized = normalizeAIPrompts(prompts || {});
    await browserStorage.local.set({
      [CONSTANTS.SK.AI_PROMPTS]: normalized,
    });
  },

  async getAuthToken(provider) {
    const keys = await browserStorage.local.get(CONSTANTS.SK.AUTH_TOKENS);
    const tokens = keys[CONSTANTS.SK.AUTH_TOKENS] || {};
    const exists = !!tokens[provider];
    dbg.log(`getAuthToken(${provider}): token ${exists ? "found" : "NOT found"}`);
    return tokens[provider];
  },

  async setAuthToken(provider, token) {
    const keys = await browserStorage.local.get(CONSTANTS.SK.AUTH_TOKENS);
    const tokens = keys[CONSTANTS.SK.AUTH_TOKENS] || {};
    tokens[provider] = token;
    dbg.log(`setAuthToken(${provider}): token set (${String(token || "").substring(0, 20)}...)`);
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
    const problemId = problem?.id || problem?.titleSlug || "unknown";
    dbg.log(`saveProblem(): saving problem ${problemId} (${problem?.platform || "unknown"})`);

    let mergedProblem = problem;
    let existing = null;
    try {
      existing = await this.getProblem(problemId);
      if (existing) {
        mergedProblem = {
          ...existing,
          ...problem,
          notes: problem.notes !== undefined ? problem.notes : existing.notes || "",
          methods: problem.methods !== undefined ? problem.methods : existing.methods || [],
          manuallyEdited: problem.manuallyEdited ?? existing.manuallyEdited ?? false,
        };
      }
    } catch (e) {
      dbg.warn(`saveProblem(): merge failed (non-blocking) for ${problemId}:`, e?.message);
    }

    // Enrich with canonical mapping if not manually edited and we don't have it yet
    try {
      if (!mergedProblem.manuallyEdited && (!existing || !existing.canonical)) {
        const canonicalEntry = await canonicalMapper.resolveAsync(
          mergedProblem.platform || "",
          mergedProblem.titleSlug || mergedProblem.id || "",
        );
        if (canonicalEntry) {
          mergedProblem.canonical = canonicalEntry;
          if (canonicalEntry.topic) {
            mergedProblem.topic = canonicalEntry.topic;
          }
          if (Array.isArray(canonicalEntry.tags) && canonicalEntry.tags.length > 0) {
            const uniqueTags = new Set([...canonicalEntry.tags, ...(mergedProblem.tags || [])]);
            mergedProblem.tags = [...uniqueTags];
          }
        }
      }
    } catch (e) {
      dbg.warn("saveProblem(): canonical enrichment failed:", e?.message);
    }

    // Normalize tags and topics using custom settings mappings
    try {
      const settings = await this.getSettings();
      const customMappings = settings?.topicMappings || {};
      if (mergedProblem.tags && Array.isArray(mergedProblem.tags)) {
        mergedProblem.tags = [
          ...new Set(
            mergedProblem.tags.map((t) => normalizeTag(t, customMappings)).filter(Boolean),
          ),
        ];
      }
      if (mergedProblem.topic) {
        mergedProblem.topic = normalizeTag(mergedProblem.topic, customMappings);
      }
    } catch (e) {
      dbg.warn(`saveProblem(): tag normalization failed:`, e?.message);
    }

    const store = await this.queryDB(CONSTANTS.IDB_STORES.PROBLEMS, "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.put(mergedProblem);
      request.onsuccess = () => {
        dbg.log(`saveProblem(): ✓ saved ${problemId}`);
        resolve();
      };
      request.onerror = () => {
        dbg.error(`saveProblem(): ✗ failed for ${problemId}`, request.error);
        reject(request.error);
      };
    });
  },

  async getProblem(id) {
    const store = await this.queryDB(CONSTANTS.IDB_STORES.PROBLEMS);
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = async () => {
        const p = request.result;
        if (p) {
          try {
            // Resolve canonical dynamically on lookup
            const canonicalEntry = await canonicalMapper.resolveAsync(
              p.platform || "",
              p.titleSlug || p.id || "",
            );
            if (canonicalEntry) {
              p.canonical = canonicalEntry;
              if (canonicalEntry.topic) {
                p.topic = canonicalEntry.topic;
              }
              if (Array.isArray(canonicalEntry.tags) && canonicalEntry.tags.length > 0) {
                const uniqueTags = new Set([...canonicalEntry.tags, ...(p.tags || [])]);
                p.tags = [...uniqueTags];
              }
            }

            const settings = await this.getSettings();
            const customMappings = settings?.topicMappings || {};
            if (p.tags && Array.isArray(p.tags)) {
              // Dedup AFTER normalizing: the canonical union above compares raw
              // strings, so "array" (canonical slug) and "Array" (stored tag)
              // both survive it and normalize into the same label.
              p.tags = [
                ...new Set(p.tags.map((t) => normalizeTag(t, customMappings)).filter(Boolean)),
              ];
            }
            if (p.topic) {
              p.topic = normalizeTag(p.topic, customMappings);
            }
          } catch (e) {
            dbg.warn(`getProblem(): enrichment/normalization failed:`, e?.message);
          }
        }
        const found = !!p;
        dbg.log(`getProblem(${id}): ${found ? "✓ found" : "NOT found"}`);
        resolve(p);
      };
      request.onerror = () => {
        dbg.error(`getProblem(${id}): ✗ error`, request.error);
        reject(request.error);
      };
    });
  },

  async getAllProblems() {
    // Pre-load the canonical map once so all resolve calls are fast/synchronous
    await canonicalMapper.loadMap().catch(() => {});

    const store = await this.queryDB(CONSTANTS.IDB_STORES.PROBLEMS);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = async () => {
        const cleaned = (request.result || []).filter(Boolean);
        try {
          const settings = await this.getSettings();
          const customMappings = settings?.topicMappings || {};
          for (const p of cleaned) {
            const canonicalEntry = canonicalMapper.resolve(
              p.platform || "",
              p.titleSlug || p.id || "",
            );
            if (canonicalEntry) {
              p.canonical = canonicalEntry;
              if (canonicalEntry.topic) {
                p.topic = canonicalEntry.topic;
              }
              if (Array.isArray(canonicalEntry.tags) && canonicalEntry.tags.length > 0) {
                const uniqueTags = new Set([...canonicalEntry.tags, ...(p.tags || [])]);
                p.tags = [...uniqueTags];
              }
            }
            if (p.tags && Array.isArray(p.tags)) {
              // Dedup AFTER normalizing: the canonical union above compares raw
              // strings, so "array" (canonical slug) and "Array" (stored tag)
              // both survive it and normalize into the same label.
              p.tags = [
                ...new Set(p.tags.map((t) => normalizeTag(t, customMappings)).filter(Boolean)),
              ];
            }
            if (p.topic) {
              p.topic = normalizeTag(p.topic, customMappings);
            }
          }
        } catch (e) {
          dbg.warn(`getAllProblems(): tag normalization failed:`, e?.message);
        }
        dbg.log(`getAllProblems(): retrieved ${cleaned.length} problem(s)`);
        resolve(cleaned);
      };
      request.onerror = () => {
        dbg.error(`getAllProblems(): ✗ error`, request.error);
        reject(request.error);
      };
    });
  },

  // Solutions helpers: problems can store multiple solutions under `solutions`.
  async getSolutionsForProblem(problemId) {
    const p = await this.getProblem(problemId);
    return p?.solutions || [];
  },

  async addSolutionToProblem(problemId, solution) {
    // solution: { id?, code, lang, timestamp?, meta? }
    const p = await this.getProblem(problemId);
    if (!p) throw new Error("Problem not found");
    const sols = Array.isArray(p.solutions) ? p.solutions.slice() : [];
    const entry = {
      id: solution.id || `s-${Date.now()}`,
      ts: Date.now(),
      ...solution,
    };
    sols.push(entry);
    p.solutions = sols;
    await this.saveProblem(p);
    return entry;
  },

  async replaceSolutionsForProblem(problemId, solutions = []) {
    const p = await this.getProblem(problemId);
    if (!p) throw new Error("Problem not found");
    p.solutions = solutions;
    await this.saveProblem(p);
  },

  async deleteProblem(id) {
    dbg.log(`deleteProblem(): deleting ${id}`);
    const store = await this.queryDB(CONSTANTS.IDB_STORES.PROBLEMS, "readwrite");
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => {
        dbg.log(`deleteProblem(): ✓ deleted ${id}`);
        resolve();
      };
      request.onerror = () => {
        dbg.error(`deleteProblem(): ✗ failed for ${id}`, request.error);
        reject(request.error);
      };
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

  async _raw() {
    return browserStorage.local.get(null);
  },

  async _setRaw(key, value) {
    return browserStorage.local.set({ [key]: value });
  },

  async markSlugLangCommitted(titleSlug, langName) {
    const key = "cl.committed.sluglangs";
    // Locked like updateSettings: these maps are read-modify-write from the
    // service worker, the library tab and the popup at once, and an unlocked
    // interleave silently drops one side's marks.
    return withLock(key, async () => {
      const map = await this.getCommittedSlugLangs();
      map[`${titleSlug}::${String(langName || "").toLowerCase()}`] = Date.now();
      await browserStorage.local.set({ [key]: map });
    });
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
    return withLock(key, async () => {
      const map = await this.getCommittedSubmissions();
      map[String(commitKey || "")] = Date.now();
      await browserStorage.local.set({ [key]: map });
    });
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
    const commitKey = String(problemCommitKey || "").trim();
    if (!commitKey) {
      dbg.warn(`markPendingProblemKey(): empty commitKey, skipped`);
      return;
    }
    return withLock(key, async () => {
      const map = await this.getPendingProblemKeys();
      map[commitKey] = Date.now();
      dbg.log(
        `markPendingProblemKey(): marked ${commitKey} (now ${Object.keys(map).length} pending)`,
      );
      await browserStorage.local.set({ [key]: map });
    });
  },

  async markPendingProblemKeys(problemCommitKeys = []) {
    const key = "cl.pending.problemkeys";
    return withLock(key, async () => {
      const map = await this.getPendingProblemKeys();
      const now = Date.now();
      for (const raw of problemCommitKeys) {
        const commitKey = String(raw || "").trim();
        if (commitKey) map[commitKey] = now;
      }
      await browserStorage.local.set({ [key]: map });
    });
  },

  async clearPendingProblemKeys(problemCommitKeys = []) {
    const key = "cl.pending.problemkeys";
    return withLock(key, async () => {
      const map = await this.getPendingProblemKeys();
      const before = Object.keys(map).length;
      for (const raw of problemCommitKeys || []) {
        const commitKey = String(raw || "").trim();
        if (!commitKey) continue;
        delete map[commitKey];
      }
      const after = Object.keys(map).length;
      dbg.log(
        `clearPendingProblemKeys(): removed ${problemCommitKeys.length} key(s) (${before} → ${after} pending)`,
      );
      await browserStorage.local.set({ [key]: map });
    });
  },

  async markRenameNeeded(id, { oldBase, newBase }) {
    const all = await this._getRenames();
    const filtered = all.filter((r) => r.id !== id);
    filtered.push({ id, oldBase, newBase, ts: Date.now() });
    await browserStorage.local.set({
      "cl.renames": JSON.stringify(filtered),
    });
  },

  async getPendingRenames() {
    return this._getRenames();
  },

  async clearPendingRenames() {
    await browserStorage.local.set({ "cl.renames": "[]" });
  },

  async _getRenames() {
    const raw = await browserStorage.local.get("cl.renames");
    try {
      return JSON.parse(raw["cl.renames"] || "[]");
    } catch {
      return [];
    }
  },

  async repairGFGTimestamps() {
    dbg.log("repairGFGTimestamps(): checking for problems with mismatched timestamps");
    try {
      const problems = await this.getAllProblems();
      let updatedCount = 0;
      for (const p of problems) {
        if (p.platform === "geeksforgeeks" && Array.isArray(p.methods) && p.methods.length > 0) {
          const validTimes = p.methods.map((m) => m.timestamp).filter((t) => t > 0 && !isNaN(t));
          if (validTimes.length > 0) {
            const minTime = Math.min(...validTimes);
            // If the current timestamp is newer/different than the actual first solve time, update it!
            if (p.timestamp !== minTime) {
              dbg.log(
                `repairGFGTimestamps(): repairing timestamp for ${p.id}: ${p.timestamp} -> ${minTime}`,
              );
              p.timestamp = minTime;
              await this.saveProblem(p);
              updatedCount++;
            }
          }
        }
      }
      if (updatedCount > 0) {
        dbg.log(`repairGFGTimestamps(): ✓ repaired ${updatedCount} GFG problem timestamps`);
      }
    } catch (e) {
      dbg.error("repairGFGTimestamps(): failed:", e?.message);
    }
  },
};
