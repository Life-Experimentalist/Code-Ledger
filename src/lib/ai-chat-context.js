/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getUsedCommands } from "./chat-variables.js";
import { createDebugger } from "./debug.js";

const dbg = createDebugger("AIChatContext");

const REQUEST_COMMANDS = new Set([
    "explain",
    "optimize",
    "complexity",
    "test",
    "diagram",
    "formula",
]);

function normalizeList(value) {
    return Array.isArray(value)
        ? value.filter((item) => item != null && item !== "")
        : [];
}

function normalizeLang(lang) {
    if (!lang) return { name: "" };
    if (typeof lang === "string") return { name: lang };
    if (typeof lang !== "object") return { name: String(lang || "") };
    return {
        ...lang,
        name: lang.name || lang.slug || lang.ext || "",
    };
}

function normalizeProblem(problem = {}) {
    return {
        title: problem.title || "",
        statement:
            problem.statement ||
            problem.problemStatement ||
            problem.description ||
            "",
        description:
            problem.description ||
            problem.statement ||
            problem.problemStatement ||
            "",
        constraints: problem.constraints || "",
        hints: normalizeList(problem.hints),
        similar: normalizeList(problem.similar),
        code: problem.code || "",
        platform: problem.platform || "",
        difficulty: problem.difficulty || "",
        methodTitle: problem.methodTitle || "",
        notes: problem.notes || "",
        isDuplicate: !!problem.isDuplicate,
        duplicateOf: problem.duplicateOf || null,
        lang: normalizeLang(problem.lang),
    };
}

export function inferChatRequestType(text = "") {
    const commands = getUsedCommands(text);
    for (const command of commands) {
        if (REQUEST_COMMANDS.has(command)) return command;
    }
    return "";
}

export function buildAIChatContext({
    surface = "default",
    chatMode = "guided",
    problem = null,
    title = "",
    difficulty = "",
    platform = "",
    lang = null,
    code = "",
    userCode = "",
    problemStatement = "",
    methodTitle = "",
    aiReview = "",
    errors = [],
    submission = null,
    hints = [],
    similar = [],
    constraints = "",
    attachedProblemSlugs = [],
    attachedProblems = [],
    requestType = "",
    text = "",
} = {}) {
    const normalizedProblem = normalizeProblem(problem || {});
    const resolvedCode = String(
        code || userCode || normalizedProblem.code || ""
    );
    const resolvedText = String(text || "");
    const resolvedRequestType =
        requestType || inferChatRequestType(resolvedText);
    const resolvedHints = normalizeList(
        hints.length ? hints : normalizedProblem.hints
    );
    const resolvedSimilar = normalizeList(
        similar.length ? similar : normalizedProblem.similar
    );
    const resolvedConstraints =
        constraints || normalizedProblem.constraints || "";
    const resolvedStatement =
        problemStatement ||
        normalizedProblem.statement ||
        normalizedProblem.description ||
        "";
    const resolvedLang = normalizeLang(lang || normalizedProblem.lang);
    const resolvedMethodTitle =
        methodTitle || normalizedProblem.methodTitle || "";

    return {
        surface,
        chatMode,
        title: title || normalizedProblem.title || "",
        difficulty: difficulty || normalizedProblem.difficulty || "",
        platform: platform || normalizedProblem.platform || "",
        methodTitle: resolvedMethodTitle,
        lang: resolvedLang,
        code: resolvedCode,
        userCode: resolvedCode,
        problemStatement: resolvedStatement,
        aiReview: aiReview || "",
        problem: {
            title: title || normalizedProblem.title || "",
            statement: resolvedStatement,
            description: normalizedProblem.description || resolvedStatement,
            constraints: resolvedConstraints,
            hints: resolvedHints,
            similar: resolvedSimilar,
            code: resolvedCode,
            platform: platform || normalizedProblem.platform || "",
            difficulty: difficulty || normalizedProblem.difficulty || "",
            methodTitle: resolvedMethodTitle,
            lang: resolvedLang,
        },
        errors: normalizeList(errors),
        submission,
        hints: resolvedHints,
        similar: resolvedSimilar,
        constraints: resolvedConstraints,
        attachedProblemSlugs: normalizeList(attachedProblemSlugs),
        attachedProblems: normalizeList(attachedProblems),
        requestType: resolvedRequestType,
        usedCommands: resolvedText ? getUsedCommands(resolvedText) : [],
    };
}
