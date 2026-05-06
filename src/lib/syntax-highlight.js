/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Minimal regex-based syntax highlighter for common DSA languages.
 * No external dependencies — works inside the extension's strict CSP.
 * Colors use inline styles (no CSS class dependencies).
 */

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Keyword sets per language
const KEYWORDS = {
  python: new Set([
    "def","class","if","elif","else","for","while","return","import","from","as",
    "with","try","except","finally","raise","pass","break","continue","and","or",
    "not","in","is","None","True","False","lambda","yield","async","await",
    "global","nonlocal","del","assert","print","len","range","int","str","list",
    "dict","set","tuple","bool","float","type","self","super",
  ]),
  javascript: new Set([
    "const","let","var","function","class","if","else","for","while","return",
    "import","export","from","as","async","await","try","catch","finally","throw",
    "new","delete","typeof","instanceof","this","null","undefined","true","false",
    "break","continue","switch","case","default","of","in","do","void","yield",
    "static","get","set","extends","super","debugger",
  ]),
  typescript: new Set([
    "const","let","var","function","class","interface","type","enum","if","else",
    "for","while","return","import","export","from","as","async","await","try",
    "catch","finally","throw","new","delete","typeof","instanceof","this","null",
    "undefined","true","false","break","continue","switch","case","default","of",
    "in","do","void","static","get","set","extends","implements","super",
    "public","private","protected","readonly","abstract","override","namespace",
    "declare","keyof","infer","never","any","unknown","string","number","boolean",
  ]),
  java: new Set([
    "public","private","protected","class","interface","extends","implements","new",
    "return","if","else","for","while","do","switch","case","default","break",
    "continue","try","catch","finally","throw","throws","static","final","abstract",
    "void","int","long","double","float","boolean","char","byte","short","null",
    "true","false","import","package","this","super","instanceof","synchronized",
    "volatile","transient","native","strictfp","enum","record","sealed","permits",
    "String","Integer","List","Map","Set","ArrayList","HashMap",
  ]),
  cpp: new Set([
    "int","long","short","char","double","float","bool","void","string","auto",
    "const","static","class","struct","public","private","protected","if","else",
    "for","while","do","switch","case","default","break","continue","return","new",
    "delete","nullptr","true","false","template","typename","namespace","using",
    "include","define","ifdef","ifndef","endif","try","catch","throw","virtual",
    "override","final","inline","extern","register","union","enum","typedef",
    "size_t","vector","map","set","pair","queue","stack","deque","unordered_map",
  ]),
  c: new Set([
    "int","long","short","char","double","float","void","if","else","for","while",
    "do","switch","case","default","break","continue","return","struct","typedef",
    "const","static","extern","unsigned","signed","volatile","register","union",
    "enum","include","define","ifdef","ifndef","endif","NULL","malloc","free",
    "printf","scanf","sizeof",
  ]),
  go: new Set([
    "func","var","const","type","struct","interface","if","else","for","range",
    "return","import","package","go","chan","select","defer","break","continue",
    "switch","case","default","goto","nil","true","false","make","new","len","cap",
    "append","copy","delete","close","panic","recover","map","string","int","int64",
    "int32","float64","bool","byte","rune","error","any",
  ]),
  rust: new Set([
    "fn","let","mut","const","static","struct","enum","impl","trait","for","while",
    "loop","if","else","match","return","use","mod","pub","priv","crate","super",
    "self","Self","true","false","None","Some","Ok","Err","Box","Vec","String",
    "str","i32","i64","u32","u64","f32","f64","bool","char","usize","isize",
    "async","await","move","where","type","dyn","ref","in","as","unsafe","extern",
  ]),
  kotlin: new Set([
    "fun","var","val","class","object","interface","if","else","for","while","do",
    "return","when","is","as","in","out","null","true","false","import","package",
    "this","super","override","abstract","open","final","sealed","data","companion",
    "init","constructor","by","with","let","run","apply","also","get","set","it",
    "inline","reified","suspend","coroutine","launch","async","await","String",
    "Int","Long","Double","Float","Boolean","List","Map","Set","MutableList",
  ]),
  swift: new Set([
    "func","var","let","class","struct","enum","protocol","if","else","for","while",
    "return","switch","case","default","break","continue","guard","defer","import",
    "as","is","nil","true","false","self","super","init","deinit","override",
    "final","static","mutating","lazy","optional","weak","unowned","inout","throws",
    "try","catch","throw","async","await","actor","some","any","where","in",
    "String","Int","Double","Float","Bool","Array","Dictionary","Set","Optional",
  ]),
};

const LANG_ALIASES = {
  js: "javascript", ts: "typescript", py: "python", cc: "cpp", "c++": "cpp",
  kt: "kotlin", rs: "rust",
};

// Colors matching the dark theme (inline styles — no CSS class dependencies)
const C_KEYWORD  = "color:#93c5fd;font-weight:600";   // blue-300
const C_STRING   = "color:#86efac";                    // green-300
const C_COMMENT  = "color:#6b7280;font-style:italic";  // gray-500
const C_NUMBER   = "color:#fbbf24";                    // amber-400
const C_TYPE     = "color:#c084fc";                    // purple-400
const C_BUILTIN  = "color:#67e8f9";                    // cyan-300

/**
 * Strip invisible whitespace visualization characters that some code editors
 * (e.g. Monaco) inject into copied/extracted text.
 *   U+00B7  MIDDLE DOT  (·)   used as visible-space indicator
 *   U+200C  ZERO WIDTH NON-JOINER (‌)  used alongside U+00B7
 */
export function cleanCode(code) {
  if (!code) return code;
  // Replace middle-dot + ZWNJ (the pair editors inject for visible spaces)
  return code
    .replace(/·‌/g, " ")
    .replace(/‌·/g, " ")
    .replace(/‌/g, "")   // standalone ZWNJ
    .replace(/·(?=\s|\n|$)/g, " "); // standalone middle-dot at word boundaries
}

/**
 * Apply syntax highlighting to a code string.
 * Returns an HTML string with inline-styled spans.
 * @param {string} code  The source code (plain text, not yet HTML-escaped)
 * @param {string} lang  Language identifier (e.g. "python", "cpp", "js")
 * @returns {string}     HTML string safe to set as innerHTML of a <pre>/<code>
 */
export function highlightCode(code, lang = "") {
  const cleaned = cleanCode(code || "");
  const normLang = LANG_ALIASES[lang.toLowerCase()] || lang.toLowerCase();
  const kws = KEYWORDS[normLang];

  if (!kws) {
    // Unknown language — just escape HTML and return
    return escHtml(cleaned);
  }

  // Tokenizer regex — order matters: longer/more-specific patterns first
  let commentRe;
  if (normLang === "python") {
    commentRe = /#[^\n]*/;
  } else {
    commentRe = /\/\/[^\n]*|\/\*[\s\S]*?\*\//;
  }

  const tokenRe = new RegExp(
    `(${commentRe.source})` +                          // comments
    `|("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'` + // double/single-quoted strings
    `|\`(?:[^\`\\\\]|\\\\.)*\`)` +                     // template literals
    `|(\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?[uUlLfF]*\\b)` + // numbers
    `|([A-Za-z_$][A-Za-z0-9_$]*)` +                   // identifiers/keywords
    `|(\\s+|\\S)`,                                      // whitespace + other chars
    "g",
  );

  let result = "";
  let match;
  tokenRe.lastIndex = 0;

  while ((match = tokenRe.exec(cleaned)) !== null) {
    const [, comment, str, num, word, rest] = match;

    if (comment !== undefined) {
      result += `<span style="${C_COMMENT}">${escHtml(comment)}</span>`;
    } else if (str !== undefined) {
      result += `<span style="${C_STRING}">${escHtml(str)}</span>`;
    } else if (num !== undefined) {
      result += `<span style="${C_NUMBER}">${escHtml(num)}</span>`;
    } else if (word !== undefined) {
      if (kws.has(word)) {
        result += `<span style="${C_KEYWORD}">${escHtml(word)}</span>`;
      } else if (/^[A-Z][A-Za-z0-9_]*$/.test(word)) {
        // PascalCase identifiers → type color
        result += `<span style="${C_TYPE}">${escHtml(word)}</span>`;
      } else {
        result += escHtml(word);
      }
    } else if (rest !== undefined) {
      result += escHtml(rest);
    }
  }

  return result;
}
