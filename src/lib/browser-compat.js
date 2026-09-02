/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * This file is the ONLY place that touches chrome.* or browser.* directly.
 * Everything else in the codebase imports from this file.
 */

// @ts-ignore
export const ext =
  typeof browser !== "undefined" && browser.runtime
    ? // @ts-ignore
      browser
    : typeof chrome !== "undefined"
      ? chrome
      : {};

// Helper to provide a mock storage for local dev server
const mockStorage = {
  get: async (keys) => {
    try {
      const all = JSON.parse(localStorage.getItem("cl_mock_storage") || "{}");
      if (!keys) return all;
      if (typeof keys === "string") return { [keys]: all[keys] };
      const res = {};
      keys.forEach((k) => {
        res[k] = all[k];
      });
      return res;
    } catch {
      return {};
    }
  },
  set: async (items) => {
    try {
      const all = JSON.parse(localStorage.getItem("cl_mock_storage") || "{}");
      Object.assign(all, items);
      localStorage.setItem("cl_mock_storage", JSON.stringify(all));
    } catch {}
  },
  remove: async (keys) => {
    try {
      const all = JSON.parse(localStorage.getItem("cl_mock_storage") || "{}");
      const ks = Array.isArray(keys) ? keys : [keys];
      ks.forEach((k) => {
        delete all[k];
      });
      localStorage.setItem("cl_mock_storage", JSON.stringify(all));
    } catch {}
  },
};

// Promisify callback-based chrome APIs for Firefox compatibility
export const storage = {
  local: ext.storage?.local
    ? {
        get: (keys) =>
          new Promise((resolve, reject) => {
            ext.storage.local.get(keys, (result) => {
              if (ext.runtime?.lastError) reject(ext.runtime.lastError);
              else resolve(result);
            });
          }),
        set: (items) =>
          new Promise((resolve, reject) => {
            ext.storage.local.set(items, () => {
              if (ext.runtime?.lastError) reject(ext.runtime.lastError);
              else resolve();
            });
          }),
        remove: (keys) =>
          new Promise((resolve, reject) => {
            ext.storage.local.remove(keys, () => {
              if (ext.runtime?.lastError) reject(ext.runtime.lastError);
              else resolve();
            });
          }),
      }
    : mockStorage,
  session: ext.storage?.session
    ? {
        get: (keys) =>
          new Promise((resolve, reject) => {
            ext.storage.session.get(keys, (result) => {
              if (ext.runtime?.lastError) reject(ext.runtime.lastError);
              else resolve(result);
            });
          }),
        set: (items) =>
          new Promise((resolve, reject) => {
            ext.storage.session.set(items, () => {
              if (ext.runtime?.lastError) reject(ext.runtime.lastError);
              else resolve();
            });
          }),
      }
    : mockStorage,
};

export const runtime = ext.runtime || {
  sendMessage: async () => {},
  onMessage: { addListener: () => {}, removeListener: () => {} },
  getURL: (path) => `/${path}`, // Mock for dev
};
export const tabs = ext.tabs || {
  create: ({ url }) => window.open(url, "_blank"),
};
export const windows = ext.windows || null;

/**
 * Open `url`, reusing a tab that already shows that page instead of stacking a
 * duplicate.
 *
 * The match is on everything before `?` or `#`, so a link to
 * `library.html?tab=settings` finds an open `library.html?tab=solutions` and
 * re-points it rather than opening a second library. The trailing `*` is needed
 * because a match pattern's path is compared against the path *and* the query
 * string — without it a page carrying params would never match itself.
 *
 * Focusing the tab is not enough on its own: a tab in a background window goes
 * active but stays out of sight, which reads as "the button did nothing". So the
 * window is raised too, optional-chained because Firefox for Android has no
 * `windows` API. Any failure falls through to plain `create`, which is also what
 * happens outside the extension, where `tabs` is the `window.open` mock.
 */
export async function openOrFocusTab(url) {
  const base = String(url).split("#")[0].split("?")[0];
  try {
    const found = (await tabs.query?.({ url: `${base}*` })) || [];
    const hit = found[0];
    if (hit && hit.id != null) {
      await tabs.update?.(hit.id, hit.url === url ? { active: true } : { active: true, url });
      if (hit.windowId != null) await windows?.update?.(hit.windowId, { focused: true });
      return hit.id;
    }
  } catch (_) {
    // No tabs.query (dev mock, or the permission was dropped) — fall through.
  }
  const created = await tabs.create({ url });
  return created?.id ?? null;
}

export const alarms = ext.alarms || null;
export const action = ext.action || ext.browserAction || null;
export const sidePanel = ext.sidePanel || null;
export const sidebar = ext.sidebarAction || null;
