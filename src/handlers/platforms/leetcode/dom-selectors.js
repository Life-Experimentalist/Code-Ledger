/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const SELECTORS = {
  version: '2025-04-24',
  
  page: {
    isProblemPage: '[data-cy="question-title"]',
  },

  problem: {
    title:       '[data-cy="question-title"]',
    difficulty:  'div[diff]',
    tags:        '.topic-tag__1sjS',
    description: '.question-content__JfgR',
  },

  submission: {
    successIndicator: '.success__3Ai7, .accepted__270Q, [data-cy="submission-result"]',
    code:     '.monaco-editor', 
    language: 'button[data-cy="lang-select"]',
  },

  qol: {
    editorContainer:  '.monaco-editor',
    submitButton:     'button[data-cy="submit-code-btn"]',
  }
};

export const LEGACY_SELECTORS = {
  'problem.title': ['.question-title', 'h1'],
  'submission.successIndicator': ['.accepted', '.result-status-accepted'],
};

export const DOMAINS = ['leetcode.com'];
