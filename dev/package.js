#!/usr/bin/env node
/**
 * Publish orchestrator — runs the full release build:
 *   1. Compiles Tailwind CSS
 *   2. Packages Chrome/Edge/Brave zip (src/ as-is)
 *   3. Packages Firefox zip (side_panel stripped from manifest)
 *   4. Packages source tarball (src + dev + docs + config files)
 *
 * Reads version from package.json (canonical source of truth).
 * Usage: npm run publish
 */

import { execSync } from "child_process";
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  readFileSync,
} from "fs";
import { resolve, relative, join } from "path";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const manifest = JSON.parse(
  readFileSync(join("src", "manifest-chromium.json"), "utf8"),
);
const version = pkg.version;

if (manifest.version !== version) {
  console.error(
    `Version mismatch: package.json has ${version} but src/manifest-chromium.json has ${manifest.version}.\n` +
      `Run: node dev/sync-manifests.js --set ${version}`,
  );
  process.exit(1);
}

console.log(`\nPublishing CodeLedger v${version}\n`);

mkdirSync("releases", { recursive: true });

function run(cmd, label) {
  console.log(`→ ${label}`);
  try {
    execSync(cmd, { stdio: "inherit" });
  } catch (e) {
    console.error(`Failed: ${label}`);
    process.exit(1);
  }
}

// 1. CSS build
run("npm run build:css", "Compile Tailwind CSS");

// 2. Chromium package
run(
  "node dev/package-chrome.js",
  `Package Chromium → releases/codeledger-chromium-v${version}.zip`,
);

// 3. Firefox package
run(
  "node dev/package-firefox.js",
  `Package Firefox → releases/codeledger-firefox-v${version}.zip`,
);

// 4. Source zip
import AdmZip from "adm-zip";
const sourceZip = new AdmZip();
const sourceDirs = ["src", "dev", "docs", "worker"];
const sourceFiles = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tailwind.config.js",
  ".prettierrc",
];

for (const dir of sourceDirs) {
  try {
    sourceZip.addLocalFolder(dir, dir);
  } catch (_) {
    /* skip missing dirs */
  }
}
for (const file of sourceFiles) {
  try {
    sourceZip.addLocalFile(file);
  } catch (_) {
    /* skip missing files */
  }
}

const sourcePath = resolve(`releases/codeledger-source-v${version}.zip`);
sourceZip.writeZip(sourcePath);
console.log(`→ Source tarball → releases/codeledger-source-v${version}.zip`);

console.log(`\nDone. Three artifacts in releases/:`);
console.log(`  codeledger-chromium-v${version}.zip`);
console.log(`  codeledger-firefox-v${version}.zip`);
console.log(`  codeledger-source-v${version}.zip`);
console.log(`\nNext steps:`);
console.log(`  git commit -m "chore: release v${version}"`);
console.log(`  git tag v${version}`);
console.log(
  `  git push origin main v${version}   # triggers GitHub Actions release`,
);
