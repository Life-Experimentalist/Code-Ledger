/**
 * Syncs version across package.json, manifest-chromium.json, manifest-firefox.json,
 * and manifest.json (the dev-unpacked copy of the chromium manifest).
 *
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

// Update package.json
if (pkg.version !== targetVersion) {
  pkg.version = targetVersion;
  writeFileSync(resolve(root, "package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log(`  package.json          → ${targetVersion}`);
}

// Update both source manifests
for (const rel of ["src/manifest-chromium.json", "src/manifest-firefox.json"]) {
  const m = readJson(rel);
  m.version = targetVersion;
  writeJson(rel, m);
  console.log(`  ${rel}  → ${targetVersion}`);
}

// Sync manifest.json from manifest-chromium.json (dev unpacked copy)
const chromium = readJson("src/manifest-chromium.json");
writeJson("src/manifest.json", chromium);
console.log(`  src/manifest.json     → synced from manifest-chromium.json`);

console.log(`\nAll manifests at ${targetVersion}`);
