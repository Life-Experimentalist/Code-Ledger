/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect, useRef } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";
import {
  BACKUP_STATUS_KEY,
  buildSnapshot,
  restoreSnapshot,
} from "../../core/backup/backup-manager.js";

// ── helpers ────────────────────────────────────────────────────────────────

async function exportData() {
  return await buildSnapshot();
}

async function downloadJSON(data, label) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `codeledger-${label}-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importData(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || (!data.problems && !data.behaviorBank && !data.settings && !data.roadmaps)) {
    throw new Error("Invalid backup payload");
  }
  const stats = await restoreSnapshot(data);
  return stats.problemsCount;
}

function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

/**
 * What the last attempt on each route actually did.
 *
 * The automatic backups run when nobody is looking, so until this line existed
 * a failing one looked exactly like a working one: the panel showed the same
 * four tabs either way, and the reason was in a console the user never opens.
 */
function BackupStatus({ settings }) {
  // Read it back rather than trusting the prop: the automatic backups are
  // written by the service worker, which does not know this panel is open.
  const [fresh, setFresh] = useState(null);
  useEffect(() => {
    Storage.getSettings()
      .then((s) => setFresh(s?.[BACKUP_STATUS_KEY] || null))
      .catch(() => {});
  }, []);

  const status = fresh || settings?.[BACKUP_STATUS_KEY];
  const rows = [
    ["On this device", status?.local],
    ["In your repo", status?.github],
  ].filter(([, s]) => s && s.at);
  if (rows.length === 0) return null;

  return html`
    <div class="rounded-xl border border-white/8 bg-white/[0.02] divide-y divide-white/5">
      ${rows.map(
        ([label, s]) => html`
          <div key=${label} class="flex items-start gap-2 px-3 py-2">
            <span class="text-xs ${s.ok ? "text-emerald-400" : "text-rose-400"}">
              ${s.ok ? "✓" : "✕"}
            </span>
            <div class="min-w-0">
              <p class="text-[11px] text-slate-400">${label} · ${fmtTime(s.at)}</p>
              ${s.detail &&
              html`<p class="text-[11px] ${s.ok ? "text-slate-500" : "text-rose-300"} break-words">
                ${s.detail}
              </p>`}
            </div>
          </div>
        `,
      )}
    </div>
  `;
}

function fmtSize(data) {
  const s = JSON.stringify(data || {}).length;
  if (s < 1024) return `${s} B`;
  if (s < 1048576) return `${(s / 1024).toFixed(1)} KB`;
  return `${(s / 1048576).toFixed(1)} MB`;
}

// ── Sub-panel: Manual ──────────────────────────────────────────────────────

function ManualBackups({ settings }) {
  const [backups, setBackups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [nameInput, setNameInput] = useState("");

  useEffect(() => {
    Storage.getManualBackups()
      .then(setBackups)
      .catch(() => {});
  }, []);

  const flash = (text, isErr = false) => {
    setMsg({ text, isErr });
    setTimeout(() => setMsg(""), 3000);
  };

  const create = async () => {
    setBusy(true);
    try {
      const data = await exportData();
      await downloadJSON(data, "manual");
      const entry = await Storage.addManualBackup(
        data,
        nameInput.trim() || `Backup ${backups.length + 1}`,
      );
      if (settings?.schedBackupOnExport) {
        Storage.addScheduledBackup(data, "on-export").catch(() => {});
      }
      setBackups(await Storage.getManualBackups());
      setNameInput("");
      flash(`Saved "${entry.name}" — ${(data.problems || []).length} problems`);
    } catch (e) {
      flash("Save failed: " + e.message, true);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (b) => {
    if (
      !confirm(
        `Restore "${b.name}" (${fmtTime(b.ts)})?\n\nThis merges all problems and configuration — existing data is not deleted.`,
      )
    )
      return;
    setBusy(true);
    try {
      const stats = await restoreSnapshot(b.data);
      flash(`Restored ${stats.problemsCount} problems and behavior logs`);
    } catch (e) {
      flash("Restore failed: " + e.message, true);
    } finally {
      setBusy(false);
    }
  };

  const download = async (b) => {
    try {
      await downloadJSON(b.data, b.name.replace(/\s+/g, "-").toLowerCase() || "manual");
    } catch (e) {
      flash("Download failed: " + e.message, true);
    }
  };

  const del = async (id, name) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await Storage.deleteManualBackup(id);
    setBackups(await Storage.getManualBackups());
  };

  const importFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const count = await importData(file);
      flash(`Imported ${count} problems. Reload to see them.`);
    } catch (e) {
      flash("Import failed: " + e.message, true);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return html`
    <div class="space-y-3">
      <p class="text-[11px] text-slate-500">
        Up to 10 manual snapshots. Each is a full export of problems + settings.
      </p>

      <!-- Create row -->
      <div class="flex gap-2">
        <input
          type="text"
          placeholder="Optional name…"
          value=${nameInput}
          onInput=${(e) => setNameInput(e.target.value)}
          class="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
        />
        <button
          onClick=${create}
          disabled=${busy}
          class="px-4 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          ${busy ? "Saving…" : "Save + Export"}
        </button>
        <label
          class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg cursor-pointer transition-colors whitespace-nowrap"
        >
          Import
          <input
            type="file"
            accept=".json,application/json"
            class="sr-only"
            onChange=${importFile}
          />
        </label>
      </div>

      ${msg &&
      html`<p class="text-xs ${msg.isErr ? "text-rose-400" : "text-emerald-400"}">${msg.text}</p>`}

      <!-- Backup list -->
      ${backups.length === 0
        ? html`<p class="text-xs text-slate-600 italic">No manual backups yet.</p>`
        : html`
            <div class="divide-y divide-white/5 rounded-xl border border-white/8 overflow-hidden">
              ${backups.map(
                (b) => html`
                  <div
                    key=${b.id}
                    class="flex items-center gap-3 px-3 py-2.5 bg-white/[0.02] hover:bg-white/[0.04]"
                  >
                    <div class="flex-1 min-w-0">
                      <p class="text-xs text-slate-200 truncate">${b.name || "Backup"}</p>
                      <p class="text-[11px] text-slate-500">
                        ${fmtTime(b.ts)} · ${(b.data?.problems || []).length} problems ·
                        ${fmtSize(b.data)}
                      </p>
                    </div>
                    <div class="flex gap-1 shrink-0">
                      <button
                        onClick=${() => download(b)}
                        title="Download JSON"
                        class="px-2 py-1 text-[10px] text-slate-400 hover:text-cyan-300 bg-white/5 rounded transition-colors"
                      >
                        ↓
                      </button>
                      <button
                        onClick=${() => restore(b)}
                        disabled=${busy}
                        title="Restore"
                        class="px-2 py-1 text-[10px] text-slate-400 hover:text-emerald-300 bg-white/5 rounded transition-colors"
                      >
                        ↩
                      </button>
                      <button
                        onClick=${() => del(b.id, b.name)}
                        title="Delete"
                        class="px-2 py-1 text-[10px] text-slate-400 hover:text-rose-400 bg-white/5 rounded transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                `,
              )}
            </div>
          `}
    </div>
  `;
}

// ── Sub-panel: Scheduled ───────────────────────────────────────────────────

function ScheduledBackups({ settings, onSettingsChange }) {
  const [backups, setBackups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    Storage.getScheduledBackups()
      .then(setBackups)
      .catch(() => {});
  }, []);

  const flash = (text, isErr = false) => {
    setMsg({ text, isErr });
    setTimeout(() => setMsg(""), 3000);
  };

  const triggerNow = async () => {
    setBusy(true);
    try {
      const data = await exportData();
      await Storage.addScheduledBackup(data, "manual-trigger");
      setBackups(await Storage.getScheduledBackups());
      flash(`Scheduled snapshot saved — ${(data.problems || []).length} problems`);
    } catch (e) {
      flash("Failed: " + e.message, true);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (b) => {
    if (
      !confirm(
        `Restore scheduled snapshot from ${fmtTime(b.ts)}?\n\nThis merges all problems and configuration — existing data is not deleted.`,
      )
    )
      return;
    setBusy(true);
    try {
      const stats = await restoreSnapshot(b.data);
      flash(`Restored ${stats.problemsCount} problems and behavior logs`);
    } catch (e) {
      flash("Restore failed: " + e.message, true);
    } finally {
      setBusy(false);
    }
  };

  const del = async (id) => {
    if (!confirm("Delete this scheduled snapshot?")) return;
    await Storage.deleteScheduledBackup(id);
    setBackups(await Storage.getScheduledBackups());
  };

  const download = async (b) => {
    try {
      await downloadJSON(b.data, `scheduled-${b.trigger}`);
    } catch (e) {
      flash("Download failed: " + e.message, true);
    }
  };

  const TRIGGERS = [
    {
      key: "schedBackupOnSolve",
      label: "After each solve",
      desc: "Takes a snapshot every time a solution is committed to GitHub.",
    },
    {
      key: "schedBackupOnExport",
      label: "After manual export",
      desc: "Takes a snapshot whenever you use Save+Export from Manual backups.",
    },
  ];

  return html`
    <div class="space-y-3">
      <p class="text-[11px] text-slate-500">
        Up to 5 automatic snapshots, rotated FIFO. Triggered by solve events since the extension
        can't use fixed timers.
      </p>

      <!-- Trigger settings -->
      <div class="space-y-2">
        ${TRIGGERS.map(({ key, label, desc }) => {
          const on = settings?.[key] !== false;
          return html`
            <label key=${key} class="flex items-start gap-3 cursor-pointer">
              <button
                onClick=${() => onSettingsChange(key, !on)}
                class="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
                  ${on ? "bg-cyan-500/30 border-cyan-500/40" : "bg-white/5 border-white/10"}"
              >
                <span
                  class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
                  ${on ? "translate-x-4" : "translate-x-0.5"}"
                ></span>
              </button>
              <div>
                <p class="text-sm text-slate-300">${label}</p>
                <p class="text-[11px] text-slate-500">${desc}</p>
              </div>
            </label>
          `;
        })}
      </div>

      <button
        onClick=${triggerNow}
        disabled=${busy}
        class="px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors disabled:opacity-50"
      >
        ${busy ? "Saving…" : "Trigger snapshot now"}
      </button>

      ${msg &&
      html`<p class="text-xs ${msg.isErr ? "text-rose-400" : "text-emerald-400"}">${msg.text}</p>`}
      ${backups.length === 0
        ? html`<p class="text-xs text-slate-600 italic">No scheduled snapshots yet.</p>`
        : html`
            <div class="divide-y divide-white/5 rounded-xl border border-white/8 overflow-hidden">
              ${backups.map(
                (b) => html`
                  <div key=${b.id} class="flex items-center gap-3 px-3 py-2.5 bg-white/[0.02]">
                    <div class="flex-1 min-w-0">
                      <p class="text-[11px] text-slate-500">
                        ${fmtTime(b.ts)} · via ${b.trigger} · ${(b.data?.problems || []).length}
                        problems
                      </p>
                    </div>
                    <div class="flex gap-1 shrink-0">
                      <button
                        onClick=${() => download(b)}
                        title="Download"
                        class="px-2 py-1 text-[10px] text-slate-400 hover:text-cyan-300 bg-white/5 rounded"
                      >
                        ↓
                      </button>
                      <button
                        onClick=${() => restore(b)}
                        disabled=${busy}
                        title="Restore"
                        class="px-2 py-1 text-[10px] text-slate-400 hover:text-emerald-300 bg-white/5 rounded"
                      >
                        ↩
                      </button>
                      <button
                        onClick=${() => del(b.id)}
                        title="Delete"
                        class="px-2 py-1 text-[10px] text-slate-400 hover:text-rose-400 bg-white/5 rounded"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                `,
              )}
            </div>
          `}
    </div>
  `;
}

// ── Sub-panel: Rolling ─────────────────────────────────────────────────────

function RollingBackup() {
  const [backup, setBackup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () =>
    Storage.getRollingBackup()
      .then(setBackup)
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const flash = (text, isErr = false) => {
    setMsg({ text, isErr });
    setTimeout(() => setMsg(""), 3000);
  };

  const refresh = async () => {
    setBusy(true);
    try {
      const data = await exportData();
      await Storage.updateRollingBackup(data);
      await load();
      flash(`Rolling backup updated — ${(data.problems || []).length} problems`);
    } catch (e) {
      flash("Failed: " + e.message, true);
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!backup) return;
    if (
      !confirm(
        `Restore rolling backup from ${fmtTime(backup.ts)}?\n\nThis merges all problems and configuration — existing data is not deleted.`,
      )
    )
      return;
    setBusy(true);
    try {
      const stats = await restoreSnapshot(backup.data);
      flash(`Restored ${stats.problemsCount} problems and behavior logs`);
    } catch (e) {
      flash("Restore failed: " + e.message, true);
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!backup) return;
    try {
      await downloadJSON(backup.data, "rolling");
    } catch (e) {
      flash("Download failed: " + e.message, true);
    }
  };

  return html`
    <div class="space-y-3">
      <p class="text-[11px] text-slate-500">
        A single always-current snapshot updated manually or automatically whenever you solve a
        problem. Useful as a last-resort recovery point.
      </p>

      ${backup
        ? html`
            <div
              class="flex items-center gap-3 p-3 rounded-xl border border-white/8 bg-white/[0.02]"
            >
              <div class="flex-1">
                <p class="text-xs text-slate-300">Last updated: ${fmtTime(backup.ts)}</p>
                <p class="text-[11px] text-slate-500">
                  ${(backup.data?.problems || []).length} problems · ${fmtSize(backup.data)}
                </p>
              </div>
              <div class="flex gap-1">
                <button
                  onClick=${download}
                  class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors"
                >
                  Download
                </button>
                <button
                  onClick=${restore}
                  disabled=${busy}
                  class="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-200 text-xs rounded-lg transition-colors disabled:opacity-50"
                >
                  Restore
                </button>
              </div>
            </div>
          `
        : html`<p class="text-xs text-slate-600 italic">
            No rolling backup yet — click Update now to create one.
          </p>`}

      <button
        onClick=${refresh}
        disabled=${busy}
        class="px-4 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors disabled:opacity-50"
      >
        ${busy ? "Updating…" : "Update now"}
      </button>

      ${msg &&
      html`<p class="text-xs ${msg.isErr ? "text-rose-400" : "text-emerald-400"}">${msg.text}</p>`}
    </div>
  `;
}

// ── Sub-panel: GitHub rolling backups ─────────────────────────────────────

function GitHubBackups({ settings, onSettingsChange }) {
  const [backups, setBackups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const isExtension = typeof chrome !== "undefined" && !!chrome?.runtime?.id;

  const flash = (text, isErr = false) => {
    setMsg({ text, isErr });
    setTimeout(() => setMsg(""), 4000);
  };

  const sw = (type, extra = {}) =>
    new Promise((res, rej) =>
      chrome.runtime.sendMessage({ type, ...extra }, (r) =>
        r?.ok ? res(r) : rej(new Error(r?.error || type + " failed")),
      ),
    );

  const loadBackups = async () => {
    if (!isExtension) return;
    setBusy(true);
    try {
      const r = await sw("LIST_GITHUB_BACKUPS");
      setBackups(r.backups || []);
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (isExtension) loadBackups();
  }, []);

  const commitNow = async () => {
    setBusy(true);
    try {
      const r = await sw("COMMIT_GITHUB_BACKUP_NOW");
      flash(
        `Committed ${r.path || "backup"}${r.pruned ? ` · pruned ${r.pruned} older` : ""}`.trim(),
      );
      await loadBackups();
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (b) => {
    if (
      !confirm(
        `Restore backup "${b.name}" from GitHub?\n\nThis merges problems — existing problems are not deleted.`,
      )
    )
      return;
    setBusy(true);
    try {
      const r = await sw("RESTORE_GITHUB_BACKUP", { filePath: b.path });
      flash(`Restored ${r.count} problems from ${b.name}`);
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  const GITHUB_SETTINGS = [
    {
      key: "githubRollingBackups",
      label: "Enable GitHub rolling backups",
      desc: "Commits a full snapshot to your repo every N problem solves.",
    },
  ];

  return html`
    <div class="space-y-4">
      <p class="text-[11px] text-slate-500">
        Commits full snapshots as
        <code class="text-cyan-400">backups/YYYY-MM-DD-HH-mm-ss.json</code>
        in your GitHub repo. Keeps only the N most recent — older ones are pruned automatically.
      </p>

      <!-- Toggle -->
      ${GITHUB_SETTINGS.map(({ key, label, desc }) => {
        const on = settings?.[key] !== false;
        return html`
          <label key=${key} class="flex items-start gap-3 cursor-pointer">
            <div class="relative mt-0.5 shrink-0">
              <input
                type="checkbox"
                checked=${on}
                onChange=${() => onSettingsChange?.(key, !on)}
                class="sr-only"
              />
              <div
                class="w-8 h-4 rounded-full transition-colors ${on ? "bg-cyan-600" : "bg-white/10"}"
              ></div>
              <div
                class="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${on
                  ? "translate-x-4"
                  : ""}"
              ></div>
            </div>
            <div>
              <p class="text-xs text-slate-200">${label}</p>
              <p class="text-[11px] text-slate-500 mt-0.5">${desc}</p>
            </div>
          </label>
        `;
      })}

      <!-- Interval + keep -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-[11px] text-slate-400 block mb-1">Every N commits</label>
          <input
            type="number"
            min="1"
            max="100"
            value=${settings?.githubBackupInterval || "10"}
            onInput=${(e) => onSettingsChange?.("githubBackupInterval", e.target.value)}
            class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div>
          <label class="text-[11px] text-slate-400 block mb-1">Keep last N backups</label>
          <input
            type="number"
            min="1"
            max="50"
            value=${settings?.githubBackupKeep || "10"}
            onInput=${(e) => onSettingsChange?.("githubBackupKeep", e.target.value)}
            class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      <!-- Actions -->
      ${isExtension &&
      html`
        <div class="flex items-center gap-2">
          <button
            onClick=${commitNow}
            disabled=${busy}
            class="px-4 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors disabled:opacity-50"
          >
            ${busy ? "Working…" : "Backup now"}
          </button>
          <button
            onClick=${loadBackups}
            disabled=${busy}
            class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors disabled:opacity-50"
          >
            Refresh list
          </button>
        </div>
      `}
      ${msg &&
      html`<p class="text-xs ${msg.isErr ? "text-rose-400" : "text-emerald-400"}">${msg.text}</p>`}

      <!-- Backup list -->
      ${backups.length > 0 &&
      html`
        <div class="divide-y divide-white/5 rounded-xl border border-white/8 overflow-hidden">
          ${backups.map(
            (b) => html`
              <div
                key=${b.path}
                class="flex items-center gap-3 px-3 py-2.5 bg-white/[0.02] hover:bg-white/[0.04]"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-xs text-slate-300 truncate">${b.name}</p>
                  <p class="text-[11px] text-slate-500">${Math.round((b.size || 0) / 1024)} KB</p>
                </div>
                <button
                  onClick=${() => restore(b)}
                  disabled=${busy}
                  title="Restore"
                  class="px-2 py-1 text-[10px] text-slate-400 hover:text-emerald-300 bg-white/5 rounded transition-colors"
                >
                  ↩ Restore
                </button>
              </div>
            `,
          )}
        </div>
      `}
      ${!isExtension &&
      html`
        <p class="text-xs text-slate-500 italic">
          GitHub backups are only available in the extension context.
        </p>
      `}
    </div>
  `;
}

// ── Behaviour bank data ────────────────────────────────────────────────────
// Export/import/clear for the AI behaviour bank. Lives here with the other
// data-management flows; the bank's stats and insights are the library's
// Behaviour Bank tab.

function BehaviorBankData() {
  const [entryCount, setEntryCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const fileInputRef = useRef(null);

  const countEntries = (bank) =>
    Object.keys(bank || {}).filter((k) => !k.startsWith("__")).length;

  const refresh = async () => {
    const bank = await Storage.getBehaviorBank().catch(() => ({}));
    setEntryCount(countEntries(bank));
  };

  useEffect(() => {
    refresh();
  }, []);

  const flash = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(""), 4000);
  };

  const handleExport = async () => {
    try {
      setBusy(true);
      const data = (await Storage.getBehaviorBank()) || {};
      await downloadJSON(data, "behavior-bank");
      flash("✓ Behaviour bank exported");
    } catch (e) {
      flash("Failed: " + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      const imported = JSON.parse(await file.text());
      if (typeof imported !== "object" || imported === null || Array.isArray(imported)) {
        throw new Error("Invalid behaviour bank format: must be a JSON object");
      }
      const shouldMerge = confirm(
        "Merge with existing behaviour bank data?\n\nOK = Merge (combine both)\nCancel = Replace (use imported data only)",
      );
      let finalData = imported;
      if (shouldMerge) {
        const existing = (await Storage.getBehaviorBank()) || {};
        finalData = { ...existing, ...imported };
      }
      await Storage.setBehaviorBank(finalData);
      await refresh();
      flash(`✓ Imported ${countEntries(imported)} entries`);
    } catch (e) {
      flash("Failed: " + (e?.message || String(e)));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleClear = async () => {
    if (!confirm("Clear all behaviour bank data? This cannot be undone.")) return;
    try {
      setBusy(true);
      await Storage.setBehaviorBank({});
      await refresh();
      flash("✓ Behaviour bank cleared");
    } catch (e) {
      flash("Failed: " + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  };

  return html`
    <div class="space-y-4">
      <p class="text-xs text-slate-500 leading-snug">
        The behaviour bank is what the AI knows about how you solve — per-problem timings, revisit
        counts, and its own written insights. Its stats live in the library's Behaviour Bank tab;
        this is where the data itself is exported, imported or wiped.
      </p>
      <p class="text-xs text-slate-400">
        <b class="text-slate-200">${entryCount}</b> problem entr${entryCount === 1 ? "y" : "ies"}
        stored on this device.
      </p>
      <div class="flex flex-wrap gap-3">
        <button
          onClick=${handleExport}
          disabled=${busy || entryCount === 0}
          class="px-4 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors disabled:opacity-50"
        >
          ${busy ? "Working…" : "Export as JSON"}
        </button>
        <button
          onClick=${() => fileInputRef.current?.click()}
          disabled=${busy}
          class="px-4 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-200 text-xs rounded-lg transition-colors disabled:opacity-50"
        >
          ${busy ? "Working…" : "Import from JSON"}
        </button>
        <button
          onClick=${handleClear}
          disabled=${busy || entryCount === 0}
          class="px-4 py-1.5 bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/30 text-rose-300 text-xs rounded-lg transition-colors disabled:opacity-50"
        >
          ${busy ? "Working…" : "Clear data"}
        </button>
      </div>
      ${msg &&
      html`<p class="text-xs ${msg.includes("Failed") ? "text-rose-400" : "text-emerald-400"}">
        ${msg}
      </p>`}
      <input
        ref=${fileInputRef}
        type="file"
        accept=".json"
        style="display: none"
        onChange=${handleImportFile}
      />
    </div>
  `;
}

// ── Main panel ─────────────────────────────────────────────────────────────

const BACKUP_TABS = [
  { id: "manual", label: "Manual", emoji: "📁" },
  { id: "scheduled", label: "Scheduled", emoji: "🔁" },
  { id: "rolling", label: "Rolling", emoji: "⚡" },
  { id: "github", label: "GitHub", emoji: "☁️" },
  { id: "bank", label: "Bank", emoji: "🧠" },
];

export function PanelBackups({ settings, onSettingsChange }) {
  const [activeTab, setActiveTab] = useState("manual");

  return html`
    <div class="space-y-5 w-full">
      <div>
        <h2 class="text-base font-semibold text-white mb-1">Backups & data</h2>
        <p class="text-xs text-slate-500 mb-1">
          Four layers of protection for your solve history — three on this device, one in your
          repository — plus the behaviour bank's own export and import.
        </p>
      </div>

      <${BackupStatus} settings=${settings} />

      <!-- Tab strip -->
      <div class="flex gap-1 border-b border-white/5">
        ${BACKUP_TABS.map(
          ({ id, label, emoji }) => html`
            <button
              key=${id}
              onClick=${() => setActiveTab(id)}
              class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors
              ${activeTab === id
                ? "border-cyan-500 text-cyan-200"
                : "border-transparent text-slate-500 hover:text-slate-300"}"
            >
              ${emoji} ${label}
            </button>
          `,
        )}
      </div>

      <!-- Panel content -->
      ${activeTab === "manual" && html`<${ManualBackups} settings=${settings} />`}
      ${activeTab === "scheduled" &&
      html`<${ScheduledBackups} settings=${settings} onSettingsChange=${onSettingsChange} />`}
      ${activeTab === "rolling" && html`<${RollingBackup} />`}
      ${activeTab === "github" &&
      html`<${GitHubBackups} settings=${settings} onSettingsChange=${onSettingsChange} />`}
      ${activeTab === "bank" && html`<${BehaviorBankData} />`}
    </div>
  `;
}
