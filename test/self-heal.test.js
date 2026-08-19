/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Self-heal repairs problems in the background, where nobody is watching. That
 * makes two failure modes expensive: silently overwriting something the user
 * wrote, and hammering an endpoint for data that does not exist. Most of what
 * follows pins down those two.
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

const {
  applyMetadata,
  backoffMs,
  healProblem,
  healStatus,
  isHealable,
  MAX_HEAL_ATTEMPTS,
  missingParts,
  nextHealState,
  runSelfHeal,
  selectHealBatch,
} = await import("../src/background/self-heal.js");

const problem = (over = {}) => ({
  id: "lc-two-sum",
  platform: "leetcode",
  titleSlug: "two-sum",
  title: "Two Sum",
  difficulty: "Easy",
  tags: ["array"],
  problemStatement: "<p>Given an array…</p>",
  ...over,
});

const META = {
  title: "Two Sum",
  difficulty: "Easy",
  tags: ["array", "hash-table"],
  problemStatement: "<p>fetched</p>",
};

describe("missingParts", () => {
  test("a complete problem is missing nothing", () => {
    assert.deepEqual(missingParts(problem()), []);
  });

  test("blank is missing, not just absent", () => {
    assert.deepEqual(missingParts(problem({ problemStatement: "   ", tags: [] })), [
      "statement",
      "tags",
    ]);
  });

  test("tags that are not a list count as missing", () => {
    assert.deepEqual(missingParts(problem({ tags: null })), ["tags"]);
  });
});

describe("isHealable", () => {
  test("LeetCode and GFG have an endpoint to ask", () => {
    assert.equal(isHealable(problem()), true);
    assert.equal(
      isHealable(problem({ platform: "geeksforgeeks", id: "gfg-x", titleSlug: "x" })),
      true,
    );
  });

  test("Codeforces does too, through its problem page", () => {
    // No statement API, but the page is public and the worker can GET it.
    assert.equal(isHealable(problem({ platform: "codeforces", id: "cf-4A" })), true);
  });

  test("NeetCode and takeuforward publish no statement anywhere", () => {
    // Theirs is written by the AI review, under a heading that says so. There
    // is nothing to fetch, so attempting it would only be traffic.
    assert.equal(isHealable(problem({ platform: "neetcode", id: "nc-x" })), false);
    assert.equal(isHealable(problem({ platform: "takeuforward", id: "tuf-x" })), false);
  });

  test("a record with no slug cannot be asked about", () => {
    assert.equal(isHealable({ platform: "leetcode", id: "", titleSlug: "" }), false);
  });

  test("the slug is recovered from the id when the field is missing", () => {
    assert.equal(isHealable({ platform: "leetcode", id: "lc-two-sum" }), true);
  });

  test("a urlBroken record is not healable — every attempt would 404", () => {
    // The GFG verification sweep owns these; it clears the flag on repair.
    assert.equal(
      isHealable(problem({ platform: "geeksforgeeks", id: "gfg-x", titleSlug: "x", urlBroken: true })),
      false,
    );
  });
});

describe("applyMetadata", () => {
  test("fills only what is missing", () => {
    const { merged, changed } = applyMetadata(problem({ tags: [], problemStatement: "" }), META);
    assert.deepEqual(changed, ["tags", "statement"]);
    assert.deepEqual(merged.tags, ["array", "hash-table"]);
    assert.equal(merged.problemStatement, "<p>fetched</p>");
  });

  test("never overwrites a statement that is already there", () => {
    // The user may have pasted their own notes into it. A background job that
    // replaces them is a bug nobody would think to look for.
    const { merged, changed } = applyMetadata(problem({ problemStatement: "mine" }), META);
    assert.equal(merged.problemStatement, "mine");
    assert.deepEqual(changed, []);
  });

  test("never overwrites tags that are already there", () => {
    const { merged } = applyMetadata(problem({ tags: ["my-tag"] }), META);
    assert.deepEqual(merged.tags, ["my-tag"]);
  });

  test("replaces a title that is only the slug", () => {
    const { merged, changed } = applyMetadata(problem({ title: "two-sum" }), META);
    assert.equal(merged.title, "Two Sum");
    assert.ok(changed.includes("title"));
  });

  test("leaves a real title alone", () => {
    const { merged } = applyMetadata(problem({ title: "My rename" }), META);
    assert.equal(merged.title, "My rename");
  });

  test("normalises a fetched difficulty rather than storing it raw", () => {
    const { merged } = applyMetadata(problem({ difficulty: "" }), {
      ...META,
      difficulty: "MEDIUM",
    });
    assert.equal(merged.difficulty, "Medium");
  });

  test("an empty answer changes nothing", () => {
    const { merged, changed } = applyMetadata(problem({ tags: [], problemStatement: "" }), {
      tags: [],
      problemStatement: "",
    });
    assert.deepEqual(changed, []);
    assert.deepEqual(merged.tags, []);
  });
});

describe("selectHealBatch", () => {
  const gap2 = problem({ id: "a", titleSlug: "a", tags: [], problemStatement: "" });
  const gap1 = problem({ id: "b", titleSlug: "b", tags: [] });
  const whole = problem({ id: "c", titleSlug: "c" });
  const nc = problem({ id: "d", titleSlug: "d", platform: "neetcode", tags: [] });

  test("picks only incomplete, fetchable problems", () => {
    const batch = selectHealBatch([gap2, gap1, whole, nc], {}, 1000, 10);
    assert.deepEqual(
      batch.map((p) => p.id),
      ["a", "b"],
    );
  });

  test("the worst-off go first", () => {
    const batch = selectHealBatch([gap1, gap2], {}, 1000, 1);
    assert.deepEqual(
      batch.map((p) => p.id),
      ["a"],
    );
  });

  test("a problem still in backoff is skipped", () => {
    const batch = selectHealBatch([gap1], { b: { attempts: 1, nextAt: 5000 } }, 1000, 10);
    assert.deepEqual(batch, []);
  });

  test("a problem whose backoff has expired comes back", () => {
    const batch = selectHealBatch([gap1], { b: { attempts: 1, nextAt: 500 } }, 1000, 10);
    assert.equal(batch.length, 1);
  });

  test("a problem that has failed its last attempt is left alone", () => {
    const state = { b: { attempts: MAX_HEAL_ATTEMPTS, nextAt: 0 } };
    assert.deepEqual(selectHealBatch([gap1], state, 1e12, 10), []);
  });

  test("the limit is respected", () => {
    assert.equal(selectHealBatch([gap2, gap1], {}, 1000, 1).length, 1);
  });
});

describe("backoffMs", () => {
  test("grows with each failure", () => {
    assert.ok(backoffMs(1) < backoffMs(2));
    assert.ok(backoffMs(2) < backoffMs(3));
  });

  test("an attempt count past the table does not fall off it", () => {
    assert.equal(backoffMs(99), backoffMs(MAX_HEAL_ATTEMPTS));
  });
});

describe("healProblem", () => {
  /** Records what was saved. */
  function deps(fetcher) {
    const saved = [];
    return {
      saved,
      saveProblem: async (p) => saved.push(p),
      fetchers: { leetcode: fetcher },
    };
  }

  test("saves the merged record and reports what it filled", async () => {
    const d = deps(async () => META);
    const res = await healProblem(problem({ tags: [], problemStatement: "" }), d);
    assert.equal(res.ok, true);
    assert.deepEqual(res.changed, ["tags", "statement"]);
    assert.deepEqual(res.stillMissing, []);
    assert.equal(d.saved.length, 1);
  });

  test("does not write when there was nothing to fill", async () => {
    const d = deps(async () => META);
    const res = await healProblem(problem(), d);
    assert.deepEqual(res.changed, []);
    assert.deepEqual(d.saved, [], "a no-op write would still drag the record into the next commit");
  });

  test("a platform that answers with nothing is a failure, not a repair", async () => {
    const d = deps(async () => null);
    const res = await healProblem(problem({ tags: [] }), d);
    assert.equal(res.ok, false);
    assert.match(res.error, /returned nothing/);
    assert.deepEqual(d.saved, []);
  });

  test("a throwing fetcher is reported, not propagated", async () => {
    const d = deps(async () => {
      throw new Error("network down");
    });
    const res = await healProblem(problem({ tags: [] }), d);
    assert.equal(res.ok, false);
    assert.equal(res.error, "network down");
  });

  test("an answer that fills nothing still counts as answered", async () => {
    // The data is not there to be had — a premium problem, a retired slug. This
    // is what stops the backoff from being reset forever on the same problem.
    const d = deps(async () => ({ tags: [], problemStatement: "" }));
    const res = await healProblem(problem({ tags: [] }), d);
    assert.equal(res.ok, true);
    assert.deepEqual(res.stillMissing, ["tags"]);
  });

  test("a platform with no fetcher is refused rather than retried", async () => {
    const res = await healProblem(problem({ platform: "codeforces", tags: [] }), {
      saveProblem: async () => {},
      fetchers: {},
    });
    assert.equal(res.ok, false);
  });
});

describe("nextHealState", () => {
  test("a fully repaired problem is forgotten", () => {
    assert.equal(nextHealState({ attempts: 2 }, { ok: true, stillMissing: [] }, 0), null);
  });

  test("a failure counts up and schedules the next try", () => {
    const s = nextHealState({ attempts: 1 }, { ok: false, stillMissing: ["tags"], error: "x" }, 0);
    assert.equal(s.attempts, 2);
    assert.equal(s.nextAt, backoffMs(2));
    assert.equal(s.lastError, "x");
  });

  test("a long error message is truncated before it is stored", () => {
    const s = nextHealState({}, { ok: false, stillMissing: ["tags"], error: "e".repeat(500) }, 0);
    assert.equal(s.lastError.length, 200);
  });
});

describe("runSelfHeal", () => {
  /** A whole fake world: problems, heal state, and a scripted fetcher. */
  function world(problems, fetcher, now = 1_000_000) {
    const store = new Map(problems.map((p) => [p.id, p]));
    let state = {};
    const notified = [];
    return {
      store,
      notified,
      get state() {
        return state;
      },
      deps: {
        getAllProblems: async () => [...store.values()],
        saveProblem: async (p) => store.set(p.id, p),
        loadState: async () => state,
        saveState: async (s) => {
          state = s;
        },
        notify: (p, fields) => notified.push([p.id, fields]),
        now: () => now,
        fetchers: { leetcode: fetcher, geeksforgeeks: fetcher },
      },
    };
  }

  test("repairs a batch and leaves no bookkeeping behind", async () => {
    const w = world(
      [
        problem({ id: "lc-a", titleSlug: "a", tags: [], problemStatement: "" }),
        problem({ id: "lc-b", titleSlug: "b", tags: [], problemStatement: "" }),
      ],
      async () => META,
    );
    const summary = await runSelfHeal(w.deps, { limit: 5 });
    assert.equal(summary.attempted, 2);
    assert.equal(summary.healed, 2);
    assert.deepEqual(w.state, {}, "nothing is still waiting, so nothing is still tracked");
    assert.equal(w.notified.length, 2);
    assert.deepEqual(w.store.get("lc-a").tags, ["array", "hash-table"]);
  });

  test("only `limit` problems are touched per pass", async () => {
    let calls = 0;
    const w = world(
      [
        problem({ id: "lc-a", titleSlug: "a", tags: [] }),
        problem({ id: "lc-b", titleSlug: "b", tags: [] }),
        problem({ id: "lc-c", titleSlug: "c", tags: [] }),
      ],
      async () => {
        calls++;
        return META;
      },
    );
    await runSelfHeal(w.deps, { limit: 2 });
    assert.equal(calls, 2, "slowly and surely — the point is not to hammer the platform");
  });

  test("a failure schedules a retry instead of giving up", async () => {
    const w = world([problem({ id: "lc-a", titleSlug: "a", tags: [] })], async () => null);
    await runSelfHeal(w.deps, { limit: 5 });
    assert.equal(w.state["lc-a"].attempts, 1);
    assert.ok(w.state["lc-a"].nextAt > 1_000_000);
  });

  test("a problem stops being retried after the attempt cap", async () => {
    const w = world([problem({ id: "lc-a", titleSlug: "a", tags: [] })], async () => null);
    for (let i = 0; i < MAX_HEAL_ATTEMPTS + 3; i++) {
      // Pretend each pass happens well after the previous backoff expired.
      w.deps.now = () => 1_000_000 + i * 30 * 24 * 3600 * 1000;
      await runSelfHeal(w.deps, { limit: 5 });
    }
    assert.equal(w.state["lc-a"].attempts, MAX_HEAL_ATTEMPTS);
  });

  test("complete problems are never fetched for", async () => {
    let calls = 0;
    const w = world([problem()], async () => {
      calls++;
      return META;
    });
    const summary = await runSelfHeal(w.deps, { limit: 5 });
    assert.equal(calls, 0);
    assert.equal(summary.attempted, 0);
  });

  test("state for a problem that has since been deleted is dropped", async () => {
    const w = world([problem({ id: "lc-a", titleSlug: "a", tags: [] })], async () => null);
    await runSelfHeal(w.deps, { limit: 5 });
    assert.ok(w.state["lc-a"]);
    w.store.delete("lc-a");
    await runSelfHeal(w.deps, { limit: 5 });
    assert.deepEqual(w.state, {}, "otherwise the map only ever grows");
  });
});

describe("healStatus", () => {
  test("separates what is waiting from what will never come", () => {
    const problems = [
      problem({ id: "lc-a", titleSlug: "a", tags: [] }),
      problem({ id: "lc-b", titleSlug: "b", tags: [] }),
      problem({ id: "nc-c", titleSlug: "c", platform: "neetcode", tags: [] }),
      problem({ id: "lc-d", titleSlug: "d" }),
    ];
    const state = { "lc-b": { attempts: MAX_HEAL_ATTEMPTS } };
    assert.deepEqual(healStatus(problems, state), {
      incomplete: 3,
      waiting: 1,
      givenUp: 1,
      unfetchable: 1,
    });
  });

  test("a whole library reports nothing to do", () => {
    assert.deepEqual(healStatus([problem()], {}), {
      incomplete: 0,
      waiting: 0,
      givenUp: 0,
      unfetchable: 0,
    });
  });
});
