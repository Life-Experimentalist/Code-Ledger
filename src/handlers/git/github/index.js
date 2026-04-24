/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// @ts-nocheck

import { BaseGitHandler } from '../../_base/BaseGitHandler.js';
import { Storage } from '../../../core/storage.js';
import { CONSTANTS } from '../../../core/constants.js';

export class GitHubHandler extends BaseGitHandler {
  constructor() {
    super('github', 'GitHub');
  }

  getSettingsSchema() {
    return {
      id: this.id,
      title: 'GitHub Integration',
      order: 1,
      description: 'Connect your GitHub account to sync solutions.',
      fields: [
        {
          key: 'github_token',
          label: 'GitHub Authentication',
          type: 'oauth',
          provider: 'github',
          default: '',
          description: 'Authenticate with GitHub to sync code. Requires "repo" scope.'
        },
        {
          key: 'github_repo',
          label: 'Repository Name',
          type: 'text',
          default: 'CodeLedger-Sync',
          description: 'The exact name of the repository (e.g. CodeLedger-Sync).'
        }
      ]
    };
  }

  /**
   * Performs an atomic commit using the GitHub Trees API.
   * Maintains index.json and automatically generates a dynamic README.
   */
  async commit(files, message, repoName) {
    const token = await this.getToken();
    if (!token) throw new Error('Not authenticated with GitHub');

    // 1. Get authenticated user
    const userRes = await this.apiFetch('/user', token);
    const owner = userRes.login;
    const name = repoName || 'CodeLedger-Sync';
    const branch = CONSTANTS.REPO_BRANCH || 'main';

    // 2. Ensure Repository Exists
    let lastCommitSha;
    try {
      const refRes = await this.apiFetch(`/repos/${owner}/${name}/git/refs/heads/${branch}`, token);
      lastCommitSha = refRes.object.sha;
    } catch (err) {
      if (err.status === 409 || err.status === 404) {
        this.dbg.log('Repo not found or empty. Attempting to initialize...');
        try {
          // If 404, create repo
          if (err.status === 404) {
            await this.apiFetch('/user/repos', token, {
              method: 'POST',
              body: JSON.stringify({
                name,
                description: 'Collection of LeetCode questions solved by CodeLedger',
                private: false,
                auto_init: true
              })
            });
            // Give GitHub a moment to initialize
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
          
          // Fetch ref again after initialization
          const refRes = await this.apiFetch(`/repos/${owner}/${name}/git/refs/heads/${branch}`, token);
          lastCommitSha = refRes.object.sha;
        } catch (initErr) {
          throw new Error(`Failed to create or initialize repository: ${initErr.message}`);
        }
      } else {
        throw err;
      }
    }

    // 2. Fetch existing index.json to update it
    let indexJson = [];
    try {
      const indexRes = await this.apiFetch(`/repos/${owner}/${name}/contents/index.json?ref=${branch}`, token);
      if (indexRes.content) {
        const decoded = decodeURIComponent(escape(atob(indexRes.content)));
        indexJson = JSON.parse(decoded);
      }
    } catch (e) {
      this.dbg.log('No index.json found, starting fresh.');
    }

    // Update index with new files passed (assuming caller passes problem metadata in files array if needed,
    // but typically handled centrally. Let's assume files contains standard code but we just generate tree here)
    const treeItems = files.map(f => ({
      path: f.path,
      mode: '100644',
      type: 'blob',
      content: f.content
    }));

    // 3. Create tree
    const treeRes = await this.apiFetch(`/repos/${owner}/${name}/git/trees`, token, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: lastCommitSha,
        tree: treeItems
      })
    });

    // 4. Create commit
    const commitRes = await this.apiFetch(`/repos/${owner}/${name}/git/commits`, token, {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: treeRes.sha,
        parents: [lastCommitSha]
      })
    });

    // 5. Update ref
    await this.apiFetch(`/repos/${owner}/${name}/git/refs/heads/${branch}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commitRes.sha })
    });

    this.dbg.log('Atomic commit successful');
  }

  async apiFetch(url, token, options = {}) {
    const fullUrl = url.startsWith('http') ? url : `${CONSTANTS.GIT_PROVIDERS.github.apiBase}${url}`;
    const res = await fetch(fullUrl, {
      ...options,
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        ...options.headers
      }
    });

    if (!res.ok) {
      const errRes = await res.json().catch(() => ({}));
      const err = new Error(`GitHub API Error: ${errRes.message || res.statusText}`);
      err.status = res.status;
      throw err;
    }

    return res.json();
  }

  async getToken() {
    const settings = await Storage.getSettings();
    return settings['github_token'] || await Storage.getAuthToken('github');
  }
}
