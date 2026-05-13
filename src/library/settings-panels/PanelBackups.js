/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";

// ── helpers ────────────────────────────────────────────────────────────────

async function exportData() {
    const [problems, settings] = await Promise.all([
        Storage.getAllProblems(),
        Storage.getSettings(),
    ]);
    return { problems: problems || [], settings: settings || {} };
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
    if (!data.problems || !Array.isArray(data.problems)) {
        throw new Error("Invalid backup: missing problems array");
    }
    for (const p of data.problems) await Storage.saveProblem(p);
    return data.problems.length;
}

function fmtTime(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleString();
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
                nameInput.trim() || `Backup ${backups.length + 1}`
            );
            if (settings?.schedBackupOnExport) {
                Storage.addScheduledBackup(data, "on-export").catch(() => {});
            }
            setBackups(await Storage.getManualBackups());
            setNameInput("");
            flash(
                `Saved "${entry.name}" — ${(data.problems || []).length} problems`
            );
        } catch (e) {
            flash("Save failed: " + e.message, true);
        } finally {
            setBusy(false);
        }
    };

    const restore = async (b) => {
        if (
            !confirm(
                `Restore "${b.name}" (${fmtTime(b.ts)})?\n\nThis merges problems — existing problems are not deleted.`
            )
        )
            return;
        setBusy(true);
        try {
            for (const p of b.data?.problems || [])
                await Storage.saveProblem(p);
            flash(`Restored ${(b.data?.problems || []).length} problems`);
        } catch (e) {
            flash("Restore failed: " + e.message, true);
        } finally {
            setBusy(false);
        }
    };

    const download = async (b) => {
        try {
            await downloadJSON(
                b.data,
                b.name.replace(/\s+/g, "-").toLowerCase() || "manual"
            );
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
                Up to 10 manual snapshots. Each is a full export of problems +
                settings.
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
            html`<p
                class="text-xs ${msg.isErr
                    ? "text-rose-400"
                    : "text-emerald-400"}"
            >
                ${msg.text}
            </p>`}

            <!-- Backup list -->
            ${backups.length === 0
                ? html`<p class="text-xs text-slate-600 italic">
                      No manual backups yet.
                  </p>`
                : html`
                      <div
                          class="divide-y divide-white/5 rounded-xl border border-white/8 overflow-hidden"
                      >
                          ${backups.map(
                              (b) => html`
                                  <div
                                      key=${b.id}
                                      class="flex items-center gap-3 px-3 py-2.5 bg-white/[0.02] hover:bg-white/[0.04]"
                                  >
                                      <div class="flex-1 min-w-0">
                                          <p
                                              class="text-xs text-slate-200 truncate"
                                          >
                                              ${b.name || "Backup"}
                                          </p>
                                          <p class="text-[11px] text-slate-500">
                                              ${fmtTime(b.ts)} ·
                                              ${(b.data?.problems || []).length}
                                              problems · ${fmtSize(b.data)}
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
                              `
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
            flash(
                `Scheduled snapshot saved — ${(data.problems || []).length} problems`
            );
        } catch (e) {
            flash("Failed: " + e.message, true);
        } finally {
            setBusy(false);
        }
    };

    const restore = async (b) => {
        if (
            !confirm(
                `Restore scheduled snapshot from ${fmtTime(b.ts)}?\n\nThis merges problems — existing problems are not deleted.`
            )
        )
            return;
        setBusy(true);
        try {
            for (const p of b.data?.problems || [])
                await Storage.saveProblem(p);
            flash(`Restored ${(b.data?.problems || []).length} problems`);
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
                Up to 5 automatic snapshots, rotated FIFO. Triggered by solve
                events since the extension can't use fixed timers.
            </p>

            <!-- Trigger settings -->
            <div class="space-y-2">
                ${TRIGGERS.map(({ key, label, desc }) => {
                    const on = settings?.[key] !== false;
                    return html`
                        <label
                            key=${key}
                            class="flex items-start gap-3 cursor-pointer"
                        >
                            <button
                                onClick=${() => onSettingsChange(key, !on)}
                                class="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
                  ${on
                                    ? "bg-cyan-500/30 border-cyan-500/40"
                                    : "bg-white/5 border-white/10"}"
                            >
                                <span
                                    class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
                  ${on ? "translate-x-4" : "translate-x-0.5"}"
                                ></span>
                            </button>
                            <div>
                                <p class="text-sm text-slate-300">${label}</p>
                                <p class="text-[11px] text-slate-500">
                                    ${desc}
                                </p>
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
            html`<p
                class="text-xs ${msg.isErr
                    ? "text-rose-400"
                    : "text-emerald-400"}"
            >
                ${msg.text}
            </p>`}
            ${backups.length === 0
                ? html`<p class="text-xs text-slate-600 italic">
                      No scheduled snapshots yet.
                  </p>`
                : html`
                      <div
                          class="divide-y divide-white/5 rounded-xl border border-white/8 overflow-hidden"
                      >
                          ${backups.map(
                              (b) => html`
                                  <div
                                      key=${b.id}
                                      class="flex items-center gap-3 px-3 py-2.5 bg-white/[0.02]"
                                  >
                                      <div class="flex-1 min-w-0">
                                          <p class="text-[11px] text-slate-500">
                                              ${fmtTime(b.ts)} · via
                                              ${b.trigger} ·
                                              ${(b.data?.problems || []).length}
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
                              `
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
            flash(
                `Rolling backup updated — ${(data.problems || []).length} problems`
            );
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
                `Restore rolling backup from ${fmtTime(backup.ts)}?\n\nThis merges problems — existing problems are not deleted.`
            )
        )
            return;
        setBusy(true);
        try {
            for (const p of backup.data?.problems || [])
                await Storage.saveProblem(p);
            flash(`Restored ${(backup.data?.problems || []).length} problems`);
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
                A single always-current snapshot updated manually or
                automatically whenever you solve a problem. Useful as a
                last-resort recovery point.
            </p>

            ${backup
                ? html`
                      <div
                          class="flex items-center gap-3 p-3 rounded-xl border border-white/8 bg-white/[0.02]"
                      >
                          <div class="flex-1">
                              <p class="text-xs text-slate-300">
                                  Last updated: ${fmtTime(backup.ts)}
                              </p>
                              <p class="text-[11px] text-slate-500">
                                  ${(backup.data?.problems || []).length}
                                  problems · ${fmtSize(backup.data)}
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
            html`<p
                class="text-xs ${msg.isErr
                    ? "text-rose-400"
                    : "text-emerald-400"}"
            >
                ${msg.text}
            </p>`}
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
                r?.ok ? res(r) : rej(new Error(r?.error || type + " failed"))
            )
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
            await sw("COMMIT_GITHUB_BACKUP_NOW");
            flash("Backup committed to GitHub.");
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
                `Restore backup "${b.name}" from GitHub?\n\nThis merges problems — existing problems are not deleted.`
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
                <code class="text-cyan-400"
                    >backups/YYYY-MM-DD-HH-mm-ss.json</code
                >
                in your GitHub repo. Keeps only the N most recent — older ones
                are pruned automatically.
            </p>

            <!-- Toggle -->
            ${GITHUB_SETTINGS.map(({ key, label, desc }) => {
                const on = settings?.[key] !== false;
                return html`
                    <label
                        key=${key}
                        class="flex items-start gap-3 cursor-pointer"
                    >
                        <div class="relative mt-0.5 shrink-0">
                            <input
                                type="checkbox"
                                checked=${on}
                                onChange=${() => onSettingsChange?.(key, !on)}
                                class="sr-only"
                            />
                            <div
                                class="w-8 h-4 rounded-full transition-colors ${on
                                    ? "bg-cyan-600"
                                    : "bg-white/10"}"
                            ></div>
                            <div
                                class="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${on
                                    ? "translate-x-4"
                                    : ""}"
                            ></div>
                        </div>
                        <div>
                            <p class="text-xs text-slate-200">${label}</p>
                            <p class="text-[11px] text-slate-500 mt-0.5">
                                ${desc}
                            </p>
                        </div>
                    </label>
                `;
            })}

            <!-- Interval + keep -->
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="text-[11px] text-slate-400 block mb-1"
                        >Every N commits</label
                    >
                    <input
                        type="number"
                        min="1"
                        max="100"
                        value=${settings?.githubBackupInterval || "10"}
                        onInput=${(e) =>
                            onSettingsChange?.(
                                "githubBackupInterval",
                                e.target.value
                            )}
                        class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500/50"
                    />
                </div>
                <div>
                    <label class="text-[11px] text-slate-400 block mb-1"
                        >Keep last N backups</label
                    >
                    <input
                        type="number"
                        min="1"
                        max="50"
                        value=${settings?.githubBackupKeep || "10"}
                        onInput=${(e) =>
                            onSettingsChange?.(
                                "githubBackupKeep",
                                e.target.value
                            )}
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
            html`<p
                class="text-xs ${msg.isErr
                    ? "text-rose-400"
                    : "text-emerald-400"}"
            >
                ${msg.text}
            </p>`}

            <!-- Backup list -->
            ${backups.length > 0 &&
            html`
                <div
                    class="divide-y divide-white/5 rounded-xl border border-white/8 overflow-hidden"
                >
                    ${backups.map(
                        (b) => html`
                            <div
                                key=${b.path}
                                class="flex items-center gap-3 px-3 py-2.5 bg-white/[0.02] hover:bg-white/[0.04]"
                            >
                                <div class="flex-1 min-w-0">
                                    <p class="text-xs text-slate-300 truncate">
                                        ${b.name}
                                    </p>
                                    <p class="text-[11px] text-slate-500">
                                        ${Math.round((b.size || 0) / 1024)} KB
                                    </p>
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
                        `
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

// ── Main panel ─────────────────────────────────────────────────────────────

const BACKUP_TABS = [
    { id: "manual", label: "Manual", emoji: "📁" },
    { id: "scheduled", label: "Scheduled", emoji: "🔁" },
    { id: "rolling", label: "Rolling", emoji: "⚡" },
    { id: "github", label: "GitHub", emoji: "☁️" },
];

export function PanelBackups({ settings, onSettingsChange }) {
    const [activeTab, setActiveTab] = useState("manual");

    return html`
        <div class="space-y-5 w-full">
            <div>
                <h2 class="text-base font-semibold text-white mb-1">Backups</h2>
                <p class="text-xs text-slate-500 mb-1">
                    Three layers of protection for your solve history.
                </p>
            </div>

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
                    `
                )}
            </div>

            <!-- Panel content -->
            ${activeTab === "manual" &&
            html`<${ManualBackups} settings=${settings} />`}
            ${activeTab === "scheduled" &&
            html`<${ScheduledBackups}
                settings=${settings}
                onSettingsChange=${onSettingsChange}
            />`}
            ${activeTab === "rolling" && html`<${RollingBackup} />`}
            ${activeTab === "github" &&
            html`<${GitHubBackups}
                settings=${settings}
                onSettingsChange=${onSettingsChange}
            />`}
        </div>
    `;
}
