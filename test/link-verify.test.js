/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The platform-generic link pipeline extends gfg-verify's contract to every
 * platform, and the same two mistakes stay pinned here: condemning a record on
 * a network blip (only a definitive "no such problem" may mark urlBroken or
 * block a manual fix), and touching the record id (commit paths and pending
 * keys hang off it). New in this module and pinned besides: the honest
 * "unverified" state — takeuforward's backend rejects extension-origin
 * requests and Codeforces gym problems are absent from the problemset listing,
 * so those saves must carry no verification stamp rather than a false one.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const { linkSlugFromInput, checkLink, applyManualLink, verifyProblemLink } = await import(
  "../src/background/link-verify.js"
);
const { slugSetFromProblemset, cfOutcomeFromSlugSet } = await import(
  "../src/background/codeforces-api.js"
);

const NOW = 1_755_500_000_000;

const HIT = { data: { title: "T" }, miss: false };
const MISS = { data: null, miss: true }; // definitive "no such problem"
const BLIP = { data: null, miss: false }; // network error / 5xx — not definitive
const GYM = { data: null, miss: false, unverifiable: true };

function lc(over = {}) {
  return {
    id: "lc-two-sum",
    platform: "leetcode",
    title: "Two Sum",
    titleSlug: "two-sum",
    ...over,
  };
}

function tuf(over = {}) {
  return {
    id: "tuf-3-sum",
    platform: "takeuforward",
    title: "3 Sum",
    titleSlug: "3-sum",
    ...over,
  };
}

function cf(over = {}) {
  return {
    id: "cf-4A",
    platform: "codeforces",
    title: "Watermelon",
    titleSlug: "4A",
    ...over,
  };
}

/** A probe answering per a slug → outcome table; unknown slugs miss. */
function probeFor(table) {
  return async (slug) => table[slug] || MISS;
}

/** Deps with per-platform probe tables; records saves and pending marks. */
function deps(probeTables, over = {}) {
  const saved = [];
  const pending = [];
  const probes = {};
  for (const [platform, table] of Object.entries(probeTables)) {
    probes[platform] = probeFor(table);
  }
  return {
    saved,
    pending,
    probes,
    saveProblem: async (p) => saved.push(p),
    markPending: async (p) => pending.push(p),
    now: () => NOW,
    ...over,
  };
}

describe("linkSlugFromInput — leetcode / neetcode / takeuforward", () => {
  test("a LeetCode problem URL yields the slug, tab suffix and all", () => {
    assert.equal(
      linkSlugFromInput("leetcode", "https://leetcode.com/problems/two-sum/description/"),
      "two-sum",
    );
  });

  test("a bare slug is case-folded to the stored form", () => {
    assert.equal(linkSlugFromInput("leetcode", "Two-Sum"), "two-sum");
  });

  test("a URL from the wrong site is rejected, not mined for a slug", () => {
    assert.equal(
      linkSlugFromInput("takeuforward", "https://leetcode.com/problems/two-sum/"),
      "",
    );
    assert.equal(
      linkSlugFromInput("leetcode", "https://neetcode.io/problems/two-integer-sum"),
      "",
    );
  });

  test("a NeetCode URL and a bare id both parse", () => {
    assert.equal(
      linkSlugFromInput("neetcode", "https://neetcode.io/problems/two-integer-sum"),
      "two-integer-sum",
    );
    assert.equal(linkSlugFromInput("neetcode", "duplicate-integer"), "duplicate-integer");
  });

  test("a takeuforward plus URL parses down to the slug", () => {
    assert.equal(
      linkSlugFromInput(
        "takeuforward",
        "https://takeuforward.org/plus/dsa/problems/3-sum?tab=editorial",
      ),
      "3-sum",
    );
  });

  test("junk and unknown platforms yield nothing", () => {
    assert.equal(linkSlugFromInput("leetcode", "not a slug!"), "");
    assert.equal(linkSlugFromInput("leetcode", ""), "");
    assert.equal(linkSlugFromInput("hackerrank", "two-sum"), "");
  });

  test("geeksforgeeks routes through the GFG parser", () => {
    assert.equal(
      linkSlugFromInput(
        "geeksforgeeks",
        "https://www.geeksforgeeks.org/problems/geeks-island--170646/1",
      ),
      "geeks-island--170646",
    );
  });
});

describe("linkSlugFromInput — codeforces", () => {
  test("all three URL shapes the site serves parse to the stored slug", () => {
    assert.equal(
      linkSlugFromInput("codeforces", "https://codeforces.com/problemset/problem/2257/F2"),
      "2257F2",
    );
    assert.equal(
      linkSlugFromInput("codeforces", "https://codeforces.com/contest/1234/problem/A"),
      "1234A",
    );
    assert.equal(
      linkSlugFromInput("codeforces", "https://codeforces.com/gym/100500/problem/B"),
      "gym100500B",
    );
  });

  test("a bare slug parses, with the index uppercased to the stored form", () => {
    assert.equal(linkSlugFromInput("codeforces", "1234a"), "1234A");
    assert.equal(linkSlugFromInput("codeforces", "gym100500B"), "gym100500B");
  });

  test("junk and wrong-site URLs yield nothing", () => {
    assert.equal(linkSlugFromInput("codeforces", "two-sum"), "");
    assert.equal(
      linkSlugFromInput("codeforces", "https://leetcode.com/problemset/problem/1/A"),
      "",
    );
  });
});

describe("checkLink", () => {
  test("a confirmed slug is ok", async () => {
    const d = deps({ leetcode: { "two-sum": HIT } });
    assert.deepEqual(await checkLink("leetcode", "two-sum", d), {
      status: "ok",
      slug: "two-sum",
    });
  });

  test("a definitive platform 'no' is notfound; a blip is error", async () => {
    const d = deps({ leetcode: { gone: MISS, flaky: BLIP } });
    assert.equal((await checkLink("leetcode", "gone", d)).status, "notfound");
    assert.equal((await checkLink("leetcode", "flaky", d)).status, "error");
  });

  test("unparseable input is invalid before any probe runs", async () => {
    const d = deps({});
    assert.equal((await checkLink("leetcode", "not a slug!", d)).status, "invalid");
  });

  test("a platform without a probe answers unverified", async () => {
    const d = deps({});
    assert.deepEqual(await checkLink("takeuforward", "3-sum", d), {
      status: "unverified",
      slug: "3-sum",
    });
  });

  test("a probe that declares the slug beyond reach answers unverified", async () => {
    const d = deps({ codeforces: { gym100500B: GYM } });
    assert.equal((await checkLink("codeforces", "gym100500B", d)).status, "unverified");
  });
});

describe("applyManualLink", () => {
  test("a verified fix saves the new slug, stamps it, and queues a recommit", async () => {
    const d = deps({ leetcode: { "add-two-numbers": HIT } });
    const p = lc({ urlBroken: true, urlBrokenAt: 1 });
    const res = await applyManualLink(p, "https://leetcode.com/problems/add-two-numbers/", d);
    assert.equal(res.status, "ok");
    assert.equal(res.slug, "add-two-numbers");
    assert.equal(d.saved.length, 1);
    const saved = d.saved[0];
    assert.equal(saved.id, "lc-two-sum"); // the id never moves
    assert.equal(saved.titleSlug, "add-two-numbers");
    assert.equal(saved.urlVerifiedAt, NOW);
    assert.equal(saved.slugRepairedFrom, "two-sum");
    assert.ok(!("urlBroken" in saved));
    assert.ok(!("urlBrokenAt" in saved));
    assert.equal(d.pending.length, 1);
  });

  test("re-applying the unchanged slug saves but does not queue a recommit", async () => {
    const d = deps({ leetcode: { "two-sum": HIT } });
    const res = await applyManualLink(lc(), "two-sum", d);
    assert.equal(res.status, "ok");
    assert.equal(d.saved.length, 1);
    assert.equal(d.pending.length, 0);
    assert.ok(!("slugRepairedFrom" in d.saved[0]));
  });

  test("a definitive miss blocks the save — a fix can't install a broken link", async () => {
    const d = deps({ leetcode: { "wrong-slug": MISS } });
    const res = await applyManualLink(lc(), "wrong-slug", d);
    assert.equal(res.status, "notfound");
    assert.equal(d.saved.length, 0);
    assert.equal(d.pending.length, 0);
  });

  test("a blip blocks the save without condemning the input", async () => {
    const d = deps({ leetcode: { "maybe-fine": BLIP } });
    const res = await applyManualLink(lc(), "maybe-fine", d);
    assert.equal(res.status, "error");
    assert.equal(d.saved.length, 0);
  });

  test("unparseable input never reaches a probe or a save", async () => {
    const d = deps({ leetcode: {} });
    const res = await applyManualLink(lc(), "definitely not a link", d);
    assert.equal(res.status, "invalid");
    assert.equal(d.saved.length, 0);
  });

  test("a probeless platform saves the fix honestly unverified", async () => {
    const d = deps({});
    const p = tuf({ urlBroken: true, urlBrokenAt: 1, urlVerifiedAt: 5 });
    const res = await applyManualLink(
      p,
      "https://takeuforward.org/plus/dsa/problems/4-sum",
      d,
    );
    assert.equal(res.status, "unverified");
    assert.equal(d.saved.length, 1);
    const saved = d.saved[0];
    assert.equal(saved.titleSlug, "4-sum");
    assert.ok(!("urlVerifiedAt" in saved)); // no false stamp
    assert.ok(!("urlBroken" in saved));
    assert.equal(saved.slugRepairedFrom, "3-sum");
    assert.equal(d.pending.length, 1);
  });

  test("a gym slug the probe can't see saves unverified too", async () => {
    const d = deps({ codeforces: { gym100500B: GYM } });
    const res = await applyManualLink(cf(), "https://codeforces.com/gym/100500/problem/B", d);
    assert.equal(res.status, "unverified");
    assert.equal(d.saved.length, 1);
    assert.ok(!("urlVerifiedAt" in d.saved[0]));
  });
});

describe("verifyProblemLink", () => {
  test("a live slug gets a verification stamp and its broken flags cleared", async () => {
    const d = deps({ leetcode: { "two-sum": HIT } });
    const res = await verifyProblemLink(lc({ urlBroken: true, urlBrokenAt: 1 }), d);
    assert.equal(res.status, "ok");
    assert.equal(d.saved.length, 1);
    assert.equal(d.saved[0].urlVerifiedAt, NOW);
    assert.ok(!("urlBroken" in d.saved[0]));
    assert.equal(d.pending.length, 0); // nothing changed — nothing to recommit
  });

  test("a definitive miss marks the record broken", async () => {
    const d = deps({ leetcode: { "two-sum": MISS } });
    const res = await verifyProblemLink(lc(), d);
    assert.equal(res.status, "broken");
    assert.equal(d.saved.length, 1);
    assert.equal(d.saved[0].urlBroken, true);
    assert.equal(d.saved[0].urlBrokenAt, NOW);
  });

  test("a blip saves nothing — only a definitive 'no' may condemn", async () => {
    const d = deps({ leetcode: { "two-sum": BLIP } });
    const res = await verifyProblemLink(lc(), d);
    assert.equal(res.status, "error");
    assert.equal(d.saved.length, 0);
  });

  test("a probeless platform and an unverifiable slug both answer unverified, no save", async () => {
    const d = deps({ codeforces: { gym100500B: GYM } });
    assert.equal((await verifyProblemLink(tuf(), d)).status, "unverified");
    assert.equal(
      (await verifyProblemLink(cf({ titleSlug: "gym100500B" }), d)).status,
      "unverified",
    );
    assert.equal(d.saved.length, 0);
  });

  test("a record without a slug is an error, not a condemnation", async () => {
    const d = deps({ leetcode: {} });
    const res = await verifyProblemLink(lc({ titleSlug: "" }), d);
    assert.equal(res.status, "error");
    assert.equal(d.saved.length, 0);
  });
});

describe("codeforces problemset helpers", () => {
  const OK_PAYLOAD = {
    status: "OK",
    result: {
      problems: [
        { contestId: 4, index: "A" },
        { contestId: 2257, index: "F2" },
      ],
    },
  };

  test("a successful listing becomes a slug set", () => {
    const set = slugSetFromProblemset(OK_PAYLOAD);
    assert.ok(set.has("4A"));
    assert.ok(set.has("2257F2"));
    assert.equal(set.size, 2);
  });

  test("a failed or empty listing yields no set at all", () => {
    assert.equal(slugSetFromProblemset({ status: "FAILED" }), null);
    assert.equal(slugSetFromProblemset({ status: "OK", result: { problems: [] } }), null);
    assert.equal(slugSetFromProblemset(undefined), null);
  });

  test("membership is definitive both ways for non-gym slugs", () => {
    const set = slugSetFromProblemset(OK_PAYLOAD);
    assert.deepEqual(cfOutcomeFromSlugSet(set, "4A"), { data: { slug: "4A" }, miss: false });
    assert.equal(cfOutcomeFromSlugSet(set, "9999Z").miss, true);
  });

  test("gym slugs are unverifiable, unparseable slugs are a definitive miss", () => {
    const set = slugSetFromProblemset(OK_PAYLOAD);
    const gym = cfOutcomeFromSlugSet(set, "gym100500B");
    assert.equal(gym.unverifiable, true);
    assert.equal(gym.miss, false);
    assert.equal(cfOutcomeFromSlugSet(set, "!!!").miss, true);
  });
});
