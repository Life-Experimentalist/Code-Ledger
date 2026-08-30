/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Which clicks the injected buttons answer to.
 *
 * Content scripts share the page's DOM, so the platform page can reach our
 * buttons by id and call `.click()` on them. The handlers behind the import
 * and sync buttons read the current solution and commit it to the user's
 * repository, so a page that can do that can drive commits the user never
 * asked for, repeatedly, with nothing on screen to show for it.
 *
 * The second half of this file is the part that decays: it asserts that the
 * repo-writing buttons still go through the guard. A future button wired with
 * a bare `addEventListener` would be exploitable and would not fail any test
 * about the helper itself.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { onTrustedClick } from "../src/lib/trusted-click.js";

/** Minimal stand-in for an element: records listeners, dispatches to them. */
function fakeButton() {
  const listeners = [];
  return {
    addEventListener: (type, fn) => {
      if (type === "click") listeners.push(fn);
    },
    /** Dispatch an event as the browser would, with isTrusted already set. */
    dispatch: (isTrusted) => {
      const e = { type: "click", isTrusted, stopPropagation() {} };
      for (const fn of listeners) fn(e);
    },
  };
}

describe("onTrustedClick", () => {
  test("runs the handler for a real user click", () => {
    const btn = fakeButton();
    let ran = 0;
    onTrustedClick(btn, () => ran++);
    btn.dispatch(true);
    assert.equal(ran, 1);
  });

  test("ignores a click the page synthesized", () => {
    // This is what `btn.click()` from page script produces: the browser sets
    // isTrusted to false on anything script dispatches, and it is read-only.
    const btn = fakeButton();
    let ran = 0;
    onTrustedClick(btn, () => ran++);
    btn.dispatch(false);
    assert.equal(ran, 0, "a script-dispatched click reached the handler");
  });

  test("a rejected click does not disarm the button", () => {
    // The listener stays attached, so the user can still press it afterwards.
    const btn = fakeButton();
    let ran = 0;
    onTrustedClick(btn, () => ran++);
    btn.dispatch(false);
    btn.dispatch(true);
    assert.equal(ran, 1);
  });

  test("passes the event through so handlers can stop propagation", () => {
    // The GeeksForGeeks buttons sit inside the platform's own clickable rows
    // and call e.stopPropagation(); losing the event would navigate the page.
    const btn = fakeButton();
    let seen = null;
    onTrustedClick(btn, (e) => {
      seen = e;
    });
    btn.dispatch(true);
    assert.equal(seen?.type, "click");
    assert.equal(typeof seen.stopPropagation, "function");
  });

  test("returns what the handler returns", () => {
    // Several call sites pass an async handler; swallowing the promise would
    // make a rejection unobservable rather than an unhandled rejection.
    const btn = fakeButton();
    let captured;
    const el = {
      addEventListener: (_t, fn) => {
        captured = fn;
      },
    };
    onTrustedClick(el, async () => "done");
    assert.equal(typeof captured, "function");
    void btn;
    return captured({ isTrusted: true }).then((v) => assert.equal(v, "done"));
  });
});

describe("the buttons that write to the repository use the guard", () => {
  // path → how many guarded clicks it should have.
  const GUARDED = {
    "src/handlers/platforms/codeforces/profile-import.js": 1,
    "src/handlers/platforms/geeksforgeeks/profile-import.js": 2,
    "src/handlers/platforms/geeksforgeeks/index.js": 3,
    "src/handlers/platforms/leetcode/profile-import.js": 2,
    "src/handlers/platforms/leetcode/ui-injection.js": 2,
  };

  for (const [path, count] of Object.entries(GUARDED)) {
    test(`${path} keeps its ${count} guarded button(s)`, () => {
      const src = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
      const found = [...src.matchAll(/onTrustedClick\(/g)].length;
      assert.equal(
        found,
        count,
        "a repo-writing button lost its guard, or a new one was added without a test",
      );
      assert.ok(
        src.includes("trusted-click.js"),
        "the guard must be imported, not assumed to be global",
      );
    });
  }

  // Raw click listeners that are deliberately NOT guarded, and why. The guard
  // is only worth attaching where a forged click writes to the repository;
  // adding it everywhere would be hardening for its own sake, and on a
  // listener attached to the platform's own submit button it would break real
  // submissions, since a site may click its own button programmatically.
  const UNGUARDED = {
    // Opens the library tab or the user's GitHub repo. A forged click is a
    // popup, not a commit.
    "src/handlers/platforms/leetcode/ui-injection.js": 1,
  };

  test("the unguarded listeners in these files are only the known ones", () => {
    for (const path of Object.keys(GUARDED)) {
      const src = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
      const raw = [...src.matchAll(/addEventListener\(\s*["']click["']/g)].length;
      assert.equal(
        raw,
        UNGUARDED[path] || 0,
        `${path} has an unaccounted raw click listener — guard it, or record why it does not need the guard`,
      );
    }
  });
});
