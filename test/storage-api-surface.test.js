/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Every `Storage.x()` written anywhere in src/ must be a method that exists.
 *
 * Three separate call sites called `Storage.getProblems()`, which has never
 * existed — the accessor is `getAllProblems()`. All three sat inside a
 * `try`/`catch` that treated the resulting TypeError as "the optional thing
 * failed, carry on", so nothing surfaced: badge SVGs were silently never
 * written to the repository, and the streak snapshot behind the toolbar icon,
 * the popup and the settings preview silently computed from an empty list.
 *
 * `npm run lint` cannot catch this. A misspelled *property* is TS2339, which is
 * advisory-only here because it fires constantly on untyped object literals —
 * unlike TS2304, a name that does not exist at all. Storage is one object with
 * one definition, so its surface can be checked exactly.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

// browser-compat falls back to a localStorage-backed mock when chrome.* is
// absent, so the real storage module imports unmodified under Node.
const backing = new Map();
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: (k) => backing.delete(k),
};
const { Storage } = await import("../src/core/storage.js");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "vendor") continue; // generated bundles, not our code
      walk(full, out);
    } else if (entry.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

describe("Storage API surface", () => {
  test("every Storage method called in src/ actually exists", () => {
    const missing = [];
    let seen = 0;
    for (const file of walk(SRC)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\bStorage\.([A-Za-z_$][\w$]*)\s*\(/g)) {
        seen++;
        if (typeof Storage[m[1]] !== "function") {
          const line = text.slice(0, m.index).split("\n").length;
          missing.push(`${file.slice(SRC.length + 1)}:${line} — Storage.${m[1]}()`);
        }
      }
    }
    // Without this the test passes just as happily if the scan finds nothing
    // at all — a moved directory or a broken pattern would read as "clean".
    assert.ok(seen > 100, `only ${seen} Storage calls found; the scan is not reaching src/`);
    assert.deepEqual(
      missing,
      [],
      `calls to Storage methods that do not exist:\n${missing.join("\n")}`,
    );
  });

  test("getAllProblems is the accessor, and getProblems is not", () => {
    // Pins the specific confusion. If a getProblems() is ever added, this test
    // should be deleted deliberately rather than the name reintroduced by
    // accident on one call site while the others still say getAllProblems.
    assert.equal(typeof Storage.getAllProblems, "function");
    assert.equal(typeof Storage.getProblems, "undefined");
  });
});
