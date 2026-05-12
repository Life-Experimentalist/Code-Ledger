// KaTeX CDN loading is blocked by the extension's Content Security Policy.
// Math expressions are rendered as styled code blocks instead.

export async function ensureKatex() {
    return null;
}

export function renderMath(tex, display = false) {
    const escaped = tex
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    if (display) {
        return `<div class="my-2 overflow-x-auto rounded bg-black/40 border border-cyan-500/20 px-3 py-2 text-xs font-mono text-cyan-300/80 text-center">${escaped}</div>`;
    }
    return `<code class="px-1 py-0.5 rounded bg-black/40 border border-cyan-500/20 text-cyan-300/80 text-[0.85em] font-mono">${escaped}</code>`;
}
