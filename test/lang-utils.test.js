/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the shared commit key.
 *
 * getProblemCommitKey is written into the persisted pendingProblemKeys map by
 * six different surfaces and matched back by the service worker's commit
 * sweep. Before it was shared, the writers used `titleSlug`-first with spaces
 * stripped while the sweep used `id`-first with spaces kept — the marks
 * stopped matching anything once ids gained the `lc-`/`gfg-`/`cf-` prefixes,
 * and edits from those surfaces silently never reached GitHub. These tests pin
 * the one format everyone must agree on.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { normalizeLang, getProblemCommitKey } from "../src/core/lang-utils.js";

describe("getProblemCommitKey", () => {
  test("uses the stored id, not the titleSlug", () => {
    const key = getProblemCommitKey({
      id: "lc-two-sum",
      titleSlug: "two-sum",
      lang: { name: "Python3", ext: "py", slug: "python3" },
    });
    assert.equal(key, "lc-two-sum::python3");
  });

  test("falls back to the platform-scoped id when the record has none", () => {
    const key = getProblemCommitKey({
      platform: "leetcode",
      titleSlug: "two-sum",
      lang: { name: "Java" },
    });
    assert.equal(key, "lc-two-sum::java");
  });

  test("keeps spaces in the language, matching the sweep's historical format", () => {
    // The broken writer variant stripped spaces ("ms sql server" →
    // "mssqlserver") and so never matched a key the sweep built.
    const key = getProblemCommitKey({ id: "lc-x", lang: { name: "MS SQL Server" } });
    assert.equal(key, "lc-x::ms sql server");
  });

  test("a plain-string `language` field still yields a lang-scoped key", () => {
    const key = getProblemCommitKey({ id: "lc-x", language: "Python3" });
    assert.equal(key, "lc-x::python3");
  });

  test("a langless record keys as its bare id", () => {
    assert.equal(getProblemCommitKey({ id: "lc-x" }), "lc-x");
  });

  test("no usable identity at all returns an empty key", () => {
    // makeProblemId("unknown", "unknown") still produces a string, so the only
    // truly empty case is an id that trims to nothing.
    assert.equal(getProblemCommitKey({ id: "   " }), "");
  });
});

describe("normalizeLang", () => {
  test("prefers name, then slug, then ext", () => {
    assert.equal(normalizeLang({ lang: { name: "C++", slug: "cpp", ext: "cpp" } }), "c++");
    assert.equal(normalizeLang({ lang: { slug: "cpp", ext: "cpp" } }), "cpp");
    assert.equal(normalizeLang({ lang: { ext: "py" } }), "py");
  });

  test("lowercases and trims but keeps interior spaces", () => {
    assert.equal(normalizeLang({ lang: { name: "  MS SQL Server " } }), "ms sql server");
  });

  test("no language yields an empty string", () => {
    assert.equal(normalizeLang({}), "");
    assert.equal(normalizeLang(), "");
  });
});
