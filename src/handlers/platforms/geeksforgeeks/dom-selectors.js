/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const SELECTORS = {
  version: '2025-04-24',
  lastVerified: '2025-04-24',

  page: {
    isProblemPage: '.problems-header, .problem-statement-container',
    isEditorPage: '#editor, .ace_editor',
  },

  problem: {
    title:       '.problems-header h3, .problem-title h3',
    difficulty:  '.difficulty-block .difficulty-tag, .problems-header .tag-item:first-child',
    tags:        '.tags-section .tag-item, .topic-tag',
    description: '.problem-statement, .problem-description',
    platformId:  null,
  },

  submission: {
    successIndicator: '.problems-submission-result.accepted, .success-container.accepted, [class*="accepted"][class*="submission"]',
    code:     '.ace_content .ace_text-layer, #editor .CodeMirror-code',
    language: '.language-dropdown .selected-option, select[name="language"]',
    runtime:  '.result-table tr:nth-child(2) td:last-child',
    memory:   '.result-table tr:nth-child(3) td:last-child',
  },

  qol: {
    editorContainer:  '#editor, .ace_editor',
    editorToolbar:    '.editor-toolbar, .editor-header',
    submitButton:     '.problems-submit-btn, button[type="submit"]',
    resultContainer:  '.result-container, .submission-result',
  },
};

export const LEGACY_SELECTORS = {
  'problem.title':                ['.problem-title', '.question-title', 'h1.header-title'],
  'submission.successIndicator':  ['.accepted-banner', '#result-accepted', '.submission-success'],
  'submission.code':              ['.CodeMirror-code', '.ace_text-layer', '#code-editor pre'],
};

export const DOMAINS = ['geeksforgeeks.org', 'practice.geeksforgeeks.org', 'www.geeksforgeeks.org'];
