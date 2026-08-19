/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * README header shields regression tests.
 *
 * The shields bake their numbers in at README-generation time from
 * `indexMeta.stats`. The meta used to come only from re-reading the repo's
 * index.json through the contents API, which inlines nothing over 1 MB — so a
 * grown index made every rebuild write literal zeros into the Solutions / Easy
 * / Medium / Hard badges. The fix derives the meta from the fresh index.json
 * already inside the commit's own files array (`_indexMetaFromFiles`).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// browser-compat falls back to a localStorage-backed mock when chrome.* is
// absent, so the handler's module graph imports unmodified under Node.
const backing = new Map();
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: (k) => backing.delete(k),
};

const { getRepoReadme } = await import("../src/handlers/git/github/pages-template.js");
const { GitHubHandler } = await import("../src/handlers/git/github/index.js");

const STATS = {
  total: 42,
  easy: 20,
  medium: 15,
  hard: 7,
  byPlatform: { leetcode: 30, geeksforgeeks: 12 },
  byLang: { python3: 25, cpp: 10, javascript: 7 },
};

describe("getRepoReadme header shields", () => {
  test("bakes the real stats into the difficulty shields", () => {
    const md = getRepoReadme("o", "r", "", null, {}, { stats: STATS });
    assert.ok(md.includes("badge/Solutions-42-"), "total");
    assert.ok(md.includes("badge/Easy-20-"), "easy");
    assert.ok(md.includes("badge/Medium-15-"), "medium");
    assert.ok(md.includes("badge/Hard-7-"), "hard");
  });

  test("renders the Languages and Platforms shields from the breakdowns", () => {
    const md = getRepoReadme("o", "r", "", null, {}, { stats: STATS });
    assert.ok(md.includes("badge/Languages-3-"), "three languages in byLang");
    assert.ok(md.includes("badge/Platforms-2-"), "two platforms in byPlatform");
  });

  test("null meta still renders (zeros), not a crash", () => {
    const md = getRepoReadme("o", "r", "", null, {}, null);
    assert.ok(md.includes("badge/Solutions-0-"));
    assert.ok(md.includes("badge/Languages-0-"));
    assert.ok(md.includes("badge/Platforms-0-"));
  });
});

describe("GitHubHandler._indexMetaFromFiles", () => {
  const h = Object.create(GitHubHandler.prototype);
  const index = (extra = {}) =>
    JSON.stringify({
      stats: STATS,
      updatedAt: "2026-08-18T00:00:00.000Z",
      meta: { summary: { verified: 1, total: 2 } },
      problems: Array.from({ length: 15 }, (_, i) => ({ id: i })),
      ...extra,
    });

  test("reads the meta out of the commit's own index.json", () => {
    const meta = h._indexMetaFromFiles([
      { path: "problems/a/a.py", content: "print(1)" },
      { path: "index.json", content: index() },
    ]);
    assert.equal(meta.stats.total, 42);
    assert.equal(meta.updatedAt, "2026-08-18T00:00:00.000Z");
    assert.deepEqual(meta.summary, { verified: 1, total: 2 });
    assert.equal(meta.problems.length, 10, "problems are capped like _readIndexMeta");
  });

  test("returns null when the commit carries no index.json", () => {
    assert.equal(h._indexMetaFromFiles([{ path: "README.md", content: "x" }]), null);
    assert.equal(h._indexMetaFromFiles([]), null);
    assert.equal(h._indexMetaFromFiles(null), null);
  });

  test("returns null on unparseable content instead of throwing", () => {
    assert.equal(h._indexMetaFromFiles([{ path: "index.json", content: "{nope" }]), null);
  });
});
