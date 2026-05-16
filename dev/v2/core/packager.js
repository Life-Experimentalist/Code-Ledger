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
    const zip = new AdmZip();
    zip.addLocalFolder(resolve(this.ctx.rootDir, "src"), "");

    const outPath = resolve(
      this.ctx.releaseVersionDir,
      `codeledger-chromium-v${this.ctx.version}.zip`,
    );
    zip.writeZip(outPath);
    this.logger.ok(`Chromium packaged: ${outPath}`);
    return outPath;
  }

  packageFirefox() {
    this.logger.step("Package Firefox extension");
    const manifest = JSON.parse(
      readFileSync(resolve(this.ctx.rootDir, "src", "manifest.json"), "utf8"),
    );
    const ffManifest = { ...manifest };
    delete ffManifest.side_panel; // Firefox MV3 doesn't support side_panel

    const tmpManifest = resolve(
      this.ctx.releaseVersionDir,
      "_manifest_ff_tmp.json",
    );
    writeFileSync(tmpManifest, JSON.stringify(ffManifest, null, 2), "utf8");

    const zip = new AdmZip();
    zip.addLocalFolder(
      resolve(this.ctx.rootDir, "src"),
      "",
      (name) => name !== "manifest.json",
    );
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

    for (const dir of sourceDirs) {
      try {
        zip.addLocalFolder(resolve(this.ctx.rootDir, dir), dir);
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
