/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// This file is the ONLY place that touches chrome.* or browser.* directly.
// Everything else in the codebase imports from this file.
// @ts-ignore
export const ext = (typeof browser !== 'undefined' && browser.runtime)
  // @ts-ignore
  ? browser
  : (typeof chrome !== 'undefined' ? chrome : {});

// Helper to provide a mock storage for local dev server
const mockStorage = {
  get: async (keys) => {
    try {
      const all = JSON.parse(localStorage.getItem('cl_mock_storage') || '{}');
      if (!keys) return all;
      if (typeof keys === 'string') return { [keys]: all[keys] };
      const res = {};
      keys.forEach(k => { res[k] = all[k]; });
      return res;
    } catch { return {}; }
  },
  set: async (items) => {
    try {
      const all = JSON.parse(localStorage.getItem('cl_mock_storage') || '{}');
      Object.assign(all, items);
      localStorage.setItem('cl_mock_storage', JSON.stringify(all));
    } catch {}
  },
  remove: async (keys) => {
    try {
      const all = JSON.parse(localStorage.getItem('cl_mock_storage') || '{}');
      const ks = Array.isArray(keys) ? keys : [keys];
      ks.forEach(k => { delete all[k]; });
      localStorage.setItem('cl_mock_storage', JSON.stringify(all));
    } catch {}
  }
};

// Promisify callback-based chrome APIs for Firefox compatibility
export const storage = {
  local: ext.storage?.local ? {
    get: (keys) => new Promise((resolve, reject) => {
      ext.storage.local.get(keys, (result) => {
        if (ext.runtime?.lastError) reject(ext.runtime.lastError);
        else resolve(result);
      });
    }),
    set: (items) => new Promise((resolve, reject) => {
      ext.storage.local.set(items, () => {
        if (ext.runtime?.lastError) reject(ext.runtime.lastError);
        else resolve();
      });
    }),
    remove: (keys) => new Promise((resolve, reject) => {
      ext.storage.local.remove(keys, () => {
        if (ext.runtime?.lastError) reject(ext.runtime.lastError);
        else resolve();
      });
    }),
  } : mockStorage,
  session: ext.storage?.session ? {
    get: (keys) => new Promise((resolve, reject) => {
      ext.storage.session.get(keys, (result) => {
        if (ext.runtime?.lastError) reject(ext.runtime.lastError);
        else resolve(result);
      });
    }),
    set: (items) => new Promise((resolve, reject) => {
      ext.storage.session.set(items, () => {
        if (ext.runtime?.lastError) reject(ext.runtime.lastError);
        else resolve();
      });
    }),
  } : mockStorage,
};

export const runtime = ext.runtime || { 
  sendMessage: async () => {}, 
  onMessage: { addListener: () => {} },
  getURL: (path) => `/${path}` // Mock for dev
};
export const tabs = ext.tabs || { create: ({url}) => window.open(url, '_blank') };
export const alarms = ext.alarms || null;
export const action = ext.action || ext.browserAction || null;
export const sidePanel = ext.sidePanel || null;
export const sidebar = ext.sidebarAction || null;
