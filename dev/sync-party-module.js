#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Copy src/core/party.js to worker/public/assets/party.js.
 *
 * The landing page's /compare route parses the same `?repos=` list and reads
 * the same badges/stats.json files as the extension does. Two implementations
 * would drift, and the failure would be quiet: a link that works in one place
 * and silently drops a friend in the other. So there is one implementation and
 * a byte-identical copy, and test/party.test.js fails if they diverge.
 *
 * Usage: node dev/sync-party-module.js [--check]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const src = fileURLToPath(new URL("src/core/party.js", root));
const dest = fileURLToPath(new URL("worker/public/assets/party.js", root));

const source = readFileSync(src, "utf8");
let current = null;
try {
  current = readFileSync(dest, "utf8");
} catch {
  // Not there yet — the first run creates it.
}

if (process.argv.includes("--check")) {
  if (current === source) {
    console.log("party.js copy is in sync");
    process.exit(0);
  }
  console.error(
    "worker/public/assets/party.js is out of date — run: node dev/sync-party-module.js",
  );
  process.exit(1);
}

if (current === source) {
  console.log("party.js copy already in sync");
} else {
  writeFileSync(dest, source, "utf8");
  console.log(`wrote ${dest}`);
}
