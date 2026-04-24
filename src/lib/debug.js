/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const DEBUG_KEY = 'codeledger.debug';

// Read debug state synchronously from storage
let _debugEnabled = false;

// Called once at extension startup from service-worker.js
export async function initDebug() {
  try {
    const res = await import('./browser-compat.js').then(m => m.storage.local.get(DEBUG_KEY));
    _debugEnabled = res[DEBUG_KEY] === true;
  } catch (_) {
    _debugEnabled = false;
  }
}

export function setDebug(enabled) {
  _debugEnabled = enabled;
}

export function isDebugEnabled() {
  return _debugEnabled;
}

function noop() {}

/**
 * Returns a debug object whose methods show correct caller context.
 * @param {string} namespace 
 */
export function createDebugger(namespace) {
  const prefix = `[CodeLedger:${namespace}]`;

  return {
    get log()   { return _debugEnabled ? console.log.bind(console, prefix)   : noop; },
    get warn()  { return _debugEnabled ? console.warn.bind(console, prefix)  : noop; },
    get error() { return _debugEnabled ? console.error.bind(console, prefix) : noop; },
    get info()  { return _debugEnabled ? console.info.bind(console, prefix)  : noop; },
    get table() { return _debugEnabled ? console.table.bind(console, prefix) : noop; },
    get group() { return _debugEnabled ? console.group.bind(console, prefix) : noop; },
    get groupEnd() { return _debugEnabled ? console.groupEnd.bind(console)   : noop; },
  };
}

export const coreDebug = createDebugger('Core');
