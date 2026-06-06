// KaTeX CDN loading is blocked by the extension's Content Security Policy.
// Math expressions are rendered as styled code blocks instead.

const LATEX_SYMBOLS = [
  [/\\times/g, "×"],
  [/\\cdot/g, "·"],
  [/\\leq|\\le(?!q)/g, "≤"],
  [/\\geq|\\ge(?!q)/g, "≥"],
  [/\\neq|\\ne(?!q)/g, "≠"],
  [/\\sqrt/g, "√"],
  [/\\infty/g, "∞"],
  [/\\ldots|\\cdots/g, "…"],
  [/\\rightarrow|\\to(?!p)/g, "→"],
  [/\\leftarrow/g, "←"],
  [/\\Rightarrow/g, "⇒"],
  [/\\Leftarrow/g, "⇐"],
  [/\\sum/g, "∑"],
  [/\\prod/g, "∏"],
  [/\\int/g, "∫"],
  [/\\alpha/g, "α"],
  [/\\beta/g, "β"],
  [/\\gamma/g, "γ"],
  [/\\delta/g, "δ"],
  [/\\epsilon/g, "ε"],
  [/\\theta/g, "θ"],
  [/\\lambda/g, "λ"],
  [/\\mu/g, "μ"],
  [/\\pi/g, "π"],
  [/\\sigma/g, "σ"],
  [/\\omega/g, "ω"],
  [/\\log/g, "log"],
  [/\\ln/g, "ln"],
  [/\\max/g, "max"],
  [/\\min/g, "min"],
  [/\\lfloor/g, "⌊"],
  [/\\rfloor/g, "⌋"],
  [/\\lceil/g, "⌈"],
  [/\\rceil/g, "⌉"],
];

export function substituteLatex(text) {
  let t = text;
  for (const [re, sym] of LATEX_SYMBOLS) t = t.replace(re, sym);
  return t;
}

export async function ensureKatex() {
  return null;
}

export function renderMath(tex, display = false) {
  const substituted = substituteLatex(tex);
  const escaped = substituted.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (display) {
    return `<div class="my-2 overflow-x-auto rounded bg-black/40 border border-cyan-500/20 px-3 py-2 text-xs font-mono text-cyan-300/80 text-center">${escaped}</div>`;
  }
  return `<code class="px-1 py-0.5 rounded bg-black/40 border border-cyan-500/20 text-cyan-300/80 text-[0.85em] font-mono">${escaped}</code>`;
}
