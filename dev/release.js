#!/usr/bin/env node
/**
 * Automated release orchestrator.
 *
 * Validates, builds, commits, tags, and pushes a release in one command.
 *
 * Usage:
 *   npm run release              # Normal release
 *   npm run release -- --dry-run # Preview without git changes
 *   npm run release -- --retry   # Retry if previous run failed (deletes and recreates tag)
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isRetry = args.includes("--retry");

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const manifest = JSON.parse(readFileSync(join("src", "manifest.json"), "utf8"));
const changelog = readFileSync("docs/CHANGELOG.md", "utf8");

const version = pkg.version;
const tag = `v${version}`;

console.log(`\n${"=".repeat(60)}`);
console.log(`CodeLedger Release: ${tag}`);
console.log(`${"=".repeat(60)}\n`);

// 1. Validation
console.log("→ Validating...");

if (manifest.version !== version) {
  console.error(`❌ Version mismatch:`);
  console.error(`   package.json: ${version}`);
  console.error(`   src/manifest.json: ${manifest.version}`);
  process.exit(1);
}
console.log(`   ✓ package.json and manifest.json both at ${version}`);

if (!changelog.includes(`## [${version}]`)) {
  console.error(`❌ docs/CHANGELOG.md missing entry for [${version}]`);
  console.error(`   Add a section: ## [${version}] — YYYY-MM-DD`);
  process.exit(1);
}
console.log(`   ✓ CHANGELOG.md has entry for [${version}]`);

// 2. Check git status
console.log("\n→ Checking git status...");
try {
  const status = execSync("git status --porcelain", { encoding: "utf8" });
  if (status.trim()) {
    console.error(`❌ Working directory not clean. Commit or stash changes:`);
    console.error(status);
    process.exit(1);
  }
  console.log("   ✓ Working directory clean");
} catch (e) {
  console.error("❌ Not a git repository");
  process.exit(1);
}

// 3. Check if tag already exists
console.log("\n→ Checking if tag exists...");
let tagExists = false;
try {
  execSync(`git rev-parse ${tag}`, { stdio: "pipe" });
  tagExists = true;
} catch (e) {
  // Tag doesn't exist, which is what we want
}

if (tagExists) {
  if (isRetry) {
    console.log(`   ⚠ Tag ${tag} exists. Retrying...`);
    console.log(`\n→ Cleaning up previous tag...`);
    try {
      // Delete local tag
      execSync(`git tag -d ${tag}`, { stdio: "pipe" });
      console.log(`   ✓ Deleted local tag ${tag}`);

      // Try to delete remote tag (might not exist if previous push failed)
      try {
        execSync(`git push origin :${tag}`, { stdio: "pipe" });
        console.log(`   ✓ Deleted remote tag ${tag}`);
      } catch (e) {
        console.log(`   ℹ Remote tag ${tag} not found (first time pushing)`);
      }
    } catch (e) {
      console.error(`❌ Failed to clean up tag ${tag}`);
      process.exit(1);
    }
  } else {
    console.error(`❌ Tag ${tag} already exists`);
    console.error(`   Use: npm run release -- --retry`);
    process.exit(1);
  }
} else {
  console.log(`   ✓ Tag ${tag} does not exist yet`);
}

// 4. Build (runs npm run publish)
console.log(`\n→ Building release artifacts...`);
if (!isDryRun) {
  try {
    execSync("npm run publish", { stdio: "inherit" });
  } catch (e) {
    console.error("❌ Build failed");
    process.exit(1);
  }
} else {
  console.log("   (dry-run: skipped)");
}

// 5. Skip commit (build artifacts aren't tracked in git)
console.log(`\n→ Tagging release...`);
// Note: No commit needed since:
// - manifest.json version already updated
// - package.json auto-synced by build.js
// - build artifacts (zips) are not tracked in git
// - working tree is clean
console.log(`   ℹ Working directory already clean`);

// 6. Tag
console.log(`\n→ Creating tag...`);
const tagCmd = `git tag ${tag}`;
if (!isDryRun) {
  try {
    execSync(tagCmd, { stdio: "inherit" });
    console.log(`   ✓ Tagged: ${tag}`);
  } catch (e) {
    console.error("❌ Tag creation failed");
    process.exit(1);
  }
} else {
  console.log(`   (dry-run) would run: ${tagCmd}`);
}

// 7. Push
console.log(`\n→ Pushing to origin...`);
const pushCmd = `git push origin main ${tag}`;
if (!isDryRun) {
  try {
    execSync(pushCmd, { stdio: "inherit" });
    console.log(`   ✓ Pushed main and ${tag}`);
  } catch (e) {
    console.error("❌ Push failed");
    console.error("   Undo with: git reset --soft HEAD~1 && git tag -d " + tag);
    process.exit(1);
  }
} else {
  console.log(`   (dry-run) would run: ${pushCmd}`);
}

// Success
console.log(`\n${"=".repeat(60)}`);
console.log(`✨ Release ${tag} complete!`);
console.log(`${"=".repeat(60)}`);
if (!isDryRun) {
  console.log(`\nThis triggered .github/workflows/release.yml`);
  console.log(`GitHub will create a release and attach the zips.`);
  console.log(`Check: https://github.com/Life-Experimentalist/Code-Ledger/releases/tag/${tag}`);
} else {
  console.log(`\nDry-run complete. Run without --dry-run to actually release.`);
}
console.log("");
