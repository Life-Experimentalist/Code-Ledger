/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Chat Sync — persists AI conversations to the GitHub repo as Markdown files.
 * Path format: chats/{ISO-timestamp}-{shortId}.md
 * Each file has YAML frontmatter (title, date, problems, provider, model, surface).
 *
 * Designed for fire-and-forget use: errors are logged, never thrown.
 */

import { createDebugger } from "../lib/debug.js";
import { getAllChats, getPendingSyncChats, markChatSynced, getDeletedChatPaths, clearDeletedChatPaths } from "./ai-chat-storage.js";

const dbg = createDebugger("ChatSync");

// ── Markdown builder ──────────────────────────────────────────────────────────

/**
 * Convert a chat record to a Markdown string with YAML frontmatter.
 * @param {object} chat
 * @returns {string}
 */
export function buildChatMarkdown(chat) {
    const title = (chat.aiTitle || chat.summary || "Chat").replace(/"/g, "'");
    const date = new Date(chat.createdAt || Date.now()).toISOString();

    // Build problems list — combine problemSlug + attachedProblemSlugs, dedupe
    const problems = Array.from(new Set([
        ...(chat.problemSlug ? [chat.problemSlug] : []),
        ...(Array.isArray(chat.attachedProblemSlugs) ? chat.attachedProblemSlugs : []),
    ])).filter(Boolean);

    const problemsYaml = problems.length > 0
        ? `\nproblems: [${problems.map(p => `"${p}"`).join(", ")}]`
        : "\nproblems: []";

    const providerLine = chat.provider ? `\nprovider: ${chat.provider}` : "";
    const modelLine = chat.model ? `\nmodel: ${chat.model}` : "";
    const surfaceLine = chat.surface ? `\nsurface: ${chat.surface}` : "";

    const frontmatter = `---\ntitle: "${title}"\ndate: "${date}"${problemsYaml}${providerLine}${modelLine}${surfaceLine}\n---\n\n`;

    const messages = Array.isArray(chat.messages) ? chat.messages : [];
    if (messages.length === 0) return frontmatter + "_No messages._\n";

    const body = messages.map(msg => {
        const role = msg.role === "assistant" ? "### Assistant" : "### User";
        const content = String(msg.content || "").trim();
        return `${role}\n\n${content}`;
    }).join("\n\n---\n\n");

    return frontmatter + body + "\n";
}

/**
 * Derive the canonical GitHub file path for a chat.
 * Uses the chat's createdAt timestamp to produce a stable path.
 * @param {object} chat - must have `id` and `createdAt`
 * @returns {string}
 */
export function chatFilePath(chat) {
    const ts = new Date(chat.createdAt || Date.now()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const shortId = String(chat.id || Math.random().toString(36).slice(2, 8)).toString().slice(-6);
    return `chats/${ts}-${shortId}.md`;
}

// ── GitHub sync ───────────────────────────────────────────────────────────────

/**
 * Commit all pending (unsynchronised) chats and process any tombstoned deletions.
 * Performs a single Trees API commit to minimise API calls.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {object} git  - GitHandler instance (has `.commit(files, msg, repo, opts)`)
 * @returns {Promise<void>}
 */
export async function flushPendingChatSync(owner, repo, git) {
    try {
        const [pending, deletedPaths] = await Promise.all([
            getPendingSyncChats(),
            getDeletedChatPaths(),
        ]);

        if (pending.length === 0 && deletedPaths.length === 0) return;

        dbg.log(`flushPendingChatSync(): ${pending.length} to upsert, ${deletedPaths.length} to delete`);

        const files = pending.map(chat => {
            const path = chat._githubPath || chatFilePath(chat);
            return { path, content: buildChatMarkdown(chat), _chatId: chat.id, _path: path };
        });

        const commitMsg = pending.length > 0
            ? `chore: sync ${pending.length} AI chat${pending.length > 1 ? "s" : ""}`
            : `chore: remove ${deletedPaths.length} deleted chat${deletedPaths.length > 1 ? "s" : ""}`;

        await git.commit(
            files.map(f => ({ path: f.path, content: f.content })),
            commitMsg,
            repo,
            { ownerOverride: owner, deletes: deletedPaths },
        );

        // Mark synced and clear tombstones
        await Promise.all([
            ...files.map(f => markChatSynced(f._chatId, f._path)),
            clearDeletedChatPaths(),
        ]);

        dbg.log(`flushPendingChatSync(): ✓ flushed ${files.length} chats`);
    } catch (e) {
        dbg.warn(`flushPendingChatSync(): failed:`, e?.message || e);
    }
}

// ── Import from repo ──────────────────────────────────────────────────────────

/**
 * Parse a chat Markdown file back into a partial chat record.
 * Only returns the fields that can be derived from the file; `id` is not set.
 * @param {string} content
 * @param {string} filePath
 * @returns {object}
 */
export function parseChatMarkdown(content, filePath = "") {
    const chat = {
        _githubPath: filePath,
        messages: [],
        problems: [],
        title: "",
        date: "",
        provider: "",
        model: "",
        surface: "",
    };

    // Extract frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
        const fm = fmMatch[1];
        const get = (key) => { const m = fm.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?`, "m")); return m ? m[1].trim() : ""; };
        chat.title = get("title");
        chat.date = get("date");
        chat.provider = get("provider");
        chat.model = get("model");
        chat.surface = get("surface");

        const probMatch = fm.match(/^problems:\s*\[([^\]]*)\]/m);
        if (probMatch) {
            chat.problems = probMatch[1].split(",").map(s => s.trim().replace(/"/g, "")).filter(Boolean);
        }
    }

    // Extract messages
    const body = content.replace(/^---\n[\s\S]*?\n---\n\n?/, "");
    const sections = body.split(/\n---\n/);
    for (const section of sections) {
        const userMatch = section.match(/^### User\n\n([\s\S]*)/);
        const assistantMatch = section.match(/^### Assistant\n\n([\s\S]*)/);
        if (userMatch) chat.messages.push({ role: "user", content: userMatch[1].trim() });
        else if (assistantMatch) chat.messages.push({ role: "assistant", content: assistantMatch[1].trim() });
    }

    return chat;
}

/**
 * Fetch all chats from the repo's `chats/` directory and import them locally.
 * Skips chats that already exist locally (matched by _githubPath).
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} token
 * @param {Function} getContentsFn - `(owner, repo, path, token) => Promise<object>`
 * @param {Function} importFn - `(chats: object[]) => Promise<void>`
 * @returns {Promise<number>} count of imported chats
 */
export async function importChatsFromRepo(owner, repo, token, getContentsFn, importFn) {
    try {
        let dirListing;
        try {
            dirListing = await getContentsFn(owner, repo, "chats", token);
        } catch (e) {
            if (e?.status === 404) return 0; // chats/ dir doesn't exist yet
            throw e;
        }

        if (!Array.isArray(dirListing)) return 0;

        const mdFiles = dirListing.filter(f => f.type === "file" && f.name.endsWith(".md"));
        if (mdFiles.length === 0) return 0;

        // Get existing githubPaths to skip already-synced chats
        const localChats = await getAllChats();
        const knownPaths = new Set(localChats.map(c => c._githubPath).filter(Boolean));

        const toImport = mdFiles.filter(f => !knownPaths.has(f.path));
        if (toImport.length === 0) return 0;

        dbg.log(`importChatsFromRepo(): fetching ${toImport.length} new chat(s)`);

        const imported = [];
        for (const file of toImport) {
            try {
                const fileData = await getContentsFn(owner, repo, file.path, token);
                const raw = fileData?.content ? atob(fileData.content.replace(/\n/g, "")) : "";
                if (!raw) continue;
                const parsed = parseChatMarkdown(raw, file.path);
                imported.push({
                    problemSlug: parsed.problems[0] || "",
                    problemURL: "",
                    platform: "leetcode",
                    messages: parsed.messages,
                    attachedProblemSlugs: parsed.problems,
                    summary: parsed.title,
                    aiTitle: parsed.title,
                    provider: parsed.provider,
                    model: parsed.model,
                    surface: parsed.surface || "problem-modal",
                    _githubPath: file.path,
                    _pendingSync: false,
                    createdAt: parsed.date ? new Date(parsed.date).getTime() : Date.now(),
                    updatedAt: Date.now(),
                });
            } catch (e) {
                dbg.warn(`importChatsFromRepo(): failed to import ${file.path}:`, e?.message);
            }
        }

        if (imported.length > 0) {
            await importFn(imported);
            dbg.log(`importChatsFromRepo(): ✓ imported ${imported.length} chat(s)`);
        }
        return imported.length;
    } catch (e) {
        dbg.warn(`importChatsFromRepo(): failed:`, e?.message || e);
        return 0;
    }
}
