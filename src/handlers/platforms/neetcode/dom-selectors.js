/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NeetCode DOM selectors — read off the live page 2026-08-12.
 *
 * NeetCode is Angular with hand-written class names, not a utility-class or
 * CSS-modules build, so these are stable in a way LeetCode's hashed classes
 * are not. They still only carry the parts the API cannot give us: the code
 * being edited, the language, and the fallback statement.
 *
 * The verdict is deliberately NOT in here. It arrives in the judge's JSON
 * response and is read from `api.js`; scraping a result banner would mean
 * matching display text, which is exactly the thing that breaks first.
 */

export const SELECTORS = {
  version: "2026-08-12",

  page: {
    // Present on every /problems/* route, on all five tabs.
    isProblemPage: ".editor-console, button.submit-btn",
  },

  problem: {
    title: "h1.problem-title",
    // The pill carries the level as a second class: easy | medium | hard.
    difficultyPill: ".difficulty-pill",
    // Rendered statement. `.neeter-article-content` is the same node.
    description: ".my-article-component-container",
    // Both topic tags and company tags use this container class; the topics
    // one comes first. Company tags are counted ("Google7") and are not
    // problem tags, so only the first container is read.
    tagsContainer: ".company-tags-container",
    tagLink: "a.company-tag-reveal-btn",
  },

  editor: {
    // Monaco. Its text is only reachable through the model, so the submitted
    // source comes from the tapped request body instead — this is a fallback.
    monaco: ".monaco-editor",
    monacoLines: ".view-lines",
    // A button, not a <select>; its text is the language name ("Python").
    languageButton: "button.editor-language-btn",
    submitButton: "button.submit-btn",
    runButton: "#run-button",
  },

  console: {
    root: ".editor-console",
    content: ".console-content",
  },
};

export const LEGACY_SELECTORS = {
  problem: {
    // Pre-2026 markup used a bare heading and an unprefixed article wrapper.
    title: ".problem-title, h1",
    description: ".neeter-article-content",
  },
};

export const DOMAINS = ["neetcode.io"];
