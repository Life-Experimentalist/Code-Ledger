/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * What an AI review is allowed to rewrite on a solved problem.
 *
 * The reviewer emits a metadata block alongside its prose, and the fields in it
 * end up in the learner's committed repository and in every chart the library
 * draws. That makes this a smaller question than it looks and a more important
 * one: which of the model's opinions may replace something the platform said,
 * and which may only fill a gap.
 *
 * The rules, in one place because they are easy to get subtly wrong:
 *
 *   - tags        merged with what is already there, never replacing it, unless
 *                 the only existing tag is the "Untagged" placeholder
 *   - topic       replaced, normalised through the canonical topic list
 *   - pattern     replaced; nothing else ever sets it
 *   - difficulty  replaced, but only by one of the three real values
 *   - statement   gap-filler only, and into its own field — see below
 *
 * Every change is memoed to the behaviour bank, because until that existed a
 * learner had no way to tell a difficulty the platform stated from one a model
 * decided on, and their own difficulty breakdown was quietly part guesswork.
 */

import { normalizeTag } from "./topic-resolver.js";
import { recordAIMetadataEdit } from "./behavior-bank.js";

/** The fields a review may rewrite, and therefore the ones worth memoing. */
const TRACKED_FIELDS = ["tags", "topic", "pattern", "difficulty", "aiStatementSummary"];

const DIFFICULTIES = ["Easy", "Medium", "Hard"];

/**
 * Apply the reviewer's inferred metadata to a problem record.
 *
 * Returns a new record; the input is never mutated. Recording the change in the
 * behaviour bank is fire-and-forget on purpose — a memo failing must never fail
 * a review, and this is the one place that knows both what went in and what
 * came out.
 *
 * @param {object} problem
 * @param {object|null|undefined} inferredMetadata
 * @returns {object}
 */
export function applyInferredMetadata(problem, inferredMetadata) {
  if (!inferredMetadata) return problem;
  const updated = { ...problem };

  if (Array.isArray(inferredMetadata.tags) && inferredMetadata.tags.length > 0) {
    const normalizedNew = inferredMetadata.tags.map((t) => normalizeTag(t)).filter(Boolean);
    const existingTags = Array.isArray(problem.tags) ? problem.tags : [];
    const hasUsefulExisting = existingTags.length > 0 && existingTags.some((t) => t !== "Untagged");
    // Merge rather than replace: the platform's own tags are evidence, the
    // model's are an opinion, and losing the former to the latter is not a
    // trade the learner asked for.
    updated.tags = hasUsefulExisting
      ? [...new Set([...existingTags, ...normalizedNew])]
      : normalizedNew;
  }

  if (inferredMetadata.topic) {
    updated.topic = normalizeTag(inferredMetadata.topic) || inferredMetadata.topic;
  }

  if (inferredMetadata.pattern) {
    updated.pattern = inferredMetadata.pattern;
  }

  if (inferredMetadata.difficulty) {
    const d =
      String(inferredMetadata.difficulty).charAt(0).toUpperCase() +
      String(inferredMetadata.difficulty).slice(1).toLowerCase();
    if (DIFFICULTIES.includes(d)) updated.difficulty = d;
  }

  // A gap-filler, and only that. Codeforces, NeetCode and takeuforward have no
  // statement endpoint, so those problems commit with an empty Problem
  // Statement section that nothing else can ever fill. This fills it — but only
  // when it is genuinely empty, so a real statement arriving later (or one the
  // learner wrote themselves) is never overwritten by a model's paraphrase of
  // its own guess. It is stored apart from `problemStatement` for the same
  // reason: the two are not the same kind of thing and the commit says so.
  if (inferredMetadata.statementSummary && !hasStatement(problem)) {
    updated.aiStatementSummary = inferredMetadata.statementSummary;
    updated.aiStatementSummaryAt = Date.now();
  }

  const changed = metadataChanges(problem, updated);
  if (changed.length) {
    recordAIMetadataEdit({
      slug: problem?.titleSlug || problem?.id || "",
      platform: problem?.platform || "",
      fields: changed,
    }).catch(() => {});
  }

  return updated;
}

/** Whether a problem already has a statement worth keeping. */
export function hasStatement(problem) {
  return !!String(problem?.problemStatement || problem?.description || "").trim();
}

/**
 * Which fields a review actually changed.
 *
 * Comparing before against after is the only honest way to know: the reviewer
 * emits every field whether or not it is changing anything, so trusting the
 * block itself would record a rewrite every time a model agreed with the
 * platform.
 *
 * @param {object} before
 * @param {object} after
 * @returns {string[]}
 */
export function metadataChanges(before, after) {
  return TRACKED_FIELDS.filter((field) => _compare(before?.[field]) !== _compare(after?.[field]));
}

/** A comparable form, so a re-ordered array is a change but a re-spaced one is not. */
function _compare(value) {
  if (value == null) return "";
  if (Array.isArray(value))
    return JSON.stringify(value.map((v) => (typeof v === "string" ? v.trim() : v)));
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
