/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const SELECTORS = {
  version: '2025-04-24',

  page: {
    isProblemPage: '.problem-statement',
  },

  problem: {
    title:       '.title',
    description: '.problem-statement',
    tags:        '.tag-box',
  },

  submission: {
    successIndicator: '.verdict-accepted',
    code:     '#program-source-text',
    language: '.source-and-history .language',
    runtime:  '.time-consumed',
    memory:   '.memory-consumed',
  },

  qol: {
    editorContainer:  '#editor',
  },
};

export const DOMAINS = ['codeforces.com'];
