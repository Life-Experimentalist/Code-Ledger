/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, render } from "../vendor/preact-bundle.js";
import { useState, useEffect, useCallback } from "../vendor/preact-bundle.js";
import { htm } from "../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../core/storage.js";

const STEPS = [
    {
        id: "installed",
        icon: "🧩",
        label: "Extension installed",
        desc: "CodeLedger is running in your browser.",
    },
    {
        id: "github",
        icon: "🔗",
        label: "GitHub connected",
        desc: "Authorized with GitHub so commits can be made on your behalf.",
    },
    {
        id: "repo",
        icon: "📁",
        label: "Repository linked",
        desc: "A GitHub repo is configured to receive your solutions.",
    },
    {
        id: "solve",
        icon: "✅",
        label: "First problem solved",
        desc: "Solve any accepted problem on LeetCode, GeeksForGeeks, or Codeforces.",
    },
    {
        id: "commit",
        icon: "💾",
        label: "First commit to GitHub",
        desc: "Your solution was automatically committed to your repository.",
    },
];

const PLATFORMS = [
    {
        name: "LeetCode",
        url: "https://leetcode.com/",
        color: "#FFA116",
        favicon:
            "https://assets.leetcode.com/static_assets/public/icons/favicon.ico",
    },
    {
        name: "GeeksForGeeks",
        url: "https://practice.geeksforgeeks.org/",
        color: "#2F8D46",
        favicon: "https://www.geeksforgeeks.org/favicon.ico",
    },
    {
        name: "Codeforces",
        url: "https://codeforces.com/problemset/",
        color: "#1F8ACB",
        favicon: "https://codeforces.com/favicon.ico",
    },
];

// ── SW helper ─────────────────────────────────────────────────────────────────

function sw(type, extra = {}) {
    return new Promise((res, rej) => {
        if (!chrome?.runtime?.id) {
            rej(new Error("No extension runtime"));
            return;
        }
        chrome.runtime.sendMessage({ type, ...extra }, (r) => {
            if (chrome.runtime.lastError) {
                rej(new Error(chrome.runtime.lastError.message));
                return;
            }
            r?.ok ? res(r) : rej(new Error(r?.error || type + " failed"));
        });
    });
}

// ── Diagnostics panel ─────────────────────────────────────────────────────────

const INFRA_LABELS = {
    "index.json": "Problem index",
    "README.md": "README",
    "index.html": "GitHub Pages",
    ".codeledger/config.json": "Config file",
};

function DiagnosticsPanel() {
    const [checks, setChecks] = useState(null);
    const [loading, setLoading] = useState(false);
    const [repairing, setRepairing] = useState(null);
    const [msg, setMsg] = useState("");
    const [migrationMode, setMigrationMode] = useState("bulk");
    const [migrating, setMigrating] = useState(false);

    const flash = (text, isErr = false) => {
        setMsg({ text, isErr });
        setTimeout(() => setMsg(""), 5000);
    };

    const runDiagnostics = async () => {
        setLoading(true);
        setChecks(null);
        try {
            const r = await sw("REPO_DIAGNOSTICS");
            setChecks(r.checks);
        } catch (e) {
            flash(e.message, true);
        } finally {
            setLoading(false);
        }
    };

    const runRepair = async (action, label) => {
        if (
            !confirm(
                `Run "${label}"? This will commit changes to your GitHub repo.`
            )
        )
            return;
        setRepairing(action);
        try {
            await sw("REPO_REPAIR", { action });
            flash(`✓ ${label} complete.`);
            await runDiagnostics();
        } catch (e) {
            flash(`${label} failed: ${e.message}`, true);
        } finally {
            setRepairing(null);
        }
    };

    const runMigration = async () => {
        setMigrating(true);
        try {
            const r = await sw("CODELEDGER_RUN_MIGRATIONS", {
                mode: migrationMode,
            });
            const n = r.result?.committed ?? 0;
            flash(`✓ Migration complete — ${n} problem(s) committed.`);
            await runDiagnostics();
        } catch (e) {
            flash(`Migration failed: ${e.message}`, true);
        } finally {
            setMigrating(false);
        }
    };

    const StatusBadge = ({ status }) => {
        const map = {
            ok: ["✓", "text-emerald-400 bg-emerald-500/10"],
            missing: ["✗ missing", "text-rose-400 bg-rose-500/10"],
            error: ["? error", "text-amber-400 bg-amber-500/10"],
        };
        const [label, cls] = map[status] || ["?", "text-slate-400 bg-white/5"];
        return html`<span class="px-2 py-0.5 rounded text-xs font-mono ${cls}"
            >${label}</span
        >`;
    };

    const overallHealthy =
        checks &&
        checks.layoutUpToDate &&
        checks.infraOk &&
        !checks.hasOldLayout &&
        checks.uncommittedCount <= 0;

    return html`
        <div class="flex flex-col gap-5">
            <div class="flex items-center justify-between">
                <p class="text-sm text-slate-400">
                    Scan your GitHub repo for issues and apply fixes.
                </p>
                <button
                    onClick=${runDiagnostics}
                    disabled=${loading}
                    class="px-4 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors disabled:opacity-50"
                >
                    ${loading ? "Scanning…" : "Run Scan"}
                </button>
            </div>

            ${msg &&
            html`<p
                class="text-xs px-3 py-2 rounded-lg border ${msg.isErr
                    ? "border-rose-500/30 bg-rose-500/5 text-rose-300"
                    : "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"}"
            >
                ${msg.text}
            </p>`}
            ${!checks &&
            !loading &&
            html`
                <div
                    class="p-6 bg-white/3 border border-white/8 rounded-xl text-center"
                >
                    <p class="text-sm text-slate-500">
                        Click
                        <strong class="text-slate-300">Run Scan</strong> to
                        check your repository health.
                    </p>
                </div>
            `}
            ${loading &&
            html`
                <div
                    class="p-6 bg-white/3 border border-white/8 rounded-xl text-center"
                >
                    <p class="text-sm text-slate-500">Scanning repository…</p>
                </div>
            `}
            ${checks &&
            html`
                <!-- Overall health banner -->
                <div
                    class="p-4 rounded-xl border ${overallHealthy
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-amber-500/30 bg-amber-500/5"}"
                >
                    <div class="flex items-center gap-2">
                        <span class="text-lg"
                            >${overallHealthy ? "✅" : "⚠️"}</span
                        >
                        <div>
                            <p
                                class="text-sm font-medium ${overallHealthy
                                    ? "text-emerald-300"
                                    : "text-amber-300"}"
                            >
                                ${overallHealthy
                                    ? "Repository is healthy"
                                    : "Issues found — see below"}
                            </p>
                            <p class="text-xs text-slate-500">
                                ${checks.owner}/${checks.repo}
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Stats row -->
                <div class="grid grid-cols-3 gap-3">
                    <div
                        class="p-3 bg-white/5 border border-white/10 rounded-xl"
                    >
                        <p class="text-xs text-slate-500 mb-1">
                            Local problems
                        </p>
                        <p class="text-lg font-semibold text-white">
                            ${checks.localProblemCount}
                        </p>
                    </div>
                    <div
                        class="p-3 bg-white/5 border border-white/10 rounded-xl"
                    >
                        <p class="text-xs text-slate-500 mb-1">
                            In GitHub repo
                        </p>
                        <p
                            class="text-lg font-semibold ${checks.committedProblemCount ===
                            null
                                ? "text-slate-500"
                                : "text-white"}"
                        >
                            ${checks.committedProblemCount ?? "—"}
                        </p>
                    </div>
                    <div
                        class="p-3 bg-white/5 border border-white/10 rounded-xl"
                    >
                        <p class="text-xs text-slate-500 mb-1">Not committed</p>
                        <p
                            class="text-lg font-semibold ${(checks.uncommittedCount ||
                                0) > 0
                                ? "text-amber-400"
                                : "text-emerald-400"}"
                        >
                            ${Math.max(0, checks.uncommittedCount ?? 0)}
                        </p>
                    </div>
                </div>

                <!-- Layout version -->
                <div class="p-4 bg-white/3 border border-white/8 rounded-xl">
                    <div class="flex items-center justify-between mb-3">
                        <h4
                            class="text-xs font-medium text-slate-300 uppercase tracking-widest"
                        >
                            Repo Layout
                        </h4>
                        ${!checks.layoutUpToDate &&
                        html`
                            <button
                                onClick=${() =>
                                    runRepair(
                                        "migrate-layout",
                                        "Migrate layout"
                                    )}
                                disabled=${!!repairing}
                                class="px-3 py-1 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/30 text-amber-200 text-xs rounded-lg transition-colors disabled:opacity-50"
                            >
                                ${repairing === "migrate-layout"
                                    ? "Migrating…"
                                    : "Migrate to v${checks.currentLayoutVersion}"}
                            </button>
                        `}
                    </div>
                    <div class="grid grid-cols-2 gap-3 text-xs">
                        <div>
                            <span class="text-slate-500">Current</span>
                            <span class="ml-2 text-white"
                                >v${checks.currentLayoutVersion}</span
                            >
                        </div>
                        <div>
                            <span class="text-slate-500">Repo</span>
                            <span
                                class="ml-2 ${checks.layoutUpToDate
                                    ? "text-emerald-400"
                                    : "text-amber-400"}"
                            >
                                ${checks.repoLayoutVersion !== null
                                    ? `v${checks.repoLayoutVersion}`
                                    : "unknown"}
                                ${checks.layoutUpToDate ? " ✓" : " (outdated)"}
                            </span>
                        </div>
                        ${checks.hasOldLayout &&
                        html`
                            <div class="col-span-2 mt-1 text-amber-300">
                                Old-layout directories detected
                                (${[
                                    checks.hasOldTopicsDir && "topics/",
                                    checks.hasOldProblemsDir && "problems/",
                                ]
                                    .filter(Boolean)
                                    .join(", ")}).
                                Run migration to restructure.
                            </div>
                        `}
                    </div>
                </div>

                <!-- Infra files -->
                <div class="p-4 bg-white/3 border border-white/8 rounded-xl">
                    <div class="flex items-center justify-between mb-3">
                        <h4
                            class="text-xs font-medium text-slate-300 uppercase tracking-widest"
                        >
                            Infrastructure Files
                        </h4>
                        ${!checks.infraOk &&
                        html`
                            <button
                                onClick=${() =>
                                    runRepair("rebuild-infra", "Rebuild infra")}
                                disabled=${!!repairing}
                                class="px-3 py-1 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors disabled:opacity-50"
                            >
                                ${repairing === "rebuild-infra"
                                    ? "Rebuilding…"
                                    : "Rebuild"}
                            </button>
                        `}
                    </div>
                    <div class="flex flex-col gap-2">
                        ${Object.entries(checks.infraStatus || {}).map(
                            ([path, status]) => html`
                                <div
                                    key=${path}
                                    class="flex items-center justify-between"
                                >
                                    <span
                                        class="text-xs text-slate-400 font-mono"
                                        >${INFRA_LABELS[path] || path}</span
                                    >
                                    <${StatusBadge} status=${status} />
                                </div>
                            `
                        )}
                    </div>
                </div>

                <!-- Migration section -->
                ${(checks.uncommittedCount || 0) > 0 &&
                html`
                    <div
                        class="p-4 bg-white/3 border border-white/8 rounded-xl"
                    >
                        <h4
                            class="text-xs font-medium text-slate-300 uppercase tracking-widest mb-3"
                        >
                            Push Missing Problems
                        </h4>
                        <p class="text-xs text-slate-500 mb-3">
                            ${checks.uncommittedCount} local problem(s) not yet
                            in GitHub. Choose how to commit them:
                        </p>
                        <div class="flex flex-col gap-2 mb-4">
                            <label
                                class="flex items-center gap-3 cursor-pointer"
                            >
                                <input
                                    type="radio"
                                    name="migMode"
                                    value="bulk"
                                    checked=${migrationMode === "bulk"}
                                    onChange=${() => setMigrationMode("bulk")}
                                />
                                <div>
                                    <p
                                        class="text-xs text-slate-200 font-medium"
                                    >
                                        Bulk commit (recommended)
                                    </p>
                                    <p class="text-xs text-slate-500">
                                        Single atomic commit for all missing
                                        problems
                                    </p>
                                </div>
                            </label>
                            <label
                                class="flex items-center gap-3 cursor-pointer"
                            >
                                <input
                                    type="radio"
                                    name="migMode"
                                    value="individual"
                                    checked=${migrationMode === "individual"}
                                    onChange=${() =>
                                        setMigrationMode("individual")}
                                />
                                <div>
                                    <p
                                        class="text-xs text-slate-200 font-medium"
                                    >
                                        Individual commits
                                    </p>
                                    <p class="text-xs text-slate-500">
                                        One commit per problem with correct
                                        timestamps
                                    </p>
                                </div>
                            </label>
                        </div>
                        <button
                            onClick=${runMigration}
                            disabled=${migrating}
                            class="px-5 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-sm rounded-lg transition-colors disabled:opacity-50"
                        >
                            ${migrating
                                ? "Pushing…"
                                : `Push ${checks.uncommittedCount} problem(s) →`}
                        </button>
                    </div>
                `}

                <!-- Advanced repair -->
                <details class="group">
                    <summary
                        class="text-xs text-slate-500 cursor-pointer hover:text-slate-300 transition-colors list-none flex items-center gap-1"
                    >
                        <span
                            class="group-open:rotate-90 transition-transform inline-block"
                            >▶</span
                        >
                        Advanced repairs
                    </summary>
                    <div class="mt-3 flex flex-wrap gap-2">
                        <button
                            onClick=${() =>
                                runRepair(
                                    "rebuild-infra",
                                    "Rebuild infra files"
                                )}
                            disabled=${!!repairing}
                            class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors disabled:opacity-50"
                        >
                            Rebuild infra files
                        </button>
                        <button
                            onClick=${() =>
                                runRepair(
                                    "migrate-layout",
                                    "Migrate repo layout"
                                )}
                            disabled=${!!repairing}
                            class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors disabled:opacity-50"
                        >
                            Re-run layout migration
                        </button>
                    </div>
                </details>
            `}
        </div>
    `;
}

// ── Main app ──────────────────────────────────────────────────────────────────

const TABS = [
    { id: "setup", label: "Setup" },
    { id: "diagnostics", label: "Diagnostics & Migration" },
];

function WelcomeApp() {
    const [settings, setSettings] = useState({});
    const [checks, setChecks] = useState({});
    const [gitUser, setGitUser] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [activeTab, setActiveTab] = useState("setup");

    const load = useCallback(async () => {
        const [s, problems] = await Promise.all([
            Storage.getSettings().catch(() => ({})),
            Storage.getAllProblems().catch(() => []),
        ]);
        setSettings(s || {});

        const newChecks = { installed: true };

        const oauthToken = await Storage.getAuthToken("github").catch(
            () => null
        );
        const token = oauthToken || s?.github_token;
        newChecks.github = !!token;
        newChecks.repo = !!(s?.github_repo || s?.gitRepo);
        newChecks.solve = (problems || []).length > 0;

        try {
            const committed = await Storage.getCommittedSlugLangs();
            newChecks.commit = Object.keys(committed || {}).length > 0;
        } catch (_) {
            newChecks.commit = newChecks.solve;
        }

        setChecks(newChecks);

        if (token) {
            fetch("https://api.github.com/user", {
                headers: { Authorization: `Bearer ${token}` },
            })
                .then((r) => (r.ok ? r.json() : null))
                .then((u) => {
                    if (u?.login) setGitUser(u.login);
                })
                .catch(() => {});
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        load().catch(() => {});
        const onStorage = () => {
            if (mounted) load().catch(() => {});
        };
        window.addEventListener("storage", onStorage);
        return () => {
            mounted = false;
            window.removeEventListener("storage", onStorage);
        };
    }, [load, refreshKey]);

    const doneCount = STEPS.filter((s) => checks[s.id]).length;
    const allDone = doneCount === STEPS.length;

    const openLibrary = () => {
        if (chrome?.runtime?.id)
            chrome.tabs.create({
                url: chrome.runtime.getURL("library/library.html"),
            });
    };
    const openSettings = () => {
        if (chrome?.runtime?.id)
            chrome.tabs.create({
                url:
                    chrome.runtime.getURL("library/library.html") +
                    "?tab=settings&settingsTab=git",
            });
    };

    const repoUrl = (() => {
        const repo = settings.github_repo || settings.gitRepo;
        if (!repo) return null;
        const owner =
            settings.github_owner?.trim() ||
            settings.github_username ||
            gitUser;
        return owner ? `https://github.com/${owner}/${repo}` : null;
    })();

    const openSetupWizard = () => {
        if (chrome?.runtime?.id)
            chrome.tabs.create({
                url:
                    chrome.runtime.getURL("library/library.html") +
                    "?tab=settings&settingsTab=git&openSetup=true",
            });
    };

    const stepAction = (stepId) => {
        if (stepId === "github") return { label: "Connect GitHub →", onClick: openSettings };
        if (stepId === "repo") return { label: "Set up repository →", onClick: openSetupWizard };
        if (stepId === "solve")
            return {
                label: "Start solving →",
                onClick: () => window.open("https://leetcode.com/", "_blank"),
            };
        return null;
    };

    return html`
        <div
            class="min-h-screen bg-[#050508] flex flex-col items-center px-4 py-16"
        >
            <!-- Hero -->
            <div class="flex flex-col items-center mb-10 gap-4">
                <img
                    src="../assets/images/icon-dark-bg.png"
                    class="w-20 h-20 object-contain drop-shadow-[0_0_30px_rgba(6,182,212,0.5)]"
                    alt="CodeLedger"
                />
                <div class="text-center">
                    <h1 class="text-4xl font-bold tracking-tight text-white">
                        Welcome to <span class="text-cyan-400">CodeLedger</span>
                    </h1>
                    <p class="mt-2 text-slate-400 text-base">
                        Your DSA journey, automatically committed.
                    </p>
                    ${gitUser
                        ? html`
                              <div
                                  class="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/5"
                              >
                                  <div
                                      class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                                  ></div>
                                  <span
                                      class="text-xs text-emerald-400 font-mono"
                                      >Connected as ${gitUser}</span
                                  >
                              </div>
                          `
                        : ""}
                </div>
            </div>

            <!-- Tab switcher -->
            <div class="w-full max-w-lg mb-8">
                <div
                    class="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl"
                >
                    ${TABS.map(
                        (t) => html`
                            <button
                                key=${t.id}
                                onClick=${() => setActiveTab(t.id)}
                                class="flex-1 py-2 rounded-lg text-sm transition-colors ${activeTab ===
                                t.id
                                    ? "bg-cyan-600/30 border border-cyan-500/30 text-cyan-300 font-medium"
                                    : "text-slate-400 hover:text-slate-200"}"
                            >
                                ${t.label}
                            </button>
                        `
                    )}
                </div>
            </div>

            <!-- Setup tab -->
            ${activeTab === "setup" &&
            html`
                <div class="w-full max-w-lg">
                    <!-- Checklist header -->
                    <div class="flex items-center justify-between mb-3">
                        <h2
                            class="text-sm font-semibold text-slate-400 uppercase tracking-widest"
                        >
                            Setup checklist
                        </h2>
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-cyan-400 font-mono"
                                >${doneCount} / ${STEPS.length}</span
                            >
                            <button
                                onClick=${() => setRefreshKey((k) => k + 1)}
                                title="Refresh status"
                                class="text-slate-600 hover:text-slate-300 transition-colors"
                            >
                                ↺
                            </button>
                        </div>
                    </div>

                    <!-- Progress bar -->
                    <div
                        class="w-full h-1.5 bg-white/5 rounded-full mb-6 overflow-hidden"
                    >
                        <div
                            class="h-full rounded-full transition-all duration-700"
                            style=${{
                                width: `${(doneCount / STEPS.length) * 100}%`,
                                background: allDone ? "#10b981" : "#06b6d4",
                            }}
                        ></div>
                    </div>

                    <!-- Steps -->
                    <div class="flex flex-col gap-3 mb-10">
                        ${STEPS.map((step) => {
                            const done = !!checks[step.id];
                            const action = !done ? stepAction(step.id) : null;
                            return html`
                                <div
                                    class="flex items-start gap-4 p-4 rounded-xl border transition-colors ${done
                                        ? "border-emerald-500/20 bg-emerald-500/5"
                                        : "border-white/5 bg-white/[0.02]"}"
                                >
                                    <div
                                        class="mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${done
                                            ? "bg-emerald-500/20 text-emerald-400"
                                            : "bg-white/5 text-slate-600"}"
                                    >
                                        ${done
                                            ? html`<svg
                                                  width="12"
                                                  height="12"
                                                  viewBox="0 0 12 12"
                                                  fill="none"
                                              >
                                                  <path
                                                      d="M1 6l3.5 3.5L11 2.5"
                                                      stroke="currentColor"
                                                      stroke-width="1.5"
                                                      stroke-linecap="round"
                                                      stroke-linejoin="round"
                                                  />
                                              </svg>`
                                            : html`<span
                                                  class="w-2 h-2 rounded-full bg-current block"
                                              ></span>`}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2">
                                            <span class="text-sm"
                                                >${step.icon}</span
                                            >
                                            <span
                                                class="text-sm font-medium ${done
                                                    ? "text-white"
                                                    : "text-slate-400"}"
                                                >${step.label}</span
                                            >
                                        </div>
                                        <p
                                            class="text-[11px] text-slate-600 mt-0.5"
                                        >
                                            ${step.desc}
                                        </p>
                                    </div>
                                    ${action
                                        ? html`
                                              <button
                                                  onClick=${action.onClick}
                                                  class="shrink-0 text-[10px] text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/10 px-2 py-1 rounded transition-colors"
                                              >
                                                  ${action.label}
                                              </button>
                                          `
                                        : ""}
                                </div>
                            `;
                        })}
                    </div>

                    <!-- All done -->
                    ${allDone &&
                    html`
                        <div
                            class="mb-8 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-center"
                        >
                            <div class="text-2xl mb-1">🎉</div>
                            <p class="text-sm text-emerald-400 font-semibold">
                                You're all set!
                            </p>
                            <p class="text-xs text-slate-500 mt-1">
                                Start solving — every accepted submission is
                                automatically committed to GitHub.
                            </p>
                        </div>
                    `}

                    <!-- Action buttons -->
                    <div class="flex flex-wrap gap-3 justify-center mb-12">
                        <button
                            onClick=${openLibrary}
                            class="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-sm transition-colors"
                        >
                            Open Library →
                        </button>
                        ${repoUrl
                            ? html`
                                  <a
                                      href=${repoUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      class="px-5 py-2.5 rounded-xl border border-white/10 hover:border-cyan-500/30 hover:bg-white/5 text-slate-300 text-sm transition-colors"
                                      >View Repo ↗</a
                                  >
                              `
                            : ""}
                        ${!checks.github || !checks.repo
                            ? html`
                                  <button
                                      onClick=${openSettings}
                                      class="px-5 py-2.5 rounded-xl border border-cyan-500/30 hover:bg-cyan-500/10 text-cyan-400 text-sm transition-colors"
                                  >
                                      Finish Setup →
                                  </button>
                              `
                            : ""}
                    </div>

                    <!-- Start solving -->
                    <h2
                        class="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4"
                    >
                        Start solving
                    </h2>
                    <div class="grid grid-cols-3 gap-3">
                        ${PLATFORMS.map(
                            (p) => html`
                                <a
                                    href=${p.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    class="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/5 hover:border-white/10 bg-white/[0.02] hover:bg-white/5 transition-colors group"
                                >
                                    <img
                                        src=${p.favicon}
                                        alt=""
                                        class="w-6 h-6 object-contain"
                                        onError=${(e) => {
                                            e.target.style.display = "none";
                                        }}
                                    />
                                    <span
                                        class="text-xs text-slate-400 group-hover:text-white transition-colors"
                                        >${p.name}</span
                                    >
                                </a>
                            `
                        )}
                    </div>
                </div>
            `}

            <!-- Diagnostics tab -->
            ${activeTab === "diagnostics" &&
            html`
                <div class="w-full max-w-lg">
                    <${DiagnosticsPanel} />
                </div>
            `}

            <!-- Footer -->
            <p class="mt-16 text-[11px] text-slate-700 text-center max-w-sm">
                This page can be reopened from the extension popup at any time.
                Your data is stored locally and synced to your own GitHub —
                never shared with third parties.
            </p>
        </div>
    `;
}

render(html`<${WelcomeApp} />`, document.getElementById("root"));
