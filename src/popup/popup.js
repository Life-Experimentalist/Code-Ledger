/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, render } from '../vendor/preact-bundle.js';
import { useState, useEffect } from '../vendor/preact-bundle.js';
import { htm } from '../vendor/preact-bundle.js';
const html = htm.bind(h);
import { Storage } from '../core/storage.js';
import { tabs, runtime } from '../lib/browser-compat.js';

function PopupApp() {
  const [stats, setStats] = useState({ total: 0, easy: 0, medium: 0, hard: 0 });
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    Storage.getAllProblems().then(problems => {
      setStats({
        total: problems.length,
        easy: problems.filter(p => p.difficulty === 'Easy').length,
        medium: problems.filter(p => p.difficulty === 'Medium').length,
        hard: problems.filter(p => p.difficulty === 'Hard').length
      });
      // Sort by timestamp desc and take top 3
      setRecent(problems.sort((a, b) => b.timestamp - a.timestamp).slice(0, 3));
    });
  }, []);

  const openLibrary = (tab = 'dashboard') => {
    const url = runtime.getURL(`library/library.html?tab=${tab}`);
    try {
      if (tabs && typeof tabs.create === 'function') {
        tabs.create({ url });
      } else {
        window.open(url, '_blank');
      }
    } catch (e) {
      window.open(url, '_blank');
    }
  };

  const searchLibrary = (q) => {
    const url = runtime.getURL(`library/library.html?tab=search&q=${encodeURIComponent(q)}`);
    try { tabs.create({ url }); } catch { window.open(url, '_blank'); }
  };

  return html`
    <div class="flex flex-col h-full bg-[#050508] p-4 text-white">
      <div class="flex items-center gap-3 mb-6">
        <img src="../assets/images/icon-transparent.png" class="w-8 h-8 object-contain drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]" alt="CL Logo" />
        <h1 class="text-lg font-semibold tracking-tight">CodeLedger</h1>
      </div>
      
      <div class="grid grid-cols-3 gap-2 mb-4">
        <div class="bg-white/5 border border-white/5 rounded p-2 flex flex-col items-center">
          <span class="text-emerald-400 font-bold">${stats.easy}</span>
          <span class="text-[10px] text-slate-500 uppercase">Easy</span>
        </div>
        <div class="bg-white/5 border border-white/5 rounded p-2 flex flex-col items-center">
          <span class="text-amber-400 font-bold">${stats.medium}</span>
          <span class="text-[10px] text-slate-500 uppercase">Med</span>
        </div>
        <div class="bg-white/5 border border-white/5 rounded p-2 flex flex-col items-center">
          <span class="text-rose-400 font-bold">${stats.hard}</span>
          <span class="text-[10px] text-slate-500 uppercase">Hard</span>
        </div>
      </div>

      <div class="mb-4 flex-1">
        <div class="mb-3">
          <input id="popup-search" placeholder="Search problems or topics" class="w-full px-3 py-2 rounded bg-black border border-white/10 text-sm text-white" />
          <div class="mt-2 flex gap-2">
            <button class="flex-1 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400 text-xs font-bold uppercase tracking-widest" onClick=${() => searchLibrary(document.getElementById('popup-search').value || '')}>Search</button>
            <button class="flex-1 py-2 bg-white/5 border border-white/10 rounded-lg text-slate-300 text-xs font-bold uppercase tracking-widest" onClick=${() => openLibrary('add')}>Add Solve</button>
          </div>
        </div>
        <h2 class="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Recent Solves</h2>
        ${recent.length === 0 ? html`
          <div class="text-[10px] text-slate-600 italic py-2 text-center bg-white/5 rounded border border-white/5">
            No problems tracked yet.
          </div>
        ` : html`
          <div class="flex flex-col gap-2">
            ${recent.map(p => html`
              <div class="p-2 bg-white/5 border border-white/5 rounded flex justify-between items-center group cursor-default">
                 <div class="truncate max-w-[200px]">
                   <p class="text-xs truncate text-slate-300 group-hover:text-cyan-400 transition-colors">${p.title}</p>
                   <p class="text-[9px] text-slate-500 uppercase hidden sm:block">${p.platform} • ${p.difficulty}</p>
                 </div>
                 <span class="text-[10px] font-mono text-slate-500 border border-white/10 px-1 rounded">${p.lang?.ext || 'js'}</span>
              </div>
            `)}
          </div>
        `}
      </div>
      
      <div class="flex flex-col gap-2 mb-2">
        <button class="w-full py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400 text-xs font-bold uppercase tracking-widest hover:bg-cyan-500/20 transition-colors"
                onClick=${() => openLibrary('dashboard')}>
          Open Dashboard
        </button>
        <button class="w-full py-2 bg-white/5 border border-white/10 rounded-lg text-slate-300 text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-colors"
                onClick=${() => openLibrary('settings')}>
          Settings
        </button>
      </div>

      <div class="mt-auto pt-4 border-t border-white/5 flex gap-2 items-center justify-center">
        <div class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse"></div>
        <span class="text-[10px] uppercase tracking-widest text-emerald-500/80">Tracker Active</span>
      </div>
    </div>
  `;
}

render(html`<${PopupApp} />`, document.getElementById('root'));
