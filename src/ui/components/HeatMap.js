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

export function HeatMap({ problems = [] }) {
  const containerRef = useRef(null);
  const [selectedPeriod, setSelectedPeriod] = useState("past_year");
  const [userMap, setUserMap] = useState({});
  const [hover, setHover] = useState(null);

  useEffect(() => {
    let mounted = true;
    loadUserDifficultyMap()
      .then((m) => {
        if (mounted) setUserMap(m || {});
      })
      .catch(() => {});
    return () => (mounted = false);
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set();
    problems.forEach((p) => {
      years.add(
        new Date((p.timestamp || Date.now() / 1000) * 1000).getFullYear(),
      );
    });
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [problems]);

  const { grid, currentStreak, maxStreak, maxCount } = useMemo(() => {
    let endDate = new Date();
    let startDate = new Date();

    if (selectedPeriod === "past_year") {
      startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - (52 * 7 - 1));
      startDate.setDate(startDate.getDate() - startDate.getDay());
    } else {
      const year = parseInt(selectedPeriod, 10);
      startDate = new Date(year, 0, 1);
      startDate.setDate(startDate.getDate() - startDate.getDay());
      endDate = new Date(year, 11, 31);
      const realToday = new Date();
      if (year === realToday.getFullYear()) endDate = realToday;
    }

    // Build a per-day breakdown by difficulty
    const dayMap = {}; // dateStr => { easy, medium, hard, raw: {label:count} }
    const addToDay = (dateStr, rawLabel, category) => {
      if (!dayMap[dateStr])
        dayMap[dateStr] = { easy: 0, medium: 0, hard: 0, raw: {} };
      dayMap[dateStr][category.toLowerCase()] =
        (dayMap[dateStr][category.toLowerCase()] || 0) + 1;
      dayMap[dateStr].raw[rawLabel] = (dayMap[dateStr].raw[rawLabel] || 0) + 1;
    };

    for (const p of problems) {
      const d = new Date((p.timestamp || Date.now() / 1000) * 1000);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const raw = p.difficulty || "";
      const category = mapDifficulty(raw, userMap); // 'Easy'|'Medium'|'Hard'
      addToDay(dateStr, String(raw || "Unknown"), category);
    }

    // Compute streaks (5y lookback)
    let cStreak = 0,
      mStreak = 0,
      temp = 0;
    const today = new Date();
    const streakStart = new Date(today);
    streakStart.setFullYear(streakStart.getFullYear() - 5);
    for (
      let it = new Date(streakStart);
      it <= today;
      it.setDate(it.getDate() + 1)
    ) {
      const dStr = `${it.getFullYear()}-${String(it.getMonth() + 1).padStart(2, "0")}-${String(it.getDate()).padStart(2, "0")}`;
      const total =
        (dayMap[dStr] &&
          dayMap[dStr].easy + dayMap[dStr].medium + dayMap[dStr].hard) ||
        0;
      if (total) temp++;
      else {
        mStreak = Math.max(mStreak, temp);
        temp = 0;
      }
    }
    mStreak = Math.max(mStreak, temp);
    for (
      let d = new Date(today);
      d >= streakStart;
      d.setDate(d.getDate() - 1)
    ) {
      const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const total =
        (dayMap[dStr] &&
          dayMap[dStr].easy + dayMap[dStr].medium + dayMap[dStr].hard) ||
        0;
      if (total) cStreak++;
      else break;
    }

    // Build weeks grid
    const compiled = [];
    let cur = new Date(startDate);
    const totalDays =
      Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const weeks = Math.ceil(totalDays / 7);
    for (let w = 0; w < weeks; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        if (cur <= endDate) {
          const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
          const data = dayMap[dateStr] || {
            easy: 0,
            medium: 0,
            hard: 0,
            raw: {},
          };
          const total = data.easy + data.medium + data.hard;
          week.push({ date: dateStr, data, total });
        }
        cur.setDate(cur.getDate() + 1);
      }
      compiled.push(week);
    }

    const allTotals = Object.values(dayMap).map(
      (d) => d.easy + d.medium + d.hard,
    );
    const max = allTotals.length ? Math.max(...allTotals) : 0;

    return {
      grid: compiled,
      currentStreak: cStreak,
      maxStreak: mStreak,
      maxCount: max,
    };
  }, [problems, selectedPeriod, userMap]);

  const getColor = (count) => {
    if (!count) return "bg-white/5";
    const max = Math.max(1, maxCount || 1);
    const ratio = count / max;
    if (ratio <= 0.25) return "bg-cyan-900/60";
    if (ratio <= 0.5) return "bg-cyan-700";
    if (ratio <= 0.75) return "bg-cyan-600";
    return "bg-cyan-400";
  };

  const onDayEnter = (ev, day) => {
    const rect =
      containerRef.current && containerRef.current.getBoundingClientRect();
    const x = ev.clientX - (rect ? rect.left : 0) + 8;
    const y = ev.clientY - (rect ? rect.top : 0) + 8;
    setHover({ pos: { x, y }, day });
  };
  const onDayLeave = () => setHover(null);

  const saveMapping = async (rawLabel, mappedTo) => {
    try {
      const settings = await Storage.getSettings();
      const m =
        settings && settings.difficultyMap ? settings.difficultyMap : {};
      m[rawLabel] = mappedTo;
      settings.difficultyMap = m;
      await Storage.setSettings(settings);
      setUserMap(m);
    } catch (e) {
      // ignore
    }
  };

  return html`
    <div
      class="p-6 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col gap-4 overflow-hidden"
      ref=${containerRef}
    >
      <div class="flex justify-between items-center">
        <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest">
          Consistency Map
        </h3>
        <select
          class="bg-black border border-white/10 rounded text-xs text-slate-300 px-2 py-1 outline-none"
          value=${selectedPeriod}
          onChange=${(e) => setSelectedPeriod(e.target.value)}
        >
          <option value="past_year">Past 1 Year</option>
          ${availableYears.map((y) => html`<option value="${y}">${y}</option>`)}
        </select>
      </div>

      <div class="overflow-x-auto pb-2">
        <div class="flex gap-1 min-w-max">
          ${grid.map(
            (week) =>
              html`<div class="flex flex-col gap-1">
                ${week.map(
                  (day) => html`
                    <div
                      class="w-4 h-4 rounded-sm ${getColor(
                        day.total,
                      )} transition-colors duration-200 hover:ring-1 ring-cyan-300 cursor-default"
                      onMouseEnter=${(e) => onDayEnter(e, day)}
                      onMouseLeave=${onDayLeave}
                      title="${day.date}: ${day.total} solves"
                    ></div>
                  `,
                )}
              </div>`,
          )}
        </div>
      </div>

      <div
        class="flex justify-between items-center text-xs text-slate-500 mt-2 font-mono"
      >
        <span
          >Current Streak:
          ${currentStreak > 0
            ? html`<b class="text-cyan-400">${currentStreak}</b>`
            : currentStreak}
          Days</span
        >
        <span
          >Longest:
          ${maxStreak > 0
            ? html`<b class="text-cyan-400">${maxStreak}</b>`
            : maxStreak}
          Days</span
        >
      </div>

      ${hover
        ? html`<div
            style=${{
              position: "absolute",
              left: `${hover.pos.x}px`,
              top: `${hover.pos.y}px`,
              zIndex: 60,
            }}
            class="p-3 w-64 bg-[#071018] border border-white/5 rounded text-sm text-slate-200 shadow-xl"
          >
            <div class="text-xs text-slate-400 mb-1">
              ${fmtDateLabel(hover.day.date)}
            </div>
            <div class="flex gap-2 mb-2">
              <div class="flex-1 text-[12px]">
                <span class="font-medium text-slate-200">Easy</span>
                <div class="text-xs text-slate-400">
                  ${hover.day.data.easy || 0}
                </div>
              </div>
              <div class="flex-1 text-[12px]">
                <span class="font-medium text-slate-200">Medium</span>
                <div class="text-xs text-slate-400">
                  ${hover.day.data.medium || 0}
                </div>
              </div>
              <div class="flex-1 text-[12px]">
                <span class="font-medium text-slate-200">Hard</span>
                <div class="text-xs text-slate-400">
                  ${hover.day.data.hard || 0}
                </div>
              </div>
            </div>
            <div class="text-xs text-slate-400 mb-2">Raw types:</div>
            ${Object.keys(hover.day.data.raw || {}).length === 0
              ? html`<div class="text-[12px] text-slate-500">None</div>`
              : Object.entries(hover.day.data.raw).map(
                  ([rawLabel, cnt]) => html`
                    <div class="flex items-center justify-between gap-2 mb-1">
                      <div class="text-[12px] truncate">
                        ${rawLabel}
                        <span class="text-xs text-slate-500">(${cnt})</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <select
                          class="bg-black border border-white/10 text-xs text-slate-300 px-2 py-1 rounded"
                          onChange=${(e) =>
                            saveMapping(rawLabel, e.target.value)}
                        >
                          <option value="Easy">Easy</option>
                          <option value="Medium">Medium</option>
                          <option value="Hard">Hard</option>
                        </select>
                      </div>
                    </div>
                  `,
                )}
          </div>`
        : ""}
    </div>
  `;
}
