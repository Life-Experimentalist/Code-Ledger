/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * BasePlatformHandler — shared infrastructure for all platform handlers.
 *
 * Subclasses MUST implement:
 *   init()              — page setup (MutationObserver, QoL injection, etc.)
 *   detectSubmission()  — detect an accepted submission; returns payload or null
 *   getSolutionCode()   — read current code from the editor; returns string
 *
 * Subclasses SHOULD implement:
 *   getSettingsSchema() — settings panel descriptor for this platform
 *   getDefaultPrompt()  — AI review prompt template string
 *
 * Shared utilities (call via `this.`):
 *   isEnabled(settings)          — checks settings[id + "_enable"] !== false
 *   makeProblemId(titleSlug)     — canonical problem ID for this platform
 *   emitSolved(data)             — fire "problem:solved" with platform pre-filled
 *   resolveCanonical(titleSlug)  — async canonical ID/title lookup
 *   _scheduleDebounce(fn, ms)    — replaces inline clearTimeout/setTimeout patterns
 *   safeQuery(selectors, scope)  — querySelector with array fallback
 *   extractText(selector, scope) — textContent from selector
 */

import { createDebugger } from "../../lib/debug.js";
import { PlatformTimer } from "../../core/platform-timer.js";
import { CONSTANTS } from "../../core/constants.js";
import { eventBus } from "../../core/event-bus.js";
import { canonicalMapper } from "../../core/canonical-mapper.js";

export class BasePlatformHandler {
  constructor(id, name, config) {
    this.id = id;
    this.name = name;
    this.config = config;
    this.dbg = createDebugger(`${name}Handler`);
    this._timer = new PlatformTimer();
    this._debounceTimer = null;
    // Override in subclass when the settings key doesn't follow `${id}_enable`.
    // e.g. GFGHandler sets this._enableKey = "gfg_enable"
    this._enableKey = `${id}_enable`;
  }

  // ── Shared utilities ──────────────────────────────────────────────────────

  /**
   * Check if this platform is enabled in settings.
   * Supports both new (_enabled) and legacy (_enable) keys.
   * By default, Codeforces (Alpha) is disabled, while others are enabled.
   */
  isEnabled(settings) {
    const enabledKey = `${this.id}_enabled`;
    const legacyKey =
      this.id === "geeksforgeeks"
        ? "gfg_enable"
        : this.id === "codeforces"
          ? "cf_enable"
          : `${this.id}_enable`;

    // Codeforces (Alpha) is disabled by default
    const defaultValue = this.id !== "codeforces";

    if (settings?.[enabledKey] !== undefined) {
      return settings[enabledKey] === true;
    }
    if (settings?.[legacyKey] !== undefined) {
      return settings[legacyKey] === true;
    }
    return defaultValue;
  }

  /**
   * Build a canonical problem ID for this platform.
   * Delegates to CONSTANTS.makeProblemId so the prefix scheme is centralised.
   */
  makeProblemId(titleSlug) {
    return CONSTANTS.makeProblemId(this.id, titleSlug);
  }

  /**
   * Emit the "problem:solved" event that service-worker.js listens to.
   * Automatically stamps `platform` so handlers don't have to repeat it.
   *
   * @param {object} data  Problem payload (title, code, lang, files, …)
   */
  emitSolved(data) {
    eventBus.emit("problem:solved", { ...data, platform: this.id });
  }

  /**
   * Resolve canonical ID and title for a problem.
   * Loads the canonical map on first call (cached internally).
   *
   * @param {string} titleSlug
   * @returns {Promise<{canonicalId: string, canonicalTitle: string}|null>}
   */
  async resolveCanonical(titleSlug) {
    try {
      await canonicalMapper.loadMap();
    } catch (_) {}
    return canonicalMapper.resolve(this.id, titleSlug);
  }

  /**
   * Debounced call — cancels any pending invocation and schedules a new one.
   * Uses `this._debounceTimer` so each handler instance has its own timer.
   *
   * @param {Function} fn   Function to call after delay
   * @param {number}   ms   Delay in milliseconds (default: 500)
   */
  _scheduleDebounce(fn, ms = 500) {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(fn, ms);
  }

  /**
   * Safe querySelector — accepts a single selector string or an array of
   * fallback selectors tried in order. Returns the first match or null.
   */
  safeQuery(selectors, scope = document) {
    if (typeof selectors === "string") {
      return scope.querySelector(selectors);
    }
    if (Array.isArray(selectors)) {
      for (const s of selectors) {
        const el = scope.querySelector(s);
        if (el) return el;
      }
    }
    return null;
  }

  /** Extract trimmed textContent from an element found via selector. */
  extractText(selector, scope = document) {
    const el = this.safeQuery(selector, scope);
    return el ? el.textContent.trim() : "";
  }

  // ── Abstract interface ────────────────────────────────────────────────────

  /**
   * Return the settings panel descriptor for this platform.
   * Shape: { id, title, order, fields: [...] }
   * Return null to skip settings registration.
   */
  getSettingsSchema() {
    return null;
  }

  /**
   * Return the default AI review prompt template for this platform.
   * Tokens: {title} {difficulty} {language} {platform}
   * Return null to use the global default.
   */
  getDefaultPrompt() {
    return null;
  }

  /**
   * Called by handler-loader.js after the handler is matched to the current page.
   * Set up MutationObservers, inject UI, start timers, etc.
   */
  async init() {
    throw new Error(`${this.name}Handler must implement init()`);
  }

  /**
   * Detect an accepted submission on the current page.
   * Return the submission payload object, or null if none detected.
   */
  async detectSubmission() {
    throw new Error(`${this.name}Handler must implement detectSubmission()`);
  }

  /**
   * Extract the current solution code from the page editor.
   * @returns {Promise<string>}
   */
  async getSolutionCode() {
    throw new Error(`${this.name}Handler must implement getSolutionCode()`);
  }
}
