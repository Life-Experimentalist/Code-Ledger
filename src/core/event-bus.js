/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from '../lib/debug.js';
import { runtime } from '../lib/browser-compat.js';

const dbg = createDebugger('EventBus');

class EventBus {
  constructor() {
    this.listeners = new Map();

    // Listen for events forwarded across context boundaries (content <-> background)
    if (runtime && runtime.onMessage) {
      runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg && msg.type === 'EB_EMIT' && msg.event) {
          dbg.log(`Received cross-context event: ${msg.event}`);
          this.emit(msg.event, msg.data, false);
        }
      });
    }
  }

  /**
   * Subscribe to an event.
   * @param {string} event 
   * @param {Function} callback 
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event.
   * @param {string} event 
   * @param {Function} callback 
   */
  off(event, callback) {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
    }
  }

  /**
   * Emit an event.
   * @param {string} event 
   * @param {any} data 
   * @param {boolean} broadcast Whether to broadcast to other extension contexts
   */
  emit(event, data, broadcast = true) {
    dbg.log(`Emitting event: ${event}`, data);
    const set = this.listeners.get(event);
    if (set) {
      set.forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          dbg.error(`Error in listener for ${event}`, err);
        }
      });
    }

    if (broadcast && runtime && runtime.sendMessage) {
      runtime.sendMessage({ type: 'EB_EMIT', event, data }).catch(() => {
        // Ignore "receiving end does not exist" errors when UI is closed
      });
    }
  }
}

export const eventBus = new EventBus();
