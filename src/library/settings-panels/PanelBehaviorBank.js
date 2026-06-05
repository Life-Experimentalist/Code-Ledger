/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect, useRef } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";
import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("PanelBehaviorBank");

export function PanelBehaviorBank() {
  const [bankData, setBankData] = useState({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadBankData();
  }, []);

  const loadBankData = async () => {
    try {
      const data = (await Storage.getBehaviorBank()) || {};
      setBankData(data);
    } catch (e) {
      dbg.error("Failed to load behavior bank", e?.message || e);
      setBankData({});
    }
  };

  const computeStats = () => {
    const stats = {
      totalProblems: 0,
      totalSolves: 0,
      totalTime: 0,
      platforms: {},
      languages: {},
      topics: {},
      avgTimePerSolve: 0,
    };

    Object.entries(bankData).forEach(([key, entry]) => {
      // Skip system keys
      if (key.startsWith("__")) return;

      stats.totalProblems++;

      const solves = entry.solves || [];
      stats.totalSolves += solves.length;

      solves.forEach((s) => {
        stats.totalTime += s.elapsedSeconds || 0;
      });

      if (entry.platform) {
        stats.platforms[entry.platform] =
          (stats.platforms[entry.platform] || 0) + 1;
      }

      if (entry.lang) {
        stats.languages[entry.lang] = (stats.languages[entry.lang] || 0) + 1;
      }

      // Use first tag as "topic"
      if (entry.tags && entry.tags.length > 0) {
        const topic = entry.tags[0];
        stats.topics[topic] = (stats.topics[topic] || 0) + 1;
      }
    });

    if (stats.totalSolves > 0) {
      stats.avgTimePerSolve = Math.round(stats.totalTime / stats.totalSolves);
    }

    return stats;
  };

  const handleExport = async () => {
    try {
      setLoading(true);
      setMsg("Preparing export…");
      const data = (await Storage.getBehaviorBank()) || {};
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `codeledger-behavior-bank-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("✓ Behavior bank exported");
      setTimeout(() => setMsg(""), 4000);
    } catch (e) {
      dbg.error("Export failed", e?.message || e);
      setMsg("Failed: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      setMsg("Importing behavior bank…");
      const text = await file.text();
      const imported = JSON.parse(text);
      if (typeof imported !== "object" || imported === null) {
        throw new Error("Invalid behavior bank format: must be a JSON object");
      }

      // Optionally merge with existing or replace
      const shouldMerge = confirm(
        "Merge with existing behavior bank data?\n\nOK = Merge (combine both)\nCancel = Replace (use imported data only)",
      );

      let finalData = imported;
      if (shouldMerge) {
        const existing = (await Storage.getBehaviorBank()) || {};
        finalData = { ...existing, ...imported };
      }

      await Storage.setBehaviorBank(finalData);
      setBankData(finalData);
      setMsg(`✓ Imported ${Object.keys(imported).length} entries`);
      setTimeout(() => setMsg(""), 4000);
    } catch (e) {
      dbg.error("Import failed", e?.message || e);
      setMsg("Failed: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleClear = async () => {
    if (!confirm("Clear all behavior bank data? This cannot be undone."))
      return;
    try {
      setLoading(true);
      setMsg("Clearing behavior bank…");
      await Storage.setBehaviorBank({});
      setBankData({});
      setMsg("✓ Behavior bank cleared");
      setTimeout(() => setMsg(""), 4000);
    } catch (e) {
      dbg.error("Clear failed", e?.message || e);
      setMsg("Failed: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  const stats = computeStats();
  const topPlatforms = Object.entries(stats.platforms)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topLanguages = Object.entries(stats.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topTopics = Object.entries(stats.topics)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const formatTime = (seconds) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.round(mins / 60);
    return `${hours}h`;
  };

  return html`
    <div class="flex flex-col gap-6 w-full">
      <!-- Header -->
      <div class="p-6 bg-[#0a0a0f] border border-white/5 rounded-2xl">
        <h2 class="text-xl font-light text-white mb-1">Behavior Bank</h2>
        <p class="text-sm text-slate-400 mb-6">
          Track your coding patterns: solve history, platforms, languages, and
          topics.
        </p>

        <!-- Aggregate Stats -->
        ${stats.totalProblems > 0
          ? html`
              <div class="grid grid-cols-2 gap-3 mb-6">
                <div class="p-3 bg-white/5 border border-white/10 rounded-lg">
                  <p class="text-xs text-slate-400 mb-1">Problems Solved</p>
                  <p class="text-lg font-semibold text-white">
                    ${stats.totalProblems}
                  </p>
                </div>
                <div class="p-3 bg-white/5 border border-white/10 rounded-lg">
                  <p class="text-xs text-slate-400 mb-1">Total Solves</p>
                  <p class="text-lg font-semibold text-white">
                    ${stats.totalSolves}
                  </p>
                </div>
                <div class="p-3 bg-white/5 border border-white/10 rounded-lg">
                  <p class="text-xs text-slate-400 mb-1">Total Time</p>
                  <p class="text-lg font-semibold text-white">
                    ${formatTime(stats.totalTime)}
                  </p>
                </div>
                <div class="p-3 bg-white/5 border border-white/10 rounded-lg">
                  <p class="text-xs text-slate-400 mb-1">Avg per Solve</p>
                  <p class="text-lg font-semibold text-white">
                    ${formatTime(stats.avgTimePerSolve)}
                  </p>
                </div>
              </div>
            `
          : html`
              <p class="text-sm text-slate-400 mb-6 py-4">
                No behavior data yet. Start solving problems to build your
                behavior bank!
              </p>
            `}

        <!-- Top Platforms -->
        ${topPlatforms.length > 0
          ? html`
              <div class="mb-6">
                <h3
                  class="text-xs font-medium text-slate-400 uppercase tracking-widest mb-3"
                >
                  Top Platforms
                </h3>
                <div class="grid grid-cols-2 gap-2">
                  ${topPlatforms.map(
                    ([name, count]) => html`
                      <div
                        class="px-3 py-2 bg-white/5 border border-white/10 rounded text-xs text-slate-300"
                      >
                        <span class="font-medium">${name}:</span>
                        ${count}
                      </div>
                    `,
                  )}
                </div>
              </div>
            `
          : ""}

        <!-- Top Languages -->
        ${topLanguages.length > 0
          ? html`
              <div class="mb-6">
                <h3
                  class="text-xs font-medium text-slate-400 uppercase tracking-widest mb-3"
                >
                  Top Languages
                </h3>
                <div class="grid grid-cols-3 gap-2">
                  ${topLanguages.map(
                    ([name, count]) => html`
                      <div
                        class="px-3 py-2 bg-white/5 border border-white/10 rounded text-xs text-slate-300"
                      >
                        <span class="font-medium">${name}:</span>
                        ${count}
                      </div>
                    `,
                  )}
                </div>
              </div>
            `
          : ""}

        <!-- Top Topics -->
        ${topTopics.length > 0
          ? html`
              <div class="mb-6">
                <h3
                  class="text-xs font-medium text-slate-400 uppercase tracking-widest mb-3"
                >
                  Top 10 Topics
                </h3>
                <div class="grid grid-cols-2 gap-2">
                  ${topTopics.map(
                    ([topic, count]) => html`
                      <div
                        class="px-3 py-2 bg-white/5 border border-white/10 rounded text-xs text-slate-300 truncate"
                      >
                        <span class="font-medium">${topic}:</span>
                        ${count}
                      </div>
                    `,
                  )}
                </div>
              </div>
            `
          : ""}
      </div>

      <!-- Actions -->
      <div class="p-6 bg-[#0a0a0f] border border-white/5 rounded-2xl">
        <h3 class="text-sm font-light text-white mb-4">Data Management</h3>
        <div class="flex flex-wrap gap-3 mb-4">
          <button
            onClick=${handleExport}
            disabled=${loading || stats.totalProblems === 0}
            class="px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors disabled:opacity-50"
          >
            ${loading ? "Processing…" : "Export as JSON"}
          </button>
          <button
            onClick=${handleImportClick}
            disabled=${loading}
            class="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-200 text-xs rounded-lg transition-colors disabled:opacity-50"
          >
            ${loading ? "Processing…" : "Import from JSON"}
          </button>
          <button
            onClick=${handleClear}
            disabled=${loading || stats.totalProblems === 0}
            class="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/30 text-rose-300 text-xs rounded-lg transition-colors disabled:opacity-50"
          >
            ${loading ? "Processing…" : "Clear Data"}
          </button>
        </div>
        ${msg &&
        html`
          <p
            class="text-xs ${msg.includes("Failed")
              ? "text-rose-400"
              : "text-emerald-400"}"
          >
            ${msg}
          </p>
        `}
        <input
          ref=${fileInputRef}
          type="file"
          accept=".json"
          style="display: none"
          onChange=${handleImportFile}
        />
      </div>
    </div>
  `;
}
