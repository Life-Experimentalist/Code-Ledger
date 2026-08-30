/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * htm drops the whitespace around a `${…}` boundary when that whitespace spans
 * a line break, so prose split across two lines by the formatter is welded back
 * together with nothing between it:
 *
 *   html`<p>${n} new
 *     ${n === 1 ? "problem" : "problems"} queued</p>`   ->   "123 newproblems queued"
 *
 * Three things are *not* the bug, and this deliberately does not report them:
 * prose wrapping onto another line with no expression between (htm keeps that
 * newline, and HTML renders it as a space), attribute values (same), and a
 * break beside a tag (structural, and the elements carry their own spacing).
 *
 * Prettier introduces these breaks on its own the first time a line grows past
 * the print width, which is why this is a test rather than something fixed once
 * by hand.
 *
 * Used by test/htm-glue.test.js. Run directly to list the offenders:
 *   node dev/find-htm-glue.js
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..", "src");

/** Stands in for a `${…}` placeholder, whatever it ends up rendering. */
const EXPR = String.fromCharCode(1);
/** A tag boundary. Text on either side of one is already separated. */
const TAG = String.fromCharCode(2);

/** Every .js file under src/, minus the generated vendor bundles. */
export function sourceFiles(root = SRC) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "vendor") walk(p);
      } else if (entry.name.endsWith(".js")) out.push(p);
    }
  };
  walk(root);
  return out;
}

/** Advance past a quoted string (or nested template) starting at `i`. */
function skipString(src, i) {
  const quote = src[i];
  i++;
  while (i < src.length) {
    if (src[i] === "\\") i += 2;
    else if (src[i] === quote) return i + 1;
    else i++;
  }
  return i;
}

/**
 * Reduce one html`…` template to its text content, with tags and expressions
 * collapsed to single markers. Newlines inside tags and expressions are not
 * emitted — they are not content boundaries — so each emitted character carries
 * the source line it came from and the reported line numbers stay honest.
 *
 * @returns {{text: string, lines: number[]}|null} null if unterminated.
 */
function textStream(src, start, startLine) {
  let i = start;
  let line = startLine;
  let inTag = false;
  const chars = [];
  const lines = [];
  const srcs = [];
  const emit = (c, l, s = "") => {
    chars.push(c);
    lines.push(l);
    srcs.push(s);
  };

  while (i < src.length) {
    const c = src[i];

    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "`") return { text: chars.join(""), lines, srcs };

    // ${ … } — balanced, and may itself hold strings and nested templates.
    if (c === "$" && src[i + 1] === "{") {
      const at = line;
      const from = i;
      let depth = 1;
      i += 2;
      while (i < src.length && depth > 0) {
        const d = src[i];
        if (d === "\\") {
          i += 2;
        } else if (d === "`" || d === '"' || d === "'") {
          const to = skipString(src, i);
          for (let k = i; k < to; k++) if (src[k] === "\n") line++;
          i = to;
        } else {
          if (d === "{") depth++;
          else if (d === "}") depth--;
          else if (d === "\n") line++;
          i++;
        }
      }
      if (!inTag) emit(EXPR, at, src.slice(from, i));
      continue;
    }

    if (c === "\n") line++;

    if (inTag) {
      if (c === '"' || c === "'") {
        const to = skipString(src, i);
        for (let k = i; k < to; k++) if (src[k] === "\n") line++;
        i = to;
        continue;
      }
      if (c === ">") {
        inTag = false;
        emit(TAG, line);
      }
      i++;
      continue;
    }

    if (c === "<") {
      inTag = true;
      emit(TAG, line);
      i++;
      continue;
    }

    emit(c, line);
    i++;
  }
  return null;
}

/**
 * An expression that can only ever render string literals, every one of which
 * already carries the space on the side facing the break, supplies its own
 * separator — `${cond ? " and one more." : ""}` reads correctly however htm
 * joins it. `${" "}` is the same trick used deliberately, and is the fix for a
 * real glue point (JSX solves this identically with `{" "}`).
 *
 * An expression holding a nested html`` template is not one of these: its
 * literals are class names and markup, so nothing can be concluded from them.
 */
function suppliesOwnSpace(exprSrc, side) {
  if (!exprSrc || /\bhtml`/.test(exprSrc)) return false;
  const literals = [...exprSrc.matchAll(/"([^"\\]*)"|'([^'\\]*)'|`([^`]*)`/g)]
    .map((m) => m[1] ?? m[2] ?? m[3])
    .filter((s) => s !== "");
  if (!literals.length) return false;
  return literals.every((s) => (side === "before" ? /\s$/.test(s) : /^\s/.test(s)));
}

/**
 * Reviewed and accepted: the expression renders an element that brings its own
 * horizontal spacing, so the missing text node changes nothing on screen. Keyed
 * by rendered content rather than line number, so ordinary edits above them do
 * not invalidate the entry. The test fails on a stale one, so a weld that stops
 * matching gets re-reviewed rather than silently forgotten.
 */
export const ALLOWED = [
  {
    file: "library/components/BrokenImportsModal.js",
    glued: "${} selected>< ${}",
    why: "the span's own text opens with an em dash and a space",
  },
  {
    file: "library/components/ProblemModal.js",
    glued: "${}>< Open on ${} ↗",
    why: "favicon <img> inside an <a class='flex items-center gap-2'>",
  },
  {
    file: "library/settings-panels/PanelAI.js",
    glued: "View Queue>< ${} ${}",
    why: "the queue-count badge carries ml-1",
  },
  {
    file: "library/views/CanonicalView.js",
    glued: "Pending Requests>< ${}",
    why: "the open-issue count carries ml-2",
  },
  {
    file: "library/views/GraphView.js",
    glued: "${}>< Legend ▸",
    why: "colour swatches inside a flex row with gap-1.5",
  },
];

/**
 * Every place an expression is welded to adjacent prose across a line break.
 * @returns {{file: string, line: number, glued: string}[]}
 */
export function findGluePoints(files = sourceFiles()) {
  const found = [];
  const seen = new Set();
  const word = `[^\\s${TAG}${EXPR}]`;
  const glue = new RegExp(
    `(?:${EXPR}[ \\t]*\\n[ \\t]*${word})|(?:${word}[ \\t]*\\n[ \\t]*${EXPR})`,
    "g",
  );

  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(SRC, file).replace(/\\/g, "/");
    const srcLines = src.split("\n");

    for (let m = src.indexOf("html`"); m !== -1; m = src.indexOf("html`", m + 1)) {
      const start = m + "html`".length;
      const startLine = src.slice(0, start).split("\n").length;
      const stream = textStream(src, start, startLine);
      if (!stream) continue;

      glue.lastIndex = 0;
      let g;
      while ((g = glue.exec(stream.text)) !== null) {
        const line = stream.lines[g.index];
        const key = `${rel}:${line}`;
        glue.lastIndex = g.index + 1; // back-to-back runs each report once
        if (seen.has(key)) continue;
        seen.add(key);

        const last = g.index + g[0].length - 1;
        if (
          suppliesOwnSpace(stream.srcs[g.index], "before") ||
          suppliesOwnSpace(stream.srcs[last], "after")
        )
          continue;
        // Show what the reader sees, not what the source looks like: the text
        // either side of the weld, with expressions as ${} and the weld as ><.
        const show = (s) =>
          s
            .replace(new RegExp(EXPR, "g"), "${}")
            .replace(new RegExp(TAG, "g"), "")
            .replace(/\s+/g, " ");
        const cut = g.index + g[0].indexOf("\n");
        found.push({
          file: rel,
          line,
          glued: `${show(stream.text.slice(Math.max(0, cut - 40), cut)).trimStart()}><${show(
            stream.text.slice(cut + 1, cut + 41),
          ).trimEnd()}`,
        });
      }
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** True if this hit is on the reviewed-and-accepted list. */
export const isAllowed = (h) => ALLOWED.some((a) => a.file === h.file && a.glued === h.glued);

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const hits = findGluePoints();
  for (const h of hits) {
    const ok = isAllowed(h);
    console.log(`${ok ? "  ok " : "GLUE"} ${h.file}:${h.line}\n       ${h.glued}`);
  }
  const bad = hits.filter((h) => !isAllowed(h)).length;
  console.log(`\n${bad} glue points, ${hits.length - bad} reviewed and allowed`);
}
