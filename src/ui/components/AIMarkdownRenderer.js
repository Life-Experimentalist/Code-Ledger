/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import { useState, useEffect, useRef } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

/**
 * Simple markdown-to-HTML renderer with syntax highlighting for code blocks.
 * Renders inline and block markdown with proper escaping.
 */
function parseMarkdown(text) {
  if (!text) return "";

  const blocks = [];
  const stash = (htmlFragment) => {
    const key = `@@CL_BLOCK_${blocks.length}@@`;
    blocks.push(htmlFragment);
    return key;
  };

  let result = String(text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/```([\w-]+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const clean = escapeHtml(code.trimEnd());
      if ((lang || "").toLowerCase() === "mermaid") {
        return stash(`
          <div class="my-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 overflow-hidden">
          <div class="px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-cyan-300/70 border-b border-cyan-500/10">Mermaid diagram</div>
          <pre class="m-0 p-3 overflow-x-auto text-xs font-mono text-cyan-50 whitespace-pre-wrap leading-relaxed">${clean}</pre>
          </div>
        `);
      }
      return stash(`<pre class="my-3 p-3 bg-black/60 rounded-lg border border-white/10 overflow-x-auto text-xs font-mono text-slate-200 leading-relaxed"><code class="hljs language-${lang || "plaintext"}">${clean}</code></pre>`);
    })
    .replace(/\$\$([\s\S]+?)\$\$/g, (_match, math) => {
      return stash(`<div class="my-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-100 font-mono overflow-x-auto"><span class="text-[10px] uppercase tracking-[0.2em] text-amber-300/70 mr-2">Math</span>${escapeHtml(math.trim())}</div>`);
    })
    .replace(/`([^`\n]+)`/g, (_match, code) => `<code class="px-1 py-0.5 rounded bg-white/10 text-cyan-300 text-[0.85em] font-mono">${escapeHtml(code)}</code>`)
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-white mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold text-slate-100 mt-4 mb-1 uppercase tracking-wide">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-base font-bold text-white mt-4 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-cyan-400 hover:text-cyan-300 underline">$1</a>')
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/((?:<li class="ml-4 list-disc">.+<\/li>\n?)+)/g, '<ul class="my-2 space-y-0.5 text-slate-300">$1</ul>')
    .replace(/^(\d+\. .+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/((?:<li class="ml-4 list-decimal">.+<\/li>\n?)+)/g, '<ol class="my-2 space-y-0.5 text-slate-300">$1</ol>')
    .replace(/^---+$/gm, '<hr class="my-3 border-white/10"/>')
    .replace(/\n\n+/g, '</p><p class="mb-2">')
    .replace(/\n/g, '<br>');

  result = `<p class="mb-2">${result}</p>`;
  blocks.forEach((fragment, index) => {
    result = result.replace(`@@CL_BLOCK_${index}@@`, fragment);
  });
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
  const containerRef = useRef(null);

  useEffect(() => {
    if (!copyableEnabled) return;

    function onCopy(e) {
      const selected = window.getSelection().toString();
      if (selected.length < 10) return; // Ignore tiny selections
      if (containerRef.current && !containerRef.current.contains(window.getSelection().anchorNode)) return;

      e.preventDefault();
      setCopyPrompt({ text: selected, x: e.clientX, y: e.clientY });

      setTimeout(() => setCopyPrompt(null), 15 * 60 * 1000); // 15 min expiry
    }

    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
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
    <div ref=${containerRef} class="ai-markdown-content prose prose-invert max-w-none text-sm text-slate-200 leading-relaxed" dangerouslySetInnerHTML=${{ __html: parseMarkdown(content) }}>
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
