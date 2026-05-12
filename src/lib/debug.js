/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CONSTANTS } from '../core/constants.js';

const DEBUG_KEY = 'codeledger.debug';

let _debugEnabled = false;

// Called once at extension startup (service-worker) and in handler-loader (content script).
export async function initDebug() {
  // Constants override takes priority — useful during local development.
  if (CONSTANTS.DEBUG_OVERRIDE !== null && CONSTANTS.DEBUG_OVERRIDE !== undefined) {
    _debugEnabled = !!CONSTANTS.DEBUG_OVERRIDE;
    // ensure console hooks are updated when override is set
    _updateConsoleHooks();
    return;
  }
  try {
    const res = await import('./browser-compat.js').then(m => m.storage.local.get(DEBUG_KEY));
    _debugEnabled = res[DEBUG_KEY] === true;
  } catch (_) {
    _debugEnabled = !!CONSTANTS.DEBUG_DEFAULT;
  }
  _updateConsoleHooks();
}

export function setDebug(enabled) {
  // If a constant override is set, ignore runtime changes
  if (CONSTANTS.DEBUG_OVERRIDE !== null && CONSTANTS.DEBUG_OVERRIDE !== undefined) {
    _debugEnabled = !!CONSTANTS.DEBUG_OVERRIDE;
  } else {
    _debugEnabled = !!enabled;
  }
  _updateConsoleHooks();
}

export function isDebugEnabled() {
  return _debugEnabled;
}

function noop() { }

/**
 * Returns a debug object whose methods show correct caller context.
 * @param {string} namespace
 */
export function createDebugger(namespace) {
  const prefix = `[CodeLedger:${namespace}]`;

  return {
    get log() { return _debugEnabled ? console.log.bind(console, prefix) : noop; },
    get warn() { return _debugEnabled ? console.warn.bind(console, prefix) : noop; },
    get error() { return _debugEnabled ? console.error.bind(console, prefix) : noop; },
    get info() { return _debugEnabled ? console.info.bind(console, prefix) : noop; },
    get table() { return _debugEnabled ? console.table.bind(console, prefix) : noop; },
    get group() { return _debugEnabled ? console.group.bind(console, prefix) : noop; },
    get groupEnd() { return _debugEnabled ? console.groupEnd.bind(console) : noop; },
  };
}

// Preserve originals and provide a toggle that routes console.* through debug flag.
const _origConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  table: console.table ? console.table.bind(console) : () => { },
  group: console.group ? console.group.bind(console) : () => { },
  groupEnd: console.groupEnd ? console.groupEnd.bind(console) : () => { },
};

let _consolePatched = false;

function _updateConsoleHooks() {
  // idempotent
  if (!_consolePatched) {
    _consolePatched = true;
  }

  // When debug enabled, allow console to forward to originals; otherwise no-op.
  console.log = function (...args) {
    if (_debugEnabled) _origConsole.log(...args);
  };
  console.warn = function (...args) {
    if (_debugEnabled) _origConsole.warn(...args);
  };
  console.error = function (...args) {
    if (_debugEnabled) _origConsole.error(...args);
  };
  console.info = function (...args) {
    if (_debugEnabled) _origConsole.info(...args);
  };
  console.table = function (...args) {
    if (_debugEnabled && _origConsole.table) _origConsole.table(...args);
  };
  console.group = function (...args) {
    if (_debugEnabled && _origConsole.group) _origConsole.group(...args);
  };
  console.groupEnd = function (...args) {
    if (_debugEnabled && _origConsole.groupEnd) _origConsole.groupEnd(...args);
  };
}

export const coreDebug = createDebugger('Core');
