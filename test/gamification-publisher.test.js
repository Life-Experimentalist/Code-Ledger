/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the badge publishing plan.
 *
 * This module decides what gets written into and deleted from someone's own
 * repository, so the failures that matter are destructive ones: deleting a file
 * the feature does not own, deleting badges the user asked to keep, or leaving
 * badges behind after they were switched off.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  OWNED_PATHS,
  WORKFLOW_PATH,
  REFRESH_SCRIPT_PATH,
  resolvePublishIntent,
  shouldPublishWorkflow,
  stripReadmeBlock,
  buildPublishPlan,
  buildRefreshConfig,
  workflowYaml,
  resolveBadgeStyle,
  resolveBadgePicks,
  readmeOptions,
} from "../src/core/gamification-publisher.js";
import { README_START, README_END, upsertReadmeBlock } from "../src/core/badge-svg.js";
import { SHIELDS_PATHS } from "../src/core/badge-shields.js";

const SNAPSHOT = {
  currentStreak: 5,
  longestStreak: 12,
  freezes: 1,
  totalPoints: 340,
  totalSolves: 28,
  byDifficulty: { Easy: 10, Medium: 15, Hard: 3 },
  level: { level: 3, name: "Adept" },
  activeDays: 20,
  dailyTargetPoints: 25,
  achievements: [],
  today: "2026-08-10",
};

describe("resolvePublishIntent", () => {
  test("publishes by default", () => {
    assert.equal(resolvePublishIntent({}), "publish");
  });

  test("turning gamification off revokes what is already published", () => {
    assert.equal(
      resolvePublishIntent({ gamificationEnabled: false, badgesPublished: true }),
      "revoke",
    );
  });

  test("turning badges off alone revokes them", () => {
    assert.equal(
      resolvePublishIntent({ gamificationBadges: false, badgesPublished: true }),
      "revoke",
    );
  });

  test("nothing published means nothing to revoke", () => {
    assert.equal(resolvePublishIntent({ gamificationBadges: false }), "idle");
  });

  test("switching back on before the commit lands cancels the removal", () => {
    // The whole reason intent is derived rather than stored: a user who
    // toggles off and on again within the ten-minute maintenance window should
    // end up exactly where they started, with no file touched.
    const off = { gamificationBadges: false, badgesPublished: true };
    assert.equal(resolvePublishIntent(off), "revoke");
    const backOn = { ...off, gamificationBadges: true };
    assert.equal(resolvePublishIntent(backOn), "publish");
    assert.deepEqual(buildPublishPlan({ snapshot: SNAPSHOT, settings: backOn }).deletes, []);
  });
});

describe("shouldPublishWorkflow", () => {
  test("public repositories get the refresh on by default", () => {
    assert.equal(shouldPublishWorkflow({}, false), true);
  });

  test("private repositories do not, because the minutes are metered", () => {
    assert.equal(shouldPublishWorkflow({}, true), false);
  });

  test("an explicit choice beats either default", () => {
    assert.equal(shouldPublishWorkflow({ gamificationActions: true }, true), true);
    assert.equal(shouldPublishWorkflow({ gamificationActions: false }, false), false);
  });

  test("no workflow when the feature itself is off", () => {
    assert.equal(shouldPublishWorkflow({ gamificationEnabled: false }, false), false);
    assert.equal(shouldPublishWorkflow({ gamificationBadges: false }, false), false);
    // Even an explicit yes cannot resurrect it — there would be nothing to refresh.
    assert.equal(
      shouldPublishWorkflow({ gamificationEnabled: false, gamificationActions: true }, false),
      false,
    );
  });
});

describe("stripReadmeBlock", () => {
  const readme = "# My Ledger\n\nSome prose I wrote.\n";

  test("removes the block and nothing else", () => {
    const withBlock = upsertReadmeBlock(readme, SNAPSHOT, { pagesUrl: "https://x.dev" });
    assert.ok(withBlock.includes(README_START));
    const stripped = stripReadmeBlock(withBlock);
    assert.ok(!stripped.includes(README_START));
    assert.ok(!stripped.includes(README_END));
    assert.ok(stripped.includes("# My Ledger"));
    assert.ok(stripped.includes("Some prose I wrote."));
  });

  test("a README without the block is returned untouched", () => {
    assert.equal(stripReadmeBlock(readme), readme);
    assert.equal(stripReadmeBlock(""), "");
    assert.equal(stripReadmeBlock(null), "");
  });

  test("switching off and on repeatedly does not grow blank lines", () => {
    let text = readme;
    for (let i = 0; i < 5; i++) {
      text = upsertReadmeBlock(text, SNAPSHOT, { pagesUrl: "https://x.dev" });
      text = stripReadmeBlock(text);
    }
    assert.ok(!/\n{3,}/.test(text), "blank lines accumulated across cycles");
  });

  test("an unterminated marker is left alone rather than truncating the file", () => {
    const broken = `${README_START}\nhalf a block\n\n# Everything below must survive`;
    assert.equal(stripReadmeBlock(broken), broken);
  });
});

describe("buildPublishPlan", () => {
  test("publishing writes every badge and no deletions", () => {
    const plan = buildPublishPlan({ snapshot: SNAPSHOT, settings: {} });
    assert.equal(plan.intent, "publish");
    assert.equal(plan.badgesPublished, true);
    assert.deepEqual(plan.deletes, []);
    for (const p of OWNED_PATHS) {
      assert.ok(
        plan.files.some((f) => f.path === p),
        `${p} missing from the plan`,
      );
    }
  });

  test("nothing is written into badges/ that revoking would not clean up", () => {
    // The other direction of the same invariant. Adding a badge file without
    // adding it to OWNED_PATHS leaves it behind for ever once publishing is
    // switched off, and it is the file nobody thinks to look for.
    const plan = buildPublishPlan({ snapshot: SNAPSHOT, settings: {} });
    for (const f of plan.files.filter((x) => x.path.startsWith("badges/"))) {
      assert.ok(OWNED_PATHS.includes(f.path), `${f.path} is written but never deleted`);
    }
  });

  test("stats.json is valid JSON carrying the published numbers", () => {
    const plan = buildPublishPlan({ snapshot: SNAPSHOT, settings: {} });
    const stats = JSON.parse(plan.files.find((f) => f.path === "badges/stats.json").content);
    assert.equal(stats.currentStreak, 5);
    assert.equal(stats.totalPoints, 340);
    assert.equal(stats.schema, 1);
  });

  test("the README is only rewritten when it actually changes", () => {
    const readme = "# Ledger\n";
    const first = buildPublishPlan({ snapshot: SNAPSHOT, settings: {}, readme });
    const written = first.files.find((f) => f.path === "README.md");
    assert.ok(written, "expected the block to be inserted");

    const second = buildPublishPlan({ snapshot: SNAPSHOT, settings: {}, readme: written.content });
    assert.ok(
      !second.files.some((f) => f.path === "README.md"),
      "an unchanged README should stay out of the tree",
    );
  });

  test("the README is left alone when the user opted out of it", () => {
    const plan = buildPublishPlan({
      snapshot: SNAPSHOT,
      settings: { gamificationReadme: false },
      readme: "# Ledger\n",
    });
    assert.ok(!plan.files.some((f) => f.path === "README.md"));
    assert.ok(plan.files.length > 0, "badges should still be written");
  });

  test("revoking deletes exactly the paths the feature owns", () => {
    const plan = buildPublishPlan({
      snapshot: SNAPSHOT,
      settings: { gamificationBadges: false, badgesPublished: true },
    });
    assert.equal(plan.intent, "revoke");
    assert.equal(plan.badgesPublished, false);
    assert.deepEqual([...plan.deletes].sort(), [...OWNED_PATHS].sort());
    for (const p of plan.deletes) {
      assert.ok(p.startsWith("badges/"), `${p} is not a badge path`);
    }
  });

  test("revoking also strips the README block", () => {
    const readme = upsertReadmeBlock("# Ledger\n", SNAPSHOT, { pagesUrl: "https://x.dev" });
    const plan = buildPublishPlan({
      snapshot: SNAPSHOT,
      settings: { gamificationBadges: false, badgesPublished: true },
      readme,
    });
    const rewritten = plan.files.find((f) => f.path === "README.md");
    assert.ok(rewritten);
    assert.ok(!rewritten.content.includes(README_START));
  });

  test("revoking a repo whose README never had the block writes no README", () => {
    const plan = buildPublishPlan({
      snapshot: SNAPSHOT,
      settings: { gamificationBadges: false, badgesPublished: true },
      readme: "# Ledger\n",
    });
    assert.ok(!plan.files.some((f) => f.path === "README.md"));
  });

  test("revoking removes the workflow only if one was published", () => {
    const withWorkflow = buildPublishPlan({
      snapshot: SNAPSHOT,
      settings: { gamificationBadges: false, badgesPublished: true, workflowPublished: true },
    });
    assert.ok(withWorkflow.deletes.includes(WORKFLOW_PATH));
    assert.ok(withWorkflow.deletes.includes(REFRESH_SCRIPT_PATH));

    const without = buildPublishPlan({
      snapshot: SNAPSHOT,
      settings: { gamificationBadges: false, badgesPublished: true },
    });
    assert.ok(!without.deletes.includes(WORKFLOW_PATH));
  });

  test("idle produces an empty plan, so a disabled feature never touches the repo", () => {
    const plan = buildPublishPlan({ snapshot: SNAPSHOT, settings: { gamificationEnabled: false } });
    assert.deepEqual(plan.files, []);
    assert.deepEqual(plan.deletes, []);
  });

  test("no workflow is committed without a script to run", () => {
    // A workflow calling a missing file fails on every schedule and mails the
    // user about it, so the two are only ever committed together.
    const plan = buildPublishPlan({ snapshot: SNAPSHOT, settings: {}, repoPrivate: false });
    assert.ok(!plan.files.some((f) => f.path === WORKFLOW_PATH));

    const withScript = buildPublishPlan({
      snapshot: SNAPSHOT,
      settings: {},
      repoPrivate: false,
      refreshScript: "// refresh\n",
    });
    assert.ok(withScript.files.some((f) => f.path === WORKFLOW_PATH));
    assert.ok(withScript.files.some((f) => f.path === REFRESH_SCRIPT_PATH));
  });

  test("turning Actions off removes a workflow that was published before", () => {
    const plan = buildPublishPlan({
      snapshot: SNAPSHOT,
      settings: { gamificationActions: false, workflowPublished: true },
      refreshScript: "// refresh\n",
    });
    assert.ok(plan.deletes.includes(WORKFLOW_PATH));
    assert.ok(plan.deletes.includes(REFRESH_SCRIPT_PATH));
    assert.ok(
      plan.files.some((f) => f.path === "badges/streak.svg"),
      "badges stay",
    );
  });
});

describe("buildRefreshConfig", () => {
  test("carries the settings the refresh needs to match the extension", () => {
    const cfg = buildRefreshConfig({
      settings: { dailyTargetPoints: 40, maxFreezes: 3, installDay: "2026-01-05" },
      username: "octocat",
      pagesUrl: "https://octocat.github.io/CodeLedger",
    });
    assert.equal(cfg.config.dailyTargetPoints, 40);
    assert.equal(cfg.config.maxFreezes, 3);
    assert.equal(cfg.installDay, "2026-01-05");
    assert.equal(cfg.username, "octocat");
  });

  test("vacation dates travel but the notes do not", () => {
    // The dates have to go: a vacation day is not a missed day, and a refresh
    // without them would break a streak the extension considers intact. What
    // the user typed about why they were away is nobody else's business.
    const cfg = buildRefreshConfig({
      vacations: [{ start: "2026-07-01", end: "2026-07-10", note: "hospital" }],
    });
    assert.deepEqual(cfg.vacations, [{ start: "2026-07-01", end: "2026-07-10" }]);
    assert.ok(!JSON.stringify(cfg).includes("hospital"));
  });

  test("the day boundary travels even when the user never set one", () => {
    // Otherwise the Actions runner computes days in UTC while the extension
    // computes them in local time, and the two disagree about "today".
    const cfg = buildRefreshConfig({ snapshot: { ...SNAPSHOT, utcOffsetMinutes: 330 } });
    assert.equal(cfg.config.utcOffsetMinutes, 330);
  });

  test("junk settings are dropped rather than published as-is", () => {
    const cfg = buildRefreshConfig({
      settings: { dailyTargetPoints: "lots", maxFreezes: NaN },
      vacations: [null, { end: "2026-01-01" }],
    });
    assert.equal(cfg.config.dailyTargetPoints, undefined);
    assert.equal(cfg.config.maxFreezes, undefined);
    assert.deepEqual(cfg.vacations, []);
  });

  test("a one-day vacation needs no end date", () => {
    const cfg = buildRefreshConfig({ vacations: [{ start: "2026-07-01" }] });
    assert.deepEqual(cfg.vacations, [{ start: "2026-07-01", end: "2026-07-01" }]);
  });

  test("publishing writes it alongside the badges", () => {
    const plan = buildPublishPlan({ snapshot: SNAPSHOT, settings: {} });
    const file = plan.files.find((f) => f.path === "badges/config.json");
    assert.ok(file);
    assert.equal(JSON.parse(file.content).schema, 1);
  });
});

describe("workflowYaml", () => {
  test("runs on a schedule and can be triggered by hand", () => {
    const yaml = workflowYaml();
    assert.match(yaml, /schedule:/);
    assert.match(yaml, /workflow_dispatch:/);
    assert.match(yaml, /cron: "0 4 \* \* \*"/);
  });

  test("asks for only the permission it needs", () => {
    const yaml = workflowYaml();
    assert.match(yaml, /permissions:\s*\n\s*contents: write/);
    assert.ok(!/packages:|id-token:|actions: write/.test(yaml));
  });

  test("the run hour is the user's, and out-of-range values are clamped", () => {
    assert.match(workflowYaml({ gamificationActionsHour: 22 }), /cron: "0 22 \* \* \*"/);
    assert.match(workflowYaml({ gamificationActionsHour: 99 }), /cron: "0 23 \* \* \*"/);
    assert.match(workflowYaml({ gamificationActionsHour: -5 }), /cron: "0 0 \* \* \*"/);
    assert.match(workflowYaml({ gamificationActionsHour: 3.5 }), /cron: "0 4 \* \* \*"/);
  });

  test("its own commit does not retrigger CI", () => {
    assert.match(workflowYaml(), /\[skip ci\]/);
  });

  test("it invokes the script it ships with", () => {
    assert.ok(workflowYaml().includes(`node ${REFRESH_SCRIPT_PATH}`));
  });
});

describe("badge style", () => {
  const PUBLIC = { username: "octocat", repo: "CodeLedger", branch: "main", repoPrivate: false };

  test("the self-hosted SVGs are the default", () => {
    assert.equal(
      resolveBadgeStyle({}, { rawBase: "https://raw.githubusercontent.com/o/r/main" }),
      "svg",
    );
  });

  test("shields is honoured on a public repository", () => {
    assert.equal(
      resolveBadgeStyle(
        { gamificationBadgeStyle: "shields" },
        { rawBase: "https://raw.githubusercontent.com/o/r/main" },
      ),
      "shields",
    );
  });

  test("a private repository falls back to the SVGs", () => {
    // shields fetches the endpoint file anonymously, so a private repo would
    // render a row of red "invalid" badges. Falling back is the honest answer.
    assert.equal(
      resolveBadgeStyle(
        { gamificationBadgeStyle: "shields" },
        { rawBase: "https://raw.githubusercontent.com/o/r/main", repoPrivate: true },
      ),
      "svg",
    );
  });

  test("an unknown repo name falls back too", () => {
    assert.equal(resolveBadgeStyle({ gamificationBadgeStyle: "shields" }, { rawBase: "" }), "svg");
    assert.equal(resolveBadgeStyle({ gamificationBadgeStyle: "shields" }, {}), "svg");
  });

  test("readmeOptions points the badge row at shields only when shields applies", () => {
    const shields = readmeOptions({
      ...PUBLIC,
      snapshot: SNAPSHOT,
      settings: { gamificationBadgeStyle: "shields" },
    });
    assert.equal(typeof shields.urlFor, "function");
    assert.match(shields.urlFor("streak"), /^https:\/\/img\.shields\.io\/endpoint\?url=/);

    const svg = readmeOptions({ ...PUBLIC, snapshot: SNAPSHOT, settings: {} });
    assert.equal(svg.urlFor, undefined);

    const priv = readmeOptions({
      ...PUBLIC,
      repoPrivate: true,
      snapshot: SNAPSHOT,
      settings: { gamificationBadgeStyle: "shields" },
    });
    assert.equal(priv.urlFor, undefined);
  });

  test("only a shields style shields recognises reaches the URL", () => {
    const good = readmeOptions({
      ...PUBLIC,
      snapshot: SNAPSHOT,
      settings: { gamificationBadgeStyle: "shields", gamificationShieldsStyle: "for-the-badge" },
    });
    assert.match(good.urlFor("streak"), /&style=for-the-badge$/);

    const junk = readmeOptions({
      ...PUBLIC,
      snapshot: SNAPSHOT,
      settings: { gamificationBadgeStyle: "shields", gamificationShieldsStyle: "neon" },
    });
    assert.match(junk.urlFor("streak"), /&style=flat$/);
  });

  test("the README a plan writes uses the chosen rendering", () => {
    const readme = "# Ledger\n";
    const plan = buildPublishPlan({
      ...PUBLIC,
      snapshot: SNAPSHOT,
      settings: { gamificationBadgeStyle: "shields" },
      readme,
    });
    const written = plan.files.find((f) => f.path === "README.md").content;
    assert.ok(written.includes("img.shields.io"), "expected shields links in the badge row");
    // The card has no shields equivalent, so it stays a self-hosted SVG.
    assert.ok(written.includes("card.svg"));
  });

  test("the endpoint files are written whichever style is selected", () => {
    // Writing them only in shields mode would mean deleting them on a switch
    // away, and a Trees deletion of a path absent from the base tree can 422 —
    // which would cost the commit carrying the user's solution.
    for (const settings of [{}, { gamificationBadgeStyle: "shields" }]) {
      const plan = buildPublishPlan({ ...PUBLIC, snapshot: SNAPSHOT, settings });
      for (const p of SHIELDS_PATHS) {
        assert.ok(
          plan.files.some((f) => f.path === p),
          `${p} missing for ${JSON.stringify(settings)}`,
        );
      }
    }
  });

  test("revoking removes the endpoint files as well", () => {
    const plan = buildPublishPlan({
      snapshot: SNAPSHOT,
      settings: { gamificationBadges: false, badgesPublished: true },
    });
    for (const p of SHIELDS_PATHS) {
      assert.ok(plan.deletes.includes(p), `${p} left behind after revoke`);
    }
  });

  test("the scheduled refresh is told what the extension decided", () => {
    // The runner cannot see repository visibility, so it must not re-decide.
    const cfg = buildRefreshConfig({
      ...PUBLIC,
      snapshot: SNAPSHOT,
      settings: { gamificationBadgeStyle: "shields", gamificationShieldsStyle: "flat-square" },
    });
    assert.equal(cfg.badgeStyle, "shields");
    assert.equal(cfg.shieldsStyle, "flat-square");
    assert.equal(cfg.rawBase, "https://raw.githubusercontent.com/octocat/CodeLedger/main");

    const priv = buildRefreshConfig({
      ...PUBLIC,
      repoPrivate: true,
      snapshot: SNAPSHOT,
      settings: { gamificationBadgeStyle: "shields" },
    });
    assert.equal(priv.badgeStyle, "svg");
  });
});

describe("badge picks", () => {
  test("no selection means the default set", () => {
    assert.equal(resolveBadgePicks({}), undefined);
    assert.equal(resolveBadgePicks({ gamificationBadgePicks: "streak" }), undefined);
  });

  test("unknown names are dropped", () => {
    assert.deepEqual(resolveBadgePicks({ gamificationBadgePicks: ["streak", "wat", "freezes"] }), [
      "streak",
      "freezes",
    ]);
  });

  test("a list of nothing recognisable falls back to the defaults", () => {
    // "No badges at all" is what turning badges off is for. Producing an empty
    // row from a mis-saved setting would look like the feature had broken.
    assert.equal(resolveBadgePicks({ gamificationBadgePicks: [] }), undefined);
    assert.equal(resolveBadgePicks({ gamificationBadgePicks: ["nope"] }), undefined);
  });

  test("the selection narrows the badge row in the README", () => {
    const plan = buildPublishPlan({
      snapshot: SNAPSHOT,
      settings: { gamificationBadgePicks: ["streak"] },
      readme: "# Ledger\n",
      pagesUrl: "https://octocat.github.io/CodeLedger",
    });
    const written = plan.files.find((f) => f.path === "README.md").content;
    assert.ok(written.includes("streak.svg"));
    assert.ok(!written.includes("points.svg"), "an unpicked badge should not be linked");
    // Every badge file is still committed — the row is a view over them, and
    // deleting the rest would break any link the user added by hand.
    assert.ok(plan.files.some((f) => f.path === "badges/points.svg"));
  });

  test("the selection travels to the scheduled refresh", () => {
    assert.deepEqual(
      buildRefreshConfig({ settings: { gamificationBadgePicks: ["streak", "level"] } }).picks,
      ["streak", "level"],
    );
    assert.equal(buildRefreshConfig({ settings: {} }).picks, null);
  });
});
