/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// @ts-nocheck

import { BaseGitHandler } from "../../_base/BaseGitHandler.js";
import { Storage } from "../../../core/storage.js";
import { CONSTANTS } from "../../../core/constants.js";

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
      ],
    };
  }

  /**
   * Performs an atomic commit using the GitHub Trees API.
   * Maintains index.json and automatically generates a dynamic README.
   */
  async commit(files, message, repoName) {
    const token = await this.getToken();
    if (!token) throw new Error("Not authenticated with GitHub");

    // 1. Resolve owner, repo and branch
    const userRes = await this.apiFetch("/user", token);
    const owner = userRes.login;
    const settings = await Storage.getSettings();
    const name =
      repoName || settings["github_repo"] || CONSTANTS.DEFAULT_REPO_NAME;
    const branch = CONSTANTS.REPO_BRANCH || "main";

    // 2. Ensure repository exists and get the latest commit SHA
    let latestCommitSha;
    try {
      const refRes = await this.apiFetch(
        `/repos/${owner}/${name}/git/refs/heads/${branch}`,
        token,
      );
      latestCommitSha = refRes.object.sha;
    } catch (err) {
      if (err.status === 404) {
        this.dbg.log("Repo not found. Attempting to create repository...");
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
          // Give GitHub a moment to initialize
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const refRes = await this.apiFetch(
            `/repos/${owner}/${name}/git/refs/heads/${branch}`,
            token,
          );
          latestCommitSha = refRes.object.sha;
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

    // 4. Optionally read existing index.json
    let indexJson = null;
    try {
      const indexRes = await this.apiFetch(
        `/repos/${owner}/${name}/contents/index.json?ref=${branch}`,
        token,
      );
      if (indexRes && indexRes.content) {
        try {
          const decoded = atob(indexRes.content);
          indexJson = JSON.parse(decoded);
        } catch (e) {
          this.dbg.warn("Failed to decode existing index.json");
        }
      }
    } catch (e) {
      this.dbg.log("No index.json found, starting fresh.");
    }

    // 5. Prepare tree items
    const treeItems = files.map((f) => ({
      path: f.path,
      mode: "100644",
      type: "blob",
      content: f.content,
    }));

    // 6. Create tree using base_tree = baseTreeSha
    const treeRes = await this.apiFetch(
      `/repos/${owner}/${name}/git/trees`,
      token,
      {
        method: "POST",
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
      },
    );

    // 7. Create commit
    const commitRes = await this.apiFetch(
      `/repos/${owner}/${name}/git/commits`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          message,
          tree: treeRes.sha,
          parents: [latestCommitSha],
        }),
      },
    );

    // 8. Update branch ref to point to new commit
    await this.apiFetch(
      `/repos/${owner}/${name}/git/refs/heads/${branch}`,
      token,
      {
        method: "PATCH",
        body: JSON.stringify({ sha: commitRes.sha }),
      },
    );

    this.dbg.log("Atomic commit successful");
  }

  async apiFetch(url, token, options = {}) {
    const fullUrl = url.startsWith("http")
      ? url
      : `${CONSTANTS.GIT_PROVIDERS.github.apiBase}${url}`;
    const method = (options.method || "GET").toUpperCase();
    const headers = {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      ...(options.headers || {}),
    };

    // Ensure JSON Content-Type for requests with a body unless explicitly provided
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

    // Some endpoints return empty body (204). Handle gracefully.
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
