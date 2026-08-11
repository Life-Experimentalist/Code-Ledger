/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AI prompt utilities — no hardcoded platform prompts here.
 * Platform handlers register their own templates via registerPlatformPrompt().
 * This keeps the core agnostic and lets new platforms be added as plugins.
 */

import { createDebugger } from "../lib/debug.js";
import { CONSTANTS } from "./constants.js";

const dbg = createDebugger("AIPrompts");
export const DEFAULT_PROMPT_TEMPLATE = `You are an expert competitive programming mentor. Review this {difficulty} {language} solution for '{title}'.

## Complexity
- **Time:** O(?) — one-line justification
- **Space:** O(?) — one-line justification

## Correctness
Identify up to 2 specific edge cases that could break this solution (e.g. empty input, integer overflow, duplicates, off-by-one). For each, state the input and expected vs actual behaviour.

## Optimization
If a meaningfully better approach exists (strictly better complexity, or code that is 30%+ simpler), describe it in 2–3 sentences and state the improved complexity. Otherwise write "Current approach is optimal."

## Code Quality
One sentence on the most impactful readability or style improvement, if any.

Keep each section tight. Total response under 350 words. Use markdown.`;

/**
 * Guided (Socratic) mode — never gives the solution, leads the learner through questions.
 * Default for the floating panel. Toggle to DIRECT_FLOATING_PANEL_PROMPT via chatMode setting.
 */
export const GUIDED_FLOATING_PANEL_PROMPT = `You are a Socratic DSA mentor embedded on the problem page. Your job is to help the learner reach the answer themselves — never hand it to them.

Rules:
- NEVER write the solution code or give the complete algorithm outright.
- When the learner is stuck, ask 1–2 targeted questions that expose the missing insight (e.g. "What happens to the state of X after this loop?").
- Hint at the relevant pattern or data structure category (e.g. "think about what structure gives O(1) lookup") without naming the exact approach unless they are very close.
- If they share broken code, explain what the error or symptom means — not how to fix it directly.
- If they share working code, challenge edge cases: "Does this hold when the input is empty? What about duplicates?"
- End every response with a concrete question that moves them one step forward.
- Keep responses under 120 words. Tight, targeted, no filler.`;

export const DIRECT_FLOATING_PANEL_PROMPT = `You are an in-context coding assistant embedded on the problem page. Respond quickly, prefer direct guidance, and use the current editor code and problem statement as your ground truth.`;

export const AI_CHAT_SURFACE_PROMPTS = {
  default: `You are CodeLedger's DSA tutor. Help the learner think clearly, keep answers concise, and prioritize correctness, edge cases, and complexity. When appropriate, use bullet points and small examples.`,
  "problem-modal": `You are reviewing a specific solved DSA problem. Help the learner reason through the current solution, surface missing edge cases, and suggest the next improvement. Stay practical and concise.`,
  "floating-panel": GUIDED_FLOATING_PANEL_PROMPT,
  "floating-panel-direct": DIRECT_FLOATING_PANEL_PROMPT,
  "library-chat": `You are a study companion for the user's saved problem conversations. Use prior context, compare solutions, and help the learner build intuition.`,
  review: `You are a code review assistant. Focus on correctness, complexity, edge cases, and one concrete optimization.`,
};

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
    dbg.log(`registerPlatformPrompt(${platformId}): registered`);
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
  if (!raw || typeof raw !== "object") {
    dbg.log(
      `normalizeAIPrompts(): no raw prompts, using defaults (${Object.keys(defaults).length} keys)`,
    );
    return defaults;
  }
  const out = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (raw[key] && typeof raw[key] === "string" && raw[key].trim()) {
      out[key] = raw[key];
    }
  }
  dbg.log(`normalizeAIPrompts(): merged raw + defaults (${Object.keys(out).length} keys)`);
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
    .replace(/\{methodTitle\}/g, ctx.methodTitle || ctx.method || "")
    .replace(/\{platform\}/g, ctx.platform || "Unknown");
}

/**
 * Builds a complete review prompt by selecting the right template for the
 * problem's platform, filling in context, and appending the code block.
 *
 * @param {{ title?: string, difficulty?: string, language?: string, platform?: string, methodTitle?: string, lang?: {name?: string}, problemUrl?: string }} problemContext
 * @param {string} code            The solution code to review
 * @param {Record<string, string>} [prompts]  Optional overrides (from user storage); falls back to registered defaults
 * @returns {string}               Complete prompt ready to send to an AI provider
 */
export function buildReviewPrompt(problemContext = {}, code = "", prompts = {}) {
  // Raw mode: the caller has already built the full prompt — return it as-is.
  if (problemContext._rawPrompt) {
    dbg.log(`buildReviewPrompt(): raw mode (pre-built prompt)`);
    return code;
  }

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
  dbg.log(`buildReviewPrompt(): ${platform} (${lang})`);
  const currentMetadata = `\n\n## Current Metadata:\n- **Topic:** ${problemContext.topic || "None"}\n- **Tags:** ${problemContext.tags?.join(", ") || "None"}\n- **Pattern:** ${problemContext.pattern || "None"}\n- **Difficulty:** ${problemContext.difficulty || "None"}`;

  const CANONICAL_TOPICS = (CONSTANTS.CANONICAL_DSA_TOPICS || []).join(", ");

  const existingTags = problemContext.tags || [];
  const sparseTagHint =
    existingTags.length < 2 || (problemContext.platform || "").toLowerCase() === "geeksforgeeks"
      ? `\n\nThis problem has sparse tags (${existingTags.length} found). Infer 2-5 accurate DSA tags from the code and title. Use ONLY the canonical names listed above.`
      : "";

  // WEAK_AREAS is what gets written back into the behaviour bank and becomes the
  // learner's recurring-flag profile. A keyword scan over the prose used to
  // guess it and could only ever recognise seven fixed phrases; the reviewer
  // already knows what it flagged, so it may as well say so.
  const metadataInstruction = `\n\nAt the very end of your response, you MUST output a metadata block in exactly this format (no other text on these lines):\nMETADATA\nTAGS: Tag One, Tag Two  ← use ONLY from this canonical list: ${CANONICAL_TOPICS}${sparseTagHint}\nTOPIC: Primary Topic\nPATTERN: Optional Pattern Name\nDIFFICULTY: Easy/Medium/Hard\nWEAK_AREAS: short, lowercase labels for what this solution actually got wrong or handled poorly, comma-separated (e.g. off-by-one, edge cases, space complexity). Reuse the same wording across reviews so repeats are recognisable. Leave empty if the solution was sound.\nTAKEAWAY: one plain sentence naming the single most useful thing about THIS solution, written so it still makes sense months later with the code out of view. Plain text only — no markdown, no LaTeX, no headings. Say what was done and what it cost, e.g. "Sorted both arrays and walked them with two pointers, which is optimal but makes the O(n log n) sort the floor." Not a grade, not encouragement.\nEND_METADATA`;

  const behaviorSection = problemContext._behaviorContext
    ? `\n\n## Learner History:\n${problemContext._behaviorContext}`
    : "";
  return `${filledTemplate}${behaviorSection}${currentMetadata}\n\n## Code:\n\`\`\`${lang}\n${code}\n\`\`\`${metadataInstruction}`;
}

/**
 * Parse the reviewer's own WEAK_AREAS metadata line into labels.
 *
 * These labels become map keys in the aggregate learner profile and chips in
 * the Behaviour tab, so a model that answers with a sentence instead of labels
 * must not be able to poison either. Prose is dropped rather than truncated: a
 * half-sentence label would never match the next review's wording, so it could
 * only ever be a count of one, and a count of one is filtered out anyway.
 *
 * @param {string} raw the text following "WEAK_AREAS:"
 * @returns {string[]} lowercase labels, deduplicated
 */
export function parseWeakAreas(raw = "") {
  const MAX_LABEL_CHARS = 40;
  const MAX_LABELS = 6;
  const seen = new Set();
  for (const part of String(raw).split(",")) {
    const label = part
      .trim()
      .toLowerCase()
      .replace(/[.;]+$/, "");
    if (!label || label.length > MAX_LABEL_CHARS) continue;
    if (/^(none|n\/a|na|nothing|not applicable|-|—)$/.test(label)) continue;
    seen.add(label);
    if (seen.size >= MAX_LABELS) break;
  }
  return [...seen];
}

/**
 * Parse the reviewer's TAKEAWAY line into the one sentence the Behaviour tab
 * shows under a problem.
 *
 * What it replaces is the point of it: the summary used to be `review.slice(0,
 * 200)` — the first 200 characters of the review, which is its heading and the
 * opening of a complexity table, cut mid-word. It read as "### Analysis **1.
 * Complexity** * **Time Complexity:** $O(N \log N…" and told the learner
 * nothing, because the first 200 characters of a review are never the part
 * worth keeping.
 *
 * Markdown and LaTeX are stripped rather than rendered: this line appears in a
 * dense list of records, so it has to survive as one plain sentence.
 *
 * @param {string} raw the text following "TAKEAWAY:"
 * @returns {string} a single plain sentence, or "" if there is nothing usable
 */
export function parseTakeaway(raw = "") {
  const MAX_CHARS = 240;
  let s = String(raw || "")
    .split("\n")[0]
    .trim();
  if (!s) return "";
  s = s
    .replace(/\$+([^$]*)\$+/g, "$1") // $O(n \log n)$ → O(n \log n)
    .replace(/\\(?:log|max|min|sqrt|cdot|times|le|ge|approx)\b/g, (m) => m.slice(1))
    .replace(/`+/g, "")
    .replace(/\*\*?([^*]+)\*\*?/g, "$1")
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(none|n\/a|na|-|—)$/i.test(s)) return "";
  return s.length > MAX_CHARS ? s.slice(0, MAX_CHARS - 1).trimEnd() + "…" : s;
}

export function buildConversationSystemPrompt(context = {}) {
  const surface = String(context.surface || context.mode || "default").toLowerCase();
  // For floating-panel, chatMode "direct" opts out of guided Socratic prompting
  const effectiveSurface =
    surface === "floating-panel" && context.chatMode === "direct"
      ? "floating-panel-direct"
      : surface;
  const base = AI_CHAT_SURFACE_PROMPTS[effectiveSurface] || AI_CHAT_SURFACE_PROMPTS.default;
  const hints = [];

  if (context.title)
    hints.push(`Problem: ${context.title}${context.difficulty ? ` (${context.difficulty})` : ""}`);
  if (context.platform) hints.push(`Platform: ${context.platform}`);
  if (context.methodTitle) hints.push(`Method: ${context.methodTitle}`);
  if (Array.isArray(context.attachedProblemSlugs) && context.attachedProblemSlugs.length) {
    hints.push(`Related problems: ${context.attachedProblemSlugs.join(", ")}`);
  }
  if (context.requestType) {
    const type = String(context.requestType).toLowerCase();
    const requestMap = {
      explain: "Explain the idea step by step for a learner.",
      optimize: "Suggest a concrete improvement and explain the trade-off.",
      complexity: "Give a precise time and space complexity analysis.",
      test: "Return useful tests and edge cases.",
      diagram: "If helpful, use a Mermaid diagram or structured flow description.",
      formula: "Use math notation where appropriate and keep the output readable.",
    };
    if (requestMap[type]) hints.push(requestMap[type]);
  }

  dbg.log(`buildConversationSystemPrompt(): surface=${surface} (${hints.length} hints)`);
  return hints.length ? `${base}\n\nContext:\n${hints.join("\n")}` : base;
}
