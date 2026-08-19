/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Guard tests for the repository-homepage sync.
 *
 * Onboarding writes the repo homepage once, with the Pages address GitHub
 * reported at creation time. When the user later puts a custom domain on the
 * site, GitHub updates the Pages `html_url` but never the homepage, so the
 * repo's public "About" link keeps pointing at the retired
 * `{owner}.github.io` address. `homepageNeedsSync` decides when the daily
 * Pages-URL recheck may rewrite that homepage — and, critically, when it must
 * not: a homepage the user typed themselves is never touched.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { homepageNeedsSync } from "../src/handlers/git/github/infra-builder.js";

const OWNER = "octocat";
const REPO = "my-dsa-life";
const GENERIC = `https://${OWNER}.github.io/${REPO}/`;
const CUSTOM = "https://dsa.example.com/";

describe("homepageNeedsSync", () => {
  test("generic Pages homepage is replaced when a custom domain appears", () => {
    assert.equal(homepageNeedsSync(GENERIC, CUSTOM, GENERIC, OWNER, REPO), true);
  });

  test("generic homepage is replaced even when settings never stored a URL", () => {
    assert.equal(homepageNeedsSync(GENERIC, CUSTOM, "", OWNER, REPO), true);
  });

  test("owner-root github.io address also counts as generic", () => {
    const root = `https://${OWNER}.github.io`;
    assert.equal(homepageNeedsSync(root, CUSTOM, "", OWNER, REPO), true);
  });

  test("empty homepage is filled in", () => {
    assert.equal(homepageNeedsSync("", CUSTOM, "", OWNER, REPO), true);
  });

  test("homepage matching the previously stored URL is treated as ours", () => {
    assert.equal(homepageNeedsSync(CUSTOM, "https://new.example.com/", CUSTOM, OWNER, REPO), true);
  });

  test("a user-authored homepage is never touched", () => {
    assert.equal(homepageNeedsSync("https://my-portfolio.dev", CUSTOM, GENERIC, OWNER, REPO), false);
  });

  test("another user's github.io address is not ours", () => {
    assert.equal(
      homepageNeedsSync("https://someoneelse.github.io/other/", CUSTOM, "", OWNER, REPO),
      false,
    );
  });

  test("already in sync — trailing slash and case do not force a write", () => {
    assert.equal(
      homepageNeedsSync("https://DSA.example.com", CUSTOM, GENERIC, OWNER, REPO),
      false,
    );
  });

  test("Pages disabled clears a homepage CodeLedger wrote", () => {
    assert.equal(homepageNeedsSync(GENERIC, "", GENERIC, OWNER, REPO), true);
  });

  test("Pages disabled leaves a user homepage alone", () => {
    assert.equal(homepageNeedsSync("https://my-portfolio.dev", "", GENERIC, OWNER, REPO), false);
  });

  test("both empty is a no-op", () => {
    assert.equal(homepageNeedsSync("", "", "", OWNER, REPO), false);
  });

  test("a dot in the repo name does not widen the generic match", () => {
    // "my.dsa" must not match "myxdsa" via an unescaped dot.
    assert.equal(
      homepageNeedsSync(`https://${OWNER}.github.io/myxdsa/`, CUSTOM, "", OWNER, "my.dsa"),
      false,
    );
  });
});
