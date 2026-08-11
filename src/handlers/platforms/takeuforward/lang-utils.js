/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Language resolution for takeuforward.
 *
 * The judge reports `languages_supported` as exactly
 * `["cpp", "java", "python", "javascript", "csharp", "go"]` — six, no more —
 * so this is a closed table rather than a guess. The aliases exist because the
 * submit request and the editor's own dropdown do not always spell them the
 * same way.
 */

/** @type {Record<string, {name: string, ext: string, slug: string}>} */
const LANGUAGES = {
  cpp: { name: "C++", ext: "cpp", slug: "cpp" },
  "c++": { name: "C++", ext: "cpp", slug: "cpp" },
  java: { name: "Java", ext: "java", slug: "java" },
  python: { name: "Python", ext: "py", slug: "python" },
  python3: { name: "Python", ext: "py", slug: "python" },
  javascript: { name: "JavaScript", ext: "js", slug: "javascript" },
  js: { name: "JavaScript", ext: "js", slug: "javascript" },
  node: { name: "JavaScript", ext: "js", slug: "javascript" },
  csharp: { name: "C#", ext: "cs", slug: "csharp" },
  "c#": { name: "C#", ext: "cs", slug: "csharp" },
  cs: { name: "C#", ext: "cs", slug: "csharp" },
  go: { name: "Go", ext: "go", slug: "go" },
  golang: { name: "Go", ext: "go", slug: "go" },
};

const UNKNOWN = { name: "unknown", ext: "txt", slug: "txt" };

/**
 * @param {string} raw whatever the page called the language
 * @returns {{name: string, ext: string, slug: string}}
 */
export function resolveLang(raw) {
  const text = String(raw || "")
    .trim()
    .toLowerCase();
  if (!text) return { ...UNKNOWN };

  // "Python 3" and "C++ 17" both name a language this table knows; take the
  // first token, then drop a trailing version number.
  const first = text.split(/\s+/)[0];
  const stripped = first.replace(/[0-9.]+$/, "");

  return { ...(LANGUAGES[first] || LANGUAGES[stripped] || LANGUAGES[text] || UNKNOWN) };
}

/** The six the judge accepts, for anything that needs to enumerate them. */
export const SUPPORTED = ["cpp", "java", "python", "javascript", "csharp", "go"];
