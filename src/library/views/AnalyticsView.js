/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from '../../vendor/preact-bundle.js';
import { useMemo } from '../../vendor/preact-bundle.js';
import { htm } from '../../vendor/preact-bundle.js';
const html = htm.bind(h);

import { HeatMap } from '../../ui/components/HeatMap.js';
import { ChartWrapper } from '../../ui/components/ChartWrapper.js';

export function AnalyticsView({ problems }) {
  const stats = useMemo(() => {
    const s = {
      easy: 0, medium: 0, hard: 0, total: problems.length,
      topics: {}, platforms: {}, langs: {}, weeks: {}
    };

    const dNow = new Date();
    for (let i = 11; i >= 0; i--) {
        const d = new Date(dNow.getTime() - i * 7 * 86400000);
        const wStr = `${d.getFullYear()}-W${Math.ceil((d.getDate() - d.getDay() + 1)/7)}`;
        s.weeks[wStr] = 0;
    }

    problems.forEach(p => {
      if (p.difficulty === 'Easy') s.easy++;
      else if (p.difficulty === 'Medium') s.medium++;
      else if (p.difficulty === 'Hard') s.hard++;

      p.tags.forEach(t => {
         if (!s.topics[t]) s.topics[t] = { easy: 0, medium: 0, hard: 0, total: 0, score: 0 };
         s.topics[t].total++;
         if (p.difficulty === 'Easy') { s.topics[t].easy++; s.topics[t].score += 1; }
         if (p.difficulty === 'Medium') { s.topics[t].medium++; s.topics[t].score += 3; }
         if (p.difficulty === 'Hard') { s.topics[t].hard++; s.topics[t].score += 5; }
      });

      s.platforms[p.platform] = (s.platforms[p.platform] || 0) + 1;
      s.langs[p.language] = (s.langs[p.language] || 0) + 1;

      const solvedDate = new Date(p.timestamp * 1000);
      const wStr = `${solvedDate.getFullYear()}-W${Math.ceil((solvedDate.getDate() - solvedDate.getDay() + 1)/7)}`;
      if (s.weeks[wStr] !== undefined) {
         s.weeks[wStr]++;
      }
    });

    return s;
  }, [problems]);

  const platformColors = {
    leetcode: '#FFA116',
    geeksforgeeks: '#2F8D46',
    codeforces: '#1F8ACB'
  };

  const chartData = useMemo(() => {
    const sortedTopics = Object.entries(stats.topics).sort((a, b) => b[1].score - a[1].score);
    const tpLabels = sortedTopics.slice(0, 8).map(t => t[0]);
    
    // Mastery algorithm: Max expected score for a "Mastered" topic is ~50 (e.g., 10 mediums, 4 hards)
    const MAX_TOPIC_SCORE = 50; 

    return {
      topicRadar: {
        labels: tpLabels,
        datasets: [{
          label: 'Mastery (%)',
          data: tpLabels.map(t => Math.min(100, (stats.topics[t].score / MAX_TOPIC_SCORE) * 100)),
          backgroundColor: 'rgba(6, 182, 212, 0.2)',
          borderColor: 'rgba(6, 182, 212, 1)',
          pointBackgroundColor: 'rgba(6, 182, 212, 1)',
        }]
      },
      difficultyDonut: {
        labels: ['Easy', 'Medium', 'Hard'],
        datasets: [{
          data: [stats.easy, stats.medium, stats.hard],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
          borderWidth: 0,
        }]
      },
      platformBar: {
        labels: Object.keys(stats.platforms),
        datasets: [{
          label: 'Problems',
          data: Object.values(stats.platforms),
          backgroundColor: Object.keys(stats.platforms).map(p => platformColors[p.toLowerCase()] || '#94a3b8'),
        }]
      },
      langPie: {
        labels: Object.keys(stats.langs),
        datasets: [{
          data: Object.values(stats.langs),
          backgroundColor: ['#f1e05a', '#3178c6', '#b07219', '#e34c26', '#89e051', '#f34b7d'].slice(0, Object.keys(stats.langs).length),
          borderWidth: 0,
        }]
      },
      velocityLine: {
        labels: Object.keys(stats.weeks).map(w => w.split('-')[1]),
        datasets: [{
          label: 'Solved',
          data: Object.values(stats.weeks),
          borderColor: '#06b6d4',
          tension: 0.3,
          fill: true,
          backgroundColor: 'rgba(6, 182, 212, 0.05)',
        }]
      }
    };
  }, [stats]);

  const topTopics = Object.entries(stats.topics).sort((a, b) => b[1].total - a[1].total).slice(0, 6);

  const unsolvedNext = useMemo(() => {
    // Dynamic recommendation algorithm based on user's strongest topics and difficulty distribution
    const recommendations = [];
    const pool = [
      { title: 'Merge k Sorted Lists', topic: 'Linked List', diff: 'Hard' },
      { title: 'Word Search II', topic: 'Trie', diff: 'Hard' },
      { title: 'Alien Dictionary', topic: 'Graphs', diff: 'Hard' },
      { title: 'Course Schedule', topic: 'Graphs', diff: 'Medium' },
      { title: 'Koko Eating Bananas', topic: 'Binary Search', diff: 'Medium' },
      { title: 'Two Sum', topic: 'Arrays', diff: 'Easy' },
      { title: 'Valid Parentheses', topic: 'Stack', diff: 'Easy' }
    ];

    // Filter out already solved problems (by title match, simplified)
    const solvedSet = new Set(problems.map(p => p.title.toLowerCase()));
    let available = pool.filter(p => !solvedSet.has(p.title.toLowerCase()));

    // If user solves mostly easy, recommend medium.
    const hardRatio = stats.hard / (stats.total || 1);
    const medRatio = stats.medium / (stats.total || 1);

    available.sort((a, b) => {
      const aMastery = stats.topics[a.topic]?.score || 0;
      const bMastery = stats.topics[b.topic]?.score || 0;
      // Recommend problems in topics they are actively practicing
      return bMastery - aMastery;
    });

    if (hardRatio > 0.3) {
      // User is advanced, recommend Hard/Mediums
      recommendations.push(...available.filter(p => p.diff !== 'Easy').slice(0, 3));
    } else if (medRatio > 0.4) {
      recommendations.push(...available.filter(p => p.diff === 'Medium').slice(0, 2));
      recommendations.push(...available.filter(p => p.diff === 'Hard').slice(0, 1));
    } else {
      recommendations.push(...available.filter(p => p.diff === 'Easy' || p.diff === 'Medium').slice(0, 3));
    }

    // Fallback if not enough matching criteria
    if (recommendations.length < 3) {
      recommendations.push(...available.slice(0, 3 - recommendations.length));
    }

    return recommendations.slice(0, 3);
  }, [problems, stats]);

  return html`
    <div class="flex flex-col gap-6 w-full pb-10">
       <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
         <div class="lg:col-span-2">
           <${HeatMap} problems=${problems} />
         </div>
         
         <div class="p-6 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col gap-4 relative overflow-hidden h-64">
           <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(6,182,212,0.05),transparent)] pointer-events-none"></div>
           <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest z-10">Difficulty Split</h3>
           <div class="flex-1 flex justify-center items-center z-10 relative">
             <${ChartWrapper} type="doughnut" data=${chartData.difficultyDonut} options=${{
               cutout: '75%',
               plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 15, usePointStyle: true, boxWidth: 6 } } }
             }} />
             <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-6">
               <span class="text-3xl font-bold text-white">${stats.total}</span>
               <span class="text-[10px] text-slate-500 uppercase tracking-wider">Solved</span>
             </div>
           </div>
         </div>
       </div>
       
       <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
         <!-- Topic Radar -->
         <div class="p-5 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col h-72">
            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Topic Mastery</h3>
            <div class="flex-1 min-h-0">
               <${ChartWrapper} type="radar" data=${chartData.topicRadar} options=${{
                  scales: { r: { grid: { color: 'rgba(255,255,255,0.1)' }, angleLines: { color: 'rgba(255,255,255,0.05)' }, pointLabels: { color: '#94a3b8' }, ticks: { display: false } } },
                  plugins: { legend: { display: false } }
               }} />
            </div>
         </div>
         
         <!-- Solve Velocity -->
         <div class="p-5 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col lg:col-span-2 h-72">
            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Solve Velocity (12 Weeks)</h3>
            <div class="flex-1 min-h-0">
               <${ChartWrapper} type="line" data=${chartData.velocityLine} options=${{
                  scales: { y: { beginAtZero: true } },
                  plugins: { legend: { display: false } }
               }} />
            </div>
         </div>
         
         <!-- Language Distribution -->
         <div class="p-5 bg-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col h-72">
            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Languages</h3>
             <div class="flex-1 min-h-0">
               <${ChartWrapper} type="pie" data=${chartData.langPie} options=${{
                  plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', usePointStyle: true, boxWidth: 8 } } }
               }} />
            </div>
         </div>
       </div>
       
       <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 flex flex-col gap-4">
             <h3 class="text-sm font-bold text-white tracking-wide">Topic Progress Grid</h3>
             <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
               ${topTopics.map(([topic, counts]) => html`
                 <div class="p-4 bg-[#0a0a0f] border border-white/5 rounded-xl hover:border-cyan-900/50 transition-colors cursor-pointer group">
                   <div class="flex justify-between items-center mb-3">
                     <span class="font-medium text-slate-300 group-hover:text-cyan-400 transition-colors">${topic}</span>
                     <span class="text-xs font-mono text-slate-500">${counts.total} / 50</span>
                   </div>
                   <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                      <div class="h-full bg-emerald-500" style=${{width: `${(counts.easy/50)*100}%`}}></div>
                      <div class="h-full bg-amber-500" style=${{width: `${(counts.medium/50)*100}%`}}></div>
                      <div class="h-full bg-rose-500" style=${{width: `${(counts.hard/50)*100}%`}}></div>
                   </div>
                 </div>
               `)}
             </div>
          </div>
          
          <div class="flex flex-col gap-4">
             <h3 class="text-sm font-bold text-white tracking-wide">Unsolved Next</h3>
             <div class="p-5 bg-gradient-to-b from-[#101018] to-[#0a0a0f] border border-white/5 rounded-2xl flex flex-col gap-3 h-full">
                <p class="text-xs text-slate-400 mb-2">Based on what you've solved, try these next:</p>
                ${unsolvedNext.map(rec => html`
                   <a href="#" class="p-3 bg-white/[0.02] border border-white/5 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all rounded-lg flex items-center justify-between group">
                      <div class="flex flex-col">
                         <span class="text-sm font-medium text-slate-300 group-hover:text-cyan-400">${rec.title}</span>
                         <span class="text-[10px] text-slate-500 mt-1">${rec.topic}</span>
                      </div>
                      <span class="text-xs px-2 py-0.5 rounded-full ${rec.diff === 'Hard' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'} border border-current/10">
                        ${rec.diff}
                      </span>
                   </a>
                `)}
             </div>
          </div>
       </div>

    </div>
  `;
}
