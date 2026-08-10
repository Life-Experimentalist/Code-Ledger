/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for badge generation.
 *
 * These files are committed into the user's public repository and rendered by
 * GitHub, so two failure modes matter more than looks: a badge whose URL never
 * changes shows a stale streak forever behind GitHub's camo cache, and an
 * unescaped character from a scraped problem title produces either a broken
 * image or an injection into a document served from the user's own domain.
 * Both get direct coverage here.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  escapeXml,
  textWidth,
  badge,
  streakBadge,
  pointsBadge,
  levelBadge,
  solvedBadge,
  difficultyBadge,
  freezeBadge,
  formatCount,
  streakCard,
  buildBadgeFiles,
  badgeStats,
  badgeUrl,
  badgeMarkdown,
  upsertReadmeBlock,
  README_START,
  README_END,
  BADGE_DIR,
} from "../src/core/badge-svg.js";
import { computeSnapshot } from "../src/core/gamification.js";

const UTC = { utcOffsetMinutes: 0 };

function at(key, hour = 12) {
  return Date.parse(`${key}T00:00:00.000Z`) + hour * 3_600_000;
}

function ledger(days, difficulty = "Medium") {
  return days.map((d, i) => ({
    canonicalId: `p${i}`,
    title: "Problem",
    platform: "leetcode",
    difficulty,
    timestamp: at(d),
  }));
}

const SNAP = computeSnapshot(ledger(["2026-03-01", "2026-03-02", "2026-03-03"]), {
  config: { ...UTC, dailyTargetPoints: 25 },
  now: at("2026-03-03"),
});

const EMPTY = computeSnapshot([], { config: UTC, now: at("2026-03-03") });

describe("escapeXml", () => {
  test("escapes all five XML metacharacters", () => {
    assert.equal(escapeXml(`<&>"'`), "&lt;&amp;&gt;&quot;&apos;");
  });

  test("escapes ampersand before the entities it introduces", () => {
    // Getting this order wrong yields &amp;lt; — a visible literal, not markup.
    assert.equal(escapeXml("<"), "&lt;");
    assert.equal(escapeXml("&lt;"), "&amp;lt;");
  });

  test("renders null and undefined as empty, not as the word", () => {
    assert.equal(escapeXml(null), "");
    assert.equal(escapeXml(undefined), "");
  });

  test("leaves ordinary text alone", () => {
    assert.equal(escapeXml("Two Sum 42"), "Two Sum 42");
  });
});

describe("textWidth", () => {
  test("grows with length", () => {
    assert.ok(textWidth("aaaa") > textWidth("aa"));
  });

  test("gives narrow glyphs less room than wide ones", () => {
    assert.ok(textWidth("iiii") < textWidth("MMMM"));
  });

  test("is zero for empty input and never negative", () => {
    assert.equal(textWidth(""), 0);
    assert.equal(textWidth(undefined), 0);
    assert.ok(textWidth("x") > 0);
  });

  test("allocates space for emoji rather than treating them as one narrow char", () => {
    assert.ok(textWidth("🔥") >= 10);
  });
});

describe("badge", () => {
  test("produces a standalone SVG document", () => {
    const svg = badge({ label: "streak", value: "5 days" });
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /<\/svg>$/);
  });

  test("carries an accessible label and title", () => {
    const svg = badge({ label: "streak", value: "5 days" });
    assert.match(svg, /role="img"/);
    assert.match(svg, /aria-label="streak: 5 days"/);
    assert.match(svg, /<title>streak: 5 days<\/title>/);
  });

  test("width is the sum of both halves", () => {
    const svg = badge({ label: "ab", value: "cd" });
    const total = Number(svg.match(/<svg[^>]*width="(\d+)"/)[1]);
    const labelW = Number(svg.match(/<rect width="(\d+)" height="20" fill="#555"/)[1]);
    const valueW = Number(svg.match(/<rect x="\d+" width="(\d+)" height="20"/)[1]);
    assert.equal(total, labelW + valueW);
  });

  test("escapes a hostile label instead of emitting markup", () => {
    const svg = badge({ label: `</text><script>alert(1)</script>`, value: "x" });
    assert.ok(!svg.includes("<script>"), "no raw script tag may survive");
    assert.match(svg, /&lt;script&gt;/);
  });

  test("escapes a hostile colour instead of breaking out of the attribute", () => {
    const svg = badge({ label: "a", value: "b", color: `red" onload="alert(1)` });
    assert.ok(!svg.includes(`onload="alert(1)"`));
    assert.match(svg, /&quot;/);
  });
});

describe("named badges", () => {
  test("streak badge is orange when a streak is running", () => {
    const svg = streakBadge(SNAP);
    assert.match(svg, /3 days/);
    assert.match(svg, /#f97316/);
  });

  test("streak badge says one day in the singular", () => {
    const s = computeSnapshot(ledger(["2026-03-03"]), {
      config: { ...UTC, dailyTargetPoints: 25 },
      now: at("2026-03-03"),
    });
    const svg = streakBadge(s);
    assert.match(svg, /1 day /);
    assert.doesNotMatch(svg, /1 days/);
  });

  test("streak badge is stamped with the day it was computed", () => {
    // A badge is a picture taken at commit time; it cannot recount days when
    // someone opens the README three weeks later. The stamp is what keeps
    // "5 days" from silently becoming a false claim.
    const s = computeSnapshot(ledger(["2026-03-03"]), {
      config: { ...UTC, dailyTargetPoints: 25 },
      now: at("2026-03-03"),
    });
    assert.match(streakBadge(s), /Mar 3/);
    assert.match(streakCard(s), /as of Mar 3/);
  });

  test("an unparseable day drops the stamp rather than printing NaN", () => {
    const svg = streakBadge({ currentStreak: 4, today: "not-a-date" });
    assert.match(svg, /4 days/);
    assert.doesNotMatch(svg, /NaN|undefined|·/);
  });

  test("the vacation badge is stamped too", () => {
    const svg = streakBadge({ currentStreak: 9, vacationActive: true, today: "2026-12-25" });
    assert.match(svg, /on vacation · Dec 25/);
  });

  test("streak badge is dimmed at zero rather than absent", () => {
    const svg = streakBadge(EMPTY);
    assert.match(svg, /0 days/);
    assert.match(svg, /#64748b/);
  });

  test("streak badge reports a vacation instead of a misleading zero", () => {
    const s = computeSnapshot([], {
      config: UTC,
      now: at("2026-03-03"),
      vacations: [{ start: "2026-03-01", end: "2026-03-10" }],
    });
    assert.match(streakBadge(s), /on vacation/);
  });

  test("points, level, solved and freeze badges render", () => {
    for (const svg of [pointsBadge(SNAP), levelBadge(SNAP), solvedBadge(SNAP), freezeBadge(SNAP)]) {
      assert.match(svg, /^<svg /);
      assert.match(svg, /<\/svg>$/);
    }
  });

  test("difficulty badge shows the full split", () => {
    assert.match(difficultyBadge(SNAP), /0 easy · 3 medium · 0 hard/);
  });

  test("level badge names the level", () => {
    assert.match(levelBadge(SNAP), /level 1/);
    assert.match(levelBadge(SNAP), /Initiate/);
  });
});

describe("formatCount", () => {
  test("shows small numbers exactly", () => {
    assert.equal(formatCount(0), "0");
    assert.equal(formatCount(999), "999");
  });

  test("abbreviates thousands and millions", () => {
    assert.equal(formatCount(1000), "1.0k");
    assert.equal(formatCount(12_345), "12k");
    assert.equal(formatCount(2_500_000), "2.5M");
  });

  test("treats junk as zero", () => {
    assert.equal(formatCount(undefined), "0");
    assert.equal(formatCount("nope"), "0");
  });
});

describe("streakCard", () => {
  test("renders a fixed-size card with the headline numbers", () => {
    const svg = streakCard(SNAP, { username: "octocat" });
    assert.match(svg, /width="420" height="200"/);
    // The apostrophe is XML-escaped — an unescaped one is a malformed document.
    assert.match(svg, /octocat&apos;s ledger/);
    assert.match(svg, />3</);
  });

  test("escapes the username", () => {
    const svg = streakCard(SNAP, { username: `<img onerror=x>` });
    assert.ok(!svg.includes("<img"));
  });

  test("falls back to a generic title with no username", () => {
    assert.match(streakCard(SNAP), /CodeLedger/);
  });

  test("shows a palm tree rather than a number on vacation", () => {
    const s = computeSnapshot([], {
      config: UTC,
      now: at("2026-03-03"),
      vacations: [{ start: "2026-03-01", end: null }],
    });
    assert.match(streakCard(s), /🌴/);
  });

  test("progress bar never exceeds the track", () => {
    const svg = streakCard({ ...SNAP, level: { level: 1, name: "x", progress: 5 } });
    const widths = [...svg.matchAll(/<rect x="30" y="140" width="(\d+)"/g)].map((m) => Number(m[1]));
    for (const w of widths) assert.ok(w <= 360, `bar width ${w} exceeded the 360px track`);
  });

  test("a negative progress value does not produce a negative width", () => {
    const svg = streakCard({ ...SNAP, level: { level: 1, name: "x", progress: -2 } });
    assert.ok(!/width="-/.test(svg));
  });
});

describe("buildBadgeFiles", () => {
  test("emits every badge plus a machine-readable stats file", () => {
    const files = buildBadgeFiles(SNAP, { username: "octocat" });
    const paths = files.map((f) => f.path);
    assert.ok(paths.includes(`${BADGE_DIR}/streak.svg`));
    assert.ok(paths.includes(`${BADGE_DIR}/card.svg`));
    assert.ok(paths.includes(`${BADGE_DIR}/stats.json`));
  });

  test("every path is inside the badge directory", () => {
    for (const f of buildBadgeFiles(SNAP)) {
      assert.ok(f.path.startsWith(`${BADGE_DIR}/`), `${f.path} escaped the badge directory`);
      assert.ok(!f.path.includes(".."), `${f.path} contains a traversal segment`);
    }
  });

  test("every file has non-empty content", () => {
    for (const f of buildBadgeFiles(SNAP)) assert.ok(f.content.length > 0, f.path);
  });

  test("stats.json is valid JSON with the published shape", () => {
    const f = buildBadgeFiles(SNAP).find((x) => x.path.endsWith("stats.json"));
    const parsed = JSON.parse(f.content);
    assert.equal(parsed.schema, 1);
    assert.equal(parsed.currentStreak, 3);
    assert.equal(typeof parsed.totalPoints, "number");
    assert.ok(Array.isArray(parsed.achievements));
  });

  test("stats never leak problem titles or code", () => {
    const s = badgeStats(SNAP);
    const json = JSON.stringify(s);
    assert.ok(!json.includes("Problem"), "titles must not be published in stats.json");
    assert.ok(!("problems" in s));
    assert.ok(!("timeline" in s));
  });
});

describe("badgeUrl", () => {
  test("builds a Pages URL under the badge directory", () => {
    const url = badgeUrl("https://octocat.github.io/CodeLedger", "streak", SNAP);
    assert.ok(url.startsWith(`https://octocat.github.io/CodeLedger/${BADGE_DIR}/streak.svg?v=`));
  });

  test("tolerates a trailing slash on the base", () => {
    const a = badgeUrl("https://x.github.io/r/", "streak", SNAP);
    const b = badgeUrl("https://x.github.io/r", "streak", SNAP);
    assert.equal(a, b);
  });

  test("the cache-buster changes when the numbers change", () => {
    // Without this, GitHub's camo proxy serves the first badge forever.
    const before = badgeUrl("https://x.github.io/r", "streak", SNAP);
    const after = badgeUrl("https://x.github.io/r", "streak", { ...SNAP, currentStreak: 4 });
    assert.notEqual(before, after);
  });

  test("the cache-buster changes when only the date does", () => {
    // A vacation day regenerates identical numbers under a new stamp. Without
    // the day in the key, camo would keep serving yesterday's picture and the
    // stamp would be the thing that goes stale.
    const before = badgeUrl("https://x.github.io/r", "streak", { ...SNAP, today: "2026-03-03" });
    const after = badgeUrl("https://x.github.io/r", "streak", { ...SNAP, today: "2026-03-04" });
    assert.notEqual(before, after);
  });

  test("the cache-buster is stable when nothing changed", () => {
    assert.equal(
      badgeUrl("https://x.github.io/r", "streak", SNAP),
      badgeUrl("https://x.github.io/r", "streak", SNAP),
    );
  });

  test("the cache-buster is URL-encoded", () => {
    const url = badgeUrl("https://x.github.io/r", "streak", SNAP);
    assert.ok(!/[ <>"]/.test(url));
  });
});

describe("badgeMarkdown", () => {
  test("includes the card and every badge", () => {
    const md = badgeMarkdown(SNAP, { pagesUrl: "https://x.github.io/r" });
    assert.match(md, /<img src="https:\/\/x\.github\.io\/r\/badges\/card\.svg/);
    for (const n of ["streak", "points", "level", "difficulty", "freezes"]) {
      assert.ok(md.includes(`/badges/${n}.svg`), `missing ${n}`);
    }
  });

  test("omits the card when asked", () => {
    const md = badgeMarkdown(SNAP, { pagesUrl: "https://x.github.io/r", showCard: false });
    assert.ok(!md.includes("<img"));
  });

  test("lists earned achievements only", () => {
    const md = badgeMarkdown(SNAP, { pagesUrl: "https://x.github.io/r" });
    assert.match(md, /First Blood/);
    assert.ok(!md.includes("Grandmaster"));
  });

  test("escapes the image src attribute", () => {
    const md = badgeMarkdown(SNAP, { pagesUrl: `https://x/"onerror="alert(1)` });
    assert.ok(!md.includes(`"onerror="alert(1)"`));
  });
});

describe("upsertReadmeBlock", () => {
  const opts = { pagesUrl: "https://x.github.io/r" };

  test("creates the block in an empty README", () => {
    const out = upsertReadmeBlock("", SNAP, opts);
    assert.ok(out.includes(README_START));
    assert.ok(out.includes(README_END));
  });

  test("is idempotent, so it never produces an empty commit", () => {
    const once = upsertReadmeBlock("", SNAP, opts);
    assert.equal(upsertReadmeBlock(once, SNAP, opts), once);
  });

  test("replaces an existing block in place and leaves the rest untouched", () => {
    const readme = `# My Ledger\n\n${README_START}\nOLD CONTENT\n${README_END}\n\nHand-written notes.\n`;
    const out = upsertReadmeBlock(readme, SNAP, opts);
    assert.ok(!out.includes("OLD CONTENT"));
    assert.match(out, /# My Ledger/);
    assert.match(out, /Hand-written notes\./);
    assert.equal(out.split(README_START).length - 1, 1, "exactly one block");
  });

  test("keeps an existing H1 as the first line", () => {
    const out = upsertReadmeBlock("# Title\n\nBody text.\n", SNAP, opts);
    assert.ok(out.startsWith("# Title\n"));
    assert.match(out, /Body text\./);
  });

  test("prepends when there is no heading", () => {
    const out = upsertReadmeBlock("Just some text.\n", SNAP, opts);
    assert.ok(out.startsWith(README_START));
    assert.match(out, /Just some text\./);
  });

  test("a truncated marker pair is treated as absent rather than corrupting the file", () => {
    const readme = `# T\n\n${README_START}\nhalf a block, no end marker\n`;
    const out = upsertReadmeBlock(readme, SNAP, opts);
    assert.ok(out.includes(README_END), "a complete block is written");
    assert.match(out, /# T/);
  });

  test("updating with new numbers changes the content", () => {
    const first = upsertReadmeBlock("", SNAP, opts);
    const second = upsertReadmeBlock(first, { ...SNAP, currentStreak: 99 }, opts);
    assert.notEqual(first, second);
    // The block holds URLs, not badge text — the streak shows up in the
    // cache-buster, which is exactly the thing that must change.
    assert.match(second, /\?v=\d+-99-\d+/);
  });
});
