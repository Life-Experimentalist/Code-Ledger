import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function checkFiles(dir) {
  const files = readdirSync(dir);
  for (const file of files) {
    const full = join(dir, file);
    if (statSync(full).isDirectory()) {
      checkFiles(full);
    } else if (full.endsWith('.js')) {
      let content = readFileSync(full, 'utf-8');
      // Look for imports from preact-bundle.js that don't have braces
      const regex = /import\s+([^{}\n]+)\s+from\s+['"][^'"]*preact-bundle\.js['"]/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        console.log(`FOUND DEFAULT IMPORT in ${full}: ${match[0]}`);
      }
      
      // Look for chart bundle default imports
      const regexChart = /import\s+([^{}\n]+)\s+from\s+['"][^'"]*chart-bundle\.js['"]/g;
      while ((match = regexChart.exec(content)) !== null) {
        console.log(`FOUND DEFAULT IMPORT in ${full}: ${match[0]}`);
      }
    }
  }
}

checkFiles('./src');
