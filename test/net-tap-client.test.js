/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * `parseTapMessage` is the security boundary between the page's world and the
 * extension's, so these tests are about what it REJECTS at least as much as
 * what it accepts.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { parseTapMessage, parseJsonSafe } from "../src/lib/net-tap-client.js";

const WIN = { location: { origin: "https://neetcode.io" } };

/** A well-formed event, with `over` merged into its data. */
function ev(over = {}, opts = {}) {
  return {
    source: opts.source !== undefined ? opts.source : WIN,
    origin: opts.origin !== undefined ? opts.origin : "https://neetcode.io",
    data: {
      source: "codeledger-net-tap",
      url: "https://neetcode.io/api/executeCodeFunctionHttp",
      status: 200,
      requestBody: '{"code":"x"}',
      responseBody: '{"ok":true}',
      at: 1_700_000_000_000,
      ...over,
    },
  };
}

const CTX = { window: WIN, origin: "https://neetcode.io" };

describe("parseTapMessage", () => {
  test("accepts a well-formed message from the same frame and origin", () => {
    const out = parseTapMessage(ev(), CTX);
    assert.ok(out);
    assert.equal(out.url, "https://neetcode.io/api/executeCodeFunctionHttp");
    assert.equal(out.status, 200);
    assert.equal(out.requestBody, '{"code":"x"}');
    assert.equal(out.at, 1_700_000_000_000);
  });

  test("rejects a message from another frame", () => {
    // An iframe posting into us is not our tap, however well-formed it looks.
    assert.equal(parseTapMessage(ev({}, { source: { other: true } }), CTX), null);
  });

  test("rejects a message from another origin", () => {
    assert.equal(parseTapMessage(ev({}, { origin: "https://evil.example" }), CTX), null);
  });

  test("rejects a message on a different channel", () => {
    assert.equal(parseTapMessage(ev({ source: "something-else" }), CTX), null);
  });

  test("rejects a message with no channel marker at all", () => {
    assert.equal(parseTapMessage(ev({ source: undefined }), CTX), null);
  });

  test("rejects a message whose url is missing or not a string", () => {
    assert.equal(parseTapMessage(ev({ url: undefined }), CTX), null);
    assert.equal(parseTapMessage(ev({ url: "" }), CTX), null);
    assert.equal(parseTapMessage(ev({ url: 42 }), CTX), null);
  });

  test("rejects non-object events and payloads", () => {
    assert.equal(parseTapMessage(null, CTX), null);
    assert.equal(parseTapMessage("nope", CTX), null);
    assert.equal(
      parseTapMessage({ source: WIN, origin: "https://neetcode.io", data: null }, CTX),
      null,
    );
    assert.equal(
      parseTapMessage({ source: WIN, origin: "https://neetcode.io", data: "str" }, CTX),
      null,
    );
  });

  test("normalises non-string bodies to null rather than passing them through", () => {
    const out = parseTapMessage(ev({ requestBody: { a: 1 }, responseBody: 7 }), CTX);
    assert.ok(out);
    assert.equal(out.requestBody, null);
    assert.equal(out.responseBody, null);
  });

  test("defaults a missing status to 0", () => {
    const out = parseTapMessage(ev({ status: undefined }), CTX);
    assert.equal(out.status, 0);
  });
});

describe("parseJsonSafe", () => {
  test("parses valid JSON", () => {
    assert.deepEqual(parseJsonSafe('{"a":1}'), { a: 1 });
  });

  test("returns null instead of throwing on anything else", () => {
    assert.equal(parseJsonSafe("not json"), null);
    assert.equal(parseJsonSafe(""), null);
    assert.equal(parseJsonSafe(null), null);
    assert.equal(parseJsonSafe(undefined), null);
    assert.equal(parseJsonSafe(5), null);
  });
});
