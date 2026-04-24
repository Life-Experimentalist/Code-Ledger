import fs from 'fs';
import path from 'path';

const mapPath = path.join(process.cwd(), 'src/data/canonical-map.json');

try {
  const data = fs.readFileSync(mapPath, 'utf8');
  const map = JSON.parse(data);
  let isValid = true;
  for (const item of map) {
    if (!item.canonicalId || !item.slug || !item.platforms) {
      console.error(`Invalid item missing required fields:`, item);
      isValid = false;
    }
  }
  if (isValid) {
    console.log(`Canonical map validated successfully! Total items: ${map.length}`);
  } else {
    process.exit(1);
  }
} catch (err) {
  console.error("Failed to load canonical map:", err.message);
  process.exit(1);
}
