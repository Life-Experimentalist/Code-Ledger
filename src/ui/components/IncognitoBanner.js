/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from '../../vendor/preact-bundle.js';
import { htm } from '../../vendor/preact-bundle.js';
const html = htm.bind(h);

export function IncognitoBanner() {
  return html`
    <div class="bg-amber-500/10 border-l-4 border-amber-500 p-4 mb-4 flex gap-3">
       <span class="text-amber-500 mt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
       </span>
       <div class="flex flex-col">
         <span class="font-bold text-amber-500 text-sm">Incognito Mode Active</span>
         <span class="text-xs text-amber-500/80">CodeLedger will not record sessions or commit code while in incognito.</span>
       </div>
    </div>
  `;
}
