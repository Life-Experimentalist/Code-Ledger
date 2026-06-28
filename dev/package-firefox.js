import AdmZip from "adm-zip";
import { readFileSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = pkg.version;

mkdirSync("releases", { recursive: true });
mkdirSync(`releases/${version}`, { recursive: true });

const ffManifest = JSON.parse(readFileSync("src/manifest-firefox.json", "utf8"));
ffManifest.version = version;

// Write temp manifest outside src/ so Chrome never sees it when loading unpacked
const tmpManifest = resolve("releases/_manifest_ff_tmp.json");
writeFileSync(tmpManifest, JSON.stringify(ffManifest, null, 2), "utf8");

const zip = new AdmZip();

// Add all src files, replacing manifest.json with the Firefox-compatible one
zip.addLocalFolder("./src", "", (name) => {
  return name !== "manifest-chromium.json" &&
         name !== "manifest-firefox.json" &&
         name !== "manifest.json" &&
         !/desktop\.ini$/i.test(name);
});
zip.addLocalFile(tmpManifest, "", "manifest.json");

// Save to versioned releases folder only
const outPath = resolve(`releases/${version}/codeledger-firefox-v${version}.zip`);
zip.writeZip(outPath);

// Clean up temp manifest
try {
  unlinkSync(tmpManifest);
} catch (_) {}

console.log(`Firefox extension packaged: ${outPath}`);
