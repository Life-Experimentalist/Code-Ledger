/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../lib/debug.js";
import { CONSTANTS } from "./constants.js";
const dbg = createDebugger("HandlerRegistry");

class HandlerRegistry {
  constructor() {
    this.platforms = new Map();
    this.gitProviders = new Map();
    this.aiProviders = new Map();
    this.settingsSchema = new Map();
  }

  registerPlatform(id, handler) {
    dbg.log(`Registering platform: ${id}`);
    this.platforms.set(id, handler);
  }

  registerGitProvider(id, handler) {
    dbg.log(`Registering Git provider: ${id}`);
    this.gitProviders.set(id, handler);
  }

  registerAIProvider(id, handler) {
    dbg.log(`Registering AI provider: ${id}`);
    this.aiProviders.set(id, handler);
  }

  registerSettings(id, schema) {
    dbg.log(`Registering settings schema for: ${id}`);
    this.settingsSchema.set(id, schema);
  }

  getPlatform(id) {
    return this.platforms.get(id);
  }
  getGitProvider(id) {
    return this.gitProviders.get(id);
  }
  getAIProvider(id) {
    return this.aiProviders.get(id);
  }

  getAllSettingsSchemas() {
    const schemas = Array.from(this.settingsSchema.values());

    // Add Core Settings
    schemas.push({
      id: "core",
      title: "General Settings",
      order: 0,
      description: "Core configuration for CodeLedger.",
      fields: [
        // ── Sync & Review ──────────────────────────────────────────────
        {
          key: "gitEnabled",
          label: "Enable Git Sync",
          type: "toggle",
          default: true,
          description:
            "Automatically commit solved problems to your repository.",
        },
        {
          key: "autoReview",
          label: "Enable AI Review",
          type: "toggle",
          default: true,
          description: "Automatically analyze code with AI upon completion.",
        },
        {
          key: "notifications",
          label: "Solve Notifications",
          type: "toggle",
          default: true,
          description:
            "Show a browser notification when a problem is committed.",
        },
        {
          key: "autoSync",
          label: "Sync on Startup",
          type: "toggle",
          default: true,
          description:
            "Re-sync your repository index when the extension loads.",
        },
        {
          key: "telemetryOptIn",
          label: "Anonymous Usage Stats",
          type: "toggle",
          default: true,
          description:
            "Send anonymous solve counts to help improve CodeLedger. No code or personal data is sent.",
        },
        // ── AI routing consumed by AI tab; filtered out of General view ──
        {
          key: "aiProvider",
          label: "Primary AI Provider",
          type: "select",
          default: CONSTANTS.AI_DEFAULT_PRIMARY,
          description: "Preferred AI provider to use for automated reviews.",
          options: Object.keys(CONSTANTS.AI_PROVIDERS).map((id) => ({
            value: id,
            label: CONSTANTS.AI_PROVIDERS[id].name,
          })),
        },
        {
          key: "aiSecondary",
          label: "Secondary AI Provider",
          type: "select",
          default: "",
          description: "Fallback provider to be used if the primary fails.",
          options: Object.keys(CONSTANTS.AI_PROVIDERS).map((id) => ({
            value: id,
            label: CONSTANTS.AI_PROVIDERS[id].name,
          })),
        },
        {
          key: "aiModel",
          label: "Global AI Model (optional)",
          type: "text",
          default: "",
          description:
            "Optional model name to use across providers that support a global model.",
        },
        // ── Advanced ───────────────────────────────────────────────────
        {
          key: "incognitoMode",
          label: "Incognito Mode",
          type: "select",
          default: "off",
          advanced: true,
          options: [
            { value: "off",     label: "Off" },
            { value: "1h",      label: "1 hour" },
            { value: "4h",      label: "4 hours" },
            { value: "24h",     label: "24 hours" },
            { value: "forever", label: "Indefinitely" },
          ],
          description:
            "Pause recording and committing for a set duration. Solves during this window are silently skipped.",
        },
        {
          key: "commitMessageTemplate",
          label: "Commit Message Template",
          type: "text",
          default: CONSTANTS.COMMIT_MESSAGE_TEMPLATE,
          advanced: true,
          placeholder: "[{topic}] {title} — {difficulty} | {language}",
          description:
            "Variables: {title}, {topic}, {difficulty}, {language}, {platform}.",
        },
        {
          key: "debugMode",
          label: "Debug Logging",
          type: "toggle",
          default: false,
          advanced: true,
          description:
            "Show detailed console logs from all CodeLedger handlers. Reload the page after toggling.",
        },
      ],
    });

    return schemas.sort((a, b) => a.order - b.order);
  }
}

export const registry = new HandlerRegistry();
