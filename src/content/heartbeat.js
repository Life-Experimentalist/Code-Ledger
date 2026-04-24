/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from '../lib/debug.js';
const dbg = createDebugger('Heartbeat');

let heartbeatPort = null;

function connectHeartbeat() {
  if (typeof chrome === 'undefined' || !chrome.runtime) return;
  heartbeatPort = chrome.runtime.connect({ name: 'heartbeat' });
  
  heartbeatPort.onDisconnect.addListener(() => {
    dbg.warn('Heartbeat port disconnected, restarting in 5s');
    setTimeout(connectHeartbeat, 5000);
  });
}

connectHeartbeat();

// Send periodic heartbeat pings to keep the background service worker alive
setInterval(() => {
  if (heartbeatPort) {
    try {
      heartbeatPort.postMessage({ ping: true });
    } catch (e) {
      connectHeartbeat();
    }
  }
}, 20000);
