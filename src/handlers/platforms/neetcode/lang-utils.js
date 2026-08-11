/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NeetCode language mapping.
 *
 * NeetCode's judge offers exactly ten languages (verified 2026-08-12), so this
 * is an exact table rather than the keyword matching Codeforces needs — there
 * no list exists and compiler names change every year. The aliases cover both
 * what the language button displays ("C++") and what the submit request
 * carries ("cpp"), because the two disagree and either can be the only one
 * available depending on how the solve was detected.
 */

/** @type {Record<string, {name: string, ext: string, slug: string}>} */
const LANGS = {
  python: { name: "Python3", ext: "py", slug: "python3" },
  python3: { name: "Python3", ext: "py", slug: "python3" },
  java: { name: "Java", ext: "java", slug: "java" },
  cpp: { name: "C++", ext: "cpp", slug: "cpp" },
  "c++": { name: "C++", ext: "cpp", slug: "cpp" },
  javascript: { name: "JavaScript", ext: "js", slug: "javascript" },
  js: { name: "JavaScript", ext: "js", slug: "javascript" },
  node: { name: "JavaScript", ext: "js", slug: "javascript" },
  typescript: { name: "TypeScript", ext: "ts", slug: "typescript" },
  ts: { name: "TypeScript", ext: "ts", slug: "typescript" },
  csharp: { name: "C#", ext: "cs", slug: "csharp" },
  "c#": { name: "C#", ext: "cs", slug: "csharp" },
  cs: { name: "C#", ext: "cs", slug: "csharp" },
  go: { name: "Go", ext: "go", slug: "golang" },
  golang: { name: "Go", ext: "go", slug: "golang" },
  kotlin: { name: "Kotlin", ext: "kt", slug: "kotlin" },
  kt: { name: "Kotlin", ext: "kt", slug: "kotlin" },
  swift: { name: "Swift", ext: "swift", slug: "swift" },
  rust: { name: "Rust", ext: "rs", slug: "rust" },
  rs: { name: "Rust", ext: "rs", slug: "rust" },
};

const UNKNOWN = { name: "unknown", ext: "txt", slug: "txt" };

/**
 * @param {string} raw language button text or the request's `lang` field
 * @returns {{name: string, ext: string, slug: string}}
 */
export function resolveLang(raw) {
  if (!raw) return { ...UNKNOWN };

  // The dropdown renders "Python Python 3.14.2"; the button renders "Python".
  // Take the first word-ish token and drop any trailing version number.
  const cleaned = String(raw)
    .trim()
    .toLowerCase()
    .split(/\s+/)[0]
    .replace(/[0-9.]+$/, "");

  return { ...(LANGS[cleaned] || LANGS[String(raw).trim().toLowerCase()] || UNKNOWN) };
}
