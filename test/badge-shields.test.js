/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the shields.io rendering.
 *
 * Two failure modes matter more than looks. A shields badge is drawn from a
 * file in the user's repository, so if the endpoint documents and the SVGs ever
 * disagree the same README shows two different streaks — there is a direct test
 * that they cannot. And the endpoint URL is assembled from an owner and repo
 * name that arrived from settings, so it gets the same encoding scrutiny as any
 * other string interpolated into a URL.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  SHIELDS_DIR,
  SHIELDS_PATHS,
  SHIELDS_STYLES,
  endpointBody,
  buildShieldsFiles,
  rawBaseUrl,
  shieldsUsable,
  shieldsUrl,
} from "../src/core/badge-shields.js";
import {
  badgeSpecs,
  BADGE_NAMES,
  streakBadge,
  pointsBadge,
  levelBadge,
  solvedBadge,
  difficultyBadge,
  freezeBadge,
} from "../src/core/badge-svg.js";

const SNAP = {
  currentStreak: 5,
  longestStreak: 12,
  freezes: 1,
  totalPoints: 340,
  totalSolves: 28,
  byDifficulty: { Easy: 10, Medium: 15, Hard: 3 },
  level: { level: 3, name: "Adept" },
  achievements: [],
  today: "2026-08-10",
};

describe("endpointBody", () => {
  test("is a valid shields endpoint document", () => {
    const body = endpointBody({ label: "streak", value: "5 days", color: "#f97316" });
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.label, "streak");
    assert.equal(body.message, "5 days");
    assert.ok(body.cacheSeconds >= 300, "shields rejects anything under its 300s floor");
  });

  test("drops the leading hash shields does not accept", () => {
    // "#f97316" renders as the default grey; "f97316" renders orange.
    assert.equal(endpointBody({ label: "a", value: "b", color: "#f97316" }).color, "f97316");
  });

  test("a missing spec produces empty strings rather than the word undefined", () => {
    const body = endpointBody(undefined);
    assert.equal(body.message, "");
    assert.equal(body.label, "");
  });
});

describe("buildShieldsFiles", () => {
  const files = buildShieldsFiles(SNAP);

  test("emits one document per badge", () => {
    assert.deepEqual(
      files.map((f) => f.path).sort(),
      [...SHIELDS_PATHS].sort(),
    );
    assert.equal(files.length, BADGE_NAMES.length);
  });

  test("every path stays inside the shields directory", () => {
    for (const f of files) {
      assert.ok(f.path.startsWith(`${SHIELDS_DIR}/`), `${f.path} escaped the directory`);
      assert.ok(!f.path.includes(".."), `${f.path} contains a traversal segment`);
    }
  });

  test("every document parses and carries the published numbers", () => {
    const byName = Object.fromEntries(
      files.map((f) => [f.path.replace(`${SHIELDS_DIR}/`, "").replace(".json", ""), JSON.parse(f.content)]),
    );
    assert.match(byName.streak.message, /^5 days/);
    assert.equal(byName.points.message, "340");
    assert.equal(byName.freezes.message, "1");
    assert.match(byName.difficulty.message, /10 easy/);
  });

  test("says exactly what the SVG of the same badge says", () => {
    // The whole point of sharing badgeSpecs. If these ever diverge, a README
    // that mixes the two renderings reports two different streaks.
    const specs = badgeSpecs(SNAP);
    const svgs = {
      streak: streakBadge(SNAP),
      points: pointsBadge(SNAP),
      level: levelBadge(SNAP),
      solved: solvedBadge(SNAP),
      difficulty: difficultyBadge(SNAP),
      freezes: freezeBadge(SNAP),
    };
    for (const name of BADGE_NAMES) {
      const body = endpointBody(specs[name]);
      assert.ok(svgs[name].includes(body.message), `${name}: SVG does not show "${body.message}"`);
      assert.ok(svgs[name].includes(body.label), `${name}: SVG does not show "${body.label}"`);
    }
  });

  test("reports a vacation rather than a zero streak", () => {
    const files = buildShieldsFiles({ ...SNAP, currentStreak: 0, vacationActive: true });
    const streak = JSON.parse(files.find((f) => f.path.endsWith("streak.json")).content);
    assert.match(streak.message, /on vacation/);
  });
});

describe("rawBaseUrl", () => {
  test("addresses the branch the badges were committed to", () => {
    assert.equal(
      rawBaseUrl("octocat", "CodeLedger", "main"),
      "https://raw.githubusercontent.com/octocat/CodeLedger/main",
    );
  });

  test("defaults to main when no branch is given", () => {
    assert.ok(rawBaseUrl("octocat", "r").endsWith("/main"));
  });

  test("is empty when either half is missing, so callers can tell it is unusable", () => {
    assert.equal(rawBaseUrl("", "r"), "");
    assert.equal(rawBaseUrl("octocat", ""), "");
    assert.equal(rawBaseUrl(undefined, undefined), "");
    assert.equal(rawBaseUrl("   ", "r"), "");
  });

  test("a traversal in the owner cannot climb out of the path", () => {
    const url = rawBaseUrl("../../evil", "r");
    assert.ok(!url.includes("../"), url);
    assert.ok(url.startsWith("https://raw.githubusercontent.com/"));
  });
});

describe("shieldsUsable", () => {
  test("needs a public repository and a known address", () => {
    assert.equal(shieldsUsable({ rawBase: "https://raw.githubusercontent.com/o/r/main" }), true);
    assert.equal(
      shieldsUsable({ rawBase: "https://raw.githubusercontent.com/o/r/main", repoPrivate: true }),
      false,
      "shields fetches anonymously — a private repo's raw URL 404s for it",
    );
    assert.equal(shieldsUsable({ rawBase: "" }), false);
    assert.equal(shieldsUsable(), false);
  });
});

describe("shieldsUrl", () => {
  const base = rawBaseUrl("octocat", "CodeLedger", "main");

  test("points shields at the endpoint document", () => {
    const url = shieldsUrl(base, "streak", SNAP);
    assert.ok(url.startsWith("https://img.shields.io/endpoint?url="));
    const inner = decodeURIComponent(url.split("url=")[1].split("&")[0]);
    assert.ok(inner.startsWith(`${base}/${SHIELDS_DIR}/streak.json?v=`), inner);
  });

  test("the inner URL is encoded so its query does not leak into the outer one", () => {
    const url = shieldsUrl(base, "streak", SNAP);
    // Exactly one "?" — a raw inner "?" would truncate the url parameter and
    // shields would fetch a document that does not exist.
    assert.equal(url.split("?").length - 1, 1, url);
  });

  test("the cache-buster changes when the numbers do", () => {
    // Camo keys on the outer URL and shields keys on the inner one. Busting the
    // inner URL changes both at once, which is the only reason one buster works.
    const before = shieldsUrl(base, "streak", SNAP);
    assert.notEqual(before, shieldsUrl(base, "streak", { ...SNAP, currentStreak: 6 }));
    assert.notEqual(before, shieldsUrl(base, "streak", { ...SNAP, today: "2026-08-11" }));
    assert.equal(before, shieldsUrl(base, "streak", SNAP), "stable when nothing changed");
  });

  test("passes a known style through and drops anything else", () => {
    for (const style of SHIELDS_STYLES) {
      assert.ok(shieldsUrl(base, "streak", SNAP, { style }).endsWith(`&style=${style}`));
    }
    // The value arrives from stored settings; an unknown one makes shields
    // render an error badge, so it never reaches the URL.
    assert.ok(!shieldsUrl(base, "streak", SNAP, { style: "neon" }).includes("style="));
    assert.ok(!shieldsUrl(base, "streak", SNAP, { style: "flat&x=1" }).includes("style="));
  });

  test("tolerates a trailing slash on the base", () => {
    assert.equal(shieldsUrl(`${base}/`, "streak", SNAP), shieldsUrl(base, "streak", SNAP));
  });
});
