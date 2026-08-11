/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * What does and does not belong in a shipped extension package.
 *
 * `src/assets/images/` is where every picture this project owns lives, and most
 * of them exist for the README and the store listings: promo tiles, a social
 * preview, and a screenshot of every tab. None of that is loaded by any page the
 * extension serves, but the packager copied the whole folder, so each release
 * carried about fifteen megabytes of artwork that no user's browser would ever
 * open — and a store reviewer had to page through it to find the code.
 *
 * The list below is an allow-list rather than a list of things to drop, because
 * the failure modes are not symmetric. Forgetting to exclude a new screenshot
 * ships it silently; forgetting to include a new icon breaks a visible image,
 * which is noticed. The images that stay are the four the manifests declare and
 * the three `infra-builder.js` reads out of the package to commit into the
 * user's repository.
 *
 * Everything else in `src/` ships as-is. This is deliberately about images only:
 * a rule broad enough to drop unused code would need to understand dynamic
 * imports, and `handler-loader.js` is built on exactly those.
 */

/** Files under `assets/images/` that something at runtime actually reads. */
const KEPT_IMAGES = new Set([
  // Declared by both manifests.
  "icon-16.png",
  "icon-32.png",
  "icon-48.png",
  "icon-128.png",
  // Read through chrome.runtime.getURL() by handlers/git/github/infra-builder.js
  // and committed into the user's repository as branding for their README and
  // Pages site. Dropping these would leave broken images in somebody else's repo.
  "logo.png",
  "icon-transparent.png",
  "icon-dark-bg.png",
]);

/**
 * Whether a path from inside `src/` belongs in the shipped package.
 *
 * Accepts either separator: adm-zip hands over forward slashes, and the dist
 * builder walks the tree with the platform's own.
 *
 * @param {string} entryPath Path relative to `src/`.
 * @returns {boolean}
 */
export function shipsInPackage(entryPath) {
  const p = String(entryPath).replace(/\\/g, "/");
  const base = p.slice(p.lastIndexOf("/") + 1);

  if (/^desktop\.ini$/i.test(base)) return false;
  if (base === "manifest-chromium.json" || base === "manifest-firefox.json") return false;
  // The packagers write their own manifest.json from the per-target source.
  if (p === "manifest.json") return false;

  if (p.startsWith("assets/images/")) {
    // Keep the directory entry itself so the zip stays well-formed.
    if (p === "assets/images/" || base === "") return true;
    return KEPT_IMAGES.has(base);
  }

  return true;
}
