/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Compact pill-strip for selecting AI prompt mode (Tutor / Debug / Optimize / Review / Custom).
 * Preact + htm, no bundler required.
 *
 * Props:
 *   mode: string       — current mode id
 *   onChange: fn(id)   — called when user picks a mode
 */

import { h } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("AIPromptModeSelector");

export const PROMPT_MODES = [
    {
        id: "tutor",
        label: "Tutor",
        title: "Guide me toward the solution with hints",
    },
    {
        id: "debug",
        label: "Debug",
        title: "Help me find and fix errors in my code",
    },
    {
        id: "optimize",
        label: "Optimize",
        title: "Suggest performance and style improvements",
    },
    {
        id: "review",
        label: "Review",
        title: "Provide a full code review with feedback",
    },
    {
        id: "custom",
        label: "Custom",
        title: "No system prompt — free-form conversation",
    },
];

export const PROMPT_MODE_PREFIXES = {
    tutor: "Guide me toward the solution without giving it away. Ask Socratic questions.\n\n",
    debug: "Help me debug my code. Identify the error and explain why it happens.\n\n",
    optimize:
        "Review my code for performance, readability, and best practices. Be specific.\n\n",
    review: "Give a thorough code review: correctness, edge cases, complexity, style.\n\n",
    custom: "",
};

export function AIPromptModeSelector({ mode = "tutor", onChange }) {
    return html`
        <div class="flex items-center gap-1 flex-wrap">
            ${PROMPT_MODES.map(
                ({ id, label, title }) => html`
                    <button
                        key=${id}
                        title=${title}
                        onClick=${() => onChange?.(id)}
                        class="px-2 py-0.5 rounded text-[11px] font-medium border transition-colors
            ${mode === id
                            ? "bg-cyan-500/20 border-cyan-500/35 text-cyan-300"
                            : "bg-white/4 border-white/8 text-slate-500 hover:text-slate-300 hover:bg-white/8"}"
                    >
                        ${label}
                    </button>
                `
            )}
        </div>
    `;
}
