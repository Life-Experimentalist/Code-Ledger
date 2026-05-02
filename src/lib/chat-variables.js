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

export const CHAT_COMMANDS = [
    { id: "mycode", label: "My Code", description: "Insert the current solution code.", usage: "/mycode", kind: "context" },
    { id: "problem", label: "Problem", description: "Insert the current problem statement.", usage: "/problem", kind: "context" },
    { id: "errors", label: "Errors", description: "Insert current errors or failed tests.", usage: "/errors", kind: "diagnostic" },
    { id: "submission", label: "Submission", description: "Insert the latest submission details.", usage: "/submission", kind: "diagnostic" },
    { id: "hints", label: "Hints", description: "Insert cached hints for this problem.", usage: "/hints", kind: "context" },
    { id: "similar", label: "Similar Problems", description: "Insert similar solved problems.", usage: "/similar", kind: "context" },
    { id: "constraints", label: "Constraints", description: "Insert only the constraints section.", usage: "/constraints", kind: "context" },
    { id: "explain", label: "Explain", description: "Ask for a DSA-friendly explanation.", usage: "/explain", kind: "tutor" },
    { id: "optimize", label: "Optimize", description: "Ask for a concrete optimization pass.", usage: "/optimize", kind: "tutor" },
    { id: "complexity", label: "Complexity", description: "Ask for time/space complexity analysis.", usage: "/complexity", kind: "tutor" },
    { id: "test", label: "Test Cases", description: "Extract useful tests and edge cases.", usage: "/test", kind: "diagnostic" },
    { id: "diagram", label: "Diagram", description: "Ask for a Mermaid-style diagram.", usage: "/diagram", kind: "visual" },
    { id: "formula", label: "Formula", description: "Ask for math or notation support.", usage: "/formula", kind: "visual" },
];

export const AI_MENTION_OPTIONS = [
    { id: "leetcode", label: "@leetcode", description: "LeetCode platform context", kind: "platform" },
    { id: "geeksforgeeks", label: "@geeksforgeeks", description: "GeeksForGeeks platform context", kind: "platform" },
    { id: "codeforces", label: "@codeforces", description: "Codeforces platform context", kind: "platform" },
    { id: "github", label: "@github", description: "GitHub sync / repo context", kind: "git" },
    { id: "gitlab", label: "@gitlab", description: "GitLab sync / repo context", kind: "git" },
    { id: "bitbucket", label: "@bitbucket", description: "Bitbucket sync / repo context", kind: "git" },
    { id: "gemini", label: "@gemini", description: "Google Gemini provider", kind: "ai" },
    { id: "openai", label: "@openai", description: "OpenAI provider", kind: "ai" },
    { id: "claude", label: "@claude", description: "Anthropic Claude provider", kind: "ai" },
    { id: "deepseek", label: "@deepseek", description: "DeepSeek provider", kind: "ai" },
    { id: "ollama", label: "@ollama", description: "Local Ollama provider", kind: "ai" },
    { id: "openrouter", label: "@openrouter", description: "OpenRouter provider", kind: "ai" },
];

export function getCommandSuggestions(query = "") {
    const q = String(query || "").toLowerCase();
    return CHAT_COMMANDS.filter((command) => {
        if (!q) return true;
        return [command.id, command.label, command.description, command.usage]
            .some((value) => String(value || "").toLowerCase().includes(q));
    });
}

export function getMentionSuggestions(query = "") {
    const q = String(query || "").toLowerCase();
    return AI_MENTION_OPTIONS.filter((item) => {
        if (!q) return true;
        return [item.id, item.label, item.description, item.kind]
            .some((value) => String(value || "").toLowerCase().includes(q));
    });
}

export function getUsedCommands(text) {
    const vars = [];
    const regex = /\/(\w+)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const command = match[1];
        if (CHAT_COMMANDS.some((item) => item.id === command) && !vars.includes(command)) {
            vars.push(command);
        }
    }
    return vars;
}

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

    if (expanded.includes("/explain")) {
        expanded = expanded.replace(/\/explain/g, "Please explain the idea step by step for a DSA learner, including the invariant, edge cases, and why the solution works.");
    }

    if (expanded.includes("/optimize")) {
        expanded = expanded.replace(/\/optimize/g, "Please suggest one concrete optimization, explain the trade-off, and show how it improves the solution.");
    }

    if (expanded.includes("/complexity")) {
        expanded = expanded.replace(/\/complexity/g, "Please analyze the time and space complexity and briefly justify the Big-O result.");
    }

    if (expanded.includes("/test")) {
        expanded = expanded.replace(/\/test/g, "Please extract representative tests and edge cases, preferably in a structured list or JSON.");
    }

    if (expanded.includes("/diagram")) {
        expanded = expanded.replace(/\/diagram/g, "Please provide a Mermaid-style diagram or flow description that helps explain the algorithm.");
    }

    if (expanded.includes("/formula")) {
        expanded = expanded.replace(/\/formula/g, "Please include relevant formulas or notation and format them clearly when useful.");
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
                "explain",
                "optimize",
                "complexity",
                "test",
                "diagram",
                "formula",
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
