/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The background Codeforces fetcher reads HTML, in a service worker that has no
 * DOMParser, on a page nobody is watching. The extraction is therefore the part
 * worth pinning down: it must return the statement whole or return nothing, and
 * it must never mistake the rating for a tag.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { extractStatementHtml, extractTags } from "../src/background/codeforces-api.js";

/** A page shaped like the real one: nested divs, sidebar tags, trailing markup. */
const page = (statementInner = "", { tags = true } = {}) => `
<html><body>
  <div class="content">
    ${
      tags
        ? `<div class="roundbox">
             <span class="tag-box" title="Difficulty">*1500</span>
             <span class="tag-box">dp</span>
             <span class="tag-box"> greedy </span>
           </div>`
        : ""
    }
    <div class="problem-statement" style="font-size:1.2rem;">${statementInner}</div>
    <div class="footer">not the statement</div>
  </div>
</body></html>`;

const NESTED = `<div class="header"><div class="title">A. Watermelon</div></div>
<p>One hot summer day…</p>
<div class="sample-tests"><div class="input"><pre>8</pre></div></div>`;

describe("codeforces-api extractStatementHtml", () => {
  test("returns the inner HTML of the statement div", () => {
    const out = extractStatementHtml(page(NESTED));
    assert.equal(out, NESTED);
  });

  test("stops at the statement's own closing tag, not the first one it meets", () => {
    const out = extractStatementHtml(page(NESTED));
    assert.ok(!out.includes("not the statement"), "swallowed the markup after the statement");
    assert.ok(out.includes("sample-tests"), "stopped short of the statement's own end");
  });

  test("returns null when the div never closes", () => {
    // A truncated response, or one of Codeforces' challenge interstitials. A
    // half-read statement would be committed to the user's repository as if it
    // were the whole problem.
    const truncated = '<div class="problem-statement"><div class="header">A. Watermelon';
    assert.equal(extractStatementHtml(truncated), null);
  });

  test("returns null when there is no statement at all", () => {
    assert.equal(extractStatementHtml("<html><body>Redirecting… please wait</body></html>"), null);
    assert.equal(extractStatementHtml(""), null);
    assert.equal(extractStatementHtml(null), null);
  });

  test("an empty statement is nothing rather than an empty string", () => {
    assert.equal(extractStatementHtml(page("   ")), null);
  });

  test("matches the div whatever else is on its class attribute", () => {
    const html = `<div class="ttypography problem-statement wide"><p>body</p></div>`;
    assert.equal(extractStatementHtml(html), "<p>body</p>");
  });
});

describe("codeforces-api extractTags", () => {
  test("reads the sidebar tags and drops the rating", () => {
    assert.deepEqual(extractTags(page(NESTED)), ["dp", "greedy"]);
  });

  test("a page with no tag boxes yields none rather than throwing", () => {
    assert.deepEqual(extractTags(page(NESTED, { tags: false })), []);
  });

  test("a repeated tag is listed once", () => {
    const html = `<span class="tag-box">dp</span><span class="tag-box">dp</span>`;
    assert.deepEqual(extractTags(html), ["dp"]);
  });
});
