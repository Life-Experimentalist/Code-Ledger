/**
 * Builds dist/chromium and dist/firefox from src/ using the source manifests.
 * These dist directories are for local unpacked testing — packaging uses src/ directly.
 *
 * Usage: node dev/build.js [--skip-css]
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "src");
const DIST_DIR = path.join(ROOT, "dist");
const SKIP_CSS = process.argv.includes("--skip-css");

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

const pkg = readJson("package.json");
const VERSION = pkg.version;

if (!SKIP_CSS) {
  console.log("Building CSS...");
  execSync("npm run build:css", { stdio: "inherit", cwd: ROOT });
}

// Auto-regenerate chart-source.js if missing or outdated
(function ensureChartSource() {
  const chartSrcPath = path.join(ROOT, "src", "vendor", "chart-source.js");
  const chartPkgPath = path.join(ROOT, "node_modules", "chart.js", "package.json");
  if (!fs.existsSync(chartPkgPath)) return; // chart.js not installed, skip
  const chartVersion = JSON.parse(fs.readFileSync(chartPkgPath, "utf8")).version;
  const needsRegen =
    !fs.existsSync(chartSrcPath) ||
    !fs.readFileSync(chartSrcPath, "utf8").includes(`chart.js@${chartVersion}`);
  if (needsRegen) {
    console.log(`Regenerating chart-source.js for chart.js@${chartVersion}...`);
    execSync("node dev/generate-chart-vendor.js", { stdio: "inherit", cwd: ROOT });
  }
})();

if (fs.existsSync(DIST_DIR)) fs.rmSync(DIST_DIR, { recursive: true, force: true });

function copyRecursive(src, dest) {
  if (path.basename(src).toLowerCase() === "desktop.ini") return;
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((item) =>
      copyRecursive(path.join(src, item), path.join(dest, item)),
    );
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Build Chromium dist
console.log("Building Chromium extension...");
const chromeDir = path.join(DIST_DIR, "chromium");
copyRecursive(SRC_DIR, chromeDir);
const chromeManifest = readJson("src/manifest-chromium.json");
chromeManifest.version = VERSION;
fs.writeFileSync(
  path.join(chromeDir, "manifest.json"),
  JSON.stringify(chromeManifest, null, 4) + "\n",
);
// Remove source-specific manifests — only the built manifest.json belongs in dist
fs.rmSync(path.join(chromeDir, "manifest-chromium.json"), { force: true });
fs.rmSync(path.join(chromeDir, "manifest-firefox.json"), { force: true });

// Build Firefox dist
console.log("Building Firefox extension...");
const firefoxDir = path.join(DIST_DIR, "firefox");
copyRecursive(SRC_DIR, firefoxDir);
const ffManifest = readJson("src/manifest-firefox.json");
ffManifest.version = VERSION;
fs.writeFileSync(
  path.join(firefoxDir, "manifest.json"),
  JSON.stringify(ffManifest, null, 4) + "\n",
);
// Remove source-specific manifests — only the built manifest.json belongs in dist
fs.rmSync(path.join(firefoxDir, "manifest-chromium.json"), { force: true });
fs.rmSync(path.join(firefoxDir, "manifest-firefox.json"), { force: true });

console.log("Dist build complete. Run `node dev/package.js` to create release zips.");
