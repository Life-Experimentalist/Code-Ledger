/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Default review prompt templates, keyed by platform slug. */
export const PROMPT_PLACEHOLDERS = Object.freeze({
  leetcode: `Review this {difficulty} {language} solution for LeetCode problem '{title}'.

Provide:
1. Time complexity (Big-O) and space complexity
2. Correctness — any edge cases that could fail?
3. One concrete optimisation if applicable
4. Key algorithmic pattern used

Be concise. Max 200 words.`,

  geeksforgeeks: `Review this {difficulty} {language} solution for GeeksForGeeks problem '{title}'.

Provide:
1. Time complexity (Big-O) and space complexity
2. Correctness — any edge cases that could fail?
3. One concrete optimisation if applicable
4. Key algorithmic pattern used

Be concise. Max 200 words.`,

  codeforces: `Review this {language} competitive programming solution for '{title}'.

Provide:
1. Time complexity (Big-O) and space complexity
2. Will it pass within typical CP constraints (10^8 ops/s)?
3. Potential TLE or MLE risks?
4. One optimisation if applicable

Be concise. Max 200 words.`,

  default: `Review this {difficulty} {language} solution for '{title}'.

Provide:
1. Time complexity (Big-O) and space complexity
2. Correctness — any edge cases that could fail?
3. One concrete optimisation if applicable

Be concise. Max 200 words.`,
});

/** Returns a shallow copy of the default prompts. */
export function getDefaultAIPrompts() {
  return { ...PROMPT_PLACEHOLDERS };
}

/**
 * Merges raw stored prompts with defaults — ensures all platform keys always exist.
 * @param {Record<string,string>|null|undefined} raw
 * @returns {Record<string, string>}
 */
export function normalizeAIPrompts(raw) {
  const defaults = getDefaultAIPrompts();
  if (!raw || typeof raw !== "object") return defaults;
  const out = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (raw[key] && typeof raw[key] === "string" && raw[key].trim()) {
      out[key] = raw[key];
    }
  }
  return out;
}

/**
 * Fills {placeholder} tokens in a prompt template.
 * @param {string} template
 * @param {{ title?: string, difficulty?: string, language?: string, lang?: {name?:string} }} ctx
 * @returns {string}
 */
export function fillPromptTemplate(template, ctx = {}) {
  return template
    .replace(/\{title\}/g, ctx.title || "Unknown Problem")
    .replace(/\{difficulty\}/g, ctx.difficulty || "Unknown")
    .replace(/\{language\}/g, ctx.language || ctx.lang?.name || "Unknown");
}
