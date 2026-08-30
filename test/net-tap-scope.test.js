/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * How far the MAIN-world network tap is allowed to reach.
 *
 * `content/net-tap.js` runs in the page's own world so it can wrap the page's
 * `fetch` and `XMLHttpRequest` — NeetCode and takeuforward render the verdict
 * straight out of a JSON response that an isolated-world script cannot see.
 * Running there means it shares a `window` with the page, so its messages
 * arrive on a channel the page can also write to: a page on a tapped host can
 * post a well-formed message describing an accepted submission, and the
 * handler will commit source of the page's choosing to the user's repository.
 *
 * That cannot be fixed with a shared secret. Both halves would have to agree
 * one over `window`, where every `message` listener on the page hears it, and
 * the isolated half runs at `document_idle` — after the page's own scripts —
 * so there is no moment when a handshake would be private. A nonce would look
 * like a defence and be none.
 *
 * The mitigation that does hold is the injection scope: the tap reaches only
 * the two hosts that need it, only the top frame. Widening `matches` would
 * hand that forgery to every site the pattern covers, and it is a one-line
 * change in a file nobody reads closely. Hence this test.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const MANIFESTS = ["src/manifest-chromium.json", "src/manifest-firefox.json"];

/** The only hosts whose verdict is unreadable without tapping the network. */
const ALLOWED = ["*://*.neetcode.io/*", "*://*.takeuforward.org/*"];

for (const path of MANIFESTS) {
  describe(path, () => {
    const manifest = JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
    const mainWorld = (manifest.content_scripts || []).filter((cs) => cs.world === "MAIN");

    test("declares exactly one MAIN-world content script", () => {
      // Anything running in the page's world can read and rewrite the page's
      // network traffic. A second one should be a deliberate decision.
      assert.equal(mainWorld.length, 1);
      assert.deepEqual(mainWorld[0].js, ["content/net-tap.js"]);
    });

    test("the tap reaches only the two hosts that need it", () => {
      assert.deepEqual([...mainWorld[0].matches].sort(), [...ALLOWED].sort());
    });

    test("the tap does not run in subframes", () => {
      // all_frames would put it in every ad and embed on those pages.
      assert.notEqual(mainWorld[0].all_frames, true);
    });

    test("no content script is registered against every site", () => {
      for (const cs of manifest.content_scripts || []) {
        for (const m of cs.matches || []) {
          assert.ok(
            !/^(\*:\/\/\*\/\*|<all_urls>|\*:\/\/\*\.\*\/\*)$/.test(m),
            `${cs.js?.join(",")} matches ${m}`,
          );
        }
      }
    });
  });
}

describe("net-tap.js — what it forwards", () => {
  const src = readFileSync(new URL("../src/content/net-tap.js", import.meta.url), "utf8");

  test("forwards only the listed judge endpoints", () => {
    // The tap sees every request the page makes. It must decide what to
    // forward by an allow-list, never by forwarding and filtering later.
    assert.ok(/function isWatched\(url\)/.test(src));
    assert.ok(src.includes("if (!isWatched(url)) return promise;"), "fetch must bail before it reads anything");
    assert.ok(src.includes("if (isWatched(this.__clUrl))"), "XHR must bail before it reads anything");
  });

  test("never touches request or response headers", () => {
    // The session cookie and the bearer token live there and the handlers
    // have no use for either, so the tap must not be able to leak them even
    // by accident. The file's own prose says so; this checks the code, which
    // means stripping the comments that say it first.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    assert.ok(!/\bheaders\b/i.test(code), "net-tap.js reads headers; it must not");
    assert.ok(!/getAllResponseHeaders|getResponseHeader|setRequestHeader/.test(code));
  });

  test("posts to its own origin, not a wildcard", () => {
    assert.ok(src.includes("window.location.origin"), "the target origin must be explicit");
    assert.ok(!/postMessage\([^)]*,\s*["']\*["']/.test(src), "a wildcard target origin");
  });
});
