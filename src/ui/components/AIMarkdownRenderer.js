/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import { useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

/**
 * Simple markdown-to-HTML renderer with syntax highlighting for code blocks.
 * Renders inline and block markdown with proper escaping.
 */
function parseMarkdown(text) {
    if (!text) return "";

    let result = text
        // Code blocks (```lang...```)
        .replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code class="hljs language-${lang || "plaintext"}">${escapeHtml(code.trim())}</code></pre>`;
        })
        // Inline code
        .replace(/`([^`]+)`/g, (match, code) => `<code class="inline-code">${escapeHtml(code)}</code>`)
        // Headers
        .replace(/^### (.*?)$/gm, "<h3>$1</h3>")
        .replace(/^## (.*?)$/gm, "<h2>$1</h2>")
        .replace(/^# (.*?)$/gm, "<h1>$1</h1>")
        // Bold
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/__(.+?)__/g, "<strong>$1</strong>")
        // Italic
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/_(.+?)_/g, "<em>$1</em>")
        // Lists
        .replace(/^- (.*?)$/gm, "<li>$1</li>")
        .replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>")
        // Line breaks
        .replace(/\n\n/g, "</p><p>")
        .replace(/\n/g, "<br>");

    return result;
}

function escapeHtml(text) {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return text.replace(/[&<>"']/g, (c) => map[c]);
}

/**
 * AIMarkdownRenderer component
 * Renders markdown with copy-on-select behavior (respecting global setting)
 */
export function AIMarkdownRenderer({ content, copyableEnabled = false }) {
    const [copied, setCopied] = useState(false);
    const [copyPrompt, setCopyPrompt] = useState(null);
    const copyTimeoutRef = null;

    useEffect(() => {
        if (!copyableEnabled) return;

        function onCopy(e) {
            const selected = window.getSelection().toString();
            if (selected.length < 10) return; // Ignore tiny selections

            e.preventDefault();
            setCopyPrompt({ text: selected, x: e.clientX, y: e.clientY });

            setTimeout(() => setCopyPrompt(null), 15 * 60 * 1000); // 15 min expiry
        }

        const container = document.currentScript?.parentElement;
        if (container) {
            container.addEventListener("copy", onCopy);
            return () => container.removeEventListener("copy", onCopy);
        }
    }, [copyableEnabled]);

    const handleCopyNow = () => {
        if (copyPrompt?.text) {
            navigator.clipboard.writeText(copyPrompt.text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            setCopyPrompt(null);
        }
    };

    return html`
    <div class="ai-markdown-content prose prose-invert max-w-none text-sm text-slate-200 leading-relaxed">
      ${content && html([content])}
    </div>

    ${copyPrompt &&
        html`
      <div
        class="fixed z-50 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 shadow-xl"
        style=${{
                left: `${copyPrompt.x}px`,
                top: `${copyPrompt.y + 10}px`,
            }}
      >
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-300">Copy text?</span>
          <button
            onClick=${handleCopyNow}
            class="px-2 py-1 text-xs bg-cyan-600 hover:bg-cyan-700 text-white rounded transition-colors"
          >
            Copy
          </button>
          <span class="text-[10px] text-slate-500">(expires in 15 min)</span>
        </div>
      </div>
    `}

    ${copied &&
        html`
      <div class="fixed bottom-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
        Copied to clipboard! ✓
      </div>
    `}
  `;
}

export { parseMarkdown, escapeHtml };
