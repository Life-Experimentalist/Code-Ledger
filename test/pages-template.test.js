/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * XSS regression tests for the GitHub Pages stats template.
 *
 * This template is the only CodeLedger output served to third parties: it is
 * published to the user's public Pages site. Its inputs are repository content
 * (commit messages, authors, image paths) and user settings, none of which the
 * extension controls, so an unescaped interpolation here is stored XSS against
 * every visitor rather than a self-inflicted one.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getPagesHtml,
  bestStreakFrom,
} from "../src/handlers/git/github/pages-template.js";

const SEP = String.fromCharCode(0x2028);
const BACKSLASH = String.fromCharCode(92);

describe("pages template — server-side interpolation", () => {
  test("renders without any input at all", () => {
    const html = getPagesHtml();
    assert.ok(html.startsWith("<!DOCTYPE html>") || html.trimStart().startsWith("<!"));
    assert.ok(html.includes("</html>"));
  });

  test("a report image path cannot break out of the src attribute", () => {
    const html = getPagesHtml({ reportImages: ['a.png" onerror="alert(1)'] });
    assert.ok(!/onerror="alert/.test(html), "attribute breakout via an image path");
    assert.ok(html.includes("&quot;"), "the quote must be entity-encoded");
  });

  test("a report image path cannot become a protocol-relative URL", () => {
    // "/" + "/evil.test/x.png" would be "//evil.test/x.png" — a different origin.
    const html = getPagesHtml({ reportImages: ["/evil.test/x.png"] });
    assert.ok(!html.includes('src="//evil.test'), "leading slashes must be stripped");
    assert.ok(html.includes('src="/evil.test/x.png"'));
  });

  test("a report image path cannot inject markup", () => {
    const html = getPagesHtml({ reportImages: ["<script>alert(1)</script>"] });
    assert.ok(!html.includes("<script>alert(1)"), "raw markup from an image path");
  });

  test("a non-http asset URL collapses to #", () => {
    const html = getPagesHtml({ settings: { assets: { social: "javascript:alert(1)" } } });
    assert.ok(!/javascript:alert/.test(html), "javascript: URL reached an attribute");
  });

  test("commit counts are coerced to numbers", () => {
    const html = getPagesHtml({
      settings: { pages_show_verification: true },
      commitSummary: { verified: "<img src=x onerror=alert(1)>", total: 5 },
    });
    assert.ok(!html.includes("onerror=alert"), "commit summary was interpolated raw");
    assert.ok(html.includes("Verified: 0 / 5"));
  });
});

describe("pages template — embedded commit list", () => {
  const embed = (commitList) => getPagesHtml({ commitList });

  test("a commit message cannot close the script block", () => {
    const html = embed([{ message: "x</script><script>alert(1)</script>", sha: "abc1234" }]);
    assert.ok(!html.includes("</script><script>alert(1)"), "script breakout via commit message");
    assert.ok(html.includes(BACKSLASH + "u003c"), "< must be unicode-escaped in the JSON literal");
  });

  test("a commit message cannot smuggle a raw line separator", () => {
    const html = embed([{ message: "before" + SEP + "after", sha: "abc1234" }]);
    assert.ok(!html.includes(SEP), "raw U+2028 survived into the script block");
    assert.ok(html.includes(BACKSLASH + "u2028"));
  });

  test("the renderer escapes the commit message and author", () => {
    const html = embed([{ message: "m", author: "a", url: "https://github.com/o/r/commit/abc" }]);
    assert.ok(html.includes("escHtml(msg)"), "commit message must be escaped at render time");
    assert.ok(html.includes("escHtml(c.author"), "commit author must be escaped at render time");
  });

  test("the template's own script blocks open and close in strict alternation", () => {
    // The HTML parser has no idea what a JS comment is. A comment that spelled
    // out the closing script tag — while explaining that commit data must not
    // contain one — ended the element on the spot, so the commit renderer never
    // ran and every line below it was painted onto the page as visible text.
    // The escaping test above only ever checked the injected data, never the
    // template's own prose, so it passed the entire time the page was broken.
    const html = getPagesHtml();
    const tags = [...html.matchAll(/<script\b|<\/script\s*>/gi)].map((m) =>
      m[0].startsWith("</") ? "close" : "open",
    );
    let open = 0;
    tags.forEach((tag, i) => {
      if (tag === "open") {
        assert.equal(open, 0, `script opened while one was already open (tag ${i})`);
        open = 1;
      } else {
        assert.equal(open, 1, `a closing script tag at position ${i} has no element to close`);
        open = 0;
      }
    });
    assert.equal(open, 0, "a script element was left unclosed");
  });

  test("the difficulty counters normalize instead of matching a literal label", () => {
    // GeeksForGeeks grades School and Basic; comparing to the literal 'Easy'
    // counted those as nothing, so a repo full of solves showed 0 / 0 / 0.
    const html = getPagesHtml();
    assert.ok(html.includes("function normDiff("), "the page needs its own normalizer");
    assert.ok(/school:\s*'Easy'/.test(html), "School must normalize to Easy client-side");
    assert.ok(
      !/p\.difficulty === '(Easy|Medium|Hard)'/.test(html),
      "a strict comparison against a literal difficulty label survived",
    );
  });

  test("the stats tiles count the problem list rather than trusting stale stats", () => {
    // index.json files written before the counters learned to normalize carry a
    // stale easy/medium/hard. Counting the list means the published report
    // corrects itself on the next page load, not on the next solve.
    const html = getPagesHtml();
    assert.ok(
      /problems\.length \? countDiff\(problems, 'Easy'\)/.test(html),
      "the Easy tile must prefer a live count over stats.easy",
    );
    assert.ok(html.includes("function countDiff("), "countDiff must exist to do that counting");
  });

  test("the graph tooltip escapes the platform names it reads from index.json", () => {
    // The tooltip writes into innerHTML. Platform names arrive from index.json,
    // which is repository content — on a public repo, or one with a leaked
    // token, anyone who can land a commit chooses them. The label beside them
    // was escaped from the start, which is what made this easy to miss.
    const html = getPagesHtml();
    assert.ok(
      html.includes("escHtml(node.platforms.join(', '))"),
      "platform names must be escaped before reaching innerHTML",
    );
    assert.ok(
      !/\+ node\.platforms\.join\(', '\)/.test(html),
      "an unescaped platform join survived",
    );
  });

  test("the renderer restricts the commit URL to http(s)", () => {
    const html = getPagesHtml();
    assert.ok(
      /test\(String\(c\.url \|\| ''\)\) \? escHtml\(c\.url\) : '#'/.test(html),
      "commit URL must pass a scheme allowlist before being escaped",
    );
  });
});

/**
 * The page script is written out through a template literal, which silently
 * eats a lone backslash: `\d` arrives as `d`, and `\/\/` arrives as `//`.
 * Both had happened. The scheme check above survived only as text — the page
 * received `/^https?://` followed by a line comment, so the check the test was
 * reading was commented out on the published site.
 */
describe("pages template — regexes survive the template literal", () => {
  const rx = (pattern) => new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  test("the commit URL scheme check is a regex, not the start of a comment", () => {
    const html = getPagesHtml();
    assert.ok(
      rx(String.raw`/^https?:\/\//i.test(`).test(html),
      "the scheme check lost its escapes and became a comment",
    );
  });

  test("the heatmap year filter keeps its digit class", () => {
    const html = getPagesHtml();
    assert.ok(
      rx(String.raw`/^\d{4}$/.test(range)`).test(html),
      "a year like 2025 can no longer match, so the year options do nothing",
    );
  });

  test("the emitted problemUrl splits a Codeforces slug", () => {
    // problemsBase + "4A" is a 404: Codeforces addresses a problem by contest
    // and letter. This runs the function the published page actually gets.
    const html = getPagesHtml();
    const start = html.indexOf("function problemUrl(p) {");
    assert.ok(start > -1, "problemUrl is missing from the page");
    const end = html.indexOf("\n    }", start);
    const src = html.slice(start, end + "\n    }".length);
    const problemUrl = new Function(`${src}; return problemUrl;`)();

    assert.equal(
      problemUrl({ platform: "codeforces", titleSlug: "4A" }),
      "https://codeforces.com/problemset/problem/4/A",
    );
    assert.equal(
      problemUrl({ platform: "codeforces", titleSlug: "1234A1" }),
      "https://codeforces.com/problemset/problem/1234/A1",
    );
    assert.equal(
      problemUrl({ platform: "codeforces", titleSlug: "gym100500B" }),
      "https://codeforces.com/gym/100500/problem/B",
    );
    assert.equal(
      problemUrl({ platform: "codeforces", titleSlug: "100500B" }),
      "https://codeforces.com/gym/100500/problem/B",
    );
    // An unreadable slug lands on the problem archive rather than a 404.
    assert.equal(
      problemUrl({ platform: "codeforces", titleSlug: "acmsguru" }),
      "https://codeforces.com/problemset",
    );
    // The other platforms are untouched.
    assert.equal(
      problemUrl({ platform: "leetcode", titleSlug: "two-sum" }),
      "https://leetcode.com/problems/two-sum/",
    );
    assert.equal(problemUrl({ url: "https://example.com/x" }), "https://example.com/x");
    assert.equal(problemUrl({ platform: "unknown" }), "#");
  });
});

describe("pages template — counts baked into the served markup", () => {
  const STATS = { total: 316, easy: 176, medium: 127, hard: 11 };

  test("renders the real counts, not zeros, into the stat cells", () => {
    const html = getPagesHtml({ stats: STATS });
    const cell = (id) => html.match(new RegExp('id="' + id + '">([^<]*)<'))?.[1];
    assert.equal(cell("sn-t"), "316");
    assert.equal(cell("sn-e"), "176");
    assert.equal(cell("sn-m"), "127");
    assert.equal(cell("sn-h"), "11");
  });

  test("the description and og:description carry the counts", () => {
    const html = getPagesHtml({ stats: STATS });
    for (const attr of ['name="description"', 'property="og:description"']) {
      const content = html.match(new RegExp("<meta " + attr + ' content="([^"]*)"'))?.[1];
      assert.ok(content, attr + " is missing");
      assert.match(content, /316 DSA problems solved/);
      assert.match(content, /176 easy, 127 medium, 11 hard/);
    }
  });

  test("no stats at all still renders zeros and the generic blurb", () => {
    // First-run onboarding writes the page before any solve exists, where zero
    // is the true answer rather than a stale one.
    const html = getPagesHtml();
    assert.match(html, /id="sn-t">0</);
    assert.match(html, /content="DSA problem solutions tracked by CodeLedger/);
  });

  test("a hostile stats object cannot inject markup or negative counts", () => {
    const html = getPagesHtml({
      stats: { total: '"><script>alert(1)</script>', easy: -5, medium: 1.9, hard: NaN },
    });
    assert.ok(!/<script>alert\(1\)/.test(html), "markup injected through stats.total");
    assert.match(html, /id="sn-t">0</);
    assert.match(html, /id="sn-e">0</);
    assert.match(html, /id="sn-m">1</);
    assert.match(html, /id="sn-h">0</);
  });

  test("without JavaScript the page shows the stats instead of a spinner", () => {
    const html = getPagesHtml({ stats: STATS });
    const noscript = html.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1];
    assert.ok(noscript, "no noscript fallback");
    assert.match(noscript, /#loading\s*\{\s*display:\s*none/);
    assert.match(noscript, /#app\s*\{\s*display:\s*block/);
  });
});

// ── Streaks ──────────────────────────────────────────────────────────────────
// The four counts above are read straight out of index.json's `stats` block.
// Streaks are not in there: they have to be derived from the solve timestamps,
// and `_indexMetaFromFiles` hands the page only the ten most recent problems.
// So the derivation happens before that slice, and only the *best* streak is
// baked — see the comment beside #sn-cs in the template for why the current one
// deliberately stays a placeholder.

const DAY_MS = 86400000;

/** Midday, `daysAgo` local days back. Midday so a DST shift cannot move the day. */
function midday(daysAgo) {
  const t = new Date();
  t.setHours(12, 0, 0, 0);
  return t.getTime() - daysAgo * DAY_MS;
}

/** Solves on each of `days`, expressed as whole days before today. */
const solvesOn = (days) => days.map((d) => ({ timestamp: midday(d) }));

describe("pages template — best streak baked into the markup", () => {
  test("finds the longest run, not the most recent one", () => {
    // Five straight days three weeks ago, then a two-day run just now.
    const problems = solvesOn([24, 23, 22, 21, 20, 1, 0]);
    assert.equal(bestStreakFrom(problems), 5);
  });

  test("counts a run that the ten-problem slice would have truncated", () => {
    // The bug this guards: thirty consecutive days is a thirty-day streak, but
    // the ten most recent solves can only ever describe ten days.
    const problems = solvesOn(Array.from({ length: 30 }, (_, i) => i));
    assert.equal(bestStreakFrom(problems), 30);
    assert.equal(bestStreakFrom(problems.slice(0, 10)), 10, "slicing loses 20 days");
  });

  test("second-precision timestamps count the same as millisecond ones", () => {
    const ms = solvesOn([3, 2, 1]);
    const secs = ms.map((p) => ({ timestamp: Math.floor(p.timestamp / 1000) }));
    assert.equal(bestStreakFrom(secs), bestStreakFrom(ms));
    assert.equal(bestStreakFrom(secs), 3);
  });

  test("junk timestamps are skipped rather than counted or thrown on", () => {
    assert.equal(bestStreakFrom([]), 0);
    assert.equal(bestStreakFrom(null), 0);
    assert.equal(bestStreakFrom(undefined), 0);
    assert.equal(
      bestStreakFrom([{}, { timestamp: 0 }, { timestamp: -1 }, { timestamp: "x" }]),
      0,
    );
  });

  test("renders the streak into the Best Streak cell", () => {
    const html = getPagesHtml({ bestStreak: 12 });
    assert.match(html, /id="sn-ms">12d</);
  });

  test("no streak renders the placeholder, not a zero-day claim", () => {
    assert.match(getPagesHtml(), /id="sn-ms">—</);
    assert.match(getPagesHtml({ bestStreak: 0 }), /id="sn-ms">—</);
  });

  test("the current streak stays a placeholder even when a streak is known", () => {
    // It decays with the wall clock, and nothing regenerates this file while the
    // repository is quiet — so a baked value would outlive the streak itself.
    assert.match(getPagesHtml({ bestStreak: 12, stats: { total: 316 } }), /id="sn-cs">—</);
  });

  test("a hostile bestStreak cannot inject markup", () => {
    const html = getPagesHtml({ bestStreak: '"><script>alert(1)</scr' + "ipt>" });
    assert.ok(!/<script>alert\(1\)/.test(html), "markup injected through bestStreak");
    assert.match(html, /id="sn-ms">—</);
  });
});

describe("pages template — canonical URL and structured data", () => {
  const LIVE = "https://dsa.example.com/";
  const LD = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/;

  test("emits a canonical link and og:url for the address GitHub reports", () => {
    const html = getPagesHtml({ pagesUrl: LIVE });
    assert.match(html, /<link rel="canonical" href="https:\/\/dsa\.example\.com\/" \/>/);
    assert.match(html, /<meta property="og:url" content="https:\/\/dsa\.example\.com\/" \/>/);
  });

  test("emits no canonical at all when the serving address is unknown", () => {
    // A guessed {owner}.github.io/{repo} would point the crawler at the wrong
    // host on every custom-domain site, so silence is the correct output.
    const html = getPagesHtml({ owner: "o", repo: "r" });
    assert.ok(!/rel="canonical"/.test(html), "canonical guessed from owner/repo");
    assert.ok(!/property="og:url"/.test(html), "og:url guessed from owner/repo");
  });

  test("a non-http scheme is never promoted to canonical", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.test/"]) {
      const html = getPagesHtml({ pagesUrl: bad });
      assert.ok(!/rel="canonical"/.test(html), bad + " became a canonical");
    }
  });

  test("ships JSON-LD describing the page", () => {
    const html = getPagesHtml({ pagesUrl: LIVE, owner: "octocat", stats: { total: 316 } });
    const block = html.match(LD)?.[1];
    assert.ok(block, "no JSON-LD block");
    const ld = JSON.parse(block);
    assert.equal(ld["@context"], "https://schema.org");
    assert.equal(ld["@type"], "WebPage");
    assert.equal(ld.url, LIVE);
    assert.equal(ld.author.name, "octocat");
    assert.equal(ld.author.url, "https://github.com/octocat");
    assert.match(ld.description, /316 DSA problems solved/);
  });

  test("JSON-LD omits url when there is nothing truthful to put there", () => {
    const ld = JSON.parse(getPagesHtml().match(LD)[1]);
    assert.equal(ld.url, undefined);
    assert.equal(ld.author, undefined);
  });

  test("an owner carrying a closing script tag cannot end the JSON-LD block", () => {
    const hostile = "</scr" + "ipt><img src=x onerror=alert(1)>";
    const block = getPagesHtml({ owner: hostile }).match(LD)?.[1];
    assert.ok(block, "no JSON-LD block");
    assert.ok(!block.includes("</scr" + "ipt"), "the block was terminated early");
    // Still valid JSON, and the value round-trips intact.
    assert.equal(JSON.parse(block).author.name, hostile);
  });

  test("separator characters in the JSON-LD are escaped", () => {
    const block = getPagesHtml({ owner: "a" + SEP + "b" }).match(LD)[1];
    assert.ok(!block.includes(SEP), "raw U+2028 left in the JSON-LD");
    assert.ok(block.includes(BACKSLASH + "u2028"), "U+2028 was not escaped");
  });
});

describe("pages template — the stats row does not wait on the fetch", () => {
  test("#app is not hidden by an inline style", () => {
    // The counts are in the markup already; hiding the whole dashboard behind
    // the index.json fetch made JS readers watch a spinner over data they had.
    const html = getPagesHtml({ stats: { total: 316 } });
    const app = html.match(/<div id="app"[^>]*>/)?.[0];
    assert.ok(app, "no #app element");
    assert.ok(!/display\s*:\s*none/.test(app), "#app still ships hidden: " + app);
  });

  test("only the script-drawn cards are held back, via a class", () => {
    const html = getPagesHtml();
    assert.match(html, /<div id="app" class="wrap pending">/);
    assert.match(html, /#app\.pending \.card \{ display: none; \}/);
  });

  test("the load handler drops the class instead of unhiding #app", () => {
    const html = getPagesHtml();
    assert.match(html, /getElementById\('app'\)\.classList\.remove\('pending'\)/);
  });
});

describe("pages template — the onboarding path", () => {
  test("a freshly created repo emits zeros and placeholders, never a guess", () => {
    // GitHubOnboardingModal calls getPagesHtml({ owner, repo }) and nothing
    // else: at that point the repo has no solves, no streak, and no Pages site.
    // Every figure below is therefore true rather than merely absent, and this
    // test is here so a later argument added to the generator cannot quietly
    // start inventing one for it.
    const html = getPagesHtml({ owner: "octocat", repo: "dsa" });
    assert.match(html, /id="sn-t">0</);
    assert.match(html, /id="sn-e">0</);
    assert.match(html, /id="sn-m">0</);
    assert.match(html, /id="sn-h">0</);
    assert.match(html, /id="sn-cs">—</);
    assert.match(html, /id="sn-ms">—</);
    assert.ok(!/rel="canonical"/.test(html), "canonical invented for a repo with no Pages site");
    assert.match(html, /content="DSA problem solutions tracked by CodeLedger/);
  });
});
