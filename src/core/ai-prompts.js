/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AI prompt utilities — no hardcoded platform prompts here.
 * Platform handlers register their own templates via registerPlatformPrompt().
 * This keeps the core agnostic and lets new platforms be added as plugins.
 */

/** Fallback template used when no platform-specific template is registered. */
export const DEFAULT_PROMPT_TEMPLATE = `Review this {difficulty} {language} solution for '{title}'.

Provide:
1. Time complexity (Big-O) and space complexity
2. Correctness — any edge cases that could fail?
3. One concrete optimisation if applicable

Be concise. Max 200 words.`;

/**
 * Mutable registry of platform-specific prompt templates.
 * Populated by platform handlers calling registerPlatformPrompt().
 */
const _platformPrompts = {
  default: DEFAULT_PROMPT_TEMPLATE,
};

/**
 * Called by platform handlers to register their default review prompt.
 * Safe to call multiple times — later call wins.
 * @param {string} platformId  e.g. "leetcode"
 * @param {string} template    Prompt string with {title}/{difficulty}/{language} tokens
 */
export function registerPlatformPrompt(platformId, template) {
  if (platformId && typeof template === "string" && template.trim()) {
    _platformPrompts[platformId] = template;
  }
}

/**
 * Returns a snapshot of all currently-registered default prompts.
 * Guaranteed to include at least { default }.
 * @returns {Record<string, string>}
 */
export function getDefaultAIPrompts() {
  return { ..._platformPrompts };
}

/**
 * Returns the registered platform IDs (excluding "default").
 * Useful for building the prompts UI without importing each handler.
 * @returns {string[]}
 */
export function getRegisteredPlatforms() {
  return Object.keys(_platformPrompts).filter((k) => k !== "default");
}

/**
 * Merges raw stored prompts with defaults — ensures all registered platform
 * keys are always present. Skips unknown/blank entries.
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
 * @param {{ title?: string, difficulty?: string, language?: string, lang?: {name?: string}, platform?: string }} ctx
 * @returns {string}
 */
export function fillPromptTemplate(template, ctx = {}) {
  return template
    .replace(/\{title\}/g, ctx.title || "Unknown Problem")
    .replace(/\{difficulty\}/g, ctx.difficulty || "Unknown")
    .replace(/\{language\}/g, ctx.language || ctx.lang?.name || "Unknown")
    .replace(/\{platform\}/g, ctx.platform || "Unknown");
}

/**
 * Builds a complete review prompt by selecting the right template for the
 * problem's platform, filling in context, and appending the code block.
 *
 * @param {{ title?: string, difficulty?: string, language?: string, platform?: string, lang?: {name?: string}, problemUrl?: string }} problemContext
 * @param {string} code            The solution code to review
 * @param {Record<string, string>} [prompts]  Optional overrides (from user storage); falls back to registered defaults
 * @returns {string}               Complete prompt ready to send to an AI provider
 */
export function buildReviewPrompt(problemContext = {}, code = "", prompts = {}) {
  const platform = (problemContext.platform || "").toLowerCase() || "default";

  // Preference order: user stored override → registered platform default → registered default fallback
  const template =
    (prompts[platform] && prompts[platform].trim() ? prompts[platform] : null) ||
    _platformPrompts[platform] ||
    (prompts["default"] && prompts["default"].trim() ? prompts["default"] : null) ||
    _platformPrompts["default"] ||
    DEFAULT_PROMPT_TEMPLATE;

  const filledTemplate = fillPromptTemplate(template, problemContext);
  const lang = problemContext.language || problemContext.lang?.name || "";
  return `${filledTemplate}\n\n## Code:\n\`\`\`${lang}\n${code}\n\`\`\``;
}
