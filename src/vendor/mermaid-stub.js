// Extension CSP blocks external scripts. Use mermaid.ink to render diagrams
// as images — no script injection required, works in both extension and web contexts.

/**
 * Rewrite horizontal graph directions to vertical (top-down) when the user
 * hasn't explicitly chosen one, or has chosen LR/RL (horizontal).
 */
function preferVertical(src) {
    // Already vertical: TD, TB, BT — leave alone
    // Horizontal: LR, RL — switch to TD
    // No direction specified — add TD
    return src
        .replace(/^(graph)\s+(LR|RL)\s/im, "$1 TD ")
        .replace(/^(flowchart)\s+(LR|RL)\s/im, "$1 TD ")
        .replace(/^(graph)\s*(\n|$)/im, "graph TD\n")
        .replace(/^(flowchart)\s*(\n|$)/im, "flowchart TD\n");
}

function toBase64(str) {
    // Safe Unicode-to-base64 for btoa
    return btoa(unescape(encodeURIComponent(str)));
}

/**
 * Renders a mermaid diagram source string into an <img> pointing at mermaid.ink.
 * Falls back to showing the code block if encoding fails.
 * @param {string} _id  Unused (kept for API compatibility)
 * @param {string} src  Raw mermaid diagram source
 * @returns {Promise<string>} HTML string (img or pre fallback)
 */
export async function renderMermaid(_id, src) {
    try {
        const diagram = preferVertical(src.trim());
        const encoded = toBase64(diagram);
        const imgUrl = `https://mermaid.ink/svg/${encoded}`;
        const liveUrl = `https://mermaid.live/view#base64:${encoded}`;

        return (
            `<div class="mermaid-rendered" style="text-align:center;padding:0.5rem 0">` +
            `<img src="${imgUrl}" alt="Mermaid diagram" loading="lazy" style="max-width:100%;height:auto;border-radius:8px" ` +
            `onerror="this.style.display='none';this.nextElementSibling.style.display='block'" />` +
            `<div style="display:none;font-size:11px;color:#64748b;margin-top:4px">` +
            `<span>Could not load diagram image. </span>` +
            `<a href="${liveUrl}" target="_blank" rel="noopener" style="color:#06b6d4">Open in Mermaid Live ↗</a>` +
            `</div>` +
            `<div style="text-align:right;margin-top:2px">` +
            `<a href="${liveUrl}" target="_blank" rel="noopener" ` +
            `style="font-size:10px;color:#475569;text-decoration:none;opacity:0.7">Open in Mermaid Live ↗</a>` +
            `</div>` +
            `</div>`
        );
    } catch {
        // Leave the <pre> fallback intact (handled by AIMarkdownRenderer useEffect catch)
        throw new Error("mermaid.ink encoding failed");
    }
}
