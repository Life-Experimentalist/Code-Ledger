/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Expand variables in AI chat input
 * /mycode → user's code from problem
 * /problem → full problem statement
 * /errors → test case errors
 * /submission → latest submission details
 * /hints → problem hints
 * /similar → similar problems
 * /constraints → constraints only
 */

export async function expandChatVariables(text, context = {}) {
    const { problem, userCode, errors, submission, hints, similar, constraints } = context;

    let expanded = text;

    // /mycode → user's latest code
    if (expanded.includes("/mycode")) {
        const codeBlock = userCode ? `\`\`\`\n${userCode}\n\`\`\`` : "(no code found)";
        expanded = expanded.replace(/\/mycode/g, codeBlock);
    }

    // /problem → full problem statement
    if (expanded.includes("/problem")) {
        const problemText = problem?.statement
            ? `**Problem:** ${problem.title}\n\n**Statement:**\n${problem.statement}`
            : problem?.description || "(problem details not available)";
        expanded = expanded.replace(/\/problem/g, problemText);
    }

    // /errors → test case errors
    if (expanded.includes("/errors")) {
        const errorText = errors?.length
            ? `**Test Case Errors:**\n${errors.map((e) => `- ${e.testCase}: ${e.error}`).join("\n")}`
            : "(no errors - all tests passed)";
        expanded = expanded.replace(/\/errors/g, errorText);
    }

    // /submission → latest submission (test vs accept)
    if (expanded.includes("/submission")) {
        const submissionText = submission
            ? `**Latest Submission:**
- Type: ${submission.type} (${submission.type === "test" ? "test case" : "submit button"})
- Status: ${submission.status}
- Runtime: ${submission.runtime || "N/A"}
- Memory: ${submission.memory || "N/A"}
${submission.feedback ? `- Feedback: ${submission.feedback}` : ""}`
            : "(no submission found)";
        expanded = expanded.replace(/\/submission/g, submissionText);
    }

    // /hints → problem hints
    if (expanded.includes("/hints")) {
        const hintsText = hints?.length ? `**Hints:**\n${hints.map((h, i) => `${i + 1}. ${h}`).join("\n")}` : "(no hints available)";
        expanded = expanded.replace(/\/hints/g, hintsText);
    }

    // /similar → similar problems
    if (expanded.includes("/similar")) {
        const similarText = similar?.length
            ? `**Similar Problems:**\n${similar
                .slice(0, 5)
                .map((s) => `- [${s.title}](${s.url}) - ${s.difficulty}`)
                .join("\n")}`
            : "(no similar problems found)";
        expanded = expanded.replace(/\/similar/g, similarText);
    }

    // /constraints → constraints only
    if (expanded.includes("/constraints")) {
        const constraintsText = constraints
            ? `**Constraints:**\n${constraints}`
            : problem?.constraints || "(constraints not available)";
        expanded = expanded.replace(/\/constraints/g, constraintsText);
    }

    return expanded;
}

/**
 * Extract variables that will be expanded from text
 */
export function getUsedVariables(text) {
    const vars = [];
    const regex = /\/(\w+)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const varName = match[1];
        if (
            [
                "mycode",
                "problem",
                "errors",
                "submission",
                "hints",
                "similar",
                "constraints",
            ].includes(varName)
        ) {
            if (!vars.includes(varName)) vars.push(varName);
        }
    }
    return vars;
}

/**
 * Build context object from problem + runtime data
 */
export async function buildChatContext(problem, editorCode = null) {
    return {
        problem: {
            title: problem?.title || "",
            statement: problem?.description || "",
            constraints: problem?.constraints || "",
        },
        userCode: editorCode || "",
        errors: [], // Will be populated by submission detection
        submission: null, // Will be set when submission detected
        hints: problem?.hints || [],
        similar: problem?.similar || [],
        constraints: problem?.constraints || "",
    };
}
