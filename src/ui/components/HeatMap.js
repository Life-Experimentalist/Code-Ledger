/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import {
  htm,
  useState,
  useMemo,
  useEffect,
  useRef,
} from "../../vendor/preact-bundle.js";
import {
  mapDifficulty,
  loadUserDifficultyMap,
} from "../../core/difficulty-map.js";
import { Storage } from "../../core/storage.js";
const html = htm.bind(h);

function fmtDateLabel(dateStr) {
  try {
    const d = new Date(dateStr + "T00:00:00Z");
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch (e) {
    return dateStr;
  }
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function HeatMap({ problems = [] }) {
  const containerRef = useRef(null);
  const scrollRef     = useRef(null);
  const [selectedPeriod, setSelectedPeriod] = useState("past_year");
  const [userMap, setUserMap] = useState({});
  const [hover, setHover] = useState(null);
  const [pinned, setPinned] = useState(null);

  useEffect(() => {
    let mounted = true;
    loadUserDifficultyMap()
      .then((m) => { if (mounted) setUserMap(m || {}); })
      .catch(() => {});
    return () => (mounted = false);
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set();
    problems.forEach((p) => {
      years.add(new Date((p.timestamp || Date.now() / 1000) * 1000).getFullYear());
    });
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [problems]);

  const { grid, currentStreak, maxStreak, maxCount } = useMemo(() => {
    const today = new Date();
    let startDate, endDate, yearStart = null;

    if (selectedPeriod === "past_year") {
      // Exactly 1 year back, then snap to prior Sunday for column alignment
      endDate = new Date(today);
      const oneYearAgo = new Date(today);
      oneYearAgo.setFullYear(today.getFullYear() - 1);
      oneYearAgo.setDate(oneYearAgo.getDate() + 1); // start day after same date last year
      startDate = new Date(oneYearAgo);
      startDate.setDate(startDate.getDate() - startDate.getDay()); // snap to Sunday
    } else {
      const year = parseInt(selectedPeriod, 10);
      yearStart = new Date(year, 0, 1); // Jan 1
      endDate = year === today.getFullYear() ? new Date(today) : new Date(year, 11, 31);
      // Grid starts from the Sunday on/before Jan 1
      startDate = new Date(yearStart);
      startDate.setDate(startDate.getDate() - startDate.getDay());
    }

    // Build per-day breakdown
    const dayMap = {};
    const addToDay = (ds, rawLabel, category) => {
      if (!dayMap[ds]) dayMap[ds] = { easy: 0, medium: 0, hard: 0, raw: {} };
      dayMap[ds][category.toLowerCase()] = (dayMap[ds][category.toLowerCase()] || 0) + 1;
      dayMap[ds].raw[rawLabel] = (dayMap[ds].raw[rawLabel] || 0) + 1;
    };

    for (const p of problems) {
      const d = new Date((p.timestamp || Date.now() / 1000) * 1000);
      const ds = toDateStr(d);
      const raw = p.difficulty || "";
      const category = mapDifficulty(raw, userMap);
      addToDay(ds, String(raw || "Unknown"), category);
    }

    // Streak computation (5y lookback)
    let cStreak = 0, mStreak = 0, temp = 0;
    const streakStart = new Date(today);
    streakStart.setFullYear(streakStart.getFullYear() - 5);
    for (let it = new Date(streakStart); it <= today; it.setDate(it.getDate() + 1)) {
      const total = (dayMap[toDateStr(it)]?.easy || 0) + (dayMap[toDateStr(it)]?.medium || 0) + (dayMap[toDateStr(it)]?.hard || 0);
      if (total) { temp++; }
      else { mStreak = Math.max(mStreak, temp); temp = 0; }
    }
    mStreak = Math.max(mStreak, temp);
    for (let d = new Date(today); d >= streakStart; d.setDate(d.getDate() - 1)) {
      const total = (dayMap[toDateStr(d)]?.easy || 0) + (dayMap[toDateStr(d)]?.medium || 0) + (dayMap[toDateStr(d)]?.hard || 0);
      if (total) cStreak++;
      else break;
    }

    // Build weeks grid
    // For specific-year mode: cells before Jan 1 are null (padding — no data outside the year)
    const compiled = [];
    let cur = new Date(startDate);
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const weeks = Math.ceil(totalDays / 7);

    for (let w = 0; w < weeks; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        if (cur > endDate) {
          cur.setDate(cur.getDate() + 1);
          continue;
        }
        // Null cell: before yearStart in specific-year mode
        if (yearStart && cur < yearStart) {
          week.push(null);
        } else {
          const ds = toDateStr(cur);
          const data = dayMap[ds] || { easy: 0, medium: 0, hard: 0, raw: {} };
          const total = data.easy + data.medium + data.hard;
          week.push({ date: ds, data, total });
        }
        cur.setDate(cur.getDate() + 1);
      }
      if (week.length > 0) compiled.push(week);
    }

    const allTotals = Object.values(dayMap).map((d) => d.easy + d.medium + d.hard);
    const max = allTotals.length ? Math.max(...allTotals) : 0;

    return { grid: compiled, currentStreak: cStreak, maxStreak: mStreak, maxCount: max };
  }, [problems, selectedPeriod, userMap]);

  // Scroll to the right (today) whenever the grid data changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [grid]);

  const getColor = (count) => {
    if (!count) return "bg-white/5";
    const max = Math.max(1, maxCount || 1);
    const ratio = count / max;
    if (ratio <= 0.25) return "bg-cyan-900/60";
    if (ratio <= 0.5)  return "bg-cyan-700";
    if (ratio <= 0.75) return "bg-cyan-600";
    return "bg-cyan-400";
  };

  const onDayEnter = (ev, day) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const x = ev.clientX - (rect ? rect.left : 0) + 8;
    const y = ev.clientY - (rect ? rect.top : 0) + 8;
    setHover({ pos: { x, y }, day });
  };
  const onDayLeave = () => setHover(null);

  const onDayClick = (ev, day) => {
    ev.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    const x = ev.clientX - (rect ? rect.left : 0) + 8;
    const y = ev.clientY - (rect ? rect.top : 0) + 8;
    setPinned((prev) => (prev?.day.date === day.date ? null : { pos: { x, y }, day }));
  };

  const saveMapping = async (rawLabel, mappedTo) => {
    try {
      const settings = await Storage.getSettings();
      const m = settings?.difficultyMap ? settings.difficultyMap : {};
      m[rawLabel] = mappedTo;
      settings.difficultyMap = m;
      await Storage.setSettings(settings);
      setUserMap(m);
    } catch (e) { /* ignore */ }
  };

  const active = pinned || hover;

  return html`
    <div
      class="p-6 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col gap-4 overflow-hidden relative"
      ref=${containerRef}
      onClick=${() => setPinned(null)}
    >
      <div class="flex justify-between items-center">
        <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest">
          Consistency Map
        </h3>
        <select
          class="bg-[#0d1117] border border-white/10 rounded-lg text-xs text-slate-300 px-3 py-1.5 outline-none hover:border-white/20 transition-colors"
          value=${selectedPeriod}
          onChange=${(e) => { setSelectedPeriod(e.target.value); setPinned(null); }}
          onClick=${(e) => e.stopPropagation()}
        >
          <option value="past_year">Past 1 Year</option>
          ${availableYears.map((y) => html`<option value="${y}">${y}</option>`)}
        </select>
      </div>

      <div
        ref=${scrollRef}
        class="overflow-x-auto"
        style=${{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        onClick=${(e) => e.stopPropagation()}
      >
        <div class="flex gap-1 min-w-max pb-1">
          ${grid.map(
            (week) =>
              html`<div class="flex flex-col gap-1">
                ${week.map(
                  (day) => day === null
                    ? html`<div class="w-4 h-4 rounded-sm bg-transparent"></div>`
                    : html`
                      <div
                        class="w-4 h-4 rounded-sm ${getColor(day.total)} transition-colors duration-200 hover:ring-1 ring-cyan-300 cursor-pointer ${pinned?.day.date === day.date ? "ring-2 ring-cyan-400" : ""}"
                        onMouseEnter=${(e) => onDayEnter(e, day)}
                        onMouseLeave=${onDayLeave}
                        onClick=${(e) => onDayClick(e, day)}
                        title="${day.date}: ${day.total} solves"
                      ></div>
                    `,
                )}
              </div>`,
          )}
        </div>
      </div>

      <div class="flex justify-between items-center text-xs text-slate-500 mt-2 font-mono">
        <span>Current Streak:
          ${currentStreak > 0 ? html`<b class="text-cyan-400">${currentStreak}</b>` : currentStreak}
          Days</span>
        <span>Longest:
          ${maxStreak > 0 ? html`<b class="text-cyan-400">${maxStreak}</b>` : maxStreak}
          Days</span>
      </div>

      ${active
        ? html`<div
            style=${{
              position: "absolute",
              left: `${Math.min(active.pos.x, (containerRef.current?.offsetWidth || 999) - 270)}px`,
              top: `${active.pos.y}px`,
              zIndex: 60,
            }}
            class="p-3 w-64 bg-[#071018] border ${pinned ? "border-cyan-500/30" : "border-white/5"} rounded-xl text-sm text-slate-200 shadow-2xl"
            onClick=${(e) => e.stopPropagation()}
          >
            <div class="flex items-center justify-between mb-1">
              <div class="text-xs text-slate-400">${fmtDateLabel(active.day.date)}</div>
              ${pinned ? html`<button
                onClick=${() => setPinned(null)}
                class="text-slate-500 hover:text-slate-300 text-[10px] leading-none px-1"
              >✕</button>` : html`<span class="text-[9px] text-slate-600">click to pin</span>`}
            </div>
            <div class="flex gap-2 mb-2">
              <div class="flex-1 text-[12px]">
                <span class="font-medium text-emerald-400">Easy</span>
                <div class="text-xs text-slate-400">${active.day.data.easy || 0}</div>
              </div>
              <div class="flex-1 text-[12px]">
                <span class="font-medium text-amber-400">Medium</span>
                <div class="text-xs text-slate-400">${active.day.data.medium || 0}</div>
              </div>
              <div class="flex-1 text-[12px]">
                <span class="font-medium text-rose-400">Hard</span>
                <div class="text-xs text-slate-400">${active.day.data.hard || 0}</div>
              </div>
            </div>
            ${Object.keys(active.day.data.raw || {}).length > 0 ? html`
              <div class="text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Raw types</div>
              ${Object.entries(active.day.data.raw).map(
                ([rawLabel, cnt]) => html`
                  <div class="flex items-center justify-between gap-2 mb-1">
                    <div class="text-[12px] truncate">
                      ${rawLabel} <span class="text-xs text-slate-500">(${cnt})</span>
                    </div>
                    <select
                      class="bg-[#0d1117] border border-white/10 text-xs text-slate-300 px-1.5 py-0.5 rounded"
                      onChange=${(e) => saveMapping(rawLabel, e.target.value)}
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                `,
              )}
            ` : html`<div class="text-[12px] text-slate-600">No solves this day</div>`}
          </div>`
        : ""}
    </div>
  `;
}
