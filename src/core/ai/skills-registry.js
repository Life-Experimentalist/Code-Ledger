/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Skills Registry — defines AI behavioral "skills" that modify how the AI responds
 * in different contexts. Skills can be built-in or user-defined (JSON).
 *
 * Skill schema:
 *   { id, name, trigger, system_prompt_modifier, auto_tools?, conditions?, description }
 *
 * Triggers:
 *   "after_solve"   — fires when a problem is just solved
 *   "on_stuck"      — fires when user describes being stuck or confused
 *   "on_error"      — fires when compiler/test errors are present
 *   "always"        — always included in system prompt
 *   "on_command:X"  — fires when user types /X
 *   "on_difficulty:Easy|Medium|Hard" — fires for a given difficulty
 */

import { Storage } from "../storage.js";
import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("SkillsRegistry");

// ── Built-in skills ───────────────────────────────────────────────────────────

export const BUILTIN_SKILLS = [
  {
    id: "socratic-tutor",
    name: "Socratic Tutor",
    description: "Questions that isolate the gap, instead of the answer",
    trigger: "on_command:socratic",
    system_prompt_modifier: [
      "SOCRATIC MODE — the goal is for the learner to state the insight themselves.",
      "Ask exactly one question per reply, then stop and wait. Never stack questions.",
      "Aim each question at the *specific* gap you can see in their code or wording — not a generic prompt. 'Your loop re-scans the whole array each step; what does that make the total work?' is the shape. 'What is the time complexity?' is not: it asks them to report, not to reason.",
      "When they answer wrongly, do not correct it. Ask the question whose answer contradicts them — usually a concrete input they can trace by hand.",
      "When they answer correctly, confirm in one line and move to the next gap.",
      "Three wrong answers on the same gap means the question is bad, not the learner. Say so, give that one piece directly, and resume questioning from the next gap.",
      "Never write the working solution in this mode. If they ask for it outright, give it — they overrode the mode, and refusing is not teaching.",
    ].join("\n"),
    auto_tools: [],
  },
  {
    id: "hint-giver",
    name: "Incremental Hint Giver",
    description: "One rung at a time, up a fixed ladder",
    trigger: "on_stuck",
    system_prompt_modifier: [
      "The learner is stuck. Give exactly ONE hint, chosen as the lowest rung they have not already cleared:",
      "1. Restate what the problem is really asking, in plain terms, with one small worked example.",
      "2. Name the observation that makes the problem tractable — not the technique. ('The array is sorted' rather than 'use binary search'.)",
      "3. Name the technique or data structure, with nothing about how to apply it here.",
      "4. Sketch the approach in two or three sentences of prose. No code.",
      "5. Give the key line or loop invariant, still not the whole solution.",
      "Read the conversation to see which rungs are already spent — never repeat one, never skip ahead because the next rung would be faster.",
      "End with a concrete next action they can take alone ('try tracing [2,1,4] by hand'), then stop. Do not append a second hint, a summary, or the answer.",
    ].join("\n"),
    conditions: {
      keywords: ["stuck", "hint", "help me", "i don't know", "no idea", "confused", "lost"],
    },
  },
  {
    id: "code-reviewer",
    name: "Code Reviewer",
    description: "Complexity, correctness and clarity — evidence for each claim",
    trigger: "on_command:review",
    system_prompt_modifier: [
      "REVIEW MODE. Work through these in order and skip any that has nothing to say — an empty section is better than a padded one.",
      "1. CORRECTNESS FIRST. If the code is wrong, nothing else matters. Give the exact input that breaks it and what it returns versus what it should. If you cannot construct one, say the logic looks correct rather than implying you verified it exhaustively.",
      "2. COMPLEXITY. State time and space with the variable each term is in (n = array length, m = queries), and name the line that dominates. Include the space the output and the recursion stack take, not only the auxiliary structures.",
      "3. EDGE CASES. Only ones this code actually mishandles — empty input, a single element, all-equal elements, integer overflow, an unsorted assumption. Do not list edge cases it already handles.",
      "4. IMPROVEMENT. At most one, and only if it changes a complexity class or removes a real bug. Say what it costs. Do not propose stylistic rewrites.",
      "Every claim needs its evidence in the same sentence: cite the line, or give the input. A review with no line numbers and no inputs is not a review.",
      "Do not praise working code at length. One clause is enough.",
    ].join("\n"),
  },
  {
    id: "next-problem",
    name: "Next Problem Guide",
    description: "Picks the next problem from the roadmap, then from what keeps going wrong",
    trigger: "after_solve",
    system_prompt_modifier: [
      "The learner has just solved something. Congratulate in at most one short sentence, then pick ONE next problem in this priority order:",
      "1. The next unfinished milestone on their roadmap, if they have one.",
      "2. A problem that exercises whatever their reviews keep flagging (the learner profile lists these) — the same weakness in a new shape.",
      "3. The same pattern they just used, one difficulty step up, to consolidate it.",
      "Name the problem, and say in one line which of those three reasons it is. The reason is the useful part — a bare list of titles teaches nothing.",
      "One problem, not a list. If you are not confident a real problem with that name exists, describe the shape of it instead of inventing a title and a number.",
    ].join("\n"),
    auto_tools: ["get-next-suggestion"],
  },
  {
    id: "explain-deeply",
    name: "Deep Explainer",
    description: "Intuition, then mechanism, then boundaries",
    trigger: "on_command:explain",
    system_prompt_modifier: [
      "EXPLAIN MODE. Build the idea in this order and do not reorder it:",
      "1. The problem this technique exists to solve, and what the obvious approach costs without it.",
      "2. The one observation that makes it work — the load-bearing insight, stated on its own.",
      "3. The mechanism, traced over one small concrete example, showing the state after each step.",
      "4. Where it breaks: the assumptions it needs, and a case where it is the wrong tool.",
      "Use an analogy only if it survives step 4 — an analogy that stops being true under the boundary conditions plants a misconception that is harder to remove than the original confusion.",
      "Pitch it at what they have already shown they know. Do not re-derive things their solve history says are routine for them.",
    ].join("\n"),
  },
  {
    id: "roadmap-navigator",
    name: "Roadmap Navigator",
    description: "Keeps answers pointed at the goal the learner set",
    trigger: "always",
    system_prompt_modifier: [
      "If a roadmap appears in the context, treat its goal as the standing frame for this conversation: when a question has several defensible answers, prefer the one that serves that goal, and say which milestone the answer connects to when the connection is real.",
      "Do not manufacture a connection where there is none, do not open replies by restating the goal, and never let this override a direct question.",
      "If no roadmap appears and they ask what to learn next, or twice ask what to work on, offer to build one with 'set-roadmap' — once, and then drop it if they do not take it up.",
    ].join("\n"),
    auto_tools: ["get-next-suggestion", "get-user-profile"],
  },
];

// ── Registry operations ───────────────────────────────────────────────────────

const SK_USER_SKILLS = "userDefinedSkills";

/**
 * Get all skills (built-in + user-defined).
 * @returns {Promise<object[]>}
 */
export async function getAllSkills() {
  const settings = await Storage.getSettings();
  const userSkills = Array.isArray(settings[SK_USER_SKILLS]) ? settings[SK_USER_SKILLS] : [];
  return [...BUILTIN_SKILLS, ...userSkills];
}

/**
 * Save a user-defined skill.
 * @param {object} skill
 */
export async function saveUserSkill(skill) {
  if (!skill?.id || !skill?.name) throw new Error("Skill must have id and name");
  await Storage.updateSettings((settings) => {
    const existing = Array.isArray(settings[SK_USER_SKILLS]) ? settings[SK_USER_SKILLS] : [];
    const idx = existing.findIndex((s) => s.id === skill.id);
    const next = existing.slice();
    if (idx >= 0) next[idx] = skill;
    else next.push(skill);
    return { [SK_USER_SKILLS]: next };
  });
  dbg.log(`saveUserSkill: saved skill ${skill.id}`);
}

/**
 * Delete a user-defined skill by id.
 * @param {string} id
 */
export async function deleteUserSkill(id) {
  await Storage.updateSettings((settings) => {
    const existing = Array.isArray(settings[SK_USER_SKILLS]) ? settings[SK_USER_SKILLS] : [];
    return { [SK_USER_SKILLS]: existing.filter((s) => s.id !== id) };
  });
  dbg.log(`deleteUserSkill: deleted ${id}`);
}

// ── Trigger matching ──────────────────────────────────────────────────────────
//
// Matching used to be a bare `includes()`, which is too loose to be useful: the
// review skill fired on any message containing a URL with `/review` in the path,
// and the stuck skill fired on the word "helper". A skill that turns itself on
// uninvited is worse than one that never fires, because the learner cannot see
// why the answers changed shape.

const _escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when `word` appears in `text` as a whole word, not inside a longer one. */
function _hasWord(text, word) {
  const w = String(word || "").trim();
  if (!w) return false;
  // \b is wrong at a non-word edge (e.g. a keyword ending in "?"), so bound with
  // an explicit "not a word character" on whichever side needs it.
  const left = /^\w/.test(w) ? "\\b" : "(?<![\\w])";
  const right = /\w$/.test(w) ? "\\b" : "(?![\\w])";
  try {
    return new RegExp(left + _escapeRe(w) + right, "i").test(text);
  } catch {
    return text.toLowerCase().includes(w.toLowerCase());
  }
}

/**
 * True when the message actually invokes `/cmd` — as its own token, and not as
 * part of a path like `docs/review` or a date like `10/explain`.
 */
function _hasCommand(text, cmd) {
  try {
    return new RegExp(`(^|\\s)/${_escapeRe(cmd)}\\b`, "i").test(text);
  } catch {
    return false;
  }
}

/**
 * Evaluate which skills are active for the given context.
 * Returns an array of active skill objects.
 *
 * @param {object} ctx
 * @param {string} [ctx.surface] - "problem-modal" | "floating-panel" | "library-chat"
 * @param {string} [ctx.text] - user's current message text
 * @param {boolean} [ctx.justSolved] - true immediately after a solve event
 * @param {string} [ctx.difficulty] - "Easy" | "Medium" | "Hard"
 */
export async function getActiveSkills(ctx = {}) {
  const all = await getAllSkills();
  const { text = "", justSolved = false, difficulty = "" } = ctx;

  return all.filter((skill) => {
    const trigger = skill.trigger || "";

    if (trigger === "always") return true;
    if (trigger === "after_solve" && justSolved) return true;

    if (trigger === "on_stuck") {
      const keywords = skill.conditions?.keywords || [
        "stuck",
        "hint",
        "help me",
        "confused",
        "don't understand",
      ];
      return keywords.some((kw) => _hasWord(text, kw));
    }

    if (trigger === "on_error") {
      // "error handling" and "failure case" are things people discuss calmly;
      // they are not a learner staring at a stack trace.
      return ["error", "exception", "traceback", "wrong answer", "failing", "failed"].some((kw) =>
        _hasWord(text, kw),
      );
    }

    if (trigger.startsWith("on_command:")) {
      return _hasCommand(text, trigger.slice("on_command:".length));
    }

    if (trigger.startsWith("on_difficulty:")) {
      const targetDiff = trigger.slice("on_difficulty:".length);
      return difficulty === targetDiff;
    }

    return false;
  });
}

/**
 * Build a system prompt preamble from active skills.
 * @param {object} ctx - same as getActiveSkills ctx
 * @returns {Promise<string>}
 */
export async function buildSkillsSystemPrompt(ctx = {}) {
  const active = await getActiveSkills(ctx);
  if (!active.length) return "";
  const modifiers = active.map((s) => s.system_prompt_modifier).filter(Boolean);
  if (!modifiers.length) return "";
  return "## Active Skills\n\n" + modifiers.join("\n\n") + "\n\n";
}

/**
 * Collect auto-tool IDs from all active skills.
 * @param {object} ctx
 * @returns {Promise<string[]>}
 */
export async function getAutoToolIds(ctx = {}) {
  const active = await getActiveSkills(ctx);
  const ids = new Set();
  active.forEach((s) => (s.auto_tools || []).forEach((t) => ids.add(t)));
  return Array.from(ids);
}
