/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The GeeksForGeeks profile lists what you solved but never when. The importer
 * used to fill that gap with `Date.now()`, which turned a 200-problem back
 * catalogue into 200 solves on a single calendar day: 200 commits all dated
 * today, one black block on the contribution graph, and a heatmap that claimed
 * a day nobody had.
 *
 * `parseSubmissionDates` reads the real dates out of the month-scoped
 * submissions endpoint. Its job is to be *strict*: a wrong date written into a
 * commit is worse than no date, because nothing downstream can tell it is
 * wrong. Anything it does not recognise it skips, and the caller falls back to
 * marking the solve undated rather than guessing.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// browser-compat falls back to a localStorage-backed mock when chrome.* is
// absent, so the module graph imports unmodified under Node.
const backing = new Map();
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: (k) => backing.delete(k),
};

const { parseSubmissionDates } =
  await import("../src/handlers/platforms/geeksforgeeks/profile-import.js");

const ms = (iso) => Date.parse(`${iso}T00:00:00.000Z`);

describe("parseSubmissionDates", () => {
  test("reads a date-keyed bucket of submissions", () => {
    const out = parseSubmissionDates({
      "2025-04-17": [{ slug: "two-sum" }, { slug: "kadanes-algorithm" }],
    });
    assert.deepEqual(out, {
      "two-sum": ms("2025-04-17"),
      "kadanes-algorithm": ms("2025-04-17"),
    });
  });

  test("accepts a bucket keyed by id instead of an array", () => {
    const out = parseSubmissionDates({
      "2025-04-17": { 9931: { slug: "two-sum" } },
    });
    assert.equal(out["two-sum"], ms("2025-04-17"));
  });

  test("accepts slashes and a trailing time on the key", () => {
    const out = parseSubmissionDates({
      "2025/4/7 18:22:01": [{ slug: "two-sum" }],
    });
    assert.equal(out["two-sum"], ms("2025-04-07"));
  });

  test("takes the earliest date when a problem was submitted more than once", () => {
    const out = parseSubmissionDates({
      "2025-09-02": [{ slug: "two-sum" }],
      "2023-01-14": [{ slug: "two-sum" }],
      "2024-06-30": [{ slug: "two-sum" }],
    });
    assert.equal(out["two-sum"], ms("2023-01-14"), "a re-submission is not when it was solved");
  });

  test("normalises the slug the same way the profile parser does", () => {
    // Both sides run `cleanGfgSlug`, or the date would never match the problem
    // it belongs to: the legacy `--digits` form and the modern one are the same
    // problem, and the lookup is by slug.
    const out = parseSubmissionDates({
      "2025-04-17": [
        { slug: "Total-Decoding-Messages--1235  " },
        { slug: "compare-two-fractions4438--102404" },
      ],
    });
    assert.deepEqual(Object.keys(out).sort(), [
      "compare-two-fractions4438",
      "total-decoding-messages1235",
    ]);
  });

  test("reads the alternative slug field names", () => {
    const out = parseSubmissionDates({
      "2025-04-17": [{ problem_slug: "alpha" }, { pslug: "beta" }],
    });
    assert.equal(out.alpha, ms("2025-04-17"));
    assert.equal(out.beta, ms("2025-04-17"));
  });

  test("skips keys that are not dates rather than guessing at them", () => {
    const out = parseSubmissionDates({
      total: 42,
      easy: [{ slug: "two-sum" }],
      "not-a-date": [{ slug: "three-sum" }],
    });
    assert.deepEqual(out, {}, "a difficulty bucket carries no date");
  });

  test("skips entries with no slug", () => {
    const out = parseSubmissionDates({
      "2025-04-17": [{ slug: "" }, { slug: 12 }, {}, null, { slug: "kept" }],
    });
    assert.deepEqual(Object.keys(out), ["kept"]);
  });

  test("returns an empty map for anything that is not an object", () => {
    for (const input of [null, undefined, "", 0, [], "result"]) {
      assert.deepEqual(parseSubmissionDates(input), {});
    }
  });
});
