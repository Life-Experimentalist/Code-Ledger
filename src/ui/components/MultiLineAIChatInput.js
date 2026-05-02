/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useRef, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);
import { AICommandPalette } from "./AICommandPalette.js";
import { CHAT_COMMANDS, AI_MENTION_OPTIONS, getCommandSuggestions, getMentionSuggestions } from "../../lib/chat-variables.js";

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
  commandItems = CHAT_COMMANDS,
  mentionItems = AI_MENTION_OPTIONS,
}) {
  const textareaRef = useRef(null);
  const [showVariableHint, setShowVariableHint] = useState(false);
  const [matchedVars, setMatchedVars] = useState([]);
  const [suggestionState, setSuggestionState] = useState({ visible: false, mode: "command", query: "", items: [], activeIndex: 0, start: 0, end: 0 });

  const updateSuggestionState = (text, cursor) => {
    const beforeCursor = text.slice(0, cursor);
    const tokenMatch = beforeCursor.match(/(^|\s)([\/\@][^\s]*)$/);
    if (!tokenMatch) {
      setSuggestionState((prev) => prev.visible ? { ...prev, visible: false } : prev);
      return;
    }

    const token = tokenMatch[2] || "";
    const prefix = token[0];
    const query = token.slice(1).toLowerCase();
    const items = prefix === "/"
      ? getCommandSuggestions(query).filter((item) => commandItems.some((def) => def.id === item.id))
      : getMentionSuggestions(query).filter((item) => mentionItems.some((def) => def.id === item.id));

    setSuggestionState({
      visible: true,
      mode: prefix === "/" ? "command" : "mention",
      query,
      items,
      activeIndex: 0,
      start: cursor - token.length,
      end: cursor,
    });
  };

  const replaceToken = (insertText) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const currentValue = value || "";
    const { start, end } = suggestionState;
    const nextValue = `${currentValue.slice(0, start)}${insertText}${currentValue.slice(end)}`;
    onChange?.(nextValue);
    setSuggestionState((prev) => ({ ...prev, visible: false }));
    requestAnimationFrame(() => {
      const nextCursor = start + insertText.length;
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = nextCursor;
    });
  };

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

      updateSuggestionState(text, textarea.selectionStart ?? text.length);
    }

    textarea.addEventListener("input", onInput);
    textarea.addEventListener("click", onInput);
    textarea.addEventListener("keyup", onInput);
    return () => {
      textarea.removeEventListener("input", onInput);
      textarea.removeEventListener("click", onInput);
      textarea.removeEventListener("keyup", onInput);
    };
  }, [availableVariables]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart ?? (value || "").length;
    updateSuggestionState(value || "", cursor);
  }, [value, commandItems, mentionItems]);

  function handleKeyDown(e) {
    if (suggestionState.visible && suggestionState.items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSuggestionState((prev) => ({ ...prev, activeIndex: (prev.activeIndex + 1) % prev.items.length }));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSuggestionState((prev) => ({ ...prev, activeIndex: (prev.activeIndex - 1 + prev.items.length) % prev.items.length }));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const selected = suggestionState.items[suggestionState.activeIndex];
        if (selected) {
          replaceToken(suggestionState.mode === "command" ? `/${selected.id} ` : `@${selected.id} `);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSuggestionState((prev) => ({ ...prev, visible: false }));
        return;
      }
    }

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
    replaceToken(`/${varName} `);
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

      <${AICommandPalette}
        visible=${suggestionState.visible}
        items=${suggestionState.items}
        activeIndex=${suggestionState.activeIndex}
        title=${suggestionState.mode === "command" ? "Commands" : "Tags"}
        emptyLabel=${suggestionState.mode === "command" ? "No commands match." : "No tags match."}
        onSelect=${(item) => replaceToken(suggestionState.mode === "command" ? `/${item.id} ` : `@${item.id} `)}
      />

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
        <span>Ctrl+Enter to send • Type / for commands • Type @ for tags</span>
        <div class="flex gap-1 flex-wrap ml-auto">
          ${availableVariables.slice(0, 3).map((v) => html` <code class="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px]">/${v}</code> `)}
          ${availableVariables.length > 3 && html` <code class="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px]">+${availableVariables.length - 3} more</code> `}
        </div>
      </div>
    </div>
  `;
}
