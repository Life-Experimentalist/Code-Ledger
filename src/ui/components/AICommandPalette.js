/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

export function AICommandPalette({
    items = [],
    visible = false,
    activeIndex = 0,
    onSelect,
    title = "Commands",
    emptyLabel = "No matches",
}) {
    if (!visible) return null;

    return html`
      <div class="absolute left-0 right-0 bottom-full z-20 mb-2 rounded-xl border border-slate-700 bg-slate-950/98 shadow-2xl overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900/80">
          <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">${title}</span>
          <span class="text-[10px] text-slate-600">${items.length} item${items.length === 1 ? "" : "s"}</span>
        </div>
        <div class="max-h-56 overflow-y-auto">
          ${items.length === 0 ? html`
            <div class="px-3 py-3 text-sm text-slate-500">${emptyLabel}</div>
          ` : items.map((item, index) => html`
            <button
              type="button"
              onMouseDown=${(e) => e.preventDefault()}
              onClick=${() => onSelect?.(item, index)}
              class="w-full text-left px-3 py-2 border-b border-slate-900/70 last:border-b-0 transition-colors ${index === activeIndex ? "bg-cyan-500/10 text-cyan-100" : "hover:bg-slate-900 text-slate-200"}"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="text-sm font-medium truncate">${item.label || item.name || item.id}</div>
                  <div class="text-[11px] text-slate-500 leading-snug mt-0.5">${item.description || item.help || item.subtitle || ""}</div>
                </div>
                <span class="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400">${item.usage || item.kind || ""}</span>
              </div>
            </button>
          `)}
        </div>
      </div>
    `;
}