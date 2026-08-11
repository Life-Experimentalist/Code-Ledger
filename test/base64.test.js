/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Eleven places read files back out of a GitHub repository, and every one of
 * them used to decode with bare `atob`. That is correct only for ASCII, so a
 * problem title with an accent, a comment written in another language, or an
 * emoji in a note came back mangled — and then got committed in its mangled
 * form on the next sync, which is how one bad character becomes permanent.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { decodeBase64Utf8 } from "../src/lib/base64.js";

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

describe("decodeBase64Utf8", () => {
  test("round-trips text no matter what alphabet it is in", () => {
    for (const s of [
      "plain ascii",
      "Café — Nº 1",
      "日本語のコメント",
      "emoji 🎯✓🚀 and a combining é",
      "тест",
      'a "quoted" \\ backslash \n newline',
    ]) {
      assert.equal(decodeBase64Utf8(b64(s)), s);
    }
  });

  test("tolerates the line wrapping the contents API adds", () => {
    const wrapped = b64("Café ✓").replace(/(.{4})/g, "$1\n");
    assert.equal(decodeBase64Utf8(wrapped), "Café ✓");
  });

  test("empty, blank, null and undefined all decode to the empty string", () => {
    for (const v of ["", "   ", null, undefined]) {
      assert.equal(decodeBase64Utf8(v), "");
    }
  });

  test("JSON survives, which is what every caller actually parses", () => {
    const obj = { problems: [{ title: "Nº 1 — Café ✓", tags: ["数学"] }] };
    assert.deepEqual(JSON.parse(decodeBase64Utf8(b64(JSON.stringify(obj)))), obj);
  });
});
