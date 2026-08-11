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
 *
 * This is the only such list. `settings-auto-commit.js` used to keep its own
 * copy under a comment saying it had to match this one, and it did not: between
 * them they disagreed on forty-odd keys, so which of your preferences survived
 * a reinstall depended on which of the two files happened to carry it.
 */
export const PORTABLE_SETTINGS = [
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
  "github_coauthor_enabled",
  "github_coauthor_trailer",
  "autoCommit",
  "autoSync",
  "syncInterval",
  "commitMessageStyle",

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

  // Gamification
  "gamificationEnabled",
  "dailyTargetPoints",
  "freezeEarnMultiplier",
  "maxFreezes",
  "penaltyMultiplier",
  "iceBreakerDays",
  "gamificationBadges",
  "gamificationReadme",
  "gamificationBadgeStyle",
  "gamificationShieldsStyle",
  "gamificationBadgePicks",
  "gamificationActions",
  "gamificationActionsHour",
  // Party: a list of public repository references. It carries no credentials
  // and nothing about the people it names beyond what they already publish, so
  // it travels with the rest of the settings rather than being re-typed on the
  // second device.
  "partyFriends",

  // Appearance / UX
  "theme_preset",
  "theme_mode",
  "theme_accent",
  "showNotifications",
  "hideCompleted",
  "hideIgnored",
  "mcp.config",
  "behaviorBankEnabled",
  // `CONSTANTS.SK.TELEMETRY_OPT_IN`. The name matters: this list carried
  // `telemetryEnabled`, which nothing has ever written, so the one setting a
  // privacy-minded user is most likely to change was the one that did not
  // travel with them.
  "telemetryOptIn",
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
const SECRET_KEYS = [
  "github_token",
  "gitlab_token",
  "bitbucket_token",
  "auth",
  "_defaultsApplied",
  "_pendingConflicts",
];

/**
 * Key suffixes that mark a value as a credential whatever its prefix says.
 *
 * `PORTABLE_PREFIXES` waves through every `openai_*` and `claude_*` key so that
 * `openai_enabled` and `claude_model` travel between devices. `openai_keys` is
 * also an `openai_*` key, and it holds the user's API keys: the provider card
 * writes what you type there straight into settings on every keystroke, and
 * only moves it to `ai.keys` once you press Save. Anything typed and not saved
 * therefore sat in a settings key the allow-list called portable, bound for a
 * plaintext file in a repository that is usually public and never forgets.
 *
 * Checked before the allow-list, because a suffix rule that runs second is a
 * suffix rule that does nothing.
 */
const SECRET_SUFFIXES = ["_keys", "_token", "_secret", "_apiKey", "_api_key", "_password"];

/**
 * Whether a settings key may leave the device.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isPortableSetting(key) {
  if (typeof key !== "string" || !key) return false;
  if (SECRET_KEYS.some((sk) => key.startsWith(sk))) return false;
  if (SECRET_SUFFIXES.some((sfx) => key.endsWith(sfx))) return false;
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

    const localUpdatedAt = settings.__updatedAt;
    const remoteSyncedAt = remote.__syncedAt || remote.updatedAt;
    if (localUpdatedAt && remoteSyncedAt && new Date(localUpdatedAt) >= new Date(remoteSyncedAt)) {
      dbg.log("syncSettingsFromGitHub(): local settings are newer or equal — skipping pull");
      return { synced: 0, message: "Local settings are newer" };
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

    // Merge settings keys. The same portability test gates the way in as the
    // way out: a file written by an older build can hold keys this one would
    // never send, and a sync file is not a reason to start trusting them.
    const delta = {};
    for (const [key, value] of Object.entries(remote)) {
      if (key === "__theme") continue;
      if (CRITICAL_KEYS.includes(key)) continue;
      if (!isPortableSetting(key)) continue;
      if (JSON.stringify(settings[key]) !== JSON.stringify(value)) {
        delta[key] = value;
        syncedCount++;
      }
    }

    if (Object.keys(delta).length > 0) {
      await Storage.updateSettings(delta);
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
      if (isPortableSetting(key)) payload[key] = value;
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
    if (isPortableSetting(key)) payload[key] = value;
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
