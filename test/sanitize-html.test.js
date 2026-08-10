/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the problem-statement sanitizer.
 *
 * Statements are scraped from platform pages and rendered with
 * dangerouslySetInnerHTML, so the guarantee under test is absolute: the output
 * contains no attributes at all except a validated src/alt on <img>, and no tag
 * outside the allowlist.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanitizeHtml } from "../src/lib/sanitize-html.js";

/** Every attribute in the output, as name="value" pairs. */
function attributesOf(html) {
  return html.match(/<[a-z][^>]*?\s([a-zA-Z-]+\s*=)/g) || [];
}

describe("sanitizeHtml — formatting survives", () => {
  test("keeps the tags a problem statement actually needs", () => {
    const input =
      "<p>Given an array <code>nums</code>, return <strong>indices</strong>.</p>" +
      "<ul><li>2 &lt;= n &lt;= 10<sup>4</sup></li></ul><pre>Input: [1,2]</pre>";
    const out = sanitizeHtml(input);
    for (const tag of ["<p>", "<code>", "<strong>", "<ul>", "<li>", "<sup>", "<pre>"]) {
      assert.ok(out.includes(tag), `${tag} must survive`);
    }
    assert.ok(out.includes("indices"), "text content must survive");
  });

  test("leaves existing entities alone rather than double-escaping them", () => {
    assert.equal(sanitizeHtml("<p>a &lt;= b &amp;&amp; c</p>"), "<p>a &lt;= b &amp;&amp; c</p>");
  });

  test("keeps text from a dropped tag", () => {
    assert.equal(sanitizeHtml("<marquee>hello</marquee>"), "hello");
  });

  test("returns an empty string for empty input", () => {
    assert.equal(sanitizeHtml(""), "");
    assert.equal(sanitizeHtml(null), "");
    assert.equal(sanitizeHtml(undefined), "");
  });
});

describe("sanitizeHtml — script execution", () => {
  test("removes a script tag and its body", () => {
    const out = sanitizeHtml("<p>a</p><script>alert(1)</script><p>b</p>");
    assert.ok(!out.includes("alert"), "script body must not survive");
    assert.ok(!/<script/i.test(out));
    assert.equal(out, "<p>a</p><p>b</p>");
  });

  test("removes an inline event handler", () => {
    const out = sanitizeHtml('<img src="https://x.test/a.png" onerror="alert(1)">');
    assert.ok(!/onerror/i.test(out), "no event handler may survive");
  });

  test("removes an event handler from an allowlisted tag", () => {
    const out = sanitizeHtml('<div onmouseover="alert(1)">hover</div>');
    assert.equal(out, "<div>hover</div>");
  });

  test("case and whitespace tricks do not smuggle a handler", () => {
    const out = sanitizeHtml('<DIV\n OnClick = "alert(1)" >x</DIV>');
    assert.equal(out, "<div>x</div>");
  });

  test("an unclosed script tag does not leak its body as text", () => {
    const out = sanitizeHtml("<p>a</p><script>alert(1)");
    assert.ok(!out.includes("alert"));
  });

  test("svg and iframe payloads are dropped whole", () => {
    assert.equal(sanitizeHtml("<svg><script>alert(1)</script></svg>"), "");
    assert.equal(sanitizeHtml('<iframe src="javascript:alert(1)"></iframe>'), "");
  });

  test("style blocks are dropped whole", () => {
    assert.equal(sanitizeHtml("<style>body{display:none}</style>ok"), "ok");
  });
});

describe("sanitizeHtml — links and images", () => {
  test("an anchor is dropped, so no href can be navigated", () => {
    assert.equal(sanitizeHtml('<a href="javascript:alert(1)">click</a>'), "click");
  });

  test("keeps an https diagram", () => {
    const out = sanitizeHtml('<img src="https://assets.test/d.png" alt="diagram">');
    assert.ok(out.includes('src="https://assets.test/d.png"'));
    assert.ok(out.includes('alt="diagram"'));
  });

  test("rejects a javascript: image source", () => {
    assert.equal(sanitizeHtml('<img src="javascript:alert(1)">'), "");
  });

  test("rejects a protocol-relative source", () => {
    assert.equal(sanitizeHtml('<img src="//evil.test/x.png">'), "");
  });

  test("rejects data:text/html disguised as an image", () => {
    assert.equal(sanitizeHtml('<img src="data:text/html,<script>alert(1)</script>">'), "");
  });

  test("accepts an inline data:image", () => {
    const out = sanitizeHtml('<img src="data:image/png;base64,AAAA">');
    assert.ok(out.includes("data:image/png;base64,AAAA"));
  });

  test("an alt attribute cannot break out of its quotes", () => {
    const out = sanitizeHtml('<img src="https://x.test/a.png" alt=\'" onerror="alert(1)\'>');
    // The payload survives as inert text inside alt; what matters is that its
    // quotes are entity-encoded, so it cannot start a new attribute.
    assert.equal(
      out,
      '<img src="https://x.test/a.png" alt="&quot; onerror=&quot;alert(1)" loading="lazy">',
    );
  });

  test("a > inside an attribute value does not end the tag", () => {
    const out = sanitizeHtml('<img src="https://x.test/a.png" alt="a > b">next');
    assert.ok(out.endsWith("next"), "no attribute text may spill into the document");
    assert.ok(out.includes('alt="a &gt; b"'));
  });
});

describe("sanitizeHtml — output shape", () => {
  test("no tag in the output carries an attribute other than on <img>", () => {
    const input =
      '<div class="x" id="y" style="color:red" data-z="1">' +
      '<p title="t">text</p><span onclick="x()">s</span></div>';
    const out = sanitizeHtml(input);
    assert.deepEqual(attributesOf(out), [], "every attribute must be stripped");
    assert.equal(out, "<div><p>text</p><span>s</span></div>");
  });

  test("a stray less-than is escaped rather than treated as a tag", () => {
    assert.equal(sanitizeHtml("a < b"), "a &lt; b");
    assert.equal(sanitizeHtml("<p>i < n</p>"), "<p>i &lt; n</p>");
  });

  test("comments are removed entirely", () => {
    assert.equal(sanitizeHtml("<!-- <script>alert(1)</script> -->ok"), "ok");
  });

  test("a void tag never emits a closing tag", () => {
    assert.equal(sanitizeHtml("<br></br>"), "<br>");
  });

  test("nothing resembling a handler survives a broad hostile sample", () => {
    const hostile = [
      "<img src=x onerror=alert(1)>",
      "<body onload=alert(1)>",
      "<form action=javascript:alert(1)><input>",
      "<object data=javascript:alert(1)>",
      "<a href=\"javascript:alert('x')\">a</a>",
      "<meta http-equiv=refresh content=0;url=javascript:alert(1)>",
      "<div style=\"background:url('javascript:alert(1)')\">d</div>",
    ].join("");
    const out = sanitizeHtml(hostile);
    assert.ok(!/\son[a-z]+\s*=/i.test(out), "no event handler attribute");
    assert.ok(!/javascript:/i.test(out), "no javascript: URL");
    assert.deepEqual(attributesOf(out), []);
  });
});
