/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * index.js — GitHubHandler
 *
 * Implements the BaseGitHandler interface using the GitHub Trees API for
 * atomic multi-file commits.  Internal helpers live in:
 *
 *   api-client.js     — authenticated HTTP calls (with retry)
 *   commit-builder.js — pure payload assemblers
 *   infra-builder.js  — README / Pages / bootstrap file generation
 *   pages-template.js — HTML + Markdown template strings
 *
 * @ts-check
 */

import { BaseGitHandler } from "../../_base/BaseGitHandler.js";
import { Storage } from "../../../core/storage.js";
import { CONSTANTS } from "../../../core/constants.js";
import * as api from "./api-client.js";
import { resolveRepoTopics, buildInfraFiles } from "./infra-builder.js";
import { buildTreeItems, buildCommitPayload } from "./commit-builder.js";
import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("GitHubHandler");

const BRANCH = CONSTANTS.REPO_BRANCH || "main";
const NEW_REPO_WAIT_MS = 3000; // GitHub needs a moment after auto_init

export class GitHubHandler extends BaseGitHandler {
  constructor() {
    super("github", "GitHub");
    this.dbg = dbg;
  }

  // ── Settings schema ───────────────────────────────────────────────────────

  getSettingsSchema() {
    return {
      id: this.id,
      title: "GitHub Integration",
      order: 1,
      description: "Connect your GitHub account to sync solutions.",
      fields: [
        {
          key: "github_token",
          label: "GitHub Authentication",
          type: "oauth",
          provider: "github",
          default: "",
          description:
            'Authenticate with GitHub to sync code. Requires "repo" scope.',
        },
        {
          key: "github_repo",
          label: "Repository Name",
          type: "text",
          default: "CodeLedger-Sync",
          description: "Exact repository name (e.g. CodeLedger-Sync).",
        },
        {
          key: "github_owner",
          label: "Organization / Owner (optional)",
          type: "text",
          default: "",
          description:
            "Leave blank for your personal account. Set to an org login for org repos.",
          advanced: true,
        },
        {
          key: "github_pages",
          label: "Enable GitHub Pages",
          type: "toggle",
          default: true,
          description:
            "Serve a public stats page at {owner}.github.io/{repo}/ or at custom domain — enabled automatically when creating a new repo.",
          advanced: true,
        },
        {
          key: "pages_show_verification",
          label: "Show commit verification in report",
          type: "toggle",
          default: false,
          description:
            "Include a verification summary of recent commits (verified vs total) in the Pages report.",
          advanced: true,
        },
        {
          key: "github_repo_topics_extra",
          label: "Extra repository tags",
          type: "text",
          default: "",
          description:
            "Optional comma-separated tags to add to GitHub repo topics.",
          advanced: true,
          placeholder: "arrays, dynamic-programming, competitive-programming",
        },
        {
          key: "github_coauthor_enabled",
          label: "Include optional co-author trailer",
          type: "toggle",
          default: true,
          description:
            "Append a Co-authored-by trailer to commits (opt out any time).",
          advanced: true,
        },
        {
          key: "github_coauthor_trailer",
          label: "Co-author trailer",
          type: "text",
          default:
            "Co-authored-by: VKrishna04 <75069043+VKrishna04@users.noreply.github.com>",
          description:
            "Full trailer line to append to commit messages. Example: Co-authored-by: Name <email>",
          advanced: true,
          placeholder:
            "Co-authored-by: VKrishna04 <75069043+VKrishna04@users.noreply.github.com>",
        },
      ],
    };
  }

  // ── Token resolution ──────────────────────────────────────────────────────

  // OAuth-only: never falls back to a stored PAT.
  // If this returns null the caller must prompt re-authentication.
  async getToken() {
    return Storage.getAuthToken("github");
  }

  /**
   * Validate the stored OAuth token against GET /user.
   * Returns { valid: true, login, avatar_url } or { valid: false }.
   * On HTTP 401 the stored token is cleared automatically.
   */
  async validateToken() {
    const token = await this.getToken();
    if (!token) return { valid: false };
    try {
      const user = await api.getCurrentUser(token);
      return { valid: true, login: user.login, avatar_url: user.avatar_url };
    } catch (err) {
      if (err.status === 401) {
        dbg.warn("validateToken(): token rejected by GitHub — clearing");
        await Storage.setAuthToken("github", "");
      }
      return { valid: false };
    }
  }

  // ── Co-author trailer ─────────────────────────────────────────────────────

  _withOptionalCoAuthor(message, settings = {}) {
    if (settings.github_coauthor_enabled === false) return message;
    const trailer = String(settings.github_coauthor_trailer || "").trim();
    if (!/^Co-authored-by:\s+.+\s+<.+>$/.test(trailer)) return message;
    if (message.includes(trailer)) return message;
    return `${message}\n\n${trailer}`;
  }

  // ── Generic provider interface ────────────────────────────────────────────

  async getContents(owner, repo, path) {
    return api.getContents(owner, repo, path, await this.getToken());
  }

  async getCurrentUser() {
    return api.getCurrentUser(await this.getToken());
  }

  async apiFetch(path, opts = {}) {
    return api.apiFetch(path, await this.getToken(), opts);
  }

  // ── Primary commit method ─────────────────────────────────────────────────

  /**
   * Atomically commit files to GitHub using the Trees API.
   *
   * @param {Array<{path:string, content:string}>} files  Files to upsert
   * @param {string} message     Commit message
   * @param {string} repoName    Target repository name
   * @param {object} [opts]
   * @param {Date|string|number} [opts.date]         Backdate the commit
   * @param {string[]}           [opts.deletes]      Paths to delete
   * @param {string}             [opts.ownerOverride] Override the owner
   * @param {boolean}            [opts.isMirror]     Skip infra file generation
   * @param {boolean}            [opts.skipInfra]    Skip infra file generation
   */
  async commit(files, message, repoName, opts = {}) {
    const token = await this.getToken();
    if (!token) throw new Error("Not authenticated with GitHub");

    const settings = await Storage.getSettings();
    const userRes = await api.getCurrentUser(token);

    const owner =
      opts.ownerOverride?.trim() ||
      settings["github_owner"]?.trim() ||
      userRes.login;
    const name = (
      repoName ||
      settings["github_repo"] ||
      CONSTANTS.DEFAULT_REPO_NAME
    ).replace(/\s+/g, "-");

    dbg.log(
      `commit(): ${files?.length || 0} file(s) → ${owner}/${name} (${BRANCH})`,
    );

    // ── Resolve branch HEAD (create repo if missing) ──────────────────────
    let latestSha;
    let isNewRepo = false;

    if (opts.knownParentSha) {
      // Caller tracked the last commit SHA — skip the round-trip to GitHub.
      // This prevents 422 "not a fast-forward" during sequential individual
      // commits where GitHub's ref propagation hasn't caught up yet.
      latestSha = opts.knownParentSha;
      dbg.log(
        `commit(): using caller-provided parent ${latestSha.slice(0, 7)}`,
      );
    } else {
      try {
        const ref = await api.getRepoRef(owner, name, BRANCH, token);
        latestSha = ref.object.sha;
        dbg.log(`commit(): branch HEAD = ${latestSha.slice(0, 7)}`);
      } catch (err) {
        if (err.status !== 404) throw err;

        dbg.log(`commit(): repo not found — creating ${owner}/${name}…`);
        await api.createRepository(name, token);
        isNewRepo = true;

        // GitHub needs a moment after auto_init to create the initial commit
        await _sleep(NEW_REPO_WAIT_MS);
        await this._configureRepo(owner, name, token, settings);

        const ref = await api.getRepoRef(owner, name, BRANCH, token);
        latestSha = ref.object.sha;
        dbg.log(`commit(): new repo HEAD = ${latestSha.slice(0, 7)}`);
      }
    }

    // ── Build tree ────────────────────────────────────────────────────────
    const commitObj = await api.getCommit(owner, name, latestSha, token);
    const baseTreeSha = commitObj?.tree?.sha || null;

    const treeItems = buildTreeItems(files, opts.deletes);

    // Add infrastructure files unless this is a mirror commit or explicitly skipped
    if (!opts.isMirror && !opts.skipInfra) {
      const infra = await buildInfraFiles(
        owner,
        name,
        BRANCH,
        token,
        settings,
        isNewRepo,
        opts.indexMetaOverride ?? null,
      );
      treeItems.push(...infra);
      dbg.log(
        `commit(): +${infra.length} infra file(s) (isNewRepo=${isNewRepo})`,
      );
    }

    // ── Create tree → commit → update ref ────────────────────────────────
    const treeRes = await api.createTree(
      owner,
      name,
      treeItems,
      baseTreeSha,
      token,
    );
    dbg.log(`commit(): tree ${treeRes.sha.slice(0, 7)}`);

    const commitMsg = this._withOptionalCoAuthor(message, settings);

    // ── Push commit with up to 3 attempts on 422 non-fast-forward ─────────
    // GitHub's distributed ref store can lag across edge nodes: the node that
    // accepted updateRef(sha_N) may not be the one we hit for the next call,
    // so it still sees the old HEAD and rejects a fast-forward.  Fetching a
    // fresh ref and rebuilding the commit on each 422 lets the system catch up.
    let parentSha = latestSha;
    let currentTreeSha = treeRes.sha;
    let commitRes;

    for (let attempt = 0; attempt < 3; attempt++) {
      const payload = buildCommitPayload(
        commitMsg,
        currentTreeSha,
        parentSha,
        opts,
        userRes,
      );
      commitRes = await api.createCommit(owner, name, payload, token);
      dbg.log(
        `commit(): commit ${commitRes.sha.slice(0, 7)} (attempt ${attempt + 1})`,
      );

      try {
        await api.updateRef(owner, name, BRANCH, commitRes.sha, token);
        break; // success
      } catch (refErr) {
        if (refErr.status !== 422 || attempt === 2) throw refErr;
        dbg.warn(
          `commit(): 422 non-fast-forward (attempt ${attempt + 1}) — refreshing ref`,
        );
        await _sleep(500 * (attempt + 1)); // 500ms, then 1000ms
        const freshRef = await api.getRepoRef(owner, name, BRANCH, token);
        parentSha = freshRef.object.sha;
        const freshCommit = await api.getCommit(owner, name, parentSha, token);
        const retryTree = await api.createTree(
          owner,
          name,
          treeItems,
          freshCommit.tree.sha,
          token,
        );
        currentTreeSha = retryTree.sha;
      }
    }

    dbg.log(`commit(): ✅ ${owner}/${name} @ ${BRANCH}`);

    // Enable Pages on new repo — fire-and-forget
    if (isNewRepo && settings["github_pages"] !== false) {
      api
        .enablePages(owner, name, BRANCH, token)
        .then(() => dbg.log(`commit(): GitHub Pages enabled`))
        .catch((e) =>
          dbg.warn(`commit(): Pages enable failed (non-fatal):`, e.message),
        );
    }

    return commitRes.sha;
  }

  // ── Historical commit helper ──────────────────────────────────────────────

  /**
   * Commit a sequence of historical entries in chronological order.
   * Infra files are intentionally skipped — the caller should do one
   * regular `commit()` afterwards to bring infra up to date.
   *
   * @param {Array<{files, message, repoName, date, ownerOverride?}>} commits
   */
  async commitHistorical(commits) {
    if (!commits?.length) return;

    const sorted = [...commits].sort(
      (a, b) => new Date(a.date) - new Date(b.date),
    );

    for (const entry of sorted) {
      await this.commit(entry.files, entry.message, entry.repoName, {
        date: entry.date,
        ownerOverride: entry.ownerOverride,
        skipInfra: true, // historical commits must not regenerate infra
      });
    }
  }

  // ── Repository maintenance ────────────────────────────────────────────────

  async ensureRepoTopics(repoName) {
    const token = await this.getToken();
    if (!token) return;
    const settings = await Storage.getSettings();
    const userRes = await api.getCurrentUser(token);
    const owner = settings["github_owner"]?.trim() || userRes.login;
    const name = (
      repoName ||
      settings["github_repo"] ||
      settings["gitRepo"] ||
      CONSTANTS.DEFAULT_REPO_NAME
    ).replace(/\s+/g, "-");

    await api.setRepositoryTopics(
      owner,
      name,
      resolveRepoTopics(settings),
      token,
    );
    dbg.log(`ensureRepoTopics(): updated topics for ${owner}/${name}`);
  }

  async _configureRepo(owner, name, token, settings) {
    await api.updateRepository(
      owner,
      name,
      {
        has_wiki: false,
        has_projects: false,
        has_discussions: false,
        allow_merge_commit: false,
        allow_rebase_merge: true,
        allow_squash_merge: true,
        delete_branch_on_merge: true,
      },
      token,
    );

    await api.setRepositoryTopics(
      owner,
      name,
      resolveRepoTopics(settings),
      token,
    );
    dbg.log(`_configureRepo(): ✓ ${owner}/${name} configured`);
  }
}

function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
