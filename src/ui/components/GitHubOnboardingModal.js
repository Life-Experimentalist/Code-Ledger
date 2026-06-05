/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h } from "../../vendor/preact-bundle.js";
import { useState, useEffect, useRef } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
import { Storage } from "../../core/storage.js";
import { CONSTANTS } from "../../core/constants.js";
import { createDebugger } from "../../lib/debug.js";
import { registry } from "../../core/handler-registry.js";
import { getPagesHtml } from "../../handlers/git/github/pages-template.js";
import { importFromRepo, applyImport } from "../../background/sync-engine.js";
import { ConflictResolutionModal } from "../../library/components/ConflictResolutionModal.js";

const html = htm.bind(h);
const dbg = createDebugger("GitHubOnboarding");

const DEFAULT_REPO_NAME = "CodeLedger-Sync";
const DEFAULT_REPO_DESC =
  "My LeetCode & DSA problem solutions tracked via CodeLedger https://codeledger.vkrishna04.me/";
const DEFAULT_REPO_TOPICS = [
  "codeledger",
  "dsa",
  "leetcode",
  "algorithms",
  "dynamic-programming",
  "graphs",
  "trees",
  "arrays",
  "hashing",
  "greedy",
];

/**
 * GitHub Onboarding Modal
 *
 * Steps: check → choice → new | existing → done
 *        check → already (already configured, can switch)
 *
 * Closing: only via explicit ✕ / "Continue" / "Start Coding" buttons.
 * The backdrop does NOT close the modal.
 *
 * Props:
 *   isOpen      – boolean
 *   onComplete  – called when modal should close
 *   username    – GitHub login
 *   token       – GitHub OAuth/PAT token
 */
export function GitHubOnboardingModal({ isOpen, onComplete, username, token }) {
  const [step, setStep] = useState("check");
  const [repoName, setRepoName] = useState(DEFAULT_REPO_NAME);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [finalRepo, setFinalRepo] = useState("");
  const [finalOwner, setFinalOwner] = useState("");

  // Owner / org selection
  const [orgs, setOrgs] = useState([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState("");

  // Repo picker (existing)
  const [userRepos, setUserRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState("");

  // Repo name availability check
  const [nameCheck, setNameCheck] = useState(null); // null | 'checking' | 'available' | 'taken'
  const nameCheckTimer = useRef(null);

  // Conflict resolution
  const [importData, setImportData] = useState(null);

  // Post-link sync state: null | { phase: 'syncing', current: number, total: number } | { committed: number } | 'error'
  const [postSyncState, setPostSyncState] = useState(null);
  const syncPortRef = useRef(null);

  // ── Init on open ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setProgress("");
    setBusy(false);
    setNameCheck(null);
    setPostSyncState(null);
    setRepoName(DEFAULT_REPO_NAME);
    setSelectedOwner(username || "");
    setStep("check");

    Storage.getSettings()
      .then((s) => {
        const hasRepo = !!(s?.github_repo || s?.gitRepo);
        if (hasRepo) {
          setFinalRepo(s.github_repo || s.gitRepo || "");
          setFinalOwner(s.github_owner || username || "");
          setStep("already");
        } else {
          setStep("choice");
        }
      })
      .catch(() => setStep("choice"));
  }, [isOpen]);

  const [tokenExpired, setTokenExpired] = useState(false);

  // Load orgs when the modal opens (so the dropdown is ready)
  useEffect(() => {
    if (!isOpen || !token) return;
    setTokenExpired(false);
    setOrgsLoading(true);
    fetch("https://api.github.com/user/orgs?per_page=100", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    })
      .then((r) => {
        // 401 here means the GitHub App token lacks read:org scope — not a token expiry.
        // Silently fall back to personal-account-only mode.
        if (!r.ok) return [];
        return r.json();
      })
      .then((data) => setOrgs(Array.isArray(data) ? data : []))
      .catch(() => setOrgs([]))
      .finally(() => setOrgsLoading(false));
  }, [isOpen, token]);

  if (!isOpen) return null;

  // ── Helpers ───────────────────────────────────────────────────────────────

  const sanitize = (name) =>
    String(name)
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");

  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const ghFetch = async (path, opts = {}) => {
    const url = path.startsWith("http")
      ? path
      : `https://api.github.com${path}`;
    const res = await fetch(url, {
      ...opts,
      headers: { ...ghHeaders, ...(opts.headers || {}) },
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw Object.assign(new Error(e.message || `GitHub API ${res.status}`), {
        status: res.status,
        body: e,
      });
    }
    return res.json();
  };

  const triggerPostLinkSync = () => {
    if (typeof chrome === "undefined" || !chrome.runtime?.id) return;
    setPostSyncState({ phase: "syncing", current: 0, total: 0 });

    // Open a port so the SW can stream sync-progress events back
    const port = chrome.runtime.connect({ name: "sync-keepalive" });
    syncPortRef.current = port;

    port.onMessage.addListener((msg) => {
      if (msg.type === "sync-progress") {
        setPostSyncState({
          phase: "syncing",
          current: msg.current,
          total: msg.total,
        });
      } else if (msg.type === "sync-done") {
        port.disconnect();
        syncPortRef.current = null;
      }
    });

    port.onDisconnect.addListener(() => {
      syncPortRef.current = null;
    });

    chrome.runtime.sendMessage(
      { type: "RESYNC_ALL", mode: "individual" },
      (resp) => {
        if (chrome.runtime.lastError || !resp?.ok) {
          setPostSyncState("error");
          return;
        }
        setPostSyncState({ committed: resp.committed || 0 });
      },
    );
  };

  const saveRepoConfig = async (owner, repo) => {
    const settings = await Storage.getSettings();
    settings.github_repo = repo;
    settings.github_owner = owner !== username ? owner : "";
    await Storage.setSettings(settings);
  };

  // ── Repo name availability check (debounced) ──────────────────────────────

  const scheduleNameCheck = (name, owner) => {
    if (nameCheckTimer.current) clearTimeout(nameCheckTimer.current);
    const clean = sanitize(name);
    if (!clean || !owner) {
      setNameCheck(null);
      return;
    }
    setNameCheck("checking");
    nameCheckTimer.current = setTimeout(async () => {
      try {
        await ghFetch(`/repos/${owner}/${clean}`);
        setNameCheck("taken");
      } catch (e) {
        setNameCheck(e.status === 404 ? "available" : null);
      }
    }, 600);
  };

  const onRepoNameInput = (e) => {
    // Replace spaces with hyphens as the user types
    const val = e.target.value.replace(/\s+/g, "-");
    setRepoName(val);
    setNameCheck(null);
    scheduleNameCheck(val, selectedOwner);
  };

  const onOwnerChange = (newOwner) => {
    setSelectedOwner(newOwner);
    setNameCheck(null);
    if (repoName.trim()) scheduleNameCheck(repoName, newOwner);
    // Reload repo list if on existing step
    if (step === "existing") {
      setUserRepos([]);
      setSelectedRepo("");
      loadUserRepos(newOwner);
    }
  };

  // ── Load existing repos ───────────────────────────────────────────────────

  const loadUserRepos = async (owner) => {
    const effectiveOwner = owner || selectedOwner || username;
    setReposLoading(true);
    setError("");
    try {
      const isOrg = effectiveOwner !== username;
      const repos = [];
      let page = 1;
      while (repos.length < 300) {
        const path = isOrg
          ? `/orgs/${effectiveOwner}/repos?per_page=100&page=${page}&sort=updated`
          : `/user/repos?per_page=100&page=${page}&sort=updated&type=owner`;
        const batch = await ghFetch(path);
        repos.push(...batch);
        if (batch.length < 100) break;
        page++;
      }
      setUserRepos(repos);
      if (repos.length > 0) setSelectedRepo(repos[0].name);
    } catch (e) {
      if (e.status === 401) {
        setTokenExpired(true);
      } else {
        setError("Could not load repositories: " + e.message);
      }
    } finally {
      setReposLoading(false);
    }
  };

  // ── Create new repo ───────────────────────────────────────────────────────

  const createNewRepo = async () => {
    setBusy(true);
    setError("");
    setProgress("Validating…");
    try {
      if (!token)
        throw new Error(
          "Authentication token missing. Please reconnect to GitHub.",
        );

      const cleanName = sanitize(repoName);
      if (!cleanName)
        throw new Error(
          "Invalid repository name. Use letters, numbers, and hyphens.",
        );
      if (nameCheck === "taken")
        throw new Error(
          `Repository "${cleanName}" already exists under ${selectedOwner}.`,
        );

      const isOrg = selectedOwner !== username;
      setProgress("Creating repository…");
      let repoData;
      try {
        repoData = await ghFetch(
          isOrg ? `/orgs/${selectedOwner}/repos` : "/user/repos",
          {
            method: "POST",
            body: JSON.stringify({
              name: cleanName,
              description: DEFAULT_REPO_DESC,
              private: false,
              auto_init: true,
              has_wiki: false,
              has_issues: true,
            }),
          },
        );
      } catch (e) {
        if (e.status === 403 || e.status === 401)
          throw new Error(
            "Permission denied. Disconnect and reconnect GitHub in Settings to approve repository permissions.",
          );
        if (e.status === 422) {
          const msg = e.body?.errors?.[0]?.message || e.message;
          throw new Error(`Repository creation failed: ${msg}`);
        }
        throw e;
      }

      setProgress("Setting up initial files…");
      await initializeRepository(repoData.owner.login, repoData.name, token);

      setProgress("Applying repository settings…");
      await configureRepositoryPresentation(
        repoData.owner.login,
        repoData.name,
        token,
      );

      setProgress("Enabling GitHub Pages…");
      await enableGitHubPages(repoData.owner.login, repoData.name, token);

      await saveRepoConfig(repoData.owner.login, repoData.name);
      setFinalRepo(repoData.name);
      setFinalOwner(repoData.owner.login);
      setProgress("Setup complete!");
      setStep("done");
      triggerPostLinkSync();
    } catch (e) {
      dbg.error("Create repo failed", e);
      setError(e.message || "Failed to create repository");
    } finally {
      setBusy(false);
    }
  };

  // ── Link existing repo ────────────────────────────────────────────────────

  const linkExistingRepo = async () => {
    const repoToLink = selectedRepo;
    if (!repoToLink) {
      setError("Please select a repository.");
      return;
    }
    setBusy(true);
    setError("");
    setProgress("Validating repository…");
    try {
      const repoData = await ghFetch(
        `/repos/${selectedOwner}/${repoToLink}`,
      ).catch((e) => {
        if (e.status === 404) throw new Error("Repository not found.");
        throw e;
      });

      const contents = await ghFetch(
        `/repos/${selectedOwner}/${repoToLink}/contents`,
      ).catch(() => []);
      if (
        Array.isArray(contents) &&
        contents.length > 0 &&
        !contents.some((f) => f.name === "index.json")
      ) {
        throw new Error(
          "Repository is not empty and doesn't contain CodeLedger's index.json.\n" +
            "Use an empty repo or an existing CodeLedger repo.",
        );
      }

      if (!Array.isArray(contents) || contents.length === 0) {
        setProgress("Initializing repository structure…");
        await initializeRepository(repoData.owner.login, repoData.name, token);
        setProgress("Applying repository settings…");
        await configureRepositoryPresentation(
          repoData.owner.login,
          repoData.name,
          token,
        );
      }

      await saveRepoConfig(repoData.owner.login, repoData.name);
      setFinalRepo(repoData.name);
      setFinalOwner(repoData.owner.login);

      if (
        Array.isArray(contents) &&
        contents.some((f) => f.name === "index.json")
      ) {
        setProgress("Reading existing problems from repository…");
        try {
          const _git = registry.getGitProvider("github");
          const { remoteOnly, conflicts } = await importFromRepo(
            repoData.owner.login,
            repoData.name,
            _git,
          );
          if (conflicts.length > 0) {
            setImportData({ remoteOnly, conflicts });
            setBusy(false);
            return;
          }
          await applyImport(remoteOnly);
          setProgress(
            `Imported ${remoteOnly.length} problem${remoteOnly.length !== 1 ? "s" : ""} from repository`,
          );
        } catch (e) {
          dbg.warn("Import failed during onboarding:", e.message);
        }
      }

      setProgress("Repository linked!");
      setStep("done");
      triggerPostLinkSync();
    } catch (e) {
      dbg.error("Link repo failed", e);
      setError(e.message || "Failed to link repository");
    } finally {
      setBusy(false);
    }
  };

  // ── Unlink current repo ───────────────────────────────────────────────────

  const unlinkRepo = async () => {
    try {
      const settings = await Storage.getSettings();
      delete settings.github_repo;
      delete settings.github_owner;
      delete settings.gitRepo;
      await Storage.setSettings(settings);
    } catch (_) {}
    setFinalRepo("");
    setFinalOwner("");
    setSelectedOwner(username || "");
    setRepoName(DEFAULT_REPO_NAME);
    setNameCheck(null);
    setStep("choice");
  };

  // ── Owner dropdown shared UI ──────────────────────────────────────────────

  const ownerDropdown = html`
    <div>
      <label class="block text-xs font-medium text-slate-300 mb-2">Owner</label>
      <select
        value=${selectedOwner}
        onChange=${(e) => onOwnerChange(e.target.value)}
        disabled=${busy || orgsLoading}
        class="w-full px-3 py-2 bg-black border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
      >
        <option value=${username || ""}>${username || "—"} (personal)</option>
        ${orgs.map(
          (org) => html`
            <option value=${org.login} key=${org.login}>
              ${org.login} (org)
            </option>
          `,
        )}
      </select>
      ${orgsLoading
        ? html`<p class="text-[10px] text-slate-600 mt-1">
            Loading organizations…
          </p>`
        : ""}
    </div>
  `;

  // ── Repo name check indicator ─────────────────────────────────────────────

  const cleanPreview = sanitize(repoName);
  const namePreview =
    cleanPreview && cleanPreview !== repoName
      ? html`<p class="text-[10px] text-slate-400 mt-1">
          Will be created as:
          <span class="text-cyan-400 font-mono">${cleanPreview}</span>
        </p>`
      : "";

  const nameCheckBadge =
    nameCheck === "checking"
      ? html`<span class="text-[10px] text-slate-500"
          >Checking availability…</span
        >`
      : nameCheck === "available"
        ? html`<span class="text-[10px] text-emerald-400">✓ Available</span>`
        : nameCheck === "taken"
          ? html`<span class="text-[10px] text-rose-400"
              >✗ Already exists under ${selectedOwner}</span
            >`
          : "";

  // ── Step labels ───────────────────────────────────────────────────────────

  const stepLabel =
    {
      check: "",
      already: "",
      choice: "Step 1 of 2",
      new: "Step 2 of 2",
      existing: "Step 2 of 2",
      done: "Setup complete",
    }[step] || "";
  const stepTitle =
    {
      check: "Loading…",
      already: "Repository Connected",
      choice: "Set Up GitHub",
      new: "Create Repository",
      existing: "Link Existing Repository",
      done: "All Set! 🎉",
    }[step] || "";
  const canClose = !busy && step !== "check";

  // ── Render ────────────────────────────────────────────────────────────────

  return html`
    ${importData
      ? html`
          <${ConflictResolutionModal}
            conflicts=${importData.conflicts}
            remoteOnly=${importData.remoteOnly}
            providerName="GitHub"
            onResolve=${async (resolved) => {
              setBusy(true);
              await applyImport(resolved);
              setImportData(null);
              setProgress("Import complete!");
              setStep("done");
              triggerPostLinkSync();
              setBusy(false);
            }}
            onCancel=${() => {
              setImportData(null);
              setStep("done");
            }}
          />
        `
      : ""}

    <!-- Backdrop: no onClick close — modal must be dismissed explicitly -->
    <div
      class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    >
      <div
        class="bg-[#0a0a0f] border border-cyan-500/20 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col"
      >
        <!-- Header -->
        <div
          class="px-8 py-6 border-b border-white/5 flex items-center justify-between shrink-0"
        >
          <div>
            <h2 class="text-xl font-bold text-white">${stepTitle}</h2>
            ${stepLabel
              ? html`<p class="text-xs text-slate-500 mt-1">${stepLabel}</p>`
              : ""}
          </div>
          ${canClose
            ? html`
                <button
                  onClick=${onComplete}
                  class="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-500 hover:text-slate-300"
                  title="Close"
                >
                  ✕
                </button>
              `
            : ""}
        </div>

        <!-- Body (scrollable) -->
        <div class="px-8 py-8 overflow-y-auto">
          <!-- Token expired banner -->
          ${tokenExpired
            ? html`
                <div
                  class="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-3"
                >
                  <div class="flex items-start gap-2">
                    <span class="text-rose-400 shrink-0">⚠</span>
                    <div>
                      <p class="text-sm font-medium text-rose-300">
                        GitHub token expired or revoked
                      </p>
                      <p class="text-xs text-rose-400/70 mt-0.5">
                        Your saved token is no longer valid. Please reconnect
                        your GitHub account to continue.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick=${() => {
                      const authUrl =
                        CONSTANTS.URLS.AUTH_WORKER + "/auth/github";
                      window.open(authUrl, "OAuth", "width=600,height=700");
                    }}
                    class="w-full px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-sm rounded-lg transition-colors"
                  >
                    Reconnect GitHub →
                  </button>
                </div>
              `
            : ""}

          <!-- check -->
          ${step === "check"
            ? html`
                <div class="flex items-center justify-center py-8">
                  <div
                    class="w-8 h-8 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 animate-spin"
                  ></div>
                </div>
              `
            : ""}

          <!-- already -->
          ${step === "already"
            ? html`
                <div class="space-y-5 text-center">
                  <div class="text-4xl">✅</div>
                  <div>
                    <h3 class="text-base font-semibold text-white">
                      Repository configured
                    </h3>
                    <div
                      class="mt-3 p-3 rounded-xl bg-white/5 border border-white/8 text-left"
                    >
                      <p
                        class="text-[10px] text-slate-500 uppercase tracking-wider mb-1"
                      >
                        Connected repository
                      </p>
                      <p class="text-sm font-mono text-cyan-300">
                        ${finalOwner || username}/${finalRepo}
                      </p>
                    </div>
                  </div>
                  <div class="flex flex-col gap-2 pt-1">
                    <button
                      onClick=${onComplete}
                      class="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Continue
                    </button>
                    <button
                      onClick=${() => {
                        setStep("choice");
                        setError("");
                      }}
                      class="w-full px-4 py-2 border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm font-medium transition-colors"
                    >
                      Switch to a different repository
                    </button>
                    <button
                      onClick=${unlinkRepo}
                      class="w-full px-4 py-2 border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 rounded-lg text-sm font-medium transition-colors"
                    >
                      Unlink repository
                    </button>
                  </div>
                </div>
              `
            : ""}

          <!-- choice -->
          ${step === "choice"
            ? html`
                <div class="space-y-4">
                  <p class="text-sm text-slate-400 mb-6">
                    Welcome,
                    <span class="text-emerald-400 font-medium">${username}</span
                    >! Choose how to set up your CodeLedger repository.
                  </p>

                  <button
                    onClick=${() => {
                      setRepoName(DEFAULT_REPO_NAME);
                      setNameCheck(null);
                      scheduleNameCheck(
                        DEFAULT_REPO_NAME,
                        selectedOwner || username,
                      );
                      setStep("new");
                    }}
                    class="w-full p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 transition-colors text-left group"
                  >
                    <div class="flex items-start justify-between">
                      <div>
                        <h3
                          class="font-semibold text-white group-hover:text-cyan-300 transition-colors"
                        >
                          ✨ Create New Repository
                        </h3>
                        <p class="text-xs text-slate-400 mt-1">
                          Fresh repo with CodeLedger structure and GitHub Pages
                        </p>
                      </div>
                      <span
                        class="text-slate-500 group-hover:text-cyan-400 transition-colors mt-0.5"
                        >→</span
                      >
                    </div>
                  </button>

                  <button
                    onClick=${() => {
                      setStep("existing");
                      loadUserRepos(selectedOwner || username);
                    }}
                    class="w-full p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-left group"
                  >
                    <div class="flex items-start justify-between">
                      <div>
                        <h3
                          class="font-semibold text-white group-hover:text-slate-200 transition-colors"
                        >
                          🔗 Link Existing Repository
                        </h3>
                        <p class="text-xs text-slate-400 mt-1">
                          Connect an empty or existing CodeLedger repo
                        </p>
                      </div>
                      <span
                        class="text-slate-500 group-hover:text-slate-300 transition-colors mt-0.5"
                        >→</span
                      >
                    </div>
                  </button>
                </div>
              `
            : ""}

          <!-- new -->
          ${step === "new"
            ? html`
                <div class="space-y-4">
                  ${ownerDropdown}

                  <div>
                    <label
                      class="block text-xs font-medium text-slate-300 mb-2"
                    >
                      Repository Name
                    </label>
                    <input
                      type="text"
                      value=${repoName}
                      onInput=${onRepoNameInput}
                      disabled=${busy}
                      class="w-full px-3 py-2 bg-black border ${nameCheck ===
                      "taken"
                        ? "border-rose-500/50"
                        : nameCheck === "available"
                          ? "border-emerald-500/50"
                          : "border-white/10"} rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none disabled:opacity-50"
                      placeholder=${DEFAULT_REPO_NAME}
                      spellcheck="false"
                      autocomplete="off"
                    />
                    <div
                      class="flex items-center justify-between mt-1 min-h-[16px]"
                    >
                      ${namePreview} ${nameCheckBadge}
                    </div>
                    <p class="text-[10px] text-slate-600 mt-0.5">
                      Letters, numbers, hyphens only. Spaces are replaced with
                      hyphens.
                    </p>
                  </div>

                  ${error
                    ? html`<div
                        class="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs whitespace-pre-wrap"
                      >
                        ${error}
                      </div>`
                    : ""}
                  ${progress && !error
                    ? html`
                        <div
                          class="flex items-center gap-2 text-xs text-cyan-400"
                        >
                          <div
                            class="w-3 h-3 rounded-full border border-cyan-500/50 border-t-cyan-500 animate-spin shrink-0"
                          ></div>
                          ${progress}
                        </div>
                      `
                    : ""}

                  <div class="flex gap-3 pt-2">
                    <button
                      onClick=${() => {
                        setStep("choice");
                        setError("");
                        setNameCheck(null);
                      }}
                      disabled=${busy}
                      class="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      onClick=${createNewRepo}
                      disabled=${busy ||
                      !sanitize(repoName) ||
                      nameCheck === "taken" ||
                      nameCheck === "checking"}
                      class="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      ${busy ? "Creating…" : "Create Repository"}
                    </button>
                  </div>
                </div>
              `
            : ""}

          <!-- existing -->
          ${step === "existing"
            ? html`
                <div class="space-y-4">
                  <p class="text-xs text-slate-400">
                    Select a repository to connect. It must be empty or already
                    contain CodeLedger's
                    <code class="text-cyan-400">index.json</code>.
                  </p>

                  ${ownerDropdown}
                  ${reposLoading
                    ? html`
                        <div
                          class="flex items-center gap-2 text-xs text-slate-400 py-4"
                        >
                          <div
                            class="w-4 h-4 rounded-full border border-slate-600 border-t-slate-300 animate-spin"
                          ></div>
                          Loading repositories…
                        </div>
                      `
                    : html`
                        <div>
                          <label
                            class="block text-xs font-medium text-slate-300 mb-2"
                            >Repository</label
                          >
                          ${userRepos.length === 0
                            ? html`<p class="text-xs text-slate-500">
                                No repositories found for
                                <span class="text-slate-300"
                                  >${selectedOwner}</span
                                >.
                              </p>`
                            : html`
                                <select
                                  value=${selectedRepo}
                                  onChange=${(e) =>
                                    setSelectedRepo(e.target.value)}
                                  disabled=${busy}
                                  class="w-full px-3 py-2 bg-black border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
                                >
                                  ${userRepos.map(
                                    (r) => html`
                                      <option value=${r.name} key=${r.name}>
                                        ${r.name}${r.private ? " 🔒" : ""}
                                      </option>
                                    `,
                                  )}
                                </select>
                                ${selectedRepo
                                  ? html`<p
                                      class="text-[10px] text-slate-500 mt-1 font-mono"
                                    >
                                      ${selectedOwner}/${selectedRepo}
                                    </p>`
                                  : ""}
                              `}
                        </div>
                      `}
                  ${error
                    ? html`<div
                        class="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs whitespace-pre-wrap"
                      >
                        ${error}
                      </div>`
                    : ""}
                  ${progress && !error
                    ? html`
                        <div
                          class="flex items-center gap-2 text-xs text-cyan-400"
                        >
                          <div
                            class="w-3 h-3 rounded-full border border-cyan-500/50 border-t-cyan-500 animate-spin shrink-0"
                          ></div>
                          ${progress}
                        </div>
                      `
                    : ""}

                  <div class="flex gap-3 pt-2">
                    <button
                      onClick=${() => {
                        setStep("choice");
                        setError("");
                      }}
                      disabled=${busy}
                      class="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      onClick=${linkExistingRepo}
                      disabled=${busy || !selectedRepo || reposLoading}
                      class="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      ${busy ? "Linking…" : "Link Repository"}
                    </button>
                  </div>
                </div>
              `
            : ""}

          <!-- done -->
          ${step === "done"
            ? html`
                <div class="space-y-4 text-center">
                  <div class="text-5xl">
                    ${postSyncState === "error"
                      ? "⚠️"
                      : postSyncState?.phase === "syncing"
                        ? "⏳"
                        : "✅"}
                  </div>
                  <div>
                    <h3 class="text-base font-semibold text-white">
                      GitHub Setup Complete!
                    </h3>
                    <p class="text-sm text-slate-400 mt-2">
                      Every accepted solution will be automatically committed.
                    </p>
                  </div>
                  <div
                    class="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20"
                  >
                    <p class="text-xs text-slate-400 mb-1">Repository</p>
                    <p class="text-sm font-mono text-cyan-300">
                      ${finalOwner || username}/${finalRepo}
                    </p>
                    <a
                      href="https://github.com/${finalOwner ||
                      username}/${finalRepo}"
                      target="_blank"
                      rel="noreferrer"
                      class="text-[11px] text-cyan-500 hover:text-cyan-300 underline mt-1 inline-block"
                    >
                      View on GitHub ↗
                    </a>
                  </div>
                  ${postSyncState?.phase === "syncing"
                    ? html`
                        <div class="space-y-2">
                          <div
                            class="flex items-center justify-between text-xs text-cyan-400"
                          >
                            <span class="flex items-center gap-1.5">
                              <div
                                class="w-2.5 h-2.5 rounded-full border border-cyan-500/50 border-t-cyan-500 animate-spin shrink-0"
                              ></div>
                              Syncing solutions to GitHub…
                            </span>
                            ${postSyncState.total > 0
                              ? html`<span class="text-slate-400"
                                  >${postSyncState.current}/${postSyncState.total}</span
                                >`
                              : ""}
                          </div>
                          ${postSyncState.total > 0
                            ? html`
                                <div
                                  class="h-1.5 rounded-full bg-slate-700/60 overflow-hidden"
                                >
                                  <div
                                    class="h-full rounded-full bg-cyan-500 transition-all duration-300"
                                    style="width:${Math.round(
                                      (postSyncState.current /
                                        postSyncState.total) *
                                        100,
                                    )}%"
                                  ></div>
                                </div>
                              `
                            : ""}
                          <p class="text-[11px] text-slate-500">
                            You can close this — sync continues in the
                            background.
                          </p>
                        </div>
                      `
                    : postSyncState && typeof postSyncState === "object"
                      ? html`
                          <p class="text-xs text-emerald-400">
                            ✓
                            ${postSyncState.committed > 0
                              ? `Synced ${postSyncState.committed} solution${postSyncState.committed !== 1 ? "s" : ""} to GitHub`
                              : "Repository is already up to date"}
                          </p>
                        `
                      : postSyncState === "error"
                        ? html`<p class="text-xs text-amber-400">
                            Could not auto-sync — use the Sync button in Git
                            settings.
                          </p>`
                        : ""}
                  <button
                    onClick=${onComplete}
                    class="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors mt-2"
                  >
                    Start Coding 🚀
                  </button>
                </div>
              `
            : ""}
        </div>
      </div>
    </div>
  `;
}

// ── Repository initialisation helpers ────────────────────────────────────────

async function initializeRepository(owner, repo, token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github.v3+json",
  };

  const ghFetch = async (path, opts = {}) => {
    const url = path.startsWith("http")
      ? path
      : `https://api.github.com${path}`;
    const res = await fetch(url, {
      ...opts,
      headers: { ...headers, ...(opts.headers || {}) },
    });
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
      let ref;
      try {
        ref = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/main`);
      } catch (_) {
        ref = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/master`);
      }
      latestSha = ref.object.sha;
      const commit = await ghFetch(
        `/repos/${owner}/${repo}/git/commits/${latestSha}`,
      );
      baseTreeSha = commit.tree.sha;
      break;
    } catch (_) {
      if (attempt === 5)
        throw new Error("Repository branch not ready. Please try again.");
      await new Promise((r) => setTimeout(r, 2000));
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

  const treeRes = await ghFetch(`/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [
        {
          path: "index.json",
          mode: "100644",
          type: "blob",
          content: JSON.stringify(indexJson, null, 2),
        },
        {
          path: "index.html",
          mode: "100644",
          type: "blob",
          content: getPagesHtml(),
        },
        {
          path: ".gitignore",
          mode: "100644",
          type: "blob",
          content: "node_modules/\n.env\n*.log\n.DS_Store\n",
        },
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

  for (const branch of ["main", "master"]) {
    try {
      await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commitRes.sha, force: false }),
      });
      break;
    } catch (_) {
      /* try next */
    }
  }
}

async function configureRepositoryPresentation(owner, repo, token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      has_wiki: false,
      has_projects: false,
      has_discussions: false,
      allow_merge_commit: false,
      allow_rebase_merge: true,
      allow_squash_merge: true,
      delete_branch_on_merge: true,
    }),
  });

  await fetch(`https://api.github.com/repos/${owner}/${repo}/topics`, {
    method: "PUT",
    headers: {
      ...headers,
      Accept: "application/vnd.github.mercy-preview+json",
    },
    body: JSON.stringify({ names: DEFAULT_REPO_TOPICS }),
  });
}

async function enableGitHubPages(owner, repo, token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // Enable Pages (may already be enabled — ignore errors)
  try {
    await fetch(`https://api.github.com/repos/${owner}/${repo}/pages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ source: { branch: "main", path: "/" } }),
    });
  } catch (_) {}

  // Give GitHub a moment to provision the Pages site
  await new Promise((r) => setTimeout(r, 1500));

  // Fetch the actual Pages URL and set it as the repo homepage
  try {
    const pagesRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pages`,
      { headers },
    );
    const pagesData = pagesRes.ok ? await pagesRes.json() : null;
    const pagesUrl =
      pagesData?.html_url || `https://${owner}.github.io/${repo}/`;

    // Save Pages URL to settings so infra-builder uses the real URL
    const settings = await Storage.getSettings();
    await Storage.setSettings({ ...settings, github_pages_url: pagesUrl });

    // Set it as the repo website/homepage on GitHub
    await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ homepage: pagesUrl }),
    });
  } catch (_) {
    // Non-fatal — Pages URL can be set manually
  }
}
