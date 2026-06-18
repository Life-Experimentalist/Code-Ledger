/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect, useRef } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { createDebugger } from "../../lib/debug.js";

const dbg = createDebugger("PanelGit");

import { Storage } from "../../core/storage.js";
import { CONSTANTS } from "../../core/constants.js";
import { registry } from "../../core/handler-registry.js";
import { importFromRepo, applyImport } from "../../background/sync-engine.js";
import { ConflictResolutionModal } from "../components/ConflictResolutionModal.js";

const DEFAULT_COMMIT_TPL = CONSTANTS.COMMIT_MESSAGE_TEMPLATE;
const GIT_PROVIDERS = Object.values(CONSTANTS.GIT_PROVIDERS || {});
const STATUS_META = CONSTANTS.FEATURE_STATUS_META;

export function PanelGit({ settings, onSettingsChange, onSetupRepo, onConnect }) {
  const [oauthToken, setOauthToken] = useState("");
  const [msg, setMsg] = useState({ text: "", ok: true });
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [refreshInfraBusy, setRefreshInfraBusy] = useState(false);
  const syncPortRef = useRef(null);
  const [syncCount, setSyncCount] = useState(null);
  const [syncNeedsPush, setSyncNeedsPush] = useState(false);
  const [importData, setImportData] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  // Settings sync state
  const [settingsSyncBusy, setSettingsSyncBusy] = useState(false);
  const [settingsSyncMsg, setSettingsSyncMsg] = useState({
    text: "",
    ok: true,
  });

  // Mirror repos state
  const [showAddMirror, setShowAddMirror] = useState(false);
  const [mirrorProvider, setMirrorProvider] = useState("github");
  const [mirrorOwner, setMirrorOwner] = useState("");
  const [mirrorRepo, setMirrorRepo] = useState("");
  const [mirrorCheckState, setMirrorCheckState] = useState(null); // null|checking|ok|err
  const mirrorCheckTimer = useRef(null);
  const didAutoImportRef = useRef(false);

  // Auto-detected CodeLedger repo suggestion
  const [detectedRepo, setDetectedRepo] = useState(null); // { owner, repo } | null
  const [detectedDismissed, setDetectedDismissed] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchToken = () =>
      Storage.getAuthToken("github")
        .then((t) => { if (mounted) setOauthToken(t || ""); })
        .catch(() => {});

    fetchToken();
    loadSyncCount();

    // React immediately when auth token is written from the OAuth popup relay.
    // The first useEffect dep [settings] won't catch auth.tokens changes since
    // settings and auth tokens live in separate storage keys.
    const onChanged = (changes) => {
      if (changes[CONSTANTS.SK.AUTH_TOKENS]) fetchToken();
    };
    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(onChanged);
    }
    return () => {
      mounted = false;
      if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(onChanged);
      }
    };
  }, [settings]);

  // Auto-detect a CodeLedger-managed repo when token exists but none is configured
  useEffect(() => {
    const currentRepo = settings?.github_repo || settings?.gitRepo || "";
    if (currentRepo || detectedDismissed) return;
    Storage.getAuthToken("github")
      .then((token) => {
        if (!token) return;
        fetch("https://api.github.com/user/repos?type=all&per_page=100&sort=updated", {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
          },
        })
          .then((r) => r.json())
          .then((repos) => {
            if (!Array.isArray(repos)) return;
            const found = repos.find(
              (r) => Array.isArray(r.topics) && r.topics.includes("code-ledger"),
            );
            if (found)
              setDetectedRepo({
                owner: found.owner?.login || found.full_name.split("/")[0],
                repo: found.name,
              });
          })
          .catch(() => {});
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.github_repo, settings?.gitRepo, detectedDismissed]);

  useEffect(() => {
    if (!window.chrome?.runtime?.onMessage) return;
    const onReauth = (msg) => {
      if (msg?.type === "GITHUB_REAUTH_REQUIRED") setOauthToken("");
    };
    chrome.runtime.onMessage.addListener(onReauth);
    return () => chrome.runtime.onMessage.removeListener(onReauth);
  }, []);

  const loadSyncCount = () => {
    if (typeof chrome === "undefined" || !chrome.runtime?.id) return;
    chrome.runtime.sendMessage({ type: "RESYNC_COUNT" }, (resp) => {
      if (chrome.runtime.lastError) return;
      if (resp?.count !== undefined) setSyncCount(resp.count);
    });
  };

  const flash = (text, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg({ text: "", ok: true }), 3000);
  };

  const githubUser = settings?.github_username || settings?.gitUser || "";
  const repoName = settings?.github_repo || settings?.gitRepo || "";
  const repoOwner = settings?.github_owner || githubUser || "";
  const commitTpl = settings?.commitMessageTemplate || DEFAULT_COMMIT_TPL;
  const gitEnabled = settings?.gitEnabled !== false;
  const gitProvider = settings?.gitProvider || "github";
  const activeProvider = CONSTANTS.GIT_PROVIDERS?.[gitProvider] || null;
  const effectiveToken = oauthToken || "";

  const handleConnect = () => {
    const authUrl = `${CONSTANTS.URLS.AUTH_WORKER}/auth/github`;
    const popup = window.open(authUrl, "OAuth", "width=600,height=700");
    if (!popup) alert("Please allow popups for this page to connect GitHub.");
    // library.js handleOAuthMessage picks up the CODELEDGER_AUTH response,
    // saves the token, and shows the repo onboarding wizard automatically.
  };

  const unlinkGitHub = async () => {
    if (
      !confirm("Unlink GitHub account? This removes the OAuth token but keeps your repo settings.")
    )
      return;
    try {
      const all = await Storage.getSettings();
      await Storage.setSettings({
        ...all,
        github_username: "",
        github_owner: "",
      });
      await Storage.setAuthToken("github", "");
      setOauthToken("");
      flash("GitHub unlinked");
    } catch (e) {
      flash("Error: " + e.message, false);
    }
  };

  const handleSync = async (mode = "bulk") => {
    if (activeProvider?.status && activeProvider.status !== CONSTANTS.FEATURE_STATUS.STABLE) {
      return flash(
        `${STATUS_META[activeProvider.status]?.label || "This provider"} is under construction.`,
        false,
      );
    }
    if (!gitEnabled) return flash("Git commits are disabled — enable them first.", false);
    setSyncBusy(true);
    setSyncProgress(null);

    // Open a keepalive port to prevent the service worker from being
    // terminated mid-sync. Also receives progress updates from the SW.
    let keepalivePort = null;
    if (typeof chrome !== "undefined" && chrome.runtime?.id) {
      try {
        keepalivePort = chrome.runtime.connect({
          name: "sync-keepalive",
        });
        syncPortRef.current = keepalivePort;
        keepalivePort.onMessage.addListener((msg) => {
          if (msg?.type === "sync-progress") {
            setSyncProgress({
              current: msg.current,
              total: msg.total,
            });
          }
        });
        keepalivePort.onDisconnect.addListener(() => {
          syncPortRef.current = null;
        });
      } catch (_) {}
    }

    try {
      const git = registry.getGitProvider(settings.gitProvider || "github");
      if (!git) throw new Error("Git provider not available. Try reloading.");
      const token = await git.getToken();
      if (!token) throw new Error("GitHub authentication is missing.");
      let owner = settings.github_owner || settings.github_username || "";
      if (!owner) {
        const userRes = await git.getCurrentUser();
        owner = userRes.login;
      }
      const repo = settings.github_repo || settings.gitRepo || "";
      const { remoteOnly, conflicts } = await importFromRepo(owner, repo, git);

      if (conflicts.length > 0) {
        setSyncNeedsPush(true);
        setImportData({ remoteOnly, conflicts });
        flash(
          `Sync paused — ${conflicts.length} conflict${conflicts.length !== 1 ? "s" : ""} need review.`,
          false,
        );
        return;
      }

      if (remoteOnly.length > 0) {
        await applyImport(remoteOnly);
      }

      await new Promise((resolve, reject) => {
        if (typeof chrome === "undefined" || !chrome.runtime?.id) {
          reject(new Error("Extension not available"));
          return;
        }
        chrome.runtime.sendMessage({ type: "RESYNC_ALL", mode }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (resp?.ok) resolve(resp);
          else reject(new Error(resp?.error || "Sync failed"));
        });
      });
      flash("Sync complete — local library and repository are aligned.");
      loadSyncCount();
    } catch (e) {
      flash("Sync failed: " + e.message, false);
    } finally {
      setSyncBusy(false);
      setSyncProgress(null);
      try {
        keepalivePort?.disconnect();
      } catch (_) {}
      syncPortRef.current = null;
    }
  };

  const handleBackup = async () => {
    if (!gitEnabled) return flash("Git commits are disabled.", false);
    setBackupBusy(true);
    let keepalivePort = null;
    if (typeof chrome !== "undefined" && chrome.runtime?.id) {
      try {
        keepalivePort = chrome.runtime.connect({
          name: "backup-keepalive",
        });
      } catch (_) {}
    }
    try {
      await new Promise((resolve, reject) => {
        if (typeof chrome === "undefined" || !chrome.runtime?.id) {
          reject(new Error("Extension not available"));
          return;
        }
        chrome.runtime.sendMessage({ type: "BACKUP_TO_REPO" }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (resp?.ok) resolve(resp);
          else reject(new Error(resp?.error || "Backup failed"));
        });
      });
      flash("Backup committed to repository.");
    } catch (e) {
      flash("Backup failed: " + e.message, false);
    } finally {
      setBackupBusy(false);
      try {
        keepalivePort?.disconnect();
      } catch (_) {}
    }
  };

  const handleRefreshStats = async () => {
    if (!gitEnabled) return flash("Git commits are disabled.", false);
    setRefreshInfraBusy(true);
    try {
      await new Promise((resolve, reject) => {
        if (typeof chrome === "undefined" || !chrome.runtime?.id) {
          reject(new Error("Extension not available"));
          return;
        }
        chrome.runtime.sendMessage({ type: "REFRESH_INFRA" }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (resp?.ok) resolve(resp);
          else reject(new Error(resp?.error || "Refresh failed"));
        });
      });
      flash("README stats refreshed in repository.");
    } catch (e) {
      flash("Stats refresh failed: " + e.message, false);
    } finally {
      setRefreshInfraBusy(false);
    }
  };

  const flashSettingsSync = (text, ok = true) => {
    setSettingsSyncMsg({ text, ok });
    setTimeout(() => setSettingsSyncMsg({ text: "", ok: true }), 3500);
  };

  const handleSettingsPush = async () => {
    setSettingsSyncBusy(true);
    try {
      await new Promise((resolve, reject) => {
        if (typeof chrome === "undefined" || !chrome.runtime?.id) {
          reject(new Error("Extension not available"));
          return;
        }
        chrome.runtime.sendMessage({ type: "SYNC_SETTINGS_TO_GITHUB" }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (resp?.ok) resolve(resp);
          else reject(new Error(resp?.error || "Push failed"));
        });
      });
      flashSettingsSync("Settings pushed to GitHub");
    } catch (e) {
      flashSettingsSync("Push failed: " + e.message, false);
    } finally {
      setSettingsSyncBusy(false);
    }
  };

  const handleSettingsPull = async () => {
    setSettingsSyncBusy(true);
    try {
      const resp = await new Promise((resolve, reject) => {
        if (typeof chrome === "undefined" || !chrome.runtime?.id) {
          reject(new Error("Extension not available"));
          return;
        }
        chrome.runtime.sendMessage({ type: "SYNC_SETTINGS_FROM_GITHUB" }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (resp?.ok) resolve(resp);
          else reject(new Error(resp?.error || "Pull failed"));
        });
      });
      flashSettingsSync(resp?.message || "Settings pulled from GitHub");
    } catch (e) {
      flashSettingsSync("Pull failed: " + e.message, false);
    } finally {
      setSettingsSyncBusy(false);
    }
  };

  const handleImport = async () => {
    if (activeProvider?.status && activeProvider.status !== CONSTANTS.FEATURE_STATUS.STABLE) {
      setImportMsg(
        `${STATUS_META[activeProvider.status]?.label || "This provider"} is under construction.`,
      );
      return;
    }
    setImporting(true);
    setImportMsg("");
    setSyncNeedsPush(false);
    try {
      const git = registry.getGitProvider(settings.gitProvider || "github");
      if (!git) {
        setImportMsg("Git provider not available. Try reloading.");
        setImporting(false);
        return;
      }
      await git.getToken();
      let owner = settings.github_owner || settings.github_username || "";
      if (!owner) {
        const userRes = await git.getCurrentUser();
        owner = userRes.login;
      }
      const repo = settings.github_repo || settings.gitRepo || "";
      const { remoteOnly, conflicts } = await importFromRepo(owner, repo, git);

      if (conflicts.length > 0) {
        setImportData({ remoteOnly, conflicts });
      } else {
        await applyImport(remoteOnly);
        const s = await Storage.getSettings();
        await Storage.setSettings({ ...s, _pendingConflicts: 0 });
        loadSyncCount();
        if (remoteOnly.length > 0) {
          setImportMsg(
            `Imported ${remoteOnly.length} new problem${remoteOnly.length !== 1 ? "s" : ""}.`,
          );
        } else {
          setImportMsg("Repository is already in sync — no new problems found.");
        }
      }
    } catch (e) {
      setImportMsg(`Import failed: ${e.message}`);
    } finally {
      setImporting(false);
    }
  };

  // Auto-import when a repo is first linked and local library is empty
  useEffect(() => {
    if (didAutoImportRef.current || !repoName || !oauthToken) return;
    didAutoImportRef.current = true;
    Storage.getAllProblems?.()
      .then((all) => {
        if (!all || all.length === 0) {
          setImportMsg("Repo linked — importing existing solutions from repository…");
          handleImport();
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoName, oauthToken]);

  // ── Mirror helpers ────────────────────────────────────────────────────────

  const mirrors = (
    Array.isArray(settings?.git_mirrors)
      ? settings.git_mirrors
      : // De-duplicate: remove any mirror whose owner/repo matches the main repo
        []
  ).filter((m) => !(repoName && m.repo === repoName && (m.owner || "") === (repoOwner || "")));

  const saveMirrors = (updated) => onSettingsChange("git_mirrors", updated);

  const removeMirror = (idx) => saveMirrors(mirrors.filter((_, i) => i !== idx));

  const toggleMirrorEnabled = (idx) =>
    saveMirrors(mirrors.map((m, i) => (i === idx ? { ...m, enabled: m.enabled === false } : m)));

  const checkMirrorRepo = (owner, repo, provider) => {
    if (mirrorCheckTimer.current) clearTimeout(mirrorCheckTimer.current);
    if (!owner || !repo) {
      setMirrorCheckState(null);
      return;
    }
    setMirrorCheckState("checking");
    mirrorCheckTimer.current = setTimeout(async () => {
      try {
        const tok = oauthToken;
        if (!tok) {
          setMirrorCheckState(null);
          return;
        }
        const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
          headers: {
            Authorization: `Bearer ${tok}`,
            Accept: "application/vnd.github.v3+json",
          },
        });
        setMirrorCheckState(r.ok ? "ok" : "err");
      } catch (_) {
        setMirrorCheckState("err");
      }
    }, 600);
  };

  const addMirror = () => {
    if (!mirrorOwner.trim() || !mirrorRepo.trim()) return;
    // Prevent duplicates
    const key = `${mirrorProvider}:${mirrorOwner.trim()}/${mirrorRepo.trim()}`;
    if (mirrors.some((m) => `${m.provider}:${m.owner}/${m.repo}` === key)) return;
    saveMirrors([
      ...mirrors,
      {
        id: Date.now().toString(36),
        provider: mirrorProvider,
        owner: mirrorOwner.trim(),
        repo: mirrorRepo.trim(),
        enabled: false,
      },
    ]);
    setMirrorOwner("");
    setMirrorRepo("");
    setMirrorCheckState(null);
    setShowAddMirror(false);
  };

  const MIRROR_PROVIDERS = [
    { id: "github", label: "GitHub", ready: true },
    { id: "gitlab", label: "GitLab", ready: false },
    { id: "bitbucket", label: "Bitbucket", ready: false },
  ];

  const repoUrl = repoOwner && repoName ? `https://github.com/${repoOwner}/${repoName}` : "";

  return html`
    <div class="space-y-6 w-full">
      <div>
        <h2 class="text-base font-semibold text-white mb-1">Git Integration</h2>
        <p class="text-xs text-slate-500 mb-4">
          Connect your repository and configure how solutions are committed.
        </p>
      </div>

      <!-- Master enable -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-slate-300">Auto-commit solved problems</p>
            <p class="text-[11px] text-slate-500 mt-0.5">
              When enabled, each accepted solution is automatically committed to your repository.
            </p>
          </div>
          <button
            onClick=${() => onSettingsChange("gitEnabled", !gitEnabled)}
            class="relative ml-4 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
              ${gitEnabled ? "bg-cyan-500/30 border-cyan-500/40" : "bg-white/5 border-white/10"}"
          >
            <span
              class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
              ${gitEnabled ? "translate-x-4" : "translate-x-0.5"}"
            >
            </span>
          </button>
        </div>
      </div>

      <!-- Git provider -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Git Provider</h3>
        <p class="text-[11px] text-slate-500">
          Only GitHub is fully supported right now. GitLab and Bitbucket are marked under
          construction and stay disabled until they are ready.
        </p>
        <div class="flex gap-2">
          ${GIT_PROVIDERS.length
            ? GIT_PROVIDERS.map((gp) => {
                const status = gp.status || CONSTANTS.FEATURE_STATUS.STABLE;
                const statusMeta =
                  STATUS_META[status] || STATUS_META[CONSTANTS.FEATURE_STATUS.STABLE];
                const disabled = status !== CONSTANTS.FEATURE_STATUS.STABLE;
                return html`
                  <button
                    key=${gp.id}
                    onClick=${() => {
                      if (disabled) return;
                      onSettingsChange("gitProvider", gp.id);
                    }}
                    disabled=${disabled}
                    title=${disabled ? statusMeta.label : gp.name}
                    class="flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors disabled:opacity-60
                ${gitProvider === gp.id
                      ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-200"
                      : "bg-white/3 border-white/8 text-slate-400 hover:text-slate-300 hover:bg-white/5"}"
                  >
                    <span class="inline-flex items-center gap-2">
                      <span>${gp.name}</span>
                      ${disabled
                        ? html`<span
                            class=${`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest border rounded ${statusMeta.className}`}
                            >${statusMeta.label}</span
                          >`
                        : ""}
                    </span>
                  </button>
                `;
              })
            : html`<span class="text-xs text-slate-500">GitHub</span>`}
        </div>
      </div>

      <!-- GitHub account -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">GitHub Account</h3>
        ${effectiveToken
          ? html`
              <div class="flex items-center gap-3">
                ${settings?.github_avatar
                  ? html`<img
                      src=${settings.github_avatar}
                      alt=${githubUser}
                      class="w-8 h-8 rounded-full object-cover shrink-0"
                    />`
                  : html`<div
                      class="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-300 text-sm font-bold shrink-0"
                    >
                      ${(githubUser || "?")[0].toUpperCase()}
                    </div>`}

                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-slate-200">${githubUser || "Connected"}</p>
                  <p class="text-[11px] text-slate-500">OAuth connected</p>
                </div>
                <button
                  onClick=${unlinkGitHub}
                  class="shrink-0 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs rounded-lg transition-colors"
                >
                  Unlink
                </button>
              </div>
            `
          : html`
              <p class="text-sm text-slate-400">No GitHub account connected.</p>
              <button
                onClick=${onConnect || handleConnect}
                class="px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-sm rounded-lg transition-colors"
              >
                Connect GitHub →
              </button>
            `}
      </div>

      <!-- Auto-detected repo suggestion -->
      ${detectedRepo && !repoName && !detectedDismissed
        ? html`
            <div
              class="flex items-center gap-3 p-3 rounded-xl bg-cyan-500/8 border border-cyan-500/20"
            >
              <span class="text-cyan-400 text-base leading-none">🔍</span>
              <div class="flex-1 min-w-0">
                <p class="text-sm text-cyan-300 font-medium">CodeLedger repo found</p>
                <p class="text-xs text-cyan-500/80 font-mono truncate">
                  ${detectedRepo.owner}/${detectedRepo.repo}
                </p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  onClick=${() => {
                    onSettingsChange("github_owner", detectedRepo.owner);
                    onSettingsChange("github_repo", detectedRepo.repo);
                    setDetectedRepo(null);
                  }}
                  class="px-3 py-1.5 text-xs font-medium bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-200 rounded-lg transition-colors"
                >
                  Use this
                </button>
                <button
                  onClick=${() => setDetectedDismissed(true)}
                  class="text-slate-600 hover:text-slate-400 text-xs px-1 transition-colors"
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            </div>
          `
        : ""}

      <!-- Repository (read-only — managed via setup wizard) -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Repository</h3>
          ${repoName
            ? html`
                <button
                  onClick=${onSetupRepo}
                  class="text-[11px] text-slate-500 hover:text-cyan-400 transition-colors"
                >
                  Change →
                </button>
              `
            : ""}
        </div>

        ${repoName
          ? html`
              <div class="flex items-center gap-3 p-3 rounded-lg bg-white/3 border border-white/8">
                <div class="flex-1 min-w-0">
                  <p class="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                    Main repository
                  </p>
                  <p class="text-sm font-mono text-cyan-300 truncate">${repoOwner}/${repoName}</p>
                </div>
                ${repoUrl
                  ? html`
                      <a
                        href=${repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="shrink-0 text-slate-500 hover:text-cyan-400 transition-colors"
                        title="View on GitHub"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path
                            d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
                          />
                        </svg>
                      </a>
                    `
                  : ""}
              </div>
            `
          : html`
              <div class="flex flex-col items-start gap-2">
                <p class="text-sm text-slate-500">No repository connected.</p>
                <button
                  onClick=${onSetupRepo}
                  class="px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-sm rounded-lg transition-colors"
                >
                  Set up repository →
                </button>
              </div>
            `}
      </div>

      <!-- Mirror Repositories — only show when main repo exists (mirrors need a primary) OR when adding -->
      <div
        class="${repoName
          ? ""
          : "opacity-50 pointer-events-none"} p-4 rounded-xl border border-white/8 bg-white/2 space-y-3"
        title="${!repoName ? "Set up a main repository first before configuring mirrors" : ""}"
      >
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">
              Mirror Repositories
            </h3>
            <p class="text-[11px] text-slate-600 mt-0.5">
              Optional. Every commit to the main repo is replicated here exactly. Disabled by
              default.
            </p>
          </div>
          ${!showAddMirror
            ? html`
                <button
                  onClick=${() => {
                    setShowAddMirror(true);
                    setMirrorOwner("");
                    setMirrorRepo("");
                    setMirrorCheckState(null);
                  }}
                  disabled=${!effectiveToken}
                  class="text-[11px] px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title=${!effectiveToken ? "Connect GitHub first" : "Add mirror"}
                >
                  + Add
                </button>
              `
            : ""}
        </div>

        ${mirrors.length > 0
          ? html`
              <div class="space-y-2">
                ${mirrors.map(
                  (m, i) => html`
                    <div
                      key=${m.id || i}
                      class="flex items-center gap-2 p-2.5 rounded-lg bg-white/3 border border-white/8"
                    >
                      <span
                        class="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border ${m.provider ===
                        "github"
                          ? "bg-slate-800 border-slate-600 text-slate-300"
                          : m.provider === "gitlab"
                            ? "bg-orange-900/30 border-orange-700/40 text-orange-300"
                            : "bg-blue-900/30 border-blue-700/40 text-blue-300"}"
                      >
                        ${m.provider}
                      </span>
                      <span
                        class="flex-1 min-w-0 font-mono text-xs ${m.enabled === false
                          ? "text-slate-600 line-through"
                          : "text-slate-300"} truncate"
                      >
                        ${m.owner}/${m.repo}
                      </span>
                      <button
                        onClick=${() => toggleMirrorEnabled(i)}
                        title=${m.enabled === false ? "Enable mirror" : "Disable mirror"}
                        class="shrink-0 relative inline-flex h-4 w-7 items-center rounded-full border transition-colors ${m.enabled ===
                        false
                          ? "bg-white/5 border-white/10"
                          : "bg-cyan-500/30 border-cyan-500/40"}"
                      >
                        <span
                          class="inline-block h-2.5 w-2.5 rounded-full bg-white shadow transform transition-transform ${m.enabled ===
                          false
                            ? "translate-x-0.5"
                            : "translate-x-4"}"
                        ></span>
                      </button>
                      <button
                        onClick=${() => removeMirror(i)}
                        class="shrink-0 text-slate-600 hover:text-rose-400 transition-colors text-xs"
                        title="Remove mirror"
                      >
                        ✕
                      </button>
                    </div>
                  `,
                )}
              </div>
            `
          : html`<p class="text-xs text-slate-600">No mirrors configured.</p>`}
        ${showAddMirror
          ? html`
              <div class="space-y-2 p-3 rounded-lg border border-cyan-500/20 bg-cyan-500/3">
                <div class="flex gap-2">
                  ${MIRROR_PROVIDERS.map(
                    (p) => html`
                      <button
                        key=${p.id}
                        onClick=${() => {
                          if (p.ready) {
                            setMirrorProvider(p.id);
                            setMirrorCheckState(null);
                            checkMirrorRepo(mirrorOwner, mirrorRepo, p.id);
                          }
                        }}
                        disabled=${!p.ready}
                        title=${p.ready ? p.label : `${p.label} — coming soon`}
                        class="flex-1 py-1 rounded text-[11px] font-medium border transition-colors ${mirrorProvider ===
                        p.id
                          ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-200"
                          : "bg-white/5 border-white/10 text-slate-500"} disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        ${p.label}${!p.ready
                          ? html`<span class="ml-1 text-[8px] opacity-60">soon</span>`
                          : ""}
                      </button>
                    `,
                  )}
                </div>
                <div class="flex gap-2">
                  <input
                    type="text"
                    value=${mirrorOwner}
                    placeholder="owner / org"
                    onInput=${(e) => {
                      setMirrorOwner(e.target.value);
                      checkMirrorRepo(e.target.value, mirrorRepo, mirrorProvider);
                    }}
                    class="flex-1 px-2.5 py-1.5 bg-black border border-white/10 rounded-lg text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                  />
                  <span class="text-slate-600 self-center">/</span>
                  <input
                    type="text"
                    value=${mirrorRepo}
                    placeholder="repo-name"
                    onInput=${(e) => {
                      setMirrorRepo(e.target.value);
                      checkMirrorRepo(mirrorOwner, e.target.value, mirrorProvider);
                    }}
                    class="flex-1 px-2.5 py-1.5 bg-black border border-white/10 rounded-lg text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                  />
                </div>
                <div class="flex items-center justify-between gap-2">
                  <span
                    class="text-[10px] ${mirrorCheckState === "ok"
                      ? "text-emerald-400"
                      : mirrorCheckState === "err"
                        ? "text-rose-400"
                        : mirrorCheckState === "checking"
                          ? "text-slate-500"
                          : "text-transparent"}"
                  >
                    ${mirrorCheckState === "ok"
                      ? "✓ Repo accessible"
                      : mirrorCheckState === "err"
                        ? "✗ Repo not found or no access"
                        : mirrorCheckState === "checking"
                          ? "Checking…"
                          : "—"}
                  </span>
                  <div class="flex gap-2">
                    <button
                      onClick=${() => {
                        setShowAddMirror(false);
                        setMirrorCheckState(null);
                      }}
                      class="px-3 py-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick=${addMirror}
                      disabled=${!mirrorOwner.trim() ||
                      !mirrorRepo.trim() ||
                      mirrorCheckState === "err"}
                      class="px-3 py-1 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-[11px] rounded-lg transition-colors disabled:opacity-50"
                    >
                      Add Mirror
                    </button>
                  </div>
                </div>
              </div>
            `
          : ""}
      </div>

      <!-- Sync -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Sync</h3>
        <p class="text-[11px] text-slate-500">
          Pulls any new problems from the repository into the local library, then pushes all
          unsynced local solutions — one commit per problem, backdated to the original solve time.
          ${syncCount !== null && syncCount > 0
            ? html`<span class="text-amber-400">
                ${syncCount} problem${syncCount !== 1 ? "s" : ""} pending.</span
              >`
            : ""}
        </p>
        ${syncProgress
          ? html`<div class="flex items-center gap-2">
              <div class="flex-1 h-1 rounded-full bg-white/8 overflow-hidden">
                <div
                  class="h-full bg-cyan-500 transition-all duration-300 rounded-full"
                  style="width: ${Math.round((syncProgress.current / syncProgress.total) * 100)}%"
                ></div>
              </div>
              <span class="text-[11px] text-slate-400 tabular-nums shrink-0">
                ${syncProgress.current}/${syncProgress.total}
              </span>
            </div>`
          : ""}
        <div class="flex gap-2 flex-wrap">
          <button
            onClick=${() => handleSync("individual")}
            disabled=${syncBusy ||
            !gitEnabled ||
            activeProvider?.status !== CONSTANTS.FEATURE_STATUS.STABLE}
            class="px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors disabled:opacity-50"
          >
            ${syncBusy && syncProgress
              ? `Committing ${syncProgress.current}/${syncProgress.total}…`
              : syncBusy
                ? "Syncing…"
                : "Sync to GitHub"}
          </button>
          <button
            onClick=${handleBackup}
            disabled=${backupBusy ||
            !gitEnabled ||
            activeProvider?.status !== CONSTANTS.FEATURE_STATUS.STABLE}
            class="px-4 py-2 bg-white/5 hover:bg-white/8 border border-white/10 text-slate-400 hover:text-slate-300 text-xs rounded-lg transition-colors disabled:opacity-50"
            title="Commit a settings and config snapshot to your repository"
          >
            ${backupBusy ? "Backing up…" : "Backup Config"}
          </button>
          <button
            onClick=${handleRefreshStats}
            disabled=${refreshInfraBusy ||
            !gitEnabled ||
            activeProvider?.status !== CONSTANTS.FEATURE_STATUS.STABLE}
            class="px-4 py-2 bg-white/5 hover:bg-white/8 border border-white/10 text-slate-400 hover:text-slate-300 text-xs rounded-lg transition-colors disabled:opacity-50"
            title="Rebuild README stats, index.json, and GitHub Pages from your current local data"
          >
            ${refreshInfraBusy ? "Refreshing…" : "Refresh README Stats"}
          </button>
        </div>
        ${activeProvider?.status && activeProvider.status !== CONSTANTS.FEATURE_STATUS.STABLE
          ? html`<p class="text-[11px] text-amber-400">
              ${STATUS_META[activeProvider.status]?.label || "This provider"} is not ready yet.
            </p>`
          : ""}
        ${msg.text &&
        html`<p class="text-xs ${msg.ok ? "text-emerald-400" : "text-rose-400"}">${msg.text}</p>`}
      </div>

      <!-- Commit message template -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">
          Commit Message Template
        </h3>
        <p class="text-[11px] text-slate-500">
          Variables: <code class="text-slate-400">{topic}</code>
          <code class="text-slate-400">{title}</code>
          <code class="text-slate-400">{difficulty}</code>
          <code class="text-slate-400">{language}</code>
          <code class="text-slate-400">{platform}</code>
        </p>
        <div class="flex gap-2">
          <input
            type="text"
            value=${commitTpl}
            onInput=${(e) => onSettingsChange("commitMessageTemplate", e.target.value)}
            class="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-300 font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
          />
          <button
            onClick=${() => onSettingsChange("commitMessageTemplate", DEFAULT_COMMIT_TPL)}
            class="px-3 py-1.5 text-slate-500 hover:text-slate-300 text-xs transition-colors"
          >
            Reset
          </button>
        </div>
      </div>
      ${settings._pendingConflicts > 0
        ? html`
            <div
              class="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20"
            >
              <span class="text-amber-400 text-base leading-none mt-0.5">⚠</span>
              <div class="flex-1 min-w-0">
                <p class="text-sm text-amber-300 font-medium">
                  ${settings._pendingConflicts}
                  ${" conflict"}${settings._pendingConflicts !== 1 ? "s" : ""} detected during
                  background sync.
                </p>
                ${!repoName
                  ? html`<p class="text-xs text-amber-500/80 mt-0.5">
                      Set up a repository below to resolve conflicts.
                    </p>`
                  : importing
                    ? html`<p class="text-xs text-amber-400/70 mt-0.5 flex items-center gap-1.5">
                        <span
                          class="inline-block w-3 h-3 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin"
                        ></span>
                        Fetching conflicts from repository…
                      </p>`
                    : importMsg && !importData
                      ? html`<p class="text-xs text-rose-400 mt-0.5">${importMsg}</p>`
                      : html`<button
                          onClick=${handleImport}
                          class="text-xs text-amber-300 underline hover:no-underline mt-0.5"
                        >
                          Resolve now →
                        </button>`}
              </div>
            </div>
          `
        : ""}
      ${repoName
        ? html`
            <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
              <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Import</h3>
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-slate-200">Import from repository</p>
                  <p class="text-xs text-slate-500">
                    Pull all problems from your connected repo into the local library.
                  </p>
                </div>
                <button
                  onClick=${handleImport}
                  disabled=${importing}
                  class="px-4 py-2 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors disabled:opacity-50"
                >
                  ${importing ? "Importing…" : "Import"}
                </button>
              </div>
              ${importMsg ? html`<p class="text-xs text-cyan-400">${importMsg}</p>` : ""}
            </div>
          `
        : ""}
      ${importData
        ? html`
            <${ConflictResolutionModal}
              conflicts=${importData.conflicts}
              remoteOnly=${importData.remoteOnly}
              providerName="GitHub"
              onResolve=${async (resolved) => {
                // Stamp with _conflictResolvedAt so importFromRepo won't re-flag these
                // until RESYNC_ALL successfully pushes them to GitHub.
                await applyImport(resolved, { fromConflictResolution: true });
                setImportData(null);
                setSyncNeedsPush(false);
                const s = await Storage.getSettings();
                await Storage.setSettings({ ...s, _pendingConflicts: 0 });
                onSettingsChange?.("_pendingConflicts", 0);
                setSyncBusy(true);
                setImportMsg(
                  `Pushing ${resolved.length} resolved problem${resolved.length !== 1 ? "s" : ""} to repo…`,
                );
                try {
                  await new Promise((resolve, reject) => {
                    if (typeof chrome === "undefined" || !chrome.runtime?.id) {
                      reject(new Error("Extension not available"));
                      return;
                    }
                    chrome.runtime.sendMessage({ type: "RESYNC_ALL", mode: "bulk" }, (resp) => {
                      if (chrome.runtime.lastError)
                        reject(new Error(chrome.runtime.lastError.message));
                      else if (resp?.ok) resolve(resp);
                      else reject(new Error(resp?.error || "Sync failed"));
                    });
                  });
                  flash(
                    `Conflicts resolved — ${resolved.length} problem${resolved.length !== 1 ? "s" : ""} pushed to repository.`,
                  );
                  setImportMsg("");
                } catch (e) {
                  // Push failed — resolved locally only. _conflictResolvedAt marker in IDB
                  // will prevent the modal from reappearing on the next import until a
                  // successful sync happens via RESYNC_ALL triggered by a new solve.
                  flash(
                    `Resolved locally (${resolved.length} problem${resolved.length !== 1 ? "s" : ""}). Repo push failed — will retry on next sync.`,
                    false,
                  );
                  setImportMsg("");
                } finally {
                  setSyncBusy(false);
                  loadSyncCount();
                }
              }}
              onCancel=${async (_resolvedSoFar, remaining) => {
                // Apply whatever the user already resolved — don't discard their work.
                if (Array.isArray(_resolvedSoFar) && _resolvedSoFar.length > 0) {
                  await applyImport(_resolvedSoFar, { fromConflictResolution: true });
                  // Best-effort push of the partial resolutions
                  if (typeof chrome !== "undefined" && chrome.runtime?.id) {
                    chrome.runtime.sendMessage({ type: "RESYNC_ALL", mode: "bulk" }, () => {});
                  }
                }
                setImportData(null);
                setSyncNeedsPush(false);
                const leftover = Array.isArray(remaining) ? remaining.length : 0;
                const s = await Storage.getSettings();
                await Storage.setSettings({ ...s, _pendingConflicts: leftover });
                onSettingsChange?.("_pendingConflicts", leftover);
              }}
            />
          `
        : ""}

      <!-- ── Settings sync ─────────────────────────────────── -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-medium text-slate-300">Settings sync</h3>
            <p class="text-[11px] text-slate-500 mt-0.5">
              Saves appearance, AI config, and platform settings to
              <span class="font-mono">.codeledger/sync.json</span> in your repo so any device
              connecting to the same repo picks them up automatically. API keys and auth tokens are
              never included.
            </p>
          </div>
          <button
            onClick=${() =>
              onSettingsChange?.("settingsSyncEnabled", !(settings?.settingsSyncEnabled !== false))}
            class="relative ml-4 shrink-0 inline-flex h-5 w-9 items-center rounded-full border transition-colors
                            ${settings?.settingsSyncEnabled !== false
              ? "bg-cyan-500/30 border-cyan-500/40"
              : "bg-white/5 border-white/10"}"
          >
            <span
              class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
                            ${settings?.settingsSyncEnabled !== false
                ? "translate-x-4"
                : "translate-x-0.5"}"
            >
            </span>
          </button>
        </div>

        ${settings?.settingsSyncEnabled !== false &&
        html`
          <div class="flex items-center gap-3 flex-wrap">
            <button
              onClick=${handleSettingsPush}
              disabled=${settingsSyncBusy || !effectiveToken}
              class="px-3 py-1.5 text-xs rounded-lg border transition-colors
                                bg-cyan-500/10 border-cyan-500/20 text-cyan-300
                                hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ${settingsSyncBusy ? "Syncing…" : "Push settings"}
            </button>
            <button
              onClick=${handleSettingsPull}
              disabled=${settingsSyncBusy || !effectiveToken}
              class="px-3 py-1.5 text-xs rounded-lg border transition-colors
                                bg-white/5 border-white/10 text-slate-300
                                hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ${settingsSyncBusy ? "Syncing…" : "Pull settings"}
            </button>
            ${settingsSyncMsg.text &&
            html`
              <span class="text-xs ${settingsSyncMsg.ok ? "text-emerald-400" : "text-rose-400"}">
                ${settingsSyncMsg.text}
              </span>
            `}
          </div>
        `}
      </div>
    </div>
  `;
}
