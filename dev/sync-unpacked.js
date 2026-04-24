import fs from 'fs';
import path from 'path';

const SRC_DIR = './src';
const DIST_CHROME = './dist/unpacked-chrome';
const DIST_FIREFOX = './dist/unpacked-firefox';

function copyRecursiveSync(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(item => {
      copyRecursiveSync(path.join(src, item), path.join(dest, item));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function sync() {
  console.log('Syncing files to dist/unpacked...');
  
  if (!fs.existsSync(DIST_CHROME)) fs.mkdirSync(DIST_CHROME, { recursive: true });
  if (!fs.existsSync(DIST_FIREFOX)) fs.mkdirSync(DIST_FIREFOX, { recursive: true });

  // Update version from constants.js
  const constantsContent = fs.readFileSync(path.join(SRC_DIR, 'core', 'constants.js'), 'utf8');
  const versionMatch = constantsContent.match(/VERSION:\s*['"]([^'"]+)['"]/);
  const version = versionMatch ? versionMatch[1] : '1.0.0';

  // Base manifest
  const baseManifest = {
    manifest_version: 3,
    name: "CodeLedger",
    version: version,
    description: "Your DSA journey, committed.",
    permissions: ["storage", "alarms", "identity"],
    host_permissions: [
      "*://*.leetcode.com/*",
      "*://*.geeksforgeeks.org/*",
      "*://*.codeforces.com/*",
      "*://api.github.com/*"
    ],
    action: { default_popup: "popup/popup.html" },
    web_accessible_resources: [{
      resources: ["*"],
      matches: ["<all_urls>"]
    }]
  };

  // Copy src to chrome
  copyRecursiveSync(SRC_DIR, DIST_CHROME);
  const chromeManifest = { ...baseManifest, permissions: [...baseManifest.permissions, "sidePanel"], side_panel: { default_path: "sidebar/sidebar.html" }, background: { service_worker: "background/service-worker.js", type: "module" } };
  fs.writeFileSync(path.join(DIST_CHROME, 'manifest.json'), JSON.stringify(chromeManifest, null, 2));

  // Copy src to firefox
  copyRecursiveSync(SRC_DIR, DIST_FIREFOX);
  const firefoxManifest = { ...baseManifest, sidebar_action: { default_panel: "sidebar/sidebar.html" }, background: { scripts: ["background/service-worker.js"], type: "module" }, browser_specific_settings: { gecko: { id: "codeledger@vkrishna04.me" } } };
  fs.writeFileSync(path.join(DIST_FIREFOX, 'manifest.json'), JSON.stringify(firefoxManifest, null, 2));

  console.log('Sync complete.');
}

sync();
