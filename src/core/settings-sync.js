/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GitHub Settings Sync Manager
 * Manages persistent storage of non-secret settings to a GitHub config file (.codeledger/config.json).
 * Secrets (tokens, API keys) are never synced to GitHub.
 */

import { createDebugger } from "../lib/debug.js";
import { Storage } from "./storage.js";
import { CONSTANTS } from "./constants.js";

const dbg = createDebugger("SettingsSync");

/**
 * Settings that CAN be persisted to GitHub config.
 * Everything else (tokens, keys) stays in chrome.storage.local.
 */
const PORTABLE_SETTINGS = [
    "theme",
    "darkMode",
    "behaviorBankEnabled",
    "telemetryEnabled",
    "debugMode",
    "aiCopyable",
    "deduplicationThreshold",
    "autoReview",
    "autoReviewDelay",
    "github_owner",
    "github_repo",
    "gitProvider",
    "gitEnabled",
    "commitFormat",
    "pages_show_verification",
    // Add more portable settings as needed
];

/**
 * Fetch settings from .codeledger/config.json in the user's GitHub repo.
 * @param {string} owner - GitHub owner
 * @param {string} repo - GitHub repo name
 * @param {string} token - GitHub PAT
 * @param {object} gitProvider - GitHub provider instance
 * @returns {Promise<object>} - parsed config or empty object if not found
 */
export async function fetchGitHubConfig(owner, repo, token, gitProvider) {
    try {
        if (!gitProvider) throw new Error("Git provider not available");

        // Try to fetch .codeledger/config.json
        const res = await gitProvider.apiFetch(
            `/repos/${owner}/${repo}/contents/.codeledger%2Fconfig.json`,
            token
        );

        if (!res || !res.content) {
            dbg.log("GitHub config not found (fresh repo or not synced yet)");
            return {};
        }

        const raw = atob((res.content || "").replace(/\n/g, ""));
        const config = JSON.parse(raw || "{}");
        dbg.log("Fetched GitHub config successfully");
        return config;
    } catch (e) {
        if (e.message && e.message.includes("404")) {
            dbg.log("GitHub config does not exist yet (expected for new repos)");
            return {};
        }
        dbg.warn("Failed to fetch GitHub config:", e?.message);
        return {};
    }
}

/**
 * Save portable settings to .codeledger/config.json on GitHub.
 * @param {string} owner - GitHub owner
 * @param {string} repo - GitHub repo name
 * @param {string} token - GitHub PAT
 * @param {object} settings - full settings object
 * @param {object} gitProvider - GitHub provider instance
 * @returns {Promise<{committed: boolean, sha: string}>}
 */
export async function saveGitHubConfig(owner, repo, token, settings, gitProvider) {
    try {
        if (!gitProvider) throw new Error("Git provider not available");

        // Extract only portable settings
        const portableConfig = {};
        for (const key of PORTABLE_SETTINGS) {
            if (key in settings) {
                portableConfig[key] = settings[key];
            }
        }

        const content = JSON.stringify(portableConfig, null, 2);
        const encoded = btoa(content);

        // Get existing file SHA for updates (optional, can be null for new files in some APIs)
        let sha = null;
        try {
            const existing = await gitProvider.apiFetch(
                `/repos/${owner}/${repo}/contents/.codeledger%2Fconfig.json`,
                token
            );
            sha = existing?.sha;
        } catch (_) {
            // File doesn't exist yet, that's OK
        }

        // Upload or update the config file
        const payload = {
            message: "chore: sync CodeLedger settings",
            content: encoded,
            branch: "main",
        };
        if (sha) payload.sha = sha;

        const updateRes = await gitProvider.apiFetch(
            `/repos/${owner}/${repo}/contents/.codeledger%2Fconfig.json`,
            token,
            "PUT",
            payload
        );

        dbg.log("Saved GitHub config successfully");
        return { committed: true, sha: updateRes?.content?.sha };
    } catch (e) {
        dbg.error("Failed to save GitHub config:", e?.message);
        throw e;
    }
}

/**
 * Sync settings from GitHub: fetch remote config and merge with local.
 * Remote settings take precedence only if they differ; local overrides for critical keys.
 * @returns {Promise<{synced: number, message: string}>}
 */
export async function syncSettingsFromGitHub() {
    try {
        const settings = await Storage.getSettings();
        const token = await Storage.getAuthToken("github").catch(() => null);
        const owner = settings.github_owner || settings.github_username;
        const repo = settings.github_repo || settings.gitRepo;

        if (!token || !owner || !repo) {
            dbg.log("Cannot sync settings: missing GitHub token or repo config");
            return { synced: 0, message: "GitHub not configured" };
        }

        // Lazy-load git provider
        const { registry } = await import("./handler-registry.js");
        const gitProvider = registry.getGitProvider("github");
        if (!gitProvider) {
            throw new Error("GitHub provider not registered");
        }

        const remoteConfig = await fetchGitHubConfig(owner, repo, token, gitProvider);
        if (!remoteConfig || Object.keys(remoteConfig).length === 0) {
            return { synced: 0, message: "No remote config found" };
        }

        // Merge: remote values are applied, but local always wins for certain keys
        const CRITICAL_KEYS = ["github_owner", "github_repo"]; // Never override these from remote
        let syncedCount = 0;
        for (const [key, value] of Object.entries(remoteConfig)) {
            if (CRITICAL_KEYS.includes(key)) continue; // Skip critical keys
            if (!(key in settings) || settings[key] !== value) {
                settings[key] = value;
                syncedCount++;
            }
        }

        if (syncedCount > 0) {
            await Storage.setSettings(settings);
            dbg.log(`Synced ${syncedCount} settings from GitHub`);
        }

        return { synced: syncedCount, message: syncedCount > 0 ? `Synced ${syncedCount} setting(s)` : "Already up-to-date" };
    } catch (e) {
        dbg.error("Settings sync from GitHub failed:", e?.message);
        throw e;
    }
}

/**
 * Sync settings to GitHub: save current portable settings.
 * @returns {Promise<{committed: boolean, message: string}>}
 */
export async function syncSettingsToGitHub() {
    try {
        const settings = await Storage.getSettings();
        const token = await Storage.getAuthToken("github").catch(() => null);
        const owner = settings.github_owner || settings.github_username;
        const repo = settings.github_repo || settings.gitRepo;

        if (!token || !owner || !repo) {
            throw new Error("GitHub not configured");
        }

        // Lazy-load git provider
        const { registry } = await import("./handler-registry.js");
        const gitProvider = registry.getGitProvider("github");
        if (!gitProvider) {
            throw new Error("GitHub provider not registered");
        }

        const result = await saveGitHubConfig(owner, repo, token, settings, gitProvider);
        dbg.log("Settings synced to GitHub");
        return { committed: result.committed, message: "Settings synced to GitHub" };
    } catch (e) {
        dbg.error("Settings sync to GitHub failed:", e?.message);
        throw e;
    }
}

/**
 * Automatically sync settings on startup and after changes.
 * Called from service-worker init.
 */
export async function autoSyncSettings() {
    try {
        const settings = await Storage.getSettings();
        if (settings.settingsSyncEnabled === false) return; // User has disabled sync

        // Fetch remote config and merge (non-blocking)
        syncSettingsFromGitHub().catch((e) => {
            dbg.warn("Auto-sync from GitHub failed (non-blocking):", e?.message);
        });
    } catch (e) {
        dbg.warn("Auto-sync failed:", e?.message);
    }
}
