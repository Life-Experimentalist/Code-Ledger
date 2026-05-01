import fs from 'fs';
import path from 'path';

const mapPath = path.join(process.cwd(), 'src/data/canonical-map.json');

function normalizeEntries(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.entries)) return json.entries;
  return [];
}

function normalizeAliases(entry) {
  if (!entry || typeof entry !== 'object') return [];

  if (Array.isArray(entry.aliases)) {
    return entry.aliases.filter((alias) => alias && alias.platform && alias.slug);
  }

  if (entry.platforms && typeof entry.platforms === 'object') {
    return Object.entries(entry.platforms)
      .filter(([, slug]) => !!slug)
      .map(([platform, slug]) => ({ platform, slug }));
  }

  return [];
}

try {
  const data = fs.readFileSync(mapPath, 'utf8');
  const map = JSON.parse(data);
  let isValid = true;

  const entries = normalizeEntries(map);
  if (!entries.length) {
    console.error('Canonical map must contain a non-empty entries array.');
    process.exit(1);
  }

  for (const item of entries) {
    if (!item.canonicalId || !item.canonicalTitle || !item.topic || !item.difficulty) {
      console.error(`Invalid item missing required fields:`, item);
      isValid = false;
    }

    if (!normalizeAliases(item).length) {
      console.error(`Invalid item missing aliases:`, item);
      isValid = false;
    }
  }
  if (isValid) {
    console.log(`Canonical map validated successfully! Total items: ${entries.length}`);
  } else {
    process.exit(1);
  }
} catch (err) {
  console.error("Failed to load canonical map:", err.message);
  process.exit(1);
}
