/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The badge refresh script that ships inside users' repositories.
 *
 * Two things are pinned here. First, that src/vendor/refresh-badges-source.js
 * is the bundle the current sources actually produce — the workflow in every
 * user's repo runs this string verbatim, and a stale copy means their nightly
 * refresh computes badges with rules the extension has already moved past
 * (which is how streaks "randomly" went to zero once before). Second, the
 * script's own behavior when run the way GitHub Actions runs it: against an
 * index.json in the working directory, with no npm install.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { REFRESH_BADGES_SCRIPT } = await import("../src/vendor/refresh-badges-source.js");

test("committed bundle matches what the sources produce now", () => {
  // --check rebuilds from dev/refresh-badges-entry.js and exits 1 on drift.
  execFileSync(process.execPath, [join(ROOT, "dev", "generate-refresh-script.js"), "--check"], {
    cwd: ROOT,
  });
});

/** Run the bundled script in a scratch repo directory the way Actions does. */
function runScript(indexJson) {
  const dir = mkdtempSync(join(tmpdir(), "cl-refresh-"));
  writeFileSync(join(dir, "refresh.mjs"), REFRESH_BADGES_SCRIPT, "utf8");
  if (indexJson !== undefined) {
    writeFileSync(join(dir, "index.json"), JSON.stringify(indexJson), "utf8");
  }
  const r = spawnSync(process.execPath, ["refresh.mjs"], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`refresh script exited ${r.status}: ${r.stderr}`);
  }
  return { dir, out: `${r.stdout}\n${r.stderr}` };
}

test("writes badges from a normal index.json", () => {
  const { dir } = runScript({
    problems: [
      { platform: "leetcode", titleSlug: "two-sum", difficulty: "Easy", timestamp: Date.now() },
    ],
  });
  try {
    assert.ok(existsSync(join(dir, "badges", "streak.svg")), "streak.svg should be written");
    const shields = JSON.parse(readFileSync(join(dir, "badges", "shields", "solved.json"), "utf8"));
    assert.equal(shields.message, "1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("refuses to overwrite badges with zeros when no record scored", () => {
  // Records with no usable timestamp and no _solveDateUnknown flag score zero
  // events. That is bad data, not an empty library — the script must leave the
  // extension-written badges alone rather than commit zeros over them.
  const { dir, out } = runScript({
    problems: [
      { platform: "codeforces", titleSlug: "1a-theatre-square", difficulty: "Easy" },
      { platform: "codeforces", titleSlug: "4a-watermelon", difficulty: "Easy", timestamp: null },
    ],
  });
  try {
    assert.ok(!existsSync(join(dir, "badges")), "badges/ must not be created");
    assert.match(out + "", /refusing to overwrite/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("undated solves still count and do not trip the zero guard", () => {
  // GFG imports know what was solved but not when: _solveDateUnknown records
  // carry points without a calendar day, so the snapshot is not all-zero.
  const { dir } = runScript({
    problems: [
      { platform: "geeksforgeeks", titleSlug: "kadane", difficulty: "Medium", _solveDateUnknown: true },
    ],
  });
  try {
    const shields = JSON.parse(readFileSync(join(dir, "badges", "shields", "solved.json"), "utf8"));
    assert.equal(shields.message, "1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("exits cleanly when index.json is missing", () => {
  const { dir } = runScript(undefined);
  try {
    assert.ok(!existsSync(join(dir, "badges")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
