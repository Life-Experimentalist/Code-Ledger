/**
 * Copies src/ to dist/unpacked-chrome and dist/unpacked-firefox,
 * injecting the appropriate source manifest as manifest.json in each.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "src");
const DIST_CHROME = path.join(ROOT, "dist", "unpacked-chrome");
const DIST_FIREFOX = path.join(ROOT, "dist", "unpacked-firefox");

function copyRecursiveSync(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((item) =>
      copyRecursiveSync(path.join(src, item), path.join(dest, item))
    );
  } else {
    fs.copyFileSync(src, dest);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const version = pkg.version;

console.log("Syncing files to dist/unpacked...");

// Chrome
copyRecursiveSync(SRC_DIR, DIST_CHROME);
const chromeManifest = JSON.parse(
  fs.readFileSync(path.join(SRC_DIR, "manifest-chromium.json"), "utf8")
);
chromeManifest.version = version;
fs.writeFileSync(path.join(DIST_CHROME, "manifest.json"), JSON.stringify(chromeManifest, null, 4));

// Firefox
copyRecursiveSync(SRC_DIR, DIST_FIREFOX);
const ffManifest = JSON.parse(
  fs.readFileSync(path.join(SRC_DIR, "manifest-firefox.json"), "utf8")
);
ffManifest.version = version;
fs.writeFileSync(path.join(DIST_FIREFOX, "manifest.json"), JSON.stringify(ffManifest, null, 4));

console.log("Sync complete.");
