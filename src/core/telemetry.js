/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { storage } from '../lib/browser-compat.js';
import { CONSTANTS } from './constants.js';
import { createDebugger } from '../lib/debug.js';
const dbg = createDebugger('Telemetry');

/**
 * CFlair-Counter integration for anonymous telemetry.
 * Opt-in is controlled by `settings.telemetryOptIn` (default: true per schema).
 */
export const Telemetry = {
  async track(event, metadata = {}) {
    const { settings } = await storage.local.get('settings').catch(() => ({}));
    const optIn = settings?.telemetryOptIn ?? true;
    if (!optIn) return;

    dbg.log(`Tracking event: ${event}`, metadata);

    try {
      // Send to CFlair-Counter
      const url = `${CONSTANTS.URLS.TELEMETRY}/api/v1/counter/${event}/hit`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: CONSTANTS.VERSION,
          ...metadata
        }),
        keepalive: true // Ensure it sends even if page closes
      });
    } catch (err) {
      dbg.warn('Telemetry failed', err);
    }
  }
};
