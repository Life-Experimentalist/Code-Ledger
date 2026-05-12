/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// @ts-nocheck

import { BaseGitHandler } from "../../_base/BaseGitHandler.js";
import { Storage } from "../../../core/storage.js";
import { CONSTANTS } from "../../../core/constants.js";
import * as api from "./api-client.js";
import { buildInfraFiles, resolveRepoTopics } from "./infra-builder.js";
import { buildTreeItems, buildCommitPayload } from "./commit-builder.js";
import { createDebugger } from "../../../lib/debug.js";

const dbg = createDebugger("GitHubHandler");

export class GitHubHandler extends BaseGitHandler {
    constructor() {
        super("github", "GitHub");
        this.dbg = dbg;
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
                {
                    key: "pages_show_verification",
                    label: "Show commit verification in report",
                    type: "toggle",
                    default: false,
                    description:
                        "If enabled, the generated Pages report will include a verification summary of recent commits (verified vs total).",
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
                    placeholder:
                        "arrays, dynamic-programming, competitive-programming",
                },
                {
                    key: "github_coauthor_enabled",
                    label: "Include optional co-author trailer",
                    type: "toggle",
                    default: true,
                    description:
                        "Append a Co-authored-by trailer to commits (you can opt out anytime).",
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

    _withOptionalCoAuthor(message, settings = {}) {
        if (settings.github_coauthor_enabled === false) return message;
        const trailer = String(settings.github_coauthor_trailer || "").trim();
        if (!/^Co-authored-by:\s+.+\s+<.+>$/.test(trailer)) return message;
        if (message.includes(trailer)) return message;
        return `${message}\n\n${trailer}`;
    }

    async commit(files, message, repoName, opts = {}) {
        const token = await this.getToken();
        if (!token) throw new Error("Not authenticated with GitHub");

        dbg.log(
            `commit(): starting commit to ${repoName} with ${files?.length || 0} files`
        );
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
        const branch = CONSTANTS.REPO_BRANCH || "main";
        dbg.log(`commit(): owner=${owner}, repo=${name}, branch=${branch}`);

        // Ensure repo exists
        let latestCommitSha;
        let isNewRepo = false;

        try {
            dbg.log(`commit(): fetching ref ${branch}...`);
            const refRes = await api.getRepoRef(owner, name, branch, token);
            latestCommitSha = refRes.object.sha;
            dbg.log(
                `commit(): ✓ ref found, latest SHA=${latestCommitSha.substring(0, 7)}`
            );
        } catch (err) {
            if (err.status === 404) {
                dbg.log(`commit(): repo not found, creating new repo...`);
                await api.createRepository(name, token);
                isNewRepo = true;
                dbg.log(
                    `commit(): ✓ repo created, waiting 3s for initialization...`
                );
                await new Promise((resolve) => setTimeout(resolve, 3000));
                await this._configureRepo(owner, name, token, settings);

                const refRes = await api.getRepoRef(owner, name, branch, token);
                latestCommitSha = refRes.object.sha;
                dbg.log(
                    `commit(): ✓ initial ref acquired, SHA=${latestCommitSha.substring(0, 7)}`
                );
            } else {
                dbg.error(`commit(): ✗ ref fetch failed:`, err.message);
                throw err;
            }
        }

        // Get base tree
        dbg.log(`commit(): fetching commit object...`);
        const commitObj = await api.getCommit(
            owner,
            name,
            latestCommitSha,
            token
        );
        const baseTreeSha = commitObj?.tree?.sha || null;
        dbg.log(
            `commit(): ✓ base tree SHA=${(baseTreeSha || "").substring(0, 7)}`
        );

        // Build tree items
        const treeItems = buildTreeItems(files, opts.deletes);
        dbg.log(
            `commit(): prepared ${treeItems.length} tree items (${files.length} adds, ${opts.deletes?.length || 0} deletes)`
        );

        // Add infrastructure files
        if (!opts.isMirror) {
            const infraFiles = await buildInfraFiles(
                owner,
                name,
                branch,
                token,
                settings,
                isNewRepo
            );
            dbg.log(`commit(): adding ${infraFiles.length} infra file(s)`);
            treeItems.push(...infraFiles);
        }

        // Create tree
        dbg.log(`commit(): creating tree with ${treeItems.length} items...`);
        const treeRes = await api.createTree(
            owner,
            name,
            treeItems,
            baseTreeSha,
            token
        );
        dbg.log(`commit(): ✓ tree created, SHA=${treeRes.sha.substring(0, 7)}`);

        // Create commit
        if (opts.date)
            dbg.log(
                `commit(): backdating commit to ${new Date(opts.date).toISOString()}`
            );
        const commitPayload = buildCommitPayload(
            this._withOptionalCoAuthor(message, settings),
            treeRes.sha,
            latestCommitSha,
            opts,
            userRes
        );

        dbg.log(`commit(): creating commit object...`);
        const commitRes = await api.createCommit(
            owner,
            name,
            commitPayload,
            token
        );
        dbg.log(
            `commit(): ✓ commit created, SHA=${commitRes.sha.substring(0, 7)}`
        );

        // Update ref
        dbg.log(`commit(): updating ref ${branch}...`);
        await api.updateRef(owner, name, branch, commitRes.sha, token);
        dbg.log(`commit(): ✓ ref updated`);

        if (isNewRepo && settings["github_pages"] !== false) {
            dbg.log(`commit(): enabling GitHub Pages...`);
            api.enablePages(owner, name, branch, token)
                .then(() => dbg.log(`commit(): ✓ GitHub Pages enabled`))
                .catch((e) =>
                    dbg.warn(
                        `commit(): Pages enable failed (non-fatal):`,
                        e.message
                    )
                );
        }

        dbg.log(
            `commit(): ✅ commit successful to ${owner}/${name} on ${branch}`
        );
    }

    async commitHistorical(commits) {
        if (!commits || !commits.length) return;
        const sorted = [...commits].sort(
            (a, b) => new Date(a.date) - new Date(b.date)
        );
        for (const entry of sorted) {
            await this.commit(entry.files, entry.message, entry.repoName, {
                date: entry.date,
            });
        }
    }

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
            token
        );
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
            token
        );

        await api.setRepositoryTopics(
            owner,
            name,
            resolveRepoTopics(settings),
            token
        );
    }

    async getToken() {
        const oauthToken = await Storage.getAuthToken("github");
        if (oauthToken) return oauthToken;
        const settings = await Storage.getSettings();
        return settings["github_token"] || null;
    }
}
