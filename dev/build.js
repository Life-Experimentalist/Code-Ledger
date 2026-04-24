import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const SRC_DIR = './src';
const DIST_DIR = './dist';
const RELEASES_DIR = './releases';

// Function to safely extract version without needing full node execution wrapper
function getVersion() {
  const content = fs.readFileSync(path.join(SRC_DIR, 'core', 'constants.js'), 'utf8');
  const match = content.match(/VERSION:\s*['"]([^'"]+)['"]/);
  if (match && match[1]) {
    return match[1];
  }
  return '1.0.0';
}

const VERSION = getVersion();

if (fs.existsSync(DIST_DIR)) fs.rmSync(DIST_DIR, { recursive: true, force: true });
if (!fs.existsSync(RELEASES_DIR)) fs.mkdirSync(RELEASES_DIR, { recursive: true });

function copyRecursive(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(item => {
      copyRecursive(path.join(src, item), path.join(dest, item));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

const baseManifest = {
  manifest_version: 3,
  name: "CodeLedger",
  version: VERSION,
  description: "Your DSA journey, committed. Unify LeetCode, GFG, and Codeforces solves into a personal Git-backed repository.",
  icons: {
    "16": "assets/images/icon-transparent.png",
    "48": "assets/images/icon-transparent.png",
    "128": "assets/images/icon-transparent.png"
  },
  permissions: [
    "storage",
    "alarms",
    "identity"
  ],
  host_permissions: [
    "*://*.leetcode.com/*",
    "*://*.geeksforgeeks.org/*",
    "*://*.codeforces.com/*",
    "*://api.github.com/*",
    "*://generativelanguage.googleapis.com/*"
  ],
  action: {
    default_popup: "popup/popup.html"
  },
  content_scripts: [
    {
      matches: ["*://*.leetcode.com/*"],
      js: ["content/handler-loader.js"]
    }
  ],
  web_accessible_resources: [
    {
      resources: ["*"],
      matches: ["*://*.leetcode.com/*", "*://*.geeksforgeeks.org/*", "*://*.codeforces.com/*"]
    }
  ]
};

console.log('Building Chromium extension...');
const chromeDir = path.join(DIST_DIR, 'chromium');
copyRecursive(SRC_DIR, chromeDir);

const chromeManifest = structuredClone(baseManifest);
chromeManifest.permissions.push("sidePanel");
chromeManifest.side_panel = {
  default_path: "sidebar/sidebar.html"
};
chromeManifest.background = {
  service_worker: "background/service-worker.js",
  type: "module"
};
fs.writeFileSync(path.join(chromeDir, 'manifest.json'), JSON.stringify(chromeManifest, null, 2));


console.log('Building Firefox extension...');
const firefoxDir = path.join(DIST_DIR, 'firefox');
copyRecursive(SRC_DIR, firefoxDir);

const firefoxManifest = structuredClone(baseManifest);
firefoxManifest.sidebar_action = {
  default_panel: "sidebar/sidebar.html"
};
firefoxManifest.background = {
  scripts: ["background/service-worker.js"],
  type: "module"
};
firefoxManifest.browser_specific_settings = {
  gecko: {
    id: "codeledger@vkrishna04.me",
    strict_min_version: "109.0"
  }
};
fs.writeFileSync(path.join(firefoxDir, 'manifest.json'), JSON.stringify(firefoxManifest, null, 2));

console.log('Packaging extensions with bestzip...');
try {
  // Zip Chromium
  execSync(`npx bestzip ../../releases/codeledger-chromium-v${VERSION}.zip *`, { cwd: chromeDir, stdio: 'inherit' });
  // Zip Firefox
  execSync(`npx bestzip ../../releases/codeledger-firefox-v${VERSION}.zip *`, { cwd: firefoxDir, stdio: 'inherit' });
  // Zip source
  execSync(`npx bestzip releases/codeledger-source-v${VERSION}.zip src dev docs package.json .env.example .gitignore tsconfig.json`, { cwd: process.cwd(), stdio: 'inherit' });
  console.log('All builds complete. Check the "releases" directory.');
} catch (e) {
  console.error("Zipping failed:", e.message);
}
