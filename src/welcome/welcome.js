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
  { name: "LeetCode",      url: "https://leetcode.com/",                           color: "#FFA116", favicon: "https://assets.leetcode.com/static_assets/public/icons/favicon.ico" },
  { name: "GeeksForGeeks", url: "https://practice.geeksforgeeks.org/",             color: "#2F8D46", favicon: "https://www.geeksforgeeks.org/favicon.ico" },
  { name: "Codeforces",    url: "https://codeforces.com/problemset/",              color: "#1F8ACB", favicon: "https://codeforces.com/favicon.ico" },
];

function WelcomeApp() {
  const [settings, setSettings] = useState({});
  const [checks,   setChecks]   = useState({});
  const [gitUser,  setGitUser]  = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    const [s, problems] = await Promise.all([
      Storage.getSettings().catch(() => ({})),
      Storage.getAllProblems().catch(() => []),
    ]);
    setSettings(s || {});

    const newChecks = { installed: true };

    // GitHub auth check — check both OAuth tokens and legacy PAT
    const oauthToken = await Storage.getAuthToken("github").catch(() => null);
    const token = oauthToken || s?.github_token;
    newChecks.github = !!token;

    // Repo check — canonical key AND legacy fallback
    newChecks.repo = !!(s?.github_repo || s?.gitRepo);

    // Solve check
    newChecks.solve = (problems || []).length > 0;

    // Commit check — uses the committed slug-langs map written by the SW after every push
    try {
      const committed = await Storage.getCommittedSlugLangs();
      newChecks.commit = Object.keys(committed || {}).length > 0;
    } catch (_) {
      // Fall back to checking if any problem exists (better than always false)
      newChecks.commit = newChecks.solve;
    }

    setChecks(newChecks);

    // Fetch GitHub username for display
    if (token) {
      fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(u => { if (u?.login) setGitUser(u.login); })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    load().catch(() => {});
    // Listen for storage changes so the checklist updates if the user connects
    // GitHub or finishes repo setup in another tab/popup
    const onStorage = () => { if (mounted) load().catch(() => {}); };
    window.addEventListener("storage", onStorage);
    return () => { mounted = false; window.removeEventListener("storage", onStorage); };
  }, [load, refreshKey]);

  const doneCount = STEPS.filter(s => checks[s.id]).length;
  const allDone   = doneCount === STEPS.length;

  const openLibrary = () => {
    if (typeof chrome !== "undefined" && chrome.runtime?.id) {
      chrome.tabs.create({ url: chrome.runtime.getURL("library/library.html") });
    }
  };

  const openSettings = () => {
    if (typeof chrome !== "undefined" && chrome.runtime?.id) {
      chrome.tabs.create({ url: chrome.runtime.getURL("library/library.html") + "?tab=settings&settingsTab=git" });
    }
  };

  const repoUrl = (() => {
    const repo  = settings.github_repo || settings.gitRepo;
    if (!repo) return null;
    const owner = settings.github_owner?.trim() || settings.github_username || gitUser;
    return owner ? `https://github.com/${owner}/${repo}` : null;
  })();

  // Action button hint per incomplete step
  const stepAction = (stepId) => {
    if (stepId === "github" || stepId === "repo") return { label: "Set up →", onClick: openSettings };
    if (stepId === "solve") return { label: "Start solving →", onClick: () => window.open("https://leetcode.com/", "_blank") };
    return null;
  };

  return html`
    <div class="min-h-screen bg-[#050508] flex flex-col items-center px-4 py-16">

      <!-- Hero -->
      <div class="flex flex-col items-center mb-12 gap-4">
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
          ${gitUser ? html`
            <div class="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/5">
              <div class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"></div>
              <span class="text-xs text-emerald-400 font-mono">Connected as ${gitUser}</span>
            </div>
          ` : ""}
        </div>
      </div>

      <!-- Progress + Checklist -->
      <div class="w-full max-w-lg mb-10">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold text-slate-400 uppercase tracking-widest">Setup checklist</h2>
          <div class="flex items-center gap-3">
            <span class="text-xs text-cyan-400 font-mono">${doneCount} / ${STEPS.length}</span>
            <button
              onClick=${() => setRefreshKey(k => k + 1)}
              title="Refresh status"
              class="text-slate-600 hover:text-slate-300 transition-colors text-sm"
            >↺</button>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="w-full h-1.5 bg-white/5 rounded-full mb-6 overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-700"
            style=${{ width: `${(doneCount / STEPS.length) * 100}%`, background: allDone ? "#10b981" : "#06b6d4" }}
          ></div>
        </div>

        <!-- Steps -->
        <div class="flex flex-col gap-3">
          ${STEPS.map((step) => {
    const done   = !!checks[step.id];
    const action = !done ? stepAction(step.id) : null;
    return html`
              <div class="flex items-start gap-4 p-4 rounded-xl border transition-colors ${done
        ? "border-emerald-500/20 bg-emerald-500/5"
        : "border-white/5 bg-white/[0.02]"
      }">
                <div class="mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-slate-600"}">
                  ${done
        ? html`<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 6l3.5 3.5L11 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : html`<span class="w-2 h-2 rounded-full bg-current block"></span>`
      }
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm">${step.icon}</span>
                    <span class="text-sm font-medium ${done ? "text-white" : "text-slate-400"}">${step.label}</span>
                  </div>
                  <p class="text-[11px] text-slate-600 mt-0.5">${step.desc}</p>
                </div>
                ${action ? html`
                  <button
                    onClick=${action.onClick}
                    class="shrink-0 text-[10px] text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/10 px-2 py-1 rounded transition-colors"
                  >${action.label}</button>
                ` : ""}
              </div>
            `;
  })}
        </div>
      </div>

      <!-- All done banner -->
      ${allDone ? html`
        <div class="w-full max-w-lg mb-8 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-center">
          <div class="text-2xl mb-1">🎉</div>
          <p class="text-sm text-emerald-400 font-semibold">You're all set!</p>
          <p class="text-xs text-slate-500 mt-1">Start solving — every accepted submission is automatically committed to GitHub.</p>
        </div>
      ` : ""}

      <!-- Action buttons -->
      <div class="flex flex-wrap gap-3 justify-center mb-12">
        <button
          onClick=${openLibrary}
          class="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-sm transition-colors"
        >Open Library →</button>

        ${repoUrl ? html`
          <a
            href=${repoUrl}
            target="_blank"
            rel="noreferrer"
            class="px-5 py-2.5 rounded-xl border border-white/10 hover:border-cyan-500/30 hover:bg-white/5 text-slate-300 text-sm transition-colors"
          >View Repo ↗</a>
        ` : ""}

        ${!checks.github || !checks.repo ? html`
          <button
            onClick=${openSettings}
            class="px-5 py-2.5 rounded-xl border border-cyan-500/30 hover:bg-cyan-500/10 text-cyan-400 text-sm transition-colors"
          >Finish Setup →</button>
        ` : ""}
      </div>

      <!-- Start solving section -->
      <div class="w-full max-w-lg">
        <h2 class="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">Start solving</h2>
        <div class="grid grid-cols-3 gap-3">
          ${PLATFORMS.map(p => html`
            <a
              href=${p.url}
              target="_blank"
              rel="noreferrer"
              class="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/5 hover:border-white/10 bg-white/[0.02] hover:bg-white/5 transition-colors group"
            >
              <img src=${p.favicon} alt="" class="w-6 h-6 object-contain"
                onError=${(e) => { e.target.style.display = "none"; }} />
              <span class="text-xs text-slate-400 group-hover:text-white transition-colors">${p.name}</span>
            </a>
          `)}
        </div>
      </div>

      <!-- Footer note -->
      <p class="mt-12 text-[11px] text-slate-700 text-center max-w-sm">
        This page can be reopened from the extension popup at any time.
        Your data is stored locally and synced to your own GitHub — never shared with third parties.
      </p>

    </div>
  `;
}

render(html`<${WelcomeApp} />`, document.getElementById("root"));
