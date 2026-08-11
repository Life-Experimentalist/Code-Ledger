/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { shareSummary, shareLink, shareTargets, cardFilename } from "../src/core/share-streak.js";

const SNAP = {
  currentStreak: 12,
  longestStreak: 30,
  totalPoints: 1240,
  totalSolves: 86,
  today: "2026-08-11",
};

describe("shareSummary", () => {
  test("leads with the streak when there is one", () => {
    const text = shareSummary(SNAP);
    assert.match(text, /12 days/);
    assert.match(text, /1240 points/);
    assert.match(text, /86 solutions/);
  });

  test("says day, not days, on the first one", () => {
    assert.match(shareSummary({ ...SNAP, currentStreak: 1 }), /1 day in a row/);
  });

  test("a broken streak talks about the work instead", () => {
    // "0-day streak" reads as a bug rather than a starting point, and nobody
    // wants to post it.
    const text = shareSummary({ ...SNAP, currentStreak: 0 });
    assert.ok(!text.includes("0 days"));
    assert.match(text, /86 DSA solutions/);
  });

  test("a fresh install has something to say too", () => {
    const text = shareSummary({});
    assert.ok(!/\b0\b/.test(text));
    assert.match(text, /Starting a DSA ledger/);
  });
});

describe("shareLink", () => {
  test("prefers the pages site", () => {
    assert.equal(
      shareLink({
        github_pages_url: "https://octocat.github.io/ledger/",
        github_owner: "octocat",
        github_repo: "ledger",
      }),
      "https://octocat.github.io/ledger/",
    );
  });

  test("falls back to the repository", () => {
    assert.equal(
      shareLink({ github_owner: "octocat", github_repo: "ledger" }),
      "https://github.com/octocat/ledger",
    );
  });

  test("reads the legacy repo key", () => {
    assert.equal(
      shareLink({ github_owner: "octocat", gitRepo: "ledger" }),
      "https://github.com/octocat/ledger",
    );
  });

  test("a private repository offers no link at all", () => {
    // Its URL is a 404 to everyone reading the post.
    assert.equal(
      shareLink({
        github_repo_private: true,
        github_pages_url: "https://octocat.github.io/ledger/",
        github_owner: "octocat",
        github_repo: "ledger",
      }),
      "",
    );
  });

  test("nothing configured yet is not an error", () => {
    assert.equal(shareLink({}), "");
    assert.equal(shareLink(), "");
  });

  test("a non-https pages value is ignored rather than embedded", () => {
    assert.equal(shareLink({ github_pages_url: "javascript:alert(1)" }), "");
  });
});

describe("shareTargets", () => {
  test("every href is a plain https link to the site's own composer", () => {
    for (const t of shareTargets("hello", "https://example.com/x")) {
      assert.match(t.href, /^https:\/\/(x\.com|www\.linkedin\.com|www\.reddit\.com)\//);
    }
  });

  test("the text is carried url-encoded", () => {
    const [x] = shareTargets("12 days & counting", "https://example.com/x");
    assert.match(x.href, /text=12%20days%20%26%20counting/);
    assert.match(x.href, /url=https%3A%2F%2Fexample\.com%2Fx/);
  });

  test("LinkedIn is offered only when there is a link to give it", () => {
    // Its endpoint takes a URL and nothing else, so with no link it would open
    // an empty composer — which looks like the button is broken.
    const ids = (url) => shareTargets("hi", url).map((t) => t.id);
    assert.deepEqual(ids("https://example.com/x"), ["x", "linkedin", "reddit"]);
    assert.deepEqual(ids(""), ["x", "reddit"]);
  });

  test("Reddit posts a link when there is one and text when there is not", () => {
    const withUrl = shareTargets("hi", "https://example.com/x").find((t) => t.id === "reddit");
    assert.match(withUrl.href, /&url=/);
    const without = shareTargets("hi").find((t) => t.id === "reddit");
    assert.ok(!without.href.includes("&url="));
    assert.match(without.href, /&text=hi/);
  });
});

describe("cardFilename", () => {
  test("carries the day so two downloads do not collide", () => {
    assert.equal(cardFilename(SNAP), "codeledger-2026-08-11.png");
  });

  test("a missing or malformed day still produces a usable name", () => {
    assert.equal(cardFilename({}), "codeledger-streak.png");
    assert.equal(cardFilename({ today: "../../etc/passwd" }), "codeledger-streak.png");
  });
});
