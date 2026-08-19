/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GFG slug normalization — the slug is the URL.
 *
 * Every "open on GeeksForGeeks" link and every metadata refresh builds its URL
 * from this function's output, and GFG serves a soft-404 shell (HTTP 200, no
 * problem) for any slug that is not exactly canonical. Each case below was
 * verified against the live site: the asserted form renders the problem, the
 * other form renders the shell.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cleanGfgSlug } from "../src/core/gfg-utils.js";

describe("cleanGfgSlug", () => {
  test("modern canonical slugs keep their -- id verbatim", () => {
    // Collapsing these was the bug: geeks-island170646 is a 404.
    assert.equal(cleanGfgSlug("geeks-island--170646"), "geeks-island--170646");
    assert.equal(cleanGfgSlug("secret-cipher--141631"), "secret-cipher--141631");
  });

  test("legacy list slugs concatenate their short id", () => {
    assert.equal(cleanGfgSlug("total-decoding-messages--1235"), "total-decoding-messages1235");
    assert.equal(cleanGfgSlug("Total-Decoding-Messages--1235"), "Total-Decoding-Messages1235");
  });

  test("transitional slugs drop the appended long id", () => {
    assert.equal(cleanGfgSlug("compare-two-fractions4438--102404"), "compare-two-fractions4438");
  });

  test("page suffixes are stripped from every generation", () => {
    assert.equal(cleanGfgSlug("geeks-island--170646/1"), "geeks-island--170646");
    assert.equal(cleanGfgSlug("total-decoding-messages--1235/1"), "total-decoding-messages1235");
    assert.equal(cleanGfgSlug("two-sum/0"), "two-sum");
  });

  test("already-canonical slugs are fixed points", () => {
    for (const s of [
      "geeks-island--170646",
      "total-decoding-messages1235",
      "compare-two-fractions4438",
      "kadanes-algorithm-1587115620",
      "two-sum",
    ]) {
      assert.equal(cleanGfgSlug(s), s);
      assert.equal(cleanGfgSlug(cleanGfgSlug(s)), s, "cleaning must be idempotent");
    }
  });

  test("junk input yields an empty slug", () => {
    assert.equal(cleanGfgSlug(""), "");
    assert.equal(cleanGfgSlug(null), "");
    assert.equal(cleanGfgSlug("  padded  "), "padded");
  });
});
