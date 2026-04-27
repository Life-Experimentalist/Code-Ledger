/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function getQueryParams() {
  try {
    return new URLSearchParams(window.location.search || "");
  } catch (e) {
    return new URLSearchParams();
  }
}

export function getQueryParam(key, fallback = "") {
  const params = getQueryParams();
  const value = params.get(key);
  return value == null ? fallback : value;
}

export function updateQueryParams(partial, options = {}) {
  const replace = options.replace !== false;
  const params = getQueryParams();

  Object.entries(partial || {}).forEach(([key, value]) => {
    if (value == null || value === "") {
      params.delete(key);
      return;
    }
    params.set(key, String(value));
  });

  const next = `${window.location.pathname}?${params.toString()}${window.location.hash || ""}`;
  if (replace) {
    window.history.replaceState(null, "", next);
    return;
  }
  window.history.pushState(null, "", next);
}

export function buildSettingsHref({
  tab = "settings",
  settingsTab,
  settingsSection,
  settingsProvider,
  settingsAdvanced,
  q,
} = {}) {
  const params = new URLSearchParams();
  if (tab) params.set("tab", tab);
  if (settingsTab) params.set("settingsTab", settingsTab);
  if (settingsSection) params.set("settingsSection", settingsSection);
  if (settingsProvider) params.set("settingsProvider", settingsProvider);
  if (settingsAdvanced)
    params.set("settingsAdvanced", String(settingsAdvanced));
  if (q) params.set("q", q);
  return `${window.location.pathname}?${params.toString()}`;
}
