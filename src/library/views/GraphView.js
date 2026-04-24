/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from '../../vendor/preact-bundle.js';
import { useEffect, useRef } from '../../vendor/preact-bundle.js';
import { htm } from '../../vendor/preact-bundle.js';
const html = htm.bind(h);

export function GraphView({ problems }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !window.vis || problems.length === 0) return;
    
    // Using dynamic import or global vis object here
    // Building vis nodes based on GraphData builder core class
    const nodes = new window.vis.DataSet(problems.map(p => ({ id: p.id, label: p.title, group: p.topic })));
    const edges = new window.vis.DataSet([]);

    const network = new window.vis.Network(containerRef.current, { nodes, edges }, {
      nodes: { shape: 'dot', size: 16, font: { color: '#cbd5e1' } },
      physics: { stabilization: false },
      groups: {
        'Dynamic Programming': { color: '#3b82f6' }
      }
    });

    return () => network.destroy();
  }, [problems]);

  return html`
    <div class="flex-1 w-full bg-[#0a0a0f] border border-white/5 rounded-2xl relative overflow-hidden flex items-center justify-center">
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.05),transparent)] pointer-events-none"></div>
      ${problems.length === 0 
        ? html`<p class="text-slate-500 uppercase tracking-widest text-[10px]">No graph data available.</p>` 
        : html`<div ref=${containerRef} class="absolute inset-0"></div>`
      }
    </div>
  `;
}
