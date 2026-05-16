#!/usr/bin/env node

import { createContext } from "./core/context.js";
import { createLogger } from "./core/logger.js";
import { taskBuild } from "./tasks/build.js";
import { taskPublish } from "./tasks/publish.js";
import { taskRelease } from "./tasks/release.js";

const TASKS = {
  build: taskBuild,
  publish: taskPublish,
  release: taskRelease,
};

async function main() {
  const args = process.argv.slice(2);
  const taskName = args[0];
  const flags = args.slice(1);

  if (!taskName || taskName === "--help" || taskName === "-h") {
    console.log(`
CodeLedger v2 Build System

Usage: node dev/v2/cli.js <task> [options]

Tasks:
  build       Build CSS + extension distributions
  publish     Build + package release zips to releases/VERSION/
  release     Full release: validate → build → package → commit → tag → push

Options:
  --skip-css      Skip Tailwind CSS compilation (build task only)
  --dry-run       Preview commands without executing (release task only)
  --help, -h      Show this help message
    `);
    process.exit(0);
  }

  if (!TASKS[taskName]) {
    console.error(`Unknown task: ${taskName}`);
    console.error(`Available tasks: ${Object.keys(TASKS).join(", ")}`);
    process.exit(1);
  }

  try {
    const ctx = createContext();
    const options = {
      skipCss: flags.includes("--skip-css"),
      dryRun: flags.includes("--dry-run"),
    };
    const logger = createLogger(options.dryRun);

    logger.info(`CodeLedger v${ctx.version}\n`);
    await TASKS[taskName](ctx, logger, options);
  } catch (e) {
    console.error(`\n❌ Task failed: ${e.message}`);
    if (process.env.DEBUG) {
      console.error(e.stack);
    }
    process.exit(1);
  }
}

main();
