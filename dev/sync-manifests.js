/**
 * Syncs version across package.json, manifest-chromium.json, and manifest-firefox.json.
 * Source of truth: package.json version.
 *
 * Usage:
 *   node dev/sync-manifests.js            # sync all to package.json version
 *   node dev/sync-manifests.js --set 1.5.0  # bump all to 1.5.0
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dirname, "..");

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(root, rel), "utf8"));
}

function writeJson(rel, obj) {
  writeFileSync(resolve(root, rel), JSON.stringify(obj, null, 4) + "\n", "utf8");
}

const setArg = process.argv.indexOf("--set");
const pkg = readJson("package.json");
const targetVersion = setArg >= 0 ? process.argv[setArg + 1] : pkg.version;

if (!targetVersion || !/^\d+\.\d+\.\d+$/.test(targetVersion)) {
  console.error("Invalid version:", targetVersion);
  process.exit(1);
}

if (pkg.version !== targetVersion) {
  pkg.version = targetVersion;
  writeFileSync(resolve(root, "package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log(`  package.json               → ${targetVersion}`);
}

for (const rel of ["src/manifest-chromium.json", "src/manifest-firefox.json"]) {
  const m = readJson(rel);
  m.version = targetVersion;
  writeJson(rel, m);
  console.log(`  ${rel}  → ${targetVersion}`);
}

console.log(`\nAll manifests at ${targetVersion}`);
