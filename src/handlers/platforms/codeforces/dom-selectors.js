/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Codeforces DOM selectors — verified 2026-05-21.
 *
 * CF uses server-rendered HTML with stable (non-hashed) class names.
 * The `submissionverdict` attribute on <span> is the canonical way to
 * detect accepted submissions — do not rely on display text, which CF
 * sometimes replaces with seasonal messages (e.g. "Happy New Year!").
 */

export const SELECTORS = {
  version: "2026-05-21",

  page: {
    isProblemPage: ".problem-statement",
  },

  problem: {
    title: ".problem-statement .header .title",
    description: ".problem-statement",
    timeLimit: ".problem-statement .header .time-limit",
    memoryLimit: ".problem-statement .header .memory-limit",
    // Tags include the numeric rating tag — filter in JS by /^\d+$/ pattern
    tags: ".roundbox .tag-box, .problemTags .tag-box",
  },

  submission: {
    // Machine-readable accepted indicator — preferred over text matching
    acceptedVerdict: 'span[submissionverdict="OK"]',
    // Any terminal verdict cell (OK, WA, TLE, RE …)
    submissionRow: "tr[data-submission-id]",
    verdictCell: ".status-verdict-cell",
    verdictSpan: ".status-verdict-cell span[submissionverdict]",
    // Code on /contest/{id}/submission/{id} detail page
    code: "#program-source-text",
    // Submit-form editor textarea (on problem page)
    editor: "#editor",
    // Multiple submit button variants across CF page types
    submitButton: [
      "#singlePageSubmitButton",
      '.submit-form button[type="submit"]',
      'form.submit-form input[type="submit"]',
      ".submitButton",
      '[data-statement-name] + .source-code-section button[type="submit"]',
    ].join(", "),
    languageSelector: '#programTypeForTesting, select[name="programTypeId"]',
  },

  // Test/run result output (visible after judging)
  result: {
    testOutput: ".test-output pre, .wrong-answer pre, .runtime-error pre",
    consoleOutput: ".error pre, .roundbox pre",
    verdictWrapper: ".submissionVerdictWrapper",
  },

  qol: {
    editorContainer: "#editor",
  },

  profile: {
    handle: ".main-info .user-name",
  },
};

export const DOMAINS = ["codeforces.com"];
