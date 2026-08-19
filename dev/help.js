#!/usr/bin/env node

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const MAGENTA = "\x1b[35m";
const BLUE = "\x1b[34m";
const WHITE = "\x1b[37m";

const CATEGORIES = [
  {
    label: "Development",
    color: CYAN,
    scripts: [
      ["dev", "Full dev mode: initial build, then the file watcher (Ctrl+C stops it)"],
      ["watch", "File watcher only — rebuilds src/ on change, no initial build"],
    ],
  },
  {
    label: "Building",
    color: GREEN,
    scripts: [
      ["build", "Full build: Tailwind CSS → extension dist/ (use this normally)"],
      [
        "build:css",
        "CSS only: src/index.css → src/ui/styles/compiled.css (run after any CSS change)",
      ],
      ["build:dist", "Extension dist only, via legacy build.js (includes CSS)"],
      ["build:fast", "Extension dist only, skips CSS — fastest rebuild when only JS changed"],
      ["clean", "Delete all generated build artifacts and temp files"],
    ],
  },
  {
    label: "Packaging & Release",
    color: YELLOW,
    scripts: [
      [
        "package / package:chrome / package:firefox",
        "All identical: build + zip Chrome & Firefox into releases/VERSION/",
      ],
      ["publish", "Alias for package — same zip output"],
      ["release", "Full release: validate → build → package → git commit → tag → push"],
      ["release -- --dry-run", "Preview what release would do — no git changes"],
    ],
  },
  {
    label: "Code Quality",
    color: MAGENTA,
    scripts: [
      ["test", "Full node:test suite — test/ and worker/test/"],
      ["test:watch", "Same suite, re-run on change"],
      [
        "lint",
        "Type gate — checks every file and fails only on errors that are never a false positive on untyped JS",
      ],
      ["lint:all", "Raw tsc --checkJs output, advisory findings included"],
      ["format", "Prettier write mode over src/, dev/, worker/ JS files"],
      [
        "format:check",
        "Prettier check mode — exits non-zero if any file needs formatting (CI use)",
      ],
    ],
  },
  {
    label: "Maintenance & Utilities",
    color: BLUE,
    scripts: [
      [
        "sync:manifests",
        "Sync shared fields between manifest-chromium.json and manifest-firefox.json",
      ],
      [
        "domains:update",
        "Regenerate host_permissions in both manifests from platform handler DOMAINS exports — run after adding a platform",
      ],
      [
        "validate:openapi",
        "Lint docs/OPENAPI.yaml for syntax/schema errors — run before worker deploys touching routes",
      ],
      ["deploy:worker", "Deploy the Cloudflare Worker static public/ directory via Wrangler"],
      ["test:sync-regression", "Run sync regression tests for cross-device sync edge cases"],
      ["sync:party", "Regenerate the landing page's copy of the party comparison module"],
      ["vendor:preact", "Rebuild src/vendor/preact-bundle.js from the npm packages"],
      ["emoji:scan", "Report source files whose emoji have been mangled by an editor"],
      ["emoji:repair", "Repair what emoji:scan reports"],
    ],
  },
];

const COL_WIDTH = 42;

console.log();
console.log(`${BOLD}${WHITE}CodeLedger — npm scripts reference${RESET}`);
console.log(DIM + "─".repeat(80) + RESET);

for (const { label, color, scripts } of CATEGORIES) {
  console.log();
  console.log(`${BOLD}${color}${label}${RESET}`);
  for (const [name, desc] of scripts) {
    const nameStr = `${color}npm run ${name}${RESET}`;
    const displayName = nameStr + " ".repeat(Math.max(0, COL_WIDTH - `npm run ${name}`.length));
    console.log(`  ${displayName}  ${DIM}${desc}${RESET}`);
  }
}

console.log();
console.log(DIM + "─".repeat(80) + RESET);
console.log(
  `${DIM}Tip: npm run release -- --dry-run  previews a release without any git changes${RESET}`,
);
console.log();
