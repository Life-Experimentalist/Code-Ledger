/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useRef, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

/**
 * Multi-line AI chat input with variable support
 * Variables: /mycode, /problem, /errors, /submission, /hints, /similar, /constraints
 */
export function MultiLineAIChatInput({
    value,
    onChange,
    onSend,
    disabled = false,
    problem = null,
    availableVariables = ["mycode", "problem", "errors", "submission", "hints", "similar", "constraints"],
}) {
    const textareaRef = useRef(null);
    const [showVariableHint, setShowVariableHint] = useState(false);
    const [matchedVars, setMatchedVars] = useState([]);

    // Monitor input for variable hints (e.g., "/" triggers suggestion)
    useEffect(() => {
        if (!textareaRef.current) return;
        const textarea = textareaRef.current;

        function onInput() {
            const text = textarea.value;
            const lines = text.split("\n");
            const currentLine = lines[lines.length - 1];
            const lastWord = currentLine.split(/\s/).pop() || "";

            if (lastWord.startsWith("/")) {
                const query = lastWord.slice(1).toLowerCase();
                const matches = availableVariables.filter((v) => v.startsWith(query));
                setMatchedVars(matches);
                setShowVariableHint(matches.length > 0);
            } else {
                setShowVariableHint(false);
            }
        }

        textarea.addEventListener("input", onInput);
        return () => textarea.removeEventListener("input", onInput);
    }, [availableVariables]);

    function handleKeyDown(e) {
        // Ctrl+Enter to send
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            onSend?.();
            return;
        }

        // Tab for indent (not blur)
        if (e.key === "Tab") {
            e.preventDefault();
            const textarea = textareaRef.current;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const newValue = value.substring(0, start) + "\t" + value.substring(end);
            onChange?.(newValue);
            // Move cursor after inserted tab
            setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = start + 1;
            }, 0);
            return;
        }
    }

    function insertVariable(varName) {
        if (!textareaRef.current) return;
        const textarea = textareaRef.current;
        const text = value || "";
        const lines = text.split("\n");
        const lastLine = lines[lines.length - 1];
        const lastWordStart = lastLine.lastIndexOf("/");

        if (lastWordStart !== -1) {
            const beforeVar = text.substring(0, text.length - lastLine.length + lastWordStart);
            const afterVar = text.substring(text.length - lastLine.length + lastLine.length);
            const newValue = beforeVar + "/" + varName + " " + afterVar;
            onChange?.(newValue);
            setShowVariableHint(false);
            setTimeout(() => {
                textarea.focus();
            }, 0);
        }
    }

    return html`
    <div class="relative w-full">
      <textarea
        ref=${textareaRef}
        value=${value}
        onChange=${(e) => onChange?.(e.target.value)}
        onKeyDown=${handleKeyDown}
        placeholder="Type your question... (Ctrl+Enter to send, Tab for indent)"
        disabled=${disabled}
        class="w-full min-h-20 max-h-40 p-3 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 resize-none focus:border-cyan-500 focus:outline-none transition-colors"
      ></textarea>

      <!-- Variable hint dropdown -->
      ${showVariableHint && html`
        <div class="absolute bottom-full left-0 mb-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg overflow-hidden z-10">
          ${matchedVars.map(
        (varName) => html`
              <button
                onClick=${() => insertVariable(varName)}
                class="block w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
              >
                /${varName}
              </button>
            `
    )}
        </div>
      `}

      <!-- Hint text -->
      <div class="text-xs text-slate-500 mt-1 flex items-center gap-2">
        <span>Ctrl+Enter to send • Type / for variables</span>
        <div class="flex gap-1 flex-wrap ml-auto">
          ${availableVariables.slice(0, 3).map((v) => html` <code class="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px]">/${v}</code> `)}
          ${availableVariables.length > 3 && html` <code class="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px]">+${availableVariables.length - 3} more</code> `}
        </div>
      </div>
    </div>
  `;
}
