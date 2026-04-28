/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const SELECTORS = {
  version: '2025-04-28',

  page: {
    // LeetCode 2025: problem title lives in an anchor inside the title area
    isProblemPage: '[data-track-load="description_content"], [data-e2e-locator="question-title"]',
  },

  problem: {
    title:       '[data-e2e-locator="question-title"], [data-cy="question-title"], h1',
    difficulty:  '[data-e2e-locator="question-difficulty"], div[diff]',
    tags:        'a[href*="/tag/"]',
    description: '[data-track-load="description_content"]',
  },

  submission: {
    // Modern LeetCode (2024+) shows the result in a panel; class names are hashed
    // so we match structural data attributes first, then fall back to text-content search
    // (the text-content check is done in JS in _checkSubmission).
    successIndicator: [
      '[data-e2e-locator="submission-result"]',
      '[data-e2e-locator="console-result"]',
      // Tailwind utility classes LeetCode currently uses for "Accepted" in green
      '.text-green-s',
      'span[class*="text-green"]',
      // Broader class-name fragments — caught by text-content guard in JS
      '[class*="accepted"]',
      '[class*="Accepted"]',
    ].join(', '),
    code:     '.monaco-editor',
    language: '[id*="headlessui-listbox-button"], button[aria-haspopup="listbox"]',
  },

  qol: {
    // The Monaco editor container — stable across LeetCode rebuilds
    editorContainer:  '.monaco-editor',
    // Submit button — LeetCode 2025 uses data-e2e-locator
    submitButton:     '[data-e2e-locator="console-submit-button"], button[data-cy="submit-code-btn"]',
  },
};

export const LEGACY_SELECTORS = {
  'problem.title': ['.question-title', 'h1'],
  'submission.successIndicator': ['.accepted', '.result-status-accepted'],
};

export const DOMAINS = ['leetcode.com'];
