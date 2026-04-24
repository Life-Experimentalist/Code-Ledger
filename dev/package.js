#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

function getVersion() {
  const content = fs.readFileSync(
    path.join("src", "core", "constants.js"),
    "utf8",
  );
  const match = content.match(/VERSION:\s*['\"]([^'\"]+)['\"]/);
  if (match && match[1]) return match[1];
  return "1.0.0";
}

const VERSION = getVersion();
const chromeDir = path.join(process.cwd(), "dist", "chromium");
const firefoxDir = path.join(process.cwd(), "dist", "firefox");
const releasesDir = path.join(process.cwd(), "releases");

if (!fs.existsSync(chromeDir) || !fs.existsSync(firefoxDir)) {
  console.error("Dist directories not found. Run `npm run build` first.");
  process.exit(1);
}

if (!fs.existsSync(releasesDir)) fs.mkdirSync(releasesDir, { recursive: true });

try {
  console.log("Packaging Chromium extension...");
  execSync(
    `npx bestzip ${path.join(releasesDir, `codeledger-chromium-v${VERSION}.zip`)} *`,
    { cwd: chromeDir, stdio: "inherit" },
  );

  console.log("Packaging Firefox extension...");
  execSync(
    `npx bestzip ${path.join(releasesDir, `codeledger-firefox-v${VERSION}.zip`)} *`,
    { cwd: firefoxDir, stdio: "inherit" },
  );

  console.log("Packaging source tarball...");
  execSync(
    `npx bestzip ${path.join(releasesDir, `codeledger-source-v${VERSION}.zip`)} src dev docs package.json .env.example .gitignore tsconfig.json`,
    { cwd: process.cwd(), stdio: "inherit" },
  );

  console.log("Packaging complete. Releases are in", releasesDir);
} catch (e) {
  console.error("Packaging failed:", e.message);
  process.exit(1);
}
