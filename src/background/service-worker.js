/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    initDebug,
    coreDebug,
    setDebug,
    createDebugger,
} from "../lib/debug.js";
import { registry } from "../core/handler-registry.js";
import { eventBus } from "../core/event-bus.js";
import { Storage } from "../core/storage.js";
import { Telemetry } from "../core/telemetry.js";
import { initializeHandlers } from "../handlers/init.js";
import { CONSTANTS } from "../core/constants.js";
import { buildConversationSystemPrompt } from "../core/ai-prompts.js";
import { expandChatVariables } from "../lib/chat-variables.js";
import {
    handleRefreshMetadata,
    completeRefreshMetadata,
} from "./refresh-metadata-handler.js";
import { triggerCodeRecovery } from "./code-recovery-handler.js";
import {
    buildProblemFiles,
    problemBase,
    LAYOUT_VERSION,
} from "../core/path-builder.js";
import { getChatsByProblem } from "../core/ai-chat-storage.js";
import {
    buildCommitMessage,
    COMMIT_TYPES,
    resolveCommitType,
} from "../core/commit-messages.js";
import {
    migrateRepo,
    resetRepo,
    forceRebuildRepo,
    detectRepoLayoutVersion,
    migrateProblemIds,
} from "./migration-manager.js";
import { SyncEngine, importFromRepo, applyImport } from "./sync-engine.js";
import { detectDuplicate, normalizeCode } from "../core/duplicate-detector.js";
import {
    autoSyncSettings,
    syncSettingsToGitHub,
    syncSettingsFromGitHub,
} from "../core/settings-sync.js";
import {
    initializeReviewQueueStore,
    getNextPendingReview,
    markProcessing,
    markDone,
    markFailedWithRetry,
    getQueueStats,
    enqueueReview,
    cancelPendingReviews,
    clearCompletedReviews,
    removeQueueItem,
    getAllQueueItems,
    RATE_LIMIT_DELAY_MS_EXPORT as REVIEW_RATE_LIMIT_MS,
} from "../core/ai-review-queue.js";
import {
    needsSettingsCommit,
    getConfigFileForCommit,
    clearSettingsCommitFlag,
    forceCommitSettingsNow,
} from "../core/settings-auto-commit.js";
import { initMCPConfig, shouldUseToolsForAI } from "../core/mcp-config.js";
import {
    buildSkillsSystemPrompt,
    getAutoToolIds,
} from "../core/ai/skills-registry.js";
import { buildKnowledgeContext } from "../core/memory/knowledge-bank.js";
import {
    maybeCommitRollingBackup,
    listBackups,
    commitBackupToGitHub,
    fetchBackupSnapshot,
} from "../core/backup/backup-manager.js";
import { findDuplicatesForProblem } from "../core/ai-deduplication.js";
import {
    apiFetch as ghApiFetch,
    getCurrentUser as ghGetCurrentUser,
    getContents as ghGetContents,
} from "../handlers/git/github/api-client.js";

let _syncAlarmBound = false;
let _reviewQueueAlarmBound = false;
let _resyncInProgress = false;
let _activeSyncPort = null;

const dbg = createDebugger("ServiceWorker");

// Init background
async function init() {
    await initDebug();
    dbg.log(`init(): ✓ debug initialized, background starting...`);

    // First-run defaults: disable all AI providers and non-GitHub git providers.
    // Only runs once — subsequent startups detect the flag and skip.
    await applyFirstRunDefaults();

    // Migrate existing problem IDs to platform-scoped format (lc/gfg/cf prefix).
    migrateProblemIds().catch((e) =>
        dbg.error(`init(): migrateProblemIds failed:`, e)
    );

    // Register handlers
    dbg.log(`init(): registering handlers...`);
    initializeHandlers();

    // Initialize MCP config (first-run defaults)
    await initMCPConfig();

    // Initialize AI review queue store
    await initializeReviewQueueStore();

    // Detect extension updates and flag migration if needed
    try {
        const manifest = chrome.runtime.getManifest();
        const settings = await Storage.getSettings();
        const lastVer = settings.lastKnownVersion || "";
        const curVer = manifest.version;
        if (lastVer !== curVer) {
            const updates = { lastKnownVersion: curVer };
            if (lastVer && lastVer !== curVer) updates.extensionUpdated = true;
            await Storage.setSettings({ ...settings, ...updates });
            dbg.log(
                `init(): extension updated: ${lastVer || "first run"} → ${curVer}`
            );
        }
    } catch (e) {
        dbg.warn(`init(): version check failed:`, e.message);
    }

    // Set up event listeners
    eventBus.on("problem:solved", handleSolved);

    chrome.tabs.onRemoved.addListener((tabId) => {
        completeRefreshMetadata(tabId);
    });

    // (onConnect listener registered at top level — see below init())

    if (!_syncAlarmBound) {
        _syncAlarmBound = true;
        try {
            chrome.alarms.create(CONSTANTS.ALARM_NAMES.SYNC, {
                periodInMinutes: CONSTANTS.SYNC_ALARM_PERIOD_MIN || 30,
            });
            chrome.alarms.create("AI_REVIEW_QUEUE", { periodInMinutes: 5 }); // Check queue every 5 minutes

            chrome.alarms.onAlarm.addListener((alarm) => {
                if (alarm?.name === CONSTANTS.ALARM_NAMES.SYNC) {
                    SyncEngine.performSync().catch((e) =>
                        dbg.warn("periodic sync failed:", e.message)
                    );
                } else if (alarm?.name === "AI_REVIEW_QUEUE") {
                    processAIReviewQueue().catch((e) =>
                        dbg.warn(
                            "AI review queue processing failed:",
                            e.message
                        )
                    );
                }
            });
        } catch (e) {
            dbg.warn("failed to initialize alarms:", e.message);
        }
    }

    // Initialize AI review queue store
    await initializeReviewQueueStore().catch((e) =>
        dbg.warn("failed to initialize review queue:", e)
    );

    SyncEngine.performSync().catch(() => {});
    processAIReviewQueue().catch(() => {});
    autoSyncSettings().catch(() => {});

    dbg.log("init(): ✓ background initialized");
}

async function applyFirstRunDefaults() {
    try {
        const settings = await Storage.getSettings();
        if (settings._defaultsApplied) {
            dbg.log(`applyFirstRunDefaults(): already applied, skipping`);
            return;
        }
        dbg.log(`applyFirstRunDefaults(): applying first-run defaults...`);
        const updates = { _defaultsApplied: true };
        // Disable all AI providers — user must explicitly enable after adding a key
        let aiProvidersDisabled = 0;
        Object.keys(CONSTANTS.AI_PROVIDERS || {}).forEach((id) => {
            if (!(`${id}_enabled` in settings)) {
                updates[`${id}_enabled`] = false;
                aiProvidersDisabled++;
            }
        });
        // Default git provider to GitHub (already the code default, but make it explicit)
        if (!settings.gitProvider) {
            updates.gitProvider = "github";
            dbg.log(`applyFirstRunDefaults(): set gitProvider=github`);
        }
        // Default: auto-review off until user has configured an AI provider
        if (!("autoReview" in settings)) {
            updates.autoReview = false;
            dbg.log(`applyFirstRunDefaults(): set autoReview=false`);
        }
        await Storage.setSettings({ ...settings, ...updates });
        dbg.log(
            `applyFirstRunDefaults(): ✓ disabled ${aiProvidersDisabled} AI provider(s), applied defaults`
        );
    } catch (e) {
        // Non-fatal — defaults will apply via UI
        dbg.warn(
            `applyFirstRunDefaults(): ✗ caught error (non-fatal):`,
            e?.message
        );
    }
}

function getProblemCommitKey(problem = {}) {
    // Align with sync-engine._syncCommitKey: use platform-scoped ID to match remote index.json
    const id = String(
        problem.id ||
            CONSTANTS.makeProblemId(
                problem.platform || "unknown",
                problem.titleSlug || problem.slug || "unknown"
            )
    ).trim();
    if (!id) return "";

    const lang =
        problem.lang?.name ||
        problem.lang?.slug ||
        problem.lang?.ext ||
        problem.language ||
        "";
    const normLang = String(lang).toLowerCase().trim();

    return normLang ? `${id}::${normLang}` : id;
}

function getProblemFiles(problem = {}, settings = {}) {
    const files = buildProblemFiles(problem, settings);
    if (files.length > 0) return files;

    // Fallback for legacy records that lack readmeContent/code on the object.
    if (problem.code) {
        const lang = problem.lang || {
            verbose: "Solution",
            name: "solution",
            ext: "txt",
        };
        const canonical = problem.canonical || null;
        const slug = problem.id || problem.titleSlug || "unknown";
        const root = CONSTANTS.PROBLEMS_DIR_DEFAULT.replace(/\/+$/, "");
        const dir = canonical?.canonicalId || slug;
        const verbose = (lang.verbose || lang.name || "Solution").replace(
            /\s+/g,
            "_"
        );
        const ext = lang.ext || "txt";
        const filePath = canonical?.canonicalId
            ? `${root}/${dir}/${problem.platform}/${verbose}.${ext}`
            : `${root}/${dir}/${verbose}.${ext}`;
        return [{ path: filePath, content: problem.code }];
    }
    return [];
}

function _stableJSON(value) {
    if (value == null) return "";
    if (Array.isArray(value))
        return JSON.stringify(
            value.map((v) => (typeof v === "string" ? v.trim() : v))
        );
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function _isProblemDrifted(local, remote) {
    if (!remote) return true;
    const keys = [
        "title",
        "difficulty",
        "code",
        "tags",
        "lang",
        "aiReview",
        "canonical",
        "files",
    ];
    return keys.some(
        (k) => _stableJSON(local?.[k]) !== _stableJSON(remote?.[k])
    );
}

function _providerModelKey(provider) {
    const id = String(provider?.id || "").trim();
    const model = String(provider?.model || "").trim();
    return `${id}::${model}`;
}

function _targetKey(target = {}) {
    return `${target.provider || "github"}:${target.owner || ""}/${target.repo || ""}`;
}

function _buildAIReviewProviders(settings = {}) {
    const seen = new Set();
    return [
        {
            id: settings.aiProvider || "gemini",
            model: settings.aiPrimaryModel || "",
        },
        {
            id: settings.aiSecondary || "",
            model: settings.aiSecondaryModel || "",
        },
        ...CONSTANTS.AI_FALLBACK_CHAIN.map((id) => ({ id, model: "" })),
    ].filter((provider) => {
        if (!provider.id) return false;
        const key = _providerModelKey(provider);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

async function generateAIReview(problem = {}, settings = null) {
    dbg.log(
        `generateAIReview(): starting for ${problem.titleSlug || "unknown"}`
    );
    const currentSettings = settings || (await Storage.getSettings());
    const providers = _buildAIReviewProviders(currentSettings);
    dbg.log(
        `generateAIReview(): ${providers.length} provider(s) in fallback chain`
    );

    let inferredTags = null;
    for (let idx = 0; idx < providers.length; idx++) {
        const provider = providers[idx];
        const providerId = provider.id;
        dbg.log(
            `generateAIReview(): attempt ${idx + 1}/${providers.length} — provider=${providerId}`
        );
        if (currentSettings[`${providerId}_enabled`] === false) {
            dbg.log(
                `generateAIReview(): ✗ ${providerId} disabled in settings, skipping`
            );
            continue;
        }

        const ai = registry.getAIProvider(providerId);
        if (!ai) {
            dbg.warn(
                `generateAIReview(): ✗ handler for ${providerId} not found`
            );
            continue;
        }

        try {
            // Wrap review call with timeout to avoid hanging on slow providers.
            // Keep below the ProblemModal's 90s total timeout so the fallback
            // chain has a chance to run if the first provider stalls.
            const TIMEOUT_MS = 30000;
            dbg.log(
                `generateAIReview(): calling ${providerId} with ${TIMEOUT_MS}ms timeout`
            );
            let review = await Promise.race([
                ai.review(problem.code, {
                    ...problem,
                    aiModelOverride: provider.model || "",
                }),
                new Promise((_, rej) =>
                    setTimeout(
                        () => rej(new Error("AI provider timeout")),
                        TIMEOUT_MS
                    )
                ),
            ]);

            if (!review || String(review).trim() === "") {
                dbg.warn(
                    `generateAIReview(): ✗ ${providerId} returned empty review, trying next provider`
                );
                continue;
            }

            dbg.log(
                `generateAIReview(): ✓ success via ${providerId} (${String(review).length} chars)`
            );

            // Parse AI-inferred tags if the problem had none
            if (review && (!problem.tags || problem.tags.length === 0)) {
                const tagsMatch = review.match(/^TAGS:\s*(.+)$/m);
                if (tagsMatch) {
                    const parsed = tagsMatch[1].split(",").map((t) => t.trim()).filter(Boolean);
                    if (parsed.length) {
                        inferredTags = parsed;
                        dbg.log(`generateAIReview(): inferred tags: ${parsed.join(", ")}`);
                    }
                    // Strip TAGS line from review so it doesn't appear in the UI
                    review = review.replace(/^TAGS:\s*.+$/m, "").trim();
                }
            }

            return { review, providerId, inferredTags };
        } catch (err) {
            if (
                String(err?.message || "")
                    .toLowerCase()
                    .includes("timeout")
            ) {
                dbg.warn(
                    `generateAIReview(): ✗ ${providerId} timed out (${TIMEOUT_MS}ms)`
                );
            } else {
                dbg.error(
                    `generateAIReview(): ✗ ${providerId} failed:`,
                    err?.message || err
                );
            }
        }
    }

    dbg.error(
        `generateAIReview(): ✗ all providers exhausted for ${problem.titleSlug || "unknown"}`
    );
    throw new Error(
        "No AI providers available or configured. Add an API key in Settings → AI."
    );
}

async function commitUpdatedProblem(problem, settings) {
    const currentSettings = settings || (await Storage.getSettings());
    const gitEnabled =
        currentSettings.gitEnabled !== false &&
        currentSettings.gitEnabled !== 0;
    dbg.log(
        `commitUpdatedProblem(): ${problem.titleSlug || "unknown"}, git_enabled=${gitEnabled}`
    );
    if (!gitEnabled) {
        dbg.log(`commitUpdatedProblem(): git disabled, returning skipped`);
        return { committed: 0, skipped: true };
    }

    const repoName = currentSettings.github_repo || currentSettings.gitRepo;
    dbg.log(`commitUpdatedProblem(): repo=${repoName}`);
    const filesToCommit = [];
    for (const file of getProblemFiles(problem, currentSettings)) {
        if (file?.path) filesToCommit.push(file);
    }
    filesToCommit.push({ path: "index.json", content: await buildIndexJson() });
    dbg.log(`commitUpdatedProblem(): prepared ${filesToCommit.length} file(s)`);

    const commitKey = getProblemCommitKey(problem);
    if (commitKey) {
        await Storage.markPendingProblemKey(commitKey).catch(() => {});
    }

    try {
        await _commitWithFailover(
            filesToCommit,
            buildCommitMessage(COMMIT_TYPES.UPDATE, problem),
            repoName,
            {
                date: new Date(
                    problem.timestamp
                        ? problem.timestamp > 1e10
                            ? problem.timestamp
                            : problem.timestamp * 1000
                        : Date.now()
                ),
            },
            currentSettings
        );
        dbg.log(`commitUpdatedProblem(): ✓ commit succeeded`);
        _maybeGenerateAISummary(currentSettings).catch(() => {});
        // Rolling backup — fire-and-forget, errors logged internally
        const _git = registry.getGitProvider(
            currentSettings.gitProvider || "github"
        );
        if (_git) {
            const _owner =
                currentSettings.github_owner ||
                currentSettings.github_username ||
                "";
            const _token = await _git.getToken().catch(() => null);
            if (_owner && _token) {
                maybeCommitRollingBackup(_owner, repoName, _token, _git).catch(
                    () => {}
                );
            }
        }
    } catch (e) {
        dbg.error(`commitUpdatedProblem(): ✗ commit failed:`, e?.message);
        throw e;
    }

    if (commitKey) {
        await Storage.clearPendingProblemKeys([commitKey]).catch(() => {});
    }

    return { committed: 1, repo: repoName };
}

function _normalizeGitTarget(target) {
    if (!target?.repo) return null;
    return {
        provider: target.provider || "github",
        owner: target.owner || "",
        repo: String(target.repo || "")
            .replace(/\s+/g, "-")
            .trim(),
    };
}

function _getDefaultPrimaryTarget(settings = {}) {
    const repo = (settings.github_repo || settings.gitRepo || "")
        .replace(/\s+/g, "-")
        .trim();
    if (!repo) return null;
    return _normalizeGitTarget({
        provider: settings.gitProvider || "github",
        owner: settings.github_owner || settings.github_username || "",
        repo,
    });
}

function _getOrderedTargets(settings = {}) {
    const ordered = [];
    const seen = new Set();
    const active = _normalizeGitTarget(settings.git_active_primary || null);
    const primary = _getDefaultPrimaryTarget(settings);
    const mirrors = Array.isArray(settings.git_mirrors)
        ? settings.git_mirrors.map(_normalizeGitTarget).filter(Boolean)
        : [];

    for (const t of [active, primary, ...mirrors]) {
        if (!t) continue;
        const key = _targetKey(t);
        if (seen.has(key)) continue;
        seen.add(key);
        ordered.push(t);
    }
    return ordered;
}

async function _commitWithFailover(
    files,
    message,
    repoName,
    commitOpts,
    settings
) {
    const targets = _getOrderedTargets(settings);
    dbg.log(`_commitWithFailover(): resolved ${targets.length} target(s)`);
    if (!targets.length) {
        const git = registry.getGitProvider(settings.gitProvider || "github");
        if (!git) throw new Error("No git provider configured");
        dbg.log(
            `_commitWithFailover(): no ordered targets; committing to configured provider ${settings.gitProvider || "github"} repo ${repoName || settings.github_repo || settings.gitRepo}`
        );
        const newSha = await git.commit(
            files,
            message,
            repoName || settings.github_repo || settings.gitRepo,
            commitOpts
        );
        return { handler: git, target: null, newSha };
    }

    let lastErr = null;
    for (const target of targets) {
        const handler = registry.getGitProvider(target.provider || "github");
        dbg.log(
            `_commitWithFailover(): attempting target ${target.provider}/${target.owner || ""}/${target.repo}`
        );
        if (!handler) continue;
        try {
            const newSha = await handler.commit(files, message, target.repo, {
                ...(commitOpts || {}),
                ownerOverride: target.owner || undefined,
                isMirror: false,
            });

            const active = settings.git_active_primary;
            const currentKey = active
                ? _targetKey(_normalizeGitTarget(active) || {})
                : "";
            const wonKey = _targetKey(target);
            if (currentKey !== wonKey) {
                await Storage.setSettings({
                    ...settings,
                    git_active_primary: target,
                }).catch(() => {});
            }
            dbg.log(
                `_commitWithFailover(): ✓ succeeded to ${target.provider}/${target.owner || ""}/${target.repo}`
            );
            return { handler, target, newSha };
        } catch (e) {
            lastErr = e;
            dbg.warn(
                `_commitWithFailover(): ✗ target ${target.provider}/${target.owner ? target.owner + "/" : ""}${target.repo} failed:`,
                e.message
            );
        }
    }

    if (lastErr) throw lastErr;
    throw new Error("No available git target succeeded");
}

async function _resolveGitHubContext(settings = null) {
    const s = settings || (await Storage.getSettings());
    const target =
        _getOrderedTargets(s).find((t) => t.provider === "github") ||
        _getDefaultPrimaryTarget(s);
    if (!target || target.provider !== "github") {
        throw new Error("No GitHub repository configured");
    }

    const git = registry.getGitProvider("github");
    if (!git) throw new Error("No git provider configured");
    const token = await git.getToken();
    if (!token) throw new Error("Not authenticated with GitHub");

    let owner = (target.owner || "").trim();
    if (!owner) {
        const userRes = await ghGetCurrentUser(token);
        owner = userRes.login;
    }

    return { settings: s, git, token, owner, repoName: target.repo, target };
}

async function handleSyncPreview() {
    const { settings, token, owner, repoName } = await _resolveGitHubContext();
    return importFromRepo(owner, repoName, token).then((result) => ({
        ...result,
        pendingConflicts: result.conflicts?.length || 0,
        pendingRemoteOnly: result.remoteOnly?.length || 0,
        repo: repoName,
        owner,
        provider: "github",
        sourceOfTruth: settings.sync_source_of_truth || "library",
    }));
}

async function handleSyncApplyImport(problems = []) {
    await applyImport(Array.isArray(problems) ? problems : []);
    return { saved: Array.isArray(problems) ? problems.length : 0 };
}
async function handleSolved(data) {
    dbg.log(
        `handleSolved(): received solve event, titleSlug=${data.titleSlug}`
    );

    // 0. Incognito mode guard — silently skip recording and committing
    {
        const settings = await Storage.getSettings();
        const mode = settings.incognitoMode;
        if (mode && mode !== "off" && mode !== false) {
            const forever = mode === "forever" || mode === true;
            const expiry = settings.incognitoExpiry ?? 0;
            const active = forever
                ? true
                : expiry === -1
                  ? true
                  : expiry > 0 && Date.now() < expiry;
            if (active) {
                dbg.log(
                    `handleSolved(): incognito mode active, discarding ${data.titleSlug}`
                );
                return;
            }
            // Timer expired — auto-reset to off
            await Storage.setSettings({
                ...settings,
                incognitoMode: "off",
                incognitoExpiry: 0,
            }).catch(() => {});
        }
    }

    const titleSlug = data.titleSlug || "";
    const langName = data.lang?.name || data.lang?.slug || data.lang?.ext || "";
    const submissionCommitKey = data.submissionId
        ? `submission:${data.platform || "unknown"}:${data.submissionId}`
        : `submission:${data.platform || "unknown"}:${titleSlug}:${langName}:${data.timestamp || data.id || Date.now()}`;
    const alreadyCommitted = await Storage.isSubmissionCommitted(
        submissionCommitKey
    ).catch(() => false);
    dbg.log(
        `handleSolved(): tracking - platform=${data.platform}, slug=${titleSlug}, lang=${langName}, already_committed=${alreadyCommitted}`
    );

    // 2. Save locally — for bulk imports, skip if the user has manually edited this record.
    if (data.skipCommit) {
        const existing = await Storage.getProblem(data.id).catch(() => null);
        if (existing?.manuallyEdited) {
            dbg.log(
                `handleSolved(): skipping import overwrite (manually edited) ${titleSlug}`
            );
            return;
        }
    }
    await Storage.saveProblem(data);
    {
        const problemCommitKey = getProblemCommitKey(data);
        if (problemCommitKey) {
            await Storage.markPendingProblemKey(problemCommitKey).catch(
                () => {}
            );
        }
    }

    // 3. AI Review (if enabled)
    // Note: settings is loaded here so rename detection below can use it too
    const settings = await Storage.getSettings();

    // Detect canonical path migration — schedule rename if stored base differs from new base
    if (data.canonical?.id && data._storedBasePath) {
        const expectedBase = problemBase(
            data.id || data.titleSlug,
            { canonicalId: data.canonical.id },
            settings,
            data.platform
        );
        if (data._storedBasePath !== expectedBase) {
            await Storage.markRenameNeeded(data.id, {
                oldBase: data._storedBasePath,
                newBase: expectedBase,
            }).catch(() => {});
        }
    }
    // Decide whether to run AI review:
    // - global `autoReview` setting
    if (shouldAutoReview) {
        try {
            const { review, providerId } = await generateAIReview(
                data,
                settings
            );
            data.aiReview = review;
            await Storage.saveProblem(data);
            dbg.log(`handleSolved(): ✓ AI review success via ${providerId}`);
        } catch (err) {
            // 3b. Duplicate Detection — check if code matches existing solutions
            try {
                const allProblems = await Storage.getAllProblems().catch(
                    () => []
                );
                const dupResult = detectDuplicate(data, allProblems);
                if (dupResult.isDuplicate) {
                    data.isDuplicate = true;
                    data.duplicateOf = dupResult.duplicateOf;
                    dbg.log(
                        `handleSolved(): duplicate detected: ${data.titleSlug} matches ${dupResult.duplicateOf}`
                    );
                    await Storage.saveProblem(data);
                }
            } catch (dupErr) {
                dbg.error(
                    `handleSolved(): duplicate detection failed:`,
                    dupErr?.message || dupErr
                );
            }
        }
    }

    // 3c. Auto-merge deduplication: check for same-language solutions and queue for review if similar
    try {
        const existingProblem = await Storage.getProblem(data.id).catch(
            () => null
        );
        if (
            existingProblem &&
            existingProblem.solutions &&
            Array.isArray(existingProblem.solutions)
        ) {
            const sameLang = existingProblem.solutions.filter(
                (s) => s.lang === data.lang?.name || s.lang === data.lang?.slug
            );
            if (sameLang.length > 0) {
                const groups = await findDuplicatesForProblem(
                    {
                        ...existingProblem,
                        solutions: sameLang.concat([
                            { code: data.code, lang: data.lang?.name },
                        ]),
                    },
                    settings.aiProvider || "gemini"
                );
                // If this solution groups with existing ones, queue for review
                if (groups.length > 0 && groups[0].length > 1) {
                    const reviewKey = `dedup:${data.id}:${data.lang?.name}:${Date.now()}`;
                    await Storage.markPendingProblemKey(reviewKey).catch(
                        () => {}
                    );
                    dbg.log(
                        `handleSolved(): queued for review (dedup): ${data.titleSlug} (${data.lang?.name})`
                    );
                }
            }
        }
    } catch (err) {
        dbg.warn(
            `handleSolved(): auto-merge dedup failed (non-blocking):`,
            err?.message || err
        );
    }

    // 4. Git Commit — only auto-commit first time per (slug, language)
    // gitEnabled defaults to true when never explicitly set (matches schema default: true)
    const gitEnabled =
        settings.gitEnabled !== false && settings.gitEnabled !== 0;
    dbg.log(
        `handleSolved(): git config - enabled=${gitEnabled}, skipCommit=${!!data.skipCommit}, forceCommit=${!!data.forceCommit}`
    );
    if (data.skipCommit) {
        dbg.log(
            `handleSolved(): skipCommit flag set, skipping git commit for bulk import - ${titleSlug}`
        );
        return;
    }
    const forceCommit = !!data.forceCommit;
    if (gitEnabled && alreadyCommitted && !forceCommit) {
        dbg.log(
            `handleSolved(): already committed submission event, skipping auto-commit - ${submissionCommitKey}`
        );
    }
    if (gitEnabled && (forceCommit || !alreadyCommitted)) {
        dbg.log(
            `handleSolved(): starting auto-commit - type=${forceCommit ? "UPDATE" : "SOLVED"}`
        );
        try {
            const pendingMap = await Storage.getPendingProblemKeys().catch(
                () => ({})
            );
            const pendingKeys = new Set(Object.keys(pendingMap || {}));
            const allProblems = await Storage.getAllProblems().catch(() => []);
            const pendingProblems = allProblems.filter((p) => {
                const key = getProblemCommitKey(p);
                return key && pendingKeys.has(key);
            });

            const filesToCommit = [];
            const seenPaths = new Set();
            for (const p of pendingProblems) {
                for (const f of getProblemFiles(p, settings)) {
                    if (!f?.path || seenPaths.has(f.path)) continue;
                    seenPaths.add(f.path);
                    filesToCommit.push(f);
                }
                // Include user notes as a markdown file when present
                try {
                    if (
                        p.notes &&
                        typeof p.notes === "string" &&
                        p.notes.trim()
                    ) {
                        const base = problemBase(
                            p.id || p.titleSlug,
                            p.canonical,
                            settings,
                            p.platform
                        );
                        const notesPath = `${base}/notes.md`;
                        if (!seenPaths.has(notesPath)) {
                            seenPaths.add(notesPath);
                            filesToCommit.push({
                                path: notesPath,
                                content: p.notes,
                            });
                        }
                    }
                } catch (e) {
                    /* ignore */
                }
                // Include AI chats related to this problem
                try {
                    const slug = p.titleSlug || p.id || "";
                    if (slug) {
                        const chats = await getChatsByProblem(slug).catch(
                            () => []
                        );
                        const base = problemBase(
                            p.id || p.titleSlug,
                            p.canonical,
                            settings,
                            p.platform
                        );
                        if (Array.isArray(chats) && chats.length) {
                            for (const chat of chats) {
                                const chatPath = `${base}/ai-chats/chat-${chat.id}.json`;
                                if (seenPaths.has(chatPath)) continue;
                                seenPaths.add(chatPath);
                                filesToCommit.push({
                                    path: chatPath,
                                    content: JSON.stringify(chat, null, 2),
                                });
                            }
                        }
                    }
                } catch (e) {
                    /* ignore */
                }
            }

            filesToCommit.push({
                path: "index.json",
                content: await buildIndexJson(),
            });

            // Auto-commit settings if they've changed
            const configFile = await getConfigFileForCommit();
            if (configFile) {
                filesToCommit.push(configFile);
                dbg.log(`handleSolved(): including config file in commit`);
            }

            const pendingCount = pendingProblems.length || 1;
            const commitType = forceCommit
                ? COMMIT_TYPES.UPDATE
                : COMMIT_TYPES.SOLVED;
            const commitMsg =
                pendingCount > 1
                    ? buildCommitMessage(COMMIT_TYPES.CHORE, {
                          count: pendingCount,
                      })
                    : buildCommitMessage(commitType, data);
            dbg.log(
                `handleSolved(): commit prep - pending=${pendingCount}, type=${commitType}, files=${filesToCommit.length}`
            );
            const commitOpts = data.timestamp
                ? { date: new Date(data.timestamp) }
                : {};
            const primaryResult = await _commitWithFailover(
                filesToCommit,
                commitMsg,
                settings.github_repo || settings.gitRepo,
                commitOpts,
                settings
            );
            await Storage.markSubmissionCommitted(submissionCommitKey).catch(
                () => {}
            );
            await Storage.markSlugLangCommitted(
                data.id || titleSlug,
                langName
            ).catch(() => {});
            const clearedKeys = pendingProblems
                .map((p) => getProblemCommitKey(p))
                .filter(Boolean);
            await Storage.clearPendingProblemKeys(clearedKeys).catch(() => {});

            // Clear settings commit flag after successful commit
            await clearSettingsCommitFlag().catch(() => {});

            dbg.log(
                `handleSolved(): ✓ git commit successful - slug=${titleSlug}, cleared_keys=${clearedKeys.length}`
            );

            if (settings.notifications !== false) {
                try {
                    chrome.notifications.create({
                        type: "basic",
                        iconUrl: chrome.runtime.getURL(
                            "assets/icons/icon48.png"
                        ),
                        title: "CodeLedger: Committed!",
                        message: `${data.title || titleSlug} saved to GitHub.`,
                    });
                } catch (_) {}
            }

            // Scheduled backup on solve (if enabled)
            if (settings.schedBackupOnSolve) {
                const allP = await Storage.getAllProblems().catch(() => []);
                Storage.addScheduledBackup(
                    { problems: allP, settings },
                    "on-solve"
                ).catch(() => {});
            }

            // Fire-and-forget: rename files to canonical paths if needed
            performPendingRenames().catch(() => {});

            // Push to any configured mirrors (fire-and-forget; failures are non-fatal)
            await pushToMirrors(
                filesToCommit,
                commitMsg,
                commitOpts,
                settings,
                primaryResult.target ? _targetKey(primaryResult.target) : ""
            );
        } catch (err) {
            dbg.error(
                `handleSolved(): ✗ git commit failed for ${titleSlug}:`,
                err?.message || err
            );
            dbg.error(`handleSolved(): error details:`, err);
        }
    }

    Telemetry.track("solve", { platform: data.platform });
}

/**
 * Pushes the same files+message to all mirrors listed in settings.git_mirrors.
 * Each mirror entry: { provider: "github"|"gitlab", repo: string, owner?: string }
 * Failures are logged but never thrown — mirrors are best-effort.
 */
async function pushToMirrors(
    files,
    message,
    commitOpts,
    settings,
    skipTargetKey = ""
) {
    const mirrors = settings.git_mirrors;
    if (!Array.isArray(mirrors) || mirrors.length === 0) return;
    await Promise.allSettled(
        mirrors.map(async (mirror) => {
            if (!mirror?.repo) return;
            if (mirror.enabled === false) return;
            const normalized = _normalizeGitTarget(mirror);
            if (
                normalized &&
                skipTargetKey &&
                _targetKey(normalized) === skipTargetKey
            )
                return;
            const handler = registry.getGitProvider(
                mirror.provider || "github"
            );
            if (!handler) return;
            try {
                await handler.commit(files, message, mirror.repo, {
                    ...commitOpts,
                    ownerOverride: mirror.owner || undefined,
                });
                dbg.log(
                    `pushToMirrors(): ✓ mirror commit OK - ${mirror.provider}/${mirror.repo}`
                );
            } catch (e) {
                dbg.warn(
                    `pushToMirrors(): ✗ mirror commit failed - ${mirror.provider}/${mirror.repo}:`,
                    e.message
                );
            }
        })
    );
}

/**
 * Performs pending canonical renames as a single maintenance commit.
 * Called fire-and-forget after a normal solve commit.
 */
async function performPendingRenames() {
    const renames = await Storage.getPendingRenames().catch(() => []);
    if (!renames.length) return;

    const settings = await Storage.getSettings();
    const git = registry.getGitProvider(settings.gitProvider || "github");
    if (!git) return;
    const token = await git.getToken().catch(() => null);
    if (!token) return;

    const userRes = await ghGetCurrentUser(token).catch(() => null);
    const owner = settings.github_owner?.trim() || userRes?.login;
    const repo = (settings.github_repo || settings.gitRepo || "").replace(
        /\s+/g,
        "-"
    );
    if (!owner || !repo) return;

    const filesToAdd = [];
    const pathsToDelete = [];

    for (const r of renames) {
        try {
            const tree = await ghApiFetch(
                `/repos/${owner}/${repo}/git/trees/main?recursive=1`,
                token
            );
            const relevant = (tree.tree || []).filter(
                (f) => f.type === "blob" && f.path.startsWith(r.oldBase + "/")
            );
            for (const f of relevant) {
                const newPath = f.path.replace(r.oldBase, r.newBase);
                const blob = await ghApiFetch(
                    `/repos/${owner}/${repo}/git/blobs/${f.sha}`,
                    token
                );
                const content = atob((blob.content || "").replace(/\n/g, ""));
                filesToAdd.push({ path: newPath, content });
                pathsToDelete.push(f.path);
            }
        } catch (e) {
            dbg.warn(
                `performPendingRenames(): preflight failed for ${r.oldBase}:`,
                e.message
            );
        }
    }

    if (!filesToAdd.length && !pathsToDelete.length) {
        await Storage.clearPendingRenames().catch(() => {});
        return;
    }

    try {
        await git.commit(
            filesToAdd,
            `chore: reorganise ${renames.length} problem(s) to canonical paths [maintenance]`,
            repo,
            { deletes: pathsToDelete }
        );
        await Storage.clearPendingRenames().catch(() => {});
        dbg.log(
            `performPendingRenames(): ✓ committed ${renames.length} rename(s)`
        );
    } catch (e) {
        dbg.error(
            `performPendingRenames(): ✗ rename commit failed:`,
            e.message
        );
    }
}

/**
 * Build index.json content from an explicit problem list.
 * Used by the individual-commit loop so each checkpoint reflects only what
 * has actually been committed, not the full local library.
 */
function _buildIndexJsonFromList(problems, settings) {
    const stats = {
        total: problems.length,
        easy: problems.filter((p) => p.difficulty === "Easy").length,
        medium: problems.filter((p) => p.difficulty === "Medium").length,
        hard: problems.filter((p) => p.difficulty === "Hard").length,
        byPlatform: problems.reduce((acc, p) => { const k = p.platform || "unknown"; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
        byLang: problems.reduce((acc, p) => { const k = p.lang?.name || p.lang?.slug || "unknown"; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
        byTopic: problems.reduce((acc, p) => { const k = (p.tags && p.tags[0]) || p.topic || "uncategorized"; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
    };
    const meta = {
        summary: settings?._aiSummary || null,
        summaryUpdatedAt: settings?._aiSummaryUpdatedAt || null,
        commitsSinceLastSummary: settings?._commitsSinceLastSummary || 0,
    };
    return JSON.stringify({ updatedAt: new Date().toISOString(), layoutVersion: LAYOUT_VERSION, stats, meta, problems }, null, 2);
}

async function buildIndexJson() {
    const problems = await Storage.getAllProblems();
    dbg.log(
        `buildIndexJson(): building index for ${problems.length} problem(s)`
    );
    const stats = {
        total: problems.length,
        easy: problems.filter((p) => p.difficulty === "Easy").length,
        medium: problems.filter((p) => p.difficulty === "Medium").length,
        hard: problems.filter((p) => p.difficulty === "Hard").length,
        byPlatform: problems.reduce((acc, p) => {
            const plat = p.platform || "unknown";
            acc[plat] = (acc[plat] || 0) + 1;
            return acc;
        }, {}),
        byLang: problems.reduce((acc, p) => {
            const lang = p.lang?.name || p.lang?.slug || "unknown";
            acc[lang] = (acc[lang] || 0) + 1;
            return acc;
        }, {}),
        byTopic: problems.reduce((acc, p) => {
            const topic = (p.tags && p.tags[0]) || p.topic || "uncategorized";
            acc[topic] = (acc[topic] || 0) + 1;
            return acc;
        }, {}),
    };

    const settings = await Storage.getSettings();
    const meta = {
        summary: settings._aiSummary || null,
        summaryUpdatedAt: settings._aiSummaryUpdatedAt || null,
        commitsSinceLastSummary: settings._commitsSinceLastSummary || 0,
    };

    dbg.log(
        `buildIndexJson(): ✓ stats=easy:${stats.easy} med:${stats.medium} hard:${stats.hard}`
    );
    return JSON.stringify(
        {
            updatedAt: new Date().toISOString(),
            layoutVersion: LAYOUT_VERSION,
            stats,
            meta,
            problems,
        },
        null,
        2
    );
}

const SUMMARY_EVERY_N_COMMITS = 10;

async function _maybeGenerateAISummary(settings) {
    try {
        const count = (settings._commitsSinceLastSummary || 0) + 1;
        if (count < SUMMARY_EVERY_N_COMMITS) {
            await Storage.setSettings({
                ...settings,
                _commitsSinceLastSummary: count,
            });
            return;
        }
        dbg.log(
            `_maybeGenerateAISummary(): ${count} commits since last summary — generating...`
        );
        const problems = await Storage.getAllProblems();
        const total = problems.length;
        const byDiff = { Easy: 0, Medium: 0, Hard: 0 };
        const byTopic = {};
        problems.forEach((p) => {
            if (p.difficulty in byDiff) byDiff[p.difficulty]++;
            const t = (p.tags && p.tags[0]) || "uncategorized";
            byTopic[t] = (byTopic[t] || 0) + 1;
        });
        const topTopics = Object.entries(byTopic)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([t, n]) => `${t}(${n})`)
            .join(", ");
        const prompt = `You are an insightful DSA coach. Based on the following solve statistics, write a 2–3 sentence narrative summary of this user's progress and patterns. Be specific, encouraging, and note any trends (e.g., improving difficulty, strong topics, recently active areas). Use the timestamps to infer recent activity.\n\nStats: ${total} total problems — Easy: ${byDiff.Easy}, Medium: ${byDiff.Medium}, Hard: ${byDiff.Hard}. Top topics: ${topTopics}. Last commit: ${new Date().toLocaleDateString()}.`;
        const { review, providerId } = await generateAIReview(
            { code: prompt, titleSlug: "_summary" },
            settings
        );
        if (review) {
            dbg.log(
                `_maybeGenerateAISummary(): ✓ summary generated via ${providerId}`
            );
            await Storage.setSettings({
                ...settings,
                _aiSummary: review,
                _aiSummaryUpdatedAt: new Date().toISOString(),
                _commitsSinceLastSummary: 0,
            });
        }
    } catch (e) {
        dbg.warn(`_maybeGenerateAISummary(): failed (non-fatal):`, e?.message);
    }
}

/** Counts how many local problems are missing from the remote repo, without committing. */
async function handleResyncCount() {
    dbg.log(`handleResyncCount(): starting count of missing problems...`);
    const { token, owner, repoName } = await _resolveGitHubContext();
    const remoteProblems = [];
    try {
        const indexRes = await ghGetContents(owner, repoName, "index.json", token);
        const raw = atob((indexRes.content || "").replace(/\n/g, ""));
        const index = JSON.parse(raw);
        remoteProblems.push(...(index.problems || []));
        dbg.log(
            `handleResyncCount(): fetched ${remoteProblems.length} remote problem(s)`
        );
    } catch (e) {
        dbg.warn(
            `handleResyncCount(): failed to fetch remote index:`,
            e?.message
        );
    }

    // Build a map of remote problems by commit key (same logic as getProblemCommitKey)
    const remoteByCommitKey = new Map();
    remoteProblems.forEach((p) => {
        const key = getProblemCommitKey(p);
        if (key) remoteByCommitKey.set(key, p);
    });

    const allProblems = await Storage.getAllProblems();
    const pendingMap = await Storage.getPendingProblemKeys().catch(() => ({}));
    const pendingKeys = new Set(Object.keys(pendingMap || {}));

    const missing = allProblems.filter((p) => {
        const key = getProblemCommitKey(p);
        if (!key) return false;

        // If marked as pending, count it as missing
        if (pendingKeys.has(key)) return true;

        // Check if problem exists in remote by commit key
        const remote = remoteByCommitKey.get(key);
        if (!remote) return true; // Not in remote, so it's missing

        // If in remote, check if it's drifted
        return _isProblemDrifted(p, remote);
    });
    dbg.log(
        `handleResyncCount(): ✓ counted ${missing.length} missing problem(s)`
    );
    return { count: missing.length };
}

/**
 * Syncs all local problems to GitHub.
 * mode="bulk"       — one atomic commit for all missing problems (default, rate-limit safe).
 * mode="individual" — one commit per problem with correct backdated timestamps.
 */
async function handleResyncAll(mode = "bulk", commitType = "chore") {
    if (_resyncInProgress) {
        dbg.warn("handleResyncAll(): already in progress — skipping duplicate call");
        return { committed: 0, skipped: true };
    }
    _resyncInProgress = true;
    try {
        return await _handleResyncAllInner(mode, commitType);
    } finally {
        _resyncInProgress = false;
        try { _activeSyncPort?.postMessage({ type: "sync-done" }); } catch (_) {}
    }
}

async function _handleResyncAllInner(mode = "bulk", commitType = "chore") {
    dbg.log(
        `handleResyncAll(): starting - mode=${mode}, commitType=${commitType}`
    );
    const { settings, git, token, owner, repoName } =
        await _resolveGitHubContext();

    // Fetch existing index.json to find already-committed slugs/langs
    const remoteByCommitKey = new Map();
    try {
        const indexRes = await ghGetContents(owner, repoName, "index.json", token);
        const raw = atob((indexRes.content || "").replace(/\n/g, ""));
        const index = JSON.parse(raw);
        (index.problems || []).forEach((p) => {
            const key = getProblemCommitKey(p);
            if (key) remoteByCommitKey.set(key, p);
        });
        dbg.log(
            `handleResyncAll(): fetched ${remoteByCommitKey.size} existing remote problem(s)`
        );
    } catch (e) {
        dbg.warn(
            `handleResyncAll(): repo doesn't exist or no index.json yet:`,
            e?.message
        );
    }

    const allProblems = await Storage.getAllProblems();
    const pendingMap = await Storage.getPendingProblemKeys().catch(() => ({}));
    const pendingKeys = new Set(Object.keys(pendingMap || {}));
    const missing = allProblems.filter((p) => {
        const key = getProblemCommitKey(p);
        if (!key) return false;
        if (pendingKeys.has(key)) return true;
        const remote = remoteByCommitKey.get(key);
        return _isProblemDrifted(p, remote);
    });

    dbg.log(
        `handleResyncAll(): found ${missing.length} missing/drifted problem(s)`
    );
    if (missing.length === 0) {
        // Index may be stale even though no problems are missing (e.g. empty onboarding
        // index.json while all problem files exist from a previous session).
        if (remoteByCommitKey.size < allProblems.length) {
            dbg.log(
                `handleResyncAll(): nothing to commit but remote index is stale ` +
                `(${remoteByCommitKey.size} vs ${allProblems.length} local) — repairing`
            );
            const repairContent = _buildIndexJsonFromList(allProblems, settings);
            await _commitWithFailover(
                [{ path: "index.json", content: repairContent }],
                "chore: repair repository index [CodeLedger]",
                repoName,
                { skipInfra: false },
                settings
            );
            return { committed: 1, repaired: true };
        }
        dbg.log(`handleResyncAll(): nothing to sync, returning`);
        return { committed: 0 };
    }

    if (mode === "individual") {
        dbg.log(
            `handleResyncAll(): creating ${missing.length} individual backdated commit(s)`
        );
        // Sort FIRST so index.json always lands on the chronologically final commit,
        // not on whatever happened to be last in the unsorted missing[] array.
        const sorted = missing.map((p) => ({
            problem: p,
            files: getProblemFiles(p, settings),
            message:
                "[" +
                (p.topic || "Untagged") +
                "] " +
                (p.title || p.titleSlug) +
                " solved",
            date: p.timestamp
                ? new Date(
                      p.timestamp > 1e10 ? p.timestamp : p.timestamp * 1000
                  )
                : new Date(),
            repoName,
        })).sort((a, b) => new Date(a.date) - new Date(b.date));

        // Problems already confirmed in the remote index before this session
        const alreadyRemote = Array.from(remoteByCommitKey.values());
        // Accumulates as commits succeed — used for incremental index.json snapshots
        const sessionCommitted = [];
        // Thread the commit SHA between sequential commits so each one uses the
        // SHA returned by the previous instead of re-fetching from GitHub.  This
        // avoids 422 "not a fast-forward" caused by GitHub's ref propagation lag.
        let knownParentSha = null;

        for (let i = 0; i < sorted.length; i++) {
            const entry = sorted[i];
            const isLast = i === sorted.length - 1;
            // Checkpoint: update index.json every 25 commits AND always on the last.
            // Index reflects only problems actually committed so far, so if the loop
            // is interrupted the next sync correctly skips what was already done.
            const isCheckpoint = isLast || (i > 0 && i % 25 === 0);
            if (isCheckpoint) {
                const committedSoFar = [...alreadyRemote, ...sessionCommitted, entry.problem];
                entry.files.push({
                    path: "index.json",
                    content: _buildIndexJsonFromList(committedSoFar, settings),
                });
            }
            // Report progress so the UI can show "Committing N/M"
            try { _activeSyncPort?.postMessage({ type: "sync-progress", current: i + 1, total: sorted.length }); } catch (_) {}
            dbg.log(
                `handleResyncAll(): committing ${i + 1}/${sorted.length} (backdated to ${entry.date.toISOString()})`
            );
            const result = await _commitWithFailover(
                entry.files,
                entry.message,
                entry.repoName,
                // Skip expensive infra rebuild (README + Pages HTML) on every commit
                // except the last, which updates the repo to its final state.
                // Pass the SHA returned by the previous commit to avoid a getRepoRef
                // round-trip and sidestep GitHub's ref propagation delay.
                { date: entry.date, skipInfra: !isLast, knownParentSha: knownParentSha || undefined },
                settings
            );
            knownParentSha = result?.newSha || null;
            sessionCommitted.push(entry.problem);
        }
    } else {
        dbg.log(
            `handleResyncAll(): creating bulk atomic commit with ${missing.length} problem(s)`
        );
        // Bulk: single atomic commit
        const filesToCommit = [];
        for (const problem of missing) {
            for (const f of getProblemFiles(problem, settings))
                filesToCommit.push(f);
            try {
                if (
                    problem.notes &&
                    typeof problem.notes === "string" &&
                    problem.notes.trim()
                ) {
                    const base = problemBase(
                        problem.id || problem.titleSlug,
                        problem.canonical,
                        settings,
                        problem.platform
                    );
                    filesToCommit.push({
                        path: `${base}/notes.md`,
                        content: problem.notes,
                    });
                }
            } catch (_) {}
            try {
                const slug = problem.titleSlug || problem.id || "";
                if (slug) {
                    const chats = await getChatsByProblem(slug).catch(() => []);
                    const base = problemBase(
                        problem.id || problem.titleSlug,
                        problem.canonical,
                        settings,
                        problem.platform
                    );
                    for (const chat of chats || []) {
                        filesToCommit.push({
                            path: `${base}/ai-chats/chat-${chat.id}.json`,
                            content: JSON.stringify(chat, null, 2),
                        });
                    }
                }
            } catch (_) {}
        }
        filesToCommit.push({
            path: "index.json",
            content: await buildIndexJson(),
        });
        dbg.log(
            `handleResyncAll(): prepared ${filesToCommit.length} file(s) for bulk commit`
        );
        await _commitWithFailover(
            filesToCommit,
            buildCommitMessage(resolveCommitType(commitType), {
                count: missing.length,
                platform: "LeetCode",
            }),
            repoName,
            { date: new Date() },
            settings
        );
        dbg.log(`handleResyncAll(): ✓ bulk commit succeeded`);
    }

    if (typeof git.ensureRepoTopics === "function") {
        await git.ensureRepoTopics(repoName).catch(() => {});
    }

    // Mark newly synced problems as committed
    for (const p of missing) {
        await Storage.markSlugLangCommitted(
            p.titleSlug,
            p.lang?.name || p.lang?.slug || p.lang?.ext || ""
        ).catch(() => {});
    }
    await Storage.clearPendingProblemKeys(
        missing.map((p) => getProblemCommitKey(p)).filter(Boolean)
    ).catch(() => {});

    // Mirror the bulk sync
    const allFiles = [];
    for (const p of missing)
        for (const f of getProblemFiles(p, settings)) allFiles.push(f);
    allFiles.push({ path: "index.json", content: await buildIndexJson() });
    const activeTarget = _normalizeGitTarget(
        (await Storage.getSettings().catch(() => settings))
            .git_active_primary || _getDefaultPrimaryTarget(settings)
    );
    await pushToMirrors(
        allFiles,
        "chore: sync " + missing.length + " problem(s) [CodeLedger]",
        {},
        settings,
        activeTarget ? _targetKey(activeTarget) : ""
    );

    dbg.log(
        `handleResyncAll(): sync complete - committed ${missing.length} problem(s)`
    );
    return { committed: missing.length };
}

async function handleBulkImport(problems = []) {
    if (!problems.length) return { saved: 0, autoMerged: 0, conflicts: 0, missingCode: 0, missingTags: 0, missingDifficulty: 0 };

    const pendingKeys = [];
    let autoMerged = 0;
    let conflicts = 0;

    // Group by titleSlug
    const bySlug = {};
    for (const p of problems) {
        const slug = p.titleSlug || (p.id || "").split("::")[0];
        (bySlug[slug] ??= []).push(p);
    }

    for (const [, slugGroup] of Object.entries(bySlug)) {
        // Sub-group by language slug
        const byLang = {};
        for (const p of slugGroup) {
            const langSlug = (p.lang?.slug || p.lang?.name || "unknown").toLowerCase();
            (byLang[langSlug] ??= []).push(p);
        }

        for (const langGroup of Object.values(byLang)) {
            if (langGroup.length === 1) {
                const existing = await Storage.getProblem(langGroup[0].id).catch(() => null);
                if (existing?.manuallyEdited) continue;
                await Storage.saveProblem(langGroup[0]).catch(() => {});
                const key = getProblemCommitKey(langGroup[0]);
                if (key) pendingKeys.push(key);
                continue;
            }

            // Sort oldest first
            langGroup.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            const primary = langGroup[0];
            const rest = langGroup.slice(1);

            const existingPrimary = await Storage.getProblem(primary.id).catch(() => null);
            if (existingPrimary?.manuallyEdited) continue;

            const primaryNorm = normalizeCode(primary.code);
            const allSame = rest.every((r) => normalizeCode(r.code) === primaryNorm);

            if (allSame) {
                // Auto-merge: keep oldest, discard rest.
                // Same code as already in repo — no GitHub commit needed.
                await Storage.saveProblem(primary).catch(() => {});
                autoMerged += rest.length;
                dbg.log(`handleBulkImport(): auto-merged ${rest.length} duplicate(s) for ${primary.titleSlug} (no commit — same code)`);
            } else {
                // Conflict: save primary with conflict metadata
                const candidates = rest.map((r) => ({
                    id: r.id,
                    code: r.code,
                    lang: r.lang,
                    runtime: r.runtime || null,
                    memory: r.memory || null,
                    runtimePct: r.runtimePct ?? null,
                    memoryPct: r.memoryPct ?? null,
                    timestamp: r.timestamp || 0,
                    submissionId: r.submissionId || null,
                }));
                await Storage.saveProblem({
                    ...primary,
                    conflictPending: true,
                    conflictCandidates: candidates,
                }).catch(() => {});
                const key = getProblemCommitKey(primary);
                if (key) pendingKeys.push(key);
                // Mark duplicates so library filters them out
                for (const r of rest) {
                    await Storage.saveProblem({ ...r, isDuplicate: true, duplicateOf: primary.id }).catch(() => {});
                }
                conflicts++;
                dbg.log(`handleBulkImport(): conflict queued for ${primary.titleSlug} (${rest.length} candidate(s))`);
            }
        }
    }

    if (pendingKeys.length) {
        await Storage.markPendingProblemKeys(pendingKeys).catch(() => {});
    }

    // Post-import validation
    let missingCode = 0, missingTags = 0, missingDifficulty = 0;
    const allSaved = await Storage.getAllProblems().catch(() => []);
    const importedIds = new Set(problems.map((p) => p.id));
    const imported = allSaved.filter((p) => importedIds.has(p.id));

    for (const p of imported) {
        if (!p.code && p.platform === "leetcode" && p.titleSlug) {
            await enqueueReview(p.id, 999).catch(() => {});
            missingCode++;
        }
        if (!p.tags?.length || !["Easy", "Medium", "Hard"].includes(p.difficulty)) {
            await Storage.markForMetadataRefresh?.(p.id).catch(() => {});
            if (!p.tags?.length) missingTags++;
            if (!["Easy", "Medium", "Hard"].includes(p.difficulty)) missingDifficulty++;
        }
    }

    // Broadcast import report to any open library tabs
    const report = { saved: pendingKeys.length, autoMerged, conflicts, missingCode, missingTags, missingDifficulty };
    dbg.log(`handleBulkImport(): complete — ${JSON.stringify(report)}`);
    chrome.tabs.query({}, (allTabs) => {
        for (const tab of allTabs || []) {
            chrome.tabs.sendMessage(tab.id, {
                type: "CODELEDGER_IMPORT_COMPLETE",
                ...report,
            }, () => { void chrome.runtime.lastError; }); // suppress "no receiver" errors
        }
    });

    return report;
}

async function handleAIChat(messages, context = {}) {
    dbg.log(`handleAIChat(): starting - messages=${(messages || []).length}`);
    const settings = await Storage.getSettings();
    const contextParts = [];
    if (context.title)
        contextParts.push(
            `Problem: ${context.title}${context.difficulty ? ` (${context.difficulty})` : ""}`
        );
    if (context.methodTitle)
        contextParts.push(`Method: ${context.methodTitle}`);
    if (context.problemStatement) {
        const plain = context.problemStatement
            .replace(/<[^>]+>/g, " ")
            .replace(/\s{2,}/g, " ")
            .trim();
        if (plain) contextParts.push(`Description:\n${plain.slice(0, 2000)}`);
    }
    if (context.code && context.lang?.name)
        contextParts.push(
            `My ${context.lang.name} solution:\n\`\`\`${context.lang.name}\n${context.code.slice(0, 3000)}\n\`\`\``
        );
    else if (context.code)
        contextParts.push(
            `My solution:\n\`\`\`\n${context.code.slice(0, 3000)}\n\`\`\``
        );
    if (context.aiReview)
        contextParts.push(
            `Prior AI review:\n${context.aiReview.slice(0, 1000)}`
        );

    dbg.log(`handleAIChat(): prepared ${contextParts.length} context part(s)`);

    const lastUserMsg =
        (messages || []).filter((m) => m?.role === "user").slice(-1)[0]
            ?.content || "";
    const skillsCtx = {
        text: lastUserMsg,
        justSolved: !!context.justSolved,
        difficulty: context.difficulty || "",
    };
    const [skillsPrefix, knowledgeCtx] = await Promise.all([
        buildSkillsSystemPrompt(skillsCtx),
        buildKnowledgeContext(20),
    ]);

    const baseSystemPrompt = buildConversationSystemPrompt(context);
    const systemPrompt =
        (skillsPrefix || "") +
        (knowledgeCtx ? knowledgeCtx + "\n\n" : "") +
        baseSystemPrompt;
    dbg.log(
        `handleAIChat(): systemPrompt built (${systemPrompt.length} chars, skills=${!!skillsPrefix}, kb=${!!knowledgeCtx})`
    );

    const expandedMessages = [];
    for (const message of messages || []) {
        if (message?.role === "user") {
            // eslint-disable-next-line no-await-in-loop
            const expanded = await expandChatVariables(
                message.content || "",
                context
            );
            expandedMessages.push({ ...message, content: expanded });
        } else {
            expandedMessages.push(message);
        }
    }

    const messagesWithContext = [
        { role: "system", content: systemPrompt },
        ...(contextParts.length > 0
            ? [
                  {
                      role: "system",
                      content: `Context for this conversation:\n\n${contextParts.join("\n\n")}`,
                  },
              ]
            : []),
        ...expandedMessages,
    ];

    const seen = new Set();
    const providers = [
        {
            id: settings.aiProvider || "gemini",
            model: settings.aiPrimaryModel || "",
        },
        {
            id: settings.aiSecondary || "",
            model: settings.aiSecondaryModel || "",
        },
        ...CONSTANTS.AI_FALLBACK_CHAIN.map((id) => ({ id, model: "" })),
    ].filter((p) => {
        if (!p.id) return false;
        const key = _providerModelKey(p);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    dbg.log(
        `handleAIChat(): ${providers.length} provider(s) in fallback chain`
    );
    for (let idx = 0; idx < providers.length; idx++) {
        const provider = providers[idx];
        if (settings[`${provider.id}_enabled`] === false) {
            dbg.log(
                `handleAIChat(): attempt ${idx + 1}/${providers.length} - ${provider.id} disabled, skipping`
            );
            continue;
        }
        const ai = registry.getAIProvider(provider.id);
        if (!ai) {
            dbg.warn(
                `handleAIChat(): attempt ${idx + 1}/${providers.length} - ${provider.id} handler not found`
            );
            continue;
        }
        try {
            dbg.log(
                `handleAIChat(): attempt ${idx + 1}/${providers.length} - calling ${provider.id}...`
            );
            const response = await ai.chat(messagesWithContext, {
                ...context,
                aiModelOverride: provider.model,
            });
            dbg.log(
                `handleAIChat(): received response from ${provider.id} (${String(response || "").length} chars)`
            );
            return response;
        } catch (e) {
            dbg.warn(
                `handleAIChat(): attempt ${idx + 1}/${providers.length} - ${provider.id} failed:`,
                e?.message
            );
        }
    }

    dbg.error(`handleAIChat(): all providers exhausted`);
    throw new Error(
        "No AI providers available or configured. Add an API key in Settings → AI."
    );
}

async function handleRegenerateAIReview(problem = {}) {
    dbg.log(
        `handleRegenerateAIReview(): starting for ${problem.titleSlug || problem.id || "unknown"}`
    );
    if (!problem) throw new Error("Missing problem data");
    const slug = String(
        problem.titleSlug || problem.slug || problem.id || ""
    ).trim();
    if (!slug) throw new Error("Missing problem identifier");
    if (!problem.code)
        throw new Error("Problem code is required for AI review");

    const settings = await Storage.getSettings();
    dbg.log(`handleRegenerateAIReview(): requesting new AI review...`);
    const { review, providerId } = await generateAIReview(problem, settings);
    const updated = { ...problem, aiReview: review };
    await Storage.saveProblem(updated);
    dbg.log(`handleRegenerateAIReview(): saved review via ${providerId}`);
    // Commit asynchronously so the UI gets the review immediately without
    // waiting for GitHub API round-trips.
    commitUpdatedProblem(updated, settings)
        .then((r) =>
            dbg.log(
                `handleRegenerateAIReview(): background commit done, committed=${r?.committed || 0}`
            )
        )
        .catch((e) =>
            dbg.warn(
                `handleRegenerateAIReview(): background commit failed (non-fatal):`,
                e?.message
            )
        );
    return { problem: updated, review, providerId };
}

/**
 * Queue AI reviews for problems.
 * @param {boolean} missingOnly  true = only problems without an existing review; false = all problems
 * @returns {Promise<{queued: number, skipped: number}>}
 */
async function handleQueueAllAIReviews(missingOnly = false) {
    dbg.log(`handleQueueAllAIReviews(): starting (missingOnly=${missingOnly})...`);
    // Clear stale done/failed entries so they don't inflate queue counts and
    // don't block re-queuing problems that already had entries.
    await clearCompletedReviews().catch(() => {});
    const allProblems = await Storage.getAllProblems();
    const candidates = missingOnly
        ? allProblems.filter((p) => !p.aiReview || p.aiReview.trim() === "")
        : allProblems;
    // Newest first = highest priority (lowest priority number = processed first)
    candidates.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    dbg.log(`handleQueueAllAIReviews(): ${candidates.length} candidate(s) from ${allProblems.length} total`);

    let queued = 0;
    let skipped = 0;
    for (let i = 0; i < candidates.length; i++) {
        const problemId = candidates[i].id || candidates[i].titleSlug;
        if (!problemId) continue;
        const result = await enqueueReview(problemId, i);
        if (result.skipped) skipped++; else queued++;
    }

    dbg.log(`handleQueueAllAIReviews(): queued=${queued} skipped(dedup)=${skipped}`);
    return { queued, skipped };
}

/**
 * Process one pending AI review from the queue.
 * Called periodically by the alarm handler.
 */
async function processAIReviewQueue() {
    try {
        dbg.log(
            `processAIReviewQueue(): alarm tick - starting queue processing...`
        );
        // Process multiple items in a single run to improve throughput.
        const BATCH_SIZE = 10;
        let processed = 0;
        let item = await getNextPendingReview();
        while (item && processed < BATCH_SIZE) {
            dbg.log(
                `processAIReviewQueue(): item ${item.id} for problem ${item.problemId}`
            );
            await markProcessing(item.id);
            try {
                let problem = await Storage.getProblem(item.problemId);
                if (!problem) {
                    await markDone(item.id);
                    dbg.warn(
                        `processAIReviewQueue(): problem ${item.problemId} not found in storage`
                    );
                    processed++;
                    item = await getNextPendingReview();
                    continue;
                }

                if (!problem.code) {
                    if (problem.platform === "leetcode" && problem.titleSlug) {
                        dbg.log(`processAIReviewQueue(): ${item.problemId} has no code — attempting recovery`);
                        const recovery = await triggerCodeRecovery(problem);
                        if (!recovery.ok) {
                            await markFailedWithRetry(item.id, `Code recovery failed: ${recovery.error}`);
                            dbg.warn(`processAIReviewQueue(): recovery failed for ${item.problemId}: ${recovery.error}`);
                            processed++;
                            item = await getNextPendingReview();
                            continue;
                        }
                        // Reload problem — triggerCodeRecovery already saved the code
                        problem = await Storage.getProblem(item.problemId);
                        if (!problem?.code) {
                            await markFailedWithRetry(item.id, "Code recovery succeeded but code still empty");
                            processed++;
                            item = await getNextPendingReview();
                            continue;
                        }
                        dbg.log(`processAIReviewQueue(): ✓ recovery succeeded for ${item.problemId}`);
                    } else {
                        await markFailedWithRetry(item.id, "No code stored and automatic recovery not supported for this platform");
                        dbg.warn(`processAIReviewQueue(): non-recoverable no-code for ${item.problemId}`);
                        processed++;
                        item = await getNextPendingReview();
                        continue;
                    }
                }

                const settings = await Storage.getSettings();
                dbg.log(
                    `processAIReviewQueue(): generating review (${processed + 1}/${BATCH_SIZE})`
                );
                const { review, providerId, inferredTags } = await generateAIReview(
                    problem,
                    settings
                );
                const base = inferredTags ? { ...problem, tags: inferredTags, topic: inferredTags[0] } : problem;
                const updated = { ...base, aiReview: review };
                await Storage.saveProblem(updated);

                // Mark as pending for next sync (reviews will be committed together, not as special commit)
                const key = getProblemCommitKey(updated);
                if (key) {
                    await Storage.markPendingProblemKeys([key]).catch(() => {});
                }

                await markDone(item.id);
                dbg.log(
                    `processAIReviewQueue(): processed ${item.problemId} via ${providerId}`
                );

                // Space out requests to respect rate limits
                await new Promise((resolve) =>
                    setTimeout(resolve, REVIEW_RATE_LIMIT_MS)
                );
            } catch (e) {
                const willRetry = await markFailedWithRetry(item.id, e.message);
                if (!willRetry) {
                    dbg.error(
                        `processAIReviewQueue(): ${item.problemId} - max retries exceeded:`,
                        e.message
                    );
                } else {
                    dbg.warn(
                        `processAIReviewQueue(): ${item.problemId} - will retry:`,
                        e.message
                    );
                }
            }
            processed++;
            item = await getNextPendingReview();
        }
        dbg.log(
            `processAIReviewQueue(): tick complete - processed ${processed}/${BATCH_SIZE} items`
        );
    } catch (e) {
        dbg.warn(`processAIReviewQueue(): processing error:`, e?.message);
    }
}

chrome.runtime.onInstalled.addListener(() => {
    init();
    Telemetry.track("install");
});

init();

// Keepalive ports — MUST be registered at top level (not inside async init) so Chrome
// picks them up on the first tick when the SW wakes.  An open port prevents the SW from
// being terminated during long-running operations (AI review, bulk sync, backup).
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "ai-review-keepalive") {
        port.onMessage.addListener(() => {});
    }
    if (port.name === "sync-keepalive") {
        _activeSyncPort = port;
        port.onMessage.addListener(() => {});
        port.onDisconnect.addListener(() => { _activeSyncPort = null; });
    }
    if (port.name === "backup-keepalive") {
        port.onMessage.addListener(() => {});
    }
});

// Keep the debug flag in sync with user preference changes without requiring SW restart
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && CONSTANTS.SK.DEBUG in changes) {
        setDebug(changes[CONSTANTS.SK.DEBUG].newValue === true);
    }
});

// Allow content scripts to ask the background to open the extension popup (best-effort).
// This enables the LeetCode QoL button to open the extension UI without requiring the user
// to click the toolbar action directly.

// Handle one-off messages from extension pages (welcome, library) for maintenance tasks
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    dbg.log(
        `onMessage(): received msg.type=${msg.type} from ${sender?.id || sender?.tab?.id || sender?.url || "unknown"}`
    );
    if (msg.type === "QUEUE_ALL_AI_REVIEWS") {
        (async () => {
            try {
                const result = await handleQueueAllAIReviews(false);
                dbg.log(`onMessage(QUEUE_ALL_AI_REVIEWS): result=${JSON.stringify(result)}`);
                sendResponse({ ok: true, ...result });
            } catch (err) {
                dbg.error(`onMessage(QUEUE_ALL_AI_REVIEWS): failed:`, err?.message || err);
                sendResponse({ ok: false, error: err?.message || String(err) });
            }
        })();
        return true;
    }
    if (msg.type === "QUEUE_MISSING_AI_REVIEWS") {
        (async () => {
            try {
                const result = await handleQueueAllAIReviews(true);
                dbg.log(`onMessage(QUEUE_MISSING_AI_REVIEWS): result=${JSON.stringify(result)}`);
                sendResponse({ ok: true, ...result });
            } catch (err) {
                dbg.error(`onMessage(QUEUE_MISSING_AI_REVIEWS): failed:`, err?.message || err);
                sendResponse({ ok: false, error: err?.message || String(err) });
            }
        })();
        return true;
    }
    if (msg.type === "CANCEL_AI_REVIEW_QUEUE") {
        (async () => {
            try {
                const cancelled = await cancelPendingReviews();
                dbg.log(`onMessage(CANCEL_AI_REVIEW_QUEUE): cancelled=${cancelled}`);
                sendResponse({ ok: true, cancelled });
            } catch (err) {
                dbg.error(`onMessage(CANCEL_AI_REVIEW_QUEUE): failed:`, err?.message || err);
                sendResponse({ ok: false, error: err?.message || String(err) });
            }
        })();
        return true;
    }
    if (msg.type === "GET_QUEUE_STATS") {
        (async () => {
            try {
                const stats = await getQueueStats();
                dbg.log(
                    `onMessage(GET_QUEUE_STATS): stats=${JSON.stringify(stats)}`
                );
                sendResponse({ ok: true, ...stats });
            } catch (err) {
                dbg.error(
                    `onMessage(GET_QUEUE_STATS): failed:`,
                    err?.message || err
                );
                sendResponse({ ok: false, error: err?.message || String(err) });
            }
        })();
        return true;
    }
    if (msg.type === "GET_QUEUE_ITEMS") {
        (async () => {
            try {
                const items = await getAllQueueItems(msg.status || null);
                // Enrich with problem titles
                const problems = await Storage.getAllProblems();
                const problemMap = {};
                for (const p of problems) {
                    if (p.id) problemMap[p.id] = p;
                    if (p.titleSlug) problemMap[p.titleSlug] = p;
                }
                const enriched = items.map((item) => {
                    const p = problemMap[item.problemId];
                    return {
                        ...item,
                        problemTitle: p?.title || item.problemId,
                        problemPlatform: p?.platform || null,
                        problemDifficulty: p?.difficulty || null,
                    };
                });
                sendResponse({ ok: true, items: enriched });
            } catch (err) {
                dbg.error(`onMessage(GET_QUEUE_ITEMS): failed:`, err?.message || err);
                sendResponse({ ok: false, error: err?.message || String(err) });
            }
        })();
        return true;
    }
    if (msg.type === "REMOVE_QUEUE_ITEM") {
        (async () => {
            try {
                const removed = await removeQueueItem(msg.itemId);
                sendResponse({ ok: true, removed });
            } catch (err) {
                dbg.error(`onMessage(REMOVE_QUEUE_ITEM): failed:`, err?.message || err);
                sendResponse({ ok: false, error: err?.message || String(err) });
            }
        })();
        return true;
    }
    if (msg.type === "SYNC_SETTINGS_TO_GITHUB") {
        (async () => {
            try {
                dbg.log(`onMessage(SYNC_SETTINGS_TO_GITHUB): starting...`);
                const result = await syncSettingsToGitHub();
                dbg.log(
                    `onMessage(SYNC_SETTINGS_TO_GITHUB): result=${JSON.stringify(result)}`
                );
                sendResponse({ ok: true, ...result });
            } catch (err) {
                dbg.error(
                    `onMessage(SYNC_SETTINGS_TO_GITHUB): failed:`,
                    err?.message || err
                );
                sendResponse({ ok: false, error: err?.message || String(err) });
            }
        })();
        return true;
    }
    if (msg.type === "SYNC_SETTINGS_FROM_GITHUB") {
        (async () => {
            try {
                dbg.log(`onMessage(SYNC_SETTINGS_FROM_GITHUB): starting...`);
                const result = await syncSettingsFromGitHub();
                dbg.log(
                    `onMessage(SYNC_SETTINGS_FROM_GITHUB): result=${JSON.stringify(result)}`
                );
                sendResponse({ ok: true, ...result });
            } catch (err) {
                dbg.error(
                    `onMessage(SYNC_SETTINGS_FROM_GITHUB): failed:`,
                    err?.message || err
                );
                sendResponse({ ok: false, error: err?.message || String(err) });
            }
        })();
        return true;
    }
    if (msg.type === "REPO_DIAGNOSTICS") {
        dbg.log(`onMessage(REPO_DIAGNOSTICS): running repo health check...`);
        (async () => {
            try {
                const settings = await Storage.getSettings();
                const git = registry.getGitProvider(
                    settings.gitProvider || "github"
                );
                if (!git) {
                    sendResponse({
                        ok: false,
                        error: "No git provider configured",
                    });
                    return;
                }
                const token = await git.getToken().catch(() => null);
                if (!token) {
                    sendResponse({
                        ok: false,
                        error: "Not authenticated — connect GitHub first",
                    });
                    return;
                }
                const owner = settings.github_owner || settings.github_username;
                const repo = settings.github_repo || settings.gitRepo;
                if (!owner || !repo) {
                    sendResponse({ ok: false, error: "Repo not configured" });
                    return;
                }

                const checks = {
                    owner,
                    repo,
                    currentLayoutVersion: LAYOUT_VERSION,
                };

                // 1. Layout version
                try {
                    checks.repoLayoutVersion = await detectRepoLayoutVersion();
                    checks.layoutUpToDate =
                        checks.repoLayoutVersion >= LAYOUT_VERSION;
                } catch (e) {
                    checks.repoLayoutVersion = null;
                    checks.layoutUpToDate = false;
                    checks.layoutError = e.message;
                }

                // 2. Check key infra files
                const INFRA_FILES = [
                    "index.json",
                    "README.md",
                    "index.html",
                    ".codeledger/config.json",
                ];
                checks.infraStatus = {};
                await Promise.all(
                    INFRA_FILES.map(async (f) => {
                        try {
                            await getContents(owner, repo, f, token);
                            checks.infraStatus[f] = "ok";
                        } catch (e) {
                            checks.infraStatus[f] =
                                e?.status === 404 ? "missing" : "error";
                        }
                    })
                );
                checks.infraOk = Object.values(checks.infraStatus).every(
                    (v) => v === "ok"
                );

                // 3. Old-layout path detection — look for topics/* or problems/* top-level dirs
                try {
                    const rootListing = await getContents(
                        owner,
                        repo,
                        "",
                        token
                    ).catch(() => []);
                    const rootNames = Array.isArray(rootListing)
                        ? rootListing.map((f) => f.name)
                        : [];
                    checks.hasOldTopicsDir = rootNames.includes("topics");
                    checks.hasOldProblemsDir = rootNames.includes("problems");
                    checks.hasOldLayout =
                        checks.hasOldTopicsDir || checks.hasOldProblemsDir;
                } catch (e) {
                    checks.hasOldLayout = false;
                }

                // 4. Problem count
                const localProblems = await Storage.getAllProblems().catch(
                    () => []
                );
                checks.localProblemCount = localProblems.length;

                // 5. Committed count (from index.json)
                try {
                    const indexFile = await getContents(
                        owner,
                        repo,
                        "index.json",
                        token
                    );
                    const indexRaw = indexFile?.content
                        ? atob(indexFile.content.replace(/\n/g, ""))
                        : "{}";
                    const index = JSON.parse(indexRaw);
                    checks.committedProblemCount = Array.isArray(index.problems)
                        ? index.problems.length
                        : 0;
                    checks.indexLayoutVersion = index.layoutVersion || 1;
                } catch (e) {
                    checks.committedProblemCount = null;
                    checks.indexLayoutVersion = null;
                }

                checks.uncommittedCount =
                    checks.localProblemCount -
                    (checks.committedProblemCount || 0);

                dbg.log(`onMessage(REPO_DIAGNOSTICS): complete`, checks);
                sendResponse({ ok: true, checks });
            } catch (e) {
                dbg.error(`onMessage(REPO_DIAGNOSTICS): failed:`, e?.message);
                sendResponse({ ok: false, error: e.message });
            }
        })();
        return true;
    }

    if (msg.type === "REPO_REPAIR") {
        dbg.log(`onMessage(REPO_REPAIR): action=${msg.action}`);
        (async () => {
            try {
                let result;
                if (msg.action === "migrate-layout") {
                    result = await migrateRepo();
                } else if (msg.action === "rebuild-infra") {
                    result = await forceRebuildRepo();
                } else if (msg.action === "reset") {
                    result = await resetRepo();
                } else {
                    throw new Error(`Unknown repair action: ${msg.action}`);
                }
                sendResponse({ ok: true, result });
            } catch (e) {
                dbg.error(`onMessage(REPO_REPAIR): failed:`, e?.message);
                sendResponse({ ok: false, error: e.message });
            }
        })();
        return true;
    }

    if (msg.type === "CODELEDGER_RUN_MIGRATIONS") {
        (async () => {
            try {
                const mode = msg.mode || "bulk";
                const commitType = msg.commitType || "chore";
                dbg.log(
                    `onMessage(CODELEDGER_RUN_MIGRATIONS): mode=${mode}, commitType=${commitType}`
                );
                const result = await handleResyncAll(mode, commitType);
                dbg.log(
                    `onMessage(CODELEDGER_RUN_MIGRATIONS): result=${JSON.stringify(result)}`
                );
                sendResponse({ ok: true, result });
            } catch (err) {
                dbg.error(
                    `onMessage(CODELEDGER_RUN_MIGRATIONS): failed:`,
                    err?.message || err
                );
                sendResponse({ ok: false, error: err?.message || String(err) });
            }
        })();
        return true; // indicate async response
    }
});
try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg && msg.type === "RESYNC_COUNT") {
            dbg.log(`onMessage(RESYNC_COUNT): counting missing problems...`);
            handleResyncCount()
                .then((result) => {
                    dbg.log(
                        `onMessage(RESYNC_COUNT): result=${JSON.stringify(result)}`
                    );
                    sendResponse({ ok: true, ...result });
                })
                .catch((e) => {
                    dbg.error(`onMessage(RESYNC_COUNT): failed:`, e?.message);
                    sendResponse({ ok: false, error: e.message });
                });
            return true;
        }

        if (msg && msg.type === "RESYNC_ALL") {
            dbg.log(
                `onMessage(RESYNC_ALL): mode=${msg.mode || "bulk"} commitType=${msg.commitType || "chore"}`
            );
            handleResyncAll(msg.mode || "bulk", msg.commitType || "chore")
                .then((result) => {
                    dbg.log(
                        `onMessage(RESYNC_ALL): result=${JSON.stringify(result)}`
                    );
                    sendResponse({ ok: true, ...result });
                })
                .catch((e) => {
                    dbg.error(`onMessage(RESYNC_ALL): failed:`, e?.message);
                    sendResponse({ ok: false, error: e.message });
                });
            return true; // async response
        }

        if (msg && msg.type === "BACKUP_TO_REPO") {
            dbg.log("onMessage(BACKUP_TO_REPO): committing settings backup...");
            (async () => {
                try {
                    const { settings, repoName } = await _resolveGitHubContext();
                    const allProblems = await Storage.getAllProblems();
                    const safeSettings = Object.fromEntries(
                        Object.entries(settings).filter(([k]) =>
                            !k.includes("token") && !k.includes("key") && !k.includes("secret") && k !== "github_token"
                        )
                    );
                    const backup = {
                        timestamp: new Date().toISOString(),
                        settings: safeSettings,
                        stats: {
                            total: allProblems.length,
                            easy: allProblems.filter((p) => p.difficulty === "Easy").length,
                            medium: allProblems.filter((p) => p.difficulty === "Medium").length,
                            hard: allProblems.filter((p) => p.difficulty === "Hard").length,
                        },
                    };
                    const date = new Date().toISOString().slice(0, 10);
                    const backupFiles = [{ path: `config/backup-${date}.json`, content: JSON.stringify(backup, null, 2) }];
                    const commitMsg = `chore: backup config and settings ${date}`;
                    // Primary + failover targets
                    await _commitWithFailover(backupFiles, commitMsg, repoName, { date: new Date() }, settings);
                    // Also push to all enabled mirrors
                    const activeTarget = _normalizeGitTarget(
                        (await Storage.getSettings().catch(() => settings)).git_active_primary || _getDefaultPrimaryTarget(settings)
                    );
                    await pushToMirrors(backupFiles, commitMsg, {}, settings, activeTarget ? _targetKey(activeTarget) : "").catch(
                        (e) => dbg.warn("BACKUP_TO_REPO: mirror push failed:", e?.message)
                    );
                    dbg.log("onMessage(BACKUP_TO_REPO): ✓ backup committed");
                    sendResponse({ ok: true });
                } catch (e) {
                    dbg.warn("onMessage(BACKUP_TO_REPO): failed:", e?.message);
                    sendResponse({ ok: false, error: e.message });
                }
            })();
            return true;
        }

        if (msg && msg.type === "SYNC_PREVIEW") {
            dbg.log(`onMessage(SYNC_PREVIEW): previewing sync...`);
            handleSyncPreview()
                .then((result) => {
                    dbg.log(
                        `onMessage(SYNC_PREVIEW): new=${result.remoteOnly?.length}, conflicts=${result.conflicts?.length}`
                    );
                    sendResponse({ ok: true, ...result });
                })
                .catch((e) => {
                    dbg.error(`onMessage(SYNC_PREVIEW): failed:`, e?.message);
                    sendResponse({ ok: false, error: e.message });
                });
            return true;
        }

        if (msg && msg.type === "SYNC_APPLY_IMPORT") {
            dbg.log(
                `onMessage(SYNC_APPLY_IMPORT): importing ${(msg.problems || []).length} problem(s)...`
            );
            handleSyncApplyImport(msg.problems || [])
                .then((result) => {
                    dbg.log(
                        `onMessage(SYNC_APPLY_IMPORT): result=${JSON.stringify(result)}`
                    );
                    sendResponse({ ok: true, ...result });
                })
                .catch((e) => {
                    dbg.error(
                        `onMessage(SYNC_APPLY_IMPORT): failed:`,
                        e?.message
                    );
                    sendResponse({ ok: false, error: e.message });
                });
            return true;
        }

        if (msg && msg.type === "MIGRATE_REPO") {
            dbg.log(`onMessage(MIGRATE_REPO): starting repo migration...`);
            migrateRepo()
                .then((result) => {
                    dbg.log(
                        `onMessage(MIGRATE_REPO): result=${JSON.stringify(result)}`
                    );
                    sendResponse({ ok: true, ...result });
                })
                .catch((e) => {
                    dbg.error(`onMessage(MIGRATE_REPO): failed:`, e?.message);
                    sendResponse({ ok: false, error: e.message });
                });
            return true;
        }

        if (msg && msg.type === "RESET_REPO") {
            dbg.log(`onMessage(RESET_REPO): resetting repo...`);
            resetRepo()
                .then((result) => {
                    dbg.log(
                        `onMessage(RESET_REPO): result=${JSON.stringify(result)}`
                    );
                    sendResponse({ ok: true, ...result });
                })
                .catch((e) => {
                    dbg.error(`onMessage(RESET_REPO): failed:`, e?.message);
                    sendResponse({ ok: false, error: e.message });
                });
            return true;
        }

        if (msg && msg.type === "FORCE_REBUILD_REPO") {
            dbg.log(`onMessage(FORCE_REBUILD_REPO): rebuilding repo...`);
            forceRebuildRepo()
                .then((result) => {
                    dbg.log(
                        `onMessage(FORCE_REBUILD_REPO): result=${JSON.stringify(result)}`
                    );
                    sendResponse({ ok: true, ...result });
                })
                .catch((e) => {
                    dbg.error(
                        `onMessage(FORCE_REBUILD_REPO): failed:`,
                        e?.message
                    );
                    sendResponse({ ok: false, error: e.message });
                });
            return true;
        }

        if (msg && msg.type === "FORCE_COMMIT_SETTINGS") {
            dbg.log(
                `onMessage(FORCE_COMMIT_SETTINGS): forcing settings commit...`
            );
            forceCommitSettingsNow()
                .then((result) => {
                    dbg.log(
                        `onMessage(FORCE_COMMIT_SETTINGS): result=${JSON.stringify(result)}`
                    );
                    sendResponse({ ok: true, ...result });
                })
                .catch((e) => {
                    dbg.error(
                        `onMessage(FORCE_COMMIT_SETTINGS): failed:`,
                        e?.message
                    );
                    sendResponse({ ok: false, error: e.message });
                });
            return true;
        }

        if (msg && msg.type === "DETECT_LAYOUT_VERSION") {
            dbg.log(
                `onMessage(DETECT_LAYOUT_VERSION): detecting layout version...`
            );
            detectRepoLayoutVersion()
                .then((v) => {
                    dbg.log(`onMessage(DETECT_LAYOUT_VERSION): version=${v}`);
                    sendResponse({ ok: true, version: v });
                })
                .catch((e) => {
                    dbg.error(
                        `onMessage(DETECT_LAYOUT_VERSION): failed:`,
                        e?.message
                    );
                    sendResponse({ ok: false, error: e.message });
                });
            return true;
        }

        if (msg && msg.type === "BULK_IMPORT") {
            dbg.log(
                `onMessage(BULK_IMPORT): importing ${(msg.problems || []).length} problem(s)...`
            );
            handleBulkImport(msg.problems || [])
                .then((result) => {
                    dbg.log(
                        `onMessage(BULK_IMPORT): result=${JSON.stringify(result)}`
                    );
                    sendResponse({ ok: true, ...result });
                })
                .catch((e) => {
                    dbg.error(`onMessage(BULK_IMPORT): failed:`, e?.message);
                    sendResponse({ ok: false, error: e.message });
                });
            return true;
        }

        if (msg && msg.type === "REFRESH_METADATA") {
            dbg.log(
                `onMessage(REFRESH_METADATA): queuing ${(msg.problems || []).length} problem(s) for refresh...`
            );
            handleRefreshMetadata(msg.problems || [])
                .then((result) => {
                    dbg.log(
                        `onMessage(REFRESH_METADATA): result=${JSON.stringify(result)}`
                    );
                    sendResponse({ ok: true, ...result });
                })
                .catch((e) => {
                    dbg.error(
                        `onMessage(REFRESH_METADATA): failed:`,
                        e?.message
                    );
                    sendResponse({ ok: false, error: e.message });
                });
            return true; // async response
        }

        if (msg && msg.type === "REFRESH_METADATA_DONE") {
            dbg.log(
                `onMessage(REFRESH_METADATA_DONE): completing metadata refresh...`
            );
            const result = completeRefreshMetadata(_sender?.tab?.id);
            dbg.log(
                `onMessage(REFRESH_METADATA_DONE): completed=${result.completed}`
            );
            sendResponse({ ok: true, ...result });
            return true;
        }

        if (msg && msg.type === "AI_CHAT") {
            dbg.log(
                `onMessage(AI_CHAT): chat with ${(msg.messages || []).length} message(s)...`
            );
            handleAIChat(msg.messages || [], msg.context || {})
                .then((response) => {
                    dbg.log(
                        `onMessage(AI_CHAT): response (${String(response || "").length} chars)`
                    );
                    sendResponse({ ok: true, response });
                })
                .catch((e) => {
                    dbg.error(`onMessage(AI_CHAT): failed:`, e?.message);
                    sendResponse({ ok: false, error: e.message });
                });
            return true; // async response
        }

        if (msg && msg.type === "REGENERATE_AI_REVIEW") {
            dbg.log(
                `onMessage(REGENERATE_AI_REVIEW): regenerating review for ${(msg.problem || msg.data || {}).titleSlug || "unknown"}`
            );
            handleRegenerateAIReview(msg.problem || msg.data || {})
                .then((result) => {
                    dbg.log(
                        `onMessage(REGENERATE_AI_REVIEW): result=${JSON.stringify(result)}`
                    );
                    sendResponse({ ok: true, ...result });
                })
                .catch((e) => {
                    dbg.error(
                        `onMessage(REGENERATE_AI_REVIEW): failed:`,
                        e?.message
                    );
                    sendResponse({ ok: false, error: e.message });
                });
            return true;
        }

        if (msg && msg.type === "LIST_GITHUB_BACKUPS") {
            dbg.log(`onMessage(LIST_GITHUB_BACKUPS): listing backups...`);
            (async () => {
                try {
                    const settings = await Storage.getSettings();
                    const git = registry.getGitProvider(
                        settings.gitProvider || "github"
                    );
                    if (!git) {
                        sendResponse({ ok: false, error: "No git provider" });
                        return;
                    }
                    const token = await git.getToken().catch(() => null);
                    const owner =
                        settings.github_owner || settings.github_username || "";
                    const repo = settings.github_repo || settings.gitRepo || "";
                    if (!token || !owner || !repo) {
                        sendResponse({ ok: false, error: "Not configured" });
                        return;
                    }
                    const backups = await listBackups(owner, repo, token);
                    sendResponse({ ok: true, backups });
                } catch (e) {
                    dbg.error(
                        `onMessage(LIST_GITHUB_BACKUPS): failed:`,
                        e?.message
                    );
                    sendResponse({ ok: false, error: e.message });
                }
            })();
            return true;
        }

        if (msg && msg.type === "COMMIT_GITHUB_BACKUP_NOW") {
            dbg.log(
                `onMessage(COMMIT_GITHUB_BACKUP_NOW): committing backup...`
            );
            (async () => {
                try {
                    const settings = await Storage.getSettings();
                    const git = registry.getGitProvider(
                        settings.gitProvider || "github"
                    );
                    if (!git) {
                        sendResponse({ ok: false, error: "No git provider" });
                        return;
                    }
                    const token = await git.getToken().catch(() => null);
                    const owner =
                        settings.github_owner || settings.github_username || "";
                    const repo = settings.github_repo || settings.gitRepo || "";
                    if (!token || !owner || !repo) {
                        sendResponse({ ok: false, error: "Not configured" });
                        return;
                    }
                    const keep = Math.max(
                        1,
                        parseInt(settings.githubBackupKeep || "10", 10)
                    );
                    await commitBackupToGitHub(owner, repo, token, git, keep);
                    sendResponse({ ok: true });
                } catch (e) {
                    dbg.error(
                        `onMessage(COMMIT_GITHUB_BACKUP_NOW): failed:`,
                        e?.message
                    );
                    sendResponse({ ok: false, error: e.message });
                }
            })();
            return true;
        }

        if (msg && msg.type === "RESTORE_GITHUB_BACKUP") {
            dbg.log(
                `onMessage(RESTORE_GITHUB_BACKUP): restoring ${msg.filePath}...`
            );
            (async () => {
                try {
                    const settings = await Storage.getSettings();
                    const git = registry.getGitProvider(
                        settings.gitProvider || "github"
                    );
                    if (!git) {
                        sendResponse({ ok: false, error: "No git provider" });
                        return;
                    }
                    const token = await git.getToken().catch(() => null);
                    const owner =
                        settings.github_owner || settings.github_username || "";
                    const repo = settings.github_repo || settings.gitRepo || "";
                    if (!token || !owner || !repo) {
                        sendResponse({ ok: false, error: "Not configured" });
                        return;
                    }
                    const snapshot = await fetchBackupSnapshot(
                        owner,
                        repo,
                        msg.filePath,
                        token
                    );
                    if (!snapshot?.problems) {
                        sendResponse({ ok: false, error: "Invalid snapshot" });
                        return;
                    }
                    for (const p of snapshot.problems)
                        await Storage.saveProblem(p);
                    sendResponse({ ok: true, count: snapshot.problems.length });
                } catch (e) {
                    dbg.error(
                        `onMessage(RESTORE_GITHUB_BACKUP): failed:`,
                        e?.message
                    );
                    sendResponse({ ok: false, error: e.message });
                }
            })();
            return true;
        }

        if (msg && msg.type === "OPEN_WELCOME") {
            dbg.log(`onMessage(OPEN_WELCOME): opening welcome tab...`);
            try {
                chrome.tabs.create({
                    url: chrome.runtime.getURL("welcome/welcome.html"),
                });
                dbg.log(`onMessage(OPEN_WELCOME): tab created`);
            } catch (_) {}
            sendResponse({ ok: true });
            return true;
        }

        if (msg && msg.type === "OPEN_LIBRARY") {
            dbg.log(
                `onMessage(OPEN_LIBRARY): opening library tab (${msg.tab || "solutions"})...`
            );
            try {
                const tab = msg.tab || "solutions";
                const params = new URLSearchParams({ tab });
                if (msg.chatSlug) params.set("chatSlug", String(msg.chatSlug));
                if (msg.chatPrompt)
                    params.set("chatPrompt", String(msg.chatPrompt));
                chrome.tabs.create({
                    url: chrome.runtime.getURL(
                        `library/library.html?${params.toString()}`
                    ),
                });
                dbg.log(`onMessage(OPEN_LIBRARY): tab created`);
            } catch (_) {}
            sendResponse({ ok: true });
            return true;
        }

        if (msg && msg.type === "OPEN_POPUP") {
            dbg.log(`onMessage(OPEN_POPUP): opening popup...`);
            try {
                if (
                    chrome.action &&
                    typeof chrome.action.openPopup === "function"
                ) {
                    chrome.action.openPopup();
                    dbg.log(
                        `onMessage(OPEN_POPUP): via chrome.action.openPopup`
                    );
                    return;
                }
                if (
                    chrome.browserAction &&
                    typeof chrome.browserAction.openPopup === "function"
                ) {
                    chrome.browserAction.openPopup();
                    dbg.log(
                        `onMessage(OPEN_POPUP): via chrome.browserAction.openPopup`
                    );
                    return;
                }
                // Fallback: open the popup page as a tab
                if (chrome.tabs && chrome.runtime && chrome.runtime.getURL) {
                    chrome.tabs.create({
                        url: chrome.runtime.getURL("popup/popup.html"),
                    });
                    dbg.log(`onMessage(OPEN_POPUP): via fallback tab creation`);
                }
            } catch (e) {
                try {
                    chrome.tabs.create({
                        url: chrome.runtime.getURL("popup/popup.html"),
                    });
                    dbg.log(`onMessage(OPEN_POPUP): via catch fallback`);
                } catch (err) {
                    dbg.error(
                        `onMessage(OPEN_POPUP): all methods failed:`,
                        err?.message
                    );
                }
            }
        }
    });
} catch (e) {
    // Some platforms may not support openPopup — ignore safely
    dbg.warn(`message handler registration:`, e?.message);
}
