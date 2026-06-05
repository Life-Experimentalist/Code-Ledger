/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Language slug / extension / verbose-name resolution for LeetCode submissions.
 */

const LANG_EXT = {
  python: "py",
  python3: "py",
  cpp: "cpp",
  "c++": "cpp",
  c: "c",
  java: "java",
  javascript: "js",
  js: "js",
  typescript: "ts",
  ts: "ts",
  ruby: "rb",
  golang: "go",
  go: "go",
  swift: "swift",
  kotlin: "kt",
  scala: "scala",
  rust: "rs",
  php: "php",
  csharp: "cs",
  "c#": "cs",
  dart: "dart",
  racket: "rkt",
  erlang: "erl",
  elixir: "ex",
  mysql: "sql",
  postgresql: "sql",
  bash: "sh",
};

const LANG_VERBOSE = {
  python: "Python",
  python3: "Python3",
  cpp: "C++",
  "c++": "C++",
  c: "C",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  typescript: "TypeScript",
  ts: "TypeScript",
  ruby: "Ruby",
  golang: "Go",
  go: "Go",
  swift: "Swift",
  kotlin: "Kotlin",
  scala: "Scala",
  rust: "Rust",
  php: "PHP",
  csharp: "C#",
  "c#": "C#",
  dart: "Dart",
  racket: "Racket",
  erlang: "Erlang",
  elixir: "Elixir",
  mysql: "MySQL",
  postgresql: "PostgreSQL",
  bash: "Bash",
};

export function langExt(name = "") {
  return LANG_EXT[name.toLowerCase().replace(/\s+/g, "")] || "txt";
}

export { LANG_VERBOSE };

/** Normalise submission.lang which can be a string slug OR an object { name, verboseName }. */
export function resolveLang(rawLang) {
  if (!rawLang) return { verbose: "Unknown", slug: "txt", ext: "txt" };
  if (typeof rawLang === "string") {
    const raw = rawLang.trim();
    const low = raw.toLowerCase();
    if (low.includes("pandas")) {
      return { verbose: "Pandas", slug: "pandas", ext: langExt("python") };
    }
    if (/python\s*3|python3/.test(low)) {
      return { verbose: "Python3", slug: "python3", ext: langExt("python3") };
    }
    if (low.includes("python")) {
      return { verbose: "Python", slug: "python", ext: langExt("python") };
    }
    const slug = low.replace(/\s+/g, "");
    return { verbose: LANG_VERBOSE[slug] || rawLang, slug, ext: langExt(slug) };
  }
  // Object form: { name, verboseName, langSlug }
  const rawName = (rawLang.name || rawLang.langSlug || "txt").toString();
  const lowName = rawName.toLowerCase();
  if (lowName.includes("pandas")) {
    return { verbose: "Pandas", slug: "pandas", ext: langExt("python") };
  }
  if (/python\s*3|python3/.test(lowName)) {
    return {
      verbose: rawLang.verboseName || "Python3",
      slug: "python3",
      ext: langExt("python3"),
    };
  }
  if (lowName.includes("python")) {
    return {
      verbose: rawLang.verboseName || "Python",
      slug: "python",
      ext: langExt("python"),
    };
  }
  const slug = lowName.replace(/\s+/g, "");
  const verbose =
    rawLang.verboseName || LANG_VERBOSE[slug] || rawLang.name || slug;
  return { verbose, slug, ext: langExt(slug) };
}
