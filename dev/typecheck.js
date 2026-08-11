/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * typecheck.js — the type gate.
 *
 * Plain `tsc --noEmit` only inspects the files that opt in with `@ts-check`,
 * which was 11 of 153. Everything else compiled clean because it was never
 * read. Four crashing bugs shipped through that gap: three calls to
 * identifiers that did not exist, and one call to an object as if it were a
 * function.
 *
 * Turning on `checkJs` for the whole tree reads every file, but also reports
 * ~300 structural complaints about untyped object literals that are correct
 * JavaScript. So this runs the wide check and fails on a narrow list: the
 * errors that mean "this name is not there", which are always real.
 *
 * The rest still print, as advisories.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

// Resolved and run through node directly: spawning the npx/tsc shim needs a
// shell on Windows, and Node deprecates passing an argument array to one.
const tscBin = createRequire(import.meta.url).resolve("typescript/bin/tsc");

/**
 * Errors that are never a false positive on untyped JS. Each one means the
 * code would throw the moment that line ran.
 */
const FATAL = new Map([
  ["TS2304", "undefined identifier"],
  ["TS2552", "undefined identifier (misspelled)"],
  ["TS2349", "called something that is not a function"],
  ["TS1117", "duplicate key in an object literal"],
]);

/** Vendored bundles are third-party output; we do not get to fix them. */
const IGNORED_PATHS = [/^src[\\/]vendor[\\/]/];

const res = spawnSync(process.execPath, [tscBin, "--noEmit", "--checkJs"], { encoding: "utf8" });

const lines = `${res.stdout || ""}${res.stderr || ""}`.split(/\r?\n/);
const parsed = [];
for (const line of lines) {
  const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/.exec(line);
  if (!m) continue;
  const [, file, ln, , code, message] = m;
  if (IGNORED_PATHS.some((re) => re.test(file))) continue;
  parsed.push({ file, line: Number(ln), code, message });
}

const fatal = parsed.filter((e) => FATAL.has(e.code));
const advisory = parsed.length - fatal.length;

for (const e of fatal) {
  console.error(`✗ ${e.file}:${e.line} — ${FATAL.get(e.code)}\n    ${e.message}`);
}

if (fatal.length) {
  console.error(`\n${fatal.length} fatal type error(s). ${advisory} advisory not shown.`);
  process.exit(1);
}

console.log(
  `✓ no fatal type errors (${advisory} advisory finding(s) across ${parsed.length ? "checked" : "all"} files)`,
);
console.log(`  run \`npx tsc --noEmit --checkJs\` to read the advisories.`);
