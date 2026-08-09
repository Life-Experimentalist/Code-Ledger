/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import { useState, useEffect, useRef } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
import { renderMermaid } from "../../vendor/mermaid-stub.js";
import { renderMath, substituteLatex } from "../../vendor/katex-stub.js";
const html = htm.bind(h);

import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("AIMarkdownRenderer");

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTable(block) {
  const lines = block
    .trim()
    .split("\n")
    .filter((l) => l.trim());
  if (lines.length < 2) return escapeHtml(block);

  const parseRow = (line) =>
    line
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());

  const headers = parseRow(lines[0]);
  // lines[1] is the separator row (---|---|---), skip it
  const rows = lines.slice(2).map(parseRow);

  const th = headers
    .map(
      (h) =>
        `<th class="px-3 py-1.5 text-left text-[11px] font-semibold text-slate-300 border-b border-white/10 whitespace-nowrap">${escapeHtml(h)}</th>`,
    )
    .join("");
  const trs = rows
    .map(
      (row) =>
        `<tr class="border-b border-white/5 hover:bg-white/[0.02]">${row
          .map(
            (cell) =>
              `<td class="px-3 py-1.5 text-xs text-slate-300">${renderInline(escapeHtml(cell))}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");

  return `<div class="my-3 overflow-x-auto rounded-lg border border-white/10"><table class="w-full text-left border-collapse"><thead class="bg-white/5"><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

function _safeLink(_, label, url) {
  // Two separate concerns, both required:
  //  1. Scheme allowlist — blocks javascript:, data:, vbscript: URLs.
  //  2. Attribute escaping — a URL may pass the scheme test and still contain a
  //     quote, e.g. https://x" onmouseover="…, which would break out of the
  //     href attribute and inject an event handler.
  const safeUrl = /^https?:\/\//i.test(url) ? escapeHtml(url) : "#";
  return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="text-cyan-400 hover:text-cyan-300 underline">${label}</a>`;
}

/** Apply inline formatting to already-escaped text. */
function renderInline(t) {
  return t
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(
      /`([^`]+)`/g,
      '<code class="px-1 py-0.5 rounded bg-white/10 text-cyan-300 text-[0.85em] font-mono">$1</code>',
    )
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, _safeLink);
}

export function parseMarkdown(text) {
  if (!text) return "";

  // Stash blocks BEFORE any escaping so code content is never double-escaped.
  const stash = [];
  const S = (fragment) => {
    const key = `@@S${stash.length}@@`;
    stash.push(fragment);
    return key;
  };

  let t = String(text);

  // 1. Display math $$...$$
  t = t.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => S(renderMath(math.trim(), true)));

  // 2. Fenced code blocks ```lang\n...\n```
  t = t.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const clean = escapeHtml(code.trimEnd());
    if ((lang || "").toLowerCase() === "mermaid") {
      const src = code.trimEnd().replace(/"/g, "&quot;");
      return S(
        `<div class="my-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 overflow-hidden" data-mermaid-pending="1" data-mermaid-src="${src}">` +
          `<div class="px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-cyan-300/70 border-b border-cyan-500/10">Mermaid diagram</div>` +
          `<pre class="m-0 p-3 overflow-x-auto text-xs font-mono text-cyan-50 whitespace-pre-wrap leading-relaxed">${clean}</pre></div>`,
      );
    }
    return S(
      `<pre class="my-3 p-3 bg-black/60 rounded-lg border border-white/10 overflow-x-auto text-xs font-mono text-slate-200 leading-relaxed">` +
        `<code class="language-${lang || "plaintext"}">${clean}</code></pre>`,
    );
  });

  // 3. Inline math $...$
  t = t.replace(/\$([^\$\n]+?)\$/g, (_, math) => S(renderMath(math.trim(), false)));

  // 4. Markdown tables (| col | col |\n|---|---|\n...)
  t = t.replace(/((?:\|.+\|\n?){3,})/g, (block) => {
    const lines = block.trim().split("\n");
    const hasSep = lines.some((l) => /^\|[\s\-:]+\|/.test(l));
    if (!hasSep || lines.length < 2) return block;
    return S(renderTable(block));
  });

  // 5. Inline code `...` (stash before HTML escaping)
  t = t.replace(/`([^`\n]+)`/g, (_, code) =>
    S(
      `<code class="px-1 py-0.5 rounded bg-white/10 text-cyan-300 text-[0.85em] font-mono">${escapeHtml(code)}</code>`,
    ),
  );

  // 5b. Replace LaTeX commands in plain text (outside math/code stashes)
  t = substituteLatex(t);

  // 6. Now escape the remaining non-stash text
  t = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // 7. Block-level markdown (operate on escaped text)
  t = t
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-white mt-4 mb-1">$1</h3>')
    .replace(
      /^## (.+)$/gm,
      '<h2 class="text-sm font-bold text-slate-100 mt-4 mb-1 uppercase tracking-wide">$1</h2>',
    )
    .replace(/^# (.+)$/gm, '<h1 class="text-base font-bold text-white mt-4 mb-2">$1</h1>')
    .replace(/^---+$/gm, '<hr class="my-3 border-white/10"/>')
    .replace(
      /^> (.+)$/gm,
      '<blockquote class="pl-3 border-l-2 border-cyan-500/40 text-slate-400 italic my-1">$1</blockquote>',
    )
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, _safeLink)
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(
      /((?:<li class="ml-4 list-disc">[\s\S]+?<\/li>\n?)+)/g,
      '<ul class="my-2 space-y-0.5 text-slate-300 list-disc list-inside">$1</ul>',
    )
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(
      /((?:<li class="ml-4 list-decimal">[\s\S]+?<\/li>\n?)+)/g,
      '<ol class="my-2 space-y-0.5 text-slate-300 list-decimal list-inside">$1</ol>',
    )
    .replace(/\n\n+/g, '</p><p class="mb-2 leading-relaxed">')
    .replace(/\n/g, "<br>");

  t = `<p class="mb-2 leading-relaxed">${t}</p>`;

  // 8. Restore stashes
  stash.forEach((fragment, i) => {
    t = t.replace(`@@S${i}@@`, fragment);
  });

  return t;
}

let _mermaidCounter = 0;

export function AIMarkdownRenderer({ content, copyableEnabled = false }) {
  const [copied, setCopied] = useState(false);
  const [copyPrompt, setCopyPrompt] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.querySelectorAll("[data-mermaid-pending]").forEach(async (div) => {
      const src = div.getAttribute("data-mermaid-src") || "";
      if (!src) return;
      div.removeAttribute("data-mermaid-pending");
      const id = `cl-mermaid-${++_mermaidCounter}`;
      try {
        const svg = await renderMermaid(id, src.replace(/&quot;/g, '"'));
        div.innerHTML = svg;
        div.style.padding = "1rem";
      } catch {
        // keep pre fallback
      }
    });
  }, [content]);

  useEffect(() => {
    if (!copyableEnabled) return;
    function onCopy(e) {
      const selected = window.getSelection().toString();
      if (selected.length < 10) return;
      if (containerRef.current && !containerRef.current.contains(window.getSelection().anchorNode))
        return;
      e.preventDefault();
      setCopyPrompt({ text: selected, x: e.clientX, y: e.clientY });
      setTimeout(() => setCopyPrompt(null), 15 * 60 * 1000);
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
    <div
      ref=${containerRef}
      class="ai-markdown-content prose prose-invert max-w-none text-sm text-slate-200 leading-relaxed"
      dangerouslySetInnerHTML=${{ __html: parseMarkdown(content) }}
    ></div>

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
          <span class="text-[10px] text-slate-500">(expires 15 min)</span>
        </div>
      </div>
    `}
    ${copied &&
    html`
      <div
        class="fixed bottom-4 right-4 z-50 bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm"
      >
        Copied ✓
      </div>
    `}
  `;
}

export { escapeHtml };
