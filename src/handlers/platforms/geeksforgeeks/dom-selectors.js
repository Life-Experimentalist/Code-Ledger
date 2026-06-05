/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const SELECTORS = {
  version: "2026-05-21",
  lastVerified: "2026-05-21",

  page: {
    isProblemPage:
      '[class^="problems_header"], .problem-statement-container, .problems-header',
  },

  problem: {
    // CSS-module prefixed class — match by prefix
    title:
      '[class^="problems_header_content__title"] h3, .problems-header h3, .problem-title h3',
    difficulty:
      '[class^="problems_header_description"] > :first-child, .difficulty-block .difficulty-tag, [class*="difficulty"]',
    tags: '[class*="problems_tag_container"] [class*="tag"], .topic-tag, [class*="tag_container"] a',
    description:
      '[class^="problems_problem_content"], .problem-statement, .problem-description',
    platformId: null,
  },

  submission: {
    // "Problem Solved Successfully" banner — multiple fallback patterns
    successIndicator:
      '[class^="problems_content"] [class*="accepted"],' +
      '[class*="submission-success"],' +
      ".problems-submission-result.accepted," +
      '[class*="correct"]',
    // Ace editor (primary) — script injection reads window.ace
    aceEditorId: "ace-editor",
    // Fallback: CodeMirror (older GFG pages)
    codeMirrorCode: ".CodeMirror-code",
    // Language selector
    language:
      '.divider.text, [class*="selectedLang"], [class*="language"] [class*="selected"], select[name="language"] option:checked',
    runtime: ".result-table tr:nth-child(2) td:last-child",
    memory: ".result-table tr:nth-child(3) td:last-child",
  },

  qol: {
    editorContainer: "#editor, .ace_editor, .CodeMirror",
    submitButton:
      '[class^="ui button problems_submit_button"], .problems-submit-btn, button[type="submit"][class*="submit"]',
    resultContainer: '[class^="problems_content"], .result-container',
    toolbar:
      '.ace_toolbar, [class*="editor_header"], [class*="problems_editor"] [class*="header"]',
  },

  profile: {
    nextData: "#__NEXT_DATA__",
    header: '[class*="profile_head"], [class*="userHandle"], h1',
  },
};

export const LEGACY_SELECTORS = {
  "problem.title": [
    ".problem-title",
    ".question-title",
    "h1.header-title",
    "h3.problem-title",
  ],
  "submission.successIndicator": [
    ".accepted-banner",
    "#result-accepted",
    ".submission-success",
    '[class*="correct-answer"]',
    '[class*="solved"]',
  ],
  "submission.code": [
    ".CodeMirror-line",
    ".ace_line",
    ".ace_text-layer",
    "#code-editor pre",
  ],
};

export const DOMAINS = [
  "geeksforgeeks.org",
  "practice.geeksforgeeks.org",
  "www.geeksforgeeks.org",
];
