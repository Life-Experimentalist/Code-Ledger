import { execSync, execFileSync } from "child_process";
import { taskPublish } from "./publish.js";
import { validateVersions, validateChangelog } from "../core/validator.js";

export async function taskRelease(ctx, logger, options = {}) {
  const { dryRun } = options;

  logger.section("Release CodeLedger");

  // Validate versions. The Firefox manifest is checked too: shipping it a
  // version behind is not caught by anything downstream — AMO simply accepts
  // the older number and the two stores drift apart.
  logger.step("Validate versions");
  if (!validateVersions(ctx.pkg, ctx.manifest, logger, ctx.manifestFirefox)) {
    process.exit(1);
  }

  // Validate changelog
  logger.step("Validate CHANGELOG");
  const changelogPath = `${ctx.rootDir}/docs/CHANGELOG.md`;
  if (!(await validateChangelog(changelogPath, ctx.version, logger))) {
    process.exit(1);
  }

  // The gate. This used to be the sync regression script alone, wrapped in a
  // catch that downgraded a failure to a warning — so a release could be cut
  // over a red suite and say nothing about it. A release is the one moment
  // where a failing check has to stop the line.
  const gate = [
    ["Type gate", "npm run lint"],
    ["Test suite", "npm test"],
    ["Sync regression", "npm run test:sync-regression"],
  ];
  for (const [label, cmd] of gate) {
    logger.step(label);
    if (dryRun) {
      logger.dryRun(cmd);
      continue;
    }
    try {
      execSync(cmd, { stdio: "inherit", cwd: ctx.rootDir });
      logger.ok(`${label} passed`);
    } catch (e) {
      logger.error(`${label} failed — refusing to release. Fix it and run again.`);
      process.exit(1);
    }
  }

  // Publish (build + package)
  await taskPublish(ctx, logger, {});

  // Git operations
  logger.section("Git Operations");

  const git = (args) => execFileSync("git", args, { cwd: ctx.rootDir, encoding: "utf8" });

  // The branch you are on, not a hardcoded `main`. Pushing `main` from a
  // feature branch pushes whatever the local `main` happens to point at, which
  // on a long-lived branch is dozens of commits behind the tag being created.
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  const dirty = git(["status", "--porcelain"]).trim().length > 0;

  if (dryRun) {
    logger.dryRun(
      dirty
        ? `git add -A && git commit -m "chore: release v${ctx.version}"`
        : "(working tree clean — nothing to commit)",
    );
    logger.dryRun(`git tag ${ctx.tag}`);
    logger.dryRun(`git push origin ${branch} ${ctx.tag}`);
  } else {
    try {
      // A clean tree is the normal case when the release commits were made by
      // hand first. `git commit` exits non-zero on nothing-to-commit, which
      // used to abort the release after the artifacts had already been built.
      if (dirty) {
        logger.step(`Commit release v${ctx.version}`);
        git(["add", "-A"]);
        git(["commit", "-m", `chore: release v${ctx.version}`]);
        logger.ok("Committed");
      } else {
        logger.dim("Working tree clean — nothing to commit");
      }

      logger.step(`Tag ${ctx.tag}`);
      git(["tag", ctx.tag]);
      logger.ok("Tagged");

      logger.step(`Push ${branch} and ${ctx.tag} to origin`);
      git(["push", "origin", branch, ctx.tag]);
      logger.ok("Pushed");

      logger.section("Release Complete");
      logger.info(`Version: ${ctx.version}`);
      logger.info(`Branch: ${branch}`);
      logger.info(`Tag: ${ctx.tag}`);
      logger.dim("GitHub Actions will create release with artifacts automatically.");
    } catch (e) {
      logger.error("Git operation failed");
      throw e;
    }
  }
}
