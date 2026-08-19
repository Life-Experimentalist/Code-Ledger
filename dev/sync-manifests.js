/**
 * Syncs version across package.json, both manifests, and the landing page.
 * Source of truth: package.json version.
 *
 * The landing page is included because it states the version twice — in the hero
 * badge a visitor reads, and in the `softwareVersion` of its structured data,
 * which search engines read. Nothing kept those in step with a release, so the
 * site went on advertising the previous version until somebody noticed by hand.
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

// Both patterns must still match. A silent no-op here would be worse than a
// crash: the release would go out and the site would keep naming the old build.
const SITE_VERSIONS = [
  {
    file: "worker/public/index.html",
    find: /("softwareVersion":\s*")\d+\.\d+\.\d+"/,
    replace: `$1${targetVersion}"`,
    what: "structured data",
  },
  {
    file: "worker/public/index.html",
    find: /(class="hero-badge">[^<]*\bv)\d+\.\d+\.\d+/,
    replace: `$1${targetVersion}`,
    what: "hero badge",
  },
  {
    file: "worker/src/index.js",
    find: /(const VERSION = ")\d+\.\d+\.\d+(")/,
    replace: `$1${targetVersion}$2`,
    what: "worker /api/health version",
  },
  {
    file: "README.md",
    find: /(badge\/version-)\d+\.\d+\.\d+(-blueviolet)/,
    replace: `$1${targetVersion}$2`,
    what: "README version badge",
  },
];

for (const { file, find, replace, what } of SITE_VERSIONS) {
  const path = resolve(root, file);
  const before = readFileSync(path, "utf8");
  if (!find.test(before)) {
    console.error(`Could not find the ${what} version in ${file} — pattern needs updating.`);
    process.exit(1);
  }
  const after = before.replace(find, replace);
  if (after !== before) {
    writeFileSync(path, after, "utf8");
    console.log(`  ${file} (${what})  → ${targetVersion}`);
  }
}

console.log(`\nAll manifests at ${targetVersion}`);
