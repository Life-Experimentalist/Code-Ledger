/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The generated ledger README, assembled the way infra-builder assembles it.
 *
 * Three generators write into one file — `getRepoReadme` owns the stats block
 * between the CODELEDGER_AUTO_GENERATED markers, `upsertReadmeBlock` owns the
 * gamification block between its own pair, and the nightly workflow reruns the
 * second one alone. Every existing test exercised exactly one of them in
 * isolation, so nothing could see what the reader actually sees: the same four
 * numbers rendered three times, two adjacent badges whose labels both read
 * "solved", and a streak card that landed above the centered div and therefore
 * left-aligned above the title. These tests read the composed document.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// browser-compat falls back to a localStorage-backed mock when chrome.* is
// absent, so the module graph imports unmodified under Node.
const backing = new Map();
globalThis.localStorage = {
  getItem: (k) => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: (k) => backing.delete(k),
};

const { getRepoReadme } = await import("../src/handlers/git/github/pages-template.js");
const { upsertReadmeBlock, README_START, README_END } = await import("../src/core/badge-svg.js");
const { computeSnapshot } = await import("../src/core/gamification.js");

const at = (key) => Date.parse(`${key}T12:00:00.000Z`);

const SNAP = computeSnapshot(
  ["2026-03-01", "2026-03-02", "2026-03-03"].map((d, i) => ({
    canonicalId: `p${i}`,
    title: "Problem",
    platform: "leetcode",
    difficulty: "Medium",
    timestamp: at(d),
  })),
  { config: { utcOffsetMinutes: 0, dailyTargetPoints: 25 }, now: at("2026-03-03") },
);

const META = {
  updatedAt: at("2026-03-03"),
  stats: {
    total: 42,
    easy: 20,
    medium: 15,
    hard: 7,
    byPlatform: { leetcode: 30, geeksforgeeks: 12 },
    byLang: { python3: 25, cpp: 10, javascript: 7 },
  },
};

const PAGES = "https://o.github.io/r";

/** What infra-builder produces for a repo with no README yet. */
function compose(meta = META, snap = SNAP) {
  return upsertReadmeBlock(getRepoReadme("o", "r", PAGES, null, {}, meta), snap, {
    pagesUrl: PAGES,
  });
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

describe("composed README — structure", () => {
  test("the gamification block sits inside the centered div", () => {
    const md = compose();
    const open = md.indexOf('<div align="center">');
    const close = md.indexOf("</div>");
    const block = md.indexOf(README_START);
    assert.ok(open !== -1 && close !== -1, "the centered div survived composition");
    assert.ok(block > open, "gamification block must not precede the centered div");
    assert.ok(block < close, "gamification block must not follow the centered div");
  });

  test("the streak card is not the first thing in the file", () => {
    // upsertReadmeBlock prepends when it finds no markers. That is the fallback
    // that put the card above the title, and it means the markers really are
    // being emitted by the template rather than discovered by luck.
    const md = compose();
    assert.ok(!md.trimStart().startsWith("<picture>"));
    assert.ok(md.indexOf("# o's DSA Solutions") < md.indexOf("<picture>"));
  });

  test("each marker appears exactly once", () => {
    const md = compose();
    for (const marker of [README_START, README_END, "<!-- CODELEDGER_AUTO_GENERATED_START -->"]) {
      assert.equal(count(md, marker), 1, `${marker} should appear once`);
    }
  });

  test("composing twice is byte-identical", () => {
    // The nightly workflow reruns upsertReadmeBlock against its own output. If
    // that is not a fixed point it commits an empty diff every night forever.
    const once = compose();
    assert.equal(upsertReadmeBlock(once, SNAP, { pagesUrl: PAGES }), once);
  });
});

describe("composed README — no duplicated metric", () => {
  test("each count shield is rendered exactly once", () => {
    const md = compose();
    for (const [label, value] of [
      ["Solutions", 42],
      ["Easy", 20],
      ["Medium", 15],
      ["Hard", 7],
    ]) {
      assert.equal(count(md, `badge/${label}-${value}-`), 1, `${label} rendered more than once`);
    }
  });

  test("no Total/Easy/Medium/Hard table restates the shields", () => {
    const md = compose();
    assert.ok(!md.includes("| Total | Easy | Medium | Hard |"));
  });

  test("the gamification row adds no second solve count", () => {
    const md = compose();
    assert.ok(!md.includes("/badges/solved.svg"), "solved duplicates the Solutions shield");
    assert.ok(!md.includes("/badges/difficulty.svg"), "difficulty duplicates Easy/Medium/Hard");
  });

  test("no two badges share a shields label", () => {
    const md = compose();
    const labels = [...md.matchAll(/img\.shields\.io\/badge\/([^-]+)-/g)].map((m) => m[1]);
    assert.equal(new Set(labels).size, labels.length, `duplicate label in ${labels.join(", ")}`);
  });

  test("no two count shields share a colour", () => {
    const md = compose();
    const colors = [...md.matchAll(/img\.shields\.io\/badge\/[^-]+-[^-]+-([0-9a-f]{6})\?/g)].map(
      (m) => m[1],
    );
    assert.ok(colors.length >= 6, "expected the six count shields");
    assert.equal(new Set(colors).size, colors.length, `duplicate colour in ${colors.join(", ")}`);
  });
});

describe("composed README — markdown that renders", () => {
  test("the dashboard link and the timestamp are separate paragraphs", () => {
    // Adjacent lines are one paragraph in markdown, which ran these together as
    // "View Live Dashboard →Last updated: Mar 3, 2026".
    const md = compose();
    assert.match(md, /\*\*\[View Live Dashboard →\]\([^)]*\)\*\*\n\n\*Last updated: /);
  });

  test("a missing updatedAt leaves no blank stub behind", () => {
    const md = compose({ stats: META.stats });
    assert.ok(!md.includes("Last updated"));
    assert.ok(!/\n\n\n\n/.test(md), "stray blank lines where the timestamp would have been");
  });

  test("stats with no breakdowns emits no empty section heading", () => {
    const md = compose({ stats: { total: 1, easy: 1, medium: 0, hard: 0 } });
    assert.ok(!md.includes("## Stats"), "a heading with nothing under it");
  });

  test("stats with breakdowns still emits them", () => {
    const md = compose();
    assert.match(md, /## Stats/);
    assert.match(md, /\*\*By Platform:\*\* leetcode \(30\)/);
    assert.match(md, /\*\*Top Languages:\*\* python3 \(25\)/);
  });
});
