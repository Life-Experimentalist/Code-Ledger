/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * `updateQueryParams` is how the library consumes a one-shot instruction from
 * its own URL. `?openSetup=true` in particular has to be gone by the end of the
 * mount effect, for two reasons that both look like "the button is broken":
 *
 *   - reloading the tab re-opens the onboarding modal, forever;
 *   - `openOrFocusTab` only navigates when the wanted URL differs from the one
 *     already open, so a second "Set up repository" click from the welcome page
 *     just focuses the tab. No navigation, no remount, no modal.
 *
 * Deleting on `null` is what makes both go away, so it is pinned here rather
 * than left as an implementation detail of a function with no other tests.
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

let current;

globalThis.window = {
  get location() {
    const u = new URL(current);
    return { pathname: u.pathname, search: u.search, hash: u.hash };
  },
  history: {
    replaceState: (_s, _t, next) => {
      current = new URL(next, current).href;
    },
    pushState: (_s, _t, next) => {
      current = new URL(next, current).href;
    },
  },
};

const { getQueryParam, updateQueryParams } = await import("../src/core/url-state.js");

const search = () => new URL(current).search;

beforeEach(() => {
  current = "chrome-extension://abc/library/library.html";
});

describe("updateQueryParams", () => {
  test("removes a key set to null", () => {
    current = "chrome-extension://abc/library/library.html?tab=settings&openSetup=true";

    updateQueryParams({ openSetup: null });

    assert.equal(search(), "?tab=settings");
    assert.equal(getQueryParam("openSetup"), "");
  });

  test("removes a key set to the empty string", () => {
    current = "chrome-extension://abc/library/library.html?tab=search&q=two+sum";

    updateQueryParams({ q: "" });

    assert.equal(search(), "?tab=search");
  });

  test("leaves the other params alone while removing one", () => {
    current =
      "chrome-extension://abc/library/library.html?tab=settings&settingsTab=git&openSetup=true";

    updateQueryParams({ openSetup: null });

    // This exact URL is what the welcome page asks for, minus the one-shot
    // param — so a repeat click differs from it and really does navigate.
    assert.equal(search(), "?tab=settings&settingsTab=git");
  });

  test("sets and overwrites values", () => {
    updateQueryParams({ tab: "analytics" });
    assert.equal(getQueryParam("tab"), "analytics");

    updateQueryParams({ tab: "graph" });
    assert.equal(getQueryParam("tab"), "graph");
    assert.equal(search(), "?tab=graph");
  });

  test("keeps the hash", () => {
    current = "chrome-extension://abc/library/library.html?openSetup=true#top";

    updateQueryParams({ openSetup: null });

    assert.equal(new URL(current).hash, "#top");
  });

  test("a falsy-but-real value survives — 0 is not a deletion", () => {
    updateQueryParams({ page: 0 });

    assert.equal(getQueryParam("page"), "0");
  });
});
