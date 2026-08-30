/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Streaks, points, and what they write into the ledger repository.
 *
 * The badge previews are rendered from the same `badgeSpecs()` the publisher
 * uses, as inline data: URIs. Nothing here loads a remote image — previewing
 * shields.io by fetching from shields.io would tell shields about a repository
 * the user has not decided to publish yet, which is precisely the disclosure
 * this panel exists to put in front of them first.
 */

import { h, useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";
import { createDebugger } from "../../lib/debug.js";
import {
  computeSnapshot,
  configFromSettings,
  DEFAULT_CONFIG,
  dayKey,
} from "../../core/gamification.js";
import { badge, badgeSpecs, BADGE_NAMES, BADGE_ALT, DEFAULT_PICKS } from "../../core/badge-svg.js";
import { SHIELDS_STYLES } from "../../core/badge-shields.js";
import { isGamificationActive, visibleAchievements } from "../../core/feature-flags.js";

const dbg = createDebugger("PanelGamification");

/** The scoring knobs, in the order they make sense to read. */
const TUNABLES = [
  {
    key: "dailyTargetPoints",
    label: "Daily target",
    unit: "points",
    hint: "What it takes to close a day. 25 is one Medium, or two Easies and change.",
    min: 1,
    max: 500,
  },
  {
    key: "freezeEarnMultiplier",
    label: "Freeze earned at",
    unit: "× target",
    hint: "Hit this multiple of the target in one day and you bank a streak freeze.",
    min: 1,
    max: 10,
    step: 0.5,
  },
  {
    key: "maxFreezes",
    label: "Freezes you can bank",
    unit: "",
    hint: "Banking without a cap removes the pressure entirely.",
    min: 0,
    max: 30,
  },
  {
    key: "penaltyMultiplier",
    label: "Buy back a missed day at",
    unit: "× target",
    hint: "Solve this much the next day and the missed day is restored.",
    min: 1,
    max: 5,
    step: 0.5,
  },
  {
    key: "iceBreakerDays",
    label: "Ice-breaker days",
    unit: "days",
    hint: "Days after a vacation that run at a reduced target while you warm up.",
    min: 0,
    max: 14,
  },
];

/** A rendered badge as an inline image — no network, no third party. */
function svgDataUri(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function Toggle({ on, onClick, disabled }) {
  return html`
    <button
      onClick=${onClick}
      disabled=${disabled}
      class="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-40
        ${on ? "bg-cyan-500/30 border-cyan-500/40" : "bg-white/5 border-white/10"}"
    >
      <span
        class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
          ${on ? "translate-x-4" : "translate-x-0.5"}"
      ></span>
    </button>
  `;
}

function Row({ on, onClick, disabled, title, children }) {
  return html`
    <div class="flex items-start gap-3">
      <${Toggle} on=${on} onClick=${onClick} disabled=${disabled} />
      <div>
        <p class="text-sm text-slate-300">${title}</p>
        <p class="text-[11px] text-slate-500 leading-snug">${children}</p>
      </div>
    </div>
  `;
}

export function PanelGamification({ settings, onSettingsChange }) {
  const [snapshot, setSnapshot] = useState(null);
  const [vacations, setVacations] = useState([]);
  // Bumped after every vacation edit so the preview effect re-reads state.
  const [vacationsVersion, setVacationsVersion] = useState(0);
  const [vacStart, setVacStart] = useState("");
  const [vacEnd, setVacEnd] = useState("");
  const [vacNote, setVacNote] = useState("");

  const s = settings || {};
  const active = isGamificationActive(s);
  const publishing = active && s.gamificationBadges !== false;
  const repoPrivate = s.github_repo_private === true;
  const repoKnown = !!(s.github_repo || s.gitRepo);
  const shieldsBlocked = repoPrivate || !repoKnown;
  const style = s.gamificationBadgeStyle === "shields" && !shieldsBlocked ? "shields" : "svg";
  const picks = Array.isArray(s.gamificationBadgePicks) ? s.gamificationBadgePicks : DEFAULT_PICKS;

  // The preview shows the user's real numbers rather than a mock-up: these
  // badges are going into their README, and a sample would hide the fact that
  // a fresh install publishes a row of zeroes.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const problems = await Storage.getAllProblems().catch(() => []);
        const state = await Storage.getGamificationState().catch(() => ({ vacations: [] }));
        const next = computeSnapshot(problems || [], {
          config: configFromSettings(s),
          vacations: state?.vacations || [],
          streakFloorDay: s.installDay || undefined,
        });
        if (live) {
          setSnapshot(next);
          setVacations(state?.vacations || []);
        }
      } catch (e) {
        dbg.warn("preview snapshot failed:", e?.message || e);
      }
    })();
    return () => {
      live = false;
    };
  }, [
    s.dailyTargetPoints,
    s.freezeEarnMultiplier,
    s.maxFreezes,
    s.penaltyMultiplier,
    s.installDay,
    vacationsVersion,
  ]);

  const specs = snapshot ? badgeSpecs(snapshot) : null;

  // Achievements to showcase in the README. No stored value means "all earned,
  // future ones included"; an array — empty included — is an explicit
  // selection, which is how unchecking everything actually clears the line.
  const achievements = snapshot ? visibleAchievements(snapshot, s) : [];
  const achievementStored = Array.isArray(s.gamificationAchievementPicks)
    ? s.gamificationAchievementPicks
    : null;
  const showcased = (id) => !achievementStored || achievementStored.includes(id);
  const toggleShowcase = (id) => {
    const next = achievements
      .map((a) => a.id)
      .filter((x) => (x === id ? !showcased(x) : showcased(x)));
    // Everything ticked goes back to the default, so achievements earned later
    // showcase themselves instead of waiting for a visit to this panel.
    onSettingsChange?.(
      "gamificationAchievementPicks",
      next.length === achievements.length ? undefined : next,
    );
  };

  const togglePick = (name) => {
    const on = picks.includes(name);
    // Refusing to clear the last one: an empty list falls back to the defaults
    // when the README is written, so unchecking everything would look like the
    // choice had been ignored. Turning the row off entirely is the README
    // switch above, which says so.
    if (on && picks.length <= 1) return;
    const next = BADGE_NAMES.filter((n) => (n === name ? !on : picks.includes(n)));
    onSettingsChange?.("gamificationBadgePicks", next);
  };

  const setNumber = (key, raw) => {
    const value = raw === "" ? undefined : Number(raw);
    if (value !== undefined && !Number.isFinite(value)) return;
    onSettingsChange?.(key, value);
  };

  // The numbers the tunables actually produce, clamped the same way
  // computeStreak clamps them — so the sentence below never promises a
  // behaviour the engine refuses to run (a 0 target, a sub-1× penalty).
  const cfg = configFromSettings(s);
  const targetPts = Math.max(1, Math.round(cfg.dailyTargetPoints));
  const freezePts = Math.round(targetPts * Math.max(1, cfg.freezeEarnMultiplier));
  const buyBackPts = Math.ceil(Math.max(1, cfg.penaltyMultiplier) * targetPts);

  const todayKey = dayKey(Date.now(), cfg.utcOffsetMinutes);
  const openVacation = vacations.find((v) => v && !v.end);

  const addVacation = async () => {
    const start = vacStart || todayKey;
    await Storage.addVacation(start, vacEnd || null, vacNote.trim());
    setVacStart("");
    setVacEnd("");
    setVacNote("");
    setVacationsVersion((v) => v + 1);
  };

  const endVacationToday = async () => {
    await Storage.endVacation(todayKey);
    setVacationsVersion((v) => v + 1);
  };

  const removeVacation = async (start) => {
    await Storage.deleteVacation(start);
    setVacationsVersion((v) => v + 1);
  };

  return html`
    <div class="space-y-6 w-full">
      <div>
        <h2 class="text-base font-semibold text-white mb-1">Streaks & badges</h2>
        <p class="text-xs text-slate-500">
          Points, streaks and levels are computed from solves already in your ledger. Nothing here
          calls out to anyone unless you switch it on below.
        </p>
      </div>

      <div class="p-4 rounded-xl border border-white/8 bg-white/2">
        <${Row}
          on=${active}
          onClick=${() => onSettingsChange?.("gamificationEnabled", !active)}
          title="Track streaks and points"
        >
          Off hides every streak surface — popup, library, badges and all. Your solve history is
          untouched either way, so switching it back on picks up where you left off.
        <//>
      </div>

      ${active &&
      html`
        <!-- What lands in the repository -->
        <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-4">
          <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">
            In your repository
          </h3>
          <${Row}
            on=${publishing}
            onClick=${() => onSettingsChange?.("gamificationBadges", !publishing)}
            title="Commit badge files"
          >
            Writes SVGs and a <code class="text-slate-400">badges/stats.json</code> alongside your
            solutions. Turning this off deletes them on the next maintenance commit.
          <//>
          <${Row}
            on=${publishing && s.gamificationReadme !== false}
            disabled=${!publishing}
            onClick=${() =>
              onSettingsChange?.("gamificationReadme", s.gamificationReadme === false)}
            title="Keep a badge row in README.md"
          >
            Rewritten in place between two HTML comments. Everything you wrote around it is left
            alone, and removing the feature removes just that block.
          <//>
        </div>

        <!-- Rendering -->
        <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-4">
          <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Badge style</h3>

          <div class="grid gap-3 sm:grid-cols-2">
            <button
              onClick=${() => onSettingsChange?.("gamificationBadgeStyle", "svg")}
              class="text-left p-3 rounded-lg border transition-colors
                ${style === "svg"
                ? "bg-cyan-500/10 border-cyan-500/30"
                : "bg-white/5 border-white/10 hover:bg-white/10"}"
            >
              <p class="text-sm text-slate-200 mb-1">Self-hosted SVG</p>
              <p class="text-[11px] text-slate-500 leading-snug">
                Drawn here and committed to your repo. Works in private repos, cannot go down, and
                involves nobody but GitHub.
              </p>
            </button>

            <button
              onClick=${() => onSettingsChange?.("gamificationBadgeStyle", "shields")}
              disabled=${shieldsBlocked}
              class="text-left p-3 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                ${style === "shields"
                ? "bg-cyan-500/10 border-cyan-500/30"
                : "bg-white/5 border-white/10 hover:bg-white/10"}"
            >
              <p class="text-sm text-slate-200 mb-1">shields.io</p>
              <p class="text-[11px] text-slate-500 leading-snug">
                The badge style most READMEs already use. Your numbers still come from your repo —
                shields only draws them.
              </p>
            </button>
          </div>

          ${shieldsBlocked
            ? html`
                <p class="text-[11px] text-amber-300/80 leading-snug">
                  ${repoPrivate
                    ? "shields.io fetches over anonymous HTTP, so it cannot read a private repository. The self-hosted SVGs are used instead."
                    : "Set your repository name under Git first — shields needs an address to fetch the numbers from."}
                </p>
              `
            : ""}
          ${style === "shields" &&
          html`
            <div class="space-y-3">
              <p class="text-[11px] text-slate-400 leading-snug">
                Worth knowing before you commit this: anyone who loads your README causes a request
                to shields.io, so one more service learns your repository exists. And if shields has
                an outage, your README shows broken images. Neither is true of the SVGs.
              </p>
              <label class="block">
                <span class="block text-xs font-medium text-slate-400 mb-1.5">Shape</span>
                <select
                  value=${SHIELDS_STYLES.includes(s.gamificationShieldsStyle)
                    ? s.gamificationShieldsStyle
                    : "flat"}
                  onChange=${(e) => onSettingsChange?.("gamificationShieldsStyle", e.target.value)}
                  style="background-color:#0d0d14;color:#cbd5e1"
                  class="w-full border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500/40"
                >
                  ${SHIELDS_STYLES.map(
                    (id) => html`
                      <option key=${id} value=${id} style="background-color:#0d0d14;color:#cbd5e1">
                        ${id}
                      </option>
                    `,
                  )}
                </select>
              </label>
            </div>
          `}
        </div>

        <!-- Which badges -->
        <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-4">
          <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">
            Badges to show
          </h3>
          <p class="text-[11px] text-slate-500 leading-snug">
            Your numbers, as they stand right now. Every badge file is committed either way — this
            picks which ones the README links to, so a badge you leave out is still there if you
            want to place it yourself.
          </p>

          <div class="space-y-2">
            ${BADGE_NAMES.map((name) => {
              const on = picks.includes(name);
              const last = on && picks.length <= 1;
              return html`
                <label
                  key=${name}
                  class="flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer
                    ${on ? "bg-white/5 border-white/10" : "border-transparent hover:bg-white/5"}
                    ${last ? "cursor-not-allowed" : ""}"
                  title=${last ? "Keep at least one — use the README switch to remove the row" : ""}
                >
                  <input
                    type="checkbox"
                    checked=${on}
                    disabled=${last}
                    onChange=${() => togglePick(name)}
                    class="accent-cyan-500"
                  />
                  ${specs
                    ? html`<img
                        src=${svgDataUri(badge(specs[name]))}
                        alt=${BADGE_ALT[name]}
                        class="h-5"
                      />`
                    : html`<span class="text-sm text-slate-400">${BADGE_ALT[name]}</span>`}
                </label>
              `;
            })}
          </div>
        </div>

        <!-- Which achievements -->
        ${achievements.length > 0 &&
        html`
          <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-4">
            <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">
              Achievements to showcase
            </h3>
            <p class="text-[11px] text-slate-500 leading-snug">
              Earned achievements are listed under the badge row in your README. Untick any you
              would rather keep to yourself — a locked one only appears once you earn it, so leaving
              it ticked just means it shows up on its own that day.
            </p>

            <div class="grid gap-2 sm:grid-cols-2">
              ${achievements.map((a) => {
                const on = showcased(a.id);
                return html`
                  <label
                    key=${a.id}
                    title=${a.hint}
                    class="flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer
                      ${on ? "bg-white/5 border-white/10" : "border-transparent hover:bg-white/5"}"
                  >
                    <input
                      type="checkbox"
                      checked=${on}
                      onChange=${() => toggleShowcase(a.id)}
                      class="accent-cyan-500"
                    />
                    <span class="text-base leading-none ${a.earned ? "" : "grayscale opacity-40"}"
                      >${a.emoji}</span
                    >
                    <span class="text-sm truncate ${a.earned ? "text-slate-200" : "text-slate-500"}"
                      >${a.name}</span
                    >
                    ${!a.earned &&
                    html`<span class="ml-auto text-[10px] uppercase tracking-wider text-slate-600"
                      >locked</span
                    >`}
                  </label>
                `;
              })}
            </div>
          </div>
        `}

        <!-- Scoring -->
        <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-4">
          <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Scoring</h3>
          <p class="text-[11px] text-slate-500 leading-snug">
            Easy is worth 10, Medium 25, Hard 50. Leave a field blank to use the default.
          </p>
          <p class="text-[11px] text-cyan-300/80 leading-snug">
            With your numbers: a day closes at <b>${targetPts}</b> pts, a freeze is banked at
            <b> ${freezePts}</b> pts in one day, and buying back a missed day costs
            <b> ${buyBackPts}</b> pts.
          </p>
          ${TUNABLES.map(
            ({ key, label, unit, hint, min, max, step }) => html`
              <div key=${key} class="flex items-start gap-3">
                <input
                  type="number"
                  min=${min}
                  max=${max}
                  step=${step || 1}
                  placeholder=${String(DEFAULT_CONFIG[key])}
                  value=${typeof s[key] === "number" && Number.isFinite(s[key]) ? s[key] : ""}
                  onChange=${(e) => setNumber(key, e.target.value)}
                  class="w-20 shrink-0 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/40"
                />
                <div>
                  <p class="text-sm text-slate-300">
                    ${label} ${unit && html`<span class="text-slate-500">${unit}</span>`}
                  </p>
                  <p class="text-[11px] text-slate-500 leading-snug">${hint}</p>
                </div>
              </div>
            `,
          )}
        </div>

        <!-- Vacations -->
        <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-4">
          <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Vacations</h3>
          <p class="text-[11px] text-slate-500 leading-snug">
            A vacation day never breaks the streak, and no points are expected — but a vacation day
            where you hit the target still counts in full, so coming back early always pays. Declare
            one before you leave or backdate it after; leave the end date blank for an open-ended
            break. For ${cfg.iceBreakerDays || DEFAULT_CONFIG.iceBreakerDays}${" "}
            day${(cfg.iceBreakerDays || DEFAULT_CONFIG.iceBreakerDays) !== 1 ? "s" : ""} after a
            vacation ends, the daily target is reduced while you warm back up.
          </p>

          ${openVacation
            ? html`
                <div
                  class="flex items-center justify-between gap-3 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/25"
                >
                  <p class="text-xs text-cyan-200">
                    On vacation since <b>${openVacation.start}</b> — the streak is paused.
                  </p>
                  <button
                    onClick=${endVacationToday}
                    class="shrink-0 px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-medium hover:bg-cyan-500/30 transition-colors"
                  >
                    End today
                  </button>
                </div>
              `
            : ""}
          ${vacations.length > 0
            ? html`
                <div class="space-y-2">
                  ${vacations.map(
                    (v) => html`
                      <div
                        key=${v.start}
                        class="flex items-center gap-3 p-2 rounded-lg bg-white/5 border border-white/10"
                      >
                        <span class="text-base leading-none">🏖️</span>
                        <div class="flex-1 min-w-0">
                          <p class="text-xs text-slate-300">${v.start} → ${v.end || "ongoing"}</p>
                          ${v.note
                            ? html`<p class="text-[11px] text-slate-500 truncate">${v.note}</p>`
                            : ""}
                        </div>
                        <button
                          onClick=${() => removeVacation(v.start)}
                          title="Delete this vacation"
                          class="shrink-0 px-2 py-1 rounded text-rose-400/70 hover:text-rose-300 hover:bg-rose-500/10 text-xs transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    `,
                  )}
                </div>
              `
            : html`<p class="text-[11px] text-slate-600 italic">No vacations declared.</p>`}

          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
            <label class="block">
              <span class="block text-xs font-medium text-slate-400 mb-1.5">Start</span>
              <input
                type="date"
                value=${vacStart}
                onChange=${(e) => setVacStart(e.target.value)}
                style="color-scheme:dark"
                class="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/40"
              />
            </label>
            <label class="block">
              <span class="block text-xs font-medium text-slate-400 mb-1.5">End — optional</span>
              <input
                type="date"
                value=${vacEnd}
                onChange=${(e) => setVacEnd(e.target.value)}
                style="color-scheme:dark"
                class="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/40"
              />
            </label>
            <label class="block">
              <span class="block text-xs font-medium text-slate-400 mb-1.5">Note — optional</span>
              <input
                type="text"
                placeholder="Exams, travel…"
                value=${vacNote}
                onChange=${(e) => setVacNote(e.target.value)}
                class="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/40"
              />
            </label>
            <button
              onClick=${addVacation}
              class="px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold uppercase tracking-widest hover:bg-cyan-500/20 transition-colors"
            >
              ${vacStart ? "Add vacation" : "Start today"}
            </button>
          </div>
        </div>

        <!-- Scheduled refresh -->
        <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-4">
          <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">
            Nightly refresh
          </h3>
          <p class="text-[11px] text-slate-500 leading-snug">
            A badge is a picture written at commit time, so it cannot notice a streak ending on a
            day you did not solve. A small GitHub Actions job recomputes them and commits only when
            a number actually changed. Actions minutes are free on public repositories and metered
            on private ones, which is why the default differs.
          </p>
          <label class="block">
            <span class="block text-xs font-medium text-slate-400 mb-1.5">Run it</span>
            <select
              value=${typeof s.gamificationActions === "boolean"
                ? String(s.gamificationActions)
                : ""}
              onChange=${(e) =>
                onSettingsChange?.(
                  "gamificationActions",
                  e.target.value === "" ? undefined : e.target.value === "true",
                )}
              style="background-color:#0d0d14;color:#cbd5e1"
              class="w-full border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500/40"
            >
              <option value="" style="background-color:#0d0d14;color:#cbd5e1">
                Default — on for public repos, off for private
              </option>
              <option value="true" style="background-color:#0d0d14;color:#cbd5e1">Always</option>
              <option value="false" style="background-color:#0d0d14;color:#cbd5e1">Never</option>
            </select>
          </label>
          <label class="block">
            <span class="block text-xs font-medium text-slate-400 mb-1.5">
              Hour to run, UTC — pick one after your day rolls over
            </span>
            <input
              type="number"
              min="0"
              max="23"
              placeholder="4"
              value=${Number.isInteger(s.gamificationActionsHour) ? s.gamificationActionsHour : ""}
              onChange=${(e) => setNumber("gamificationActionsHour", e.target.value)}
              class="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/40"
            />
          </label>
        </div>
      `}
    </div>
  `;
}
