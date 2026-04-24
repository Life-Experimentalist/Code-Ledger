/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from '../../vendor/preact-bundle.js';
import { htm } from '../../vendor/preact-bundle.js';
const html = htm.bind(h);

import { CONSTANTS } from '../../core/constants.js';

export function ProviderBadge({ providerId, type = 'ai', size = 'md' }) {
  const provider = type === 'ai' 
    ? CONSTANTS.AI_PROVIDERS[providerId] 
    : type === 'git' ? CONSTANTS.GIT_PROVIDERS[providerId] : null;

  if (!provider) return html`<span>${providerId}</span>`;

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
    lg: 'text-sm px-3 py-1.5'
  };

  return html`
    <span class="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full font-mono text-slate-300 ${sizeClasses[size]}">
      <span class="w-1.5 h-1.5 rounded-full ${type === 'ai' ? 'bg-indigo-400' : 'bg-emerald-400'}"></span>
      ${provider.name}
    </span>
  `;
}
