#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Diagnostic tool to check CodeLedger handler status
 * Run with: node dev/diagnose.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HANDLERS_ROOT = path.join(__dirname, "..", "src", "handlers");

async function checkHandler(handlerPath) {
  const name = path.basename(handlerPath);
  const indexPath = path.join(handlerPath, "index.js");

  if (!fs.existsSync(indexPath)) {
    return {
      name,
      status: "MISSING",
      issues: ["No index.js file found"],
    };
  }

  const content = fs.readFileSync(indexPath, "utf-8");
  const issues = [];

  // Check for required exports
  if (!content.includes("export class")) {
    issues.push("No exported class found");
  }

  // Only platform handlers have an init() — they are the ones a content script
  // starts. AI handlers are called on demand and never had one, so asking for
  // it here reported six problems that were not problems.
  if (handlerPath.includes("platforms") && !content.includes("init()")) {
    issues.push("Missing init() method");
  }

  // Check for settings schema
  if (!content.includes("getSettingsSchema")) {
    issues.push("Missing getSettingsSchema() method");
  }

  return {
    name,
    status: issues.length === 0 ? "OK" : "ISSUES",
    issues,
    path: handlerPath,
  };
}

async function checkAllHandlers() {
  console.log(
    "\n📋 CodeLedger Handler Diagnostic Report\n" + "========================================\n",
  );

  const categories = {
    Platform: path.join(HANDLERS_ROOT, "platforms"),
    "Git Provider": path.join(HANDLERS_ROOT, "git"),
    "AI Provider": path.join(HANDLERS_ROOT, "ai"),
  };

  let totalOk = 0,
    totalIssues = 0;

  for (const [category, categoryPath] of Object.entries(categories)) {
    if (!fs.existsSync(categoryPath)) {
      console.log(`❌ ${category}: Directory not found\n`);
      continue;
    }

    const handlers = fs
      .readdirSync(categoryPath)
      .filter((f) => fs.statSync(path.join(categoryPath, f)).isDirectory());

    console.log(`📦 ${category} Handlers (${handlers.length}):`);

    for (const handler of handlers) {
      const handlerPath = path.join(categoryPath, handler);
      const result = await checkHandler(handlerPath);

      if (result.status === "OK") {
        console.log(`   ✅ ${result.name}`);
        totalOk++;
      } else if (result.status === "MISSING") {
        console.log(`   ⚠️  ${result.name} - MISSING`);
        totalIssues++;
      } else {
        console.log(`   ⚠️  ${result.name}`);
        result.issues.forEach((issue) => {
          console.log(`      • ${issue}`);
        });
        totalIssues++;
      }
    }
    console.log();
  }

  console.log(`Summary: ${totalOk} OK, ${totalIssues} with issues\n`);

  // Check the landing page's link config. This used to read `github.app_slug`
  // and `oauth_url`, neither of which the file has ever contained, so it
  // printed "NOT SET" twice on a healthy checkout.
  console.log("🔗 Landing page links (worker/public/config.json):");
  const workerConfig = path.join(__dirname, "..", "worker", "public", "config.json");
  if (fs.existsSync(workerConfig)) {
    const config = JSON.parse(fs.readFileSync(workerConfig, "utf-8"));
    for (const key of ["github_repo", "chrome_store", "firefox_store"]) {
      console.log(config[key] ? `   ✅ ${key}` : `   ⚠️  ${key} — not set`);
    }
  } else {
    console.log(`   ❌ config.json NOT found`);
  }

  // The OAuth secrets live in Wrangler, never in the repo, so there is nothing
  // here to check. `npx wrangler secret list` from worker/ is the real answer.

  // Check storage constants
  console.log("\n💾 Storage Configuration:");
  const constantsPath = path.join(__dirname, "..", "src", "core", "constants.js");
  if (fs.existsSync(constantsPath)) {
    const content = fs.readFileSync(constantsPath, "utf-8");
    if (content.includes("SK:")) {
      console.log(`   ✅ Storage keys defined`);
    }
    if (content.includes("GIT_PROVIDERS")) {
      console.log(`   ✅ Git providers configured`);
    }
  }

  console.log("\n✨ Recommendation:");
  if (totalIssues === 0) {
    console.log("  • All handlers are properly configured!");
    console.log("  • Ready to test OAuth flow");
    console.log("  • Run: npm run build && npm run watch");
  } else {
    console.log("  • Review issues above before deploying");
  }
}

checkAllHandlers().catch(console.error);
