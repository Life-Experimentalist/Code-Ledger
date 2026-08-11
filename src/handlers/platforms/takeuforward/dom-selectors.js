/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * takeuforward DOM selectors.
 *
 * Two groups, and they are not equally trustworthy:
 *
 *   `sheet` — read off the live A2Z sheet on 2026-08-12. The page renders a
 *     real <table>, one <tr> per problem, so the anchors below are stable
 *     structural facts rather than class names that a redesign will churn.
 *     Anchoring on hrefs is deliberate: the classes are Tailwind soup.
 *
 *   `problem` — the TUF+ editor, which is behind the subscription and could
 *     not be loaded. These are a *fallback only*: every value the handler
 *     needs (source, language, verdict, title, difficulty, tags) comes from
 *     the tapped API instead, and the handler commits without ever consulting
 *     this group. They exist so a title can be recovered if the metadata call
 *     is missed, and nothing depends on them being right.
 */

export const SELECTORS = {
  version: "2026-08-12",

  sheet: {
    // The sheet is one table per section; rows appear as accordions expand.
    table: "table",
    row: "tr",
    // A row's identity. The TUF+ link is present on every row; the LeetCode
    // link is present on most and is what lets a row match a solve that
    // happened on LeetCode rather than here.
    tufLink: 'a[href*="/plus/dsa/problems/"]',
    leetcodeLink: 'a[href*="leetcode.com/problems/"]',
  },

  problem: {
    // Unverified — see the file header.
    title: "h1",
    editor: ".monaco-editor",
    editorLines: ".view-lines",
    submitButton: 'button[type="submit"]',
  },
};

export const LEGACY_SELECTORS = {
  sheet: {
    // Before the table rewrite the rows were divs with a grid layout. Same
    // anchoring strategy, different element to walk up to.
    row: '[class*="grid"]',
  },
};

export const DOMAINS = ["takeuforward.org"];
