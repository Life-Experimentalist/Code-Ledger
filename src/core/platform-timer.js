/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unified solve-time abstraction for all platform handlers.
 *
 * Handlers that have a native timer in their UI override getNativeElapsed().
 * Handlers without a native timer call startFloating() to show the draggable overlay.
 * getElapsedSeconds() tries native first, then the floating timer.
 */

import { createFloatingTimer } from "../ui/floating-timer.js";

export class PlatformTimer {
    constructor() {
        this._float = null;
    }

    /**
     * Spawn the floating overlay timer.
     * @param {string} slug  — unique key used to persist timer state in sessionStorage
     * @param {object} opts  — forwarded to createFloatingTimer (autoStart, position)
     */
    startFloating(slug, opts = {}) {
        this.stopFloating();
        this._float = createFloatingTimer(slug, { autoStart: true, ...opts });
        return this._float;
    }

    stopFloating() {
        if (this._float) {
            this._float.destroy?.();
            this._float = null;
        }
    }

    /**
     * Override in handlers that expose a native timer element in the platform UI.
     * Must return elapsed seconds as a number, or null if unavailable.
     * @returns {number|null}
     */
    getNativeElapsed() {
        return null;
    }

    /**
     * Returns elapsed seconds from the best available source.
     * Native timer takes priority over the floating overlay.
     * @returns {number|null}
     */
    getElapsedSeconds() {
        const native = this.getNativeElapsed();
        if (native !== null) return native;
        const ms = this._float?.getElapsed?.() ?? 0;
        return ms > 0 ? Math.round(ms / 1000) : null;
    }
}
