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
        description: "Ask guiding questions rather than giving direct answers",
        trigger: "on_command:socratic",
        system_prompt_modifier:
            "Adopt a Socratic teaching style. Ask probing questions to guide the user toward the answer instead of giving it directly. Only provide the answer if the user has tried multiple times.",
        auto_tools: [],
    },
    {
        id: "hint-giver",
        name: "Incremental Hint Giver",
        description: "Give only one small hint at a time",
        trigger: "on_stuck",
        system_prompt_modifier:
            "The user seems stuck. Give only one small, incremental hint that nudges them in the right direction without revealing the full approach. Do not spoil the solution.",
        conditions: {
            keywords: ["stuck", "hint", "help me", "i don't know", "no idea"],
        },
    },
    {
        id: "code-reviewer",
        name: "Code Reviewer",
        description: "Focus on time/space complexity and code quality",
        trigger: "on_command:review",
        system_prompt_modifier:
            "Act as an expert code reviewer. Analyse the solution for: time complexity, space complexity, edge cases, readability, and potential optimisations. Be precise and constructive.",
    },
    {
        id: "next-problem",
        name: "Next Problem Guide",
        description:
            "After solving, suggest the next problem in roadmap or by weak topic",
        trigger: "after_solve",
        system_prompt_modifier:
            "The user has just solved a problem. Congratulate them briefly, then suggest the next problem to tackle based on their roadmap or weakest topic. Use the get-next-suggestion tool if available.",
        auto_tools: ["get-next-suggestion"],
    },
    {
        id: "explain-deeply",
        name: "Deep Explainer",
        description: "Explain concepts and intuition in depth",
        trigger: "on_command:explain",
        system_prompt_modifier:
            "Explain the concept in depth. Cover the intuition, why it works, common variations, and when to use it. Use analogies and examples.",
    },
    {
        id: "roadmap-navigator",
        name: "Roadmap Navigator",
        description: "Help user follow their DSA roadmap",
        trigger: "always",
        system_prompt_modifier:
            "If the user has shared a DSA roadmap or study plan, use it to guide your recommendations. Always be aware of their current position in the roadmap and suggest next steps proactively.",
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
    const userSkills = Array.isArray(settings[SK_USER_SKILLS])
        ? settings[SK_USER_SKILLS]
        : [];
    return [...BUILTIN_SKILLS, ...userSkills];
}

/**
 * Save a user-defined skill.
 * @param {object} skill
 */
export async function saveUserSkill(skill) {
    if (!skill?.id || !skill?.name)
        throw new Error("Skill must have id and name");
    const settings = await Storage.getSettings();
    const existing = Array.isArray(settings[SK_USER_SKILLS])
        ? settings[SK_USER_SKILLS]
        : [];
    const idx = existing.findIndex((s) => s.id === skill.id);
    if (idx >= 0) existing[idx] = skill;
    else existing.push(skill);
    await Storage.setSettings({ ...settings, [SK_USER_SKILLS]: existing });
    dbg.log(`saveUserSkill: saved skill ${skill.id}`);
}

/**
 * Delete a user-defined skill by id.
 * @param {string} id
 */
export async function deleteUserSkill(id) {
    const settings = await Storage.getSettings();
    const existing = Array.isArray(settings[SK_USER_SKILLS])
        ? settings[SK_USER_SKILLS]
        : [];
    await Storage.setSettings({
        ...settings,
        [SK_USER_SKILLS]: existing.filter((s) => s.id !== id),
    });
    dbg.log(`deleteUserSkill: deleted ${id}`);
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
    const textLower = text.toLowerCase();

    return all.filter((skill) => {
        const trigger = skill.trigger || "";

        if (trigger === "always") return true;
        if (trigger === "after_solve" && justSolved) return true;

        if (trigger === "on_stuck") {
            const keywords = skill.conditions?.keywords || [
                "stuck",
                "hint",
                "help",
                "confused",
                "don't understand",
            ];
            return keywords.some((kw) => textLower.includes(kw));
        }

        if (trigger === "on_error") {
            return (
                textLower.includes("error") ||
                textLower.includes("fail") ||
                textLower.includes("wrong answer")
            );
        }

        if (trigger.startsWith("on_command:")) {
            const cmd = "/" + trigger.slice("on_command:".length);
            return textLower.includes(cmd);
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
    const modifiers = active
        .map((s) => s.system_prompt_modifier)
        .filter(Boolean);
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
