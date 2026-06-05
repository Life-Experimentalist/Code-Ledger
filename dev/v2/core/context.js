import { readFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function createContext() {
  const __filename = fileURLToPath(import.meta.url);
  const rootDir = resolve(dirname(__filename), "../../..");

  const packageJsonPath = join(rootDir, "package.json");
  const manifestChromiumPath = join(rootDir, "src", "manifest-chromium.json");
  const manifestFirefoxPath = join(rootDir, "src", "manifest-firefox.json");

  const pkg = readJson(packageJsonPath);
  const manifest = readJson(manifestChromiumPath);
  const manifestFirefox = readJson(manifestFirefoxPath);

  const version = pkg.version;
  const tag = `v${version}`;

  const releasesDir = join(rootDir, "releases");
  const releaseVersionDir = join(releasesDir, version);
  const distDir = join(rootDir, "dist");

  if (!existsSync(releasesDir)) mkdirSync(releasesDir, { recursive: true });
  if (!existsSync(releaseVersionDir)) {
    mkdirSync(releaseVersionDir, { recursive: true });
  }

  return {
    rootDir,
    packageJsonPath,
    manifestChromiumPath,
    manifestFirefoxPath,
    // Keep manifestPath as alias for chromium (backwards compat with release.js/validator)
    manifestPath: manifestChromiumPath,
    pkg,
    manifest,
    manifestFirefox,
    version,
    tag,
    releasesDir,
    releaseVersionDir,
    distDir,
  };
}
