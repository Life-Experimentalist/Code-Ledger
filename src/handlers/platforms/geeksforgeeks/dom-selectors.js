/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const SELECTORS = {
  version: "2026-04-28",
  lastVerified: "2026-04-28",

  page: {
    isProblemPage: '[class^="problems_header"], .problem-statement-container, .problems-header',
  },

  problem: {
    // GFG's CSS modules use obfuscated class prefixes — match by prefix
    title:       '[class^="problems_header_content__title"] h3, .problems-header h3, .problem-title h3',
    difficulty:  '[class^="problems_header_description"] [class*="difficulty"], .difficulty-block .difficulty-tag',
    tags:        '[class*="problems_tag_container"] [class*="tag"], .topic-tag',
    description: '[class^="problems_problem_content"], .problem-statement, .problem-description',
    platformId:  null,
  },

  submission: {
    // "Problem Solved Successfully" banner
    successIndicator: '[class^="problems_content"] [class*="accepted"], [class*="submission-success"], .problems-submission-result.accepted',
    // Code editor — CodeMirror or Ace
    code:     '.CodeMirror-code, .ace_content .ace_text-layer, #editor .CodeMirror-code',
    language: '.divider.text, [class*="language"] [class*="selected"], select[name="language"] option:checked, [class*="selectedLang"]',
    runtime:  '.result-table tr:nth-child(2) td:last-child',
    memory:   '.result-table tr:nth-child(3) td:last-child',
  },

  qol: {
    editorContainer: '#editor, .ace_editor, .CodeMirror',
    submitButton:    '[class^="ui button problems_submit_button"], .problems-submit-btn, button[type="submit"]',
    resultContainer: '[class^="problems_content"], .result-container',
  },
};

export const LEGACY_SELECTORS = {
  "problem.title": [".problem-title", ".question-title", "h1.header-title", "h3.problem-title"],
  "submission.successIndicator": [
    ".accepted-banner",
    "#result-accepted",
    ".submission-success",
    '[class*="correct-answer"]',
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
