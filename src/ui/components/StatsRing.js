/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from '../../vendor/preact-bundle.js';
import { useEffect, useRef } from '../../vendor/preact-bundle.js';
import { htm } from '../../vendor/preact-bundle.js';
import { Chart } from '../../vendor/chart-bundle.js';

const html = htm.bind(h);

export function StatsRing({ completed, total, label }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    if (chartRef.current) chartRef.current.destroy();

    const color = window.matchMedia('(prefers-color-scheme: dark)').matches ? '#06b6d4' : '#3b82f6';
    const bg = window.matchMedia('(prefers-color-scheme: dark)').matches ? '#1e293b' : '#e2e8f0';

    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [completed, total - completed],
          backgroundColor: [color, bg],
          borderWidth: 0,
          cutout: '80%'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { tooltip: { enabled: false }, legend: { display: false } },
        animation: { duration: 1000, easing: 'easeOutQuart' }
      }
    });

    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [completed, total]);

  return html`
    <div class="relative w-24 h-24 flex flex-col items-center justify-center">
      <canvas ref=${canvasRef} class="absolute inset-0"></canvas>
      <div class="z-10 flex flex-col items-center">
        <span class="text-xl font-bold text-white">${completed}</span>
        <span class="text-[10px] text-slate-400 uppercase tracking-widest">${label}</span>
      </div>
    </div>
  `;
}
