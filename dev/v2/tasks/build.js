import { execSync } from "child_process";

export async function taskBuild(ctx, logger, options = {}) {
  const { skipCss } = options;

  logger.section("Build");

  if (!skipCss) {
    logger.step("Compile Tailwind CSS");
    try {
      execSync("npm run build:css", { stdio: "inherit", cwd: ctx.rootDir });
      logger.ok("CSS build complete");
    } catch (e) {
      logger.error("CSS build failed");
      throw e;
    }
  } else {
    logger.info("Skipping CSS build (--skip-css)");
  }

  logger.step("Build extension distributions");
  try {
    const buildCmd = skipCss ? "npm run build:fast" : "npm run build:dist";
    execSync(buildCmd, { stdio: "inherit", cwd: ctx.rootDir });
    logger.ok("Extension build complete");
  } catch (e) {
    logger.error("Extension build failed");
    throw e;
  }

  logger.ok("Build complete");
}
