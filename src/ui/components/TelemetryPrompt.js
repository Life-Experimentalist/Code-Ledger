/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from '../../vendor/preact-bundle.js';
import { useState } from '../../vendor/preact-bundle.js';
import { htm } from '../../vendor/preact-bundle.js';
const html = htm.bind(h);

export function TelemetryPrompt({ onComplete }) {
  return html`
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div class="bg-[#11111a] border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 relative overflow-hidden">
        <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(6,182,212,0.15),transparent_50%)] pointer-events-none"></div>
        
        <h2 class="text-xl font-bold tracking-tight text-white z-10">Help improve CodeLedger</h2>
        
        <p class="text-sm text-slate-300 z-10 leading-relaxed">
          CodeLedger can collect anonymous usage statistics using CFlair-Counter. 
          This helps us understand which platforms and features are used most.
        </p>
        
        <div class="bg-black/30 rounded-lg p-3 border border-white/5 z-10">
          <p class="text-xs text-slate-400 font-mono flex items-center gap-2 mb-1">
            <span class="text-emerald-400">✓</span> What we collect:
          </p>
          <p class="text-xs text-slate-500 mb-2 pl-5">Platform solve counts, extension version, and generic errors.</p>
          
          <p class="text-xs text-slate-400 font-mono flex items-center gap-2 mb-1">
            <span class="text-rose-400 opacity-80">✗</span> What we NEVER collect:
          </p>
          <p class="text-xs text-slate-500 pl-5">Your code, AI API keys, GitHub tokens, problem titles, or personally identifiable information.</p>
        </div>

        <div class="flex gap-3 justify-end mt-2 z-10">
          <button 
            onClick=${() => onComplete(false)} 
            class="px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors border border-transparent"
          >
            Skip for now
          </button>
          <button 
            onClick=${() => onComplete(true)} 
            class="px-4 py-2 text-sm text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors shadow-[0_0_15px_rgba(6,182,212,0.4)] border border-cyan-400 font-medium"
          >
            I'm in - Enable Telemetry
          </button>
        </div>
      </div>
    </div>
  `;
}
