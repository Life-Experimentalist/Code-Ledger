/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../lib/debug.js";
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
    const handler = this.platforms.get(id);
    dbg.log(`getPlatform(${id}): ${handler ? "✓ found" : "NOT found"}`);
    return handler;
  }

  getGitProvider(id) {
    const handler = this.gitProviders.get(id);
    dbg.log(`getGitProvider(${id}): ${handler ? "✓ found" : "NOT found"}`);
    return handler;
  }

  getAIProvider(id) {
    const handler = this.aiProviders.get(id);
    dbg.log(`getAIProvider(${id}): ${handler ? "✓ found" : "NOT found"}`);
    return handler;
  }
}

export const registry = new HandlerRegistry();
