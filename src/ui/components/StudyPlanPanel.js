/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The roadmap view.
 *
 * Two rules shape it:
 *
 *   - **The next seven days are concrete and everything after is a theme.**
 *     Naming five problems for the third Tuesday from now is false precision:
 *     the queue is rebuilt every time a solve lands, so that day's list is
 *     already wrong. `buildStudyPlan` splits the plan on exactly this line and
 *     this component renders the split rather than papering over it.
 *   - **A plan that does not fit says so.** When the target date cannot hold the
 *     work, the shortfall is shown with its numbers instead of the plan being
 *     quietly truncated and presented as complete.
 *
 * Everything is computed here from the ledger. Nothing is fetched.
 */

import { h } from "../../vendor/preact-bundle.js";
import { useState, useEffect, useMemo } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { buildStudyPlan, ROLE_PRESETS, DEFAULT_ROLE } from "../../core/study-plan.js";
import { CONSTANTS } from "../../core/constants.js";
import { Storage } from "../../core/storage.js";
import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("StudyPlanPanel");

const DAY = 86_400_000;
const DEFAULT_DAYS_OUT = 60;
const DEFAULT_HOURS = 2;

const DIFF_COLOR = { Easy: "#10b981", Medium: "#f59e0b", Hard: "#f43f5e" };

/** `YYYY-MM-DD`, which is also what `<input type="date">` wants. */
function isoDate(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

/** "Mon 12 Aug" — enough to place a day without a calendar. */
function dayLabel(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function minutesLabel(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function Item({ item }) {
  const color = DIFF_COLOR[item.difficulty] || "#64748b";
  const body = html`
    <span class="flex items-baseline gap-2 min-w-0">
      <span
        class="shrink-0 w-1.5 h-1.5 rounded-full"
        style=${{ background: item.kind === "revision" ? "#a78bfa" : color }}
      ></span>
      <span class="text-xs text-slate-200 truncate">${item.title}</span>
      <span class="text-[10px] text-slate-600 shrink-0"
        >${item.kind === "revision"
          ? `revisit · ${item.overdueDays > 0 ? `${item.overdueDays}d overdue` : "due"}`
          : item.topic}</span
      >
    </span>
  `;

  // Only new problems carry a URL — a revision may have come from any platform
  // and a guessed link is worse than none.
  return html`
    <li class="flex items-center justify-between gap-2 py-0.5">
      ${item.url
        ? html`<a
            href=${item.url}
            target="_blank"
            rel="noopener noreferrer"
            class="min-w-0 hover:underline decoration-white/20"
            >${body}</a
          >`
        : body}
      <span class="text-[10px] text-slate-600 font-mono shrink-0">${item.minutes}m</span>
    </li>
  `;
}

function Day({ day }) {
  return html`
    <div class="flex flex-col gap-1 px-3 py-2 rounded-xl border border-white/5 bg-white/2">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-[11px] text-slate-300">${dayLabel(day.date)}</span>
        <span class="text-[10px] text-slate-600 font-mono">${minutesLabel(day.minutes)}</span>
      </div>
      <ul class="flex flex-col">
        ${day.items.map((i) => html`<${Item} key=${`${i.kind}-${i.slug}`} item=${i} />`)}
      </ul>
    </div>
  `;
}

function Week({ week }) {
  return html`
    <div class="flex flex-col gap-1 px-3 py-2 rounded-xl border border-white/5">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-[11px] text-slate-400"
          >Week ${week.weekIndex}<span class="text-slate-600 ml-2"
            >${dayLabel(week.from)} – ${dayLabel(week.to)}</span
          ></span
        >
        <span class="text-[10px] text-slate-600 font-mono"
          >${week.newCount} new${week.revisionCount ? ` · ${week.revisionCount} revisit` : ""}</span
        >
      </div>
      <div class="flex flex-wrap gap-1">
        ${week.themes.map(
          (t) =>
            html`<span
              key=${t}
              class="px-1.5 py-0.5 rounded-md text-[10px] border border-white/5 bg-white/2 text-slate-400"
              >${t}</span
            >`,
        )}
      </div>
    </div>
  `;
}

/**
 * @param {object} props
 * @param {Array<object>} props.problems the ledger
 * @param {Record<string,string>} [props.topicKinds] `settings.topicKinds` overrides
 * @param {{ halfLifeDays?: number, regainSolves?: number }} [props.masteryOpts]
 */
export function StudyPlanPanel({ problems, topicKinds, masteryOpts }) {
  const [targetDate, setTargetDate] = useState(() => isoDate(Date.now() + DEFAULT_DAYS_OUT * DAY));
  const [hoursPerDay, setHoursPerDay] = useState(DEFAULT_HOURS);
  const [role, setRole] = useState(DEFAULT_ROLE);
  // Nothing is written back until the stored values have been read, or the
  // defaults would overwrite the user's choices on every mount.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    Storage.getSettings()
      .then((settings) => {
        if (!live) return;
        const saved = settings?.[CONSTANTS.SK.STUDY_PLAN];
        if (saved && typeof saved === "object") {
          if (saved.targetDate) setTargetDate(saved.targetDate);
          if (Number.isFinite(saved.hoursPerDay)) setHoursPerDay(saved.hoursPerDay);
          if (ROLE_PRESETS[saved.role]) setRole(saved.role);
        }
      })
      .catch((e) => dbg.warn("could not read the saved plan:", e))
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    Storage.updateSettings({
      [CONSTANTS.SK.STUDY_PLAN]: { targetDate, hoursPerDay, role },
    }).catch((e) => dbg.warn("could not save the plan settings:", e));
  }, [loaded, targetDate, hoursPerDay, role]);

  const plan = useMemo(
    () =>
      buildStudyPlan(problems || [], {
        targetDate,
        hoursPerDay,
        role,
        overrides: topicKinds || {},
        ...(masteryOpts || {}),
      }),
    [problems, targetDate, hoursPerDay, role, topicKinds, masteryOpts],
  );

  const { capacity, days, weeks, totals, shortfall } = plan;

  return html`
    <div class="p-4 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col gap-4">
      <div class="flex flex-col gap-1">
        <span class="text-[10px] uppercase tracking-widest text-slate-500">The plan</span>
        <span class="text-[11px] text-slate-600"
          >Ordered by what each topic is built from, not by how often it comes up.</span
        >
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-[10px] uppercase tracking-widest text-slate-500">Interview by</span>
          <input
            type="date"
            value=${targetDate}
            onInput=${(e) => setTargetDate(e.target.value)}
            class="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-200"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[10px] uppercase tracking-widest text-slate-500">Hours a day</span>
          <input
            type="number"
            min="0.25"
            max="12"
            step="0.25"
            value=${hoursPerDay}
            onInput=${(e) => setHoursPerDay(Number(e.target.value))}
            class="w-20 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-200"
          />
        </label>
        <div class="flex flex-col gap-1">
          <span class="text-[10px] uppercase tracking-widest text-slate-500">Aiming at</span>
          <div class="flex gap-1">
            ${Object.values(ROLE_PRESETS).map(
              (p) => html`
                <button
                  key=${p.id}
                  onClick=${() => setRole(p.id)}
                  title=${p.blurb}
                  class="px-2 py-1 rounded-lg text-[11px] border transition-colors ${role === p.id
                    ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
                    : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20"}"
                >
                  ${p.label}
                </button>
              `,
            )}
          </div>
        </div>
      </div>

      <p class="text-[11px] text-slate-500">
        ${capacity.days} ${capacity.days === 1 ? "day" : "days"} ×
        ${minutesLabel(capacity.minutesPerDay)} — ${totals.newProblems} new
        ${totals.newProblems === 1 ? "problem" : "problems"} and ${totals.revisions}
        ${totals.revisions === 1 ? "revisit" : "revisits"} queued. ${plan.role.blurb}
      </p>

      ${shortfall
        ? html`
            <div
              class="px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/5 flex flex-col gap-1"
            >
              <span class="text-[11px] text-amber-300"
                >This does not fit in ${capacity.days}
                ${capacity.days === 1 ? "day" : "days"}.</span
              >
              <span class="text-[11px] text-slate-400 leading-relaxed">
                The queue needs ${minutesLabel(shortfall.minutesNeeded)} and the window holds
                ${minutesLabel(shortfall.minutesAvailable)}. ${shortfall.newUnplaced} problems and
                ${shortfall.revisionsUnplaced} revisits fall off the
                end${shortfall.droppedTopics.length
                  ? `, dropping ${shortfall.droppedTopics.slice(0, 4).join(", ")}${
                      shortfall.droppedTopics.length > 4
                        ? ` and ${shortfall.droppedTopics.length - 4} more`
                        : ""
                    }`
                  : ""}.
                Move the date out or raise the hours — narrowing the target role also shortens the
                list.
              </span>
            </div>
          `
        : ""}

      <div class="flex flex-col gap-2">
        <span class="text-[10px] uppercase tracking-widest text-slate-500"
          >Next ${days.length} ${days.length === 1 ? "day" : "days"}</span
        >
        ${days.length
          ? days.map((d) => html`<${Day} key=${d.date} day=${d} />`)
          : html`<p class="text-[11px] text-slate-600">
              Nothing queued — every topic for this target is already held.
            </p>`}
      </div>

      ${weeks.length
        ? html`
            <div class="flex flex-col gap-2">
              <span class="text-[10px] uppercase tracking-widest text-slate-500"
                >After that<span class="text-slate-600 normal-case tracking-normal ml-2"
                  >themes, not problems — the list is rebuilt as solves land</span
                ></span
              >
              ${weeks.map((w) => html`<${Week} key=${w.from} week=${w} />`)}
            </div>
          `
        : ""}
    </div>
  `;
}
