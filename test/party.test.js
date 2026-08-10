/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  PARTY_LIMIT,
  parseFriendRef,
  friendId,
  friendLabel,
  repoUrl,
  statsUrl,
  indexUrl,
  parseStats,
  stalenessDays,
  METRICS,
  compareRows,
  parseCompareParam,
  buildCompareUrl,
  addFriend,
  removeFriend,
  normalizeFriends,
  summarizeIndex,
  topicGap,
  fetchFriendStats,
  ERROR_TEXT,
} from "../src/core/party.js";

const root = new URL("../", import.meta.url);
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, root)), "utf8");

const STATS = {
  schema: 1,
  asOf: "2026-08-10",
  currentStreak: 12,
  longestStreak: 40,
  freezes: 2,
  totalPoints: 1250,
  totalSolves: 88,
  totalRecalls: 9,
  byDifficulty: { Easy: 40, Medium: 38, Hard: 10 },
  level: 5,
  levelName: "Engineer",
  activeDays: 60,
  dailyTargetPoints: 25,
  achievements: ["first-blood", "century"],
};

describe("parseFriendRef", () => {
  test("reads the four shapes that actually get pasted", () => {
    for (const input of [
      "octocat/ledger",
      "https://github.com/octocat/ledger",
      "github.com/octocat/ledger.git",
      "  https://www.github.com/octocat/ledger/  ",
    ]) {
      const ref = parseFriendRef(input);
      assert.ok(ref, `should have parsed ${input}`);
      assert.equal(ref.owner, "octocat");
      assert.equal(ref.repo, "ledger");
      assert.equal(ref.branch, "", "no branch was named in any of these");
    }
  });

  test("a branch can be named either way", () => {
    assert.equal(parseFriendRef("octocat/ledger@dev").branch, "dev");
    assert.equal(parseFriendRef("https://github.com/octocat/ledger/tree/dev").branch, "dev");
    assert.equal(
      parseFriendRef("https://github.com/octocat/ledger/tree/release/2.1-rc").branch,
      "release/2.1-rc",
      "a slash in a branch name is ordinary and must survive",
    );
  });

  test("rejects anything that is not a repository", () => {
    for (const input of [
      "",
      "   ",
      "octocat",
      "octocat/ledger/extra",
      "https://gitlab.com/octocat/ledger",
      "-octocat/ledger",
      "octocat/led ger",
      "octocat/ledger@../../etc",
      "octocat/ledger@" + "x".repeat(300),
      null,
      undefined,
      {},
    ]) {
      assert.equal(parseFriendRef(input), null, `should have refused ${String(input)}`);
    }
  });

  test("a branch may not smuggle a different path into the URL", () => {
    assert.equal(parseFriendRef("octocat/ledger@a/../../b"), null);
    assert.equal(parseFriendRef("octocat/ledger@/main"), null);
    assert.equal(parseFriendRef("octocat/ledger@ma in"), null);
  });
});

describe("identity", () => {
  test("owner and repo are case-insensitive, the branch is not", () => {
    assert.equal(friendId({ owner: "OctoCat", repo: "Ledger" }), "octocat/ledger");
    assert.equal(
      friendId({ owner: "octocat", repo: "ledger", branch: "Dev" }),
      "octocat/ledger@Dev",
    );
    assert.notEqual(
      friendId({ owner: "octocat", repo: "ledger", branch: "dev" }),
      friendId({ owner: "octocat", repo: "ledger", branch: "Dev" }),
    );
  });

  test("the label prefers a nickname but never renders nothing", () => {
    assert.equal(friendLabel({ owner: "octocat", repo: "ledger", label: "Sam" }), "Sam");
    assert.equal(friendLabel({ owner: "octocat", repo: "ledger" }), "octocat/ledger");
    assert.equal(
      friendLabel({ owner: "octocat", repo: "ledger", branch: "dev" }),
      "octocat/ledger@dev",
    );
  });

  test("urls point at the raw host, which is what answers anonymously", () => {
    const ref = parseFriendRef("octocat/ledger");
    assert.equal(repoUrl(ref), "https://github.com/octocat/ledger");
    assert.equal(
      statsUrl(ref),
      "https://raw.githubusercontent.com/octocat/ledger/main/badges/stats.json",
    );
    assert.equal(
      indexUrl(ref, "master"),
      "https://raw.githubusercontent.com/octocat/ledger/master/index.json",
    );
    assert.match(
      statsUrl(parseFriendRef("octocat/ledger@release/2.1")),
      /release%2F2\.1/,
      "a slash in the branch has to be encoded or it reads as another path segment",
    );
  });
});

describe("parseStats", () => {
  test("reads a well-formed file", () => {
    const s = parseStats(STATS);
    assert.equal(s.totalPoints, 1250);
    assert.equal(s.levelName, "Engineer");
    assert.deepEqual(s.achievements, ["first-blood", "century"]);
  });

  test("refuses anything that is not a stats file", () => {
    for (const junk of [null, undefined, 42, "{}", [], {}, { schema: 2 }, { schema: "1" }]) {
      assert.equal(parseStats(junk), null, `should have refused ${JSON.stringify(junk)}`);
    }
  });

  test("a hand-edited file cannot make a number that breaks the page", () => {
    const s = parseStats({
      ...STATS,
      currentStreak: -5,
      totalPoints: 1e30,
      level: 0,
      totalSolves: "eleven",
      byDifficulty: "lots",
      levelName: "x".repeat(500),
      achievements: [1, 2, { a: 1 }, "ok"],
      asOf: "yesterday",
    });
    assert.equal(s.currentStreak, 0, "negatives clamp rather than render");
    assert.equal(s.totalPoints, 1e9, "an absurd total is capped, not trusted");
    assert.equal(s.level, 1, "level 0 does not exist");
    assert.equal(s.totalSolves, 0);
    assert.deepEqual(s.byDifficulty, { Easy: 0, Medium: 0, Hard: 0 });
    assert.equal(s.levelName.length, 40);
    assert.deepEqual(s.achievements, ["ok"], "non-strings are dropped, not stringified");
    assert.equal(s.asOf, "", "a date that is not a date is reported as unknown");
  });

  test("the achievement list is bounded", () => {
    const s = parseStats({
      ...STATS,
      achievements: Array.from({ length: 500 }, (_, i) => `a${i}`),
    });
    assert.equal(s.achievements.length, 64);
  });
});

describe("stalenessDays", () => {
  test("counts whole days", () => {
    assert.equal(stalenessDays("2026-08-10", "2026-08-10"), 0);
    assert.equal(stalenessDays("2026-08-01", "2026-08-10"), 9);
  });

  test("a clock ahead of ours reads as fresh, not as negative", () => {
    assert.equal(stalenessDays("2026-09-01", "2026-08-10"), 0);
  });

  test("unknown in means unknown out", () => {
    assert.equal(stalenessDays("", "2026-08-10"), null);
    assert.equal(stalenessDays("2026-08-10", "nope"), null);
  });
});

describe("compareRows", () => {
  const entry = (label, over) => ({ id: label, label, stats: parseStats({ ...STATS, ...over }) });

  test("ranks on the chosen metric", () => {
    const rows = compareRows(
      [
        entry("a", { totalPoints: 100 }),
        entry("b", { totalPoints: 300 }),
        entry("c", { totalPoints: 200 }),
      ],
      "totalPoints",
    );
    assert.deepEqual(
      rows.map((r) => r.label),
      ["b", "c", "a"],
    );
    assert.deepEqual(
      rows.map((r) => r.rank),
      [1, 2, 3],
    );
    assert.equal(rows[0].share, 1);
    assert.equal(rows[2].behindLeader, 200);
  });

  test("an unknown metric falls back rather than producing an empty ranking", () => {
    const rows = compareRows(
      [entry("a", { totalPoints: 1 }), entry("b", { totalPoints: 2 })],
      "wat",
    );
    assert.equal(rows[0].label, "b");
  });

  test("every advertised metric actually sorts", () => {
    for (const m of METRICS) {
      const rows = compareRows([entry("low", { [m.id]: 1 }), entry("high", { [m.id]: 90 })], m.id);
      assert.equal(rows[0].label, "high", `${m.id} did not sort`);
    }
  });

  test("a friend whose stats could not be read keeps their row", () => {
    const rows = compareRows([
      entry("a", { totalPoints: 10 }),
      { id: "gone", label: "gone", stats: null },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[1].label, "gone");
    assert.equal(rows[1].rank, null, "no rank, because there is no number behind it");
  });

  test("nobody having any points does not draw everybody a full bar", () => {
    const rows = compareRows([entry("a", { totalPoints: 0 }), entry("b", { totalPoints: 0 })]);
    assert.deepEqual(
      rows.map((r) => r.share),
      [0, 0],
    );
  });

  test("junk in does not throw", () => {
    assert.deepEqual(compareRows(null), []);
    assert.deepEqual(compareRows([null, undefined]), []);
  });
});

describe("share links", () => {
  test("round-trips through the URL", () => {
    const refs = parseCompareParam("octocat/ledger, other/repo@dev");
    assert.equal(refs.length, 2);
    const url = buildCompareUrl(refs);
    const value = decodeURIComponent(new URL(url).searchParams.get("repos"));
    assert.deepEqual(
      parseCompareParam(value).map((r) => r.id),
      refs.map((r) => r.id),
    );
  });

  test("one bad entry does not cost the good ones", () => {
    const refs = parseCompareParam("octocat/ledger,not a repo,other/repo");
    assert.deepEqual(
      refs.map((r) => r.id),
      ["octocat/ledger", "other/repo"],
    );
  });

  test("duplicates collapse and the list is capped", () => {
    assert.equal(parseCompareParam("a/b,A/B,a/b").length, 1);
    const many = Array.from({ length: PARTY_LIMIT + 10 }, (_, i) => `u${i}/r`).join(",");
    assert.equal(parseCompareParam(many).length, PARTY_LIMIT);
  });

  test("an empty list still produces a usable link", () => {
    assert.equal(buildCompareUrl([]), "https://codeledger.vkrishna04.me/compare");
  });
});

describe("the stored list", () => {
  test("adds, refuses duplicates, and refuses junk", () => {
    let { friends } = addFriend([], "octocat/ledger", "Sam");
    assert.equal(friends.length, 1);
    assert.equal(friends[0].label, "Sam");

    const dup = addFriend(friends, "https://github.com/OctoCat/Ledger");
    assert.equal(dup.added, false);
    assert.equal(dup.reason, "duplicate");
    assert.equal(dup.friends.length, 1);

    const bad = addFriend(friends, "nonsense");
    assert.equal(bad.added, false);
    assert.equal(bad.reason, "unreadable");
  });

  test("the list is capped", () => {
    let friends = [];
    for (let i = 0; i < PARTY_LIMIT; i++) friends = addFriend(friends, `u${i}/r`).friends;
    const over = addFriend(friends, "one/more");
    assert.equal(over.added, false);
    assert.equal(over.reason, "full");
  });

  test("adding returns a new array so a concurrent write cannot half-apply", () => {
    const before = [];
    const { friends } = addFriend(before, "octocat/ledger");
    assert.notEqual(friends, before);
    assert.equal(before.length, 0);
  });

  test("removing is by id, not by index", () => {
    const { friends } = addFriend(addFriend([], "a/b").friends, "c/d");
    assert.deepEqual(
      removeFriend(friends, "a/b").map((f) => f.id),
      ["c/d"],
    );
    assert.equal(removeFriend(friends, "nope").length, 2);
  });

  test("a mangled list from sync costs one entry, not the page", () => {
    const cleaned = normalizeFriends([
      null,
      { owner: "octocat", repo: "ledger" },
      { owner: "octocat", repo: "ledger" },
      { owner: "!!", repo: "??" },
      { owner: "other", repo: "repo", label: "x".repeat(200) },
      "not an object",
    ]);
    assert.deepEqual(
      cleaned.map((f) => f.id),
      ["octocat/ledger", "other/repo"],
    );
    assert.equal(cleaned[1].label.length, 60);
  });
});

describe("summarizeIndex", () => {
  const index = {
    problems: [
      {
        platform: "leetcode",
        difficulty: "Easy",
        tags: ["Array", "Hash Table"],
        lang: { name: "Python" },
        timestamp: Date.parse("2026-08-01T10:00:00Z"),
      },
      {
        platform: "geeksforgeeks",
        difficulty: "Hard",
        tags: ["array"],
        lang: { slug: "cpp" },
        timestamp: Date.parse("2026-08-02T10:00:00Z"),
      },
      { platform: "leetcode", difficulty: "Wat", tags: [], timestamp: 0 },
    ],
  };

  test("counts what a card shows and nothing more", () => {
    const s = summarizeIndex(index);
    assert.equal(s.counted, 3);
    assert.deepEqual(s.byPlatform, { leetcode: 2, geeksforgeeks: 1 });
    assert.deepEqual(s.byDifficulty, { Easy: 1, Hard: 1, Unknown: 1 });
    assert.deepEqual(s.byLanguage, { python: 1, cpp: 1 });
    assert.equal(s.lastSolveDay, "2026-08-02");
  });

  test("topics are case-folded so one concept is one row", () => {
    const s = summarizeIndex(index);
    assert.deepEqual(s.topics[0], { name: "array", count: 2 });
  });

  test("a huge index is truncated and says so", () => {
    const big = { problems: Array.from({ length: 30 }, () => ({ platform: "leetcode" })) };
    const s = summarizeIndex(big, { limit: 10 });
    assert.equal(s.counted, 10);
    assert.equal(s.truncated, true);
  });

  test("nothing in means empty out, not a throw", () => {
    assert.equal(summarizeIndex(null).counted, 0);
    assert.equal(summarizeIndex({ problems: "nope" }).counted, 0);
  });
});

describe("topicGap", () => {
  test("names what each side is missing", () => {
    const gap = topicGap(
      [{ name: "Array" }, { name: "greedy" }],
      [{ name: "array" }, { name: "dp" }],
    );
    assert.deepEqual(gap.onlyTheirs, ["dp"]);
    assert.deepEqual(gap.onlyMine, ["greedy"]);
    assert.deepEqual(gap.shared, ["array"]);
  });

  test("handles plain strings and empties", () => {
    assert.deepEqual(topicGap(["a"], ["a", "b"]).onlyTheirs, ["b"]);
    assert.deepEqual(topicGap(null, null).shared, []);
  });
});

describe("fetchFriendStats", () => {
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });
  const notFound = { ok: false, status: 404, json: async () => ({}) };

  test("guesses main, then master, and reports which answered", async () => {
    const seen = [];
    const res = await fetchFriendStats(parseFriendRef("octocat/ledger"), {
      fetchImpl: async (url) => {
        seen.push(url);
        return url.includes("/master/") ? ok(STATS) : notFound;
      },
    });
    assert.equal(res.ok, true);
    assert.equal(res.branch, "master");
    assert.equal(seen.length, 2, "it should not keep guessing past the branch that answered");
  });

  test("a named branch is not second-guessed", async () => {
    let calls = 0;
    const res = await fetchFriendStats(parseFriendRef("octocat/ledger@dev"), {
      fetchImpl: async () => {
        calls++;
        return notFound;
      },
    });
    assert.equal(calls, 1);
    assert.equal(res.ok, false);
    assert.equal(res.error, "missing");
  });

  test("a private or absent repository is 'missing', not an exception", async () => {
    const res = await fetchFriendStats(parseFriendRef("octocat/ledger"), {
      fetchImpl: async () => notFound,
    });
    assert.equal(res.ok, false);
    assert.equal(res.error, "missing");
    assert.match(ERROR_TEXT.missing, /private/i, "the wording has to name the likely cause");
  });

  test("a file that is not stats is reported as malformed, not rendered", async () => {
    const res = await fetchFriendStats(parseFriendRef("octocat/ledger"), {
      fetchImpl: async () => ok({ hello: "world" }),
    });
    assert.equal(res.ok, false);
    assert.equal(res.error, "malformed");
  });

  test("a network failure does not reject", async () => {
    const res = await fetchFriendStats(parseFriendRef("octocat/ledger"), {
      fetchImpl: async () => {
        throw new Error("offline");
      },
    });
    assert.equal(res.ok, false);
    assert.equal(res.error, "network");
  });

  test("an abort is allowed through so a closing tab stops the work", async () => {
    await assert.rejects(
      fetchFriendStats(parseFriendRef("octocat/ledger"), {
        fetchImpl: async () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          throw e;
        },
      }),
      /aborted/,
    );
  });

  test("every error code has wording", async () => {
    for (const key of ["missing", "malformed", "network", "http"]) {
      assert.equal(typeof ERROR_TEXT[key], "string");
      assert.ok(ERROR_TEXT[key].length > 20, `${key} needs a real sentence`);
    }
  });
});

describe("the landing-page copy of this module", () => {
  test("is byte-identical, so a shared link parses the same either side", () => {
    assert.equal(
      read("worker/public/assets/party.js"),
      read("src/core/party.js"),
      "run `node dev/sync-party-module.js` after editing src/core/party.js",
    );
  });
});
