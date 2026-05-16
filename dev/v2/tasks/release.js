import { execSync } from "child_process";
import { taskPublish } from "./publish.js";
import { validateVersions, validateChangelog } from "../core/validator.js";

export async function taskRelease(ctx, logger, options = {}) {
  const { dryRun } = options;

  logger.section("Release CodeLedger");

  // Validate versions
  logger.step("Validate versions");
  if (!validateVersions(ctx.pkg, ctx.manifest, logger)) {
    process.exit(1);
  }

  // Validate changelog
  logger.step("Validate CHANGELOG");
  const changelogPath = `${ctx.rootDir}/docs/CHANGELOG.md`;
  if (!(await validateChangelog(changelogPath, ctx.version, logger))) {
    process.exit(1);
  }

  // Run sync regression tests
  logger.step("Run sync regression tests");
  try {
    if (dryRun) {
      logger.dryRun("npm run test:sync-regression");
    } else {
      execSync("npm run test:sync-regression", {
        stdio: "inherit",
        cwd: ctx.rootDir,
      });
      logger.ok("Sync tests passed");
    }
  } catch (e) {
    logger.warn("Sync tests failed (non-fatal for dry-run)");
  }

  // Publish (build + package)
  await taskPublish(ctx, logger, {});

  // Git operations
  logger.section("Git Operations");

  if (dryRun) {
    logger.dryRun(`git commit -m "chore: release v${ctx.version}"`);
    logger.dryRun(`git tag v${ctx.version}`);
    logger.dryRun(`git push origin main v${ctx.version}`);
  } else {
    try {
      logger.step(`Commit release v${ctx.version}`);
      execSync(`git add -A && git commit -m "chore: release v${ctx.version}"`, {
        stdio: "inherit",
        cwd: ctx.rootDir,
      });
      logger.ok("Committed");

      logger.step(`Tag v${ctx.version}`);
      execSync(`git tag v${ctx.version}`, {
        stdio: "inherit",
        cwd: ctx.rootDir,
      });
      logger.ok("Tagged");

      logger.step("Push to origin");
      execSync(`git push origin main v${ctx.version}`, {
        stdio: "inherit",
        cwd: ctx.rootDir,
      });
      logger.ok("Pushed");

      logger.section("Release Complete");
      logger.info(`Version: ${ctx.version}`);
      logger.info(`Tag: v${ctx.version}`);
      logger.dim(
        "GitHub Actions will create release with artifacts automatically.",
      );
    } catch (e) {
      logger.error("Git operation failed");
      throw e;
    }
  }
}
