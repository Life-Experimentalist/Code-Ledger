import { readFileSync } from "fs";

export function validateVersions(pkg, manifest, logger, manifestFirefox) {
  let ok = true;

  if (pkg.version !== manifest.version) {
    logger.error(`Version mismatch:`);
    logger.error(`   package.json:              ${pkg.version}`);
    logger.error(`   src/manifest-chromium.json: ${manifest.version}`);
    ok = false;
  }

  if (manifestFirefox && pkg.version !== manifestFirefox.version) {
    logger.error(`Version mismatch:`);
    logger.error(`   package.json:             ${pkg.version}`);
    logger.error(`   src/manifest-firefox.json: ${manifestFirefox.version}`);
    ok = false;
  }

  if (!ok) return false;

  logger.ok(`package.json and manifest.json both at ${pkg.version}`);
  return true;
}

export async function validateChangelog(changelogPath, version, logger) {
  try {
    const changelog = readFileSync(changelogPath, "utf8");
    if (!changelog.includes(`## [${version}]`)) {
      logger.error(`docs/CHANGELOG.md missing entry for [${version}]`);
      logger.dim(`Add a section: ## [${version}] — YYYY-MM-DD`);
      return false;
    }
    logger.ok(`CHANGELOG.md has entry for [${version}]`);
    return true;
  } catch (e) {
    logger.warn(`Changelog not found or unreadable: ${e.message}`);
    return true; // Non-fatal
  }
}
