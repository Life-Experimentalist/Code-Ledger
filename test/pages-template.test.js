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
import { getPagesHtml } from "../src/handlers/git/github/pages-template.js";

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
