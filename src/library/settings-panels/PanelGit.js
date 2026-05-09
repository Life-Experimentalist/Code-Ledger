/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";
import { CONSTANTS } from "../../core/constants.js";
import { registry } from "../../core/handler-registry.js";
import { importFromRepo, applyImport } from "../../background/sync-engine.js";
import { ConflictResolutionModal } from "../components/ConflictResolutionModal.js";

const DEFAULT_COMMIT_TPL = CONSTANTS.COMMIT_MESSAGE_TEMPLATE;
const DEFAULT_REPO = CONSTANTS.DEFAULT_REPO_NAME;
const GIT_PROVIDERS = Object.values(CONSTANTS.GIT_PROVIDERS || {});

export function PanelGit({ settings, onSettingsChange, onSetupRepo }) {
  const [oauthToken, setOauthToken] = useState("");
  const [msg, setMsg] = useState({ text: "", ok: true });
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncCount, setSyncCount] = useState(null);
  const [importData,    setImportData]    = useState(null);
  const [importing,     setImporting]     = useState(false);
  const [importMsg,     setImportMsg]     = useState("");

  useEffect(() => {
    Storage.getAuthToken("github").then((t) => setOauthToken(t || "")).catch(() => {});
    loadSyncCount();
  // Re-read auth token whenever parent settings update (catches post-OAuth refresh)
  }, [settings]);

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
  const repoName   = settings?.github_repo || settings?.gitRepo || "";
  const repoOwner  = settings?.github_owner || githubUser || "";
  const commitTpl  = settings?.commitMessageTemplate || DEFAULT_COMMIT_TPL;
  const gitEnabled = settings?.gitEnabled !== false;
  const gitProvider = settings?.gitProvider || "github";

  const handleConnect = () => {
    const authUrl = `${CONSTANTS.URLS.AUTH_WORKER}/auth/github`;
    const popup = window.open(authUrl, "OAuth", "width=600,height=700");
    if (!popup) alert("Please allow popups for this page to connect GitHub.");
    // library.js handleOAuthMessage picks up the CODELEDGER_AUTH response,
    // saves the token, and shows the repo onboarding wizard automatically.
  };

  const unlinkGitHub = async () => {
    if (!confirm("Unlink GitHub account? This removes the OAuth token but keeps your repo settings.")) return;
    try {
      const all = await Storage.getSettings();
      await Storage.setSettings({ ...all, github_username: "", github_owner: "" });
      await Storage.setAuthToken("github", "");
      setOauthToken("");
      flash("GitHub unlinked");
    } catch (e) {
      flash("Error: " + e.message, false);
    }
  };

  const handleSync = async (mode = "bulk") => {
    if (!gitEnabled) return flash("Git commits are disabled — enable them first.", false);
    setSyncBusy(true);
    try {
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
      flash("Sync complete — index.json updated on GitHub");
      setSyncCount(0);
    } catch (e) {
      flash("Sync failed: " + e.message, false);
    } finally {
      setSyncBusy(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setImportMsg("");
    try {
      const git   = registry.getGitProvider(settings.gitProvider || "github");
      if (!git) { setImportMsg("Git provider not available. Try reloading."); setImporting(false); return; }
      const token = await git.getToken();
      const owner = settings.github_owner || settings.github_username || "";
      const repo  = settings.github_repo  || settings.gitRepo         || "";
      const { remoteOnly, conflicts } = await importFromRepo(owner, repo, token);

      if (conflicts.length > 0) {
        setImportData({ remoteOnly, conflicts });
      } else {
        await applyImport(remoteOnly);
        setImportMsg(`Imported ${remoteOnly.length} new problem${remoteOnly.length !== 1 ? "s" : ""}`);
        const s = await Storage.getSettings();
        await Storage.setSettings({ ...s, _pendingConflicts: 0 });
      }
    } catch (e) {
      setImportMsg(`Import failed: ${e.message}`);
    } finally {
      setImporting(false);
    }
  };

  const repoUrl = repoOwner && repoName
    ? `https://github.com/${repoOwner}/${repoName}`
    : "";

  return html`
    <div class="space-y-6 max-w-xl">
      <div>
        <h2 class="text-base font-semibold text-white mb-1">Git Integration</h2>
        <p class="text-xs text-slate-500 mb-4">Connect your repository and configure how solutions are committed.</p>
      </div>

      <!-- Master enable -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-slate-300">Auto-commit solved problems</p>
            <p class="text-[11px] text-slate-500 mt-0.5">When enabled, each accepted solution is automatically committed to your repository.</p>
          </div>
          <button
            onClick=${() => onSettingsChange("gitEnabled", !gitEnabled)}
            class="relative ml-4 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors
              ${gitEnabled ? "bg-cyan-500/30 border-cyan-500/40" : "bg-white/5 border-white/10"}"
          >
            <span class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform
              ${gitEnabled ? "translate-x-4" : "translate-x-0.5"}">
            </span>
          </button>
        </div>
      </div>

      <!-- Git provider -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Git Provider</h3>
        <p class="text-[11px] text-slate-500">Only GitHub is supported with full OAuth. GitLab and Bitbucket require a Personal Access Token in the repository field.</p>
        <div class="flex gap-2">
          ${GIT_PROVIDERS.length ? GIT_PROVIDERS.map((gp) => html`
            <button
              key=${gp.id}
              onClick=${() => onSettingsChange("gitProvider", gp.id)}
              class="flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors
                ${gitProvider === gp.id
                  ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-200"
                  : "bg-white/3 border-white/8 text-slate-400 hover:text-slate-300 hover:bg-white/5"}"
            >${gp.name}</button>
          `) : html`<span class="text-xs text-slate-500">GitHub</span>`}
        </div>
      </div>

      <!-- GitHub account -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">GitHub Account</h3>
        ${oauthToken
          ? html`
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-300 text-sm font-bold shrink-0">
                ${(githubUser || "?")[0].toUpperCase()}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-slate-200">${githubUser || "Connected"}</p>
                <p class="text-[11px] text-slate-500">OAuth connected</p>
              </div>
              <button
                onClick=${unlinkGitHub}
                class="shrink-0 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs rounded-lg transition-colors"
              >Unlink</button>
            </div>
          `
          : html`
            <p class="text-sm text-slate-400">No GitHub account connected.</p>
            <button
              onClick=${handleConnect}
              class="px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-sm rounded-lg transition-colors"
            >Connect GitHub →</button>
          `
        }
      </div>

      <!-- Repository -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Repository</h3>
        <div>
          <label class="block text-xs text-slate-400 mb-1">Repository name</label>
          <input
            type="text"
            value=${repoName}
            placeholder=${DEFAULT_REPO}
            onInput=${(e) => onSettingsChange("github_repo", e.target.value)}
            class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
          />
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1">Repository owner</label>
          <input
            type="text"
            value=${repoOwner}
            placeholder=${githubUser || "username or org"}
            onInput=${(e) => onSettingsChange("github_owner", e.target.value)}
            class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
          />
        </div>
        ${repoUrl && html`
          <a
            href=${repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
            ${repoOwner}/${repoName}
          </a>
        `}
        ${!oauthToken && html`
          <button
            onClick=${handleConnect}
            class="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >Run setup wizard →</button>
        `}
      </div>

      <!-- Sync -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Sync</h3>
        <p class="text-[11px] text-slate-500">
          Force-push all local problems to your repository and rebuild the <code class="text-slate-400">index.json</code> manifest.
          ${syncCount !== null && syncCount > 0 ? html`
            <span class="text-amber-400"> ${syncCount} problem${syncCount !== 1 ? "s" : ""} pending commit.</span>
          ` : ""}
        </p>
        <div class="flex gap-2">
          <button
            onClick=${() => handleSync("bulk")}
            disabled=${syncBusy || !gitEnabled}
            class="px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-200 text-xs rounded-lg transition-colors disabled:opacity-50"
          >${syncBusy ? "Syncing…" : "Sync to GitHub"}</button>
          <button
            onClick=${loadSyncCount}
            class="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 text-xs rounded-lg transition-colors"
            title="Check pending count"
          >↺</button>
        </div>
        ${msg.text && html`
          <p class="text-xs ${msg.ok ? "text-emerald-400" : "text-rose-400"}">${msg.text}</p>
        `}
      </div>

      <!-- Problems directory -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Repository Layout</h3>
        <div>
          <label class="block text-xs text-slate-400 mb-1">Problems directory</label>
          <input
            type="text"
            value=${settings?.problems_dir || "problems"}
            placeholder="problems"
            onInput=${(e) => onSettingsChange("problems_dir", e.target.value || "problems")}
            class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-300 font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
          />
          <p class="text-[10px] text-slate-600 mt-1">Folder inside the repo where solutions are stored (default: <code>problems</code>)</p>
        </div>
      </div>

      <!-- Commit message template -->
      <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
        <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Commit Message Template</h3>
        <p class="text-[11px] text-slate-500">Variables: <code class="text-slate-400">{topic}</code> <code class="text-slate-400">{title}</code> <code class="text-slate-400">{difficulty}</code> <code class="text-slate-400">{language}</code> <code class="text-slate-400">{platform}</code></p>
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
          >Reset</button>
        </div>
      </div>
      ${(settings._pendingConflicts > 0) ? html`
        <div class="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <span class="text-amber-400 text-sm">⚠ ${settings._pendingConflicts} conflict${settings._pendingConflicts !== 1 ? "s" : ""} detected during background sync.</span>
          <button onClick=${handleImport} class="text-xs text-amber-300 underline hover:no-underline">Resolve now</button>
        </div>
      ` : ""}

      ${(repoName) ? html`
        <div class="p-4 rounded-xl border border-white/8 bg-white/2 space-y-3">
          <h3 class="text-xs font-medium text-slate-400 uppercase tracking-widest">Import</h3>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-200">Import from repository</p>
              <p class="text-xs text-slate-500">Pull all problems from your connected repo into the local library.</p>
            </div>
            <button
              onClick=${handleImport}
              disabled=${importing}
              class="px-4 py-2 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors disabled:opacity-50"
            >${importing ? "Importing…" : "Import"}</button>
          </div>
          ${importMsg ? html`<p class="text-xs text-cyan-400">${importMsg}</p>` : ""}
        </div>
      ` : ""}

      ${importData ? html`
        <${ConflictResolutionModal}
          conflicts=${importData.conflicts}
          remoteOnly=${importData.remoteOnly}
          providerName="GitHub"
          onResolve=${async (resolved) => {
            await applyImport(resolved);
            setImportData(null);
            setImportMsg(`Imported ${resolved.length} problem${resolved.length !== 1 ? "s" : ""}`);
            const s = await Storage.getSettings();
            await Storage.setSettings({ ...s, _pendingConflicts: 0 });
          }}
          onCancel=${() => setImportData(null)}
        />
      ` : ""}
    </div>
  `;
}
