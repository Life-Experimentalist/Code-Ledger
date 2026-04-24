/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from '../../vendor/preact-bundle.js';
import { htm, useState, useMemo } from '../../vendor/preact-bundle.js';
const html = htm.bind(h);

export function HeatMap({ problems }) {
  const availableYears = useMemo(() => {
    const years = new Set();
    problems.forEach(p => {
      years.add(new Date(p.timestamp * 1000).getFullYear());
    });
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a); // descending
  }, [problems]);

  const [selectedPeriod, setSelectedPeriod] = useState('past_year'); // 'past_year' or '2024' etc.

  const { grid, currentStreak, maxStreak } = useMemo(() => {
    let endDate = new Date();
    let startDate = new Date();
    
    // Determine start/end date for grid
    if (selectedPeriod === 'past_year') {
      // End date is today. Start is 52 weeks ago from the Sunday.
      startDate.setDate(endDate.getDate() - (52 * 7 - 1));
      startDate.setDate(startDate.getDate() - startDate.getDay()); 
    } else {
      const year = parseInt(selectedPeriod, 10);
      startDate = new Date(year, 0, 1);
      // Align start to the Sunday before Jan 1
      startDate.setDate(startDate.getDate() - startDate.getDay());
      
      endDate = new Date(year, 11, 31);
      // If it's the current year, don't show future beyond this week
      const realToday = new Date();
      if (year === realToday.getFullYear()) {
        endDate = realToday;
      }
    }

    const countMap = problems.reduce((acc, p) => {
      const d = new Date(p.timestamp * 1000);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      acc[dateStr] = (acc[dateStr] || 0) + 1;
      return acc;
    }, {});

    // Compute streaks based on total history (independent of selected period filter)
    let cStreak = 0;
    let mStreak = 0;
    let tempStreak = 0;
    
    const todayStrDate = new Date();
    const streakStartDate = new Date(todayStrDate);
    streakStartDate.setDate(streakStartDate.getDate() - 365 * 5); // 5 years lookback for streaks
    
    for (let iterDate = new Date(streakStartDate); iterDate <= todayStrDate; iterDate.setDate(iterDate.getDate() + 1)) {
      const dateStr = `${iterDate.getFullYear()}-${String(iterDate.getMonth() + 1).padStart(2, '0')}-${String(iterDate.getDate()).padStart(2, '0')}`;
      if (countMap[dateStr]) {
        tempStreak++;
      } else {
        mStreak = Math.max(mStreak, tempStreak);
        tempStreak = 0;
      }
    }
    mStreak = Math.max(mStreak, tempStreak);
    
    for (let countObjDate = new Date(todayStrDate); countObjDate >= streakStartDate; countObjDate.setDate(countObjDate.getDate() - 1)) {
      const dateStr = `${countObjDate.getFullYear()}-${String(countObjDate.getMonth() + 1).padStart(2, '0')}-${String(countObjDate.getDate()).padStart(2, '0')}`;
      if (countMap[dateStr] || (countObjDate.toISOString().split('T')[0] === todayStrDate.toISOString().split('T')[0] && countMap[dateStr] === undefined && cStreak === 0)) {
          if (countMap[dateStr]) {
              cStreak++;
          }
      } else {
          break;
      }
    }

    const compiledGrid = [];
    let currentDate = new Date(startDate);
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const weeks = Math.ceil(totalDays / 7);

    for (let w = 0; w < weeks; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        if (currentDate <= endDate) {
          const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
          week.push({ date: dateStr, count: countMap[dateStr] || 0 });
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
      compiledGrid.push(week);
    }
    
    return { grid: compiledGrid, currentStreak: cStreak, maxStreak: mStreak };
  }, [problems, selectedPeriod]);

  const getColor = (count) => {
    if (!count) return 'bg-white/5';
    if (count === 1) return 'bg-cyan-900/60';
    if (count <= 3) return 'bg-cyan-700';
    return 'bg-cyan-400';
  };

  return html`
    <div class="p-6 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col gap-4 overflow-hidden">
      <div class="flex justify-between items-center">
        <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest">Consistency Map</h3>
        <select class="bg-black border border-white/10 rounded text-xs text-slate-300 px-2 py-1 outline-none" value=${selectedPeriod} onChange=${e => setSelectedPeriod(e.target.value)}>
          <option value="past_year">Past 1 Year</option>
          ${availableYears.map(y => html`<option value="${y}">${y}</option>`)}
        </select>
      </div>
      <div class="overflow-x-auto pb-2">
        <div class="flex gap-1 min-w-max">
          ${grid.map(week => html`
            <div class="flex flex-col gap-1">
              ${week.map(day => html`
                <div 
                  class="w-3 h-3 rounded-sm ${getColor(day.count)} transition-colors duration-200 hover:ring-1 ring-cyan-300" 
                  title="${day.date}: ${day.count} solves">
                </div>
              `)}
            </div>
          `)}
        </div>
      </div>
      <div class="flex justify-between items-center text-xs text-slate-500 mt-2 font-mono">
        <span>Current Streak: ${currentStreak > 0 ? html`<b class="text-cyan-400">${currentStreak}</b>` : currentStreak} Days</span>
        <span>Longest: ${maxStreak > 0 ? html`<b class="text-cyan-400">${maxStreak}</b>` : maxStreak}  Days</span>
      </div>
    </div>
  `;
}
