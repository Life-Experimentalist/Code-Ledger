/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import { useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
import { Storage } from "../../core/storage.js";
import { createDebugger } from "../../lib/debug.js";
import { getPagesHtml } from "../../handlers/git/github/pages-template.js";
const html = htm.bind(h);
const dbg = createDebugger("GitHubOnboarding");

const DEFAULT_REPO_NAME = "CodeLedger-Sync";
const DEFAULT_REPO_DESC =
  "My LeetCode & DSA problem solutions tracked via CodeLedger https://codeledger.vkrishna04.me/";

/**
 * GitHub Onboarding Modal
 *
 * Steps:
 *   "check"    – initial state, resolves which step to show
 *   "choice"   – pick Create or Link
 *   "new"      – confirm new repo creation (name pre-filled, editable)
 *   "existing" – pick from user's existing repos (dropdown)
 *   "done"     – success screen
 *
 * Props:
 *   isOpen      – boolean
 *   onComplete  – called when modal should close (repo configured or dismissed)
 *   username    – GitHub login
 *   token       – GitHub OAuth/PAT token
 */
export function GitHubOnboardingModal({ isOpen, onComplete, username, token }) {
  const [step,         setStep]         = useState("check");
  const [repoName,     setRepoName]     = useState(DEFAULT_REPO_NAME);
  const [repoDesc,     setRepoDesc]     = useState(DEFAULT_REPO_DESC);
  const [busy,         setBusy]         = useState(false);
  const [error,        setError]        = useState("");
  const [progress,     setProgress]     = useState("");
  const [finalRepo,    setFinalRepo]    = useState(""); // actual created/linked repo name
  // For "existing" picker
  const [userRepos,    setUserRepos]    = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState("");

  // On every open, decide which step to start from
  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setProgress("");
    setBusy(false);
    setStep("check");

    Storage.getSettings().then((s) => {
      const hasRepo = !!(s?.github_repo || s?.gitRepo);
      if (hasRepo) {
        // Already fully configured — nothing to do, jump straight to done
        setFinalRepo(s.github_repo || s.gitRepo || "");
        setStep("already");
      } else {
        setStep("choice");
      }
    }).catch(() => setStep("choice"));
  }, [isOpen]);

  if (!isOpen) return null;

  // ── Helpers ────────────────────────────────────────────────────────────

  const sanitize = (name) =>
    name.trim().toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/^-+|-+$/g, "");

  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const ghFetch = async (path, opts = {}) => {
    const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
    const res = await fetch(url, { ...opts, headers: { ...ghHeaders, ...(opts.headers || {}) } });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw Object.assign(new Error(e.message || `GitHub API ${res.status}`), { status: res.status, body: e });
    }
    return res.json();
  };

  const saveRepoConfig = async (owner, repo) => {
    const settings = await Storage.getSettings();
    settings.github_repo   = repo;
    settings.github_owner  = owner;
    await Storage.setSettings(settings);
  };

  // ── Load existing repos for the picker ────────────────────────────────

  const loadUserRepos = async () => {
    setReposLoading(true);
    setError("");
    try {
      const repos = [];
      let page = 1;
      while (repos.length < 200) {
        const batch = await ghFetch(`/user/repos?per_page=100&page=${page}&sort=updated&type=owner`);
        repos.push(...batch);
        if (batch.length < 100) break;
        page++;
      }
      setUserRepos(repos);
      if (repos.length > 0) setSelectedRepo(repos[0].name);
    } catch (e) {
      setError("Could not load your repositories: " + e.message);
    } finally {
      setReposLoading(false);
    }
  };

  // ── Create new repo ────────────────────────────────────────────────────

  const createNewRepo = async () => {
    setBusy(true);
    setError("");
    setProgress("Checking permissions…");
    try {
      if (!token) throw new Error("Authentication token missing. Please reconnect to GitHub.");

      const cleanName = sanitize(repoName);
      if (!cleanName) throw new Error("Invalid repository name. Use letters, numbers, and hyphens.");

      setProgress("Creating repository…");
      let repoData;
      try {
        repoData = await ghFetch("/user/repos", {
          method: "POST",
          body: JSON.stringify({
            name: cleanName,
            description: repoDesc,
            private: false,
            auto_init: true,
            has_wiki: false,
            has_issues: true,
          }),
        });
      } catch (e) {
        if (e.status === 403 || e.status === 401) {
          throw new Error(
            "Permission denied. Your current session doesn't have repository creation rights.\n\n" +
            "Fix: Disconnect and reconnect GitHub in Settings — GitHub will prompt you to approve the new permissions."
          );
        }
        if (e.status === 422) {
          const msg = e.body?.errors?.[0]?.message || e.message;
          throw new Error(`Repository creation failed: ${msg}`);
        }
        throw e;
      }

      setProgress("Setting up initial files…");
      await initializeRepository(repoData.owner.login, repoData.name, token);

      setProgress("Enabling GitHub Pages…");
      await enableGitHubPages(repoData.owner.login, repoData.name, token);

      await saveRepoConfig(repoData.owner.login, repoData.name);
      setFinalRepo(repoData.name);
      setProgress("Setup complete!");
      setStep("done");
    } catch (e) {
      dbg.error("Create repo failed", e);
      setError(e.message || "Failed to create repository");
    } finally {
      setBusy(false);
    }
  };

  // ── Link existing repo ─────────────────────────────────────────────────

  const linkExistingRepo = async () => {
    const repoToLink = selectedRepo;
    if (!repoToLink) { setError("Please select a repository."); return; }
    setBusy(true);
    setError("");
    setProgress("Validating repository…");
    try {
      const repoData = await ghFetch(`/repos/${username}/${repoToLink}`).catch((e) => {
        if (e.status === 404) throw new Error("Repository not found.");
        throw e;
      });

      // Check contents: must be empty or have index.json
      const contents = await ghFetch(`/repos/${username}/${repoToLink}/contents`).catch(() => []);
      if (Array.isArray(contents) && contents.length > 0 && !contents.some(f => f.name === "index.json")) {
        throw new Error(
          "Repository is not empty and doesn't contain CodeLedger's index.json.\n" +
          "Use an empty repo or an existing CodeLedger repo."
        );
      }

      // If empty, initialize it
      if (!Array.isArray(contents) || contents.length === 0) {
        setProgress("Initializing repository structure…");
        await initializeRepository(repoData.owner.login, repoData.name, token);
      }

      await saveRepoConfig(repoData.owner.login, repoData.name);
      setFinalRepo(repoData.name);
      setProgress("Repository linked!");
      setStep("done");
    } catch (e) {
      dbg.error("Link repo failed", e);
      setError(e.message || "Failed to link repository");
    } finally {
      setBusy(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const stepLabel = {
    check:    "",
    already:  "",
    choice:   "Step 1 of 2",
    new:      "Step 2 of 2",
    existing: "Step 2 of 2",
    done:     "Setup complete",
  }[step] || "";

  const stepTitle = {
    check:    "Loading…",
    already:  "Already Connected",
    choice:   "Set Up GitHub",
    new:      "Create Repository",
    existing: "Link Existing Repository",
    done:     "All Set! 🎉",
  }[step] || "";

  const canClose = !busy && step !== "check";

  return html`
    <div
      class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick=${(e) => e.target === e.currentTarget && canClose && onComplete()}
    >
      <div class="bg-[#0a0a0f] border border-cyan-500/20 rounded-2xl w-full max-w-lg shadow-2xl">

        <!-- Header -->
        <div class="px-8 py-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 class="text-xl font-bold text-white">${stepTitle}</h2>
            ${stepLabel ? html`<p class="text-xs text-slate-500 mt-1">${stepLabel}</p>` : ""}
          </div>
          ${canClose ? html`
            <button
              onClick=${onComplete}
              class="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-500 hover:text-slate-300"
            >✕</button>
          ` : ""}
        </div>

        <!-- Body -->
        <div class="px-8 py-8">

          ${step === "check" ? html`
            <div class="flex items-center justify-center py-8">
              <div class="w-8 h-8 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 animate-spin"></div>
            </div>
          ` : ""}

          ${step === "already" ? html`
            <div class="space-y-4 text-center">
              <div class="text-4xl">✅</div>
              <div>
                <h3 class="text-base font-semibold text-white">Repository already configured</h3>
                <p class="text-sm text-slate-400 mt-2">
                  Connected as <span class="text-emerald-400 font-medium">${username}</span><br/>
                  Repo: <span class="text-cyan-300 font-mono">${username}/${finalRepo}</span>
                </p>
              </div>
              <div class="flex flex-col gap-2 pt-2">
                <button
                  onClick=${() => setStep("choice")}
                  class="w-full px-4 py-2 border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm font-medium transition-colors"
                >Switch repository</button>
                <button
                  onClick=${onComplete}
                  class="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors"
                >Continue</button>
              </div>
            </div>
          ` : ""}

          ${step === "choice" ? html`
            <div class="space-y-4">
              <p class="text-sm text-slate-400 mb-6">
                Welcome, <span class="text-emerald-400 font-medium">${username}</span>!
                Choose how to set up your CodeLedger repository.
              </p>

              <button
                onClick=${() => setStep("new")}
                class="w-full p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 transition-colors text-left group"
              >
                <div class="flex items-start justify-between">
                  <div>
                    <h3 class="font-semibold text-white group-hover:text-cyan-300 transition-colors">
                      ✨ Create New Repository
                    </h3>
                    <p class="text-xs text-slate-400 mt-1">
                      Fresh repo with CodeLedger structure and GitHub Pages
                    </p>
                  </div>
                  <span class="text-slate-500 group-hover:text-cyan-400 transition-colors mt-0.5">→</span>
                </div>
              </button>

              <button
                onClick=${() => { setStep("existing"); loadUserRepos(); }}
                class="w-full p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-left group"
              >
                <div class="flex items-start justify-between">
                  <div>
                    <h3 class="font-semibold text-white group-hover:text-slate-200 transition-colors">
                      🔗 Link Existing Repository
                    </h3>
                    <p class="text-xs text-slate-400 mt-1">
                      Connect an existing GitHub repo (empty or existing CodeLedger repo)
                    </p>
                  </div>
                  <span class="text-slate-500 group-hover:text-slate-300 transition-colors mt-0.5">→</span>
                </div>
              </button>
            </div>
          ` : ""}

          ${step === "new" ? html`
            <div class="space-y-4">
              <div>
                <label class="block text-xs font-medium text-slate-300 mb-2">
                  Repository Name
                </label>
                <input
                  type="text"
                  value=${repoName}
                  onInput=${(e) => setRepoName(e.target.value)}
                  disabled=${busy}
                  class="w-full px-3 py-2 bg-black border border-white/10 rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
                  placeholder=${DEFAULT_REPO_NAME}
                />
                <p class="text-[10px] text-slate-500 mt-1">
                  Letters, numbers, and hyphens only. Will be created under your account.
                </p>
              </div>

              <div>
                <label class="block text-xs font-medium text-slate-300 mb-2">
                  Description <span class="text-slate-600 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value=${repoDesc}
                  onInput=${(e) => setRepoDesc(e.target.value)}
                  disabled=${busy}
                  class="w-full px-3 py-2 bg-black border border-white/10 rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
                />
              </div>

              ${error ? html`
                <div class="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs whitespace-pre-wrap">${error}</div>
              ` : ""}

              ${progress && !error ? html`
                <div class="flex items-center gap-2 text-xs text-cyan-400">
                  <div class="w-3 h-3 rounded-full border border-cyan-500/50 border-t-cyan-500 animate-spin shrink-0"></div>
                  ${progress}
                </div>
              ` : ""}

              <div class="flex gap-3 pt-2">
                <button
                  onClick=${() => { setStep("choice"); setError(""); }}
                  disabled=${busy}
                  class="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >Back</button>
                <button
                  onClick=${createNewRepo}
                  disabled=${busy || !repoName.trim()}
                  class="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >${busy ? "Creating…" : "Create Repository"}</button>
              </div>
            </div>
          ` : ""}

          ${step === "existing" ? html`
            <div class="space-y-4">
              <p class="text-xs text-slate-400">
                Select a repository to connect. It must be empty or already contain CodeLedger's
                <code class="text-cyan-400">index.json</code>.
              </p>

              ${reposLoading ? html`
                <div class="flex items-center gap-2 text-xs text-slate-400 py-4">
                  <div class="w-4 h-4 rounded-full border border-slate-600 border-t-slate-300 animate-spin"></div>
                  Loading your repositories…
                </div>
              ` : html`
                <div>
                  <label class="block text-xs font-medium text-slate-300 mb-2">Repository</label>
                  ${userRepos.length === 0 ? html`
                    <p class="text-xs text-slate-500">No repositories found. Create one first.</p>
                  ` : html`
                    <select
                      value=${selectedRepo}
                      onChange=${(e) => setSelectedRepo(e.target.value)}
                      disabled=${busy}
                      class="w-full px-3 py-2 bg-black border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
                    >
                      ${userRepos.map(r => html`
                        <option value=${r.name} key=${r.name}>${r.name}${r.private ? " 🔒" : ""}</option>
                      `)}
                    </select>
                    ${selectedRepo ? html`
                      <p class="text-[10px] text-slate-500 mt-1">
                        ${username}/${selectedRepo}
                      </p>
                    ` : ""}
                  `}
                </div>
              `}

              ${error ? html`
                <div class="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs whitespace-pre-wrap">${error}</div>
              ` : ""}

              ${progress && !error ? html`
                <div class="flex items-center gap-2 text-xs text-cyan-400">
                  <div class="w-3 h-3 rounded-full border border-cyan-500/50 border-t-cyan-500 animate-spin shrink-0"></div>
                  ${progress}
                </div>
              ` : ""}

              <div class="flex gap-3 pt-2">
                <button
                  onClick=${() => { setStep("choice"); setError(""); }}
                  disabled=${busy}
                  class="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >Back</button>
                <button
                  onClick=${linkExistingRepo}
                  disabled=${busy || !selectedRepo || reposLoading}
                  class="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >${busy ? "Linking…" : "Link Repository"}</button>
              </div>
            </div>
          ` : ""}

          ${step === "done" ? html`
            <div class="space-y-4 text-center">
              <div class="text-5xl">✅</div>
              <div>
                <h3 class="text-base font-semibold text-white">GitHub Setup Complete!</h3>
                <p class="text-sm text-slate-400 mt-2">
                  Every accepted solution will be automatically committed.
                </p>
              </div>
              <div class="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
                <p class="text-xs text-slate-400 mb-1">Repository</p>
                <p class="text-sm font-mono text-cyan-300">${username}/${finalRepo}</p>
                <a
                  href="https://github.com/${username}/${finalRepo}"
                  target="_blank"
                  rel="noreferrer"
                  class="text-[11px] text-cyan-500 hover:text-cyan-300 underline mt-1 inline-block"
                >View on GitHub ↗</a>
              </div>
              <button
                onClick=${onComplete}
                class="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors mt-2"
              >Start Coding 🚀</button>
            </div>
          ` : ""}

        </div>
      </div>
    </div>
  `;
}

/**
 * Initialize repository with index.json, README, .gitignore, and GitHub Actions.
 * Uses GitHub Trees API for a single atomic commit.
 * Requires the repo to already have an initial commit (auto_init: true or non-empty).
 */
async function initializeRepository(owner, repo, token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github.v3+json",
  };

  const ghFetch = async (path, opts = {}) => {
    const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
    const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.message || `GitHub API ${res.status}`);
    }
    return res.json();
  };

  // Get latest commit SHA — retry up to 6× since GitHub needs a moment after creation
  let latestSha, baseTreeSha;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      // Try main first, then master
      let ref;
      try {
        ref = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/main`);
      } catch (_) {
        ref = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/master`);
      }
      latestSha = ref.object.sha;
      const commit = await ghFetch(`/repos/${owner}/${repo}/git/commits/${latestSha}`);
      baseTreeSha = commit.tree.sha;
      break;
    } catch (_) {
      if (attempt === 5) throw new Error("Repository branch not ready. Please try again.");
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const now = new Date().toISOString();
  const indexJson = {
    version: 1, owner, repo, createdAt: now,
    problems: [],
    stats: { total: 0, easy: 0, medium: 0, hard: 0 },
  };

  const readme =
`# ${repo}

Automatically synced LeetCode & DSA problem solutions via [CodeLedger](https://codeledger.vkrishna04.me).

## Organization

\`\`\`
topics/
  Dynamic Programming/
    two-sum/
      Python3.py
      README.md
\`\`\`

## Links

- [CodeLedger Extension](https://codeledger.vkrishna04.me)
- [Life-Experimentalist/Code-Ledger](https://github.com/Life-Experimentalist/Code-Ledger)

---
_Last updated: ${now}_
`;

  const treeRes = await ghFetch(`/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [
        { path: "index.json",                       mode: "100644", type: "blob", content: JSON.stringify(indexJson, null, 2) },
        { path: "index.html",                       mode: "100644", type: "blob", content: getPagesHtml() },
        { path: "README.md",                        mode: "100644", type: "blob", content: readme },
        { path: ".gitignore",                       mode: "100644", type: "blob", content: "node_modules/\n.env\n*.log\n.DS_Store\n" },
        { path: ".github/workflows/sync-stats.yml", mode: "100644", type: "blob", content: WORKFLOW_YAML },
      ],
    }),
  });

  const commitRes = await ghFetch(`/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: "chore: initialize CodeLedger structure",
      tree: treeRes.sha,
      parents: [latestSha],
    }),
  });

  // Try both main and master for the ref update
  for (const branch of ["main", "master"]) {
    try {
      await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commitRes.sha, force: false }),
      });
      break;
    } catch (_) { /* try next branch */ }
  }
}

const WORKFLOW_YAML =
`name: Sync Stats
on:
  push:
    branches: [main, master]
    paths: ["index.json"]
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Stats updated
        run: echo "index.json updated"
`;

async function enableGitHubPages(owner, repo, token) {
  try {
    await fetch(`https://api.github.com/repos/${owner}/${repo}/pages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({ source: { branch: "main", path: "/" } }),
    });
  } catch (_) {
    // Pages may already be enabled or not available — non-fatal
  }
}
