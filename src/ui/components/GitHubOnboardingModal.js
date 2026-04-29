/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import { useState } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
import { Storage } from "../../core/storage.js";
import { createDebugger } from "../../lib/debug.js";
const html = htm.bind(h);
const dbg = createDebugger("GitHubOnboarding");

/**
 * GitHub Onboarding Modal - Step 1: Auth Success → Step 2: Repo Choice → Step 3: Setup
 */
export function GitHubOnboardingModal({ isOpen, onComplete, username, token }) {
    const [step, setStep] = useState("choice");
    const [repoName, setRepoName] = useState("CodeLedger-Sync");
    const [repoDesc, setRepoDesc] = useState(
        "My LeetCode & DSA problem solutions tracked via CodeLedger https://codeledger.vkrishna04.me/ | https://github.com/Life-Experimentalist/Code-Ledger"
    );
    const [repoTags, setRepoTags] = useState("leetcode,dsa,problems,codeledger");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [progress, setProgress] = useState("");

    // Sanitize repo name: replace whitespace with hyphens, lowercase
    const sanitizeRepoName = (name) => {
        return name
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-") // Replace whitespace with hyphens
            .replace(/[^a-z0-9-]/g, "") // Remove invalid characters
            .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
    };

    // Debounce handler to prevent click violation
    const debounce = (fn, delay = 300) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), delay);
        };
    };

    if (!isOpen) return null;

    const createNewRepo = async () => {
        setBusy(true);
        setError("");
        setProgress("Creating repository…");

        try {
            // Validate token
            if (!token) {
                throw new Error("Authentication token missing. Please reconnect to GitHub.");
            }

            // Sanitize repo name
            const cleanName = sanitizeRepoName(repoName);
            if (!cleanName) {
                throw new Error("Invalid repository name. Use only letters, numbers, and hyphens.");
            }

            // Validate token has repo scope by fetching user repos
            dbg.log("Verifying token scope by fetching user repos...");
            const scopeCheck = await fetch("https://api.github.com/user/repos?per_page=1", {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (scopeCheck.status === 403) {
                const errorData = await scopeCheck.json();
                throw new Error(
                    `❌ GitHub token missing 'repo' scope. \n\n` +
                    `Current error: ${errorData.message || "Permission denied"}\n\n` +
                    `Fix: \n` +
                    `1. Click "Reconnect" in Settings\n` +
                    `2. APPROVE all permissions when GitHub asks\n` +
                    `3. Ensure scopes include: repo, workflow, user\n\n` +
                    `If using Personal Access Token (PAT):\n` +
                    `• Ensure these scopes are selected: repo, workflow, user:email\n` +
                    `• If editing existing token, GitHub may require regeneration\n` +
                    `• Create a NEW token with full repo + workflow scopes`
                );
            }
            if (!scopeCheck.ok) {
                const err = await scopeCheck.json();
                throw new Error(`Token validation failed: ${err.message || scopeCheck.statusText}`);
            }

            setProgress("Creating repository…");

            // 2. Create repository
            const createRes = await fetch("https://api.github.com/user/repos", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    Accept: "application/vnd.github.v3+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                body: JSON.stringify({
                    name: cleanName,
                    description: repoDesc,
                    private: false,
                    auto_init: true,
                    has_wiki: false,
                    has_issues: true,
                    has_downloads: false,
                }),
            });

            if (!createRes.ok) {
                const err = await createRes.json().catch(() => ({}));
                const statusText =
                    createRes.status === 403
                        ? "Forbidden: " + (err.message || "Token missing 'repo' or 'workflow' scope")
                        : createRes.status === 422
                            ? "Invalid: " + (err.message || "Repository name invalid or already exists")
                            : createRes.status === 401
                                ? "Unauthorized: " + (err.message || "Token invalid or expired")
                                : `HTTP ${createRes.status}: ${err.message || "Unknown error"}`;
                throw new Error(
                    err.message || `Failed to create repo: ${statusText}`
                );
            }

            setProgress("Setting up initial files…");

            // 2. Parse repo data from response
            const repoData = await createRes.json().catch(() => ({}));
            const owner = repoData.owner?.login;
            const createdRepoName = repoData.name;

            // Push initial files
            await initializeRepository(owner, createdRepoName, token);

            setProgress("Configuring GitHub Pages…");

            // 3. Enable GitHub Pages
            await enableGitHubPages(owner, createdRepoName, token);

            // Save repo config (do NOT save github_token — it lives in auth.tokens)
            const settings = await Storage.getSettings();
            settings.github_repo = createdRepoName;
            settings.github_owner = owner;
            await Storage.setSettings(settings);

            setProgress("Setup complete!");
            setStep("done");
        } catch (e) {
            dbg.error("Create repo failed", e);
            setError(e.message || "Failed to create repository");
        } finally {
            setBusy(false);
        }
    };

    const linkExistingRepo = async () => {
        setBusy(true);
        setError("");
        setProgress("Validating repository…");

        try {
            // Sanitize repo name
            const cleanName = sanitizeRepoName(repoName);
            if (!cleanName) {
                throw new Error("Invalid repository name. Use only letters, numbers, and hyphens.");
            }

            const validateRes = await fetch(
                `https://api.github.com/repos/${username}/${cleanName}`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            if (validateRes.status === 404) {
                throw new Error("Repository not found");
            }

            if (!validateRes.ok) {
                throw new Error(`Failed to access repository (${validateRes.status})`);
            }

            const repoData = await validateRes.json();

            // Check if empty or has CodeLedger structure
            const contentsRes = await fetch(
                `https://api.github.com/repos/${username}/${cleanName}/contents`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            if (contentsRes.ok) {
                const contents = await contentsRes.json();
                const hasIndex = contents.some((f) => f.name === "index.json");
                if (contents.length > 0 && !hasIndex) {
                    throw new Error(
                        "Repository is not empty and doesn't contain index.json"
                    );
                }
            }

            // Save repo config (do NOT save github_token — it lives in auth.tokens)
            const settings = await Storage.getSettings();
            settings.github_repo = cleanName;
            settings.github_owner = username;
            await Storage.setSettings(settings);

            setProgress("Repository linked successfully!");
            setStep("done");
        } catch (e) {
            dbg.error("Link repo failed", e);
            setError(e.message || "Failed to link repository");
        } finally {
            setBusy(false);
        }
    };

    return html`
    <div
      class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick=${(e) => e.target === e.currentTarget && onComplete()}
    >
      <div class="bg-[#0a0a0f] border border-cyan-500/20 rounded-2xl w-full max-w-2xl shadow-2xl">
        <!-- Header -->
        <div class="px-8 py-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 class="text-2xl font-bold text-white">
              ${step === "choice"
            ? "Set Up GitHub"
            : step === "new"
                ? "Create New Repository"
                : step === "existing"
                    ? "Link Existing Repository"
                    : step === "setup"
                        ? "Initializing…"
                        : "All Set! 🎉"}
            </h2>
            <p class="text-xs text-slate-500 mt-1">
              ${step === "done"
            ? "Your CodeLedger repository is ready"
            : `Step ${step === "choice"
                ? "1"
                : step === "new" || step === "existing"
                    ? "2"
                    : "3"
            } of 3`}
            </p>
          </div>
          ${step !== "setup" && step !== "done"
            ? html`
                <button
                  onClick=${onComplete}
                  class="p-2 hover:bg-white/5 rounded-lg transition-colors"
                >
                  ✕
                </button>
              `
            : ""}
        </div>

        <!-- Content -->
        <div class="px-8 py-8">
          ${step === "choice"
            ? html`
                <div class="space-y-4">
                  <p class="text-sm text-slate-400 mb-6">
                    Welcome, <span class="text-emerald-400 font-medium">${username}</span>!
                    Let's set up your CodeLedger repository.
                  </p>

                  <button
                    onClick=${() => setStep("new")}
                    class="w-full p-4 rounded-lg border border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 transition-colors text-left group"
                  >
                    <div class="flex items-start justify-between">
                      <div>
                        <h3 class="font-semibold text-white group-hover:text-cyan-300 transition-colors">
                          ✨ Create New Repository
                        </h3>
                        <p class="text-xs text-slate-400 mt-1">
                          Set up a fresh repo with initial structure and GitHub Pages
                        </p>
                      </div>
                      <span class="text-lg">→</span>
                    </div>
                  </button>

                  <button
                    onClick=${() => setStep("existing")}
                    class="w-full p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-left group"
                  >
                    <div class="flex items-start justify-between">
                      <div>
                        <h3 class="font-semibold text-white group-hover:text-slate-200 transition-colors">
                          🔗 Link Existing Repository
                        </h3>
                        <p class="text-xs text-slate-400 mt-1">
                          Connect to an existing GitHub repository
                        </p>
                      </div>
                      <span class="text-lg">→</span>
                    </div>
                  </button>
                </div>
              `
            : step === "new"
                ? html`
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
                        class="w-full px-3 py-2 bg-black border border-white/10 rounded-lg text-white text-sm placeholder-slate-600 disabled:opacity-50"
                        placeholder="CodeLedger-Sync"
                      />
                      <p class="text-[10px] text-slate-500 mt-1">
                        Must start with a letter, contain only alphanumerics and hyphens
                      </p>
                    </div>

                    <div>
                      <label class="block text-xs font-medium text-slate-300 mb-2">
                        Description
                      </label>
                      <textarea
                        value=${repoDesc}
                        onInput=${(e) => setRepoDesc(e.target.value)}
                        disabled=${busy}
                        class="w-full px-3 py-2 bg-black border border-white/10 rounded-lg text-white text-sm placeholder-slate-600 disabled:opacity-50 resize-none h-20"
                        placeholder="My LeetCode & DSA solutions"
                      ></textarea>
                    </div>

                    <div>
                      <label class="block text-xs font-medium text-slate-300 mb-2">
                        Tags (comma-separated)
                      </label>
                      <input
                        type="text"
                        value=${repoTags}
                        onInput=${(e) => setRepoTags(e.target.value)}
                        disabled=${busy}
                        class="w-full px-3 py-2 bg-black border border-white/10 rounded-lg text-white text-sm placeholder-slate-600 disabled:opacity-50"
                        placeholder="leetcode,dsa,problems"
                      />
                    </div>

                    ${error
                        ? html`
                          <div class="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                            ${error}
                          </div>
                        `
                        : ""}

                    <div class="flex gap-3 pt-4">
                      <button
                        onClick=${debounce(() => setStep("choice"), 0)}
                        disabled=${busy}
                        class="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        Back
                      </button>
                      <button
                        onClick=${debounce(createNewRepo, 0)}
                        disabled=${busy || !repoName.trim()}
                        class="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        ${busy ? "Creating…" : "Create Repository"}
                      </button>
                    </div>
                  </div>
                `
                : step === "existing"
                    ? html`
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
                          class="w-full px-3 py-2 bg-black border border-white/10 rounded-lg text-white text-sm placeholder-slate-600 disabled:opacity-50"
                          placeholder="my-repo"
                        />
                        <p class="text-[10px] text-slate-500 mt-1">
                          Must be empty or contain CodeLedger's index.json
                        </p>
                      </div>

                      ${error
                            ? html`
                            <div class="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                              ${error}
                            </div>
                          `
                            : ""}

                      <div class="flex gap-3 pt-4">
                        <button
                          onClick=${debounce(() => setStep("choice"), 0)}
                          disabled=${busy}
                          class="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          Back
                        </button>
                        <button
                          onClick=${debounce(linkExistingRepo, 0)}
                          disabled=${busy || !repoName.trim()}
                          class="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          ${busy ? "Validating…" : "Link Repository"}
                        </button>
                      </div>
                    </div>
                  `
                    : step === "setup"
                        ? html`
                      <div class="space-y-4 text-center">
                        <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 animate-spin">
                          <div class="w-8 h-8 rounded-full border-2 border-cyan-500/20 border-t-cyan-500"></div>
                        </div>
                        <p class="text-sm text-slate-300 font-medium">${progress}</p>
                        <p class="text-xs text-slate-500">This may take a few moments…</p>
                      </div>
                    `
                        : html`
                      <div class="space-y-4 text-center">
                        <div class="text-5xl">✅</div>
                        <div>
                          <h3 class="text-lg font-semibold text-white">GitHub Setup Complete!</h3>
                          <p class="text-sm text-slate-400 mt-2">
                            Your repository is ready. Problems you solve will be automatically
                            synced to GitHub.
                          </p>
                        </div>

                        <div class="p-4 rounded-lg bg-cyan-500/5 border border-cyan-500/20 mt-4">
                          <p class="text-xs text-slate-300 font-mono">
                            Repository: <span class="text-cyan-300">${username}/${repoName}</span>
                          </p>
                        </div>

                        <button
                          onClick=${onComplete}
                          class="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors mt-4"
                        >
                          Start Coding 🚀
                        </button>
                      </div>
                    `}
        </div>
      </div>
    </div>
  `;
}

/**
 * Initialize repository with index.json, README, .gitignore, and GitHub Actions.
 * Uses GitHub Trees API for a single atomic commit (no btoa / encoding issues).
 * Assumes the repo was created with auto_init:true so the default branch exists.
 */
async function initializeRepository(owner, repo, token) {
    const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
    };

    const ghFetch = async (url, opts = {}) => {
        const res = await fetch(url.startsWith("http") ? url : `https://api.github.com${url}`, {
            ...opts,
            headers: { ...headers, ...(opts.headers || {}) },
        });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            throw new Error(e.message || `GitHub API ${res.status}`);
        }
        return res.json();
    };

    // 1. Get the latest commit SHA on the default branch (created by auto_init)
    let latestSha, baseTreeSha;
    // Retry up to 5 times — GitHub needs a moment after creation
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const ref = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/main`);
            latestSha = ref.object.sha;
            const commit = await ghFetch(`/repos/${owner}/${repo}/git/commits/${latestSha}`);
            baseTreeSha = commit.tree.sha;
            break;
        } catch (_) {
            if (attempt === 4) throw new Error("Repository branch not ready after waiting. Please try again.");
            await new Promise(r => setTimeout(r, 1500));
        }
    }

    const now = new Date().toISOString();
    const indexJson = {
        version: 1,
        owner,
        repo,
        createdAt: now,
        problems: [],
        stats: { total: 0, easy: 0, medium: 0, hard: 0 },
    };

    const readme =
`# ${repo}

Automatically synced LeetCode & DSA problem solutions via [CodeLedger](https://codeledger.vkrishna04.me).

## Organization

Problems are organized by topic under \`topics/{topic}/{slug}/\`:

\`\`\`
topics/
  Dynamic Programming/
    two-sum/
      Python3.py
      README.md
  Arrays/
    ...
\`\`\`

## Links

- [CodeLedger Extension](https://codeledger.vkrishna04.me)
- [Life-Experimentalist/Code-Ledger](https://github.com/Life-Experimentalist/Code-Ledger)

---

_Last updated: ${now}_
`;

    const gitignore = `node_modules/\n.env\n*.log\n.DS_Store\n`;

    const workflow =
`name: Sync Stats

on:
  push:
    branches: [main]
    paths: ["index.json"]

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Stats updated
        run: echo "index.json updated"
`;

    // 2. Create tree with all files (raw content — no btoa needed)
    const treeRes = await ghFetch(`/repos/${owner}/${repo}/git/trees`, {
        method: "POST",
        body: JSON.stringify({
            base_tree: baseTreeSha,
            tree: [
                { path: "index.json",                      mode: "100644", type: "blob", content: JSON.stringify(indexJson, null, 2) },
                { path: "README.md",                       mode: "100644", type: "blob", content: readme },
                { path: ".gitignore",                      mode: "100644", type: "blob", content: gitignore },
                { path: ".github/workflows/sync-stats.yml", mode: "100644", type: "blob", content: workflow },
            ],
        }),
    });

    // 3. Create commit
    const commitRes = await ghFetch(`/repos/${owner}/${repo}/git/commits`, {
        method: "POST",
        body: JSON.stringify({
            message: "chore: initialize CodeLedger structure",
            tree: treeRes.sha,
            parents: [latestSha],
        }),
    });

    // 4. Update branch ref
    await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/main`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commitRes.sha, force: false }),
    });
}

/**
 * Enable GitHub Pages for the repository
 */
async function enableGitHubPages(owner, repo, token) {
    try {
        await fetch(
            `https://api.github.com/repos/${owner}/${repo}/pages`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    Accept: "application/vnd.github.switcheroo-preview+json",
                },
                body: JSON.stringify({
                    source: { branch: "main", path: "/" },
                }),
            }
        );
    } catch (e) {
        // GitHub Pages might already be enabled, ignore
    }
}
