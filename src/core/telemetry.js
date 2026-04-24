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
 */
export const Telemetry = {
  async track(event, metadata = {}) {
    const { [CONSTANTS.SK.TELEMETRY_OPT_IN]: optIn } = await storage.local.get(CONSTANTS.SK.TELEMETRY_OPT_IN);
    if (optIn !== true) return;

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
