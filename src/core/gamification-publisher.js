/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Deciding what the gamification feature owns inside the user's repository, and
 * what a given commit should do about it.
 *
 * Everything here is pure. The service worker asks for a plan and hands the
 * files and deletions straight to the existing Trees API commit path, so the
 * rules about when badges appear, when they are removed, and whether a workflow
 * is worth committing can all be tested without a network.
 */

import { buildBadgeFiles, upsertReadmeBlock, README_START, README_END } from "./badge-svg.js";
import { isGamificationActive } from "./feature-flags.js";

/** Every path the feature writes. Nothing outside this list is ever deleted. */
export const OWNED_PATHS = Object.freeze([
  "badges/streak.svg",
  "badges/points.svg",
  "badges/level.svg",
  "badges/solved.svg",
  "badges/difficulty.svg",
  "badges/freezes.svg",
  "badges/card.svg",
  "badges/stats.json",
]);

export const WORKFLOW_PATH = ".github/workflows/codeledger-badges.yml";
export const REFRESH_SCRIPT_PATH = ".github/scripts/refresh-badges.mjs";

/**
 * What the next commit should do about the badges.
 *
 * There is deliberately no "pending revoke" flag. Intent is read fresh from the
 * settings on every commit, and `badgesPublished` records only whether files
 * are currently in the repository. Turning publishing off and back on before a
 * commit lands therefore resolves to "publish" again and nothing is touched —
 * which is the behaviour asked for, and it cannot get wedged in a half-state
 * the way a stored pending flag can.
 *
 * @param {Record<string, any>} settings
 * @returns {"publish"|"revoke"|"idle"}
 */
export function resolvePublishIntent(settings) {
  const wanted = isGamificationActive(settings) && settings?.gamificationBadges !== false;
  if (wanted) return "publish";
  return settings?.badgesPublished ? "revoke" : "idle";
}

/**
 * Whether to commit the refresh workflow.
 *
 * On by default for a public repository and off by default for a private one.
 * Actions minutes are free on public repositories and metered on private ones,
 * so switching this on unasked for a private repo would quietly spend someone's
 * quota. Either default can be overridden; an explicit choice always wins.
 *
 * @param {Record<string, any>} settings
 * @param {boolean} repoPrivate
 * @returns {boolean}
 */
export function shouldPublishWorkflow(settings, repoPrivate) {
  if (!isGamificationActive(settings)) return false;
  if (settings?.gamificationBadges === false) return false;
  if (typeof settings?.gamificationActions === "boolean") return settings.gamificationActions;
  return !repoPrivate;
}

/**
 * Remove the gamification block from a README, leaving everything the user
 * wrote intact.
 *
 * @param {string} readme
 * @returns {string}
 */
export function stripReadmeBlock(readme) {
  const text = String(readme || "");
  const start = text.indexOf(README_START);
  const end = text.indexOf(README_END);
  if (start === -1 || end === -1 || end < start) return text;

  const out = text.slice(0, start) + text.slice(end + README_END.length);
  // Removing a block from between two paragraphs leaves three newlines behind.
  // Collapsing them keeps the README from growing a blank gap every time the
  // feature is switched off and on again.
  return out.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
}

/**
 * The files and deletions a commit needs in order to bring the repository in
 * line with the user's current settings.
 *
 * @param {object} opts
 * @param {object} opts.snapshot from `computeSnapshot`
 * @param {Record<string, any>} opts.settings
 * @param {string} [opts.readme] current README contents, if known
 * @param {string} [opts.pagesUrl] base URL the badges are served from
 * @param {string} [opts.username]
 * @param {boolean} [opts.repoPrivate]
 * @param {string} [opts.refreshScript] contents of the Actions refresh script;
 *   omit it and no workflow is committed, because a workflow that calls a
 *   missing script fails on every run and mails the user about it
 * @returns {{ files: Array<{path: string, content: string}>, deletes: string[], badgesPublished: boolean, intent: string }}
 */
export function buildPublishPlan(opts = {}) {
  const { snapshot, settings = {}, readme, pagesUrl, username, repoPrivate = false } = opts;
  const intent = resolvePublishIntent(settings);

  if (intent === "idle") {
    return { files: [], deletes: [], badgesPublished: false, intent };
  }

  if (intent === "revoke") {
    const deletes = [...OWNED_PATHS];
    if (settings.workflowPublished) {
      deletes.push(WORKFLOW_PATH, REFRESH_SCRIPT_PATH);
    }
    const files = [];
    if (typeof readme === "string" && readme.includes(README_START)) {
      files.push({ path: "README.md", content: stripReadmeBlock(readme) });
    }
    return { files, deletes, badgesPublished: false, intent };
  }

  const files = buildBadgeFiles(snapshot, { username });
  const deletes = [];

  if (settings.gamificationReadme !== false && typeof readme === "string") {
    const next = upsertReadmeBlock(readme, snapshot, { pagesUrl, username });
    // Skip an unchanged README rather than adding an identical blob to the
    // tree; an unchanged commit is noise in the user's history.
    if (next !== readme) files.push({ path: "README.md", content: next });
  }

  if (shouldPublishWorkflow(settings, repoPrivate) && opts.refreshScript) {
    files.push(
      { path: WORKFLOW_PATH, content: workflowYaml(settings) },
      { path: REFRESH_SCRIPT_PATH, content: opts.refreshScript },
    );
  } else if (settings.workflowPublished) {
    deletes.push(WORKFLOW_PATH, REFRESH_SCRIPT_PATH);
  }

  return { files, deletes, badgesPublished: true, intent };
}

/**
 * The scheduled workflow that keeps the badges honest between solves.
 *
 * A badge is a picture baked at commit time, so a streak that ends because the
 * user stopped solving has nobody left to commit the correction. The badges
 * carry an "as of" date for exactly that reason, and this workflow closes the
 * gap where the repository is public and the run costs nothing.
 *
 * @param {Record<string, any>} [settings]
 * @returns {string}
 */
export function workflowYaml(settings = {}) {
  // A UTC hour, chosen by the user so the refresh lands after their day rolls
  // over rather than in the middle of it.
  const hour = Number.isInteger(settings.gamificationActionsHour)
    ? Math.min(23, Math.max(0, settings.gamificationActionsHour))
    : 4;

  return `# Managed by CodeLedger. Edits are overwritten on the next sync.
#
# Badges are pictures written at commit time, so they cannot notice a streak
# ending on a day with no commits. This run recomputes them from index.json and
# commits only when a number actually changed.
name: Refresh CodeLedger badges

on:
  schedule:
    - cron: "0 ${hour} * * *"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: codeledger-badges
  cancel-in-progress: true

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Recompute badges
        run: node ${REFRESH_SCRIPT_PATH}
      - name: Commit if changed
        run: |
          if [ -z "$(git status --porcelain badges)" ]; then
            echo "badges unchanged"
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add badges README.md
          git commit -m "chore(badges): refresh streak [skip ci]"
          git push
`;
}
