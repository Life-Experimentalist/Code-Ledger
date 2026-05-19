import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

/**
 * Extracts the release notes section for a given version from CHANGELOG.md.
 * Returns the body text (everything after the `## [X.Y.Z]` header line up to
 * the next section header or `---` separator), with trailing blank lines stripped.
 *
 * @param {string} changelogPath  Absolute path to CHANGELOG.md
 * @param {string} version        Version string, e.g. "1.3.1"
 * @returns {string}              Release notes body, or empty string if not found
 */
export function extractChangelogSection(changelogPath, version) {
  const content = readFileSync(changelogPath, "utf8");
  const lines = content.split("\n");

  const startRe = new RegExp(`^## \\[${version.replace(/\./g, "\\.")}\\]`);
  const nextSectionRe = /^## \[/;
  const separatorRe = /^---\s*$/;

  let inSection = false;
  const collected = [];

  for (const line of lines) {
    if (!inSection) {
      if (startRe.test(line)) inSection = true;
      continue;
    }
    if (nextSectionRe.test(line) || separatorRe.test(line)) break;
    collected.push(line);
  }

  // Strip trailing blank lines
  while (collected.length && !collected[collected.length - 1].trim()) {
    collected.pop();
  }

  return collected.join("\n");
}

// CLI: node dev/v2/tasks/extract-changelog.js <version>
const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) ===
    resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const version = process.argv[2];
  if (!version) {
    console.error("Usage: node dev/v2/tasks/extract-changelog.js <version>");
    process.exit(1);
  }

  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const changelogPath = resolve(rootDir, "docs", "CHANGELOG.md");

  const notes = extractChangelogSection(changelogPath, version);
  if (!notes) {
    console.error(`No CHANGELOG entry found for version ${version}`);
    process.exit(1);
  }
  process.stdout.write(notes);
}
