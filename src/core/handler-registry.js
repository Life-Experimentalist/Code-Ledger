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
          description: "Automatically analyze code using AI upon completion.",
        },
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
      ],
    });

    return schemas.sort((a, b) => a.order - b.order);
  }
}

export const registry = new HandlerRegistry();
