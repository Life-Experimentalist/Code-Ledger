import fs, { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

function fixHtmImports(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      fixHtmImports(full);
    } else if (full.endsWith('.js')) {
      let content = readFileSync(full, 'utf-8');
      if (content.includes('import htm from')) {
         content = content.replace(/import htm from/g, 'import { htm } from');
         writeFileSync(full, content, 'utf-8');
      }
    }
  }
}

fixHtmImports('./src/ui');
fixHtmImports('./src/library');
fixHtmImports('./src/popup');
fixHtmImports('./src/sidebar');
console.log('Fixed htm imports');
