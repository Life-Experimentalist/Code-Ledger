/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The achievement shelf.
 *
 * Every one of these was already computed and written into the README, which
 * meant the only way to find out what there was to aim at was to read your own
 * repository. Here they are in the app, locked ones included — a hint you can
 * see is the whole point of a hint.
 *
 * Which ones appear is `visibleAchievements`, not this component: the ones that
 * need a review provider are dropped when there is none, unless they were
 * already earned.
 */

import { h } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { visibleAchievements } from "../../core/feature-flags.js";

export function Achievements({ snapshot, settings }) {
  const list = visibleAchievements(snapshot, settings);
  if (!list.length) return "";

  const earned = list.filter((a) => a.earned).length;

  return html`
    <div class="p-4 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col gap-3">
      <div class="flex items-baseline justify-between">
        <span class="text-[10px] uppercase tracking-widest text-slate-500">Achievements</span>
        <span class="text-[10px] text-slate-500 font-mono">${earned} / ${list.length}</span>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        ${list.map(
          (a) => html`
            <div
              key=${a.id}
              title=${a.hint}
              class="flex items-center gap-2 px-2.5 py-2 rounded-xl border transition-colors ${a.earned
                ? "bg-amber-500/10 border-amber-500/25"
                : "bg-white/2 border-white/5"}"
            >
              <span class="text-lg leading-none ${a.earned ? "" : "grayscale opacity-40"}"
                >${a.emoji}</span
              >
              <div class="min-w-0">
                <p
                  class="text-xs truncate ${a.earned ? "text-amber-200" : "text-slate-400"}"
                  title=${a.name}
                >
                  ${a.name}
                </p>
                <p class="text-[10px] text-slate-600 truncate">${a.hint}</p>
              </div>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}
