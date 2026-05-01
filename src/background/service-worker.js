/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initDebug, coreDebug } from "../lib/debug.js";
import { registry } from "../core/handler-registry.js";
import { eventBus } from "../core/event-bus.js";
import { Storage } from "../core/storage.js";
import { Telemetry } from "../core/telemetry.js";
import { initializeHandlers } from "../handlers/init.js";
import { CONSTANTS } from "../core/constants.js";

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

  // 1. First-time check: only auto-commit the very first time this
  //    (titleSlug, language) pair is seen — subsequent solves require manual sync.
  const titleSlug = data.titleSlug || "";
  const langName = data.lang?.name || "";
  const isFirstCommit = !(await Storage.isSlugLangCommitted(titleSlug, langName).catch(() => false));

  // 2. Save locally — for bulk imports, skip if the user has manually edited this record.
  if (data.skipCommit) {
    const existing = await Storage.getProblem(data.id).catch(() => null);
    if (existing?.manuallyEdited) {
      coreDebug.log("Skipping import overwrite — problem was manually edited", titleSlug);
      return;
    }
  }
  await Storage.saveProblem(data);

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
  if (gitEnabled && !isFirstCommit) {
    coreDebug.log("Already committed slug+lang before — skipping auto-commit. Use manual sync.", titleSlug, langName);
  }
  if (gitEnabled && isFirstCommit) {
    try {
      const git = registry.getGitProvider(settings.gitProvider || "github");

      let filesToCommit = [];
      if (data.files && Array.isArray(data.files)) {
        filesToCommit = [...data.files];
      } else {
        const fallbackLang = data.lang?.name || "Solution";
        const fallbackExt = data.lang?.ext || "txt";
        const filePath = `topics/${data.topic || "Untagged"}/${data.titleSlug}/${fallbackLang}.${fallbackExt}`;
        filesToCommit.push({ path: filePath, content: data.code });
      }

      filesToCommit.push({
        path: "index.json",
        content: await buildIndexJson(),
      });

      const commitOpts = data.timestamp ? { date: new Date(data.timestamp) } : {};
      await git.commit(
        filesToCommit,
        `[${data.topic}] ${data.title} solved`,
        settings.github_repo || settings.gitRepo,
        commitOpts,
      );
      // Mark committed so subsequent solves of the same slug+lang don't auto-push
      await Storage.markSlugLangCommitted(titleSlug, langName).catch(() => { });
      coreDebug.log("Git commit successful", titleSlug, langName);
    } catch (err) {
      coreDebug.error("Git commit failed", err);
    }
  }

  Telemetry.track("solve", { platform: data.platform });
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
    const existing = await Storage.getProblem?.(sub.titleSlug).catch(() => null);
    if (existing) continue; // skip already tracked
    await Storage.saveProblem({
      id: sub.titleSlug, // Required: keyPath for IDBObjectStore
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
    imported++;
  }

  return { total: submissions.length, imported };
}

/**
 * Syncs all local problems to GitHub in a single commit.
 * Fetches repo's index.json to find which problems are already committed,
 * then commits only the missing ones together with an updated index.json.
 */
async function handleResyncAll() {
  const settings = await Storage.getSettings();
  const git = registry.getGitProvider(settings.gitProvider || "github");
  if (!git) throw new Error("No git provider configured");

  const token = await git.getToken();
  if (!token) throw new Error("Not authenticated with GitHub");

  const userRes = await git.apiFetch("/user", token);
  const owner = settings["github_owner"]?.trim() || userRes.login;
  const repoName = (settings["github_repo"] || settings["gitRepo"] || "").replace(/\s+/g, "-");
  if (!repoName) throw new Error("No repository configured");

  // Fetch existing index.json to find already-committed slugs
  const committed = new Set();
  try {
    const indexRes = await git.apiFetch(`/repos/${owner}/${repoName}/contents/index.json`, token);
    const raw = atob((indexRes.content || "").replace(/\n/g, ""));
    const index = JSON.parse(raw);
    (index.problems || []).forEach((p) => committed.add(p.titleSlug));
  } catch (_) {
    // Repo doesn't exist or has no index.json yet — sync everything
  }

  const allProblems = await Storage.getAllProblems();
  const missing = allProblems.filter((p) => p.titleSlug && !committed.has(p.titleSlug));

  if (missing.length === 0) return { committed: 0 };

  const filesToCommit = [];
  for (const problem of missing) {
    if (problem.files && Array.isArray(problem.files) && problem.files.length > 0) {
      for (const f of problem.files) {
        if (f.path && f.content != null) filesToCommit.push(f);
      }
    } else if (problem.code) {
      const langName = problem.lang?.name || "Solution";
      const langExt = problem.lang?.ext || "txt";
      const filePath = `topics/${problem.topic || "Untagged"}/${problem.titleSlug}/${langName}.${langExt}`;
      filesToCommit.push({ path: filePath, content: problem.code });
    }
  }

  filesToCommit.push({ path: "index.json", content: await buildIndexJson() });

  const commitDate = new Date();
  await git.commit(
    filesToCommit,
    `chore: sync ${missing.length} problem(s) [CodeLedger]`,
    repoName,
    { date: commitDate },
  );

  // Mark newly synced problems as committed
  for (const p of missing) {
    await Storage.markSlugLangCommitted(p.titleSlug, p.lang?.name || "").catch(() => {});
  }

  return { committed: missing.length };
}

async function handleAIChat(messages, context = {}) {
  const settings = await Storage.getSettings();

  // Prepend a system-context message so the AI knows which problem we're discussing
  const contextParts = [];
  if (context.title) contextParts.push(`Problem: ${context.title}${context.difficulty ? ` (${context.difficulty})` : ""}`);
  if (context.problemStatement) {
    // Strip HTML tags for a cleaner context prompt
    const plain = context.problemStatement.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
    if (plain) contextParts.push(`Description:\n${plain.slice(0, 2000)}`);
  }
  if (context.code && context.lang?.name) contextParts.push(`My ${context.lang.name} solution:\n\`\`\`${context.lang.name}\n${context.code.slice(0, 3000)}\n\`\`\``);
  else if (context.code) contextParts.push(`My solution:\n\`\`\`\n${context.code.slice(0, 3000)}\n\`\`\``);
  if (context.aiReview) contextParts.push(`Prior AI review:\n${context.aiReview.slice(0, 1000)}`);

  const messagesWithContext = contextParts.length > 0
    ? [{ role: "user", content: `Context for this conversation:\n\n${contextParts.join("\n\n")}` }, { role: "assistant", content: "Understood, I have the problem and solution context. How can I help?" }, ...messages]
    : messages;

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

    if (msg && msg.type === "RESYNC_ALL") {
      handleResyncAll()
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
