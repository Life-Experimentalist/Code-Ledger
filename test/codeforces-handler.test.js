/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the Codeforces handler's pure modules.
 *
 * Codeforces is the one platform without a slug of its own: a problem is
 * addressed by contest and letter, and the extension glues the two together
 * ("4A", "gym100500B") to get a single id to key storage on. Every link back to
 * the site has to take that apart again, and for a long time none of them did —
 * `problemsBase + "4A"` is a 404. These tests pin the split and the join
 * together so an imported problem and the same problem solved live cannot end
 * up filed under different ids.
 *
 * The DOM- and network-touching parts of `index.js` are deliberately not
 * covered here, the same way they are not for the other platform handlers.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  splitCFSlug,
  buildCFSlug,
  cfProblemUrl,
  GYM_MIN_CONTEST_ID,
} from "../src/core/cf-utils.js";
import {
  detectPage,
  isSolveCapablePage,
  PAGE_TYPES,
} from "../src/handlers/platforms/codeforces/page-detector.js";
import { resolveLang, normalizeCFRating } from "../src/handlers/platforms/codeforces/lang-utils.js";
import { CONSTANTS } from "../src/core/constants.js";

describe("splitCFSlug", () => {
  test("splits an ordinary problemset slug", () => {
    assert.deepEqual(splitCFSlug("4A"), { contestId: "4", index: "A", isGym: false });
    assert.deepEqual(splitCFSlug("1234A"), { contestId: "1234", index: "A", isGym: false });
  });

  test("keeps a divided index intact", () => {
    // Div1/Div2 shared problems carry a numeric suffix: 1234A1, 1234A2.
    assert.deepEqual(splitCFSlug("1234A1"), { contestId: "1234", index: "A1", isGym: false });
  });

  test("recognises a gym problem from either the prefix or the contest number", () => {
    assert.deepEqual(splitCFSlug("gym100500B"), {
      contestId: "100500",
      index: "B",
      isGym: true,
    });
    // The prefix is what the page detector writes, but a record that predates
    // it still has to resolve to the gym, not to a non-existent problemset id.
    assert.equal(splitCFSlug("100500B").isGym, true);
  });

  test("refuses anything it cannot read rather than guessing", () => {
    for (const bad of ["", null, undefined, "two-sum", "A4", "99999", "gym", "1/A"]) {
      assert.equal(splitCFSlug(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
  });

  test("an acmsguru problem, whose index is numeric, is not readable as a slug", () => {
    // /problemsets/acmsguru/problem/99999/101 — nothing distinguishes the
    // contest from the index, so a link built from it would be wrong.
    assert.equal(splitCFSlug("99999101"), null);
  });
});

describe("buildCFSlug", () => {
  test("joins contest and index the way the page detector does", () => {
    assert.equal(buildCFSlug(4, "A"), "4A");
    assert.equal(buildCFSlug("1234", "A1"), "1234A1");
  });

  test("adds the gym prefix above the gym contest floor", () => {
    assert.equal(buildCFSlug(GYM_MIN_CONTEST_ID, "B"), "gym100000B");
    assert.equal(buildCFSlug(100500, "B"), "gym100500B");
    assert.equal(buildCFSlug(99999, "B"), "99999B");
  });

  test("returns nothing when either half is missing", () => {
    assert.equal(buildCFSlug(null, "A"), "");
    assert.equal(buildCFSlug(4, ""), "");
    assert.equal(buildCFSlug("abc", "A"), "");
  });

  test("round-trips against splitCFSlug", () => {
    for (const [id, idx] of [
      [4, "A"],
      [1234, "A1"],
      [100500, "B"],
    ]) {
      const parts = splitCFSlug(buildCFSlug(id, idx));
      assert.equal(parts.contestId, String(id));
      assert.equal(parts.index, idx);
    }
  });

  test("agrees with the slug the page detector builds from a URL", () => {
    // If these two ever disagree, an imported problem files itself separately
    // from the same problem solved live.
    assert.equal(buildCFSlug(4, "A"), detectPage("/problemset/problem/4/A").slug);
    assert.equal(buildCFSlug(1234, "A"), detectPage("/contest/1234/problem/A").slug);
    assert.equal(buildCFSlug(100500, "B"), detectPage("/gym/100500/problem/B").slug);
  });
});

describe("cfProblemUrl", () => {
  test("splits the slug back into a working problemset URL", () => {
    // The bug this exists to prevent: problemsBase + "4A" → .../problem/4A, a 404.
    assert.equal(cfProblemUrl("4A"), "https://codeforces.com/problemset/problem/4/A");
    assert.equal(cfProblemUrl("1234A1"), "https://codeforces.com/problemset/problem/1234/A1");
  });

  test("sends a gym problem to the gym", () => {
    assert.equal(cfProblemUrl("gym100500B"), "https://codeforces.com/gym/100500/problem/B");
    assert.equal(cfProblemUrl("100500B"), "https://codeforces.com/gym/100500/problem/B");
  });

  test("returns empty rather than a wrong link", () => {
    assert.equal(cfProblemUrl("not-a-slug"), "");
    assert.equal(cfProblemUrl(""), "");
  });
});

describe("CONSTANTS.makeProblemUrl for codeforces", () => {
  test("routes through the slug split", () => {
    assert.equal(
      CONSTANTS.makeProblemUrl("codeforces", "4A"),
      "https://codeforces.com/problemset/problem/4/A",
    );
  });

  test("never emits problemsBase + slug", () => {
    const url = CONSTANTS.makeProblemUrl("codeforces", "1234A");
    assert.ok(!url.endsWith("/1234A"), `still gluing the slug on: ${url}`);
  });

  test("falls back to a placeholder for an unreadable slug", () => {
    assert.equal(CONSTANTS.makeProblemUrl("codeforces", "garbage"), "#");
  });

  test("the other platforms are untouched", () => {
    assert.equal(
      CONSTANTS.makeProblemUrl("leetcode", "two-sum"),
      "https://leetcode.com/problems/two-sum/",
    );
  });
});

describe("detectPage", () => {
  test("reads every problem URL shape", () => {
    for (const path of [
      "/contest/1234/problem/A",
      "/gym/100500/problem/B",
      "/problemset/problem/4/A",
    ]) {
      assert.equal(detectPage(path).type, PAGE_TYPES.PROBLEM, path);
      assert.ok(detectPage(path).slug, `${path} produced no slug`);
    }
  });

  test("a contest submission list is not mistaken for a problem", () => {
    assert.equal(detectPage("/contest/1234/my").type, PAGE_TYPES.MY_SUBMISSIONS);
    assert.equal(detectPage("/contest/1234/my/page/2").type, PAGE_TYPES.MY_SUBMISSIONS);
    assert.equal(detectPage("/contest/1234/submission/98765").type, PAGE_TYPES.SUBMISSION);
  });

  test("reads the handle off a profile page", () => {
    const page = detectPage("/profile/tourist");
    assert.equal(page.type, PAGE_TYPES.PROFILE);
    assert.equal(page.handle, "tourist");
  });

  test("anything else is unknown, so no handler attaches", () => {
    for (const path of ["/", "/contests", "/blog/entry/1234", "/ratings"]) {
      assert.equal(detectPage(path).type, PAGE_TYPES.UNKNOWN, path);
    }
  });

  test("only problem and submission-list pages can produce a solve", () => {
    assert.equal(isSolveCapablePage("/problemset/problem/4/A"), true);
    assert.equal(isSolveCapablePage("/contest/1234/my"), true);
    assert.equal(isSolveCapablePage("/profile/tourist"), false);
    assert.equal(isSolveCapablePage("/"), false);
  });
});

describe("resolveLang", () => {
  test("maps the verbose compiler strings Codeforces reports", () => {
    const cases = [
      ["GNU G++17 7.3.0", "cpp"],
      ["GNU G++20 13.2 (64 bit, winlibs)", "cpp"],
      ["Clang++20 Diagnostics", "cpp"],
      ["GNU C11", "c"],
      ["Python 3.8.10", "py"],
      ["PyPy 3.10 (7.3.15, 64bit)", "py"],
      ["Java 21 64bit", "java"],
      ["Kotlin 1.9.21", "kt"],
      ["Rust 1.75.0 (2021)", "rs"],
      ["Go 1.19", "go"],
      ["C# 10, .NET SDK 6.0", "cs"],
      ["JavaScript V8 4.8.0", "js"],
      ["Node.js 15.8.0 (64bit)", "js"],
      ["Ruby 3.2.2", "rb"],
      ["Haskell GHC 8.10.1", "hs"],
      ["Delphi 7", "pas"],
      ["PHP 8.1.7", "php"],
      ["Perl 5.20.1", "pl"],
    ];
    for (const [raw, ext] of cases) {
      assert.equal(resolveLang(raw).ext, ext, raw);
    }
  });

  test("keeps the platform's own name so the README reads as CF wrote it", () => {
    assert.equal(resolveLang("GNU G++17 7.3.0").name, "GNU G++17 7.3.0");
  });

  test("an unrecognised language commits as .txt rather than not at all", () => {
    assert.deepEqual(resolveLang("Befunge"), { name: "Befunge", ext: "txt", slug: "txt" });
    assert.deepEqual(resolveLang(""), { name: "unknown", ext: "txt", slug: "txt" });
    assert.deepEqual(resolveLang(null), { name: "unknown", ext: "txt", slug: "txt" });
  });
});

describe("normalizeCFRating", () => {
  test("maps the numeric rating onto the difficulty the rest of the app uses", () => {
    assert.equal(normalizeCFRating(800), "Easy");
    assert.equal(normalizeCFRating(1200), "Easy");
    assert.equal(normalizeCFRating(1201), "Medium");
    assert.equal(normalizeCFRating(1900), "Medium");
    assert.equal(normalizeCFRating(1901), "Hard");
    assert.equal(normalizeCFRating(3500), "Hard");
  });

  test("an unrated problem says so instead of claiming Easy", () => {
    for (const bad of [null, undefined, "", "abc", NaN]) {
      assert.equal(normalizeCFRating(bad), "Unknown", String(bad));
    }
  });

  test("accepts the numeric string the DOM gives", () => {
    assert.equal(normalizeCFRating("1500"), "Medium");
  });
});
