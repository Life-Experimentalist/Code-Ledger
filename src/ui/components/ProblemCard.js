/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from '../../vendor/preact-bundle.js';
import { htm } from '../../vendor/preact-bundle.js';
const html = htm.bind(h);

export function ProblemCard({ problem }) {
  const difficultyStyles = {
    'Easy': 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30',
    'Medium': 'bg-amber-500/10 text-amber-500 border border-amber-500/30',
    'Hard': 'bg-red-500/10 text-red-500 border border-red-500/30'
  }[problem.difficulty] || 'bg-slate-500/10 text-slate-400 border border-slate-500/30';

  return html`
    <div class="cl-problem-card p-6 bg-[#0a0a0f] rounded-2xl border border-white/5 relative overflow-hidden group hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(6,182,212,0.1)] transition-all flex flex-col gap-4">
      <!-- Background glow effect on hover -->
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(6,182,212,0.05),transparent)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
      
      <div class="flex items-start justify-between z-10">
        <h3 class="text-lg font-light text-white tracking-tight">${problem.title}</h3>
        <span class="text-[10px] font-mono px-2 py-1 bg-white/5 border border-white/10 rounded uppercase tracking-wider text-slate-400 shrink-0 ml-2">${problem.platform}</span>
      </div>
      
      <div class="flex gap-2 text-sm z-10 items-center">
        <span class="px-2 py-1 text-[10px] font-bold rounded uppercase ${difficultyStyles}">${problem.difficulty}</span>
        <span class="text-[10px] uppercase tracking-widest text-slate-500 ml-2">Topic: ${problem.topic || 'General'}</span>
      </div>
      
      <div class="mt-auto pt-4 flex justify-between items-center z-10 border-t border-white/5">
        <div class="flex items-center gap-2">
          <div class="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></div>
          <span class="text-[10px] font-mono text-cyan-500/80 tracking-widest">${problem.lang?.name || 'Code'}</span>
        </div>
        <span class="text-[10px] font-mono text-slate-600">${new Date(problem.timestamp * 1000).toLocaleDateString()}</span>
      </div>
    </div>
  `;
}
