import { taskBuild } from "./build.js";
import { Packager } from "../core/packager.js";
import { validateVersions } from "../core/validator.js";

export async function taskPublish(ctx, logger, options = {}) {
  const { skipCss } = options;

  // Validate versions first
  logger.section("Validate");
  if (!validateVersions(ctx.pkg, ctx.manifest, logger, ctx.manifestFirefox)) {
    process.exit(1);
  }

  // Build
  await taskBuild(ctx, logger, { skipCss });

  // Package
  const packager = new Packager(ctx, logger);
  packager.packageAll();

  logger.section("Publish Complete");
  logger.info(`Release artifacts ready in: ${ctx.releaseVersionDir}`);
  logger.dim(`Chromium: codeledger-chromium-v${ctx.version}.zip`);
  logger.dim(`Firefox: codeledger-firefox-v${ctx.version}.zip`);
  logger.dim(`Source:  codeledger-source-v${ctx.version}.zip`);
}
