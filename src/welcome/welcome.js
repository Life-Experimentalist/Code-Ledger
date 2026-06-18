/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, render } from "../vendor/preact-bundle.js";
import { useState, useEffect, useCallback } from "../vendor/preact-bundle.js";
import { htm } from "../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../core/storage.js";
import { createDebugger } from "../lib/debug.js";
import { CONSTANTS } from "../core/constants.js";

const dbg = createDebugger("WelcomePage");

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  {
    id: "installed",
    icon: "🧩",
    label: "Extension installed",
    desc: "CodeLedger is running in your browser.",
    required: true,
    skippable: false,
  },
  {
    id: "github",
    icon: "🔗",
    label: "Connect GitHub",
    desc: "Authorize with GitHub so your solutions can be committed automatically.",
    required: true,
    skippable: false,
  },
  {
    id: "repo",
    icon: "📁",
    label: "Link a repository",
    desc: "Choose or create a GitHub repo to store all your solutions.",
    required: true,
    skippable: false,
  },
  {
    id: "ai",
    icon: "🤖",
    label: "Configure AI review",
    desc: "Add an AI provider (Gemini recommended — free API keys available) for instant code reviews.",
    required: false,
    skippable: true,
  },
  {
    id: "import",
    icon: "📥",
    label: "Import past solutions",
    desc: "Bring in all your existing LeetCode accepted submissions.",
    required: false,
    skippable: true,
  },
  {
    id: "solve",
    icon: "✅",
    label: "Solve a problem",
    desc: "Submit any accepted solution on LeetCode to see the full auto-commit flow.",
    required: false,
    skippable: true,
  },
];

// ── Helper: open a tab ────────────────────────────────────────────────────────
function openTab(url) {
  if (chrome?.runtime?.id) chrome.tabs.create({ url });
  else window.open(url, "_blank");
}

function openExtTab(path) {
  openTab(chrome.runtime.getURL(path));
}

// ── Main app ──────────────────────────────────────────────────────────────────

function WelcomeApp() {
  const [settings, setSettings] = useState({});
  const [checks, setChecks] = useState({ installed: true });
  const [gitUser, setGitUser] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [skipped, setSkipped] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("cl_welcome_skipped") || "{}");
    } catch {
      return {};
    }
  });

  const skip = (id) => {
    const next = { ...skipped, [id]: true };
    setSkipped(next);
    try {
      localStorage.setItem("cl_welcome_skipped", JSON.stringify(next));
    } catch {}
  };

  const load = useCallback(async () => {
    const [s, problems] = await Promise.all([
      Storage.getSettings().catch(() => ({})),
      Storage.getAllProblems().catch(() => []),
    ]);
    setSettings(s || {});

    const newChecks = { installed: true };

    const token = await Storage.getAuthToken("github").catch(() => null);
    newChecks.github = !!token;
    newChecks.repo = !!(s?.github_repo || s?.gitRepo);

    // AI: any AI provider key is configured
    const aiKeys = await Storage.getAIKeys().catch(() => null);
    const hasAI =
      aiKeys &&
      Object.values(aiKeys).some((v) =>
        Array.isArray(v) ? v.some((k) => !!k) : !!v,
      );
    newChecks.ai = !!hasAI || !!skipped.ai;

    newChecks.import = (problems || []).length > 0 || !!skipped.import;
    newChecks.solve = (problems || []).length > 0 || !!skipped.solve;

    try {
      const committed = await Storage.getCommittedSlugLangs();
      newChecks.solve = Object.keys(committed || {}).length > 0 || !!skipped.solve;
    } catch {}

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
  }, [skipped]);

  useEffect(() => {
    let mounted = true;
    load().catch(() => {});

    const onStorage = () => {
      if (mounted) load().catch(() => {});
    };
    window.addEventListener("storage", onStorage);

    // chrome.storage.onChanged fires when auth token is saved by the OAuth relay.
    // window.addEventListener("storage") only catches localStorage, not chrome.storage.
    const onChromeStorage = (changes) => {
      if (changes["auth.tokens"] && mounted) load().catch(() => {});
    };
    chrome?.storage?.onChanged?.addListener(onChromeStorage);

    return () => {
      mounted = false;
      window.removeEventListener("storage", onStorage);
      chrome?.storage?.onChanged?.removeListener(onChromeStorage);
    };
  }, [load, refreshKey]);

  const requiredDone = STEPS.filter((s) => s.required).every((s) => !!checks[s.id]);
  const allDone = STEPS.every((s) => !!checks[s.id]);
  const doneCount = STEPS.filter((s) => !!checks[s.id]).length;

  const repoUrl = (() => {
    const repo = settings.github_repo || settings.gitRepo;
    if (!repo) return null;
    const owner = settings.github_owner?.trim() || settings.github_username || gitUser;
    return owner ? `https://github.com/${owner}/${repo}` : null;
  })();

  const stepAction = (step) => {
    if (step.id === "github") {
      return {
        primary: {
          label: "Connect GitHub →",
          onClick: () => {
            // Open the OAuth popup directly — same flow as clicking "Connect" in Settings.
            const popup = window.open(
              `${CONSTANTS.URLS.AUTH_WORKER}/auth/github`,
              "cl_oauth",
              "width=600,height=700,menubar=no,toolbar=no",
            );
            if (!popup) {
              // Popup blocked — fall back to the settings tab so user can click there
              openExtTab("library/library.html?tab=settings&settingsTab=git");
            }
          },
        },
      };
    }
    if (step.id === "repo") {
      return {
        primary: {
          label: "Set up repository →",
          onClick: () =>
            openExtTab("library/library.html?tab=settings&settingsTab=git&openSetup=true"),
        },
      };
    }
    if (step.id === "ai") {
      return {
        primary: {
          label: "Configure AI →",
          onClick: () => openExtTab("library/library.html?tab=settings&settingsTab=ai"),
        },
        secondary: {
          label: "Get free Gemini key ↗",
          onClick: () => openTab("https://aistudio.google.com/app/apikey"),
        },
        skip: true,
      };
    }
    if (step.id === "import") {
      return {
        primary: {
          label: "Import from LeetCode →",
          onClick: () => openTab("https://leetcode.com/progress/"),
        },
        skip: true,
      };
    }
    if (step.id === "solve") {
      return {
        primary: {
          label: "Go to LeetCode →",
          onClick: () => openTab(CONSTANTS.PLATFORMS.leetcode.baseUrl + "/"),
        },
        skip: true,
      };
    }
    return null;
  };

  return html`
    <div class="min-h-screen bg-[#050508] flex flex-col items-center px-4 py-16">
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
          <p class="mt-2 text-slate-400 text-base">Your DSA journey, automatically committed.</p>
          ${gitUser
            ? html`
                <div
                  class="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/5"
                >
                  <div
                    class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                  ></div>
                  <span class="text-xs text-emerald-400 font-mono">Connected as ${gitUser}</span>
                </div>
              `
            : ""}
        </div>
      </div>

      <!-- Setup checklist -->
      <div class="w-full max-w-lg">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold text-slate-400 uppercase tracking-widest">
            Setup checklist
          </h2>
          <div class="flex items-center gap-2">
            <span class="text-xs text-cyan-400 font-mono">${doneCount} / ${STEPS.length}</span>
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
        <div class="w-full h-1.5 bg-white/5 rounded-full mb-6 overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-700"
            style=${{
              width: `${(doneCount / STEPS.length) * 100}%`,
              background: allDone ? "#10b981" : "#06b6d4",
            }}
          ></div>
        </div>

        <!-- Steps -->
        <div class="flex flex-col gap-3 mb-8">
          ${STEPS.map((step) => {
            const done = !!checks[step.id];
            const actions = !done ? stepAction(step) : null;
            return html`
              <div
                class="flex items-start gap-4 p-4 rounded-xl border transition-colors ${done
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : step.required
                    ? "border-cyan-500/15 bg-white/[0.02]"
                    : "border-white/5 bg-white/[0.015]"}"
              >
                <!-- Status dot -->
                <div
                  class="mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${done
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-white/5 text-slate-600"}"
                >
                  ${done
                    ? html`<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M1 6l3.5 3.5L11 2.5"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>`
                    : html`<span class="w-2 h-2 rounded-full bg-current block"></span>`}
                </div>

                <!-- Text -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm">${step.icon}</span>
                    <span class="text-sm font-medium ${done ? "text-white" : "text-slate-300"}"
                      >${step.label}</span
                    >
                    ${!step.required && !done
                      ? html`<span
                          class="text-[9px] text-slate-600 border border-slate-700 rounded px-1"
                          >optional</span
                        >`
                      : ""}
                  </div>
                  <p class="text-[11px] text-slate-600 mt-0.5">${step.desc}</p>

                  ${step.id === "ai" && !done
                    ? html`
                        <p class="text-[10px] text-slate-500 mt-1">
                          Recommended:
                          <span class="text-cyan-500/70">Gemini</span> — get a free API key at
                          <button
                            onClick=${() => openTab("https://aistudio.google.com/app/apikey")}
                            class="text-cyan-400 underline decoration-dotted hover:text-cyan-300"
                            >aistudio.google.com</button
                          >
                        </p>
                      `
                    : ""}
                </div>

                <!-- Actions -->
                ${actions
                  ? html`
                      <div class="flex flex-col items-end gap-1.5 shrink-0">
                        <button
                          onClick=${actions.primary.onClick}
                          class="text-[10px] text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/10 px-2 py-1 rounded transition-colors whitespace-nowrap"
                        >
                          ${actions.primary.label}
                        </button>
                        ${actions.secondary
                          ? html`
                              <button
                                onClick=${actions.secondary.onClick}
                                class="text-[9px] text-slate-500 hover:text-slate-300 transition-colors whitespace-nowrap"
                              >
                                ${actions.secondary.label}
                              </button>
                            `
                          : ""}
                        ${actions.skip
                          ? html`
                              <button
                                onClick=${() => skip(step.id)}
                                class="text-[9px] text-slate-700 hover:text-slate-500 transition-colors"
                              >
                                skip for now
                              </button>
                            `
                          : ""}
                      </div>
                    `
                  : ""}
              </div>
            `;
          })}
        </div>

        <!-- All done / Required done -->
        ${allDone &&
        html`
          <div
            class="mb-8 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-center"
          >
            <div class="text-2xl mb-1">🎉</div>
            <p class="text-sm text-emerald-400 font-semibold">You're all set!</p>
            <p class="text-xs text-slate-500 mt-1">
              Every accepted submission is now automatically committed to GitHub.
            </p>
          </div>
        `}
        ${!allDone &&
        requiredDone &&
        html`
          <div
            class="mb-8 p-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 text-center"
          >
            <p class="text-sm text-cyan-400 font-semibold">Core setup complete ✓</p>
            <p class="text-xs text-slate-500 mt-1">
              Auto-commit is active. The optional steps above enhance your experience.
            </p>
          </div>
        `}

        <!-- Action buttons -->
        <div class="flex flex-wrap gap-3 justify-center mb-12">
          <button
            onClick=${() => openExtTab("library/library.html")}
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
        </div>

        <!-- Footer -->
        <p class="mt-4 text-[11px] text-slate-700 text-center max-w-sm">
          This page can be reopened from the extension popup at any time. Your data is stored
          locally and synced to your own GitHub — never shared with third parties.
        </p>
      </div>
    </div>
  `;
}

render(html`<${WelcomeApp} />`, document.getElementById("root"));
