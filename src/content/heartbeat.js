/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from '../lib/debug.js';
const dbg = createDebugger('Heartbeat');

let heartbeatPort = null;

function connectHeartbeat() {
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    dbg.warn(`connectHeartbeat(): chrome.runtime unavailable`);
    return;
  }
  dbg.log(`connectHeartbeat(): connecting to background service worker...`);
  heartbeatPort = chrome.runtime.connect({ name: 'heartbeat' });
  dbg.log(`connectHeartbeat(): ✓ port connected`);

  heartbeatPort.onDisconnect.addListener(() => {
    dbg.warn(`connectHeartbeat(): port disconnected, restarting in 5s...`);
    heartbeatPort = null;
    setTimeout(connectHeartbeat, 5000);
  });
}

dbg.log(`Heartbeat module loaded, initializing first connection...`);
connectHeartbeat();

// Send periodic heartbeat pings to keep the background service worker alive
const heartbeatInterval = setInterval(() => {
  if (heartbeatPort) {
    try {
      heartbeatPort.postMessage({ ping: true });
    } catch (e) {
      dbg.warn(`Heartbeat ping error:`, e?.message);
      connectHeartbeat();
    }
  }
}, 20000);
