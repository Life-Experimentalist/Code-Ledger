/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// @ts-nocheck

import { BaseGitHandler } from "../../_base/BaseGitHandler.js";
import { Storage } from "../../../core/storage.js";
import { CONSTANTS } from "../../../core/constants.js";
import { getPagesHtml, getActionsWorkflow } from "./pages-template.js";

export class GitHubHandler extends BaseGitHandler {
  constructor() {
    super("github", "GitHub");
  }

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
          description:
            "The exact name of the repository (e.g. CodeLedger-Sync).",
        },
        {
          key: "github_owner",
          label: "Organization / Owner (optional)",
          type: "text",
          default: "",
          description:
            "Leave blank to use your personal account. Set to an org login to commit to an org repo.",
          advanced: true,
        },
        {
          key: "github_pages",
          label: "Enable GitHub Pages",
          type: "toggle",
          default: true,
          description:
            "Serve a public stats page at {owner}.github.io/{repo}/ — enabled automatically when creating a new repo.",
          advanced: true,
        },
      ],
    };
  }

  /**
   * Performs an atomic commit using the GitHub Trees API.
   * @param {Array<{path: string, content: string}>} files
   * @param {string} message
   * @param {string} [repoName]
   * @param {{ date?: string|number|Date }} [opts]  Optional commit options.
   *   date — ISO string or timestamp for a backdated commit (uses author/committer date).
   */
  async commit(files, message, repoName, opts = {}) {
    const token = await this.getToken();
    if (!token) throw new Error("Not authenticated with GitHub");

    // 1. Resolve owner, repo and branch
    const settings = await Storage.getSettings();
    const userRes = await this.apiFetch("/user", token);
    const owner = settings["github_owner"]?.trim() || userRes.login;
    const name = (
      repoName || settings["github_repo"] || CONSTANTS.DEFAULT_REPO_NAME
    ).replace(/\s+/g, "-");
    const branch = CONSTANTS.REPO_BRANCH || "main";

    // 2. Ensure repository exists and get the latest commit SHA.
    let latestCommitSha;
    let isNewRepo = false;
    try {
      const refRes = await this.apiFetch(
        `/repos/${owner}/${name}/git/ref/heads/${branch}`,
        token,
      );
      latestCommitSha = refRes.object.sha;
    } catch (err) {
      if (err.status === 404) {
        this.dbg.log("Repo/branch not found. Creating repository…");
        try {
          await this.apiFetch("/user/repos", token, {
            method: "POST",
            body: JSON.stringify({
              name,
              description:
                "Collection of solved DSA problems managed by CodeLedger",
              private: false,
              auto_init: true,
            }),
          });
          isNewRepo = true;
          // Give GitHub time to initialize the default branch
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const refRes = await this.apiFetch(
            `/repos/${owner}/${name}/git/ref/heads/${branch}`,
            token,
          );
          latestCommitSha = refRes.object.sha;

          // Enable GitHub Pages on new repos (best-effort; may fail on free private repos)
          if (settings["github_pages"] !== false) {
            this._enablePages(owner, name, branch, token).catch((e) =>
              this.dbg.warn("GitHub Pages enable failed (non-fatal):", e.message),
            );
          }
        } catch (createErr) {
          throw new Error(`Failed to create repository: ${createErr.message}`);
        }
      } else {
        throw err;
      }
    }

    // 3. Get commit object to retrieve the base tree SHA
    const commitObj = await this.apiFetch(
      `/repos/${owner}/${name}/git/commits/${latestCommitSha}`,
      token,
    );
    const baseTreeSha = commitObj?.tree?.sha || null;

    // 4. Build tree items — include solution files + index.html on new repos
    const treeItems = files.map((f) => ({
      path: f.path,
      mode: "100644",
      type: "blob",
      content: f.content,
    }));

    if (isNewRepo) {
      treeItems.push({
        path: "index.html",
        mode: "100644",
        type: "blob",
        content: getPagesHtml(),
      });
      // GitHub Actions workflow: updates README with stats on every push
      treeItems.push({
        path: ".github/workflows/update-stats.yml",
        mode: "100644",
        type: "blob",
        content: getActionsWorkflow(),
      });
    }

    // 5. Create tree
    const treeRes = await this.apiFetch(
      `/repos/${owner}/${name}/git/trees`,
      token,
      {
        method: "POST",
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
      },
    );

    // 6. Create commit — optionally backdated via opts.date
    const commitPayload = {
      message,
      tree: treeRes.sha,
      parents: [latestCommitSha],
    };

    if (opts.date) {
      const iso = new Date(opts.date).toISOString();
      const authorName = userRes.name || userRes.login;
      const authorEmail =
        userRes.email ||
        `${userRes.login}@users.noreply.github.com`;
      commitPayload.author = { name: authorName, email: authorEmail, date: iso };
      commitPayload.committer = { ...commitPayload.author };
    }

    const commitRes = await this.apiFetch(
      `/repos/${owner}/${name}/git/commits`,
      token,
      { method: "POST", body: JSON.stringify(commitPayload) },
    );

    // 7. Update branch ref
    await this.apiFetch(
      `/repos/${owner}/${name}/git/refs/heads/${branch}`,
      token,
      { method: "PATCH", body: JSON.stringify({ sha: commitRes.sha }) },
    );

    this.dbg.log("Atomic commit successful");
  }

  /**
   * Commits multiple historical solves with individual backdated timestamps.
   * Each problem gets its own commit ordered by solve date.
   * @param {Array<{files: Array, message: string, date: string|number, repoName?: string}>} commits
   */
  async commitHistorical(commits) {
    if (!commits || !commits.length) return;
    const sorted = [...commits].sort((a, b) => new Date(a.date) - new Date(b.date));
    for (const entry of sorted) {
      await this.commit(entry.files, entry.message, entry.repoName, {
        date: entry.date,
      });
    }
  }

  /** Enables GitHub Pages on the given repo (serves from branch root). */
  async _enablePages(owner, name, branch, token) {
    await this.apiFetch(`/repos/${owner}/${name}/pages`, token, {
      method: "POST",
      body: JSON.stringify({ source: { branch, path: "/" } }),
    });
    this.dbg.log("GitHub Pages enabled:", `https://${owner}.github.io/${name}/`);
  }

  async apiFetch(url, token, options = {}) {
    const fullUrl = url.startsWith("http")
      ? url
      : `${CONSTANTS.GIT_PROVIDERS.github.apiBase}${url}`;
    const method = (options.method || "GET").toUpperCase();
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      ...(options.headers || {}),
    };

    if (["POST", "PATCH", "PUT"].includes(method) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(fullUrl, { ...options, method, headers });

    if (!res.ok) {
      const errRes = await res.json().catch(() => ({}));
      const err = new Error(
        `GitHub API Error: ${errRes.message || res.statusText}`,
      );
      err.status = res.status;
      throw err;
    }

    const txt = await res.text();
    try {
      return txt ? JSON.parse(txt) : {};
    } catch (e) {
      return txt;
    }
  }

  async getToken() {
    const oauthToken = await Storage.getAuthToken("github");
    if (oauthToken) return oauthToken;
    const settings = await Storage.getSettings();
    return settings["github_token"] || null;
  }
}
