import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'node:fs'; // Node 20+

const manifestPath = resolve(process.cwd(), 'src/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// Simulated extraction from dom-selectors.js files
// In a full build, this uses regex or dynamic imports to find all 'DOMAINS' exports
const allDomains = [
  '*://*.leetcode.com/*', 
  '*://*.geeksforgeeks.org/*', 
  '*://*.codeforces.com/*'
];

manifest.host_permissions = [
  ...new Set([...manifest.host_permissions, ...allDomains])
];

manifest.content_scripts[0].matches = allDomains;

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('Manifest domains updated dynamically.');
