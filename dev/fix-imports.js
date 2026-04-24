import { readFileSync, writeFileSync } from 'fs';
import { join, dirname, relative } from 'path';

function fixPath(filePaths) {
  for (const filePath of filePaths) {
    let content = readFileSync(filePath, 'utf-8');
    
    // Determine relative depth to vendor directory
    const dir = dirname(filePath);
    const vendorDir = join(process.cwd(), 'src/vendor');
    let relativeVendor = relative(dir, vendorDir).replace(/\\/g, '/');
    if (!relativeVendor.startsWith('.')) relativeVendor = './' + relativeVendor;
    
    const preactBundle = relativeVendor + '/preact-bundle.js';
    const chartBundle = relativeVendor + '/chart-bundle.js';
    
    content = content.replace(/from\s+['"]https:\/\/esm\.sh\/preact['"]/g, `from '${preactBundle}'`);
    content = content.replace(/from\s+['"]preact['"]/g, `from '${preactBundle}'`);
    
    content = content.replace(/from\s+['"]https:\/\/esm\.sh\/preact\/hooks['"]/g, `from '${preactBundle}'`);
    content = content.replace(/from\s+['"]preact\/hooks['"]/g, `from '${preactBundle}'`);
    
    content = content.replace(/from\s+['"]https:\/\/esm\.sh\/htm['"]/g, `from '${preactBundle}'`);
    content = content.replace(/from\s+['"]htm['"]/g, `from '${preactBundle}'`);
    
    content = content.replace(/from\s+['"]https:\/\/esm\.sh\/chart\.js\/auto['"]/g, `from '${chartBundle}'`);
    content = content.replace(/from\s+['"]chart\.js\/auto['"]/g, `from '${chartBundle}'`);
    
    writeFileSync(filePath, content, 'utf-8');
  }
}

// Since I don't have glob, I'll pass files explicitly from earlier grep outputs if needed
// Actually, it's easier to just pass them manually. Let me use native fs.readdir recursively.
import fs from 'fs';

function getAllFiles(dir, files = []) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = join(dir, file);
    if (fs.statSync(full).isDirectory()) {
       getAllFiles(full, files);
    } else if (full.endsWith('.js')) {
       files.push(full);
    }
  }
  return files;
}

const uipaths = [
  ...getAllFiles(join(process.cwd(), 'src/ui')),
  ...getAllFiles(join(process.cwd(), 'src/library')),
  ...getAllFiles(join(process.cwd(), 'src/popup')),
  ...getAllFiles(join(process.cwd(), 'src/sidebar'))
];

fixPath(uipaths);
console.log('Done mapping.');
