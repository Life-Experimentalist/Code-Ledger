/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The verification sweep decides whether an imported GFG record keeps its
 * slug, gets a repaired one, or is flagged for user review. Two mistakes are
 * expensive and both are pinned here: condemning a record on a network blip
 * (only a clean sweep of definitive 404s may mark urlBroken), and touching
 * the record id (commit paths and pending keys hang off it).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const { slugCandidates, verifyGfgProblem, runGfgVerifySweep, slugFromInput, applyManualSlug } =
  await import("../src/background/gfg-verify.js");

const NOW = 1_755_500_000_000;

function gfg(over = {}) {
  return {
    id: "gfg-geeks-island--170646",
    platform: "geeksforgeeks",
    title: "Geeks Island",
    titleSlug: "geeks-island--170646",
    ...over,
  };
}

/** Deps whose fetch resolves per a slug → outcome table; records saves. */
function deps(table, over = {}) {
  const saved = [];
  const pending = [];
  return {
    saved,
    pending,
    fetchOutcome: async (slug) => table[slug] || { data: null, miss: true },
    saveProblem: async (p) => saved.push(p),
    markPending: async (p) => pending.push(p),
    now: () => NOW,
    ...over,
  };
}

const HIT = { data: { title: "T" }, miss: false };
const MISS = { data: null, miss: true }; // definitive 404
const BLIP = { data: null, miss: false }; // network error / 5xx — not definitive

describe("slugCandidates", () => {
  test("a modern slug leads with itself", () => {
    const c = slugCandidates(gfg());
    assert.equal(c[0], "geeks-island--170646");
  });

  test("a legacy list-form slug is cleaned first, raw kept as fallback", () => {
    const c = slugCandidates(gfg({ titleSlug: "total-decoding-messages--1235" }));
    assert.equal(c[0], "total-decoding-messages1235");
    assert.ok(c.includes("total-decoding-messages--1235"));
  });

  test("a concatenated modern id gets its -- restored", () => {
    const c = slugCandidates(gfg({ titleSlug: "geeks-island170646" }));
    assert.ok(c.includes("geeks-island--170646"));
  });

  test("the bare base name is tried after the id forms", () => {
    const c = slugCandidates(gfg({ titleSlug: "compare-two-fractions4438" }));
    assert.ok(c.includes("compare-two-fractions"));
  });

  test("a real display title contributes a slugified candidate", () => {
    const c = slugCandidates(gfg({ title: "Total Decoding Messages", titleSlug: "wrong-slug" }));
    assert.ok(c.includes("total-decoding-messages"));
  });

  test("a slug-shaped title adds nothing", () => {
    const c = slugCandidates(gfg({ title: "geeks-island--170646" }));
    assert.ok(!c.includes("geeks-island--170646--"));
    assert.ok(c.length <= 5);
  });

  test("candidates are unique and capped at 5", () => {
    const c = slugCandidates(gfg());
    assert.equal(new Set(c).size, c.length);
    assert.ok(c.length <= 5);
  });

  test("the slug is recovered from the id when the field is missing", () => {
    const c = slugCandidates({ id: "gfg-geeks-island--170646", platform: "geeksforgeeks" });
    assert.equal(c[0], "geeks-island--170646");
  });
});

describe("verifyGfgProblem", () => {
  test("a working slug is stamped verified, not repaired", async () => {
    const d = deps({ "geeks-island--170646": HIT });
    const res = await verifyGfgProblem(gfg(), d);
    assert.equal(res.status, "ok");
    assert.equal(res.repaired, false);
    assert.equal(d.saved.length, 1);
    assert.equal(d.saved[0].urlVerifiedAt, NOW);
    assert.equal(d.pending.length, 0, "no repair — no new commit needed");
  });

  test("a wrong slug is repaired to the variant that resolves, id untouched", async () => {
    const d = deps({ "geeks-island--170646": HIT });
    const res = await verifyGfgProblem(gfg({ titleSlug: "geeks-island170646" }), d);
    assert.equal(res.status, "ok");
    assert.equal(res.repaired, true);
    assert.equal(res.slug, "geeks-island--170646");
    const saved = d.saved[0];
    assert.equal(saved.titleSlug, "geeks-island--170646");
    assert.equal(saved.slugRepairedFrom, "geeks-island170646");
    assert.equal(saved.id, "gfg-geeks-island--170646", "id must never change");
    assert.equal(d.pending.length, 1, "repaired record is queued for commit");
  });

  test("repair clears an earlier urlBroken flag", async () => {
    const d = deps({ "geeks-island--170646": HIT });
    await verifyGfgProblem(gfg({ titleSlug: "geeks-island170646", urlBroken: true, urlBrokenAt: 1 }), d);
    assert.equal(d.saved[0].urlBroken, undefined);
    assert.equal(d.saved[0].urlBrokenAt, undefined);
  });

  test("all candidates definitively 404 → marked urlBroken, never deleted", async () => {
    const d = deps({}); // table empty — every fetch is a definitive miss
    const res = await verifyGfgProblem(gfg(), d);
    assert.equal(res.status, "broken");
    assert.equal(d.saved.length, 1);
    assert.equal(d.saved[0].urlBroken, true);
    assert.equal(d.saved[0].urlBrokenAt, NOW);
    assert.equal(d.saved[0].id, "gfg-geeks-island--170646");
  });

  test("a network blip among the misses blocks condemnation", async () => {
    const d = deps({ "geeks-island--170646": BLIP });
    const res = await verifyGfgProblem(gfg(), d);
    assert.equal(res.status, "error");
    assert.equal(d.saved.length, 0, "nothing may be marked on an indefinite pass");
  });
});

describe("runGfgVerifySweep", () => {
  const all = [
    gfg(),
    gfg({ id: "gfg-a", titleSlug: "a", urlVerifiedAt: 5 }),
    gfg({ id: "gfg-b", titleSlug: "b", urlBroken: true }),
    { id: "lc-two-sum", platform: "leetcode", titleSlug: "two-sum" },
  ];

  test("only unverified GFG records are checked by default", async () => {
    const d = deps(
      { "geeks-island--170646": HIT },
      { getAllProblems: async () => all },
    );
    const counts = await runGfgVerifySweep(d, { delayMs: 0 });
    assert.deepEqual(counts, { checked: 1, ok: 1, repaired: 0, broken: 0, errors: 0 });
  });

  test("an ids subset overrides the unverified filter", async () => {
    const d = deps(
      { b: HIT },
      { getAllProblems: async () => all },
    );
    const counts = await runGfgVerifySweep(d, { delayMs: 0, ids: ["gfg-b", "lc-two-sum"] });
    assert.equal(counts.checked, 1, "leetcode id is ignored even when listed");
    assert.equal(counts.ok, 1);
  });

  test("counts split across ok / repaired / broken / errors", async () => {
    const many = [
      gfg({ id: "gfg-ok", titleSlug: "ok" }),
      gfg({ id: "gfg-fix", titleSlug: "fix170646", title: null }),
      gfg({ id: "gfg-dead", titleSlug: "dead", title: null }),
      gfg({ id: "gfg-flaky", titleSlug: "flaky", title: null }),
    ];
    const d = deps(
      { ok: HIT, "fix--170646": HIT, flaky: BLIP, fla: BLIP },
      { getAllProblems: async () => many },
    );
    const counts = await runGfgVerifySweep(d, { delayMs: 0 });
    assert.deepEqual(counts, { checked: 4, ok: 2, repaired: 1, broken: 1, errors: 1 });
  });
});

describe("slugFromInput", () => {
  test("a full problem URL yields its slug", () => {
    assert.equal(
      slugFromInput("https://www.geeksforgeeks.org/problems/geeks-island--170646/1"),
      "geeks-island--170646",
    );
  });

  test("the trailing tab segment and slashes are stripped", () => {
    assert.equal(slugFromInput("https://www.geeksforgeeks.org/problems/two-sum/0/"), "two-sum");
  });

  test("query strings and fragments are ignored", () => {
    assert.equal(
      slugFromInput("https://www.geeksforgeeks.org/problems/two-sum/1?utm_source=x#editor"),
      "two-sum",
    );
  });

  test("a bare slug passes through, case-folded and trimmed", () => {
    assert.equal(slugFromInput("  Geeks-Island--170646 "), "geeks-island--170646");
  });

  test("percent-escapes are decoded", () => {
    assert.equal(
      slugFromInput("https://www.geeksforgeeks.org/problems/geeks%2Disland--170646/1"),
      "geeks-island--170646",
    );
  });

  test("non-slug junk is rejected", () => {
    assert.equal(slugFromInput("not a slug at all!"), "");
    assert.equal(slugFromInput("https://www.geeksforgeeks.org/about/"), "");
    assert.equal(slugFromInput(""), "");
  });
});

describe("applyManualSlug", () => {
  test("a resolving URL is applied, id untouched, record queued for commit", async () => {
    const d = deps({ "geeks-island--170646": HIT });
    const res = await applyManualSlug(
      gfg({ titleSlug: "wrong-slug", urlBroken: true, urlBrokenAt: 1 }),
      "https://www.geeksforgeeks.org/problems/geeks-island--170646/1",
      d,
    );
    assert.equal(res.status, "ok");
    assert.equal(res.slug, "geeks-island--170646");
    const saved = d.saved[0];
    assert.equal(saved.titleSlug, "geeks-island--170646");
    assert.equal(saved.slugRepairedFrom, "wrong-slug");
    assert.equal(saved.id, "gfg-geeks-island--170646", "id must never change");
    assert.equal(saved.urlBroken, undefined);
    assert.equal(saved.urlBrokenAt, undefined);
    assert.equal(saved.urlVerifiedAt, NOW);
    assert.equal(d.pending.length, 1);
  });

  test("re-entering the current slug re-verifies without queuing a commit", async () => {
    const d = deps({ "geeks-island--170646": HIT });
    const res = await applyManualSlug(gfg(), "geeks-island--170646", d);
    assert.equal(res.status, "ok");
    assert.equal(d.saved.length, 1);
    assert.equal(d.pending.length, 0, "unchanged slug — nothing new to commit");
  });

  test("unparseable input is rejected before any network call", async () => {
    let fetched = 0;
    const d = deps({}, { fetchOutcome: async () => (fetched++, MISS) });
    const res = await applyManualSlug(gfg(), "??? definitely not a link", d);
    assert.equal(res.status, "invalid");
    assert.equal(fetched, 0);
    assert.equal(d.saved.length, 0);
  });

  test("a slug GFG 404s is refused — a fix cannot install another broken link", async () => {
    const d = deps({}); // every fetch is a definitive miss
    const res = await applyManualSlug(gfg(), "https://www.geeksforgeeks.org/problems/dead-slug/1", d);
    assert.equal(res.status, "notfound");
    assert.equal(d.saved.length, 0, "record must be untouched");
  });

  test("a network blip reports error, not notfound, and saves nothing", async () => {
    const d = deps({ "flaky-slug": BLIP });
    const res = await applyManualSlug(gfg(), "flaky-slug", d);
    assert.equal(res.status, "error");
    assert.equal(d.saved.length, 0);
  });
});
