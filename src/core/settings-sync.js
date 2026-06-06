/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GitHub Settings Sync Manager
 * Persists non-secret settings + theme to .codeledger/sync.json in the user's repo.
 * Secrets (OAuth tokens, AI API keys) are NEVER included.
 *
 * File: .codeledger/sync.json   (separate from .codeledger/config.json which is infra metadata)
 */

import { createDebugger } from "../lib/debug.js";
import { Storage } from "./storage.js";
import { registry } from "./handler-registry.js";

const dbg = createDebugger("SettingsSync");

const SYNC_PATH = ".codeledger/sync.json";
const SYNC_PATH_ENCODED = ".codeledger%2Fsync.json";

/**
 * Settings keys that are safe to persist to GitHub.
 * NEVER include: oauth tokens, AI api keys, github_token (PAT), auth.* paths.
 */
const PORTABLE_SETTINGS = [
  // Git / repo
  "gitEnabled",
  "gitProvider",
  "github_owner",
  "github_repo",
  "github_username",
  "commitFormat",
  "commitMessageTemplate",
  "autocommitDelay",
  "git_mirrors",

  // GitHub Pages
  "github_pages",
  "github_pages_url",
  "github_pages_hide_code",
  "github_repo_topics_extra",
  "pages_show_verification",

  // AI behaviour
  "autoReview",
  "autoReviewDelay",
  "aiProvider",
  "aiPrimaryModel",
  "aiSecondary",
  "aiSecondaryModel",
  "aiCopyable",

  // Platform enables (e.g. leetcode_enabled, codeforces_enabled)
  // Included dynamically below via prefix scan

  // Deduplication
  "deduplicationThreshold",
  "deduplicationEnabled",
  "deduplicationAutoResolve",

  // Appearance / UX
  "behaviorBankEnabled",
  "telemetryEnabled",
  "debugMode",
  "remember_modal_tab",
  "settingsSyncEnabled",

  // Misc
  "darkMode",
];

/** Key prefixes whose entries are all portable (e.g. leetcode_enabled, claude_enabled). */
const PORTABLE_PREFIXES = [
  "leetcode_",
  "geeksforgeeks_",
  "codeforces_",
  "claude_",
  "openai_",
  "gemini_",
  "deepseek_",
  "ollama_",
  "openrouter_",
];

/** Keys that must NEVER be overridden from remote even if present in sync.json. */
const CRITICAL_KEYS = ["github_owner", "github_repo", "github_username"];

/** Keys that must NEVER be written to sync.json. */
const SECRET_KEYS = ["github_token", "auth", "_defaultsApplied", "_pendingConflicts"];

function _isPortable(key, settings) {
  if (SECRET_KEYS.some((sk) => key.startsWith(sk))) return false;
  if (PORTABLE_SETTINGS.includes(key)) return true;
  if (PORTABLE_PREFIXES.some((p) => key.startsWith(p))) return true;
  return false;
}

// ── GitHub file helpers ───────────────────────────────────────────────────────

async function _fetchSyncFile(owner, repo, git) {
  try {
    const res = await git.getContents(owner, repo, SYNC_PATH);
    if (!res?.content) return { data: null, sha: null };
    const raw = atob((res.content || "").replace(/\n/g, ""));
    return { data: JSON.parse(raw), sha: res.sha || null };
  } catch (e) {
    if (String(e?.message || e).includes("404")) return { data: null, sha: null };
    dbg.warn("_fetchSyncFile(): failed:", e?.message);
    return { data: null, sha: null };
  }
}

async function _writeSyncFile(owner, repo, git, payload, existingSha) {
  const body = {
    message: "chore: sync CodeLedger settings",
    content: btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2)))),
    branch: "main",
  };
  if (existingSha) body.sha = existingSha;
  return git.apiFetch(`/repos/${owner}/${repo}/contents/${SYNC_PATH_ENCODED}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Pull sync.json from GitHub and merge into local storage.
 * Remote wins for all keys except CRITICAL_KEYS (github_owner, github_repo).
 * Also restores theme if present.
 */
export async function syncSettingsFromGitHub() {
  try {
    const settings = await Storage.getSettings();
    const git = registry.getGitProvider(settings.gitProvider || "github");
    const token = git ? await git.getToken().catch(() => null) : null;
    const owner = settings.github_owner || settings.github_username;
    const repo = settings.github_repo || settings.gitRepo;

    if (!git || !token || !owner || !repo) {
      dbg.log("syncSettingsFromGitHub(): GitHub not configured — skipping");
      return { synced: 0, message: "GitHub not configured" };
    }

    const { data: remote } = await _fetchSyncFile(owner, repo, git);
    if (!remote || typeof remote !== "object") {
      return { synced: 0, message: "No remote sync file found" };
    }

    let syncedCount = 0;

    // Restore theme separately (stored in its own storage key)
    if (remote.__theme && typeof remote.__theme === "object") {
      const localTheme = (await Storage.getTheme().catch(() => null)) || {};
      const remoteTheme = remote.__theme;
      const merged = { ...remoteTheme, ...localTheme }; // local wins for theme
      // Only apply if different
      if (JSON.stringify(localTheme) !== JSON.stringify(merged)) {
        await Storage.setTheme(merged).catch(() => {});
        syncedCount++;
        dbg.log("syncSettingsFromGitHub(): ✓ theme restored");
      }
    }

    // Merge settings keys
    for (const [key, value] of Object.entries(remote)) {
      if (key === "__theme") continue;
      if (CRITICAL_KEYS.includes(key)) continue;
      if (JSON.stringify(settings[key]) !== JSON.stringify(value)) {
        settings[key] = value;
        syncedCount++;
      }
    }

    if (syncedCount > 0) {
      await Storage.setSettings(settings);
      dbg.log(`syncSettingsFromGitHub(): ✓ applied ${syncedCount} change(s)`);
    }

    return {
      synced: syncedCount,
      message:
        syncedCount > 0 ? `Applied ${syncedCount} setting(s) from repo` : "Already up-to-date",
    };
  } catch (e) {
    dbg.error("syncSettingsFromGitHub(): failed:", e?.message);
    throw e;
  }
}

/**
 * Push current portable settings + theme to sync.json on GitHub.
 * Read-before-write: fetches SHA so update doesn't create a merge conflict.
 */
export async function syncSettingsToGitHub() {
  try {
    const settings = await Storage.getSettings();
    const git = registry.getGitProvider(settings.gitProvider || "github");
    const token = git ? await git.getToken().catch(() => null) : null;
    const owner = settings.github_owner || settings.github_username;
    const repo = settings.github_repo || settings.gitRepo;

    if (!git || !token || !owner || !repo) throw new Error("GitHub not configured");

    // Build portable payload
    const payload = {};
    for (const [key, value] of Object.entries(settings)) {
      if (_isPortable(key, settings)) payload[key] = value;
    }

    // Include theme
    const theme = await Storage.getTheme().catch(() => null);
    if (theme) payload.__theme = theme;

    payload.__syncedAt = new Date().toISOString();

    // Read existing SHA (needed for Contents API update)
    const { sha } = await _fetchSyncFile(owner, repo, git);

    await _writeSyncFile(owner, repo, git, payload, sha);
    dbg.log(`syncSettingsToGitHub(): ✓ pushed ${Object.keys(payload).length} key(s)`);
    return { committed: true, message: "Settings pushed to GitHub" };
  } catch (e) {
    dbg.error("syncSettingsToGitHub(): failed:", e?.message);
    throw e;
  }
}

/**
 * Build the portable settings payload as a JSON string.
 * Used by the infra commit to include .codeledger/sync.json in the same tree
 * without a separate Contents API call.
 */
export async function buildSyncPayload() {
  const settings = await Storage.getSettings();
  const payload = {};
  for (const [key, value] of Object.entries(settings)) {
    if (_isPortable(key, settings)) payload[key] = value;
  }
  const theme = await Storage.getTheme().catch(() => null);
  if (theme) payload.__theme = theme;
  payload.__syncedAt = new Date().toISOString();
  return JSON.stringify(payload, null, 2);
}

/**
 * Called from service-worker init. Pulls remote settings non-blocking.
 * Skipped if user has disabled sync or GitHub not configured.
 */
export async function autoSyncSettings() {
  try {
    const settings = await Storage.getSettings();
    if (settings.settingsSyncEnabled === false) return;

    syncSettingsFromGitHub().catch((e) =>
      dbg.warn("autoSyncSettings(): pull failed (non-blocking):", e?.message),
    );
  } catch (e) {
    dbg.warn("autoSyncSettings(): failed:", e?.message);
  }
}
