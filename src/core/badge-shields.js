/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * shields.io rendering for the same badges `badge-svg.js` draws itself.
 *
 * Shields is the badge vocabulary most READMEs already speak, and some people
 * simply prefer how it looks — `for-the-badge`, `flat-square`, a language logo
 * on the left. So this exists as a choice, not a replacement. Both renderings
 * read `badgeSpecs()`, so whichever one a README uses says the same thing.
 *
 * How it works: shields' `endpoint` badge takes a URL to a small JSON document
 * describing the badge, fetches it, and draws the result. That document is what
 * `buildShieldsFiles` writes into the ledger repository. The user's own numbers
 * are the input; shields only draws them.
 *
 * Three consequences the UI has to be honest about, and the reason self-hosted
 * SVG remains the default:
 *
 * 1. **It is a third party.** shields.io fetches the endpoint file, and anyone
 *    loading the README causes a request to shields.io. That is one more
 *    service that learns the repository exists. The self-hosted SVGs involve
 *    nobody but GitHub.
 * 2. **It needs a public repository.** shields fetches over anonymous HTTP; a
 *    private repo's raw URL 404s for it. `shieldsUsable()` is the gate, and a
 *    private repo silently falls back to the SVGs rather than committing a
 *    README full of "invalid" badges.
 * 3. **It can be down.** A badge service outage shows broken images in the
 *    user's README. Files committed next to the solutions cannot go down.
 */

import { badgeSpecs, BADGE_NAMES, cacheKey } from "./badge-svg.js";

/** Where the endpoint descriptors live inside the ledger repository. */
export const SHIELDS_DIR = "badges/shields";

/** Every path this module writes, for the publisher's owned-paths list. */
export const SHIELDS_PATHS = Object.freeze(BADGE_NAMES.map((n) => `${SHIELDS_DIR}/${n}.json`));

/**
 * The badge shapes shields offers. Anything outside this list is dropped rather
 * than passed through: an unknown `style` makes shields render an error badge,
 * and the value reaches us from stored settings.
 */
export const SHIELDS_STYLES = Object.freeze([
  "flat",
  "flat-square",
  "plastic",
  "for-the-badge",
  "social",
]);

/**
 * One endpoint document.
 *
 * `cacheSeconds` is shields' floor of 300 rather than something longer, because
 * the badge URL already changes whenever the numbers do — see `shieldsUrl`. A
 * long cache here would only delay the one case the cache-buster cannot cover:
 * a scheduled refresh that rewrites the endpoint file without the README URL
 * changing, which happens when a streak lapses on a day with no commit.
 *
 * @param {{label: string, value: string, color: string}} spec from `badgeSpecs`
 * @returns {{schemaVersion: 1, label: string, message: string, color: string, cacheSeconds: number}}
 */
export function endpointBody(spec) {
  return {
    schemaVersion: 1,
    label: String(spec?.label ?? ""),
    message: String(spec?.value ?? ""),
    // Shields takes hex without the hash. Passing "#f97316" renders grey.
    color: String(spec?.color ?? "").replace(/^#/, ""),
    cacheSeconds: 300,
  };
}

/**
 * The endpoint files to include in a commit.
 *
 * Written whether or not shields is the selected style. They are six small JSON
 * documents, they cost one tree entry each, and writing them unconditionally
 * means switching style is a README edit rather than a delete-and-recreate
 * across two commits — with a window in between where the README points at
 * files that are not there yet. They are also the plainest machine-readable
 * form of these numbers, which is worth having for anything else that wants to
 * read them.
 *
 * @param {object} snapshot from `computeSnapshot`
 * @returns {Array<{path: string, content: string}>}
 */
export function buildShieldsFiles(snapshot) {
  const specs = badgeSpecs(snapshot);
  return BADGE_NAMES.map((name) => ({
    path: `${SHIELDS_DIR}/${name}.json`,
    content: JSON.stringify(endpointBody(specs[name]), null, 2),
  }));
}

/**
 * The raw.githubusercontent base the endpoint files are served from.
 *
 * raw rather than GitHub Pages, deliberately: Pages is optional and takes a
 * build to publish, whereas raw serves the file the moment the commit lands. A
 * badge that is blank for two minutes after every solve is a badge people turn
 * off.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} [branch]
 * @returns {string} "" when either half is missing, which callers treat as
 *   "shields cannot be used here"
 */
export function rawBaseUrl(owner, repo, branch = "main") {
  const o = encodeURIComponent(String(owner || "").trim());
  const r = encodeURIComponent(String(repo || "").trim());
  const b = encodeURIComponent(String(branch || "main").trim());
  if (!o || !r) return "";
  return `https://raw.githubusercontent.com/${o}/${r}/${b}`;
}

/**
 * Whether shields can actually render this repository's badges.
 *
 * @param {{repoPrivate?: boolean, rawBase?: string}} ctx
 * @returns {boolean}
 */
export function shieldsUsable(ctx = {}) {
  return !ctx.repoPrivate && !!ctx.rawBase;
}

/**
 * The `img.shields.io` URL a README should embed for one badge.
 *
 * There are two caches to get past, and one trick handles both. GitHub's camo
 * proxy keys on the outer URL; shields keys its upstream fetch on the `url`
 * parameter. Putting the cache-buster on the *inner* URL changes the inner and
 * the outer together, so a new streak invalidates both at once.
 *
 * @param {string} rawBase from `rawBaseUrl`
 * @param {string} name badge name, e.g. "streak"
 * @param {object} snapshot
 * @param {{style?: string}} [opts]
 * @returns {string}
 */
export function shieldsUrl(rawBase, name, snapshot, opts = {}) {
  const inner = `${String(rawBase).replace(/\/+$/, "")}/${SHIELDS_DIR}/${name}.json?v=${encodeURIComponent(cacheKey(snapshot))}`;
  let url = `https://img.shields.io/endpoint?url=${encodeURIComponent(inner)}`;
  if (SHIELDS_STYLES.includes(opts.style)) url += `&style=${opts.style}`;
  return url;
}
