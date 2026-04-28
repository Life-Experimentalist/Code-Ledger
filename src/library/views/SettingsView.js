/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import { htm, useState } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { SettingsSchema } from "../../ui/components/SettingsSchema.js";
import { registry } from "../../core/handler-registry.js";
import { Storage } from "../../core/storage.js";

async function exportData() {
  const [problems, settings] = await Promise.all([
    Storage.getAllProblems(),
    Storage.getSettings(),
  ]);
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    problems: problems || [],
    settings: settings || {},
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `codeledger-backup-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return problems.length;
}

async function importData(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data.problems || !Array.isArray(data.problems)) {
    throw new Error("Invalid backup file: missing problems array");
  }
  for (const p of data.problems) {
    await Storage.saveProblem(p);
  }
  return data.problems.length;
}

function BackupRestore() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    setStatus("");
    try {
      const count = await exportData();
      setStatus(`Exported ${count} problems successfully.`);
    } catch (e) {
      setStatus(`Export failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus("");
    try {
      const count = await importData(file);
      setStatus(`Imported ${count} problems. Reload the page to see them.`);
    } catch (err) {
      setStatus(`Import failed: ${err.message}`);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return html`
    <div class="p-6 bg-[#0a0a0f] border border-white/5 rounded-2xl">
      <h2 class="text-base font-semibold text-white mb-1">Backup &amp; Restore</h2>
      <p class="text-xs text-slate-400 mb-5">
        Export all your solved problems and settings to a JSON file, or restore from a previous backup.
      </p>
      <div class="flex flex-wrap gap-3 items-center">
        <button
          onClick=${doExport}
          disabled=${busy}
          class="px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors disabled:opacity-50"
        >
          ${busy ? "Working…" : "Export backup"}
        </button>
        <label class="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg cursor-pointer transition-colors ${busy ? "opacity-50 pointer-events-none" : ""}">
          Import backup
          <input
            type="file"
            accept=".json,application/json"
            class="sr-only"
            onChange=${doImport}
            disabled=${busy}
          />
        </label>
      </div>
      ${status ? html`<p class="mt-3 text-xs ${status.includes("failed") ? "text-rose-400" : "text-emerald-400"}">${status}</p>` : ""}
    </div>
  `;
}

export function SettingsView({ settings, onSettingsChange }) {
  const schemas = registry.getAllSettingsSchemas();

  return html`
    <div class="flex flex-col gap-8 w-full max-w-4xl">
      <div class="p-6 bg-[#0a0a0f] border border-white/5 rounded-2xl">
        <h2 class="text-xl font-light text-white mb-1">Preferences</h2>
        <p class="text-sm text-slate-400 mb-6">
          Manage tracking triggers, AI models, and sync behaviors.
        </p>
        <${SettingsSchema}
          schema=${schemas}
          values=${settings}
          onChange=${onSettingsChange}
        />
      </div>
      <${BackupRestore} />
    </div>
  `;
}
