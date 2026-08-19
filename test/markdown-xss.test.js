/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * XSS regression tests for the AI markdown renderer.
 *
 * The output of parseMarkdown() is injected with dangerouslySetInnerHTML, and
 * its input is whatever the configured AI provider returned — i.e. text derived
 * from problem statements and user code that CodeLedger does not control. Every
 * case below is an escape that the renderer previously allowed or nearly did.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown, escapeHtml } from "../src/ui/components/AIMarkdownRenderer.js";

/**
 * Fails if the rendered output contains an executable construct.
 *
 * Only tag markup is inspected. An escaped payload such as
 * `&lt;img onerror=alert(1)&gt;` legitimately appears in the text content of a
 * code block — it renders as visible characters and cannot execute — so
 * scanning the whole string would reject correct output.
 */
function tagMarkup(html) {
  return (html.match(/<[^>]*>/g) || []).join(" ");
}

function assertInert(out, label) {
  const tags = tagMarkup(out);
  assert.ok(!/<script/i.test(tags), `${label}: emitted a <script> tag`);

  // Every attribute value must be free of the characters that end it. This is
  // the property that makes the next check sound: with no raw quote inside a
  // value, stripping quoted spans leaves exactly the real attribute names.
  for (const [, name, value] of tags.matchAll(/([\w-]+)="([^"]*)"/g)) {
    assert.ok(!/[<>]/.test(value), `${label}: unescaped markup in ${name}="${value}"`);
    assert.ok(!/^\s*javascript:/i.test(value), `${label}: javascript: URL in ${name}`);
  }

  const attributeNames = tags.replace(/=\s*"[^"]*"/g, "=");
  assert.ok(!/\son\w+\s*=/i.test(attributeNames), `${label}: emitted an inline event handler`);
}

describe("escapeHtml", () => {
  test("escapes every character that matters inside a double-quoted attribute", () => {
    assert.equal(escapeHtml(`&<>"`), "&amp;&lt;&gt;&quot;");
  });

  test("escapes the ampersand first so entities are not double-decoded", () => {
    assert.equal(escapeHtml("&lt;"), "&amp;lt;");
  });
});

describe("parseMarkdown — script injection", () => {
  test("neutralises a raw script tag", () => {
    assertInert(parseMarkdown('<script>alert(1)</script>'), "raw script");
  });

  test("neutralises an img with an error handler", () => {
    assertInert(parseMarkdown('<img src=x onerror="alert(1)">'), "img onerror");
  });

  test("neutralises an svg onload payload", () => {
    assertInert(parseMarkdown("<svg onload=alert(1)>"), "svg onload");
  });
});

describe("parseMarkdown — link href", () => {
  test("renders an ordinary https link", () => {
    const out = parseMarkdown("[docs](https://example.com/a?b=1)");
    assert.ok(out.includes('href="https://example.com/a?b=1"'));
    assertInert(out, "plain link");
  });

  test("does not double-escape an ampersand in a query string", () => {
    const out = parseMarkdown("[search](https://leetcode.com/problemset/?a=1&b=2)");
    assert.ok(out.includes('href="https://leetcode.com/problemset/?a=1&amp;b=2"'));
    assert.ok(!out.includes("&amp;amp;"), "the link must survive one escaping pass, not two");
  });

  test("a decoded ampersand cannot be used to rebuild markup", () => {
    // &amp;quot; decodes to &quot; — which must stay an entity, not become a quote.
    const out = parseMarkdown('[x](https://a.test/?q=1&amp;quot; onmouseover="alert(1))');
    assertInert(out, "entity round-trip");
  });

  test("rejects a javascript: URL", () => {
    const out = parseMarkdown("[click](javascript:alert(1))");
    assert.ok(out.includes('href="#"'), "non-http scheme must collapse to #");
    assertInert(out, "javascript link");
  });

  test("rejects a data: URL", () => {
    const out = parseMarkdown("[click](data:text/html,<script>alert(1)</script>)");
    assertInert(out, "data link");
  });

  test("cannot break out of the href attribute with a quote", () => {
    // Passes the https:// scheme test, so escaping is the only thing stopping it.
    const out = parseMarkdown('[x](https://a.test/" onmouseover="alert(1))');
    assertInert(out, "href breakout");
    assert.ok(out.includes("&quot;"), "the quote must be entity-encoded");
  });

  test("cannot inject a handler via a link inside a table cell", () => {
    const md = [
      "| name | link |",
      "|---|---|",
      '| a | [x](https://a.test/" onmouseover="alert(1)) |',
    ].join("\n");
    assertInert(parseMarkdown(md), "table cell link");
  });
});

describe("parseMarkdown — code blocks", () => {
  test("escapes markup inside a fenced block rather than executing it", () => {
    const out = parseMarkdown("```js\n<script>alert(1)</script>\n```");
    assertInert(out, "fenced block");
    assert.ok(out.includes("&lt;script&gt;"), "content must be visibly escaped");
  });

  test("escapes markup inside inline code", () => {
    assertInert(parseMarkdown("use `<img src=x onerror=alert(1)>` here"), "inline code");
  });

  test("does not let a language tag escape the class attribute", () => {
    const out = parseMarkdown('```js"><script>alert(1)</script>\ncode\n```');
    assertInert(out, "language tag");
  });

  // The stash-restore step must not interpret $-patterns in the fragment: a
  // string replacement turns `$&` into the matched placeholder and `$'` into
  // the rest of the document, silently corrupting any code sample using them.
  test("code containing $-replacement patterns survives verbatim", () => {
    const out = parseMarkdown("```sh\nsed 's/x/$& $` $' \"$1\"/'\n```");
    assert.ok(out.includes("$&amp; $` $"), "the $-patterns must render literally");
    assert.ok(!out.includes("@@S0@@"), "no stash placeholder may leak into the output");
  });

  test("inline code with $' does not duplicate the rest of the document", () => {
    const out = parseMarkdown("use `$'` here\n\ntrailing paragraph");
    const matches = out.match(/trailing paragraph/g) || [];
    assert.equal(matches.length, 1, "the tail of the document must appear exactly once");
  });
});

describe("parseMarkdown — well-formed input still renders", () => {
  test("headings, bold and lists survive", () => {
    const out = parseMarkdown("# Title\n\n**bold**\n\n- one\n- two");
    assert.ok(out.includes("Title"));
    assert.ok(out.includes("<strong"));
    assert.ok(out.includes("<li"));
  });

  test("empty input yields an empty string, not a crash", () => {
    assert.equal(parseMarkdown(""), "");
    assert.equal(parseMarkdown(null), "");
  });
});
