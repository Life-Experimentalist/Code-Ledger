/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import { useEffect, useRef } from "../../vendor/preact-bundle.js";
import Chart from "../../vendor/chart-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("ChartWrapper");

/**
 * onElementClick(label, value) — called when user clicks a chart segment/bar.
 * label = data label string, value = numeric data point.
 */
export function ChartWrapper({ type, data, options, className, onElementClick }) {
  const canvasRef = useRef(null);
  const chartInstance = useRef(null);
  const onClickRef = useRef(onElementClick);
  onClickRef.current = onElementClick;

  useEffect(() => {
    if (!canvasRef.current) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const defaultOptions = {
      responsive: true,
      maintainAspectRatio: false,
      color: "#e2e8f0",
      plugins: {
        legend: {
          labels: { color: "#e2e8f0" },
        },
      },
      ...options,
    };

    if (onClickRef.current) {
      const prevOnClick = defaultOptions.onClick;
      defaultOptions.onClick = (event, elements) => {
        if (prevOnClick) prevOnClick(event, elements);
        if (!elements.length) return;
        const idx = elements[0].index;
        const label = data?.labels?.[idx];
        const value = data?.datasets?.[0]?.data?.[idx];
        if (label !== undefined) onClickRef.current(label, value);
      };
      defaultOptions.plugins = defaultOptions.plugins || {};
      defaultOptions.plugins.cursor = { enabled: true };
    }

    if (defaultOptions.scales) {
      Object.values(defaultOptions.scales).forEach((scale) => {
        scale.grid = scale.grid || {};
        scale.grid.color = "rgba(255, 255, 255, 0.05)";
        scale.ticks = scale.ticks || {};
        scale.ticks.color = "#94a3b8";
      });
    }

    chartInstance.current = new Chart(canvasRef.current, {
      type,
      data,
      options: defaultOptions,
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [type, data, options]);

  return html`
    <div class="relative w-full h-full ${className || ""}">
      <canvas ref=${canvasRef} style=${onElementClick ? "cursor:pointer" : ""}></canvas>
    </div>
  `;
}
