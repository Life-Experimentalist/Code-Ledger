import fs from 'fs';
import https from 'https';
import path from 'path';

const VENDOR_DIR = './src/vendor';
if (!fs.existsSync(VENDOR_DIR)) fs.mkdirSync(VENDOR_DIR, { recursive: true });

async function download(url, filename) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
         let redir = res.headers.location;
         if (!redir.startsWith('http')) redir = new URL(redir, url).href;
         return resolve(download(redir, filename));
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        fs.writeFileSync(path.join(VENDOR_DIR, filename), data);
        resolve();
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('Downloading dependencies...');
  await download('https://esm.sh/v135/preact@10.26.0/es2022/preact.mjs', 'preact.js');
  await download('https://esm.sh/v135/preact@10.26.0/hooks/es2022/hooks.mjs', 'preact-hooks.js');
  await download('https://esm.sh/v135/htm@3.1.1/es2022/htm.mjs', 'htm.js');
  await download('https://esm.sh/v135/chart.js@4.4.1/auto/es2022/auto.mjs', 'chart.js');
  console.log('Done.');
}

run();
