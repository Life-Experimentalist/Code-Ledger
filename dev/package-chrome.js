import AdmZip from "adm-zip";
import { readFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = pkg.version;

mkdirSync("releases", { recursive: true });

const outPath = resolve(`releases/codeledger-chromium-v${version}.zip`);
const zip = new AdmZip();
zip.addLocalFolder("./src", "");
zip.writeZip(outPath);

console.log(`Chromium extension packaged: ${outPath}`);
