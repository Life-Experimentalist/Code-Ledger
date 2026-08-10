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

  test("the renderer restricts the commit URL to http(s)", () => {
    const html = getPagesHtml();
    assert.ok(
      /test\(String\(c\.url \|\| ''\)\) \? escHtml\(c\.url\) : '#'/.test(html),
      "commit URL must pass a scheme allowlist before being escaped",
    );
  });
});
