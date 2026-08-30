/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ALLOWED, findGluePoints, isAllowed } from "../dev/find-htm-glue.js";

// htm drops the whitespace around a `${…}` boundary when that whitespace spans
// a line break, so "${n} new\n  ${plural}" renders as "12newproblems". Prettier
// creates those breaks by itself whenever a line grows past the print width,
// which makes this a standing regression rather than a one-time cleanup.
// The fix at each site is `${" "}` — the same thing JSX does with `{" "}`.

const hits = findGluePoints();

test("no expression is welded to adjacent prose across a line break", () => {
  const unreviewed = hits.filter((h) => !isAllowed(h));
  assert.deepEqual(
    unreviewed.map((h) => `${h.file}:${h.line}  ${h.glued}`),
    [],
    'add ${" "} on the line that ends the weld, or add it to ALLOWED in dev/find-htm-glue.js',
  );
});

test("every allowed glue point still exists", () => {
  const stale = ALLOWED.filter((a) => !hits.some((h) => h.file === a.file && h.glued === a.glued));
  assert.deepEqual(
    stale.map((a) => `${a.file}  ${a.glued}`),
    [],
    "these were reviewed as harmless but no longer match — drop them from ALLOWED",
  );
});
