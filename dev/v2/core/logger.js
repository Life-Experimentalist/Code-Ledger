const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

const format = {
  error: (s) => `${COLORS.red}${COLORS.bold}${s}${COLORS.reset}`,
  warn: (s) => `${COLORS.yellow}${s}${COLORS.reset}`,
  info: (s) => `${COLORS.blue}${s}${COLORS.reset}`,
  ok: (s) => `${COLORS.green}${s}${COLORS.reset}`,
  step: (s) => `${COLORS.cyan}${COLORS.bold}${s}${COLORS.reset}`,
  dim: (s) => `${COLORS.dim}${s}${COLORS.reset}`,
};
export class Logger {
  constructor(isDryRun = false) {
    this.isDryRun = isDryRun;
  }

  error(msg) {
    console.error(format.error(`✗ ${msg}`));
  }

  warn(msg) {
    console.log(format.warn(`⚠ ${msg}`));
  }

  info(msg) {
    console.log(format.info(`ℹ ${msg}`));
  }

  ok(msg) {
    console.log(format.ok(`✓ ${msg}`));
  }

  step(msg) {
    console.log(`\n${format.step(`→ ${msg}`)}`);
  }

  dim(msg) {
    console.log(format.dim(`  ${msg}`));
  }

  section(title) {
    const line = "=".repeat(60);
    console.log(`\n${line}`);
    console.log(`${COLORS.bold}${title}${COLORS.reset}`);
    console.log(`${line}\n`);
  }

  dryRun(cmd) {
    if (this.isDryRun) {
      this.dim(`(dry-run) would run: ${cmd}`);
    }
  }
}

export function createLogger(isDryRun = false) {
  return new Logger(isDryRun);
}
