/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initDebug, setDebug, createDebugger } from "../lib/debug.js";
import { decodeBase64Utf8 } from "../lib/base64.js";
import { storage as browserStorage, openOrFocusTab } from "../lib/browser-compat.js";
import { registry } from "../core/handler-registry.js";
import { eventBus } from "../core/event-bus.js";
import { Storage } from "../core/storage.js";
import { withLock } from "../core/async-lock.js";
import { getProblemCommitKey } from "../core/lang-utils.js";
import { Telemetry } from "../core/telemetry.js";
import { initializeHandlers } from "../handlers/init.js";
import { CONSTANTS } from "../core/constants.js";
import {
  buildConversationSystemPrompt,
  parseStatementSummary,
  parseTakeaway,
  parseWeakAreas,
} from "../core/ai-prompts.js";
import { expandChatVariables } from "../lib/chat-variables.js";
import { AUTH_ORIGIN, isAuthCallbackUrl } from "../lib/oauth-message.js";
import { isMessageAllowed, originOf } from "../lib/message-guard.js";

/**
 * Our own chrome-extension:// (or moz-extension://) origin.
 *
 * Computed once here rather than per message. Anything sending from this
 * origin is one of our own pages and is trusted with every message type; see
 * lib/message-guard.js for why content scripts are not.
 */
const EXTENSION_ORIGIN = originOf(chrome.runtime.getURL(""));
import { buildGraphDigest, isGraphQuestion } from "../core/graph-insights.js";
import {
  handleRefreshMetadata,
  completeRefreshMetadata,
  resumeRefreshQueue,
} from "./refresh-metadata-handler.js";
import { triggerCodeRecovery } from "./code-recovery-handler.js";
import { fetchGFGProblemData, fetchGFGProblemOutcome } from "./gfg-api.js";
import { verifyGfgProblem, runGfgVerifySweep, applyManualSlug } from "./gfg-verify.js";
import { checkLink, applyManualLink, verifyProblemLink } from "./link-verify.js";
import { fetchLeetCodeProblemData, fetchLeetCodeProblemOutcome } from "./leetcode-api.js";
import { fetchCFProblemData, fetchCFProblemOutcome } from "./codeforces-api.js";
import { fetchNeetCodeProblemOutcome } from "./neetcode-api.js";
import {
  HEAL_STATE_KEY,
  healProblem,
  healStatus,
  isHealable,
  missingParts,
  runSelfHeal,
} from "./self-heal.js";
import {
  buildProblemFiles,
  problemBase,
  platformId,
  PROBLEMS_ROOT,
  LAYOUT_VERSION,
} from "../core/path-builder.js";
import { canonicalMapper } from "../core/canonical-mapper.js";
import {
  countByDifficulty,
  loadUserDifficultyMap,
  buildUserDifficultyMap,
} from "../core/difficulty-map.js";
import { dayKey } from "../core/gamification.js";
import { refreshIconBadge, registerBadgeAlarm, BADGE_ALARM } from "./gamification-service.js";
import {
  getChatsByProblem,
  saveAIChat,
  updateAIChat,
  deleteChat,
} from "../core/ai-chat-storage.js";
import { buildCommitMessage, COMMIT_TYPES, resolveCommitType } from "../core/commit-messages.js";
import {
  migrateRepo,
  resetRepo,
  forceRebuildRepo,
  detectRepoLayoutVersion,
  migrateProblemIds,
  migrateTagsToCanonical,
  migrateStrandedAIKeys,
} from "./migration-manager.js";
import { SyncEngine, importFromRepo, applyImport } from "./sync-engine.js";
import { detectDuplicate, normalizeCode } from "../core/duplicate-detector.js";
import {
  autoSyncSettings,
  syncSettingsToGitHub,
  syncSettingsFromGitHub,
  buildSyncPayload,
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
  reclaimStaleProcessing,
  RATE_LIMIT_DELAY_MS_EXPORT as REVIEW_RATE_LIMIT_MS,
} from "../core/ai-review-queue.js";
import {
  getConfigFileForCommit,
  clearSettingsCommitFlag,
  forceCommitSettingsNow,
} from "../core/settings-auto-commit.js";
import { initMCPConfig } from "../core/mcp-config.js";
import { buildSkillsSystemPrompt } from "../core/ai/skills-registry.js";
import { buildKnowledgeContext } from "../core/memory/knowledge-bank.js";
import { synthesizeInsights } from "../core/memory/insight-synthesis.js";
import {
  maybeCommitRollingBackup,
  listBackups,
  commitBackupToGitHub,
  fetchBackupSnapshot,
  restoreSnapshot,
  saveLocalSnapshots,
} from "../core/backup/backup-manager.js";
import {
  findDuplicatesForProblem,
  compareSolutions as compareSolutionsForDedup,
} from "../core/ai-deduplication.js";
import {
  recordSolve,
  recordChatInteraction,
  recordHintView,
  recordAIReview,
  getProblemStats,
  recordAIInsights,
  autoPopulateFromHistory,
} from "../core/behavior-bank.js";
import { getProfileContext } from "../core/behavior-profile.js";
import { getRoadmapContext } from "../core/roadmap-progress.js";
import { applyInferredMetadata } from "../core/ai-review-metadata.js";

let _syncAlarmBound = false;
let _resyncInProgress = false;
let _activeSyncPort = null;

// ── Snail Mode State Management ────────────────────────────────────────────
async function getSnailModeState() {
  try {
    const data = await chrome.storage.local.get(CONSTANTS.SNAIL_MODE.STORAGE_KEY);
    return (
      data[CONSTANTS.SNAIL_MODE.STORAGE_KEY] || {
        lastBatch: 0,
        consecutiveErrors: 0,
        isPaused: false,
        pausedUntil: null,
        totalProcessed: 0,
        totalErrors: 0,
      }
    );
  } catch (e) {
    dbg.warn("[CodeLedger:SnailMode] Failed to get state:", e?.message);
    return {
      lastBatch: 0,
      consecutiveErrors: 0,
      isPaused: false,
      pausedUntil: null,
      totalProcessed: 0,
      totalErrors: 0,
    };
  }
}

async function setSnailModeState(state) {
  try {
    await chrome.storage.local.set({
      [CONSTANTS.SNAIL_MODE.STORAGE_KEY]: state,
    });
  } catch (e) {
    dbg.warn("[CodeLedger:SnailMode] Failed to set state:", e?.message);
  }
}

async function getAIReviewQueueStatus() {
  const [state, stats, pendingItems, snailSettings] = await Promise.all([
    getSnailModeState(),
    getQueueStats(),
    getAllQueueItems("pending"),
    Storage.getSettings().catch(() => ({})),
  ]);
  const now = Date.now();
  const batchIntervalMs = snailSettings.snailMode_batchIntervalHours
    ? Math.round(Number(snailSettings.snailMode_batchIntervalHours) * 60 * 60 * 1000)
    : CONSTANTS.SNAIL_MODE.BATCH_INTERVAL_MS;
  const intervalAt = state.lastBatch ? state.lastBatch + batchIntervalMs : now;
  const pausedAt = state.isPaused && state.pausedUntil ? state.pausedUntil : 0;
  const nextRetryAt = pendingItems.reduce((min, item) => {
    const candidate = Number(item?.nextRetryAt || 0);
    return candidate > 0 && candidate < min ? candidate : min;
  }, Infinity);
  const readyCount = pendingItems.filter(
    (item) => !item.nextRetryAt || item.nextRetryAt <= now,
  ).length;
  const hasPending = (stats?.pending || 0) > 0;
  const nextRunAt = hasPending
    ? Math.max(
        now,
        intervalAt || now,
        pausedAt || 0,
        Number.isFinite(nextRetryAt) ? nextRetryAt : now,
      )
    : null;

  return {
    ...stats,
    ...state,
    hasPending,
    readyCount,
    nextRunAt,
    nextRunInMs: nextRunAt != null ? Math.max(0, nextRunAt - now) : null,
  };
}

/* ── Queue alarms ──────────────────────────────────────────────────────── */

/**
 * The two alarms that exist only to drain a queue.
 *
 * Both used to be created unconditionally at startup and left running forever.
 * The code-recovery one is the expensive mistake: it woke the service worker
 * sixty times an hour, indefinitely, for a queue that is empty on every install
 * that has never imported a GeeksForGeeks profile — and that returns on its
 * first line anyway, because `codeRecoveryQueueSpeed` defaults to `"disabled"`.
 *
 * They are now armed when there is something to drain and cleared when there
 * is not. `MAINTENANCE_COMMIT` stays periodic and does the re-arming: it runs
 * every ten minutes, already reads the pending-key map, and is the only place
 * in the worker that reliably sees work queued from a library tab — those write
 * storage directly and cannot create an alarm from a page context.
 *
 * So the worst case for a queue that was filled from a tab is a ten-minute
 * wait, and the idle cost of the whole extension drops from seventy-eight wakes
 * an hour to eight.
 */
const QUEUE_ALARMS = {
  AI_REVIEW: { name: "AI_REVIEW_QUEUE", periodInMinutes: 5 },
  CODE_RECOVERY: { name: "CODE_RECOVERY_QUEUE", periodInMinutes: 1 },
  SELF_HEAL: { name: "SELF_HEAL_QUEUE", periodInMinutes: 5 },
};

/**
 * Bring one queue alarm into line with whether its queue has work.
 *
 * @param {{ name: string, periodInMinutes: number }} alarm
 * @param {boolean} wanted
 */
async function _setQueueAlarm(alarm, wanted) {
  try {
    const existing = await chrome.alarms.get(alarm.name);
    if (wanted && !existing) {
      chrome.alarms.create(alarm.name, { periodInMinutes: alarm.periodInMinutes });
      dbg.log(`_setQueueAlarm(): armed ${alarm.name}`);
    } else if (!wanted && existing) {
      await chrome.alarms.clear(alarm.name);
      dbg.log(`_setQueueAlarm(): cleared ${alarm.name} — nothing queued`);
    }
  } catch (e) {
    dbg.warn(`_setQueueAlarm(): could not update ${alarm.name}:`, e?.message);
  }
}

/** Arm the AI-review alarm iff the review queue has pending items. */
async function refreshAIReviewAlarm() {
  const stats = await getQueueStats().catch(() => null);
  await _setQueueAlarm(QUEUE_ALARMS.AI_REVIEW, (stats?.pending || 0) > 0);
}

/**
 * Arm the code-recovery alarm iff recovery is switched on and something is
 * actually waiting for it.
 *
 * The settings check comes first so the common case — recovery disabled, which
 * is the default — never scans the problem store.
 */
async function refreshCodeRecoveryAlarm(settings = null) {
  const s = settings || (await Storage.getSettings().catch(() => ({})));
  if ((s.codeRecoveryQueueSpeed || "disabled") === "disabled") {
    await _setQueueAlarm(QUEUE_ALARMS.CODE_RECOVERY, false);
    return;
  }
  const all = await Storage.getAllProblems().catch(() => []);
  const eligible = all.some(
    (p) =>
      p._needsCodeFetch ||
      (p.platform === "geeksforgeeks" &&
        p._importedFromProfile &&
        (!p.code || p.code.trim() === "")),
  );
  await _setQueueAlarm(QUEUE_ALARMS.CODE_RECOVERY, eligible);
}

/**
 * Arm the self-heal alarm iff something is incomplete and fetchable.
 *
 * Unlike the two above this is on by default, because the work it does is a
 * plain HTTPS GET for public problem metadata — no tab, no window, nothing the
 * user would notice except the gap in their library closing on its own.
 */
async function refreshSelfHealAlarm(settings = null) {
  const s = settings || (await Storage.getSettings().catch(() => ({})));
  if (s.selfHealEnabled === false) {
    await _setQueueAlarm(QUEUE_ALARMS.SELF_HEAL, false);
    return;
  }
  const all = await Storage.getAllProblems().catch(() => []);
  const state = await _loadHealState();
  const { waiting } = healStatus(all, state);
  await _setQueueAlarm(QUEUE_ALARMS.SELF_HEAL, waiting > 0);
}

/** All three of the above. Called at startup and on every maintenance tick. */
async function refreshQueueAlarms() {
  await Promise.all([
    refreshAIReviewAlarm().catch(() => {}),
    refreshCodeRecoveryAlarm().catch(() => {}),
    refreshSelfHealAlarm().catch(() => {}),
  ]);
}

const dbg = createDebugger("ServiceWorker");

let initResolve;
const initPromise = new Promise((resolve) => {
  initResolve = resolve;
});

// Register event listeners synchronously at startup so they are never missed
// if a cold start event wakes up the service worker.
eventBus.on("problem:solved", handleSolved);

// Init background
async function init() {
  await initDebug();
  dbg.log(`init(): ✓ debug initialized, background starting...`);

  // First-run defaults: disable all AI providers and non-GitHub git providers.
  // Only runs once — subsequent startups detect the flag and skip.
  await applyFirstRunDefaults();

  // Migrate existing problem IDs to platform-scoped format (lc/gfg/cf prefix).
  migrateProblemIds().catch((e) => dbg.error(`init(): migrateProblemIds failed:`, e));
  migrateTagsToCanonical().catch((e) =>
    dbg.warn("migrateTagsToCanonical() failed (non-blocking):", e?.message),
  );
  migrateStrandedAIKeys().catch((e) =>
    dbg.warn("migrateStrandedAIKeys() failed (non-blocking):", e?.message),
  );

  // Register handlers
  dbg.log(`init(): registering handlers...`);
  initializeHandlers();

  // Initialize MCP config (first-run defaults)
  await initMCPConfig();

  // Initialize AI review queue store
  await initializeReviewQueueStore();

  // Retroactively repair GFG timestamps from recovered methods
  await Storage.repairGFGTimestamps().catch((e) => {
    dbg.error("init(): repairGFGTimestamps failed:", e);
  });

  // Detect extension updates and flag migration if needed
  try {
    const manifest = chrome.runtime.getManifest();
    const settings = await Storage.getSettings();
    const lastVer = settings.lastKnownVersion || "";
    const curVer = manifest.version;
    if (lastVer !== curVer) {
      const updates = { lastKnownVersion: curVer };
      if (lastVer && lastVer !== curVer) updates.extensionUpdated = true;
      await Storage.updateSettings(updates);
      dbg.log(`init(): extension updated: ${lastVer || "first run"} → ${curVer}`);
    }
  } catch (e) {
    dbg.warn(`init(): version check failed:`, e.message);
  }

  // Set up event listeners

  chrome.tabs.onRemoved.addListener((tabId) => {
    completeRefreshMetadata(tabId);
  });

  // A metadata-refresh tab queue interrupted by a service-worker shutdown is
  // persisted in storage.session — pick it back up on this wake.
  resumeRefreshQueue().catch(() => {});

  // (onConnect listener registered at top level — see below init())

  if (!_syncAlarmBound) {
    _syncAlarmBound = true;
    try {
      chrome.alarms.create(CONSTANTS.ALARM_NAMES.SYNC, {
        periodInMinutes: CONSTANTS.SYNC_ALARM_PERIOD_MIN || 30,
      });
      // AI_REVIEW_QUEUE and CODE_RECOVERY_QUEUE are not created here. They are
      // armed only while their queue has work — see refreshQueueAlarms().
      // Batch-commit pending AI reviews and metadata edits every 10 minutes.
      // This prevents one-commit-per-problem clutter for maintenance operations.
      chrome.alarms.create("MAINTENANCE_COMMIT", { periodInMinutes: 10 });
      // Hourly, so the streak on the toolbar icon rolls over at midnight even
      // if nothing else wakes the worker that day.
      registerBadgeAlarm();

      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm?.name === CONSTANTS.ALARM_NAMES.SYNC) {
          SyncEngine.performSync().catch((e) => dbg.warn("periodic sync failed:", e.message));
        } else if (alarm?.name === "AI_REVIEW_QUEUE") {
          processAIReviewQueue().catch((e) =>
            dbg.warn("AI review queue processing failed:", e.message),
          );
        } else if (alarm?.name === "CODE_RECOVERY_QUEUE") {
          processCodeRecoveryQueue().catch((e) =>
            dbg.warn("Code recovery queue processing failed:", e.message),
          );
        } else if (alarm?.name === "SELF_HEAL_QUEUE") {
          runSelfHealTick().catch((e) => dbg.warn("Self-heal tick failed:", e.message));
        } else if (alarm?.name === "MAINTENANCE_COMMIT") {
          (async () => {
            const pendingMap = await Storage.getPendingProblemKeys().catch(() => ({}));
            if (Object.keys(pendingMap || {}).length > 0) {
              if (await _isImportActive()) {
                // A profile import is still feeding batches in; its own
                // individual sync (or the next tick after the flag lapses)
                // will commit these with real solve dates. A bulk commit now
                // would flatten them all to today.
                dbg.log("MAINTENANCE_COMMIT: import in flight — deferring batch commit");
              } else {
                dbg.log(
                  `MAINTENANCE_COMMIT: ${Object.keys(pendingMap).length} pending key(s), running bulk commit`,
                );
                await handleResyncAll("bulk", "chore").catch((e) =>
                  dbg.warn("maintenance batch commit failed:", e.message),
                );
              }
            }
            // The re-arm pass. A library tab that queued a review or flagged a
            // problem for recovery wrote storage directly and could not create
            // an alarm from a page context; this is where the worker notices.
            await refreshQueueAlarms();
            // The retry either drained the pending map or left it stuck; the
            // icon badge should say which without waiting for the hourly tick.
            await refreshIconBadge().catch(() => {});
          })().catch(() => {});
        } else if (alarm?.name === BADGE_ALARM) {
          refreshIconBadge().catch(() => {});
        } else if (alarm?.name === "BULK_IMPORT_RESUME") {
          dbg.log("BULK_IMPORT_RESUME: resuming interrupted bulk import after delay");
          handleResyncAll("individual", "feat").catch((e) =>
            dbg.warn("BULK_IMPORT_RESUME: resume failed:", e.message),
          );
        }
      });
    } catch (e) {
      dbg.warn("failed to initialize alarms:", e.message);
    }
  }

  // Resume an interrupted bulk import (browser was closed mid-commit).
  // Wait 45 seconds on startup to let the browser stabilize before heavy API work.
  (async () => {
    const res = await browserStorage.local.get(_BULK_IMPORT_KEY).catch(() => ({}));
    const pending = res?.[_BULK_IMPORT_KEY];
    if (pending?.startedAt) {
      const ageMs = Date.now() - pending.startedAt;
      // Don't resume if it just started within the last 60s (likely a reload, not a crash)
      if (ageMs > 60_000) {
        dbg.log(
          `init(): found interrupted bulk import from ${Math.round(ageMs / 60000)}min ago — scheduling resume in 45s`,
        );
        chrome.alarms.create("BULK_IMPORT_RESUME", { delayInMinutes: 0.75 });
      }
    }
  })().catch(() => {});

  // Initialize AI review queue store
  await initializeReviewQueueStore().catch((e) =>
    dbg.warn("failed to initialize review queue:", e),
  );

  SyncEngine.performSync().catch(() => {});
  processAIReviewQueue().catch(() => {});
  autoSyncSettings().catch(() => {});
  refreshIconBadge().catch(() => {});
  // Arm whichever queue alarms have work waiting from a previous session. An
  // alarm survives a worker restart but not an uninstall or a profile move, so
  // this is also what puts them back.
  refreshQueueAlarms().catch(() => {});

  dbg.log("init(): ✓ background initialized");
  if (initResolve) {
    initResolve();
  }
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
    // The install day, stamped once and never rewritten.
    //
    // Streaks are floored here. Importing a LeetCode profile brings years of
    // history with it, and every one of those points is worth keeping — but
    // crediting the days would hand a brand-new user a streak they never lived,
    // and the gaps in that history would open the timeline with a wall of
    // misses. Points are lifetime; streaks start when the extension does.
    if (!settings.installDay) {
      updates.installDay = dayKey(Date.now());
      dbg.log(`applyFirstRunDefaults(): set installDay=${updates.installDay}`);
    }
    // Gamification needs no key, no network and nobody else's terms of service,
    // so unlike AI it starts on. The welcome page offers to turn it off.
    if (!("gamificationEnabled" in settings)) {
      updates.gamificationEnabled = true;
    }
    await Storage.updateSettings(updates);
    dbg.log(
      `applyFirstRunDefaults(): ✓ disabled ${aiProvidersDisabled} AI provider(s), applied defaults`,
    );
  } catch (e) {
    // Non-fatal — defaults will apply via UI
    dbg.warn(`applyFirstRunDefaults(): ✗ caught error (non-fatal):`, e?.message);
  }
}

// getProblemCommitKey moved to core/lang-utils.js so every writer of the
// pendingProblemKeys map builds the same key this file's commit sweep matches.

function getProblemFiles(problem = {}, settings = {}) {
  // Enrich with canonical if missing (map must be pre-loaded via canonicalMapper.loadMap())
  if (!problem.canonical) {
    const resolved = canonicalMapper.resolve(
      problem.platform || "",
      problem.titleSlug || problem.id || "",
    );
    if (resolved) problem = { ...problem, canonical: resolved };
  }
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
    const verbose = (lang.verbose || lang.name || "Solution").replace(/\s+/g, "_");
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
    return JSON.stringify(value.map((v) => (typeof v === "string" ? v.trim() : v)));
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function _isProblemDrifted(local, remote) {
  if (!remote) return true;
  // Compare only stable metadata fields. `files` is regenerated from `code` on
  // every commit so it always differs; `canonical` is enriched client-side and
  // never persisted to index.json. Including either causes false-positive drift.
  const keys = [
    "title",
    "difficulty",
    "code",
    "tags",
    "lang",
    "aiReview",
    "notes",
    "methodTitle",
    "aiStatementSummary",
  ];
  return keys.some((k) => _stableJSON(local?.[k]) !== _stableJSON(remote?.[k]));
}

function _providerModelKey(provider) {
  const id = String(provider?.id || "").trim();
  const model = String(provider?.model || "").trim();
  return `${id}::${model}`;
}

function _targetKey(target = {}) {
  return `${target.provider || "github"}:${target.owner || ""}/${target.repo || ""}`;
}

/**
 * Whether a provider answers by asking a person.
 *
 * Nothing in this file has a person to ask. The service worker runs a review
 * after a solve is detected — possibly with the tab already closed — and it is
 * killed on idle, so a provider that waits for a paste would burn the 30s
 * timeout on every solve and then fall through to the next one having done
 * nothing but delay the commit. These providers are reached from a page
 * instead, where there is somebody looking at the screen.
 *
 * @param {string} id
 */
function _requiresHuman(id) {
  return CONSTANTS.AI_PROVIDERS?.[id]?.requiresHuman === true;
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
    if (_requiresHuman(provider.id)) return false;
    const key = _providerModelKey(provider);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function _buildBehaviorContext(stats) {
  if (!stats) return null;
  const lines = [];
  if (Array.isArray(stats.solves) && stats.solves.length > 1) {
    lines.push(`User has solved this problem ${stats.solves.length} times.`);
    const avg = Math.round(
      stats.solves.reduce((s, x) => s + (x.elapsedSeconds || 0), 0) / stats.solves.length,
    );
    if (avg > 0) lines.push(`Average solve time: ${Math.round(avg / 60)} min.`);
  } else if (Array.isArray(stats.solves) && stats.solves.length === 1) {
    const t = stats.solves[0].elapsedSeconds;
    if (t > 0) lines.push(`Solve time: ${Math.round(t / 60)} min.`);
  }
  if (stats.hintViews > 0) lines.push(`Viewed hints ${stats.hintViews} time(s).`);
  if (Array.isArray(stats.aiInsights) && stats.aiInsights.length) {
    const latest = stats.aiInsights[stats.aiInsights.length - 1];
    if (Array.isArray(latest?.weakAreas) && latest.weakAreas.length) {
      lines.push(`Previous review flagged: ${latest.weakAreas.join(", ")}.`);
    }
  }
  return lines.length ? lines.join(" ") : null;
}

function _extractWeakAreas(reviewText = "") {
  const text = reviewText.toLowerCase();
  const found = [];
  if (/edge case/i.test(text)) found.push("edge cases");
  if (/o\(n[²2]\)|quadratic|nested loop/i.test(text)) found.push("O(n²) complexity");
  if (/overflow|int overflow/i.test(text)) found.push("integer overflow");
  if (/off.by.one/i.test(text)) found.push("off-by-one");
  if (/null|undefined|empty input/i.test(text)) found.push("null/empty input");
  if (/memory|space complexity/i.test(text)) found.push("space complexity");
  if (/time complexity|could be faster/i.test(text)) found.push("time complexity");
  return found;
}

async function generateAIReview(problem = {}, settings = null) {
  dbg.log(`generateAIReview(): starting for ${problem.titleSlug || "unknown"}`);
  const currentSettings = settings || (await Storage.getSettings());
  const providers = _buildAIReviewProviders(currentSettings);
  dbg.log(`generateAIReview(): ${providers.length} provider(s) in fallback chain`);

  // Inject behavior bank context so the AI is aware of solve history / past struggles.
  // Two scales: this problem's own record, and the aggregate profile — the
  // second is what lets the review say "this is the fourth time off-by-one has
  // come up" instead of treating every solve as the learner's first.
  const [behaviorStats, profileContext] = await Promise.all([
    getProblemStats(problem.titleSlug || problem.id || "", problem.platform || "").catch(
      () => null,
    ),
    getProfileContext().catch(() => ""),
  ]);
  const problemContext = _buildBehaviorContext(behaviorStats);
  const behaviorContext = [problemContext, profileContext].filter(Boolean).join("\n\n");
  if (behaviorContext)
    dbg.log(`generateAIReview(): injecting behavior context (${behaviorContext.length} chars)`);

  let inferredTags = null;
  let hasRateLimitErrors = false;
  let triedCount = 0;

  for (let idx = 0; idx < providers.length; idx++) {
    const provider = providers[idx];
    const providerId = provider.id;
    dbg.log(`generateAIReview(): attempt ${idx + 1}/${providers.length} — provider=${providerId}`);
    if (currentSettings[`${providerId}_enabled`] === false) {
      dbg.log(`generateAIReview(): ✗ ${providerId} disabled in settings, skipping`);
      continue;
    }

    const ai = registry.getAIProvider(providerId);
    if (!ai) {
      dbg.warn(`generateAIReview(): ✗ handler for ${providerId} not found`);
      continue;
    }

    triedCount++;
    // Wrap review call with timeout to avoid hanging on slow providers.
    // Keep below the ProblemModal's 90s total timeout so the fallback
    // chain has a chance to run if the first provider stalls.
    const TIMEOUT_MS = 30000;
    try {
      dbg.log(`generateAIReview(): calling ${providerId} with ${TIMEOUT_MS}ms timeout`);
      let review = await Promise.race([
        ai.review(problem.code, {
          ...problem,
          _behaviorContext: behaviorContext || undefined,
          aiModelOverride: provider.model || "",
        }),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error("AI provider timeout")), TIMEOUT_MS),
        ),
      ]);

      if (!review || String(review).trim() === "") {
        dbg.warn(`generateAIReview(): ✗ ${providerId} returned empty review, trying next provider`);
        continue;
      }

      dbg.log(`generateAIReview(): ✓ success via ${providerId} (${String(review).length} chars)`);

      // Parse AI-inferred metadata
      let inferredMetadata = null;
      let reviewerWeakAreas = [];
      let reviewerTakeaway = "";
      if (review) {
        const metaRegex = /METADATA\s*\n([\s\S]*?)\n\s*END_METADATA/i;
        const blockMatch = review.match(metaRegex);
        let blockText = "";
        if (blockMatch) {
          blockText = blockMatch[0];
          review = review.replace(blockMatch[0], "").trim();
        } else {
          // Fallback: look for individual lines starting with TAGS, TOPIC, PATTERN, DIFFICULTY
          const lines = review.split("\n");
          const keptLines = [];
          for (const line of lines) {
            if (
              /^(TAGS|TOPIC|PATTERN|DIFFICULTY|SUMMARY|WEAK_AREAS|TAKEAWAY|METADATA|END_METADATA):/i.test(
                line,
              )
            ) {
              blockText += line + "\n";
            } else {
              keptLines.push(line);
            }
          }
          review = keptLines.join("\n").trim();
        }

        const tagsMatch = blockText.match(/TAGS:\s*(.+)/i);
        const topicMatch = blockText.match(/TOPIC:\s*(.+)/i);
        const patternMatch = blockText.match(/PATTERN:\s*(.+)/i);
        const diffMatch = blockText.match(/DIFFICULTY:\s*(.+)/i);
        const weakMatch = blockText.match(/WEAK_AREAS:\s*(.+)/i);
        if (weakMatch) reviewerWeakAreas = parseWeakAreas(weakMatch[1]);
        const takeawayMatch = blockText.match(/TAKEAWAY:\s*(.+)/i);
        if (takeawayMatch) reviewerTakeaway = parseTakeaway(takeawayMatch[1]);

        const meta = {};
        if (tagsMatch) {
          meta.tags = tagsMatch[1]
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
          inferredTags = meta.tags; // For backwards compatibility
        }
        if (topicMatch) {
          meta.topic = topicMatch[1].trim();
        }
        if (patternMatch) {
          meta.pattern = patternMatch[1].trim();
        }
        if (diffMatch) {
          meta.difficulty = diffMatch[1].trim();
        }
        // Only asked for when the record had no statement, and applied only if
        // it still has none — see applyInferredMetadata.
        const summaryMatch = blockText.match(/SUMMARY:\s*(.+)/i);
        if (summaryMatch) {
          const s = parseStatementSummary(summaryMatch[1]);
          if (s) meta.statementSummary = s;
        }

        if (Object.keys(meta).length > 0) {
          inferredMetadata = meta;
          dbg.log("generateAIReview(): parsed inferred metadata", meta);
        }
      }

      // Write back insights to behavior bank (non-blocking). The reviewer's own
      // WEAK_AREAS line is authoritative when present — it knows what it flagged.
      // The keyword scan stays as the fallback for models that drop the block.
      // The summary falls back to the head of the review only when the model
      // dropped the TAKEAWAY line. That fallback is close to useless — the first
      // 200 characters of a review are its heading — so it is a last resort, not
      // the normal path.
      // Chained rather than run alongside: synthesis reads the bank back, so it
      // has to see the flags this review just wrote or the counts lag a solve
      // behind. Both are fire-and-forget — a memo failing must not fail a review.
      recordAIInsights({
        slug: problem.titleSlug || problem.id || "",
        platform: problem.platform || "",
        weakAreas: reviewerWeakAreas.length ? reviewerWeakAreas : _extractWeakAreas(review),
        summary: reviewerTakeaway || review.slice(0, 200),
        hasTakeaway: !!reviewerTakeaway,
      })
        .then(() => synthesizeInsights())
        .catch(() => {});

      const modelId = provider.model || CONSTANTS.AI_PROVIDERS[providerId]?.defaultModel || "";
      return { review, providerId, modelId, inferredTags, inferredMetadata };
    } catch (err) {
      const errMsg = String(err?.message || "").toLowerCase();
      if (errMsg.includes("timeout")) {
        dbg.warn(`generateAIReview(): ✗ ${providerId} timed out (${TIMEOUT_MS}ms)`);
      } else {
        dbg.error(`generateAIReview(): ✗ ${providerId} failed:`, err?.message || err);
      }
      if (/rate.?limit|429|503|quota|too many requests/i.test(errMsg)) {
        hasRateLimitErrors = true;
      }
    }
  }

  dbg.error(`generateAIReview(): ✗ all providers exhausted for ${problem.titleSlug || "unknown"}`);

  if (hasRateLimitErrors) {
    throw new Error(
      "All AI providers are rate-limited. API quotas exhausted — snail mode will retry automatically. You can also wait and try again, or upgrade your API tier in Settings → AI.",
    );
  }

  if (triedCount === 0) {
    dbg.log("generateAIReview(): no providers enabled, returning Demo review");
    return {
      review: `### CodeLedger Demo Review

**Status:** Running in Demo Mode (no API key configured)

This is a simulated review to demonstrate CodeLedger's AI review functionality. To generate live, customized reviews based on your code:
1. Open the CodeLedger **Settings** panel.
2. Navigate to the **AI** tab.
3. Select your preferred provider (e.g., Google Gemini, OpenAI, Claude, or local Ollama).
4. Enter your personal API key and click **Save**.

---

#### ✦ Initial Impressions
The structure of your code is clean and readable. The problem-solving logic aligns with standard approaches for **${problem.title || problem.titleSlug || "this problem"}**.

#### ✦ Code Analysis
- **Time Complexity:** Optimized to match the average complexity for this type of problem.
- **Space Complexity:** Operates within acceptable limits without excessive auxiliary storage.
- **Style:** Good variable naming and clear loop structure.

*Demo Mode — Settings → AI to connect.*`,
      providerId: "demo",
      modelId: "demo-model",
      inferredTags: [],
      inferredMetadata: {
        tags: [],
        topic: "Demo",
        pattern: "Demo",
        difficulty: problem.difficulty || "Easy",
      },
    };
  }

  throw new Error(
    "AI review failed — all providers returned errors. Check your API keys in Settings → AI.",
  );
}

async function commitUpdatedProblem(problem, settings) {
  const currentSettings = settings || (await Storage.getSettings());
  const gitEnabled = currentSettings.gitEnabled !== false && currentSettings.gitEnabled !== 0;
  dbg.log(`commitUpdatedProblem(): ${problem.titleSlug || "unknown"}, git_enabled=${gitEnabled}`);
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
  try {
    filesToCommit.push({
      path: ".codeledger/sync.json",
      content: await buildSyncPayload(),
    });
  } catch (_) {}
  try {
    const bank = await Storage.getBehaviorBank();
    filesToCommit.push({
      path: ".codeledger/behaviour-bank.json",
      content: JSON.stringify(bank || {}, null, 2),
    });
  } catch (_) {}
  try {
    const roadmaps = await Storage.getRoadmaps();
    filesToCommit.push({
      path: ".codeledger/roadmaps.json",
      content: JSON.stringify(roadmaps || [], null, 2),
    });
  } catch (_) {}
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
            : Date.now(),
        ),
      },
      currentSettings,
    );
    dbg.log(`commitUpdatedProblem(): ✓ commit succeeded`);
    _maybeGenerateAISummary(currentSettings).catch(() => {});
    // Rolling backup — fire-and-forget; the outcome lands in the backup status
    saveLocalSnapshots();

    const _git = registry.getGitProvider(currentSettings.gitProvider || "github");
    if (_git) {
      const _owner = currentSettings.github_owner || currentSettings.github_username || "";
      if (_owner) {
        maybeCommitRollingBackup(_owner, repoName, _git).catch(() => {});
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

// Match patterns for the tabs our content scripts are actually injected into.
// Derived from CONSTANTS so it cannot drift from the manifest.
const _CONTENT_SCRIPT_MATCHES = [
  ...new Set(
    Object.values(CONSTANTS.PLATFORMS).flatMap((p) =>
      // "*.host" already covers the bare host and every subdomain, so the
      // www./practice. variants collapse into one pattern.
      (p.domains || []).map((d) => `*://*.${d.replace(/^(www|practice)\./, "")}/*`),
    ),
  ),
];

/**
 * Send a message to every tab running one of our content scripts.
 *
 * Deliberately filtered rather than `tabs.query({})`: an unfiltered query
 * enumerates every tab the user has open — including their URLs and titles —
 * for no benefit, since sendMessage only ever reaches our own content scripts.
 */
function _broadcastToContentScripts(message) {
  chrome.tabs.query({ url: [..._CONTENT_SCRIPT_MATCHES] }, (matched) => {
    void chrome.runtime.lastError;
    for (const tab of matched || []) {
      chrome.tabs.sendMessage(tab.id, message, () => {
        void chrome.runtime.lastError; // suppress "no receiver" for tabs mid-navigation
      });
    }
  });
}

/**
 * Broadcast GITHUB_REAUTH_REQUIRED to all extension pages.
 * Called whenever a GitHub API call returns 401 so the UI can prompt
 * the user to reconnect immediately rather than silently swallowing the error.
 */
async function _broadcastAuthExpired() {
  await Storage.setAuthToken("github", "").catch(() => {});
  dbg.warn("_broadcastAuthExpired(): OAuth token rejected — cleared, notifying tabs");
  _broadcastToContentScripts({ type: "GITHUB_REAUTH_REQUIRED" });
  chrome.runtime.sendMessage({ type: "GITHUB_REAUTH_REQUIRED" }, () => {
    void chrome.runtime.lastError;
  });
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
  const repo = (settings.github_repo || settings.gitRepo || "").replace(/\s+/g, "-").trim();
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

async function _commitWithFailover(files, message, repoName, commitOpts, settings) {
  const targets = _getOrderedTargets(settings);
  dbg.log(`_commitWithFailover(): resolved ${targets.length} target(s)`);
  if (!targets.length) {
    const git = registry.getGitProvider(settings.gitProvider || "github");
    if (!git) throw new Error("No git provider configured");
    dbg.log(
      `_commitWithFailover(): no ordered targets; committing to configured provider ${settings.gitProvider || "github"} repo ${repoName || settings.github_repo || settings.gitRepo}`,
    );
    const newSha = await git.commit(
      files,
      message,
      repoName || settings.github_repo || settings.gitRepo,
      commitOpts,
    );
    return { handler: git, target: null, newSha };
  }

  // Statuses that mean the target itself is broken (repo gone, payload
  // rejected) rather than the moment being bad. Only these justify promoting a
  // later target to active primary: a 5xx, a rate-limit or a network error is
  // transient, and promoting on it silently abandons the real primary — every
  // future commit then lands on the mirror while the primary falls behind
  // forever. (401 never reaches here; it throws above the ladder.)
  const PERMANENT_STATUSES = new Set([400, 404, 410, 422]);
  let priorFailuresPermanent = true;
  let lastErr = null;
  for (const target of targets) {
    const handler = registry.getGitProvider(target.provider || "github");
    dbg.log(
      `_commitWithFailover(): attempting target ${target.provider}/${target.owner || ""}/${target.repo}`,
    );
    if (!handler) continue;
    try {
      const newSha = await handler.commit(files, message, target.repo, {
        ...(commitOpts || {}),
        ownerOverride: target.owner || undefined,
        isMirror: false,
      });

      const active = settings.git_active_primary;
      const currentKey = active ? _targetKey(_normalizeGitTarget(active) || {}) : "";
      const wonKey = _targetKey(target);
      if (currentKey !== wonKey && priorFailuresPermanent) {
        await Storage.updateSettings({ git_active_primary: target }).catch(() => {});
      }
      dbg.log(
        `_commitWithFailover(): ✓ succeeded to ${target.provider}/${target.owner || ""}/${target.repo}`,
      );
      return { handler, target, newSha };
    } catch (e) {
      lastErr = e;
      if (!PERMANENT_STATUSES.has(e.status)) priorFailuresPermanent = false;
      dbg.warn(
        `_commitWithFailover(): ✗ target ${target.provider}/${target.owner ? target.owner + "/" : ""}${target.repo} failed:`,
        e.message,
      );
      // A rejected token is rejected for every target, and _broadcastAuthExpired
      // has just cleared it — continuing would fire the remaining attempts with
      // no credentials and bury the real cause behind their errors.
      if (e.status === 401) {
        await _broadcastAuthExpired().catch(() => {});
        throw e;
      }
    }
  }

  if (lastErr) throw lastErr;
  throw new Error("No available git target succeeded");
}

async function _resolveGitHubContext(settings = null) {
  const s = settings || (await Storage.getSettings());
  const target =
    _getOrderedTargets(s).find((t) => t.provider === "github") || _getDefaultPrimaryTarget(s);
  if (!target || target.provider !== "github") {
    throw new Error("No GitHub repository configured");
  }

  const git = registry.getGitProvider("github");
  if (!git) throw new Error("No git provider configured");
  const token = await git.getToken();
  if (!token) {
    await _broadcastAuthExpired().catch(() => {});
    throw new Error("Not authenticated with GitHub — please reconnect");
  }

  let owner = (target.owner || "").trim();
  if (!owner) {
    try {
      const userRes = await git.getCurrentUser();
      owner = userRes.login;
    } catch (err) {
      if (err.status === 401) await _broadcastAuthExpired().catch(() => {});
      throw err;
    }
  }

  return { settings: s, git, token, owner, repoName: target.repo, target };
}

async function handleSyncPreview() {
  const { settings, git, owner, repoName } = await _resolveGitHubContext();
  return importFromRepo(owner, repoName, git).then((result) => ({
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
  await initPromise;
  dbg.log(`handleSolved(): received solve event, titleSlug=${data.titleSlug}`);

  // 0. Incognito mode guard — silently skip recording and committing
  {
    const settings = await Storage.getSettings();
    const mode = settings.incognitoMode;
    if (mode && mode !== "off" && mode !== false) {
      const forever = mode === "forever" || mode === true;
      const expiry = settings.incognitoExpiry ?? 0;
      const active = forever ? true : expiry === -1 ? true : expiry > 0 && Date.now() < expiry;
      if (active) {
        dbg.log(`handleSolved(): incognito mode active, discarding ${data.titleSlug}`);
        return;
      }
      // Timer expired — auto-reset to off
      await Storage.updateSettings({
        incognitoMode: "off",
        incognitoExpiry: 0,
      }).catch(() => {});
    }
  }

  const titleSlug = data.titleSlug || "";
  const langName = data.lang?.name || data.lang?.slug || data.lang?.ext || "";
  // The fallback key must be stable across deliveries of the same event: with
  // Date.now() in it, a duplicate solve event (MutationObserver double-fire,
  // handler retry) got a fresh key every time and the dedup check never hit.
  // Every handler sets timestamp; "no-ts" only appears for malformed events,
  // and forceCommit still overrides the dedup for genuine re-commits.
  const submissionCommitKey = data.submissionId
    ? `submission:${data.platform || "unknown"}:${data.submissionId}`
    : `submission:${data.platform || "unknown"}:${titleSlug}:${langName}:${data.timestamp || data.id || "no-ts"}`;
  const alreadyCommitted = await Storage.isSubmissionCommitted(submissionCommitKey).catch(
    () => false,
  );
  dbg.log(
    `handleSolved(): tracking - platform=${data.platform}, slug=${titleSlug}, lang=${langName}, already_committed=${alreadyCommitted}`,
  );

  // 2. Save locally — for bulk imports, skip if the user has manually edited this record.
  if (data.skipCommit) {
    const existing = await Storage.getProblem(data.id).catch(() => null);
    if (existing?.manuallyEdited) {
      dbg.log(`handleSolved(): skipping import overwrite (manually edited) ${titleSlug}`);
      return;
    }
  }
  await Storage.saveProblem(data);
  await recordSolve({
    slug: data.titleSlug || data.id || "",
    platform: data.platform || "",
    difficulty: data.difficulty || "",
    lang: langName,
    elapsedSeconds: data.elapsedSeconds || 0,
    tags: data.tags || [],
  }).catch((e) => dbg.warn("Failed to record solve in behavior bank:", e?.message));

  {
    const problemCommitKey = getProblemCommitKey(data);
    if (problemCommitKey) {
      await Storage.markPendingProblemKey(problemCommitKey).catch(() => {});
    }
  }

  // Notify open library tabs so they refresh the problem list immediately
  try {
    const libUrl = chrome.runtime.getURL("library/library.html");
    chrome.tabs.query({ url: libUrl }, (tabs) => {
      (tabs || []).forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { type: "PROBLEM_SAVED", id: data.id }).catch(() => {});
      });
    });
  } catch (_) {}

  // 3. Duplicate Detection — check if code matches existing solutions.
  // Runs for every solve, before the AI review copies `data`: this used to
  // live inside the AI-review catch, so it only ever ran when a review was
  // requested AND threw — never with auto-review off, never on success.
  try {
    const allProblems = await Storage.getAllProblems().catch(() => []);
    const dupResult = detectDuplicate(data, allProblems);
    if (dupResult.isDuplicate) {
      data.isDuplicate = true;
      data.duplicateOf = dupResult.duplicateOf;
      dbg.log(
        `handleSolved(): duplicate detected: ${data.titleSlug} matches ${dupResult.duplicateOf}`,
      );
      await Storage.saveProblem(data);
    }
  } catch (dupErr) {
    dbg.error(`handleSolved(): duplicate detection failed:`, dupErr?.message || dupErr);
  }

  // 3a. AI Review (if enabled)
  // Note: settings is loaded here so rename detection below can use it too
  const settings = await Storage.getSettings();

  // Detect canonical path migration — schedule rename if stored base differs from new base
  if (data.canonical?.id && data._storedBasePath) {
    const expectedBase = problemBase(
      data.id || data.titleSlug,
      { canonicalId: data.canonical.id },
      settings,
      data.platform,
    );
    if (data._storedBasePath !== expectedBase) {
      await Storage.markRenameNeeded(data.id, {
        oldBase: data._storedBasePath,
        newBase: expectedBase,
      }).catch(() => {});
    }
  }
  // Decide whether to run AI review:
  // - global `autoReview` setting AND per-submission flag set by the platform handler
  const shouldAutoReview = settings.autoReview !== false && data._requestAIReview === true;
  if (shouldAutoReview) {
    try {
      const { review, providerId, modelId, inferredMetadata } = await generateAIReview(
        data,
        settings,
      );
      data.aiReview = review;
      data._aiProvider = providerId;
      data._aiModel = modelId;

      let updatedData = applyInferredMetadata(data, inferredMetadata);
      await Storage.saveProblem(updatedData);
      dbg.log(`handleSolved(): ✓ AI review success via ${providerId} (${modelId})`);
    } catch (err) {
      dbg.warn(`handleSolved(): AI review failed (non-blocking):`, err?.message || err);
    }
  }

  // 3c. Auto-merge deduplication: check for same-language solutions and queue for review if similar
  try {
    const existingProblem = await Storage.getProblem(data.id).catch(() => null);
    if (existingProblem && existingProblem.solutions && Array.isArray(existingProblem.solutions)) {
      const sameLang = existingProblem.solutions.filter(
        (s) => s.lang === data.lang?.name || s.lang === data.lang?.slug,
      );
      if (sameLang.length > 0) {
        const groups = await findDuplicatesForProblem(
          {
            ...existingProblem,
            solutions: sameLang.concat([{ code: data.code, lang: data.lang?.name }]),
          },
          settings.aiProvider || "gemini",
        );
        // If this solution groups with existing ones, queue for review
        if (groups.length > 0 && groups[0].length > 1) {
          const reviewKey = `dedup:${data.id}:${data.lang?.name}:${Date.now()}`;
          await Storage.markPendingProblemKey(reviewKey).catch(() => {});
          dbg.log(
            `handleSolved(): queued for review (dedup): ${data.titleSlug} (${data.lang?.name})`,
          );
        }
      }
    }
  } catch (err) {
    dbg.warn(`handleSolved(): auto-merge dedup failed (non-blocking):`, err?.message || err);
  }

  // 4. Git Commit — only auto-commit first time per (slug, language)
  // gitEnabled defaults to true when never explicitly set (matches schema default: true)
  const gitEnabled = settings.gitEnabled !== false && settings.gitEnabled !== 0;
  dbg.log(
    `handleSolved(): git config - enabled=${gitEnabled}, skipCommit=${!!data.skipCommit}, forceCommit=${!!data.forceCommit}`,
  );
  if (data.skipCommit) {
    dbg.log(
      `handleSolved(): skipCommit flag set, skipping git commit for bulk import - ${titleSlug}`,
    );
    return;
  }
  const forceCommit = !!data.forceCommit;
  if (gitEnabled && alreadyCommitted && !forceCommit) {
    dbg.log(
      `handleSolved(): already committed submission event, skipping auto-commit - ${submissionCommitKey}`,
    );
  }
  if (gitEnabled && (forceCommit || !alreadyCommitted)) {
    // Serialized per submission key, with the dedup re-checked inside the
    // lock: two deliveries of the same event otherwise both read
    // already_committed=false above (the mark only lands after the first
    // commit finishes) and both commit.
    await withLock(`cl.commit.${submissionCommitKey}`, async () => {
      if (
        !forceCommit &&
        (await Storage.isSubmissionCommitted(submissionCommitKey).catch(() => false))
      ) {
        dbg.log(`handleSolved(): duplicate suppressed inside commit lock - ${submissionCommitKey}`);
        return;
      }
      dbg.log(`handleSolved(): starting auto-commit - type=${forceCommit ? "UPDATE" : "SOLVED"}`);
      try {
        const pendingMap = await Storage.getPendingProblemKeys().catch(() => ({}));
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
            if (p.notes && typeof p.notes === "string" && p.notes.trim()) {
              const base = problemBase(p.id || p.titleSlug, p.canonical, settings, p.platform);
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
              const chats = await getChatsByProblem(slug).catch(() => []);
              const base = problemBase(p.id || p.titleSlug, p.canonical, settings, p.platform);
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

        // Bundle .codeledger/* so settings/bank/roadmaps stay in sync with every solve
        try {
          filesToCommit.push({
            path: ".codeledger/sync.json",
            content: await buildSyncPayload(),
          });
        } catch (_) {}
        try {
          const bank = await Storage.getBehaviorBank();
          filesToCommit.push({
            path: ".codeledger/behaviour-bank.json",
            content: JSON.stringify(bank || {}, null, 2),
          });
        } catch (_) {}
        try {
          const roadmaps = await Storage.getRoadmaps();
          filesToCommit.push({
            path: ".codeledger/roadmaps.json",
            content: JSON.stringify(roadmaps || [], null, 2),
          });
        } catch (_) {}

        // Auto-commit settings if they've changed
        const configFile = await getConfigFileForCommit();
        if (configFile) {
          filesToCommit.push(configFile);
          dbg.log(`handleSolved(): including config file in commit`);
        }

        const pendingCount = pendingProblems.length || 1;
        const commitType = forceCommit ? COMMIT_TYPES.UPDATE : COMMIT_TYPES.SOLVED;
        const commitMsg =
          pendingCount > 1
            ? buildCommitMessage(COMMIT_TYPES.CHORE, {
                count: pendingCount,
              })
            : buildCommitMessage(commitType, data, settings.commitMessageTemplate);
        dbg.log(
          `handleSolved(): commit prep - pending=${pendingCount}, type=${commitType}, files=${filesToCommit.length}`,
        );
        // Codeforces (and any REST-sourced solve) reports Unix seconds; the rest
        // report ms. Same guard as commitUpdatedProblem/handleResyncAll — without
        // it the commit is authored in January 1970.
        const commitOpts = data.timestamp
          ? { date: new Date(data.timestamp > 1e10 ? data.timestamp : data.timestamp * 1000) }
          : {};
        const primaryResult = await _commitWithFailover(
          filesToCommit,
          commitMsg,
          settings.github_repo || settings.gitRepo,
          commitOpts,
          settings,
        );
        await Storage.markSubmissionCommitted(submissionCommitKey).catch(() => {});
        await Storage.markSlugLangCommitted(data.id || titleSlug, langName).catch(() => {});
        const clearedKeys = pendingProblems.map((p) => getProblemCommitKey(p)).filter(Boolean);
        await Storage.clearPendingProblemKeys(clearedKeys).catch(() => {});

        // Record committed paths per-problem so future resyncs can detect
        // structural drift (path renames, layout changes) and compute deletions.
        for (const p of pendingProblems) {
          const paths = getProblemFiles(p, settings).map((f) => f.path);
          if (paths.length > 0) {
            await Storage.saveProblem({ ...p, _committedPaths: paths }).catch(() => {});
          }
        }

        // Clear settings commit flag after successful commit
        await clearSettingsCommitFlag().catch(() => {});

        dbg.log(
          `handleSolved(): ✓ git commit successful - slug=${titleSlug}, cleared_keys=${clearedKeys.length}`,
        );

        if (settings.notifications !== false) {
          try {
            chrome.notifications.create({
              type: "basic",
              iconUrl: chrome.runtime.getURL("assets/icons/icon48.png"),
              title: "CodeLedger: Committed!",
              message: `${data.title || titleSlug} saved to GitHub.`,
            });
          } catch (_) {}
        }

        // On-device snapshots — one build feeds the rolling copy and, if it is
        // switched on, the scheduled one.
        saveLocalSnapshots({
          scheduled: settings.schedBackupOnSolve !== false,
          trigger: "on-solve",
        });

        // GitHub rolling backup (if enabled)
        const _git = registry.getGitProvider(settings.gitProvider || "github");
        if (_git) {
          const _owner = settings.github_owner || settings.github_username || "";
          const _repo = settings.github_repo || settings.gitRepo || "";
          if (_owner && _repo) {
            maybeCommitRollingBackup(_owner, _repo, _git).catch((err) => {
              dbg.warn("maybeCommitRollingBackup failed inside handleSolved:", err);
            });
          }
        }

        // Fire-and-forget: rename files to canonical paths if needed
        performPendingRenames().catch(() => {});

        // Push to any configured mirrors (fire-and-forget; failures are non-fatal)
        await pushToMirrors(
          filesToCommit,
          commitMsg,
          commitOpts,
          settings,
          primaryResult.target ? _targetKey(primaryResult.target) : "",
        );
      } catch (err) {
        dbg.error(`handleSolved(): ✗ git commit failed for ${titleSlug}:`, err?.message || err);
        dbg.error(`handleSolved(): error details:`, err);
      }
    });
  }

  // The solve is in IndexedDB by now whether or not the commit went through,
  // so the streak on the icon is accurate either way.
  refreshIconBadge().catch(() => {});

  Telemetry.track("solve", { platform: data.platform });
}

/**
 * Pushes the same files+message to all mirrors listed in settings.git_mirrors.
 * Each mirror entry: { provider: "github", repo: string, owner?: string }
 * Failures are logged but never thrown — mirrors are best-effort.
 */
async function pushToMirrors(files, message, commitOpts, settings, skipTargetKey = "") {
  const mirrors = settings.git_mirrors;
  if (!Array.isArray(mirrors) || mirrors.length === 0) return;
  await Promise.allSettled(
    mirrors.map(async (mirror) => {
      if (!mirror?.repo) return;
      if (mirror.enabled === false) return;
      const normalized = _normalizeGitTarget(mirror);
      if (normalized && skipTargetKey && _targetKey(normalized) === skipTargetKey) return;
      const handler = registry.getGitProvider(mirror.provider || "github");
      if (!handler) return;
      try {
        await handler.commit(files, message, mirror.repo, {
          ...commitOpts,
          ownerOverride: mirror.owner || undefined,
        });
        dbg.log(`pushToMirrors(): ✓ mirror commit OK - ${mirror.provider}/${mirror.repo}`);
      } catch (e) {
        dbg.warn(
          `pushToMirrors(): ✗ mirror commit failed - ${mirror.provider}/${mirror.repo}:`,
          e.message,
        );
      }
    }),
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

  const userRes = await git.getCurrentUser().catch(() => null);
  const owner = settings.github_owner?.trim() || userRes?.login;
  const repo = (settings.github_repo || settings.gitRepo || "").replace(/\s+/g, "-");
  if (!owner || !repo) return;

  const filesToAdd = [];
  const pathsToDelete = [];

  for (const r of renames) {
    try {
      const branch = CONSTANTS.REPO_BRANCH || "main";
      const tree = await git.apiFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
      const relevant = (tree.tree || []).filter(
        (f) => f.type === "blob" && f.path.startsWith(r.oldBase + "/"),
      );
      for (const f of relevant) {
        const newPath = f.path.replace(r.oldBase, r.newBase);
        const blob = await git.apiFetch(`/repos/${owner}/${repo}/git/blobs/${f.sha}`);
        const content = decodeBase64Utf8(blob.content);
        filesToAdd.push({ path: newPath, content });
        pathsToDelete.push(f.path);
      }
    } catch (e) {
      dbg.warn(`performPendingRenames(): preflight failed for ${r.oldBase}:`, e.message);
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
      { deletes: pathsToDelete },
    );
    await Storage.clearPendingRenames().catch(() => {});
    dbg.log(`performPendingRenames(): ✓ committed ${renames.length} rename(s)`);
  } catch (e) {
    dbg.error(`performPendingRenames(): ✗ rename commit failed:`, e.message);
  }
}

/**
 * Build index.json content from an explicit problem list.
 * Used by the individual-commit loop so each checkpoint reflects only what
 * has actually been committed, not the full local library.
 */
function _buildIndexJsonFromList(problems, settings) {
  const diff = countByDifficulty(problems, buildUserDifficultyMap(settings));
  const stats = {
    total: problems.length,
    easy: diff.easy,
    medium: diff.medium,
    hard: diff.hard,
    unknownDifficulty: diff.unknown,
    byPlatform: problems.reduce((acc, p) => {
      const k = p.platform || "unknown";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
    byLang: problems.reduce((acc, p) => {
      const k = p.lang?.name || p.lang?.slug || "unknown";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
    byTopic: problems.reduce((acc, p) => {
      const k = (p.tags && p.tags[0]) || p.topic || "uncategorized";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
  };
  const meta = {
    summary: settings?._aiSummary || null,
    summaryUpdatedAt: settings?._aiSummaryUpdatedAt || null,
    commitsSinceLastSummary: settings?._commitsSinceLastSummary || 0,
  };
  return JSON.stringify(
    {
      updatedAt: new Date().toISOString(),
      layoutVersion: LAYOUT_VERSION,
      stats,
      meta,
      problems,
    },
    null,
    2,
  );
}

async function buildIndexJson() {
  const problems = await Storage.getAllProblems();
  dbg.log(`buildIndexJson(): building index for ${problems.length} problem(s)`);
  const userDifficultyMap = await loadUserDifficultyMap();
  const diff = countByDifficulty(problems, userDifficultyMap);
  const stats = {
    total: problems.length,
    easy: diff.easy,
    medium: diff.medium,
    hard: diff.hard,
    unknownDifficulty: diff.unknown,
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
    `buildIndexJson(): ✓ stats=easy:${stats.easy} med:${stats.medium} hard:${stats.hard} unknown:${stats.unknownDifficulty}`,
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
    2,
  );
}

const SUMMARY_EVERY_N_COMMITS = 10;

async function _maybeGenerateAISummary(settings) {
  try {
    const count = (settings._commitsSinceLastSummary || 0) + 1;
    if (count < SUMMARY_EVERY_N_COMMITS) {
      // Increment from whatever is stored now, not from the snapshot this
      // function was handed — two commits finishing together must count twice.
      await Storage.updateSettings((cur) => ({
        _commitsSinceLastSummary: (cur._commitsSinceLastSummary || 0) + 1,
      }));
      return;
    }
    dbg.log(`_maybeGenerateAISummary(): ${count} commits since last summary — generating...`);
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
      settings,
    );
    if (review) {
      dbg.log(`_maybeGenerateAISummary(): ✓ summary generated via ${providerId}`);
      await Storage.updateSettings({
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
  const { git, owner, repoName } = await _resolveGitHubContext();
  const remoteProblems = [];
  try {
    const indexRes = await git.getContents(owner, repoName, "index.json");
    const raw = decodeBase64Utf8(indexRes.content);
    const index = JSON.parse(raw);
    remoteProblems.push(...(index.problems || []));
    dbg.log(`handleResyncCount(): fetched ${remoteProblems.length} remote problem(s)`);
  } catch (e) {
    if (e?.status !== 404) {
      // Auth/network/rate-limit failure — don't show a misleading count
      dbg.warn(`handleResyncCount(): remote index unreachable (${e?.status}):`, e?.message);
      return { count: null };
    }
    // 404 = empty repo / no index.json yet — treat as zero remote problems
    dbg.log(`handleResyncCount(): no index.json yet, treating remote as empty`);
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
  dbg.log(`handleResyncCount(): ✓ counted ${missing.length} missing problem(s)`);
  return { count: missing.length };
}

/**
 * Syncs all local problems to GitHub.
 * mode="bulk"       — one atomic commit for all missing problems (default, rate-limit safe).
 * mode="individual" — one commit per problem with correct backdated timestamps.
 */
const _BULK_IMPORT_KEY = "cl-bulk-import-pending";

// While a profile import is feeding batches in, a bulk resync would flatten
// every record's real solve date into one now-dated commit. handleBulkImport
// stamps this key (a wall-clock expiry, so a crashed import can never suppress
// maintenance forever) and the maintenance alarm + any bulk resync request
// defer to the backdated individual mode until it lapses or the import's own
// individual sync clears it.
const _IMPORT_ACTIVE_KEY = "cl.import.activeUntil";

async function _isImportActive() {
  const res = await browserStorage.local.get(_IMPORT_ACTIVE_KEY).catch(() => ({}));
  return Number(res?.[_IMPORT_ACTIVE_KEY] || 0) > Date.now();
}

async function handleResyncAll(mode = "bulk", commitType = "chore") {
  if (_resyncInProgress) {
    dbg.warn("handleResyncAll(): already in progress — skipping duplicate call");
    return { committed: 0, skipped: true };
  }
  if (mode === "bulk" && (await _isImportActive())) {
    dbg.log(
      "handleResyncAll(): import in flight — upgrading bulk to individual to keep solve dates",
    );
    mode = "individual";
  }
  _resyncInProgress = true;
  // Persist intent for individual-mode syncs so a browser close can resume
  if (mode === "individual") {
    await browserStorage.local
      .set({ [_BULK_IMPORT_KEY]: { startedAt: Date.now(), mode } })
      .catch(() => {});
  }
  try {
    const result = await _handleResyncAllInner(mode, commitType);
    return result;
  } finally {
    _resyncInProgress = false;
    // Clear the resume flag once done (whether succeeded or failed)
    if (mode === "individual") {
      await browserStorage.local.remove(_BULK_IMPORT_KEY).catch(() => {});
    }
    // A completed sync of any mode means the import's records are committed
    // (or failed and will be retried by maintenance) — stop suppressing.
    await browserStorage.local.remove(_IMPORT_ACTIVE_KEY).catch(() => {});
    try {
      _activeSyncPort?.postMessage({ type: "sync-done" });
    } catch (_) {}
  }
}

/**
 * Find all file paths currently in the remote repo that belong to a given problem.
 * Used for migration: problems committed before _committedPaths tracking started.
 * Handles ::submissionId suffix in directory names (old format).
 */
function _inferCommittedPaths(problem, remoteFileTree) {
  if (!remoteFileTree || remoteFileTree.length === 0) return [];

  const platform = (problem.platform || "").toLowerCase();
  const rawId = String(problem.id || problem.titleSlug || "");

  // Clean platformId (::suffix stripped) — what path-builder produces now
  const cleanPid = platformId(platform, rawId);

  // Raw platformId as actually stored (may retain ::submissionId suffix)
  const code = CONSTANTS.PLATFORM_CODE[platform] || platform.slice(0, 3).toLowerCase();
  const rawPid = rawId.startsWith(`${code}-`) ? rawId : `${code}-${rawId}`;

  const prefixes = [`${PROBLEMS_ROOT}/${cleanPid}/`];
  if (rawPid !== cleanPid) prefixes.push(`${PROBLEMS_ROOT}/${rawPid}/`);
  if (problem.canonical?.canonicalId) {
    prefixes.push(`${PROBLEMS_ROOT}/${problem.canonical.canonicalId}/${platform}/`);
  }

  return remoteFileTree
    .filter((f) => prefixes.some((pfx) => f.path.startsWith(pfx)))
    .map((f) => f.path);
}

/** True when old and new path sets are identical (order-independent). */
function _pathSetsMatch(oldPaths, newPaths) {
  if (oldPaths.length !== newPaths.length) return false;
  const oldSet = new Set(oldPaths);
  return newPaths.every((p) => oldSet.has(p));
}

async function _handleResyncAllInner(mode = "bulk", commitType = "chore") {
  dbg.log(`handleResyncAll(): starting - mode=${mode}, commitType=${commitType}`);
  const { settings, git, owner, repoName } = await _resolveGitHubContext();

  // Pre-load canonical map so resolve() is available synchronously for path building
  await canonicalMapper
    .loadMap()
    .catch((e) =>
      dbg.warn("handleResyncAll(): canonical map load failed (non-blocking):", e?.message),
    );

  // ── Phase 0: Fetch remote state ───────────────────────────────────────────
  // Fetch existing index.json to find already-committed slugs/langs
  const remoteByCommitKey = new Map();
  let headSha = null;
  let indexRes = null;
  try {
    indexRes = await git.getContents(owner, repoName, "index.json");
  } catch (e) {
    // Only a 404 proves the repo has no index yet. A network drop, 401 or 5xx
    // means the index exists but could not be read — proceeding would classify
    // every local problem as "never committed" and re-push the whole library.
    if (e?.status !== 404) {
      throw new Error(`Resync aborted — could not read remote index.json: ${e?.message || e}`);
    }
    dbg.log("handleResyncAll(): no index.json yet — remote is empty");
  }
  if (indexRes) {
    try {
      const index = JSON.parse(decodeBase64Utf8(indexRes.content));
      (index.problems || []).forEach((p) => {
        const key = getProblemCommitKey(p);
        if (key) remoteByCommitKey.set(key, p);
      });
      dbg.log(`handleResyncAll(): fetched ${remoteByCommitKey.size} existing remote problem(s)`);
    } catch (e) {
      // The file exists but cannot be decoded. Rebuilding it from local data is
      // the only recovery, so continue with an empty remote map.
      dbg.warn(`handleResyncAll(): index.json unreadable — rebuilding it:`, e?.message);
    }
  }

  // Fetch HEAD SHA so we can load the full recursive file tree (for inferring old paths)
  try {
    const branch = CONSTANTS.REPO_BRANCH || "main";
    const ref = await git.apiFetch(`/repos/${owner}/${repoName}/git/ref/heads/${branch}`);
    headSha = ref?.object?.sha || null;
  } catch (_) {
    try {
      const ref = await git.apiFetch(`/repos/${owner}/${repoName}/git/ref/heads/master`);
      headSha = ref?.object?.sha || null;
    } catch (_2) {
      /* new or inaccessible repo */
    }
  }

  // Fetch remote file tree once — used to infer old committed paths for maintenance
  let remoteFileTree = [];
  if (headSha) {
    try {
      const treeRes = await git.apiFetch(
        `/repos/${owner}/${repoName}/git/trees/${headSha}?recursive=1`,
      );
      remoteFileTree = (treeRes?.tree || []).filter(
        (f) => f.type === "blob" && f.path.startsWith(`${PROBLEMS_ROOT}/`),
      );
      dbg.log(`handleResyncAll(): remote tree has ${remoteFileTree.length} problem blob(s)`);
    } catch (e) {
      dbg.warn("handleResyncAll(): remote tree fetch failed (non-blocking):", e?.message);
    }
  }

  // ── Categorize local problems ─────────────────────────────────────────────
  const allProblems = await Storage.getAllProblems();
  const pendingMap = await Storage.getPendingProblemKeys().catch(() => ({}));
  const pendingKeys = new Set(Object.keys(pendingMap || {}));

  const newProblems = []; // never committed — need initial commit
  const maintenanceItems = []; // committed but paths/content drifted — need maintenance
  const localProblemKeys = new Set();

  for (let p of allProblems) {
    // Enrich with canonical data before path computation
    if (!p.canonical) {
      const resolved = canonicalMapper.resolve(p.platform || "", p.titleSlug || p.id || "");
      if (resolved) p = { ...p, canonical: resolved };
    }

    const key = getProblemCommitKey(p);
    if (!key) continue;
    localProblemKeys.add(key);

    const newPaths = getProblemFiles(p, settings).map((f) => f.path);
    const isPending = pendingKeys.has(key);
    const remoteEntry = remoteByCommitKey.get(key);

    // Determine old committed paths: prefer stored _committedPaths, then infer from remote tree
    const storedOldPaths = Array.isArray(p._committedPaths) ? p._committedPaths : null;
    const inferredOldPaths = _inferCommittedPaths(p, remoteFileTree);
    const oldPaths = storedOldPaths || (inferredOldPaths.length > 0 ? inferredOldPaths : null);

    const hasRemote = !!remoteEntry || inferredOldPaths.length > 0;
    const pathsDrifted = oldPaths ? !_pathSetsMatch(oldPaths, newPaths) : false;
    const contentDrifted = _isProblemDrifted(p, remoteEntry);

    if (!hasRemote || isPending) {
      // Never been committed (or explicitly pending) — needs initial commit
      newProblems.push(p);
    } else if (pathsDrifted || contentDrifted) {
      // Already on remote but layout changed or content updated
      maintenanceItems.push({ problem: p, oldPaths: oldPaths || [], newPaths });
    }
    // else: already committed, paths match, content matches — skip
  }

  // Detect remote problems that no longer exist locally (deleted after conflict resolution).
  // Only run when we have a real file tree — avoids false-deleting everything on an empty fetch.
  if (remoteFileTree.length > 0) {
    for (const [key, remoteEntry] of remoteByCommitKey.entries()) {
      if (!localProblemKeys.has(key)) {
        const oldPaths = _inferCommittedPaths(remoteEntry, remoteFileTree);
        if (oldPaths.length > 0) {
          maintenanceItems.push({ problem: remoteEntry, oldPaths, newPaths: [] });
        }
      }
    }
  }

  // Garbage-collect orphaned pending keys. The commit key embeds the language
  // (`id::lang`), so a record whose language gets filled in later — self-heal,
  // code recovery, a metadata refresh — generates a new key, and the one marked
  // at import time matches no problem ever again. Deleted problems orphan their
  // keys the same way. Nothing can ever commit-and-clear such a key, so it sits
  // in the map inflating the "solves haven't reached GitHub" banner and the
  // toolbar `!` count forever. Only keys past the stale window are collected,
  // so a solve that marked its key moments before saving its record is safe.
  const _gcBefore = Date.now() - CONSTANTS.PENDING_COMMIT_STALE_MS;
  const orphanedPending = Object.entries(pendingMap || {})
    .filter(([k, t]) => !localProblemKeys.has(k) && Number(t) < _gcBefore)
    .map(([k]) => k);
  if (orphanedPending.length > 0) {
    dbg.log(`handleResyncAll(): clearing ${orphanedPending.length} orphaned pending key(s)`);
    await Storage.clearPendingProblemKeys(orphanedPending).catch(() => {});
  }

  dbg.log(
    `handleResyncAll(): newProblems=${newProblems.length}, maintenanceItems=${maintenanceItems.length}`,
  );

  // ── Build infra bundle once ───────────────────────────────────────────────
  // index.json + .codeledger/* are explicit files; README.md + index.html are
  // added by the GitHub handler when skipInfra:false triggers buildInfraFiles().
  // We build this once and staple it to the LAST commit that's already
  // happening — no separate trailing infra commit needed.
  const freshIndexContent = await buildIndexJson();
  let infraMetaOverride = null;
  try {
    const parsed = JSON.parse(freshIndexContent);
    infraMetaOverride = {
      stats: parsed.stats || null,
      updatedAt: parsed.updatedAt || null,
      problems: (parsed.problems || [])
        .filter((p) => p.timestamp)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 10),
    };
  } catch (_) {}

  const infraBundle = [{ path: "index.json", content: freshIndexContent }];
  try {
    infraBundle.push({
      path: ".codeledger/sync.json",
      content: await buildSyncPayload(),
    });
  } catch (e) {
    dbg.warn("handleResyncAll(): sync.json build failed (non-fatal):", e?.message);
  }
  try {
    const bank = await Storage.getBehaviorBank();
    infraBundle.push({
      path: ".codeledger/behaviour-bank.json",
      content: JSON.stringify(bank || {}, null, 2),
    });
  } catch (e) {
    dbg.warn("handleResyncAll(): behaviour-bank.json build failed (non-fatal):", e?.message);
  }
  try {
    const roadmaps = await Storage.getRoadmaps();
    infraBundle.push({
      path: ".codeledger/roadmaps.json",
      content: JSON.stringify(roadmaps || [], null, 2),
    });
  } catch (e) {
    dbg.warn("handleResyncAll(): roadmaps.json build failed (non-fatal):", e?.message);
  }

  // infra opts that trigger README + index.html generation via buildInfraFiles()
  const withInfra = { skipInfra: false, indexMetaOverride: infraMetaOverride };

  if (newProblems.length === 0 && maintenanceItems.length === 0) {
    dbg.log(
      `handleResyncAll(): everything up-to-date — pushing infra-only update ` +
        `(remote: ${remoteByCommitKey.size}, local: ${allProblems.length})`,
    );
    await _commitWithFailover(
      infraBundle,
      "chore: update repository stats [CodeLedger]",
      repoName,
      { date: new Date(), ...withInfra },
      settings,
    );
    dbg.log(
      `handleResyncAll(): ✓ infra-only commit done (${infraMetaOverride?.stats?.total ?? "?"} problems)`,
    );
    return { committed: 0, repaired: false };
  }

  // Phase B runs after Phase A (if any) — it is always the LAST commit when present.
  // Phase A is the last commit only when there is no Phase B.
  const phaseAIsLast = maintenanceItems.length === 0;

  // ── Phase A: Initial commits for new problems ─────────────────────────────
  let lastCommitSha = null;
  let phaseACount = 0;

  if (newProblems.length > 0) {
    if (mode === "individual") {
      dbg.log(`handleResyncAll(): Phase A — ${newProblems.length} individual backdated commit(s)`);
      const alreadyRemote = Array.from(remoteByCommitKey.values());
      const sessionCommitted = [];

      // A record with no timestamp is a solve whose date the platform never
      // published — GeeksForGeeks lists what you solved but not when. Giving
      // each of those its own commit dated today is how a 200-problem back
      // catalogue turns into 200 solves on one square of the contribution
      // graph. They go into a single commit instead, whose message says what
      // it is, so the history stays readable and stays true.
      const dated = [];
      const undated = [];
      for (const p of newProblems) (p.timestamp ? dated : undated).push(p);

      const sorted = dated
        .map((p) => ({
          problems: [p],
          files: getProblemFiles(p, settings),
          message: "[" + (p.topic || "Untagged") + "] " + (p.title || p.titleSlug) + " solved",
          date: new Date(p.timestamp > 1e10 ? p.timestamp : p.timestamp * 1000),
        }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      if (undated.length) {
        dbg.log(`handleResyncAll(): ${undated.length} problem(s) have no published solve date`);
        sorted.push({
          problems: undated,
          files: undated.flatMap((p) => getProblemFiles(p, settings)),
          message:
            `chore: import ${undated.length} solved problem(s) [CodeLedger]\n\n` +
            `The platform does not publish a solve date for these, so this commit ` +
            `is dated when they were imported, not when they were solved.`,
          date: new Date(),
        });
      }

      for (let i = 0; i < sorted.length; i++) {
        const entry = sorted[i];
        const isLast = i === sorted.length - 1;
        const isCheckpoint = isLast || (i > 0 && i % 25 === 0);

        // Intermediate checkpoints write a partial index.json so a resume
        // after a crash can find the correct committed set.  The last commit
        // in Phase A gets the full infra bundle (if Phase B won't run).
        if (isLast && phaseAIsLast) {
          entry.files.push(...infraBundle);
        } else if (isCheckpoint) {
          const committedSoFar = [...alreadyRemote, ...sessionCommitted, ...entry.problems];
          entry.files.push({
            path: "index.json",
            content: _buildIndexJsonFromList(committedSoFar, settings),
          });
        }

        try {
          _activeSyncPort?.postMessage({
            type: "sync-progress",
            current: i + 1,
            total: sorted.length,
          });
        } catch (_) {}
        dbg.log(
          `handleResyncAll(): Phase A ${i + 1}/${sorted.length} (${entry.date.toISOString()})`,
        );
        const commitOpts =
          isLast && phaseAIsLast
            ? {
                date: entry.date,
                ...withInfra,
                knownParentSha: lastCommitSha || undefined,
              }
            : {
                date: entry.date,
                skipInfra: true,
                knownParentSha: lastCommitSha || undefined,
              };
        const result = await _commitWithFailover(
          entry.files,
          entry.message,
          repoName,
          commitOpts,
          settings,
        );
        lastCommitSha = result?.newSha || null;
        sessionCommitted.push(...entry.problems);
        // Record committed paths — exclude infra bundle paths. Derived per
        // problem rather than from entry.files, which for the undated group
        // holds every problem's files at once.
        const infraPaths = new Set(infraBundle.map((f) => f.path));
        for (const problem of entry.problems) {
          const committedPaths = getProblemFiles(problem, settings)
            .map((f) => f.path)
            .filter((p) => !infraPaths.has(p));
          await Storage.saveProblem({ ...problem, _committedPaths: committedPaths }).catch(
            () => {},
          );
        }
      }
    } else {
      dbg.log(`handleResyncAll(): Phase A — bulk commit with ${newProblems.length} problem(s)`);
      const filesToCommit = [];
      for (const problem of newProblems) {
        for (const f of getProblemFiles(problem, settings)) filesToCommit.push(f);
        try {
          if (problem.notes?.trim()) {
            const base = problemBase(
              problem.id || problem.titleSlug,
              problem.canonical,
              settings,
              problem.platform,
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
              problem.platform,
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
      // Bundle infra into the bulk commit if Phase B won't run (bulk commit is last)
      if (phaseAIsLast) filesToCommit.push(...infraBundle);
      dbg.log(`handleResyncAll(): Phase A prepared ${filesToCommit.length} file(s)`);
      const bulkResult = await _commitWithFailover(
        filesToCommit,
        buildCommitMessage(resolveCommitType(commitType), {
          count: newProblems.length,
          platform: "LeetCode",
        }),
        repoName,
        phaseAIsLast ? { date: new Date(), ...withInfra } : { date: new Date(), skipInfra: true },
        settings,
      );
      lastCommitSha = bulkResult?.newSha || null;
      dbg.log(`handleResyncAll(): ✓ Phase A bulk commit done`);
      // Save _committedPaths for all newly committed problems
      const infraPaths = new Set(infraBundle.map((f) => f.path));
      for (const problem of newProblems) {
        const committedPaths = getProblemFiles(problem, settings)
          .map((f) => f.path)
          .filter((p) => !infraPaths.has(p));
        await Storage.saveProblem({
          ...problem,
          _committedPaths: committedPaths,
        }).catch(() => {});
      }
    }
    phaseACount = newProblems.length;
  }

  // ── Phase B: Single maintenance commit for drifted problems ──────────────
  // Always the last commit — infra bundle always included here.
  if (maintenanceItems.length > 0) {
    dbg.log(
      `handleResyncAll(): Phase B — maintenance commit for ${maintenanceItems.length} drifted problem(s)`,
    );
    const maintFiles = [];
    const maintDeletes = [];

    for (const { problem, oldPaths, newPaths } of maintenanceItems) {
      if (newPaths.length > 0) {
        for (const f of getProblemFiles(problem, settings)) maintFiles.push(f);
        try {
          if (problem.notes?.trim()) {
            const base = problemBase(
              problem.id || problem.titleSlug,
              problem.canonical,
              settings,
              problem.platform,
            );
            maintFiles.push({ path: `${base}/notes.md`, content: problem.notes });
          }
        } catch (_) {}
      }
      const newPathSet = new Set(newPaths);
      for (const oldPath of oldPaths) {
        if (!newPathSet.has(oldPath)) maintDeletes.push(oldPath);
      }
    }

    // Infra always bundled into Phase B (it is always the last commit)
    maintFiles.push(...infraBundle);

    dbg.log(
      `handleResyncAll(): Phase B — writing ${maintFiles.length} file(s), ` +
        `deleting ${maintDeletes.length} stale path(s)`,
    );
    const maintResult = await _commitWithFailover(
      maintFiles,
      `chore(maintenance): update ${maintenanceItems.length} problem(s) [CodeLedger]`,
      repoName,
      {
        date: new Date(),
        ...withInfra,
        deletes: maintDeletes,
        knownParentSha: lastCommitSha || undefined,
      },
      settings,
    );
    lastCommitSha = maintResult?.newSha || null;
    dbg.log(`handleResyncAll(): ✓ Phase B maintenance commit done`);

    const infraPaths = new Set(infraBundle.map((f) => f.path));
    for (const { problem, newPaths: updatedPaths } of maintenanceItems) {
      if (updatedPaths.length === 0) continue; // deleted from local DB — nothing to update
      await Storage.saveProblem({
        ...problem,
        _committedPaths: updatedPaths.filter((p) => !infraPaths.has(p)),
      }).catch(() => {});
    }
  }

  if (typeof git.ensureRepoTopics === "function") {
    await git.ensureRepoTopics(repoName).catch(() => {});
  }

  // ── Post-commit bookkeeping ───────────────────────────────────────────────
  const allChanged = [...newProblems, ...maintenanceItems.map((m) => m.problem)];
  for (const p of allChanged) {
    // id-first, matching the handleSolved mark and the migrated key format.
    await Storage.markSlugLangCommitted(
      p.id || p.titleSlug,
      p.lang?.name || p.lang?.slug || p.lang?.ext || "",
    ).catch(() => {});
  }
  await Storage.clearPendingProblemKeys(
    allChanged.map((p) => getProblemCommitKey(p)).filter(Boolean),
  ).catch(() => {});

  // Mirror
  const mirrorFiles = [];
  for (const p of allChanged) for (const f of getProblemFiles(p, settings)) mirrorFiles.push(f);
  mirrorFiles.push({ path: "index.json", content: await buildIndexJson() });
  const activeTarget = _normalizeGitTarget(
    (await Storage.getSettings().catch(() => settings)).git_active_primary ||
      _getDefaultPrimaryTarget(settings),
  );
  await pushToMirrors(
    mirrorFiles,
    `chore: sync ${allChanged.length} problem(s) [CodeLedger]`,
    {},
    settings,
    activeTarget ? _targetKey(activeTarget) : "",
  );

  dbg.log(
    `handleResyncAll(): complete — new=${phaseACount}, maintenance=${maintenanceItems.length}`,
  );
  return { committed: phaseACount, maintained: maintenanceItems.length };
}

async function handleBulkImport(problems = []) {
  if (!problems.length)
    return {
      saved: 0,
      autoMerged: 0,
      conflicts: 0,
      missingCode: 0,
      missingTags: 0,
      missingDifficulty: 0,
    };

  // Every batch re-stamps the suppression window, so however long the import
  // runs, the maintenance alarm's date-flattening bulk commit stays deferred
  // until 15 minutes after the LAST batch — by which time the importer's own
  // backdated individual sync has run (or the window lapses harmlessly).
  await browserStorage.local
    .set({ [_IMPORT_ACTIVE_KEY]: Date.now() + 15 * 60_000 })
    .catch(() => {});

  const pendingKeys = [];
  let autoMerged = 0;
  let conflicts = 0;
  let actualSaved = 0;

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
        await Storage.saveProblem(langGroup[0])
          .then(() => {
            actualSaved++;
          })
          .catch(() => {});
        // Only commit if code actually changed — avoid re-committing unchanged data on repeated imports
        const isNew =
          !existing || normalizeCode(existing.code) !== normalizeCode(langGroup[0].code);
        if (isNew) {
          const key = getProblemCommitKey(langGroup[0]);
          if (key) pendingKeys.push(key);
        }
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
        await Storage.saveProblem(primary)
          .then(() => {
            actualSaved++;
          })
          .catch(() => {});
        autoMerged += rest.length;
        dbg.log(
          `handleBulkImport(): auto-merged ${rest.length} duplicate(s) for ${primary.titleSlug} (no commit — same code)`,
        );
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
        })
          .then(() => {
            actualSaved++;
          })
          .catch(() => {});
        const key = getProblemCommitKey(primary);
        if (key) pendingKeys.push(key);
        // Mark duplicates so library filters them out
        for (const r of rest) {
          await Storage.saveProblem({
            ...r,
            isDuplicate: true,
            duplicateOf: primary.id,
          }).catch(() => {});
        }
        conflicts++;
        dbg.log(
          `handleBulkImport(): conflict queued for ${primary.titleSlug} (${rest.length} candidate(s))`,
        );
      }
    }
  }

  if (pendingKeys.length) {
    await Storage.markPendingProblemKeys(pendingKeys).catch(() => {});
  }

  // Post-import validation
  let missingCode = 0,
    missingTags = 0,
    missingDifficulty = 0;
  const allSaved = await Storage.getAllProblems().catch(() => []);
  const importedIds = new Set(problems.map((p) => p.id));
  const imported = allSaved.filter((p) => importedIds.has(p.id));

  const toRefresh = [];

  for (const p of imported) {
    if (!p.code && p.platform === "leetcode" && p.titleSlug) {
      await enqueueReview(p.id, 999).catch(() => {});
      missingCode++;
    }
    if (
      !p.tags?.length ||
      !["Easy", "Medium", "Hard"].includes(p.difficulty) ||
      !p.problemStatement
    ) {
      toRefresh.push(p);
      if (!p.tags?.length) missingTags++;
      if (!["Easy", "Medium", "Hard"].includes(p.difficulty)) missingDifficulty++;
    }
  }

  if (toRefresh.length > 0) {
    handleRefreshMetadata(toRefresh).catch(() => {});
  }

  // Kick review queue immediately if there are problems without code needing recovery
  if (missingCode > 0) processAIReviewQueue().catch(() => {});

  // Broadcast import report to any open library tabs.
  // `saved` counts records actually written to storage; the commit queue
  // (pendingKeys) is smaller whenever a re-import found unchanged code.
  const report = {
    saved: actualSaved,
    autoMerged,
    conflicts,
    missingCode,
    missingTags,
    missingDifficulty,
  };
  dbg.log(`handleBulkImport(): complete — ${JSON.stringify(report)}`);
  _broadcastToContentScripts({ type: "CODELEDGER_IMPORT_COMPLETE", ...report });

  return report;
}

/**
 * The chat store, on behalf of a content script.
 *
 * A content script's `indexedDB` is the page's, not the extension's, so the
 * floating AI panel cannot write its own history — it would land in
 * leetcode.com's database and never be read again. It hands the operation here
 * instead. Only these four are reachable that way; anything else is refused by
 * name rather than dispatched, so this stays a fixed door and not a way to call
 * arbitrary module functions from a page.
 */
const AI_CHAT_STORE_OPS = {
  saveAIChat,
  updateAIChat,
  getChatsByProblem,
  deleteChat,
};

async function handleAIChatStore(op, args) {
  const fn = Object.prototype.hasOwnProperty.call(AI_CHAT_STORE_OPS, op)
    ? AI_CHAT_STORE_OPS[op]
    : null;
  if (!fn) throw new Error(`Unknown AI chat store operation: ${op}`);
  dbg.log(`handleAIChatStore(): ${op}`);
  return fn(...(Array.isArray(args) ? args : []));
}

async function handleAIChat(messages, context = {}) {
  dbg.log(`handleAIChat(): starting - messages=${(messages || []).length}`);
  const settings = await Storage.getSettings();
  const contextParts = [];
  if (context.title)
    contextParts.push(
      `Problem: ${context.title}${context.difficulty ? ` (${context.difficulty})` : ""}`,
    );
  if (context.methodTitle) contextParts.push(`Method: ${context.methodTitle}`);
  if (context.problemStatement) {
    const plain = context.problemStatement
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (plain) contextParts.push(`Description:\n${plain.slice(0, 2000)}`);
  }
  if (context.code && context.lang?.name)
    contextParts.push(
      `My ${context.lang.name} solution:\n\`\`\`${context.lang.name}\n${context.code.slice(0, 3000)}\n\`\`\``,
    );
  else if (context.code)
    contextParts.push(`My solution:\n\`\`\`\n${context.code.slice(0, 3000)}\n\`\`\``);
  if (context.aiReview) contextParts.push(`Prior AI review:\n${context.aiReview.slice(0, 1000)}`);

  // The review prompt already gets the behaviour bank; the chat is the other half
  // of the same conversation, so it reads back the same record. Key derivation
  // matches the one the AI_CHAT handler writes with, or the lookup would miss.
  const chatProblem = context.problem || {};
  const chatSlug = chatProblem.titleSlug || chatProblem.slug || context.title || "";
  const chatPlatform = context.platform || chatProblem.platform || "";
  if (chatSlug && chatPlatform) {
    const chatBehavior = _buildBehaviorContext(
      await getProblemStats(chatSlug, chatPlatform).catch(() => null),
    );
    if (chatBehavior) contextParts.push(`Learner history:\n${chatBehavior}`);
  }

  // The aggregate profile is not tied to a problem, so unlike the block above it
  // applies to every chat — including the library chat, which has no problem at
  // all and until now started from nothing each time.
  const chatProfile = await getProfileContext().catch(() => "");
  if (chatProfile) contextParts.push(chatProfile);

  // Where they are heading, not just where they have been. Without this the
  // assistant cannot see a roadmap the learner is staring at in the next tab,
  // and every "what should I do next" gets answered from tag counts alone.
  const chatRoadmap = await getRoadmapContext().catch(() => "");
  if (chatRoadmap) contextParts.push(chatRoadmap);

  const lastUserMsg =
    (messages || []).filter((m) => m?.role === "user").slice(-1)[0]?.content || "";

  // The knowledge-graph digest rides in two ways. An explicit /graph anywhere
  // in the conversation: the expansion loop below consumes context.graphDigest,
  // and without one here the surfaces that don't pre-expand (floating chat,
  // problem modal) expand /graph to "not available here". And automatically,
  // when the question is the kind the graph answers — progress, weak spots,
  // what to practice next — where it lands as context instead of rewriting the
  // user's own message. A message that already carries an expanded digest
  // (the library chat expands /graph before sending) attaches nothing twice.
  const wantsGraphCommand = (messages || []).some(
    (m) => m?.role === "user" && String(m.content || "").includes("/graph"),
  );
  const asksGraphQuestion =
    isGraphQuestion(lastUserMsg) && !lastUserMsg.includes("**Knowledge graph:**");
  if (wantsGraphCommand || asksGraphQuestion) {
    const digest = buildGraphDigest(await Storage.getAllProblems().catch(() => []), settings);
    if (wantsGraphCommand) context.graphDigest = digest;
    if (asksGraphQuestion && !wantsGraphCommand) {
      contextParts.push(
        `Knowledge-graph digest (attached automatically — the question is about topics, progress or what to practice next):\n${digest}`,
      );
    }
  }

  dbg.log(`handleAIChat(): prepared ${contextParts.length} context part(s)`);
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
    (skillsPrefix || "") + (knowledgeCtx ? knowledgeCtx + "\n\n" : "") + baseSystemPrompt;
  dbg.log(
    `handleAIChat(): systemPrompt built (${systemPrompt.length} chars, skills=${!!skillsPrefix}, kb=${!!knowledgeCtx})`,
  );

  const expandedMessages = [];
  for (const message of messages || []) {
    if (message?.role === "user") {
      // eslint-disable-next-line no-await-in-loop
      const expanded = await expandChatVariables(message.content || "", context);
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
    // See _requiresHuman: a chat routed through here has no UI attached, so a
    // provider that answers by asking somebody cannot be one of the attempts.
    // The page handles those itself before it ever sends AI_CHAT.
    if (_requiresHuman(p.id)) return false;
    const key = _providerModelKey(p);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  dbg.log(`handleAIChat(): ${providers.length} provider(s) in fallback chain`);
  let triedCount = 0;
  for (let idx = 0; idx < providers.length; idx++) {
    const provider = providers[idx];
    if (settings[`${provider.id}_enabled`] === false) {
      dbg.log(
        `handleAIChat(): attempt ${idx + 1}/${providers.length} - ${provider.id} disabled, skipping`,
      );
      continue;
    }
    const ai = registry.getAIProvider(provider.id);
    if (!ai) {
      dbg.warn(
        `handleAIChat(): attempt ${idx + 1}/${providers.length} - ${provider.id} handler not found`,
      );
      continue;
    }
    triedCount++;
    try {
      dbg.log(`handleAIChat(): attempt ${idx + 1}/${providers.length} - calling ${provider.id}...`);
      const response = await ai.chat(messagesWithContext, {
        ...context,
        aiModelOverride: provider.model,
      });
      dbg.log(
        `handleAIChat(): received response from ${provider.id} (${String(response || "").length} chars)`,
      );
      const modelId = provider.model || CONSTANTS.AI_PROVIDERS[provider.id]?.defaultModel || "";
      return {
        response,
        providerId: provider.id,
        modelId,
        isFallback: idx > 0,
      };
    } catch (e) {
      dbg.warn(
        `handleAIChat(): attempt ${idx + 1}/${providers.length} - ${provider.id} failed:`,
        e?.message,
      );
    }
  }

  dbg.error(`handleAIChat(): all providers exhausted`);

  if (triedCount === 0) {
    dbg.log("handleAIChat(): no providers enabled, returning Demo response");
    return {
      response: _generateDemoResponse(messages, context),
      providerId: "demo",
      modelId: "demo-model",
      isFallback: true,
    };
  }

  // Check if the issue is rate limiting or missing config
  const rateKeyword = /rate.?limit|quota|429|too.many|throttle/i;
  let lastErrorMsg = "";
  for (const provider of providers) {
    if (provider.lastError) {
      lastErrorMsg = String(provider.lastError).toLowerCase();
      if (rateKeyword.test(lastErrorMsg)) {
        throw new Error(
          "All AI providers are currently rate-limited. Your API quotas have been exhausted. Please upgrade your API plan or try again in a few hours.",
        );
      }
    }
  }

  throw new Error("No AI providers available or configured. Add an API key in Settings → AI.");
}

function _generateDemoResponse(messages, context) {
  const lastUserMessage = messages[messages.length - 1]?.content || "";
  const problemTitle = context.title || "this problem";

  if (/hello|hi|hey/i.test(lastUserMessage)) {
    return `Hello! I am the built-in CodeLedger Demo Assistant. 

I am running in **Demo Mode** because no external AI provider (like Google Gemini, OpenAI, or Claude) has been configured with an API key yet.

To connect me to a live LLM, you can add an API key at any time in **Settings → AI**.

In the meantime, I can simulate Socratic tutoring or direct explanations for **${problemTitle}**! Feel free to ask me questions about your code, time complexity, or potential edge cases.`;
  }

  if (/complexity|time|space|fast|slow/i.test(lastUserMessage)) {
    return `Let's analyze the complexity of your solution for **${problemTitle}**.

Based on a typical approach:
1. **Time Complexity:** Usually \\(O(N)\\) or \\(O(N \\log N)\\) depending on the algorithm. For array sorting or tree traversals, we aim for linear or linearithmic time.
2. **Space Complexity:** \\(O(1)\\) if we modify in-place, or \\(O(N)\\) if we use auxiliary arrays, recursion stacks, or hash maps.

*Note: This is a simulated response in Demo Mode. Connect an API key in Settings to receive live, real-time code complexity analysis.*`;
  }

  return `I received your message: "${lastUserMessage}".

I am currently running in **Demo Mode** because no external AI provider has been configured. 

### How to enable real AI Reviews & Chats:
1. Open the CodeLedger **Settings** panel (gear icon).
2. Go to the **AI** tab.
3. Select your preferred provider (e.g., Google Gemini, OpenAI, Claude, or local Ollama).
4. Enter your personal API key and click **Save**.

Once configured, I will automatically analyze your DSA solutions and answer any follow-up questions in real-time!`;
}

async function handleRegenerateAIReview(problem = {}) {
  dbg.log(
    `handleRegenerateAIReview(): starting for ${problem.titleSlug || problem.id || "unknown"}`,
  );
  if (!problem) throw new Error("Missing problem data");
  const slug = String(problem.titleSlug || problem.slug || problem.id || "").trim();
  if (!slug) throw new Error("Missing problem identifier");
  if (!problem.code) throw new Error("Problem code is required for AI review");

  const methodIndex =
    problem._methodIndex != null && Number(problem._methodIndex) >= 0
      ? Number(problem._methodIndex)
      : -1;

  const settings = await Storage.getSettings();
  dbg.log(
    `handleRegenerateAIReview(): requesting new AI review${methodIndex >= 0 ? ` (method ${methodIndex})` : ""}...`,
  );
  const { review, providerId, modelId, inferredMetadata } = await generateAIReview(
    problem,
    settings,
  );

  let updated;
  if (methodIndex >= 0) {
    // Per-method review: fetch the stored problem to avoid overwriting other fields,
    // then update only that method's aiReview.
    const stored = (await Storage.getProblem(slug)) || problem;
    const methods = [...(stored.methods || [])];
    if (methods[methodIndex]) {
      methods[methodIndex] = {
        ...methods[methodIndex],
        aiReview: review,
        _aiProvider: providerId,
        _aiModel: modelId,
      };
    }
    updated = { ...stored, methods };
  } else {
    updated = {
      ...problem,
      aiReview: review,
      _aiProvider: providerId,
      _aiModel: modelId,
    };
  }

  if (inferredMetadata) {
    updated = applyInferredMetadata(updated, inferredMetadata);
  }

  await Storage.saveProblem(updated);
  dbg.log(`handleRegenerateAIReview(): saved review via ${providerId}`);
  // Mark as pending for maintenance batch commit instead of committing immediately.
  // The MAINTENANCE_COMMIT alarm batches all AI reviews + metadata into one atomic commit.
  const pendingKey = getProblemCommitKey(updated);
  if (pendingKey) await Storage.markPendingProblemKeys([pendingKey]).catch(() => {});
  dbg.log(`handleRegenerateAIReview(): marked pending (${pendingKey}) for maintenance batch`);
  return {
    problem: updated,
    review,
    providerId,
    ...(methodIndex >= 0 ? { methodIndex } : {}),
  };
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
  dbg.log(
    `handleQueueAllAIReviews(): ${candidates.length} candidate(s) from ${allProblems.length} total`,
  );

  let queued = 0;
  let skipped = 0;
  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i];
    const problemId = p.id || p.titleSlug;
    if (!problemId) continue;
    // Queue main-code review
    const result = await enqueueReview(problemId, i);
    if (result.skipped) skipped++;
    else queued++;
    // Queue per-method reviews for methods that don't yet have one
    if (Array.isArray(p.methods)) {
      for (let j = 0; j < p.methods.length; j++) {
        const method = p.methods[j];
        if (method?.code && (!method.aiReview || !method.aiReview.trim())) {
          const methodId = `${problemId}::method::${j}`;
          const mr = await enqueueReview(methodId, i + 0.5);
          if (mr.skipped) skipped++;
          else queued++;
        }
      }
    }
  }

  dbg.log(`handleQueueAllAIReviews(): queued=${queued} skipped(dedup)=${skipped}`);
  // Kick the processor immediately rather than waiting for the next alarm tick
  if (queued > 0) processAIReviewQueue().catch(() => {});
  return { queued, skipped };
}

// ============================================================================
// Self-Heal — repair incomplete problems in the background
// ============================================================================

/** The per-problem attempt bookkeeping, kept out of the problem records. */
async function _loadHealState() {
  const res = await browserStorage.local.get(HEAL_STATE_KEY).catch(() => ({}));
  const state = res?.[HEAL_STATE_KEY];
  return state && typeof state === "object" ? state : {};
}

async function _saveHealState(state) {
  await browserStorage.local.set({ [HEAL_STATE_KEY]: state || {} }).catch(() => {});
}

/**
 * Mark a repaired problem for the next batched commit, and tell any open page.
 *
 * The commit is deliberately not immediate: healing a stalled import can touch
 * dozens of problems in an hour, and one commit each would bury the user's real
 * solve history under maintenance noise. MAINTENANCE_COMMIT sweeps them up
 * every ten minutes as a single commit.
 */
function _afterHeal(problem, fields) {
  const key = getProblemCommitKey(problem);
  if (key) Storage.markPendingProblemKey(key).catch(() => {});
  try {
    chrome.runtime.sendMessage({
      type: "REFRESH_METADATA_DONE",
      platform: problem.platform,
      slug: problem.titleSlug,
      problemId: problem.id,
      fields,
    });
  } catch (_) {
    // Nothing is listening — the data is in storage either way, which is the
    // whole point of doing this out here instead of inside the modal.
  }
}

const _healDeps = {
  getAllProblems: () => Storage.getAllProblems(),
  saveProblem: (p) => Storage.saveProblem(p),
  loadState: _loadHealState,
  saveState: _saveHealState,
  notify: _afterHeal,
  fetchers: {
    leetcode: fetchLeetCodeProblemData,
    geeksforgeeks: fetchGFGProblemData,
    codeforces: fetchCFProblemData,
  },
};

// ============================================================================
// GFG URL Verification — repair wrong import slugs, mark dead ones
// ============================================================================

const _gfgVerifyDeps = {
  fetchOutcome: fetchGFGProblemOutcome,
  saveProblem: (p) => Storage.saveProblem(p),
  markPending: (p) => {
    const key = getProblemCommitKey(p);
    return key ? Storage.markPendingProblemKey(key) : Promise.resolve();
  },
  getAllProblems: () => Storage.getAllProblems(),
};

// Platform-generic link verification (LINK_CHECK / LINK_APPLY /
// LINK_VERIFY_ONE). takeuforward has no probe on purpose: its backend rejects
// requests whose Origin is not on its allowlist, and a chrome-extension://
// origin is not — link-verify saves TUF fixes clearly unverified instead.
const _linkVerifyDeps = {
  probes: {
    leetcode: fetchLeetCodeProblemOutcome,
    geeksforgeeks: fetchGFGProblemOutcome,
    codeforces: fetchCFProblemOutcome,
    neetcode: fetchNeetCodeProblemOutcome,
  },
  saveProblem: (p) => Storage.saveProblem(p),
  markPending: (p) => {
    const key = getProblemCommitKey(p);
    return key ? Storage.markPendingProblemKey(key) : Promise.resolve();
  },
};

let _gfgSweepInProgress = false;

/**
 * Run the verification sweep, broadcast the summary to any open library page,
 * and optionally follow with an individual resync so repaired/verified
 * problems reach GitHub with their real solve dates.
 */
async function runGfgSweepAndCommit({ thenResync = false, onlyUnverified = true } = {}) {
  if (_gfgSweepInProgress) return null;
  _gfgSweepInProgress = true;
  let summary = null;
  try {
    summary = await runGfgVerifySweep(_gfgVerifyDeps, { onlyUnverified });
    try {
      chrome.runtime.sendMessage({ type: "GFG_VERIFY_DONE", ...summary });
    } catch (_) {
      // No page listening — counts are derivable from storage anyway.
    }
  } catch (e) {
    dbg.warn(`runGfgSweepAndCommit(): sweep failed: ${e?.message}`);
  } finally {
    _gfgSweepInProgress = false;
  }
  if (thenResync) {
    // Even a failed sweep must not strand the import: the commits still run.
    await handleResyncAll("individual", "feat").catch((e) =>
      dbg.warn(`runGfgSweepAndCommit(): resync failed: ${e?.message}`),
    );
  }
  return summary;
}

let _selfHealBusy = false;

async function runSelfHealTick() {
  if (_selfHealBusy) return;
  const settings = await Storage.getSettings().catch(() => ({}));
  if (settings.selfHealEnabled === false) return;
  try {
    _selfHealBusy = true;
    const summary = await runSelfHeal(_healDeps, { limit: 2 });
    if (summary.attempted) {
      dbg.log(
        `runSelfHealTick(): attempted ${summary.attempted}, repaired ${summary.healed}` +
          (summary.changed.length
            ? ` — ${summary.changed.map((c) => `${c.id}(${c.fields.join("+")})`).join(", ")}`
            : ""),
      );
    }
  } catch (e) {
    dbg.warn(`runSelfHealTick(): ${e?.message}`);
  } finally {
    _selfHealBusy = false;
    await refreshSelfHealAlarm().catch(() => {});
  }
}

/**
 * Repair one problem now, on request, ignoring its backoff.
 *
 * This is what the modal's single "Refresh all data" button calls. It returns
 * as soon as the metadata is written; the code recovery it may also start is
 * left running, because that one needs a tab and the user should not be held at
 * a spinner waiting for it.
 *
 * @param {string} problemId
 * @param {{ withCode?: boolean }} [opts]
 */
async function refreshEntireProblem(problemId, { withCode = true } = {}) {
  const problem = await Storage.getProblem(problemId).catch(() => null);
  if (!problem) return { ok: false, error: `Problem not found: ${problemId}` };

  const before = missingParts(problem);
  let result = { ok: true, changed: [], stillMissing: before };
  if (before.length && isHealable(problem)) {
    result = await healProblem(problem, _healDeps);
    // Clear the backoff either way: an attempt the user asked for should not
    // leave the problem parked for a week because a background one failed.
    const state = await _loadHealState();
    if (result.ok && result.stillMissing.length === 0) delete state[problemId];
    else if (state[problemId]) state[problemId] = { ...state[problemId], nextAt: 0 };
    await _saveHealState(state);
  }

  let codeQueued = false;
  if (withCode && !String(problem.code || "").trim()) {
    codeQueued = true;
    // Fire and forget — see above. It saves to storage itself when it lands.
    triggerCodeRecovery(problem)
      .then((r) => dbg.log(`refreshEntireProblem(): code recovery ok=${r?.ok} for ${problemId}`))
      .catch((e) => dbg.warn(`refreshEntireProblem(): code recovery failed: ${e?.message}`));
  }

  return {
    ok: result.ok || result.changed.length > 0,
    changed: result.changed,
    stillMissing: result.stillMissing,
    codeQueued,
    healable: isHealable(problem),
    error: result.error,
  };
}

// ============================================================================
// Code Recovery Background Queue
// ============================================================================

let _codeRecoveryBusy = false;
let _codeRecoverySlowTick = 0;

async function processCodeRecoveryQueue() {
  if (_codeRecoveryBusy) return;

  const settings = await Storage.getSettings();
  const speed = settings.codeRecoveryQueueSpeed || "disabled";

  if (speed === "disabled") return;
  if (speed === "slow") {
    _codeRecoverySlowTick = (_codeRecoverySlowTick + 1) % 5;
    if (_codeRecoverySlowTick !== 0) return;
  }

  // Fast: up to 6 problems per minute (one every 10s). Slow: 1 problem per 5 mins.
  const batchSize = speed === "fast" ? 6 : 1;

  try {
    _codeRecoveryBusy = true;
    const all = await Storage.getAllProblems();

    // Eligible problems: missing code or explicit flag. Records marked
    // urlBroken are skipped — opening a tab on a dead URL burns the full 30s
    // timeout and can never return code.
    const eligible = all.filter(
      (p) =>
        !p.urlBroken &&
        (p._needsCodeFetch ||
          (p.platform === "geeksforgeeks" &&
            p._importedFromProfile &&
            (!p.code || p.code.trim() === ""))),
    );
    if (eligible.length === 0) return;

    // Sort newest first
    eligible.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const batch = eligible.slice(0, batchSize);
    dbg.log(
      `processCodeRecoveryQueue(): found ${eligible.length} eligible, processing ${batch.length} (${speed} mode)`,
    );

    for (let i = 0; i < batch.length; i++) {
      const p = batch[i];
      dbg.log(`processCodeRecoveryQueue(): recovering code for ${p.titleSlug} (id: ${p.id})`);

      const res = await triggerCodeRecovery(p).catch((e) => ({ ok: false, error: e.message }));

      const current = await Storage.getProblem(p.id);
      if (current) {
        if (res.ok) {
          dbg.log(`processCodeRecoveryQueue(): success for ${p.titleSlug}`);
          delete current._needsCodeFetch;
          delete current._failedCodeFetch;
          await Storage.saveProblem(current);
          if (!current.aiReview && settings.aiProvider !== "none") {
            enqueueReview(p.id, 999).catch(() => {});
          }
          if (settings.gitEnabled !== false && settings.gitEnabled !== 0) {
            commitUpdatedProblem(current, settings).catch((err) => {
              dbg.warn(
                `processCodeRecoveryQueue(): failed to commit ${current.titleSlug}:`,
                err.message,
              );
            });
          }
        } else {
          dbg.warn(`processCodeRecoveryQueue(): failed for ${p.titleSlug}: ${res.error}`);
          current._failedCodeFetch = (current._failedCodeFetch || 0) + 1;
          if (current._failedCodeFetch >= 3) {
            delete current._needsCodeFetch; // stop retrying after 3 failures
            dbg.warn(`processCodeRecoveryQueue(): dropping ${p.titleSlug} after 3 failed attempts`);
          }
          await Storage.saveProblem(current);
        }
      }

      if (i < batch.length - 1) {
        // Wait 10 seconds before the next one in the fast batch
        await new Promise((r) => setTimeout(r, 10000));
      }
    }
  } catch (e) {
    dbg.warn(`processCodeRecoveryQueue(): error: ${e.message}`);
  } finally {
    _codeRecoveryBusy = false;
    await refreshCodeRecoveryAlarm(settings).catch(() => {});
    // A successful recovery enqueues a review, so this run may have given the
    // other queue work.
    await refreshAIReviewAlarm().catch(() => {});
  }
}

/**
 * Process one pending AI review from the queue.
 * Called periodically by the alarm handler.
 *
 * Implements "snail mode": passive background processing with:
 * - Batch size: 3 items at a time
 * - Interval: 1-2 hours between batches (respects rate limits)
 * - Error handling: pauses on multiple failures, retries later
 * - Comprehensive logging for dedup tracking
 */
async function processAIReviewQueue(options = {}) {
  const force = options.force === true;
  try {
    const [state, snailSettings] = await Promise.all([
      getSnailModeState(),
      Storage.getSettings().catch(() => ({})),
    ]);
    const now = Date.now();

    // Resolve batch size and interval from user settings (with CONSTANTS fallback)
    const BATCH_SIZE = Math.max(
      1,
      Math.min(20, Number(snailSettings.snailMode_batchSize) || CONSTANTS.SNAIL_MODE.BATCH_SIZE),
    );
    const BATCH_INTERVAL_MS = Math.max(1, Number(snailSettings.snailMode_batchIntervalHours) || 0)
      ? Math.round(Number(snailSettings.snailMode_batchIntervalHours) * 60 * 60 * 1000)
      : CONSTANTS.SNAIL_MODE.BATCH_INTERVAL_MS;

    // Check if snail mode is paused
    if (!force && state.isPaused && state.pausedUntil && now < state.pausedUntil) {
      const remainingMins = Math.round((state.pausedUntil - now) / 60000);
      dbg.log(
        `[CodeLedger:SnailMode] ⏸ Paused for ${remainingMins} more minutes (${state.consecutiveErrors} errors)`,
      );
      return;
    }

    // Check if enough time has passed since last batch
    const timeSinceLastBatch = now - state.lastBatch;
    if (!force && timeSinceLastBatch < BATCH_INTERVAL_MS) {
      const nextBatchInMins = Math.round((BATCH_INTERVAL_MS - timeSinceLastBatch) / 60000);
      dbg.log(
        `[CodeLedger:SnailMode] ⏱ Next batch in ~${nextBatchInMins} min (processed: ${state.totalProcessed}, errors: ${state.totalErrors})`,
      );
      return;
    }

    dbg.log(
      `[CodeLedger:SnailMode] 🐢 Starting batch${force ? " (forced)" : ""} (size: ${BATCH_SIZE}, interval: ${Math.round(BATCH_INTERVAL_MS / 60000)}min, total processed: ${state.totalProcessed}, errors: ${state.totalErrors})`,
    );

    // An evicted service worker leaves whatever it was reviewing stuck in
    // "processing", where nothing will ever pick it up again. Reclaim those
    // before selecting work, so a lost attempt costs one batch interval rather
    // than the review entirely.
    await reclaimStaleProcessing().catch(() => 0);

    // Reset consecutive error counter at start of new batch
    let batchErrors = 0;
    let batchProcessed = 0;
    let item = await getNextPendingReview();
    const METHOD_ID_PATTERN = /^(.+)::method::(\d+)$/;

    while (item && batchProcessed < BATCH_SIZE) {
      const problemId = item.problemId;

      await markProcessing(item.id);
      try {
        const methodMatch = problemId.match(METHOD_ID_PATTERN);

        if (methodMatch) {
          // Per-method review: ID format is `${parentId}::method::${index}`
          const parentId = methodMatch[1];
          const methodIdx = parseInt(methodMatch[2], 10);
          const problem = await Storage.getProblem(parentId);
          if (!problem || !problem.methods?.[methodIdx]?.code) {
            await markDone(item.id);
            dbg.warn(
              `[CodeLedger:SnailMode] ✗ Method review for ${problemId} — parent or method not found`,
            );
            batchProcessed++;
            item = await getNextPendingReview();
            continue;
          }

          const method = problem.methods[methodIdx];
          const settings = await Storage.getSettings();
          dbg.log(
            `[CodeLedger:SnailMode] 📝 Processing method ${batchProcessed + 1}/${BATCH_SIZE}: ${problemId}`,
          );

          const reviewProblem = {
            ...problem,
            code: method.code,
            lang: {
              name: method.language || problem.lang?.name,
              ext: problem.lang?.ext,
            },
          };
          const { review, providerId, modelId, inferredMetadata } = await generateAIReview(
            reviewProblem,
            settings,
          );
          const updatedMethods = [...problem.methods];
          updatedMethods[methodIdx] = {
            ...updatedMethods[methodIdx],
            aiReview: review,
            _aiProvider: providerId,
            _aiModel: modelId,
          };
          let updatedProblem = { ...problem, methods: updatedMethods };
          if (inferredMetadata) {
            updatedProblem = applyInferredMetadata(updatedProblem, inferredMetadata);
          }
          await Storage.saveProblem(updatedProblem);

          const pKey = getProblemCommitKey(problem);
          if (pKey) await Storage.markPendingProblemKeys([pKey]).catch(() => {});
          await markDone(item.id);

          recordAIReview({
            slug: (problem.titleSlug || problem.id) + `::method::${methodIdx}`,
            platform: problem.platform || "unknown",
            providerId,
            reviewLength: review?.length || 0,
          }).catch(() => {});

          dbg.log(`[CodeLedger:SnailMode] ✓ Method review done: ${problemId} via ${providerId}`);
          await new Promise((resolve) => setTimeout(resolve, REVIEW_RATE_LIMIT_MS));
        } else {
          // Standard problem-level review
          let problem = await Storage.getProblem(problemId);
          if (!problem) {
            await markDone(item.id);
            dbg.warn(`[CodeLedger:SnailMode] ✗ Problem review for ${problemId} — not found`);
            batchProcessed++;
            item = await getNextPendingReview();
            continue;
          }

          if (!problem.code) {
            if (problem.platform === "leetcode" && problem.titleSlug) {
              dbg.log(`[CodeLedger:SnailMode] 🔄 Attempting code recovery for ${problemId}`);
              const recovery = await triggerCodeRecovery(problem);
              if (!recovery.ok) {
                await markFailedWithRetry(item.id, `Code recovery failed: ${recovery.error}`);
                dbg.warn(
                  `[CodeLedger:SnailMode] ✗ Recovery failed for ${problemId}: ${recovery.error}`,
                );
                batchErrors++;
                batchProcessed++;
                item = await getNextPendingReview();
                continue;
              }
              problem = await Storage.getProblem(problemId);
              if (!problem?.code) {
                await markFailedWithRetry(item.id, "Code recovery succeeded but code still empty");
                batchErrors++;
                batchProcessed++;
                item = await getNextPendingReview();
                continue;
              }
              dbg.log(`[CodeLedger:SnailMode] ✓ Code recovery succeeded for ${problemId}`);
            } else {
              await markFailedWithRetry(item.id, "No code and automatic recovery not supported");
              dbg.warn(
                `[CodeLedger:SnailMode] ✗ No code for ${problemId} (platform: ${problem.platform})`,
              );
              batchErrors++;
              batchProcessed++;
              item = await getNextPendingReview();
              continue;
            }
          }

          const settings = await Storage.getSettings();
          dbg.log(
            `[CodeLedger:SnailMode] 📝 Processing problem ${batchProcessed + 1}/${BATCH_SIZE}: ${problem.titleSlug || problemId}`,
          );

          const { review, providerId, modelId, inferredMetadata } = await generateAIReview(
            problem,
            settings,
          );
          let updated = {
            ...problem,
            aiReview: review,
            _aiProvider: providerId,
            _aiModel: modelId,
          };
          if (inferredMetadata) {
            updated = applyInferredMetadata(updated, inferredMetadata);
          }
          await Storage.saveProblem(updated);

          const key = getProblemCommitKey(updated);
          if (key) {
            await Storage.markPendingProblemKeys([key]).catch(() => {});
          }

          await markDone(item.id);
          recordAIReview({
            slug: updated.titleSlug || updated.id,
            platform: updated.platform || "unknown",
            providerId,
            reviewLength: review?.length || 0,
          }).catch(() => {});

          dbg.log(
            `[CodeLedger:SnailMode] ✓ Problem review done: ${updated.titleSlug || problemId} via ${providerId}`,
          );
          await new Promise((resolve) => setTimeout(resolve, REVIEW_RATE_LIMIT_MS));
        }

        batchProcessed++;
      } catch (e) {
        dbg.error(`[CodeLedger:SnailMode] ✗ Error processing ${problemId}: ${e?.message}`);
        batchErrors++;
        const willRetry = await markFailedWithRetry(item.id, e.message);
        if (!willRetry) {
          dbg.error(`[CodeLedger:SnailMode] ✗ Max retries exceeded for ${problemId}`);
        } else {
          dbg.warn(`[CodeLedger:SnailMode] ⚠ Will retry ${problemId}`);
        }
        batchProcessed++;
      }

      item = await getNextPendingReview();
    }

    // Update snail mode state
    const newState = { ...state };
    newState.lastBatch = now;
    newState.totalProcessed += batchProcessed;
    newState.totalErrors += batchErrors;
    newState.consecutiveErrors = batchErrors > 0 ? state.consecutiveErrors + 1 : 0;

    // Pause if too many consecutive errors
    if (
      batchErrors >= CONSTANTS.SNAIL_MODE.ERROR_THRESHOLD &&
      state.consecutiveErrors >= CONSTANTS.SNAIL_MODE.MAX_RETRIES_BEFORE_PAUSE
    ) {
      newState.isPaused = true;
      newState.pausedUntil = now + 2 * 60 * 60 * 1000; // Pause for 2 hours
      dbg.log(
        `[CodeLedger:SnailMode] ⏸ Pausing due to ${batchErrors} errors. Will retry in 2 hours.`,
      );
    } else if (batchErrors === 0) {
      newState.consecutiveErrors = 0;
      newState.isPaused = false;
      newState.pausedUntil = null;
    }

    await setSnailModeState(newState);

    dbg.log(
      `[CodeLedger:SnailMode] 🐢 Batch complete: ${batchProcessed} processed, ${batchErrors} errors (total: ${newState.totalProcessed})`,
    );
  } catch (e) {
    dbg.warn(`[CodeLedger:SnailMode] ✗ Processing error: ${e?.message}`);
  } finally {
    // In `finally` because most of this function's exits are early returns —
    // paused, interval not elapsed, nothing pending. Each of those still has to
    // leave the alarm matching the queue, or a run that bailed on the interval
    // would strand the alarm on for a queue that had already drained.
    await refreshAIReviewAlarm().catch(() => {});
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    // Open the welcome page on first install so the user is guided through setup
    openOrFocusTab(chrome.runtime.getURL("welcome/welcome.html")).catch(() => {});
  }
  init();
});

// OAuth tab relay — background-side pull; works in Chrome MV3 (SW) and Firefox.
//
// WHY A SINGLE-EVENT RETRY LOOP:
//   Chrome's service worker can be terminated between separate `tabs.onUpdated`
//   events (e.g. between changeInfo.url and changeInfo.status==='complete'), which
//   would wipe any in-memory state. By starting a self-contained retry loop WITHIN
//   the URL-change event, the active promise chain keeps the SW alive for the entire
//   ~6-second retry window — no state needs to survive across events.
//
// Requires: "tabs" permission (both manifests).
const _processingAuthTabs = new Set(); // dedup guard (same event, not cross-SW-restarts)

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Only act when the tab URL changes to the OAuth callback path.
  //
  // Parsed, not substring-matched. `includes()` on the raw URL was satisfied by
  // any host that put the strings anywhere — query, fragment, path segment — so
  // https://evil.example/api/auth/x/callback#codeledger.vkrishna04.me aimed a
  // 15-attempt CL_GET_AUTH_DATA probe at an attacker's tab. Nothing answers that
  // message off-origin today, which is the only reason it was not a token leak.
  if (!isAuthCallbackUrl(changeInfo.url)) return;

  // Deduplicate: one relay per tab (handles rapid re-fires on same URL)
  if (_processingAuthTabs.has(tabId)) return;
  _processingAuthTabs.add(tabId);
  dbg.log(`OAuth tab relay: callback URL detected in tab ${tabId} — starting retry loop`);

  // Self-contained retry loop.  The promise chain keeps the SW alive through all retries.
  // First attempt waits 300 ms for the content script to finish document_end work;
  // subsequent retries wait 500 ms.  Total window: ~7.5 s (15 × 500 ms).
  const MAX_ATTEMPTS = 15;
  let attempt = 0;

  function tryFetch() {
    return new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 300 : 500))
      .then(() => {
        attempt++;
        dbg.log(`OAuth tab relay: attempt ${attempt}/${MAX_ATTEMPTS} for tab ${tabId}`);
        return chrome.tabs.sendMessage(tabId, { type: "CL_GET_AUTH_DATA" });
      })
      .then((data) => {
        if (data?.token && data?.provider) {
          dbg.log(`OAuth tab relay: got token for ${data.provider} — saving`);
          return Storage.setAuthToken(data.provider, data.token).then(() => {
            dbg.log(`OAuth tab relay: ✓ token saved for ${data.provider}`);
            _processingAuthTabs.delete(tabId);
            // Close the popup tab now that the token is persisted
            chrome.tabs.remove(tabId).catch(() => {});
          });
        }
        // Content script responded but no token yet — retry
        if (attempt < MAX_ATTEMPTS) return tryFetch();
        dbg.warn(`OAuth tab relay: no token received after ${MAX_ATTEMPTS} attempts`);
        _processingAuthTabs.delete(tabId);
      })
      .catch((e) => {
        // sendMessage failed (content script not injected yet) — retry
        if (attempt < MAX_ATTEMPTS) return tryFetch();
        dbg.warn(`OAuth tab relay: gave up after ${MAX_ATTEMPTS} attempts (last: ${e?.message})`);
        _processingAuthTabs.delete(tabId);
      });
  }

  tryFetch().catch((e) => {
    dbg.error(`OAuth tab relay: unexpected error:`, e?.message);
    _processingAuthTabs.delete(tabId);
  });
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
    port.onDisconnect.addListener(() => {
      _activeSyncPort = null;
    });
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
  // Turning gamification off, changing the daily target, or booking a vacation
  // all change what the toolbar icon should be saying right now.
  if (
    area === "local" &&
    (CONSTANTS.SK.SETTINGS in changes || CONSTANTS.SK.GAMIFICATION in changes)
  ) {
    refreshIconBadge().catch(() => {});
  }
});

// Allow content scripts to ask the background to open the extension popup (best-effort).
// This enables the LeetCode QoL button to open the extension UI without requiring the user
// to click the toolbar action directly.

// Handle one-off messages from extension pages (welcome, library) for maintenance tasks
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  dbg.log(
    `onMessage(): received msg.type=${msg.type} from ${sender?.id || sender?.tab?.id || sender?.url || "unknown"}`,
  );
  if (!isMessageAllowed(msg.type, sender, EXTENSION_ORIGIN)) {
    dbg.warn(`onMessage(): refused ${msg.type} from non-extension sender ${sender?.url}`);
    return;
  }

  // OAuth relay fallback: content script sends here when chrome.storage write fails.
  // Primary path is direct storage write in presence-marker.js; this is belt-and-suspenders.
  if (msg.type === "CODELEDGER_AUTH_RELAY") {
    // Origin, not hostname, and the callback path too. Comparing the hostname
    // alone accepted http://codeledger.vkrishna04.me, which any active network
    // attacker can answer for; comparing no path accepted every page on the
    // origin, so a single reflected-XSS or user-content route anywhere on the
    // site was enough to plant an attacker's token. Both halves matter.
    let senderOrigin = "";
    let senderPath = "";
    try {
      const u = new URL(sender?.url || sender?.tab?.url || "");
      senderOrigin = u.origin;
      senderPath = u.pathname;
    } catch {
      /* unparseable sender URL stays rejected */
    }
    if (senderOrigin !== AUTH_ORIGIN || !senderPath.startsWith("/api/auth/")) {
      dbg.warn(`CODELEDGER_AUTH_RELAY: rejected relay from unexpected sender: ${senderOrigin}`);
      sendResponse({ ok: false });
      return true;
    }
    // Log presence, never content — debug logs end up in bug reports.
    dbg.log(
      `CODELEDGER_AUTH_RELAY: received from ${senderOrigin}, provider=${msg.provider}, token=${msg.token ? "present" : "MISSING"}`,
    );
    if (msg.token && msg.provider) {
      Storage.setAuthToken(msg.provider, msg.token)
        .then(() => dbg.log(`CODELEDGER_AUTH_RELAY: ✓ token saved for ${msg.provider}`))
        .catch((e) => dbg.error(`CODELEDGER_AUTH_RELAY: failed to save token:`, e?.message));
    } else {
      dbg.warn(`CODELEDGER_AUTH_RELAY: missing provider or token — nothing saved`);
    }
    sendResponse({ ok: true });
    return true;
  }

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
  if (msg.type === "PROCESS_REVIEW_QUEUE") {
    (async () => {
      try {
        const force = msg.force === true;
        await processAIReviewQueue({ force });
        sendResponse({ ok: true, force });
      } catch (err) {
        dbg.error(`onMessage(PROCESS_REVIEW_QUEUE): failed:`, err?.message || err);
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }
  if (msg.type === "PROCESS_REVIEW_QUEUE_NOW") {
    (async () => {
      try {
        await processAIReviewQueue({ force: true });
        sendResponse({ ok: true, force: true });
      } catch (err) {
        dbg.error(`onMessage(PROCESS_REVIEW_QUEUE_NOW): failed:`, err?.message || err);
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
        dbg.log(`onMessage(GET_QUEUE_STATS): stats=${JSON.stringify(stats)}`);
        sendResponse({ ok: true, ...stats });
      } catch (err) {
        dbg.error(`onMessage(GET_QUEUE_STATS): failed:`, err?.message || err);
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }
  if (msg.type === "GET_AI_REVIEW_QUEUE_STATUS") {
    (async () => {
      try {
        const status = await getAIReviewQueueStatus();
        dbg.log(`onMessage(GET_AI_REVIEW_QUEUE_STATUS): status=${JSON.stringify(status)}`);
        sendResponse({ ok: true, ...status });
      } catch (err) {
        dbg.error(`onMessage(GET_AI_REVIEW_QUEUE_STATUS): failed:`, err?.message || err);
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
  if (msg.type === "REMOVE_QUEUE_ITEMS_BY_PROBLEM") {
    (async () => {
      try {
        const problemId = msg.problemId;
        if (!problemId) {
          sendResponse({ ok: false, error: "problemId required" });
          return;
        }
        const items = await getAllQueueItems(null);
        const matching = (items || []).filter(
          (it) => it.problemId === problemId || it.problemId?.startsWith(problemId + "::"),
        );
        let removed = 0;
        for (const it of matching) {
          await removeQueueItem(it.id).catch(() => {});
          removed++;
        }
        dbg.log(
          `onMessage(REMOVE_QUEUE_ITEMS_BY_PROBLEM): removed ${removed} item(s) for ${problemId}`,
        );
        sendResponse({ ok: true, removed });
      } catch (err) {
        dbg.error(`onMessage(REMOVE_QUEUE_ITEMS_BY_PROBLEM): failed:`, err?.message || err);
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
        dbg.log(`onMessage(SYNC_SETTINGS_TO_GITHUB): result=${JSON.stringify(result)}`);
        sendResponse({ ok: true, ...result });
      } catch (err) {
        dbg.error(`onMessage(SYNC_SETTINGS_TO_GITHUB): failed:`, err?.message || err);
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
        dbg.log(`onMessage(SYNC_SETTINGS_FROM_GITHUB): result=${JSON.stringify(result)}`);
        sendResponse({ ok: true, ...result });
      } catch (err) {
        dbg.error(`onMessage(SYNC_SETTINGS_FROM_GITHUB): failed:`, err?.message || err);
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
        const git = registry.getGitProvider(settings.gitProvider || "github");
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
          checks.layoutUpToDate = checks.repoLayoutVersion >= LAYOUT_VERSION;
        } catch (e) {
          checks.repoLayoutVersion = null;
          checks.layoutUpToDate = false;
          checks.layoutError = e.message;
        }

        // 2. Check key infra files
        const INFRA_FILES = ["index.json", "README.md", "index.html", ".codeledger/config.json"];
        checks.infraStatus = {};
        await Promise.all(
          INFRA_FILES.map(async (f) => {
            try {
              await git.getContents(owner, repo, f);
              checks.infraStatus[f] = "ok";
            } catch (e) {
              checks.infraStatus[f] = e?.status === 404 ? "missing" : "error";
            }
          }),
        );
        checks.infraOk = Object.values(checks.infraStatus).every((v) => v === "ok");

        // 3. Old-layout path detection — look for topics/* or problems/* top-level dirs
        try {
          const rootListing = await git.getContents(owner, repo, "").catch(() => []);
          const rootNames = Array.isArray(rootListing) ? rootListing.map((f) => f.name) : [];
          checks.hasOldTopicsDir = rootNames.includes("topics");
          checks.hasOldProblemsDir = rootNames.includes("problems");
          checks.hasOldLayout = checks.hasOldTopicsDir || checks.hasOldProblemsDir;
        } catch (e) {
          checks.hasOldLayout = false;
        }

        // 4. Problem count
        const localProblems = await Storage.getAllProblems().catch(() => []);
        checks.localProblemCount = localProblems.length;

        // 5. Committed count (from index.json)
        try {
          const indexFile = await git.getContents(owner, repo, "index.json");
          const indexRaw = decodeBase64Utf8(indexFile?.content) || "{}";
          const index = JSON.parse(indexRaw);
          checks.committedProblemCount = Array.isArray(index.problems) ? index.problems.length : 0;
          checks.indexLayoutVersion = index.layoutVersion || 1;
        } catch (e) {
          checks.committedProblemCount = null;
          checks.indexLayoutVersion = null;
        }

        checks.uncommittedCount = checks.localProblemCount - (checks.committedProblemCount || 0);

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
        dbg.log(`onMessage(CODELEDGER_RUN_MIGRATIONS): mode=${mode}, commitType=${commitType}`);
        const result = await handleResyncAll(mode, commitType);
        dbg.log(`onMessage(CODELEDGER_RUN_MIGRATIONS): result=${JSON.stringify(result)}`);
        sendResponse({ ok: true, result });
      } catch (err) {
        dbg.error(`onMessage(CODELEDGER_RUN_MIGRATIONS): failed:`, err?.message || err);
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true; // indicate async response
  }
});
try {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (!isMessageAllowed(msg.type, sender, EXTENSION_ORIGIN)) {
      dbg.warn(`onMessage(): refused ${msg.type} from non-extension sender ${sender?.url}`);
      return;
    }

    if (msg && msg.type === "RESYNC_COUNT") {
      dbg.log(`onMessage(RESYNC_COUNT): counting missing problems...`);
      handleResyncCount()
        .then((result) => {
          dbg.log(`onMessage(RESYNC_COUNT): result=${JSON.stringify(result)}`);
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
        `onMessage(RESYNC_ALL): mode=${msg.mode || "bulk"} commitType=${msg.commitType || "chore"}`,
      );
      handleResyncAll(msg.mode || "bulk", msg.commitType || "chore")
        .then((result) => {
          dbg.log(`onMessage(RESYNC_ALL): result=${JSON.stringify(result)}`);
          sendResponse({ ok: true, ...result });
        })
        .catch((e) => {
          dbg.error(`onMessage(RESYNC_ALL): failed:`, e?.message);
          sendResponse({ ok: false, error: e.message });
        });
      return true; // async response
    }

    if (msg && msg.type === "REFRESH_INFRA") {
      dbg.log("onMessage(REFRESH_INFRA): refreshing index.json + README + index.html...");
      (async () => {
        try {
          const { settings, repoName } = await _resolveGitHubContext();
          const indexContent = await buildIndexJson();
          // Parse the freshly-built index so the README is generated from NEW stats
          // in the same commit — not from the stale repo copy (one-commit-lag fix).
          let indexMetaOverride = null;
          try {
            const parsed = JSON.parse(indexContent);
            indexMetaOverride = {
              stats: parsed.stats || null,
              updatedAt: parsed.updatedAt || null,
              problems: (parsed.problems || [])
                .filter((p) => p.timestamp)
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                .slice(0, 10),
            };
          } catch (_) {}
          const refreshFiles = [{ path: "index.json", content: indexContent }];
          try {
            refreshFiles.push({
              path: ".codeledger/sync.json",
              content: await buildSyncPayload(),
            });
          } catch (_) {}
          try {
            const bank = await Storage.getBehaviorBank();
            refreshFiles.push({
              path: ".codeledger/behaviour-bank.json",
              content: JSON.stringify(bank || {}, null, 2),
            });
          } catch (_) {}
          try {
            const roadmaps = await Storage.getRoadmaps();
            refreshFiles.push({
              path: ".codeledger/roadmaps.json",
              content: JSON.stringify(roadmaps || [], null, 2),
            });
          } catch (_) {}
          await _commitWithFailover(
            refreshFiles,
            "chore: refresh repository stats [CodeLedger]",
            repoName,
            { date: new Date(), skipInfra: false, indexMetaOverride },
            settings,
          );
          dbg.log("onMessage(REFRESH_INFRA): ✓ done");
          sendResponse({ ok: true });
        } catch (e) {
          dbg.error("onMessage(REFRESH_INFRA): failed:", e?.message);
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true;
    }

    if (msg && msg.type === "BACKUP_TO_REPO") {
      dbg.log("onMessage(BACKUP_TO_REPO): committing settings backup...");
      (async () => {
        try {
          const { settings, repoName } = await _resolveGitHubContext();
          const allProblems = await Storage.getAllProblems();
          const safeSettings = Object.fromEntries(
            Object.entries(settings).filter(
              ([k]) =>
                !k.includes("token") &&
                !k.includes("key") &&
                !k.includes("secret") &&
                k !== "github_token",
            ),
          );
          const backup = {
            timestamp: new Date().toISOString(),
            settings: safeSettings,
            stats: {
              total: allProblems.length,
              ...countByDifficulty(allProblems, buildUserDifficultyMap(settings)),
            },
          };
          const date = new Date().toISOString().slice(0, 10);
          const backupFiles = [
            {
              path: `config/backup-${date}.json`,
              content: JSON.stringify(backup, null, 2),
            },
          ];
          const commitMsg = `chore: backup config and settings ${date}`;
          // Primary + failover targets
          await _commitWithFailover(
            backupFiles,
            commitMsg,
            repoName,
            { date: new Date() },
            settings,
          );
          // Also push to all enabled mirrors
          const activeTarget = _normalizeGitTarget(
            (await Storage.getSettings().catch(() => settings)).git_active_primary ||
              _getDefaultPrimaryTarget(settings),
          );
          await pushToMirrors(
            backupFiles,
            commitMsg,
            {},
            settings,
            activeTarget ? _targetKey(activeTarget) : "",
          ).catch((e) => dbg.warn("BACKUP_TO_REPO: mirror push failed:", e?.message));
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
            `onMessage(SYNC_PREVIEW): new=${result.remoteOnly?.length}, conflicts=${result.conflicts?.length}`,
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
        `onMessage(SYNC_APPLY_IMPORT): importing ${(msg.problems || []).length} problem(s)...`,
      );
      handleSyncApplyImport(msg.problems || [])
        .then((result) => {
          dbg.log(`onMessage(SYNC_APPLY_IMPORT): result=${JSON.stringify(result)}`);
          sendResponse({ ok: true, ...result });
        })
        .catch((e) => {
          dbg.error(`onMessage(SYNC_APPLY_IMPORT): failed:`, e?.message);
          sendResponse({ ok: false, error: e.message });
        });
      return true;
    }

    if (msg && msg.type === "MIGRATE_REPO") {
      dbg.log(`onMessage(MIGRATE_REPO): starting repo migration...`);
      migrateRepo()
        .then((result) => {
          dbg.log(`onMessage(MIGRATE_REPO): result=${JSON.stringify(result)}`);
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
          dbg.log(`onMessage(RESET_REPO): result=${JSON.stringify(result)}`);
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
          dbg.log(`onMessage(FORCE_REBUILD_REPO): result=${JSON.stringify(result)}`);
          sendResponse({ ok: true, ...result });
        })
        .catch((e) => {
          dbg.error(`onMessage(FORCE_REBUILD_REPO): failed:`, e?.message);
          sendResponse({ ok: false, error: e.message });
        });
      return true;
    }

    if (msg && msg.type === "FORCE_COMMIT_SETTINGS") {
      dbg.log(`onMessage(FORCE_COMMIT_SETTINGS): forcing settings commit...`);
      forceCommitSettingsNow()
        .then((result) => {
          dbg.log(`onMessage(FORCE_COMMIT_SETTINGS): result=${JSON.stringify(result)}`);
          sendResponse({ ok: true, ...result });
        })
        .catch((e) => {
          dbg.error(`onMessage(FORCE_COMMIT_SETTINGS): failed:`, e?.message);
          sendResponse({ ok: false, error: e.message });
        });
      return true;
    }

    if (msg && msg.type === "DETECT_LAYOUT_VERSION") {
      dbg.log(`onMessage(DETECT_LAYOUT_VERSION): detecting layout version...`);
      detectRepoLayoutVersion()
        .then((v) => {
          dbg.log(`onMessage(DETECT_LAYOUT_VERSION): version=${v}`);
          sendResponse({ ok: true, version: v });
        })
        .catch((e) => {
          dbg.error(`onMessage(DETECT_LAYOUT_VERSION): failed:`, e?.message);
          sendResponse({ ok: false, error: e.message });
        });
      return true;
    }

    if (msg && msg.type === "GET_ALL_PROBLEM_IDS") {
      Storage.getAllProblems()
        .then((problems) => sendResponse({ ok: true, ids: (problems || []).map((p) => p.id) }))
        .catch((e) => sendResponse({ ok: false, ids: [], error: e.message }));
      return true;
    }

    if (msg && msg.type === "GET_PROBLEMS_BY_IDS") {
      const ids = new Set(msg.ids || []);
      Storage.getAllProblems()
        .then((problems) =>
          sendResponse({ ok: true, problems: (problems || []).filter((p) => ids.has(p.id)) }),
        )
        .catch((e) => sendResponse({ ok: false, problems: [], error: e.message }));
      return true;
    }

    if (msg && msg.type === "GFG_VERIFY_SWEEP") {
      dbg.log(`onMessage(GFG_VERIFY_SWEEP): thenResync=${!!msg.thenResync}`);
      if (_gfgSweepInProgress) {
        sendResponse({ ok: true, started: false, alreadyRunning: true });
        return true;
      }
      // Respond immediately — the sweep can take minutes for a large import
      // and the caller only needs to know it was accepted. Completion is
      // broadcast as GFG_VERIFY_DONE.
      sendResponse({ ok: true, started: true });
      runGfgSweepAndCommit({
        thenResync: !!msg.thenResync,
        onlyUnverified: msg.onlyUnverified !== false,
      }).catch((e) => dbg.error(`onMessage(GFG_VERIFY_SWEEP): failed:`, e?.message));
      return true;
    }

    if (msg && msg.type === "LINK_VERIFY_ONE") {
      dbg.log(`onMessage(LINK_VERIFY_ONE): id=${msg.id}`);
      (async () => {
        const problem = await Storage.getProblem(msg.id).catch(() => null);
        if (!problem) return { ok: false, error: `Problem not found: ${msg.id}` };
        // GFG keeps its richer path — the candidate walk can repair a slug
        // across the site's three slug generations, not just verify it.
        const result =
          problem.platform === "geeksforgeeks"
            ? await verifyGfgProblem(problem, _gfgVerifyDeps)
            : await verifyProblemLink(problem, _linkVerifyDeps);
        // The API metadata blob is for internal use — the page only needs
        // the verdict and the (possibly repaired) slug.
        return {
          ok: true,
          status: result.status,
          slug: result.slug || null,
          repaired: !!result.repaired,
        };
      })()
        .then(sendResponse)
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }

    if (msg && msg.type === "LINK_APPLY") {
      dbg.log(`onMessage(LINK_APPLY): id=${msg.id}`);
      (async () => {
        const problem = await Storage.getProblem(msg.id).catch(() => null);
        if (!problem) return { ok: false, error: `Problem not found: ${msg.id}` };
        const result =
          problem.platform === "geeksforgeeks"
            ? await applyManualSlug(problem, msg.url, _gfgVerifyDeps)
            : await applyManualLink(problem, msg.url, _linkVerifyDeps);
        return { ok: true, status: result.status, slug: result.slug || null };
      })()
        .then(sendResponse)
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }

    if (msg && msg.type === "LINK_CHECK") {
      dbg.log(`onMessage(LINK_CHECK): platform=${msg.platform}`);
      checkLink(msg.platform, msg.url, _linkVerifyDeps)
        .then((result) =>
          sendResponse({ ok: true, status: result.status, slug: result.slug || null }),
        )
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }

    if (msg && msg.type === "DELETE_PROBLEM") {
      Storage.deleteProblem(msg.id)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }

    if (msg && msg.type === "BULK_IMPORT") {
      dbg.log(`onMessage(BULK_IMPORT): importing ${(msg.problems || []).length} problem(s)...`);
      handleBulkImport(msg.problems || [])
        .then((result) => {
          dbg.log(`onMessage(BULK_IMPORT): result=${JSON.stringify(result)}`);
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
        `onMessage(REFRESH_METADATA): queuing ${(msg.problems || []).length} problem(s) for refresh...`,
      );
      handleRefreshMetadata(msg.problems || [])
        .then((result) => {
          dbg.log(`onMessage(REFRESH_METADATA): result=${JSON.stringify(result)}`);
          sendResponse({ ok: true, ...result });
        })
        .catch((e) => {
          dbg.error(`onMessage(REFRESH_METADATA): failed:`, e?.message);
          sendResponse({ ok: false, error: e.message });
        });
      return true; // async response
    }

    if (msg && msg.type === "REFRESH_METADATA_DONE") {
      dbg.log(`onMessage(REFRESH_METADATA_DONE): completing metadata refresh...`);
      const result = completeRefreshMetadata(sender?.tab?.id);
      dbg.log(`onMessage(REFRESH_METADATA_DONE): completed=${result.completed}`);
      sendResponse({ ok: true, ...result });
      return true;
    }

    if (msg && msg.type === "AI_CHAT_STORE") {
      handleAIChatStore(msg.op, msg.args)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((e) => {
          dbg.error(`onMessage(AI_CHAT_STORE): ${msg.op} failed:`, e?.message);
          sendResponse({ ok: false, error: e.message });
        });
      return true; // async response
    }

    if (msg && msg.type === "AI_CHAT") {
      dbg.log(`onMessage(AI_CHAT): chat with ${(msg.messages || []).length} message(s)...`);
      try {
        const ctx = msg.context || {};
        const p = ctx.problem || {};
        const slug = p.titleSlug || p.slug || ctx.title || "";
        const platform = ctx.platform || p.platform || "";
        if (slug && platform) {
          recordChatInteraction({
            slug,
            platform,
            mode: ctx.chatMode || "",
            commandsUsed: ctx.usedCommands || [],
          }).catch(() => {});
        }
      } catch (e) {
        dbg.warn("Failed to record chat interaction in behavior bank:", e?.message);
      }

      handleAIChat(msg.messages || [], msg.context || {})
        .then((response) => {
          dbg.log(`onMessage(AI_CHAT): response (${String(response || "").length} chars)`);
          sendResponse({ ok: true, response });
        })
        .catch((e) => {
          dbg.error(`onMessage(AI_CHAT): failed:`, e?.message);
          sendResponse({ ok: false, error: e.message });
        });
      return true; // async response
    }

    if (msg && msg.type === "RECORD_HINT_VIEW") {
      dbg.log(
        `onMessage(RECORD_HINT_VIEW): slug=${msg.slug}, platform=${msg.platform}, index=${msg.hintIndex}`,
      );
      (async () => {
        try {
          await recordHintView({
            slug: msg.slug,
            platform: msg.platform,
            hintIndex: msg.hintIndex,
          });
          sendResponse({ ok: true });
        } catch (e) {
          dbg.error(`onMessage(RECORD_HINT_VIEW): failed:`, e?.message);
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true; // async response
    }

    if (msg && msg.type === "REGENERATE_AI_REVIEW") {
      dbg.log(
        `onMessage(REGENERATE_AI_REVIEW): regenerating review for ${(msg.problem || msg.data || {}).titleSlug || "unknown"}`,
      );
      handleRegenerateAIReview(msg.problem || msg.data || {})
        .then((result) => {
          dbg.log(`onMessage(REGENERATE_AI_REVIEW): result=${JSON.stringify(result)}`);
          sendResponse({ ok: true, ...result });
        })
        .catch((e) => {
          dbg.error(`onMessage(REGENERATE_AI_REVIEW): failed:`, e?.message);
          sendResponse({ ok: false, error: e.message });
        });
      return true;
    }

    if (msg && msg.type === "AI_COMPARE_SOLUTIONS") {
      (async () => {
        try {
          const settings = await Storage.getSettings();
          const providerId = settings.aiProvider || "gemini";
          const result = await compareSolutionsForDedup(
            providerId,
            { code: msg.primary?.code, lang: msg.primary?.lang },
            { code: msg.candidate?.code, lang: msg.candidate?.lang },
          );
          sendResponse({ same: !!result?.same });
        } catch (e) {
          dbg.warn(`AI_COMPARE_SOLUTIONS: failed:`, e?.message);
          sendResponse({ same: false });
        }
      })();
      return true; // async response
    }

    if (msg && msg.type === "LIST_GITHUB_BACKUPS") {
      dbg.log(`onMessage(LIST_GITHUB_BACKUPS): listing backups...`);
      (async () => {
        try {
          const settings = await Storage.getSettings();
          const git = registry.getGitProvider(settings.gitProvider || "github");
          if (!git) {
            sendResponse({ ok: false, error: "No git provider" });
            return;
          }
          const token = await git.getToken().catch(() => null);
          const owner = settings.github_owner || settings.github_username || "";
          const repo = settings.github_repo || settings.gitRepo || "";
          if (!token || !owner || !repo) {
            sendResponse({ ok: false, error: "Not configured" });
            return;
          }
          const backups = await listBackups(owner, repo, git);
          sendResponse({ ok: true, backups });
        } catch (e) {
          dbg.error(`onMessage(LIST_GITHUB_BACKUPS): failed:`, e?.message);
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true;
    }

    if (msg && msg.type === "COMMIT_GITHUB_BACKUP_NOW") {
      dbg.log(`onMessage(COMMIT_GITHUB_BACKUP_NOW): committing backup...`);
      (async () => {
        try {
          const settings = await Storage.getSettings();
          const git = registry.getGitProvider(settings.gitProvider || "github");
          if (!git) {
            sendResponse({ ok: false, error: "No git provider" });
            return;
          }
          const token = await git.getToken().catch(() => null);
          const owner = settings.github_owner || settings.github_username || "";
          const repo = settings.github_repo || settings.gitRepo || "";
          if (!token || !owner || !repo) {
            sendResponse({ ok: false, error: "Not configured" });
            return;
          }
          const keep = Math.max(1, parseInt(settings.githubBackupKeep || "10", 10));
          const result = await commitBackupToGitHub(owner, repo, git, keep);
          sendResponse({ ok: true, ...result });
        } catch (e) {
          dbg.error(`onMessage(COMMIT_GITHUB_BACKUP_NOW): failed:`, e?.message);
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true;
    }

    if (msg && msg.type === "RESTORE_GITHUB_BACKUP") {
      dbg.log(`onMessage(RESTORE_GITHUB_BACKUP): restoring ${msg.filePath}...`);
      (async () => {
        try {
          const settings = await Storage.getSettings();
          const git = registry.getGitProvider(settings.gitProvider || "github");
          if (!git) {
            sendResponse({ ok: false, error: "No git provider" });
            return;
          }
          const token = await git.getToken().catch(() => null);
          const owner = settings.github_owner || settings.github_username || "";
          const repo = settings.github_repo || settings.gitRepo || "";
          if (!token || !owner || !repo) {
            sendResponse({ ok: false, error: "Not configured" });
            return;
          }
          const snapshot = await fetchBackupSnapshot(owner, repo, msg.filePath, git);
          if (
            !snapshot ||
            (!snapshot.problems &&
              !snapshot.behaviorBank &&
              !snapshot.settings &&
              !snapshot.roadmaps)
          ) {
            sendResponse({ ok: false, error: "Invalid snapshot" });
            return;
          }
          const stats = await restoreSnapshot(snapshot);
          // Auto-populate behavior bank with any missing solves from the newly restored history
          await autoPopulateFromHistory().catch(() => {});
          sendResponse({
            ok: true,
            count: stats.problemsCount,
            behaviorCount: stats.behaviorCount,
            roadmapsCount: stats.roadmapsCount,
          });
        } catch (e) {
          dbg.error(`onMessage(RESTORE_GITHUB_BACKUP): failed:`, e?.message);
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true;
    }

    if (msg && msg.type === "TRIGGER_CODE_RECOVERY") {
      dbg.log(`onMessage(TRIGGER_CODE_RECOVERY): problemId=${msg.problemId}`);
      (async () => {
        try {
          const problem = await Storage.getProblem(msg.problemId);
          if (!problem) {
            sendResponse({ ok: false, error: "Problem not found" });
            return;
          }
          const result = await triggerCodeRecovery(problem);
          sendResponse(result);
        } catch (e) {
          dbg.error(`onMessage(TRIGGER_CODE_RECOVERY): failed:`, e?.message);
          sendResponse({ ok: false, error: e?.message || "Recovery failed" });
        }
      })();
      return true;
    }

    if (msg && msg.type === "REFRESH_PROBLEM_ALL") {
      dbg.log(`onMessage(REFRESH_PROBLEM_ALL): problemId=${msg.problemId}`);
      (async () => {
        try {
          sendResponse(await refreshEntireProblem(msg.problemId, { withCode: msg.withCode }));
        } catch (e) {
          dbg.error(`onMessage(REFRESH_PROBLEM_ALL): failed:`, e?.message);
          sendResponse({ ok: false, error: e?.message || "Refresh failed" });
        }
      })();
      return true;
    }

    if (msg && msg.type === "GET_HEAL_STATUS") {
      (async () => {
        try {
          const [all, state] = await Promise.all([Storage.getAllProblems(), _loadHealState()]);
          sendResponse({ ok: true, ...healStatus(all, state) });
        } catch (e) {
          sendResponse({ ok: false, error: e?.message || "Status unavailable" });
        }
      })();
      return true;
    }

    if (msg && msg.type === "OPEN_WELCOME") {
      dbg.log(`onMessage(OPEN_WELCOME): opening welcome tab...`);
      openOrFocusTab(chrome.runtime.getURL("welcome/welcome.html"))
        .then((id) => dbg.log(`onMessage(OPEN_WELCOME): tab ${id} shown`))
        .catch(() => {});
      sendResponse({ ok: true });
      return true;
    }

    if (msg && msg.type === "OPEN_LIBRARY") {
      dbg.log(`onMessage(OPEN_LIBRARY): opening library tab (${msg.tab || "solutions"})...`);
      try {
        const tab = msg.tab || "solutions";
        const params = new URLSearchParams({ tab });
        if (msg.chatSlug) params.set("chatSlug", String(msg.chatSlug));
        if (msg.chatPrompt) params.set("chatPrompt", String(msg.chatPrompt));
        chrome.tabs.create({
          url: chrome.runtime.getURL(`library/library.html?${params.toString()}`),
        });
        dbg.log(`onMessage(OPEN_LIBRARY): tab created`);
      } catch (_) {}
      sendResponse({ ok: true });
      return true;
    }

    if (msg && msg.type === "GENERATE_ROADMAP") {
      dbg.log(`onMessage(GENERATE_ROADMAP): generating for level=${msg.level}, goal=${msg.goal}`);
      (async () => {
        try {
          const settings = await Storage.getSettings();
          const allProblems = await Storage.getAllProblems();

          // Build a topic frequency snapshot for context
          const byTopic = {};
          allProblems.forEach((p) => {
            (p.tags || []).forEach((t) => {
              byTopic[t] = (byTopic[t] || 0) + 1;
            });
          });
          const topTopics = Object.entries(byTopic)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([t, n]) => `${t}(${n})`)
            .join(", ");

          const userCtx = `User has solved ${allProblems.length} problems. Top topics: ${topTopics || "none yet"}.`;

          const prompt = `You are a DSA curriculum designer. Create a structured learning roadmap.

User profile:
- Current level: ${msg.level || "unknown"}
- Goal: ${msg.goal || "general DSA mastery"}
- Timeframe: ${msg.timeframe || "1 month"}
- Focus areas: ${msg.topics || "general DSA"}
- ${userCtx}

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "title": "short roadmap title",
  "milestones": [
    {
      "id": "m1",
      "topic": "Arrays & Hashing",
      "subtopics": ["hash-table", "two-pointers"],
      "difficulty": "Easy",
      "targetCount": 8,
      "week": 1,
      "description": "one-sentence goal"
    }
  ]
}

Include 5-8 milestones. Build progressively. subtopics must be lowercase-hyphenated tag names.`;

          const providers = _buildAIReviewProviders(settings);
          let roadmapData = null;
          for (const provider of providers) {
            if (settings[`${provider.id}_enabled`] === false) continue;
            const ai = registry.getAIProvider(provider.id);
            if (!ai) continue;
            try {
              const raw = await Promise.race([
                ai.review(prompt, { _rawPrompt: true }),
                new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 45000)),
              ]);
              // Strip any markdown fences if the model added them
              const cleaned = String(raw || "")
                .replace(/```json\n?|\n?```/g, "")
                .trim();
              roadmapData = JSON.parse(cleaned);
              break;
            } catch (e) {
              dbg.warn(`GENERATE_ROADMAP: provider ${provider.id} failed:`, e?.message);
            }
          }
          if (!roadmapData) {
            sendResponse({
              ok: false,
              error: "All AI providers failed or no provider configured.",
            });
            return;
          }
          sendResponse({ ok: true, roadmap: roadmapData });
        } catch (e) {
          dbg.error(`onMessage(GENERATE_ROADMAP): failed:`, e?.message);
          sendResponse({ ok: false, error: e?.message || "Generation failed" });
        }
      })();
      return true;
    }

    if (msg && msg.type === "OPEN_POPUP") {
      dbg.log(`onMessage(OPEN_POPUP): opening popup...`);
      try {
        if (chrome.action && typeof chrome.action.openPopup === "function") {
          chrome.action.openPopup();
          dbg.log(`onMessage(OPEN_POPUP): via chrome.action.openPopup`);
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
          dbg.error(`onMessage(OPEN_POPUP): all methods failed:`, err?.message);
        }
      }
    }
  });
} catch (e) {
  // Some platforms may not support openPopup — ignore safely
  dbg.warn(`message handler registration:`, e?.message);
}
