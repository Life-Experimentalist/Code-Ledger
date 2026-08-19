/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Entry point for the badge refresh script that CodeLedger commits into the
 * user's own repository and GitHub Actions runs on a schedule.
 *
 * This file is never loaded by the extension. `dev/generate-refresh-script.js`
 * bundles it with esbuild into a single dependency-free ESM file, which is then
 * embedded as a string in src/vendor/refresh-badges-source.js.
 *
 * Why bundle rather than hand-write a standalone script: the scoring rules --
 * what a Hard is worth, when a freeze is earned, how a vacation is counted --
 * would otherwise exist in two places and drift. Importing the real modules
 * means the workflow computes exactly what the extension computes.
 *
 * It runs with the repository as its working directory and no npm install, so
 * it may import nothing outside node: builtins and this repository's own core.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { computeSnapshot, DEFAULT_CONFIG } from "../src/core/gamification.js";
import { buildBadgeFiles, upsertReadmeBlock } from "../src/core/badge-svg.js";
import { buildShieldsFiles, shieldsUrl } from "../src/core/badge-shields.js";

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function write(path, content) {
  const dir = dirname(path);
  if (dir && dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  const existing = existsSync(path) ? readFileSync(path, "utf8") : null;
  // Writing identical bytes would still dirty the working tree for the commit
  // step on some filesystems, and an empty commit every night is noise in
  // someone's contribution graph.
  if (existing === content) return false;
  writeFileSync(path, content, "utf8");
  return true;
}

function main() {
  const index = readJson("index.json", null);
  if (!index || !Array.isArray(index.problems)) {
    console.error("index.json missing or has no problems array — nothing to refresh");
    process.exit(0);
  }

  // Written by the extension so this run reproduces the same numbers the
  // extension would. Without it the defaults apply, which is still correct for
  // anyone who never changed the daily target.
  const cfg = readJson("badges/config.json", {});
  const config = { ...DEFAULT_CONFIG, ...(cfg.config || {}) };
  const vacations = Array.isArray(cfg.vacations) ? cfg.vacations : [];

  const snapshot = computeSnapshot(index.problems, {
    config,
    vacations,
    streakFloorDay: cfg.installDay || undefined,
  });

  // A recompute that scores zero solves from a non-empty index means the
  // records carry no usable timestamps — bad data, not a bad streak. The badges
  // currently in the repo were written by the extension from the full records;
  // overwriting them with zeros is strictly worse than leaving them a day stale.
  if (snapshot.totalSolves === 0 && index.problems.length > 0) {
    console.error(
      `computed 0 solves from ${index.problems.length} indexed problem(s) — ` +
        "refusing to overwrite badges with zeros",
    );
    process.exit(0);
  }

  let changed = 0;
  const files = [
    ...buildBadgeFiles(snapshot, { username: cfg.username }),
    ...buildShieldsFiles(snapshot),
  ];
  for (const file of files) {
    if (write(file.path, file.content)) changed++;
  }

  if (cfg.readme !== false && existsSync("README.md")) {
    const readme = readFileSync("README.md", "utf8");
    // The extension already decided whether shields is usable for this repo —
    // this runner cannot see whether it went private, so it does not re-decide.
    const useShields = cfg.badgeStyle === "shields" && cfg.rawBase;
    const next = upsertReadmeBlock(readme, snapshot, {
      pagesUrl: cfg.pagesUrl,
      username: cfg.username,
      picks: Array.isArray(cfg.picks) ? cfg.picks : undefined,
      achievementPicks: Array.isArray(cfg.achievementPicks) ? cfg.achievementPicks : undefined,
      urlFor: useShields
        ? (name) => shieldsUrl(cfg.rawBase, name, snapshot, { style: cfg.shieldsStyle })
        : undefined,
    });
    if (write("README.md", next)) changed++;
  }

  console.log(
    changed
      ? `refreshed ${changed} file(s) — streak ${snapshot.currentStreak}d, ${snapshot.totalPoints} pts`
      : "already up to date",
  );
}

main();
