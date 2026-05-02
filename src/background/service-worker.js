/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initDebug, coreDebug, setDebug } from "../lib/debug.js";
import { registry } from "../core/handler-registry.js";
import { eventBus } from "../core/event-bus.js";
import { Storage } from "../core/storage.js";
import { Telemetry } from "../core/telemetry.js";
import { initializeHandlers } from "../handlers/init.js";
import { CONSTANTS } from "../core/constants.js";
import { buildConversationSystemPrompt } from "../core/ai-prompts.js";
import { expandChatVariables } from "../lib/chat-variables.js";

// Init background
async function init() {
  await initDebug();
  coreDebug.log("Background starting...");

  // Register handlers
  initializeHandlers();

  // Set up event listeners
  eventBus.on("problem:solved", handleSolved);

  coreDebug.log("Background initialized");
}

function getProblemCommitKey(problem = {}) {
  const slug = String(problem.titleSlug || problem.slug || problem.id || "").trim();
  if (!slug) return "";
  const lang = problem.lang?.name || problem.lang?.slug || problem.lang?.ext || problem.language || "";
  const normLang = String(lang).toLowerCase().replace(/\s+/g, "");
  return normLang ? `${slug}::${normLang}` : slug;
}

function getProblemFiles(problem = {}) {
  const out = [];
  if (problem.files && Array.isArray(problem.files) && problem.files.length > 0) {
    for (const f of problem.files) {
      if (f.path && f.content != null) out.push(f);
    }
  } else if (problem.code) {
    const langName = problem.lang?.name || "Solution";
    const langExt = problem.lang?.ext || "txt";
    out.push({ path: `topics/${problem.topic || "Untagged"}/${problem.titleSlug}/${langName}.${langExt}`, content: problem.code });
  }
  return out;
}
async function handleSolved(data) {
  coreDebug.log("Handling solve event", data);

  // 0. Incognito mode guard — silently skip recording and committing
  {
    const settings = await Storage.getSettings();
    const mode = settings.incognitoMode;
    if (mode && mode !== "off" && mode !== false) {
      const forever = mode === "forever" || mode === true;
      const expiry = settings.incognitoExpiry ?? 0;
      const active = forever ? true : (expiry === -1 ? true : (expiry > 0 && Date.now() < expiry));
      if (active) {
        coreDebug.log("Incognito mode active — solve discarded", data.titleSlug);
        return;
      }
      // Timer expired — auto-reset to off
      await Storage.setSettings({ ...settings, incognitoMode: "off", incognitoExpiry: 0 }).catch(() => { });
    }
  }

  const titleSlug = data.titleSlug || "";
  const langName = data.lang?.name || data.lang?.slug || data.lang?.ext || "";
  const submissionCommitKey = data.submissionId
    ? `submission:${data.platform || "unknown"}:${data.submissionId}`
    : `submission:${data.platform || "unknown"}:${titleSlug}:${langName}:${data.timestamp || data.id || Date.now()}`;
  const alreadyCommitted = await Storage.isSubmissionCommitted(submissionCommitKey).catch(() => false);

  // 2. Save locally — for bulk imports, skip if the user has manually edited this record.
  if (data.skipCommit) {
    const existing = await Storage.getProblem(data.id).catch(() => null);
    if (existing?.manuallyEdited) {
      coreDebug.log("Skipping import overwrite — problem was manually edited", titleSlug);
      return;
    }
  }
  await Storage.saveProblem(data);
  {
    const problemCommitKey = getProblemCommitKey(data);
    if (problemCommitKey) {
      await Storage.markPendingProblemKey(problemCommitKey).catch(() => { });
    }
  }

  // 3. AI Review (if enabled)
  const settings = await Storage.getSettings();
  if (settings.autoReview) {
    const providerPlan = [
      {
        id: settings.aiProvider || "gemini",
        model: settings.aiPrimaryModel || "",
      },
      {
        id: settings.aiSecondary || "",
        model: settings.aiSecondaryModel || "",
      },
      ...CONSTANTS.AI_FALLBACK_CHAIN.map((id) => ({ id, model: "" })),
    ];

    const seen = new Set();
    const providers = providerPlan.filter((p) => {
      if (!p.id) return false;
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    for (const provider of providers) {
      try {
        const providerId = provider.id;
        if (settings[`${providerId}_enabled`] === false) continue;

        const ai = registry.getAIProvider(providerId);
        if (ai) {
          const review = await ai.review(data.code, {
            ...data,
            aiModelOverride: provider.model || "",
          });
          data.aiReview = review;
          await Storage.saveProblem(data);
          coreDebug.log(`AI Review success via ${providerId}`);
          break; // Success!
        }
      } catch (err) {
        coreDebug.error(
          `AI Review failed with ${providerId}, trying next...`,
          err,
        );
      }
    }
  }

  // 4. Git Commit — only auto-commit first time per (slug, language)
  // gitEnabled defaults to true when never explicitly set (matches schema default: true)
  const gitEnabled = settings.gitEnabled !== false && settings.gitEnabled !== 0;
  if (data.skipCommit) {
    coreDebug.log("skipCommit flag set — skipping git commit for bulk import", titleSlug);
    return;
  }
  if (gitEnabled && alreadyCommitted) {
    coreDebug.log("Already committed submission event — skipping auto-commit.", submissionCommitKey);
  }
  if (gitEnabled && !alreadyCommitted) {
    try {
      const git = registry.getGitProvider(settings.gitProvider || "github");

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
        for (const f of getProblemFiles(p)) {
          if (!f?.path || seenPaths.has(f.path)) continue;
          seenPaths.add(f.path);
          filesToCommit.push(f);
        }
      }

      filesToCommit.push({
        path: "index.json",
        content: await buildIndexJson(),
      });

      const pendingCount = pendingProblems.length || 1;
      const commitMsg = pendingCount > 1
        ? "chore: sync " + pendingCount + " pending problem(s) [CodeLedger]"
        : `[${data.topic}] ${data.title} solved`;
      const commitOpts = data.timestamp ? { date: new Date(data.timestamp) } : {};
      await git.commit(
        filesToCommit,
        commitMsg,
        settings.github_repo || settings.gitRepo,
        commitOpts,
      );
      await Storage.markSubmissionCommitted(submissionCommitKey).catch(() => { });
      await Storage.markSlugLangCommitted(titleSlug, langName).catch(() => { });
      await Storage.clearPendingProblemKeys(
        pendingProblems.map((p) => getProblemCommitKey(p)).filter(Boolean),
      ).catch(() => { });
      coreDebug.log("Git commit successful", titleSlug, langName);

      // Push to any configured mirrors (fire-and-forget; failures are non-fatal)
      await pushToMirrors(filesToCommit, commitMsg, commitOpts, settings);
    } catch (err) {
      coreDebug.error("Git commit failed", err);
    }
  }

  Telemetry.track("solve", { platform: data.platform });
}

/**
 * Pushes the same files+message to all mirrors listed in settings.git_mirrors.
 * Each mirror entry: { provider: "github"|"gitlab", repo: string, owner?: string }
 * Failures are logged but never thrown — mirrors are best-effort.
 */
async function pushToMirrors(files, message, commitOpts, settings) {
  const mirrors = settings.git_mirrors;
  if (!Array.isArray(mirrors) || mirrors.length === 0) return;
  await Promise.allSettled(
    mirrors.map(async (mirror) => {
      if (!mirror?.repo) return;
      const handler = registry.getGitProvider(mirror.provider || "github");
      if (!handler) return;
      try {
        await handler.commit(files, message, mirror.repo, {
          ...commitOpts,
          ownerOverride: mirror.owner || undefined,
          isMirror: true,
        });
        coreDebug.log(`Mirror commit OK → ${mirror.provider}/${mirror.repo}`);
      } catch (e) {
        coreDebug.warn(`Mirror commit failed → ${mirror.provider}/${mirror.repo}:`, e.message);
      }
    }),
  );
}

async function buildIndexJson() {
  const problems = await Storage.getAllProblems();
  const stats = {
    total: problems.length,
    easy: problems.filter((p) => p.difficulty === "Easy").length,
    medium: problems.filter((p) => p.difficulty === "Medium").length,
    hard: problems.filter((p) => p.difficulty === "Hard").length,
  };

  return JSON.stringify({ updatedAt: new Date().toISOString(), stats, problems }, null, 2);
}

/**
 * Fetches recent accepted submissions from LeetCode's public GraphQL API.
 * The background SW has host_permissions for leetcode.com so there are no CORS issues.
 * Limited to 20 results via the public API — full history requires an authenticated session.
 */
async function handleLeetCodeImport(username, limit) {
  if (!username) throw new Error("Username is required");

  const query = `query recentAcSubmissions($username: String!, $limit: Int!) {
    recentAcSubmissionList(username: $username, limit: $limit) {
      id title titleSlug timestamp lang
    }
  }`;

  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { username, limit } }),
  });

  if (!res.ok) throw new Error("LeetCode API returned " + res.status);
  const data = await res.json();
  const submissions = data?.data?.recentAcSubmissionList || [];

  let imported = 0;
  for (const sub of submissions) {
    const ts = Number(sub.timestamp) * 1000;
    const slug = (sub.lang || "").toLowerCase().replace(/\s+/g, "");
    const problemId = `${sub.titleSlug}::${slug || "unknown"}`;
    const existing = await Storage.getProblem?.(problemId).catch(() => null);
    if (existing) continue; // skip already tracked
    await Storage.saveProblem({
      id: problemId, // Required: keyPath for IDBObjectStore
      title: sub.title,
      titleSlug: sub.titleSlug,
      platform: "leetcode",
      difficulty: "Unknown",
      lang: { name: slug, ext: slug, slug },
      tags: [],
      timestamp: ts,
      code: "",
      url: "https://leetcode.com/problems/" + sub.titleSlug + "/",
    });
    await Storage.markPendingProblemKey(`${sub.titleSlug}::${slug || "unknown"}`).catch(() => { });
    imported++;
  }

  return { total: submissions.length, imported };
}

/** Counts how many local problems are missing from the remote repo, without committing. */
async function handleResyncCount() {
  const settings = await Storage.getSettings();
  const git = registry.getGitProvider(settings.gitProvider || "github");
  if (!git) throw new Error("No git provider configured");
  const token = await git.getToken();
  if (!token) throw new Error("Not authenticated with GitHub");
  const userRes = await git.apiFetch("/user", token);
  const owner = settings["github_owner"]?.trim() || userRes.login;
  const repoName = (settings["github_repo"] || settings["gitRepo"] || "").replace(/\s+/g, "-");
  if (!repoName) throw new Error("No repository configured");
  const committed = new Set();
  try {
    const indexRes = await git.apiFetch("/repos/" + owner + "/" + repoName + "/contents/index.json", token);
    const raw = atob((indexRes.content || "").replace(/\n/g, ""));
    const index = JSON.parse(raw);
    (index.problems || []).forEach((p) => {
      const key = getProblemCommitKey(p);
      if (key) committed.add(key);
    });
  } catch (_) { }
  const allProblems = await Storage.getAllProblems();
  const pendingMap = await Storage.getPendingProblemKeys().catch(() => ({}));
  const pendingKeys = new Set(Object.keys(pendingMap || {}));
  const missing = allProblems.filter((p) => {
    const key = getProblemCommitKey(p);
    return key && (!committed.has(key) || pendingKeys.has(key));
  });
  return { count: missing.length };
}

/**
 * Syncs all local problems to GitHub.
 * mode="bulk"       — one atomic commit for all missing problems (default, rate-limit safe).
 * mode="individual" — one commit per problem with correct backdated timestamps.
 */
async function handleResyncAll(mode = "bulk") {
  const settings = await Storage.getSettings();
  const git = registry.getGitProvider(settings.gitProvider || "github");
  if (!git) throw new Error("No git provider configured");

  const token = await git.getToken();
  if (!token) throw new Error("Not authenticated with GitHub");

  const userRes = await git.apiFetch("/user", token);
  const owner = settings["github_owner"]?.trim() || userRes.login;
  const repoName = (settings["github_repo"] || settings["gitRepo"] || "").replace(/\s+/g, "-");
  if (!repoName) throw new Error("No repository configured");

  // Fetch existing index.json to find already-committed slugs/langs
  const committed = new Set();
  try {
    const indexRes = await git.apiFetch("/repos/" + owner + "/" + repoName + "/contents/index.json", token);
    const raw = atob((indexRes.content || "").replace(/\n/g, ""));
    const index = JSON.parse(raw);
    (index.problems || []).forEach((p) => {
      const key = getProblemCommitKey(p);
      if (key) committed.add(key);
    });
  } catch (_) {
    // Repo doesn't exist or has no index.json yet — sync everything
  }

  const allProblems = await Storage.getAllProblems();
  const pendingMap = await Storage.getPendingProblemKeys().catch(() => ({}));
  const pendingKeys = new Set(Object.keys(pendingMap || {}));
  const missing = allProblems.filter((p) => {
    const key = getProblemCommitKey(p);
    return key && (!committed.has(key) || pendingKeys.has(key));
  });

  if (missing.length === 0) return { committed: 0 };

  if (mode === "individual") {
    // One backdated commit per problem, sorted chronologically
    const historicalCommits = missing.map((p) => ({
      files: getProblemFiles(p),
      message: "[" + (p.topic || "Untagged") + "] " + (p.title || p.titleSlug) + " solved",
      date: p.timestamp ? new Date(p.timestamp > 1e10 ? p.timestamp : p.timestamp * 1000) : new Date(),
      repoName,
    }));
    // Append index.json only to the last commit
    if (historicalCommits.length > 0) {
      historicalCommits[historicalCommits.length - 1].files.push({ path: "index.json", content: await buildIndexJson() });
    }
    await git.commitHistorical(historicalCommits);
  } else {
    // Bulk: single atomic commit
    const filesToCommit = [];
    for (const problem of missing) {
      for (const f of getProblemFiles(problem)) filesToCommit.push(f);
    }
    filesToCommit.push({ path: "index.json", content: await buildIndexJson() });
    await git.commit(
      filesToCommit,
      "chore: sync " + missing.length + " problem(s) [CodeLedger]",
      repoName,
      { date: new Date() },
    );
  }

  // Mark newly synced problems as committed
  for (const p of missing) {
    await Storage.markSlugLangCommitted(p.titleSlug, p.lang?.name || p.lang?.slug || p.lang?.ext || "").catch(() => { });
  }
  await Storage.clearPendingProblemKeys(
    missing.map((p) => getProblemCommitKey(p)).filter(Boolean),
  ).catch(() => { });

  // Mirror the bulk sync
  const allFiles = [];
  for (const p of missing) for (const f of getProblemFiles(p)) allFiles.push(f);
  allFiles.push({ path: "index.json", content: await buildIndexJson() });
  await pushToMirrors(allFiles, "chore: sync " + missing.length + " problem(s) [CodeLedger]", {}, settings);

  return { committed: missing.length };
}

async function handleAIChat(messages, context = {}) {
  const settings = await Storage.getSettings();
  const contextParts = [];
  if (context.title) contextParts.push(`Problem: ${context.title}${context.difficulty ? ` (${context.difficulty})` : ""}`);
  if (context.problemStatement) {
    const plain = context.problemStatement.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
    if (plain) contextParts.push(`Description:\n${plain.slice(0, 2000)}`);
  }
  if (context.code && context.lang?.name) contextParts.push(`My ${context.lang.name} solution:\n\`\`\`${context.lang.name}\n${context.code.slice(0, 3000)}\n\`\`\``);
  else if (context.code) contextParts.push(`My solution:\n\`\`\`\n${context.code.slice(0, 3000)}\n\`\`\``);
  if (context.aiReview) contextParts.push(`Prior AI review:\n${context.aiReview.slice(0, 1000)}`);

  const systemPrompt = buildConversationSystemPrompt(context);
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
    ...(contextParts.length > 0 ? [{ role: "system", content: `Context for this conversation:\n\n${contextParts.join("\n\n")}` }] : []),
    ...expandedMessages,
  ];

  const seen = new Set();
  const providers = [
    { id: settings.aiProvider || "gemini", model: settings.aiPrimaryModel || "" },
    { id: settings.aiSecondary || "", model: settings.aiSecondaryModel || "" },
    ...CONSTANTS.AI_FALLBACK_CHAIN.map((id) => ({ id, model: "" })),
  ].filter((p) => {
    if (!p.id || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  for (const provider of providers) {
    if (settings[`${provider.id}_enabled`] === false) continue;
    const ai = registry.getAIProvider(provider.id);
    if (!ai) continue;
    try {
      const response = await ai.chat(messagesWithContext, { ...context, aiModelOverride: provider.model });
      return response;
    } catch (e) {
      coreDebug.warn(`AI Chat failed with ${provider.id}:`, e.message);
    }
  }

  throw new Error("No AI providers available or configured. Add an API key in Settings → AI.");
}

chrome.runtime.onInstalled.addListener(() => {
  init();
  Telemetry.track("install");
});

init();

// Keep the debug flag in sync with user preference changes without requiring SW restart
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && CONSTANTS.SK.DEBUG in changes) {
    setDebug(changes[CONSTANTS.SK.DEBUG].newValue === true);
  }
});

// Allow content scripts to ask the background to open the extension popup (best-effort).
// This enables the LeetCode QoL button to open the extension UI without requiring the user
// to click the toolbar action directly.
try {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    // LeetCode profile import via background (bypasses CORS)
    if (msg && msg.type === "LEETCODE_IMPORT") {
      const username = msg.username || "";
      const limit = Math.min(msg.limit || 20, 100);
      handleLeetCodeImport(username, limit)
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true; // async response
    }

    if (msg && msg.type === "RESYNC_COUNT") {
      handleResyncCount()
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }

    if (msg && msg.type === "RESYNC_ALL") {
      handleResyncAll(msg.mode || "bulk")
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true; // async response
    }

    if (msg && msg.type === "AI_CHAT") {
      handleAIChat(msg.messages || [], msg.context || {})
        .then((response) => sendResponse({ ok: true, response }))
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true; // async response
    }

    if (msg && msg.type === "OPEN_WELCOME") {
      try {
        chrome.tabs.create({ url: chrome.runtime.getURL("welcome/welcome.html") });
      } catch (_) { }
      sendResponse({ ok: true });
      return true;
    }

    if (msg && msg.type === "OPEN_LIBRARY") {
      try {
        const tab = msg.tab || "solutions";
        const params = new URLSearchParams({ tab });
        if (msg.chatSlug) params.set("chatSlug", String(msg.chatSlug));
        if (msg.chatPrompt) params.set("chatPrompt", String(msg.chatPrompt));
        chrome.tabs.create({ url: chrome.runtime.getURL(`library/library.html?${params.toString()}`) });
      } catch (_) { }
      sendResponse({ ok: true });
      return true;
    }

    if (msg && msg.type === "OPEN_POPUP") {
      try {
        if (chrome.action && typeof chrome.action.openPopup === "function") {
          chrome.action.openPopup();
          return;
        }
        if (
          chrome.browserAction &&
          typeof chrome.browserAction.openPopup === "function"
        ) {
          chrome.browserAction.openPopup();
          return;
        }
        // Fallback: open the popup page as a tab
        if (chrome.tabs && chrome.runtime && chrome.runtime.getURL) {
          chrome.tabs.create({
            url: chrome.runtime.getURL("popup/popup.html"),
          });
        }
      } catch (e) {
        try {
          chrome.tabs.create({
            url: chrome.runtime.getURL("popup/popup.html"),
          });
        } catch (err) {
          /* ignore */
        }
      }
    }
  });
} catch (e) {
  // Some platforms may not support openPopup — ignore safely
}
