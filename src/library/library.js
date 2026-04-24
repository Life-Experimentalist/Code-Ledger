/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, render } from '../vendor/preact-bundle.js';
import { useState, useEffect } from '../vendor/preact-bundle.js';
import { htm } from '../vendor/preact-bundle.js';
const html = htm.bind(h);

import { Storage } from '../core/storage.js';
import { initializeHandlers } from '../handlers/init.js';
import { ProblemsView } from './views/ProblemsView.js';
import { AnalyticsView } from './views/AnalyticsView.js';
import { GraphView } from './views/GraphView.js';
import { SettingsView } from './views/SettingsView.js';

initializeHandlers();

function LibraryApp() {
  const [problems, setProblems] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('archive');

  useEffect(() => {
    Promise.all([Storage.getAllProblems(), Storage.getSettings()])
      .then(([p, s]) => { setProblems(p); setSettings(s); })
      .finally(() => setLoading(false));
  }, []);

  const ViewComponent = () => {
    if (loading) return html`<p class="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold p-8">Loading workspace...</p>`;
    switch (activeTab) {
      case 'archive': return html`<${ProblemsView} problems=${problems} />`;
      case 'analytics': return html`<${AnalyticsView} problems=${problems} />`;
      case 'graph': return html`<${GraphView} problems=${problems} />`;
      case 'settings': return html`<${SettingsView} settings=${settings} onSettingsChange=${(k, v) => {
         const newSets = { ...settings, [k]: v };
         setSettings(newSets);
         Storage.setSettings(newSets);
      }} />`;
      default: return null;
    }
  };

  const navItems = [
    { id: 'archive', label: 'Solution Archive', icon: '📚' },
    { id: 'analytics', label: 'Analytics', icon: '📊' },
    { id: 'graph', label: 'Knowledge Graph', icon: '🕸️' },
    { id: 'settings', label: 'Settings', icon: '⚙️' }
  ];

  return html`
    <div class="flex flex-col h-full w-full bg-[#050508]">
      <header class="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-[#0a0a0f] shrink-0">
        <div class="flex items-center gap-3">
          <img src="../assets/images/icon-transparent.png" class="w-8 h-8 object-contain drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]" alt="CL Logo" />
          <h1 class="text-lg font-semibold tracking-tight text-white">CodeLedger <span class="text-cyan-400">Library</span></h1>
        </div>
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
            <span class="text-xs font-mono uppercase tracking-widest text-emerald-500/80">Worker: Active</span>
          </div>
          <div class="h-4 w-px bg-white/10"></div>
          <div class="flex gap-4">
             <button class="text-[10px] font-bold px-3 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 uppercase tracking-widest text-slate-400 transition-colors" onClick=${() => chrome.runtime.reload()}>Restart Runtime</button>
          </div>
        </div>
      </header>

      <main class="flex-1 flex overflow-hidden">
        <aside class="w-64 border-r border-white/5 bg-[#07070b] flex flex-col p-4 shrink-0">
          <div class="mb-6">
            <p class="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold mb-4 px-2">Views</p>
            <nav class="space-y-1">
              ${navItems.map(item => html`
                <a href="#" onClick=${(e) => { e.preventDefault(); setActiveTab(item.id); }}
                   class="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${activeTab === item.id ? 'bg-cyan-500/5 text-cyan-400 border border-cyan-500/20 shadow-[inset_0_0_10px_rgba(6,182,212,0.05)]' : 'hover:bg-white/5 text-slate-400 border border-transparent'}">
                  <span class="text-sm font-medium w-6 text-center">${item.icon}</span>
                  <span class="text-sm font-medium">${item.label}</span>
                </a>
              `)}
            </nav>
          </div>
          <div class="mt-auto">
            <div class="p-4 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/5">
              <div class="flex items-center justify-between mb-2">
                <span class="text-[10px] uppercase tracking-wider text-slate-500">Database Size</span>
                <span class="text-[10px] font-mono text-cyan-400">${problems.length} items</span>
              </div>
              <div class="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div class="w-[${Math.min(100, Math.max(5, (problems.length / 200) * 100))}%] h-full bg-cyan-500"></div>
              </div>
              <p class="mt-2 text-[10px] text-slate-600 italic leading-tight">Local IndexedDB Vault</p>
            </div>
          </div>
        </aside>

        <div class="flex-1 bg-[#050508] p-8 overflow-y-auto">
          <${ViewComponent} />
        </div>
      </main>
    </div>
  `;
}

render(html`<${LibraryApp} />`, document.getElementById('root'));
