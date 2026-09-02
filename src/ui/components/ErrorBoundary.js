/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Catches errors thrown while rendering the tree below it and shows a readable
 * panel instead of the blank page Preact leaves behind when a render throws.
 *
 * What it does NOT catch: errors inside event handlers, and anything thrown from
 * a promise or a timer. Those never pass through the renderer, so no boundary in
 * any framework sees them — they still land in the console. This is only a guard
 * against a bad render, which is the failure that costs the user the whole page.
 */
import { h, useErrorBoundary } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);
import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("ErrorBoundary");

export function ErrorBoundary({ label = "This page", children }) {
  const [error, resetError] = useErrorBoundary((err) => {
    dbg.error(`${label} failed to render:`, err);
  });

  if (!error) return children;

  return html`
    <div class="min-h-screen flex items-center justify-center bg-slate-950 p-6">
      <div
        class="max-w-md w-full rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-5 py-4"
      >
        <h1 class="text-sm font-semibold text-rose-300">${label} hit an error</h1>
        <p class="mt-1.5 text-xs leading-snug text-slate-400">
          Nothing was lost — your solves live in local storage and in your repository, not on this
          screen. Reloading usually clears it.
        </p>
        <pre
          class="mt-3 max-h-40 overflow-auto rounded-lg bg-black/40 p-2.5 text-[11px] leading-snug text-rose-200/80 whitespace-pre-wrap"
        >
${String(error?.stack || error?.message || error)}</pre
        >
        <div class="mt-3 flex gap-2">
          <button
            onClick=${() => location.reload()}
            class="text-xs text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/10 px-2.5 py-1 rounded transition-colors"
          >
            Reload
          </button>
          <button
            onClick=${resetError}
            class="text-xs text-slate-400 border border-white/10 hover:bg-white/5 px-2.5 py-1 rounded transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  `;
}
