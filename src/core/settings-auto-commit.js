/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * @ts-check
 */

import { Storage } from "./storage.js";
import { CONSTANTS } from "./constants.js";
import { createDebugger } from "../lib/debug.js";
import { registry } from "./handler-registry.js";
import { buildCommitMessage, COMMIT_TYPES } from "./commit-messages.js";

const dbg = createDebugger("SettingsAutoCommit");

/**
 * Persistent settings auto-commit tracking.
 * When settings change, mark them for next commit.
 * On next problem commit, include .codeledger/config.json if marked.
 */

const SETTINGS_COMMIT_KEY = "settings._pending_commit";
const LAST_COMMITTED_HASH = "settings._last_committed_hash";

/**
 * Mark settings as pending commit (called when settings change).
 */
export async function markSettingsPendingCommit() {
  try {
    // The hash is derived inside the lock, so it describes the settings that
    // are actually about to be committed rather than a snapshot someone else
    // has since changed.
    await Storage.updateSettings((current) => ({
      [SETTINGS_COMMIT_KEY]: true,
      [LAST_COMMITTED_HASH]: _hashPortableSettings(current),
    }));
    dbg.log("Settings marked for auto-commit");
  } catch (e) {
    dbg.warn("Failed to mark settings pending:", e);
  }
}

/**
 * Check if settings need committing.
 */
export async function needsSettingsCommit() {
  try {
    const settings = await Storage.getSettings();
    const needs = settings[SETTINGS_COMMIT_KEY] === true;
    dbg.log(`needsSettingsCommit(): ${needs ? "yes" : "no"}`);
    return needs;
  } catch (e) {
    return false;
  }
}

/**
 * Get config file content for commit (if settings need committing).
 * Returns: { path: ".codeledger/config.json", content: "..." } or null
 */
export async function getConfigFileForCommit() {
  dbg.log(`getConfigFileForCommit(): building config file`);
  try {
    const needs = await needsSettingsCommit();
    if (!needs) return null;

    const settings = await Storage.getSettings();
    const portable = _extractPortableSettings(settings);

    return {
      path: ".codeledger/config.json",
      content: JSON.stringify(portable, null, 2),
    };
  } catch (e) {
    dbg.warn("Failed to prepare config file:", e);
    return null;
  }
}

/**
 * Clear pending commit flag after successful commit.
 */
export async function clearSettingsCommitFlag() {
  dbg.log(`clearSettingsCommitFlag(): clearing auto-commit flag`);
  try {
    await Storage.updateSettings({ [SETTINGS_COMMIT_KEY]: false });
    dbg.log("Settings commit flag cleared");
  } catch (e) {
    dbg.warn("Failed to clear commit flag:", e);
  }
}

/**
 * Force-commit the current portable settings immediately using the registered Git provider.
 * Uses the provider's atomic commit path (Trees API) so infra files are included.
 * Returns { committed: boolean, message }
 */
export async function forceCommitSettingsNow() {
  dbg.log(`forceCommitSettingsNow(): forcing immediate settings commit`);
  try {
    const settings = await Storage.getSettings();
    const git = registry.getGitProvider(settings.gitProvider || "github");
    if (!git) throw new Error("No git provider configured");

    const cfg = await getConfigFileForCommit();
    if (!cfg)
      return {
        committed: false,
        message: "No pending settings to commit",
      };

    const repo = (settings.github_repo || settings.gitRepo || CONSTANTS.DEFAULT_REPO_NAME).replace(
      /\s+/g,
      "-",
    );

    await git.commit(
      [cfg],
      buildCommitMessage(COMMIT_TYPES.MAINTENANCE, {
        detail: "settings: force commit",
        count: 1,
      }),
      repo,
    );

    await clearSettingsCommitFlag();
    dbg.log("Force committed settings to repo", repo);
    return { committed: true, message: "Settings committed" };
  } catch (e) {
    dbg.warn("Force commit settings failed:", e?.message || e);
    throw e;
  }
}

/**
 * Get portable settings (non-secret, user-facing preferences).
 * Must match settings-sync.js PORTABLE_SETTINGS.
 */
function _extractPortableSettings(settings) {
  const PORTABLE_SETTINGS = [
    "theme_preset",
    "theme_mode",
    "theme_accent",
    "darkMode",
    "behaviorBankEnabled",
    "telemetryEnabled",
    "debugMode",
    "aiCopyable",
    "deduplicationThreshold",
    "autoReview",
    "autoCommit",
    "autoSync",
    "syncInterval",
    "commitMessageStyle",
    "showNotifications",
    "hideCompleted",
    "hideIgnored",
    "pages_show_verification",
    "github_pages",
    "github_repo_topics_extra",
    "github_coauthor_enabled",
    "github_coauthor_trailer",
    "mcp.config",
  ];

  const portable = {};
  PORTABLE_SETTINGS.forEach((key) => {
    if (key in settings) {
      portable[key] = settings[key];
    }
  });

  return portable;
}

/**
 * Simple hash of portable settings for change detection.
 */
function _hashPortableSettings(settings) {
  const portable = _extractPortableSettings(settings);
  const str = JSON.stringify(portable);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
