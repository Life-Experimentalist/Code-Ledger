/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Platform-agnostic modal tab registry.
 *
 * @ts-check
 */

import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("ModalTabRegistry");

/**
 *
 * Usage (in a platform handler or handler init):
 *   import { modalTabRegistry } from "../../../core/modal-tab-registry.js";
 *   modalTabRegistry.register("leetcode", [
 *     { id: "overview", label: "Overview", always: true, render: (problem, ctx) => html`...` },
 *     { id: "code", label: "Code", show: (p) => !!p.code, render: (problem, ctx) => html`...` },
 *   ]);
 *
 * Tab definition shape:
 *   id:     string            — unique tab identifier
 *   label:  string | fn(p)   — tab button text (can be a function for dynamic labels)
 *   show:   fn(problem)       — return false to hide this tab (optional, defaults to always show)
 *   render: fn(problem, ctx)  — returns htm template string
 *
 * ctx shape (passed to render):
 *   { html, useState, useEffect, isExtension, onClose, onUpdate, onDelete }
 */

class ModalTabRegistry {
    constructor() {
        this._tabs = new Map(); // platform → [{id, label, show, render}]
    }

    /**
     * Register tabs for a platform.
     * Use platform = "*" for tabs that appear on all platforms.
     * Platform-specific tabs are appended after global "*" tabs.
     */
    register(platform, tabs) {
        this._tabs.set(platform, tabs);
    }

    /**
     * Return the resolved tab list for a problem.
     * Order: global "*" tabs first, then platform-specific tabs.
     * Tabs with show(problem) === false are excluded.
     */
    getTabs(platform, problem) {
        const global = this._tabs.get("*") || [];
        const specific = this._tabs.get(platform) || [];
        // Platform-specific tabs override global "*" tabs with the same id
        const specificIds = new Set(specific.map((t) => t.id));
        const merged = [
            ...global.filter((t) => !specificIds.has(t.id)),
            ...specific,
        ];
        return merged.filter((tab) => !tab.show || tab.show(problem));
    }

    /** Return a tab's render function by id and platform. Platform-specific overrides global. */
    getRenderer(platform, tabId) {
        const specific = this._tabs.get(platform) || [];
        const fromSpecific = specific.find((t) => t.id === tabId);
        if (fromSpecific) return fromSpecific.render;
        const global = this._tabs.get("*") || [];
        return global.find((t) => t.id === tabId)?.render || null;
    }
}

export const modalTabRegistry = new ModalTabRegistry();
