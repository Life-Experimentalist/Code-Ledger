/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GitLab git handler — commits via the GitLab v4 Commits API.
 * Supports both gitlab.com and self-hosted instances (configured via endpoint override).
 */
import { BaseGitHandler } from '../../_base/BaseGitHandler.js';
import { Storage } from '../../../core/storage.js';
import { CONSTANTS } from '../../../core/constants.js';

export class GitLabHandler extends BaseGitHandler {
  constructor() {
    super('gitlab', 'GitLab');
  }

  getSettingsSchema() {
    return {
      id: this.id,
      title: 'GitLab Integration',
      order: 2,
      description: 'Mirror solutions to a GitLab repository.',
      fields: [
        {
          key: 'gitlab_token',
          label: 'GitLab Personal Access Token',
          type: 'password',
          default: '',
          description: 'Create a token at GitLab → User Settings → Access Tokens with api scope.',
        },
        {
          key: 'gitlab_repo',
          label: 'Repository (namespace/project)',
          type: 'text',
          default: '',
          description: 'e.g. username/CodeLedger-Sync or group/subgroup/project',
        },
        {
          key: 'gitlab_endpoint',
          label: 'GitLab endpoint (self-hosted)',
          type: 'text',
          default: 'https://gitlab.com',
          description: 'Leave as https://gitlab.com unless using a self-hosted instance.',
          advanced: true,
        },
      ],
    };
  }

  async getToken() {
    const settings = await Storage.getSettings();
    return settings['gitlab_token'] || null;
  }

  /** @param {string} path  @param {string} token  @param {object} [options] */
  async apiFetch(path, token, options = {}) {
    const settings = await Storage.getSettings();
    const base = (settings['gitlab_endpoint'] || 'https://gitlab.com').replace(/\/$/, '');
    const url  = path.startsWith('http') ? path : `${base}/api/v4${path}`;
    const method = (options.method || 'GET').toUpperCase();
    const headers = {
      'PRIVATE-TOKEN': token,
      ...(options.headers || {}),
    };
    if (['POST', 'PATCH', 'PUT'].includes(method) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, { ...options, method, headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err  = new Error(`GitLab API Error: ${body.message || res.statusText}`);
      err.status = res.status;
      throw err;
    }
    const txt = await res.text();
    try { return txt ? JSON.parse(txt) : {}; } catch { return txt; }
  }

  /**
   * Commits files using the GitLab Commits API (POST /projects/:id/repository/commits).
   * Creates the repo automatically if it doesn't exist (requires api scope).
   * @param {Array<{path:string,content:string}>} files
   * @param {string} message
   * @param {string} [repoName]  namespace/project — falls back to settings.gitlab_repo
   * @param {{ date?: Date|string, ownerOverride?: string, isMirror?: boolean }} [opts]
   */
  async commit(files, message, repoName, opts = {}) {
    const token = await this.getToken();
    if (!token) throw new Error('Not authenticated with GitLab');

    const settings = await Storage.getSettings();
    const project  = encodeURIComponent(repoName || settings['gitlab_repo'] || '');
    if (!project)   throw new Error('No GitLab repository configured (settings.gitlab_repo)');

    const branch = CONSTANTS.REPO_BRANCH || 'main';

    // Ensure the branch exists; create the project if needed
    let branchExists = false;
    try {
      await this.apiFetch(`/projects/${project}/repository/branches/${branch}`, token);
      branchExists = true;
    } catch (e) {
      if (e.status === 404) {
        // Project may not exist — try to create it
        try {
          const [ns, ...nameParts] = decodeURIComponent(project).split('/');
          const projectName = nameParts.join('/') || ns;
          await this.apiFetch('/projects', token, {
            method: 'POST',
            body: JSON.stringify({
              name: projectName,
              namespace_id: undefined,
              initialize_with_readme: true,
              visibility: 'private',
            }),
          });
          // Give GitLab a moment to init
          await new Promise((r) => setTimeout(r, 2000));
          branchExists = true;
        } catch (createErr) {
          throw new Error(`GitLab: could not find or create project: ${createErr.message}`);
        }
      } else {
        throw e;
      }
    }

    // Build the actions array for the Commits API
    const actions = files.map((f) => ({
      action: 'create',   // GitLab will update automatically via 'create' on existing files
      file_path: f.path,
      content: f.content,
      encoding: 'text',
    }));

    // GitLab "create" fails if file already exists; use update then.
    // Simplest resilient approach: use "create" with a fallback loop per file.
    // For bulk commits the Commits API handles this via action="create"→"update" fallback.
    // We fetch the tree first to decide per-file action.
    let existingPaths = new Set();
    try {
      // List top-level tree paths (not recursive — good enough for infra files)
      const tree = await this.apiFetch(`/projects/${project}/repository/tree?ref=${branch}&recursive=false&per_page=100`, token);
      if (Array.isArray(tree)) {
        tree.forEach((item) => existingPaths.add(item.path));
      }
    } catch (_) { /* repo might be empty — all actions stay as create */ }

    const resolvedActions = actions.map((a) => ({
      ...a,
      action: existingPaths.has(a.file_path) ? 'update' : 'create',
    }));

    const payload = {
      branch,
      commit_message: message,
      actions: resolvedActions,
    };

    if (opts.date) {
      payload.author_date    = new Date(opts.date).toISOString();
      payload.committer_date = payload.author_date;
    }

    await this.apiFetch(`/projects/${project}/repository/commits`, token, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    this.dbg.log('GitLab commit successful');
  }

  async commitHistorical(commits) {
    if (!commits?.length) return;
    const sorted = [...commits].sort((a, b) => new Date(a.date) - new Date(b.date));
    for (const entry of sorted) {
      await this.commit(entry.files, entry.message, entry.repoName, { date: entry.date });
    }
  }
}
