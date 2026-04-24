/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from '../../vendor/preact-bundle.js';
import { useState, useMemo } from '../../vendor/preact-bundle.js';
import { htm } from '../../vendor/preact-bundle.js';
const html = htm.bind(h);

import { ProblemCard } from '../../ui/components/ProblemCard.js';

export function ProblemsView({ problems }) {
  const [filterDelay, setFilterDelay] = useState('All');
  
  const filtered = useMemo(() => {
    if (filterDelay === 'All') return problems;
    return problems.filter(p => p.difficulty === filterDelay);
  }, [problems, filterDelay]);

  return html`
    <div class="flex flex-col gap-6 w-full">
      <div class="flex justify-between items-center bg-[#0a0a0f] p-4 rounded-xl border border-white/5">
         <div class="flex gap-2">
           ${['All', 'Easy', 'Medium', 'Hard'].map(d => html`
            <button 
              onClick=${() => setFilterDelay(d)}
              class="px-3 py-1 text-xs rounded transition-colors ${filterDelay === d ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'}"
            >
              ${d}
            </button>
           `)}
         </div>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        ${filtered.map(p => html`<${ProblemCard} key=${p.id} problem=${p} />`)}
        ${filtered.length === 0 ? html`<p class="col-span-full py-12 text-center text-slate-500 uppercase tracking-widest text-[10px]">No problems found matching filters.</p>` : ''}
      </div>
    </div>
  `;
}
