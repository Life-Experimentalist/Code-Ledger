import AdmZip from "adm-zip";
import { readFileSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = pkg.version;

mkdirSync("releases", { recursive: true });
mkdirSync(`releases/${version}`, { recursive: true });

const chromeManifest = JSON.parse(readFileSync("src/manifest-chromium.json", "utf8"));
chromeManifest.version = version;

const tmpManifest = resolve("releases/_manifest_chrome_tmp.json");
writeFileSync(tmpManifest, JSON.stringify(chromeManifest, null, 2), "utf8");

const zip = new AdmZip();

// Add all src files, excluding the split manifests and adding the chrome temporary manifest as manifest.json
zip.addLocalFolder("./src", "", (name) => {
  return (
    name !== "manifest-chromium.json" &&
    name !== "manifest-firefox.json" &&
    name !== "manifest.json" &&
    !/desktop\.ini$/i.test(name)
  );
});
zip.addLocalFile(tmpManifest, "", "manifest.json");

// Save to versioned releases folder only
const outPath = resolve(`releases/${version}/codeledger-chromium-v${version}.zip`);
zip.writeZip(outPath);

// Clean up temp manifest
try {
  unlinkSync(tmpManifest);
} catch (_) {}

console.log(`Chromium extension packaged: ${outPath}`);
