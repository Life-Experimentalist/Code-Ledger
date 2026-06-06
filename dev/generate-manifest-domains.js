/**
 * Regenerates host_permissions and content_script matches in both source manifests
 * from the platform domain list.
 *
 * Usage: node dev/generate-manifest-domains.js  (or: npm run domains:update)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(root, rel), "utf8"));
}

function writeJson(rel, obj) {
  writeFileSync(resolve(root, rel), JSON.stringify(obj, null, 4) + "\n", "utf8");
}

// Platform domains — add new platforms here when adding a handler
const PLATFORM_DOMAINS = [
  "*://*.leetcode.com/*",
  "*://*.geeksforgeeks.org/*",
  "*://*.codeforces.com/*",
];

const FIXED_HOST_PERMISSIONS = [
  "https://api.github.com/*",
  "https://api.gitlab.com/*",
  "https://bitbucket.org/api/*",
  "https://api.openai.com/*",
  "https://api.anthropic.com/*",
  "https://generativelanguage.googleapis.com/*",
  "https://api.deepseek.com/*",
  "http://localhost:11434/*",
];

const allHostPermissions = [...new Set([...PLATFORM_DOMAINS, ...FIXED_HOST_PERMISSIONS])];

for (const rel of ["src/manifest-chromium.json", "src/manifest-firefox.json"]) {
  const m = readJson(rel);
  m.host_permissions = allHostPermissions;
  if (m.content_scripts?.[0]) {
    m.content_scripts[0].matches = PLATFORM_DOMAINS;
  }
  writeJson(rel, m);
  console.log(`Updated ${rel}`);
}
