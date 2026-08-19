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
import { useEffect, useState } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { visibleAchievements } from "../../core/feature-flags.js";
import { newlyEarned } from "../../core/gamification.js";
import { Storage } from "../../core/storage.js";

export function Achievements({ snapshot, settings }) {
  const list = visibleAchievements(snapshot, settings);
  // Ones earned since the last look. Frozen at mount and then written back as
  // seen, so the pip survives this visit and is gone on the next one.
  const [fresh, setFresh] = useState(null);

  useEffect(() => {
    let live = true;
    const all = snapshot?.achievements || [];
    if (!all.length) return;
    Storage.getGamificationState()
      .then((state) => {
        if (!live) return;
        setFresh(new Set(newlyEarned(all, state)));
        return Storage.markAchievementsSeen(all.filter((a) => a.earned).map((a) => a.id));
      })
      .catch(() => live && setFresh(new Set()));
    return () => (live = false);
    // Only on the first snapshot: re-running on every recompute would clear the
    // pip out from under someone still reading it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Locked tiles fold away once there is something earned to look at: a wall
  // of grey placeholders above the earned ones read as clutter, but for a fresh
  // ledger with nothing earned yet the locked list IS the content — it is what
  // there is to aim at — so it starts open.
  const earnedList = list.filter((a) => a.earned);
  const lockedList = list.filter((a) => !a.earned);
  const [showLocked, setShowLocked] = useState(earnedList.length === 0);

  if (!list.length) return "";

  const earned = earnedList.length;
  const shown = showLocked ? [...earnedList, ...lockedList] : earnedList;

  return html`
    <div class="p-4 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col gap-3">
      <div class="flex items-baseline justify-between gap-3">
        <span class="text-[10px] uppercase tracking-widest text-slate-500">Achievements</span>
        <div class="flex items-baseline gap-3">
          ${lockedList.length > 0 &&
          earnedList.length > 0 &&
          html`
            <button
              onClick=${() => setShowLocked(!showLocked)}
              class="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              ${showLocked ? "Hide locked" : `Show locked (${lockedList.length})`}
            </button>
          `}
          <span class="text-[10px] text-slate-500 font-mono">${earned} / ${list.length}</span>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        ${shown.map(
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
                  ${a.name}${fresh?.has(a.id)
                    ? html`<span class="ml-1.5 text-[9px] uppercase tracking-wider text-amber-400"
                        >new</span
                      >`
                    : ""}
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
