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
import {
  buildUserStatusUrl,
  extractSolves,
  mergeSolves,
  CF_PAGE_SIZE,
} from "../src/handlers/platforms/codeforces/api.js";
import {
  cfSlugFromHref,
  matchAcceptedRow,
  mergeCapturedMetadata,
  isPendingFresh,
  PENDING_TTL_MS,
} from "../src/handlers/platforms/codeforces/verdict-match.js";
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

/**
 * The profile importer. Codeforces publishes every submission through
 * `user.status` but never the source text, so an import is a list of dated,
 * rated, tagged problems with an empty solution — and must not queue a code
 * fetch that has nothing to fetch.
 */
const submission = (over = {}) => ({
  id: 12345678,
  contestId: 4,
  creationTimeSeconds: 1_400_000_000,
  problem: {
    contestId: 4,
    index: "A",
    name: "Watermelon",
    type: "PROGRAMMING",
    rating: 800,
    tags: ["brute force", "math"],
  },
  author: { participantType: "PRACTICE" },
  programmingLanguage: "GNU C++17 7.3.0",
  verdict: "OK",
  passedTestCount: 55,
  timeConsumedMillis: 30,
  memoryConsumedBytes: 102400,
  ...over,
});

describe("buildUserStatusUrl", () => {
  test("asks for one page of a handle's submissions", () => {
    assert.equal(
      buildUserStatusUrl("tourist", 1, 1000),
      "https://codeforces.com/api/user.status?handle=tourist&from=1&count=1000",
    );
  });

  test("escapes a handle rather than pasting it into the query", () => {
    assert.ok(buildUserStatusUrl("a b&count=1").includes("a%20b%26count%3D1"));
  });

  test("returns nothing when there is no handle to ask about", () => {
    assert.equal(buildUserStatusUrl(""), "");
    assert.equal(buildUserStatusUrl(null), "");
  });
});

describe("extractSolves", () => {
  test("turns an accepted submission into a library record", () => {
    const { ok, error, solves, seen } = extractSolves({ status: "OK", result: [submission()] });
    assert.equal(ok, true);
    assert.equal(error, null);
    assert.equal(seen, 1);
    assert.deepEqual(solves[0], {
      slug: "4A",
      title: "Watermelon",
      difficulty: "Easy",
      rating: 800,
      tags: ["brute force", "math"],
      lang: { name: "GNU C++17 7.3.0", ext: "cpp", slug: "cpp" },
      timestamp: 1_400_000_000_000,
      runtime: "30 ms",
      memory: "100 KB",
    });
  });

  test("keeps only accepted submissions", () => {
    const { solves, seen } = extractSolves({
      status: "OK",
      result: [
        submission({ verdict: "WRONG_ANSWER" }),
        submission({ verdict: "TIME_LIMIT_EXCEEDED" }),
        submission({ verdict: "TESTING" }),
        submission(),
      ],
    });
    assert.equal(seen, 4, "seen counts the page, not the solves — it drives paging");
    assert.equal(solves.length, 1);
  });

  test("files a gym solve under its gym slug", () => {
    const { solves } = extractSolves({
      status: "OK",
      result: [submission({ problem: { contestId: 100500, index: "B", name: "Gym problem" } })],
    });
    assert.equal(solves[0].slug, "gym100500B");
  });

  test("skips a problem it cannot address rather than filing it wrongly", () => {
    // acmsguru problems have a numeric index and no contest — no slug exists
    // for them, and a guessed one would collide with a real problem.
    const { solves } = extractSolves({
      status: "OK",
      result: [
        submission({ problem: { index: "101", name: "acmsguru", problemsetName: "acmsguru" } }),
        submission({ problem: null }),
      ],
    });
    assert.deepEqual(solves, []);
  });

  test("an unrated problem says Unknown instead of claiming Easy", () => {
    const { solves } = extractSolves({
      status: "OK",
      result: [submission({ problem: { contestId: 4, index: "A", name: "W", tags: [] } })],
    });
    assert.equal(solves[0].difficulty, "Unknown");
    assert.equal(solves[0].rating, null);
  });

  test("reports zero memory as none rather than '0 KB'", () => {
    const { solves } = extractSolves({
      status: "OK",
      result: [submission({ memoryConsumedBytes: 0, timeConsumedMillis: 0 })],
    });
    assert.equal(solves[0].memory, null);
    assert.equal(solves[0].runtime, "0 ms");
  });

  test("passes the API's own refusal back instead of pretending there are no solves", () => {
    // The rate limiter answers this way, and "you have solved nothing" would be
    // a lie that also wipes the progress display.
    const res = extractSolves({ status: "FAILED", comment: "Call limit exceeded" });
    assert.equal(res.ok, false);
    assert.equal(res.error, "Call limit exceeded");
    assert.deepEqual(res.solves, []);
  });

  test("an unreadable body is a failure, not an empty history", () => {
    for (const bad of [null, undefined, "", 42]) {
      assert.equal(extractSolves(bad).ok, false, String(bad));
    }
  });

  test("a page smaller than the page size is what ends the paging loop", () => {
    const { seen } = extractSolves({ status: "OK", result: [] });
    assert.ok(seen < CF_PAGE_SIZE);
  });
});

describe("mergeSolves", () => {
  const at = (ts, over = {}) => ({ slug: "4A", timestamp: ts, ...over });

  test("the first accepted submission is the solve date", () => {
    // user.status returns newest first, so the later one arrives first.
    const map = mergeSolves(new Map(), [at(2000), at(1000), at(3000)]);
    assert.equal(map.get("4A").timestamp, 1000);
  });

  test("merges across pages", () => {
    const map = new Map();
    mergeSolves(map, [at(5000), { slug: "1234B", timestamp: 9000 }]);
    mergeSolves(map, [at(4000)]);
    assert.equal(map.size, 2);
    assert.equal(map.get("4A").timestamp, 4000);
  });

  test("keeps the whole record of the submission whose date won", () => {
    const map = mergeSolves(new Map(), [
      at(2000, { runtime: "late" }),
      at(1000, { runtime: "first" }),
    ]);
    assert.equal(map.get("4A").runtime, "first");
  });

  test("a dated submission beats an undated one either way round", () => {
    assert.equal(mergeSolves(new Map(), [at(null), at(1000)]).get("4A").timestamp, 1000);
    assert.equal(mergeSolves(new Map(), [at(1000), at(null)]).get("4A").timestamp, 1000);
  });
});

/**
 * Matching an accepted row to the submission we are waiting for.
 *
 * Submitting on Codeforces navigates to /contest/{id}/my, a table of every
 * submission made in that contest. Committing on the first accepted row there
 * files whichever problem was solved earliest in the contest, and does it while
 * the submission actually being waited on is still in the queue — so a run that
 * ends in Wrong Answer gets recorded as a solve. These pin the rule that stops
 * that.
 */
describe("cfSlugFromHref", () => {
  test("reads the problem out of every link shape a status table uses", () => {
    assert.equal(cfSlugFromHref("/contest/1234/problem/A"), "1234A");
    assert.equal(cfSlugFromHref("/problemset/problem/4/A"), "4A");
    assert.equal(cfSlugFromHref("/gym/100500/problem/B"), "gym100500B");
  });

  test("takes an absolute or protocol-relative href apart the same way", () => {
    assert.equal(cfSlugFromHref("https://codeforces.com/contest/1234/problem/A"), "1234A");
    assert.equal(cfSlugFromHref("//codeforces.com/contest/1234/problem/A"), "1234A");
  });

  test("ignores a query string and a fragment", () => {
    assert.equal(cfSlugFromHref("/contest/1234/problem/A?locale=ru"), "1234A");
    assert.equal(cfSlugFromHref("/contest/1234/problem/A#input"), "1234A");
  });

  test("agrees with the slug the page detector builds for the same problem", () => {
    // A disagreement here would reject our own row and the solve would vanish.
    for (const path of ["/contest/1234/problem/A", "/gym/100500/problem/B"]) {
      assert.equal(cfSlugFromHref(path), detectPage(path).slug, path);
    }
  });

  test("a link that is not a problem link yields nothing", () => {
    for (const bad of [
      "",
      null,
      "/profile/tourist",
      "/contest/1234/submission/98765",
      "/contest/1234/my",
      "/blog/entry/1234",
    ]) {
      assert.equal(cfSlugFromHref(bad), "", String(bad));
    }
  });
});

describe("matchAcceptedRow", () => {
  test("accepts the row for the problem we captured code for", () => {
    assert.equal(matchAcceptedRow({ rowSlug: "1234A", pendingSlug: "1234A" }), "1234A");
  });

  test("rejects an older solve sitting further down /contest/{id}/my", () => {
    // The whole point: submitting C lands on a page whose top accepted rows are
    // A and B from earlier in the contest.
    assert.equal(matchAcceptedRow({ rowSlug: "1234A", pendingSlug: "1234C" }), null);
    assert.equal(matchAcceptedRow({ rowSlug: "1234B", pendingSlug: "1234C" }), null);
  });

  test("a row without a problem link is the inline box, so the capture decides", () => {
    // The submissions box on a problem page names no problem — there is only
    // one it could be. Rejecting these would lose every problem-page solve.
    assert.equal(matchAcceptedRow({ rowSlug: "", pendingSlug: "1234A" }), "1234A");
    assert.equal(matchAcceptedRow({ rowSlug: "", pageSlug: "1234A" }), "1234A");
  });

  test("with no capture, only the problem page's own row counts", () => {
    assert.equal(matchAcceptedRow({ rowSlug: "1234A", pageSlug: "1234A" }), "1234A");
    assert.equal(matchAcceptedRow({ rowSlug: "1234A", pageSlug: "1234C" }), null);
  });

  test("browsing a status list commits nothing", () => {
    // No capture and not on a problem page: /contest/1234/my opened on its own,
    // or somebody else's submissions. There is no code to commit either way.
    assert.equal(matchAcceptedRow({ rowSlug: "1234A" }), null);
    assert.equal(matchAcceptedRow({}), null);
    assert.equal(matchAcceptedRow(), null);
  });

  test("a gym row matches its gym capture and not the bare contest id", () => {
    assert.equal(
      matchAcceptedRow({ rowSlug: "gym100500B", pendingSlug: "gym100500B" }),
      "gym100500B",
    );
    assert.equal(matchAcceptedRow({ rowSlug: "gym100500B", pendingSlug: "100500B" }), null);
  });
});

describe("mergeCapturedMetadata", () => {
  const captured = {
    slug: "1234A",
    title: "Theatre Square",
    difficulty: "Easy",
    rating: 1000,
    tags: ["math"],
    description: "<p>statement</p>",
    contestId: "1234",
    letter: "A",
  };
  // What _extractMetadata returns on /contest/1234/my, where there is no
  // statement on the page at all.
  const blank = {
    slug: "1234A",
    title: null,
    difficulty: null,
    rating: null,
    tags: [],
    description: null,
    runtime: null,
    memory: null,
    contestId: "1234",
    letter: "A",
  };

  test("the capture survives a verdict read on a page that knows nothing", () => {
    const meta = mergeCapturedMetadata(blank, captured, null);
    assert.equal(meta.title, "Theatre Square");
    assert.equal(meta.difficulty, "Easy");
    assert.equal(meta.rating, 1000);
    assert.deepEqual(meta.tags, ["math"]);
    assert.equal(meta.description, "<p>statement</p>");
  });

  test("the live page wins when it actually has something to say", () => {
    const live = { ...blank, title: "Theatre Square (updated)", tags: ["math", "geometry"] };
    const meta = mergeCapturedMetadata(live, captured, null);
    assert.equal(meta.title, "Theatre Square (updated)");
    assert.deepEqual(meta.tags, ["math", "geometry"]);
  });

  test("runtime and memory come off the judged row, never from the capture", () => {
    // They do not exist at submit time — there is no verdict yet.
    const meta = mergeCapturedMetadata(
      blank,
      { ...captured, runtime: "999 ms" },
      {
        runtime: "30 ms",
        memory: "100 KB",
      },
    );
    assert.equal(meta.runtime, "30 ms");
    assert.equal(meta.memory, "100 KB");
  });

  test("an unjudged or unreadable row reports no stats rather than a wrong number", () => {
    const meta = mergeCapturedMetadata(blank, captured, { runtime: null, memory: null });
    assert.equal(meta.runtime, null);
    assert.equal(meta.memory, null);
  });

  test("works with no capture at all", () => {
    const live = { ...blank, title: "Theatre Square", tags: ["math"] };
    const meta = mergeCapturedMetadata(live, null, null);
    assert.equal(meta.title, "Theatre Square");
    assert.deepEqual(meta.tags, ["math"]);
  });

  test("never invents a title from the slug", () => {
    // A slug-shaped title is how this used to paper over the empty read, and it
    // is what shipped a library full of problems called "1234A".
    assert.equal(mergeCapturedMetadata(blank, null, null).title, null);
  });
});

describe("isPendingFresh", () => {
  const now = 1_700_000_000_000;

  test("a capture from moments ago is the one being judged", () => {
    assert.equal(isPendingFresh(now - 5_000, now), true);
    assert.equal(isPendingFresh(now, now), true);
  });

  test("a long contest queue still counts", () => {
    assert.equal(isPendingFresh(now - (PENDING_TTL_MS - 1), now), true);
  });

  test("this morning's capture does not attach to this afternoon's verdict", () => {
    // sessionStorage lives as long as the tab, so without this the code sits
    // there all day waiting for any accepted row to claim it.
    assert.equal(isPendingFresh(now - PENDING_TTL_MS - 1, now), false);
    assert.equal(isPendingFresh(now - 8 * 60 * 60 * 1000, now), false);
  });

  test("a missing or unreadable stamp expires rather than lasting forever", () => {
    for (const bad of [null, undefined, "", 0, -1, NaN, "abc"]) {
      assert.equal(isPendingFresh(bad, now), false, String(bad));
    }
  });

  test("a stamp from the future expires too", () => {
    assert.equal(isPendingFresh(now + 60_000, now), false);
  });
});
