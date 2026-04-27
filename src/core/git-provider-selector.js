/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { registry } from "./handler-registry.js";
import { Storage } from "./storage.js";

/**
 * Fallback priority for git providers
 * @type {string[]}
 */
const GIT_PROVIDER_PRIORITY = ["github", "gitlab", "bitbucket"];

/**
 * Gets the next available git provider based on settings.
 * Tries in priority order: GitHub → GitLab → Bitbucket
 * @param {Record<string, any>} settings - Current settings
 * @returns {string} The ID of the selected git provider
 */
export function getActiveGitProvider(settings = {}) {
  for (const providerId of GIT_PROVIDER_PRIORITY) {
    const provider = registry.getGitProvider(providerId);
    if (!provider) continue;

    // Check if provider is enabled (default to enabled if not specified)
    const enabledKey = `${providerId}_enabled`;
    const isEnabled = settings[enabledKey] !== false;

    if (isEnabled) {
      return providerId;
    }
  }

  // Fallback to first available
  return GIT_PROVIDER_PRIORITY[0];
}

/**
 * Gets all available git providers
 * @returns {Array<{id: string, name: string, enabled: boolean}>}
 */
export async function getAvailableGitProviders() {
  const settings = await Storage.getSettings();
  return GIT_PROVIDER_PRIORITY.map((id) => ({
    id,
    name:
      {
        github: "GitHub",
        gitlab: "GitLab",
        bitbucket: "Bitbucket",
      }[id] || id,
    enabled: settings[`${id}_enabled`] !== false,
  }));
}

/**
 * Gets the active git provider instance
 * @returns {Promise<any>} The git provider handler
 */
export async function getActiveGitProviderInstance() {
  const settings = await Storage.getSettings();
  const providerId = getActiveGitProvider(settings);
  return registry.getGitProvider(providerId);
}

/**
 * Validates git provider configuration
 * @param {string} providerId
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export async function validateGitProvider(providerId) {
  const provider = registry.getGitProvider(providerId);
  if (!provider) {
    return { valid: false, error: `Provider ${providerId} not found` };
  }

  if (typeof provider.validate === "function") {
    return await provider.validate();
  }

  return { valid: true };
}
