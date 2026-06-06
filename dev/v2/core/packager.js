import AdmZip from "adm-zip";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";

export class Packager {
  constructor(ctx, logger) {
    this.ctx = ctx;
    this.logger = logger;
  }

  packageChromium() {
    this.logger.step("Package Chromium extension");

    const manifest = JSON.parse(
      readFileSync(resolve(this.ctx.rootDir, "src", "manifest-chromium.json"), "utf8"),
    );
    manifest.version = this.ctx.version;

    const tmpManifest = resolve(this.ctx.releaseVersionDir, "_manifest_chromium_tmp.json");
    writeFileSync(tmpManifest, JSON.stringify(manifest, null, 4), "utf8");

    const zip = new AdmZip();
    zip.addLocalFolder(resolve(this.ctx.rootDir, "src"), "", (name) => name !== "manifest.json");
    zip.addLocalFile(tmpManifest, "", "manifest.json");

    const outPath = resolve(
      this.ctx.releaseVersionDir,
      `codeledger-chromium-v${this.ctx.version}.zip`,
    );
    zip.writeZip(outPath);

    try {
      unlinkSync(tmpManifest);
    } catch (_) {}
    this.logger.ok(`Chromium packaged: ${outPath}`);
    return outPath;
  }

  packageFirefox() {
    this.logger.step("Package Firefox extension");

    const manifest = JSON.parse(
      readFileSync(resolve(this.ctx.rootDir, "src", "manifest-firefox.json"), "utf8"),
    );
    manifest.version = this.ctx.version;

    const tmpManifest = resolve(this.ctx.releaseVersionDir, "_manifest_ff_tmp.json");
    writeFileSync(tmpManifest, JSON.stringify(manifest, null, 4), "utf8");

    const zip = new AdmZip();
    zip.addLocalFolder(resolve(this.ctx.rootDir, "src"), "", (name) => name !== "manifest.json");
    zip.addLocalFile(tmpManifest, "", "manifest.json");

    const outPath = resolve(
      this.ctx.releaseVersionDir,
      `codeledger-firefox-v${this.ctx.version}.zip`,
    );
    zip.writeZip(outPath);

    try {
      unlinkSync(tmpManifest);
    } catch (_) {}
    this.logger.ok(`Firefox packaged: ${outPath}`);
    return outPath;
  }

  packageSource() {
    this.logger.step("Package source code");
    const zip = new AdmZip();
    const sourceDirs = ["src", "dev", "docs", "worker"];
    const sourceFiles = [
      "package.json",
      "package-lock.json",
      "tsconfig.json",
      "tailwind.config.js",
      ".prettierrc",
    ];

    const EXCLUDE_SEGMENTS = new Set(["node_modules", "dist"]);
    const shouldInclude = (filePath) =>
      !filePath.split(/[\\/]/).some((seg) => EXCLUDE_SEGMENTS.has(seg));

    for (const dir of sourceDirs) {
      try {
        zip.addLocalFolder(resolve(this.ctx.rootDir, dir), dir, shouldInclude);
      } catch (_) {
        /* skip missing */
      }
    }
    for (const file of sourceFiles) {
      try {
        zip.addLocalFile(resolve(this.ctx.rootDir, file));
      } catch (_) {
        /* skip missing */
      }
    }

    const outPath = resolve(
      this.ctx.releaseVersionDir,
      `codeledger-source-v${this.ctx.version}.zip`,
    );
    zip.writeZip(outPath);
    this.logger.ok(`Source packaged: ${outPath}`);
    return outPath;
  }

  packageAll() {
    this.logger.section(`Packaging CodeLedger v${this.ctx.version}`);
    const outputs = [];
    outputs.push(this.packageChromium());
    outputs.push(this.packageFirefox());
    outputs.push(this.packageSource());
    this.logger.info(`\nAll artifacts in: ${this.ctx.releaseVersionDir}`);
    return outputs;
  }
}
