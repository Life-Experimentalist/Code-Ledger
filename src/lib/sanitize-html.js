/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * sanitize-html.js — Reduce third-party HTML to a fixed set of formatting tags.
 *
 * Problem statements are scraped from platform pages and cached, then rendered
 * with dangerouslySetInnerHTML both inside a content script (where markup runs
 * in the host page's world) and inside the extension's own library page. The
 * statement therefore has to be treated as untrusted regardless of who authored
 * it upstream.
 *
 * This is an allowlist *constructor*, not a filter: output tags are re-emitted
 * from a fixed table with no attributes at all, apart from a validated src/alt
 * on <img>. Nothing from the input reaches the output as markup, so there is no
 * parser trick to smuggle an attribute or a handler through.
 *
 * @ts-check
 */

/** Tags kept, re-emitted bare. Everything else is dropped, text retained. */
const ALLOWED = new Set([
  "p",
  "br",
  "hr",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "code",
  "pre",
  "kbd",
  "samp",
  "var",
  "sub",
  "sup",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "span",
  "div",
  "img",
]);

/** Tags whose *contents* are discarded along with the tag itself. */
const DROP_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "template", "svg"]);

/** Tags that never carry a closing tag. */
const VOID = new Set(["br", "hr", "img"]);

function escapeText(value) {
  return String(value).replace(/&(?![a-zA-Z#][a-zA-Z0-9]*;)/g, "&amp;").replace(/</g, "&lt;");
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Index of the ">" that closes the tag starting at `start`, or -1.
 *
 * Quoted attribute values are skipped: `<img src="data:text/html,<b>x</b>">`
 * contains a ">" that does not end the tag, and stopping at it would spill the
 * rest of the attribute into the document as markup.
 */
function findTagEnd(src, start) {
  let quote = "";
  for (let j = start + 1; j < src.length; j++) {
    const ch = src[j];
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return j;
    }
  }
  return -1;
}

/** Reads one attribute out of a raw tag body. Returns "" when absent. */
function readAttr(body, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(body);
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : "";
}

/**
 * Rewrite untrusted HTML to a safe subset.
 *
 * @param {string} input
 * @returns {string} Markup containing only allowlisted, attribute-free tags.
 */
export function sanitizeHtml(input) {
  const src = String(input ?? "");
  let out = "";
  let i = 0;
  /** Non-empty while inside a script/style/iframe/… whose contents we discard. */
  let skipUntil = "";

  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) {
      if (!skipUntil) out += escapeText(src.slice(i));
      break;
    }

    if (!skipUntil) out += escapeText(src.slice(i, lt));

    // "i < n" inside a statement is arithmetic, not markup. Only a "<" followed
    // by a name, "/", "!" or "?" opens a tag; anything else is literal text.
    if (!/[a-zA-Z/!?]/.test(src[lt + 1] || "")) {
      if (!skipUntil) out += "&lt;";
      i = lt + 1;
      continue;
    }

    // Comments and doctype/CDATA declarations carry no renderable text.
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end === -1 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith("<!", lt) || src.startsWith("<?", lt)) {
      const end = src.indexOf(">", lt);
      i = end === -1 ? src.length : end + 1;
      continue;
    }

    const gt = findTagEnd(src, lt);
    if (gt === -1) {
      // An unterminated "<" is text, not a tag.
      if (!skipUntil) out += escapeText(src.slice(lt));
      break;
    }

    const raw = src.slice(lt + 1, gt);
    const closing = raw.startsWith("/");
    const body = closing ? raw.slice(1) : raw;
    const name = (/^[a-zA-Z][a-zA-Z0-9-]*/.exec(body)?.[0] || "").toLowerCase();
    i = gt + 1;

    if (skipUntil) {
      if (closing && name === skipUntil) skipUntil = "";
      continue;
    }
    if (!closing && DROP_CONTENT.has(name)) {
      // Self-closed (<svg/>) discards nothing further.
      if (!/\/\s*$/.test(body)) skipUntil = name;
      continue;
    }
    if (!ALLOWED.has(name)) continue;

    if (closing) {
      if (!VOID.has(name)) out += `</${name}>`;
      continue;
    }
    if (name === "img") {
      const url = readAttr(body, "src").trim();
      // Only absolute http(s) and data:image survive; javascript:, data:text/html
      // and protocol-relative "//host" are all rejected.
      const safe = /^https?:\/\/[^/]/i.test(url) || /^data:image\/(png|jpe?g|gif|webp);/i.test(url);
      if (!safe) continue;
      const alt = readAttr(body, "alt");
      out += `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" loading="lazy">`;
      continue;
    }
    out += `<${name}>`;
  }

  return out;
}
