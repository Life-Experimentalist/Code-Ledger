/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from '../../vendor/preact-bundle.js';
import { htm } from '../../vendor/preact-bundle.js';
const html = htm.bind(h);

export function HandlerStatus({ name, active, lastEvent }) {
  return html`
    <div class="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-lg">
      <div class="flex items-center gap-3">
        <div class="relative flex h-3 w-3">
          ${active 
            ? html`<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>` 
            : html`<span class="relative inline-flex rounded-full h-3 w-3 bg-slate-600"></span>`
          }
        </div>
        <span class="font-medium text-slate-300">${name}</span>
      </div>
      <div class="text-xs text-slate-500 font-mono">
        ${lastEvent || 'No activity'}
      </div>
    </div>
  `;
}
