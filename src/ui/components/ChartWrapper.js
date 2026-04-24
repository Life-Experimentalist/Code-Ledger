/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from '../../vendor/preact-bundle.js';
import { useEffect, useRef } from '../../vendor/preact-bundle.js';
import Chart from '../../vendor/chart-bundle.js';
import { htm } from '../../vendor/preact-bundle.js';
const html = htm.bind(h);

export function ChartWrapper({ type, data, options, className }) {
  const canvasRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const defaultOptions = {
      responsive: true,
      maintainAspectRatio: false,
      color: '#e2e8f0',
      plugins: {
        legend: {
          labels: { color: '#e2e8f0' }
        }
      },
      ...options
    };

    if (defaultOptions.scales) {
      Object.values(defaultOptions.scales).forEach(scale => {
        scale.grid = scale.grid || {};
        scale.grid.color = 'rgba(255, 255, 255, 0.05)';
        scale.ticks = scale.ticks || {};
        scale.ticks.color = '#94a3b8';
      });
    }

    chartInstance.current = new Chart(canvasRef.current, {
      type,
      data,
      options: defaultOptions
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [type, data, options]);

  return html`
    <div class="relative w-full h-full ${className || ''}">
      <canvas ref=${canvasRef}></canvas>
    </div>
  `;
}
