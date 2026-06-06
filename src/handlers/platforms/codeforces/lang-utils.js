/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Codeforces language utilities.
 *
 * The CF API (and DOM language selector) returns verbose strings like
 * "GNU G++17 7.3.0" or "Python 3.12.2". We match by prefix/keyword rather
 * than exact string so future compiler version bumps are handled automatically
 * without updating this file.
 *
 * Rating normalisation: CF uses 800-3500 numeric ratings, not Easy/Medium/Hard.
 * Community standard: ≤1200 Easy, 1201-1900 Medium, ≥1901 Hard.
 */

export function resolveLang(rawLang) {
  if (!rawLang) return { name: "unknown", ext: "txt", slug: "txt" };

  const l = rawLang.toLowerCase();
  let ext = "txt";

  if (/\bc\b/.test(l) && !/c\+\+|c#|csharp|cpp/.test(l)) ext = "c";
  else if (/c\+\+|cpp|g\+\+|clang\+\+|msvc/.test(l)) ext = "cpp";
  else if (/c#|csharp/.test(l)) ext = "cs";
  else if (/\bjava\b/.test(l) && !/javascript/.test(l)) ext = "java";
  else if (/kotlin/.test(l)) ext = "kt";
  else if (/scala/.test(l)) ext = "scala";
  else if (/python|pypy/.test(l)) ext = "py";
  else if (/javascript|node\.js|node js/.test(l)) ext = "js";
  else if (/typescript/.test(l)) ext = "ts";
  else if (/\bgo\b/.test(l)) ext = "go";
  else if (/rust/.test(l)) ext = "rs";
  else if (/ruby/.test(l)) ext = "rb";
  else if (/haskell/.test(l)) ext = "hs";
  else if (/ocaml/.test(l)) ext = "ml";
  else if (/\bf#/.test(l)) ext = "fs";
  else if (/pascal|delphi/.test(l)) ext = "pas";
  else if (/php/.test(l)) ext = "php";
  else if (/perl/.test(l)) ext = "pl";
  else if (/\bd\b/.test(l) && !/node|android/.test(l)) ext = "d";

  return { name: rawLang, ext, slug: ext };
}

/**
 * Convert a numeric CF problem rating to Easy / Medium / Hard.
 * Returns "Unknown" for unrated or non-numeric input.
 */
export function normalizeCFRating(rating) {
  if (rating === null || rating === undefined || isNaN(+rating)) return "Unknown";
  const r = +rating;
  if (r <= 1200) return "Easy";
  if (r <= 1900) return "Medium";
  return "Hard";
}
