import AdmZip from "adm-zip";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = pkg.version;

mkdirSync("releases", { recursive: true });

// Firefox (Gecko) requires manifest_version 3 but with a few tweaks:
// - Remove "side_panel" which is Chrome-only
// - Keep browser_specific_settings.gecko for stable add-on ID
const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8"));
const ffManifest = { ...manifest };
delete ffManifest.side_panel;  // not supported in Firefox MV3

const tmpManifest = resolve("src/_manifest_ff_tmp.json");
writeFileSync(tmpManifest, JSON.stringify(ffManifest, null, 2), "utf8");

const outPath = resolve(`releases/codeledger-firefox-v${version}.zip`);
const zip = new AdmZip();

// Add all src files, replacing manifest.json with the Firefox-compatible one
zip.addLocalFolder("./src", "", (name) => name !== "manifest.json");
zip.addLocalFile(tmpManifest, "", "manifest.json");
zip.writeZip(outPath);

// Clean up temp manifest
try { require("fs").unlinkSync(tmpManifest); } catch (_) { }

console.log(`Firefox extension packaged: ${outPath}`);
