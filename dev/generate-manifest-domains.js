/**
 * Regenerates host_permissions and content_script matches in both source manifests
 * from the platform domain list.
 *
 * Usage: node dev/generate-manifest-domains.js  (or: npm run domains:update)
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(root, rel), "utf8"));
}

function writeJson(rel, obj) {
  writeFileSync(resolve(root, rel), JSON.stringify(obj, null, 4) + "\n", "utf8");
}

// Platform domains come from each handler's `DOMAINS` export in
// src/handlers/platforms/{name}/dom-selectors.js — the single place a new
// platform declares its hostnames. A subdomain entry (www., practice., …) is
// folded into its parent, since the manifest pattern `*://*.{domain}/*`
// already covers every subdomain.
const platformsDir = resolve(root, "src/handlers/platforms");
const PLATFORM_DOMAINS = [];
for (const name of readdirSync(platformsDir).sort()) {
  if (name.startsWith("_")) continue;
  const file = resolve(platformsDir, name, "dom-selectors.js");
  const { DOMAINS } = await import(pathToFileURL(file).href);
  if (!Array.isArray(DOMAINS) || !DOMAINS.length) {
    console.error(`${name}/dom-selectors.js exports no DOMAINS — every platform must declare one.`);
    process.exit(1);
  }
  for (const d of DOMAINS) {
    if (DOMAINS.some((other) => other !== d && d.endsWith(`.${other}`))) continue;
    PLATFORM_DOMAINS.push(`*://*.${d}/*`);
  }
}

// Where content/net-tap.js runs. It executes in the page's own world, so it is
// deliberately scoped to the two sites whose judges cannot be observed any
// other way — not to every platform.
const TAP_DOMAINS = ["*://*.neetcode.io/*", "*://*.takeuforward.org/*"];

// The auth worker origin. Required for BOTH the OAuth callback relay
// (background tabs.onUpdated reads changeInfo.url) and the presence-marker
// content script. Omitting it silently breaks sign-in.
//
// https only, and deliberately so. This is the origin the GitHub token travels
// over: presence-marker.js reads it out of the callback page's DOM and writes it
// straight to auth.tokens. Under a `*://` match the same content script also runs
// on http://codeledger.vkrishna04.me, so anyone able to answer for that host —
// hostile Wi-Fi, a DNS spoof, an ISP — could serve a page carrying an
// attacker-owned token and have the extension adopt it, silently repointing the
// user's ledger at a repository the attacker controls.
const WORKER_ORIGIN = "https://codeledger.vkrishna04.me/*";

// Every remote API the extension actually calls. Keep this list minimal:
// each entry is a permission the user is prompted to grant and a reviewer
// has to justify. Do not add a host for a provider that is not shipping.
const FIXED_HOST_PERMISSIONS = [
  "https://api.github.com/*",
  "https://api.openai.com/*",
  "https://api.anthropic.com/*",
  "https://generativelanguage.googleapis.com/*",
  "https://api.deepseek.com/*",
  "https://openrouter.ai/*",
  "http://localhost:11434/*",
];

const allHostPermissions = [
  ...new Set([WORKER_ORIGIN, ...PLATFORM_DOMAINS, ...FIXED_HOST_PERMISSIONS]),
];

for (const rel of ["src/manifest-chromium.json", "src/manifest-firefox.json"]) {
  const m = readJson(rel);
  m.host_permissions = allHostPermissions;

  // content_scripts[0] is the platform handler loader; [1] is the presence
  // marker on the worker origin. Only the former is domain-generated.
  const loader = (m.content_scripts || []).find((c) => c.js?.includes("content/handler-loader.js"));
  if (loader) loader.matches = PLATFORM_DOMAINS;

  const tap = (m.content_scripts || []).find((c) => c.js?.includes("content/net-tap.js"));
  if (tap) tap.matches = TAP_DOMAINS;

  for (const entry of m.web_accessible_resources || []) {
    if (entry.resources?.includes("content/presence-marker.js")) continue;
    entry.matches = PLATFORM_DOMAINS;
  }

  writeJson(rel, m);
  console.log(`Updated ${rel}`);
}
