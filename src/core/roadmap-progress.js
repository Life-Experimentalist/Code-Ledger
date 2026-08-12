/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Roadmap progress — one definition of "how far along am I", shared by the
 * Roadmap tab and by the AI.
 *
 * The two used to disagree completely. The tab reads `Storage.getRoadmaps()`
 * and scores milestones by tag; the AI's `get-roadmap-progress` tool read
 * `settings._activeRoadmap`, a key nothing has ever written. So the assistant
 * answered "No active roadmap set" to a learner looking straight at one, and
 * the roadmap-navigator skill's "if the user has shared a roadmap" branch could
 * never be true. Everything here reads the store the tab actually writes.
 */

import { Storage } from "./storage.js";

/** How many problems a milestone asks for when it does not say. */
const DEFAULT_TARGET = 5;

/**
 * Count the solved problems that belong to a milestone.
 *
 * A problem counts if any of its tags — or its folder topic — matches the
 * milestone's topic or one of its subtopics. Matching is case-insensitive
 * because milestone topics are written for humans ("Arrays & Hashing") while
 * tags arrive lowercase-hyphenated from the platforms.
 *
 * @param {Object} milestone
 * @param {Array<Object>} problems
 * @returns {number}
 */
export function countMilestoneSolves(milestone, problems) {
  if (!milestone || !Array.isArray(problems) || !problems.length) return 0;
  const targets = new Set(
    [milestone.topic || "", ...(milestone.subtopics || [])]
      .map((s) => String(s).trim().toLowerCase())
      .filter(Boolean),
  );
  if (!targets.size) return 0;
  return problems.filter((p) => {
    const tags = (p?.tags || []).map((t) => String(t).toLowerCase());
    return tags.some((t) => targets.has(t)) || targets.has(String(p?.topic || "").toLowerCase());
  }).length;
}

/**
 * The roadmap the learner is currently on: the most recently created one.
 *
 * The tab defaults its selector to the last roadmap in the list, so this
 * matches what they are looking at. It is a guess either way — nothing in the
 * data model marks one active — and picking the newest is the guess that is
 * right most often.
 *
 * @param {Array<Object>} roadmaps
 * @returns {Object|null}
 */
export function pickActiveRoadmap(roadmaps) {
  const list = (roadmaps || []).filter(Boolean);
  if (!list.length) return null;
  return list.reduce(
    (best, r) => ((r.createdAt || 0) >= (best.createdAt || 0) ? r : best),
    list[0],
  );
}

/**
 * Score every milestone in a roadmap.
 *
 * @param {Object} roadmap
 * @param {Array<Object>} problems
 * @returns {{title: string, goal: string, total: number, done: number,
 *   milestones: Array<{topic: string, solved: number, target: number, done: boolean,
 *     difficulty: string, subtopics: string[], description: string}>,
 *   next: Object|null}|null}
 */
export function summarizeRoadmap(roadmap, problems) {
  if (!roadmap) return null;
  const milestones = (roadmap.milestones || []).map((m) => {
    const target = m.targetCount || DEFAULT_TARGET;
    const solved = countMilestoneSolves(m, problems);
    return {
      topic: m.topic || "",
      subtopics: m.subtopics || [],
      difficulty: m.difficulty || "",
      description: m.description || "",
      target,
      solved,
      done: solved >= target,
    };
  });
  return {
    title: roadmap.title || "Roadmap",
    goal: roadmap.goal || "",
    total: milestones.length,
    done: milestones.filter((m) => m.done).length,
    milestones,
    next: milestones.find((m) => !m.done) || null,
  };
}

/**
 * Render a roadmap into the block that goes into the AI's system prompt.
 *
 * Deliberately compact — a couple of hundred tokens on every message. The
 * milestone the learner is on gets its subtopics spelled out because that is
 * what a recommendation has to be built from; the rest are one line each so the
 * model can see where this sits in the arc without being handed the whole plan.
 *
 * @param {Object} roadmap
 * @param {Array<Object>} problems
 * @returns {string} empty when there is no roadmap to describe
 */
export function formatRoadmapForPrompt(roadmap, problems) {
  const s = summarizeRoadmap(roadmap, problems);
  if (!s || !s.total) return "";

  const lines = [
    `## Active roadmap: ${s.title}`,
    s.goal ? `Their stated goal: ${s.goal}` : "",
    `Progress: ${s.done} of ${s.total} milestones complete.`,
    "",
  ].filter(Boolean);

  if (s.next) {
    const subs = s.next.subtopics.length ? ` (${s.next.subtopics.join(", ")})` : "";
    lines.push(
      `Currently on: ${s.next.topic}${subs} — ${s.next.solved}/${s.next.target} problems in.`,
    );
    if (s.next.description) lines.push(`That milestone's goal: ${s.next.description}`);
  } else {
    lines.push("Every milestone is complete — they are ready for what comes after this roadmap.");
  }

  const rest = s.milestones
    .filter((m) => m !== s.next)
    .map((m) => `- ${m.done ? "✓" : "·"} ${m.topic} (${m.solved}/${m.target})`);
  if (rest.length) lines.push("", "The rest of the plan:", ...rest);

  lines.push(
    "",
    "Tie your suggestions to this. When you recommend a problem, say which milestone it serves.",
    "If they ask for something off the plan, help with it — do not redirect them back.",
  );

  return lines.join("\n");
}

/**
 * Convenience for the AI surfaces: the prompt block for whichever roadmap is
 * active, or "" when there is none. Mirrors `getProfileContext()`.
 *
 * @returns {Promise<string>}
 */
export async function getRoadmapContext() {
  try {
    const roadmap = pickActiveRoadmap(await Storage.getRoadmaps());
    if (!roadmap) return "";
    return formatRoadmapForPrompt(roadmap, (await Storage.getAllProblems()) || []);
  } catch {
    return "";
  }
}
