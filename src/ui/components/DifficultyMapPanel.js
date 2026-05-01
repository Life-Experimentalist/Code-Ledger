/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Settings panel for difficulty normalization.
 * Built-in rules are shown as read-only chips; user overrides are editable.
 */
import { h } from "../../vendor/preact-bundle.js";
import { useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
import { BUILT_IN_MAP } from "../../core/difficulty-map.js";
import { Storage } from "../../core/storage.js";
const html = htm.bind(h);

const CANONICAL = ["Easy", "Medium", "Hard"];

const DIFF_COLOR = {
  Easy:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Hard:   "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

export function DifficultyMapPanel() {
  const [userMap, setUserMap]     = useState({});
  const [newRaw,  setNewRaw]      = useState("");
  const [newTo,   setNewTo]       = useState("Easy");
  const [status,  setStatus]      = useState("");

  useEffect(() => {
    Storage.getSettings()
      .then((s) => setUserMap(s?.difficultyMap || {}))
      .catch(() => {});
  }, []);

  const save = async (map) => {
    try {
      const settings = await Storage.getSettings();
      await Storage.setSettings({ ...settings, difficultyMap: map });
      setUserMap(map);
      setStatus("Saved");
      setTimeout(() => setStatus(""), 2000);
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    }
  };

  const addOverride = async () => {
    const trimmed = newRaw.trim();
    if (!trimmed) return;
    await save({ ...userMap, [trimmed]: newTo });
    setNewRaw("");
  };

  const removeOverride = async (key) => {
    const next = { ...userMap };
    delete next[key];
    await save(next);
  };

  const changeOverride = async (key, value) => {
    await save({ ...userMap, [key]: value });
  };

  // Built-in entries not shadowed by user overrides
  const builtInEntries = Object.entries(BUILT_IN_MAP);

  return html`
    <div class="p-6 bg-[#0a0a0f] rounded-2xl border border-white/5 flex flex-col gap-5">
      <div>
        <h3 class="text-sm font-bold text-white uppercase tracking-widest mb-1">Difficulty Normalization</h3>
        <p class="text-[11px] text-slate-500">
          Platform labels like "School" and "Basic" are automatically mapped to Easy/Medium/Hard.
          Add overrides below for any label the built-in rules don't cover.
        </p>
      </div>

      <!-- Built-in rules (read-only) -->
      <div>
        <div class="text-[10px] text-slate-600 uppercase tracking-wider mb-2">Built-in rules (automatic)</div>
        <div class="flex flex-wrap gap-1.5">
          ${builtInEntries.map(([raw, mapped]) => html`
            <span key=${raw} class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] ${DIFF_COLOR[mapped] || "bg-white/5 text-slate-400 border-white/10"}">
              <span class="text-slate-400">${raw}</span>
              <span class="opacity-40">→</span>
              <span>${mapped}</span>
            </span>
          `)}
        </div>
      </div>

      <!-- User overrides -->
      <div>
        <div class="text-[10px] text-slate-600 uppercase tracking-wider mb-2">Your overrides</div>
        ${Object.keys(userMap).length === 0
          ? html`<p class="text-[11px] text-slate-600">No overrides yet.</p>`
          : html`
            <div class="flex flex-col gap-1">
              ${Object.entries(userMap).map(([raw, mapped]) => html`
                <div key=${raw} class="flex items-center gap-2">
                  <span class="text-[11px] text-slate-300 min-w-[120px] font-mono">${raw}</span>
                  <span class="text-slate-600 text-[10px]">→</span>
                  <select
                    value=${mapped}
                    onChange=${(e) => changeOverride(raw, e.target.value)}
                    class="bg-[#0d1117] border border-white/10 text-xs text-slate-300 px-2 py-0.5 rounded"
                  >
                    ${CANONICAL.map((c) => html`<option value=${c}>${c}</option>`)}
                  </select>
                  <button
                    onClick=${() => removeOverride(raw)}
                    class="text-[10px] text-slate-600 hover:text-rose-400 px-1 transition-colors"
                  >✕</button>
                </div>
              `)}
            </div>
          `}
      </div>

      <!-- Add override -->
      <div class="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Raw label (e.g. Expert)"
          value=${newRaw}
          onInput=${(e) => setNewRaw(e.target.value)}
          onKeyDown=${(e) => e.key === "Enter" && addOverride()}
          class="bg-[#0d1117] border border-white/10 text-xs text-slate-300 px-3 py-1.5 rounded-lg flex-1 min-w-[140px] outline-none focus:border-cyan-500/50"
        />
        <select
          value=${newTo}
          onChange=${(e) => setNewTo(e.target.value)}
          class="bg-[#0d1117] border border-white/10 text-xs text-slate-300 px-2 py-1.5 rounded-lg"
        >
          ${CANONICAL.map((c) => html`<option value=${c}>${c}</option>`)}
        </select>
        <button
          onClick=${addOverride}
          disabled=${!newRaw.trim()}
          class="px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-medium hover:bg-cyan-500/25 transition-colors disabled:opacity-40"
        >Add</button>
      </div>

      ${status ? html`<p class="text-[11px] text-emerald-400">${status}</p>` : ""}
    </div>
  `;
}
