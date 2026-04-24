/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from '../../vendor/preact-bundle.js';
import { htm } from '../../vendor/preact-bundle.js';
const html = htm.bind(h);

export function AIReviewPanel({ review, onGenerate, loading }) {
  if (loading) {
    return html`
      <div class="p-6 bg-[#0a0a0f] rounded-2xl border border-cyan-500/20 animate-pulse flex flex-col gap-4">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full bg-cyan-500"></div>
          <span class="text-xs font-mono text-cyan-400">AI Reviewing...</span>
        </div>
        <div class="space-y-2">
          <div class="h-3 bg-white/5 rounded w-3/4"></div>
          <div class="h-3 bg-white/5 rounded w-full"></div>
          <div class="h-3 bg-white/5 rounded w-5/6"></div>
        </div>
      </div>
    `;
  }

  if (!review) {
    return html`
      <div class="p-6 bg-[#0a0a0f] rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center gap-4">
        <p class="text-sm text-slate-400">Get an instant AI review on time/space complexity and optimization.</p>
        <button onClick=${onGenerate} class="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold uppercase tracking-widest text-cyan-400 transition-colors">Start Review</button>
      </div>
    `;
  }

  return html`
    <div class="p-6 bg-gradient-to-br from-[#0a0a0f] to-cyan-900/10 rounded-2xl border border-cyan-500/20 flex flex-col gap-4 relative">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-lg">✨</span>
        <h3 class="text-sm font-semibold text-white">AI Analysis</h3>
      </div>
      <div class="prose prose-invert prose-sm prose-cyan max-w-none text-slate-300">
        ${review}
      </div>
    </div>
  `;
}
