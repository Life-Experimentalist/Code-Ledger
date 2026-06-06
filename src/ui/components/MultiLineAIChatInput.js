/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useRef, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);
import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("MultiLineAIChatInput");

import { AICommandPalette } from "./AICommandPalette.js";
import {
  CHAT_COMMANDS,
  AI_MENTION_OPTIONS,
  getCommandSuggestions,
  getMentionSuggestions,
} from "../../lib/chat-variables.js";

/**
 * Multi-line AI chat input with / command and @ mention support.
 *
 * Dropdown rules:
 *  - Opens when the token immediately before the cursor starts with / or @
 *  - Stays open while that token persists (backspace removes chars, dropdown updates)
 *  - Closes on Escape, Enter-select, click-select, or when no trigger token
 *  - Only native DOM events drive the dropdown — no effect on the value prop change
 */
export function MultiLineAIChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  problem = null,
  availableVariables = [
    "mycode",
    "problem",
    "errors",
    "submission",
    "hints",
    "similar",
    "constraints",
  ],
  commandItems = CHAT_COMMANDS,
  mentionItems = AI_MENTION_OPTIONS,
}) {
  const textareaRef = useRef(null);
  // Store latest commandItems/mentionItems in refs so native listeners always see fresh values
  const commandItemsRef = useRef(commandItems);
  const mentionItemsRef = useRef(mentionItems);
  useEffect(() => {
    commandItemsRef.current = commandItems;
  }, [commandItems]);
  useEffect(() => {
    mentionItemsRef.current = mentionItems;
  }, [mentionItems]);

  const [suggestionState, setSuggestionState] = useState({
    visible: false,
    mode: "command",
    query: "",
    items: [],
    activeIndex: 0,
    start: 0,
    end: 0,
    position: null,
  });
  // Track whether we're in a suggestion session to correctly handle backspace
  const tokenActiveRef = useRef(false);

  // ── Core dropdown logic ───────────────────────────────────────────────────

  function computeSuggestions(text, cursor) {
    const beforeCursor = text.slice(0, cursor);
    // Match a / or @ token starting at a word boundary right before the cursor
    const tokenMatch = beforeCursor.match(/(^|\s)([\/@][^\s]*)$/);
    if (!tokenMatch) return null;

    const token = tokenMatch[2];
    const prefix = token[0];
    const query = token.slice(1).toLowerCase();
    const all =
      prefix === "/"
        ? getCommandSuggestions(query).filter((i) =>
            commandItemsRef.current.some((d) => d.id === i.id),
          )
        : getMentionSuggestions(query).filter((i) =>
            mentionItemsRef.current.some((d) => d.id === i.id),
          );

    const tokenStart = cursor - token.length;
    return { prefix, query, items: all, start: tokenStart, end: cursor };
  }

  function showSuggestions(text, cursor) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const result = computeSuggestions(text, cursor);

    if (!result) {
      tokenActiveRef.current = false;
      setSuggestionState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    tokenActiveRef.current = true;
    const rect = textarea.getBoundingClientRect();
    setSuggestionState({
      visible: true,
      mode: result.prefix === "/" ? "command" : "mention",
      query: result.query,
      items: result.items,
      activeIndex: 0,
      start: result.start,
      end: result.end,
      position: {
        left: rect.left,
        width: rect.width,
        top: Math.max(8, rect.top - 12),
      },
    });
  }

  function hideSuggestions() {
    tokenActiveRef.current = false;
    setSuggestionState((prev) => ({ ...prev, visible: false }));
  }

  // ── Token replacement on select ───────────────────────────────────────────

  function replaceToken(insertText, tokenStart, tokenEnd) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const currentVal = textarea.value;
    const nextVal = `${currentVal.slice(0, tokenStart)}${insertText}${currentVal.slice(tokenEnd)}`;
    onChange?.(nextVal);
    hideSuggestions();
    // Restore cursor after Preact's controlled value update settles
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = tokenStart + insertText.length;
      textarea.selectionStart = textarea.selectionEnd = pos;
    });
  }

  // ── Native event listeners (only place that drives the dropdown) ──────────

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    function onInput() {
      // Use textarea.value directly — this is the real DOM value, always up to date
      showSuggestions(textarea.value, textarea.selectionStart ?? textarea.value.length);
    }

    function onClick() {
      // Re-evaluate on click in case cursor moved into/out of a token
      showSuggestions(textarea.value, textarea.selectionStart ?? textarea.value.length);
    }

    textarea.addEventListener("input", onInput);
    textarea.addEventListener("click", onClick);
    return () => {
      textarea.removeEventListener("input", onInput);
      textarea.removeEventListener("click", onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — refs keep commandItems/mentionItems fresh

  // ── Keyboard handling ─────────────────────────────────────────────────────

  function handleKeyDown(e) {
    if (suggestionState.visible && suggestionState.items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSuggestionState((prev) => ({
          ...prev,
          activeIndex: (prev.activeIndex + 1) % prev.items.length,
        }));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSuggestionState((prev) => ({
          ...prev,
          activeIndex: (prev.activeIndex - 1 + prev.items.length) % prev.items.length,
        }));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const sel = suggestionState.items[suggestionState.activeIndex];
        if (sel) {
          const insert = suggestionState.mode === "command" ? `/${sel.id} ` : `@${sel.id} `;
          replaceToken(insert, suggestionState.start, suggestionState.end);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        hideSuggestions();
        return;
      }
      // Tab also selects current suggestion
      if (e.key === "Tab" && suggestionState.items.length > 0) {
        e.preventDefault();
        const sel = suggestionState.items[suggestionState.activeIndex];
        if (sel) {
          const insert = suggestionState.mode === "command" ? `/${sel.id} ` : `@${sel.id} `;
          replaceToken(insert, suggestionState.start, suggestionState.end);
        }
        return;
      }
    }

    // Tab indent (only when no suggestion active)
    if (e.key === "Tab" && !suggestionState.visible) {
      e.preventDefault();
      const ta = textareaRef.current;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const nextVal = (value || "").substring(0, start) + "  " + (value || "").substring(end);
      onChange?.(nextVal);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
      return;
    }

    // Ctrl/Cmd+Enter sends
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onSend?.();
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const cmdLabel = suggestionState.mode === "command" ? "Commands" : "Mentions";
  const cmdEmpty =
    suggestionState.mode === "command" ? "No matching commands." : "No matching tags.";

  return html`
    <div class="relative w-full">
      <textarea
        ref=${textareaRef}
        value=${value}
        onChange=${(e) => onChange?.(e.target.value)}
        onKeyDown=${handleKeyDown}
        placeholder="Type your question… (Ctrl+Enter to send, / for commands, @ for mentions)"
        disabled=${disabled}
        class="w-full min-h-20 max-h-48 p-3 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 resize-none focus:border-cyan-500 focus:outline-none transition-colors text-sm leading-relaxed"
      ></textarea>

      <${AICommandPalette}
        visible=${suggestionState.visible && suggestionState.items.length > 0}
        items=${suggestionState.items}
        activeIndex=${suggestionState.activeIndex}
        title=${cmdLabel}
        emptyLabel=${cmdEmpty}
        style=${suggestionState.position
          ? {
              left: `${suggestionState.position.left}px`,
              top: `${Math.max(8, suggestionState.position.top - 8)}px`,
              width: `${suggestionState.position.width}px`,
              transform: "translateY(-100%)",
            }
          : {}}
        onSelect=${(item) => {
          const insert = suggestionState.mode === "command" ? `/${item.id} ` : `@${item.id} `;
          replaceToken(insert, suggestionState.start, suggestionState.end);
        }}
      />

      <!-- Hint row -->
      <div class="text-[11px] text-slate-600 mt-1 flex items-center gap-3">
        <span>Ctrl+Enter to send</span>
        <span class="text-slate-700">·</span>
        <span>/ commands</span>
        <span class="text-slate-700">·</span>
        <span>@ mentions</span>
        <div class="flex gap-1 flex-wrap ml-auto">
          ${availableVariables
            .slice(0, 4)
            .map(
              (v) => html`
                <code class="px-1.5 py-0.5 bg-slate-800 text-slate-500 rounded text-[10px]"
                  >/${v}</code
                >
              `,
            )}
          ${availableVariables.length > 4
            ? html`
                <code class="px-1.5 py-0.5 bg-slate-800 text-slate-500 rounded text-[10px]"
                  >+${availableVariables.length - 4}</code
                >
              `
            : ""}
        </div>
      </div>
    </div>
  `;
}
