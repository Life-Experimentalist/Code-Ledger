/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect } from '../../vendor/preact-bundle.js';
import { htm } from '../../vendor/preact-bundle.js';
import { Storage } from '../../core/storage.js';
const html = htm.bind(h);

function formatRemaining(ms) {
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return h + "h " + m + "m remaining";
  return m + "m remaining";
}

export function IncognitoBanner({ settings, onDisable }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const expiry = settings?.incognitoExpiry ?? 0;
    if (expiry === -1) { setRemaining("indefinite"); return; }
    if (!expiry) return;

    const tick = () => {
      const diff = expiry - Date.now();
      if (diff <= 0) {
        setRemaining("expired");
        onDisable?.();
        return;
      }
      setRemaining(formatRemaining(diff));
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [settings?.incognitoExpiry]);

  return html`
    <div class="bg-amber-500/10 border-l-4 border-amber-500 p-4 mb-4 flex gap-3 items-start">
      <span class="text-amber-500 mt-0.5 shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </span>
      <div class="flex flex-col flex-1 min-w-0">
        <span class="font-bold text-amber-500 text-sm">Incognito Mode Active</span>
        <span class="text-xs text-amber-500/80">Solves will not be recorded or committed. ${remaining ? html`<span class="text-amber-400">(${remaining})</span>` : ""}</span>
      </div>
      <button
        onClick=${onDisable}
        class="shrink-0 text-[10px] px-2 py-1 rounded border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
      >Disable</button>
    </div>
  `;
}
