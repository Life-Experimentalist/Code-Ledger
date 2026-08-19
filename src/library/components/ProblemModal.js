/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect, useCallback } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";
import { getProblemCommitKey } from "../../core/lang-utils.js";
import { createDebugger } from "../../lib/debug.js";
const dbg = createDebugger("ProblemModal");
import { cleanCode, highlightCodeWithLines } from "../../lib/syntax-highlight.js";
import { getChatsByProblem, saveAIChat, updateAIChat } from "../../core/ai-chat-storage.js";
import { buildAIChatContext } from "../../lib/ai-chat-context.js";
import { AIReviewPanel } from "../../ui/components/AIReviewPanel.js";
import { MultiLineAIChatInput } from "../../ui/components/MultiLineAIChatInput.js";
import { AIMarkdownRenderer } from "../../ui/components/AIMarkdownRenderer.js";
import { ModelStatusBar } from "../../ui/components/ModelStatusBar.js";
import { modalTabRegistry } from "../../core/modal-tab-registry.js";
import { isAIActive } from "../../core/feature-flags.js";
import { expandChatVariables } from "../../lib/chat-variables.js";
import { CONSTANTS } from "../../core/constants.js";
import { cleanGfgSlug } from "../../core/gfg-utils.js";
import { cfProblemUrl } from "../../core/cf-utils.js";
import { classifyTopic, KIND, KIND_ORDER, KIND_LABEL } from "../../core/topic-taxonomy.js";
// Side-effect: registers LeetCode tabs into modalTabRegistry
import "../../handlers/platforms/leetcode/modal-tabs.js";

/** Tabs that exist only to talk to a model, keyed by registry id. */
const AI_TAB_IDS = new Set(["review", "chat"]);

/**
 * Stored URLs come from imported/synced problem data, which the extension does
 * not control end to end. Only http(s) may reach an href — anything else
 * (javascript:, data:, …) is dropped rather than bound.
 */
const httpUrl = (u) => (/^https?:\/\//i.test(String(u || "")) ? u : "");

/**
 * The registry's tabs, minus the AI ones when there is no provider to reach.
 *
 * A stored review is the exception: it is the user's own text and stays
 * readable whatever the AI switch says now. Hiding it would look like the
 * extension had thrown it away.
 *
 * @param {object} problem
 * @param {Record<string, any>} settings
 */
function aiAwareTabs(problem, settings) {
  const tabs = modalTabRegistry.getTabs(problem?.platform || "leetcode", problem);
  if (isAIActive(settings)) return tabs;
  return tabs.filter((t) => !AI_TAB_IDS.has(t.id) || (t.id === "review" && !!problem?.aiReview));
}

export const PLATFORM_META = {
  leetcode: {
    favicon: "https://assets.leetcode.com/static_assets/public/icons/favicon.ico",
    label: "LeetCode",
    color: CONSTANTS.PLATFORMS.leetcode.color,
    url: (slug) => CONSTANTS.PLATFORMS.leetcode.problemsBase + slug + "/",
  },
  geeksforgeeks: {
    favicon: "https://www.geeksforgeeks.org/favicon.ico",
    label: "GeeksForGeeks",
    color: CONSTANTS.PLATFORMS.geeksforgeeks.color,
    url: (slug) => CONSTANTS.PLATFORMS.geeksforgeeks.practiceBase + cleanGfgSlug(slug) + "/1",
  },
  codeforces: {
    favicon: "https://codeforces.com/favicon.ico",
    label: "Codeforces",
    color: CONSTANTS.PLATFORMS.codeforces.color,
    url: (slug) => cfProblemUrl(slug) || CONSTANTS.PLATFORMS.codeforces.problemsetUrl,
  },
  neetcode: {
    favicon: "https://neetcode.io/favicon.ico",
    label: "NeetCode",
    color: CONSTANTS.PLATFORMS.neetcode.color,
    url: (slug) => CONSTANTS.PLATFORMS.neetcode.problemsBase + slug,
  },
  takeuforward: {
    favicon: "https://takeuforward.org/favicon.ico",
    label: "takeuforward",
    color: CONSTANTS.PLATFORMS.takeuforward.color,
    url: (slug) => CONSTANTS.PLATFORMS.takeuforward.problemsBase + slug,
  },
};

function _fmtElapsed(secs) {
  if (!secs || secs <= 0) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const DIFF_CLASS = {
  Easy: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Hard: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

// Session-level memory of the last active tab — survives problem navigation but not page reload.
let _lastModalTab = "overview";

export function ProblemModal({
  problem,
  onClose,
  onUpdate,
  onDelete,
  problemList = [],
  onNavigateProblem,
  onOpenGraphProblem,
  onNavigate,
  hideCloseButton = false,
  topicKinds = {},
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [copied, setCopied] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatPending, setChatPending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatId, setChatId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [queueStatus, setQueueStatus] = useState(null);
  const [queueStatusError, setQueueStatusError] = useState("");
  const [queueActionBusy, setQueueActionBusy] = useState(false);
  const [removeFromQueueBusy, setRemoveFromQueueBusy] = useState(false);
  const [settings, setSettings] = useState({});
  const [notes, setNotes] = useState(problem?.notes || "");

  // Save notes when they change
  const handleNotesChange = async (newNotes) => {
    setNotes(newNotes);
    try {
      const updated = { ...problem, notes: newNotes };
      await Storage.saveProblem(updated);
      onUpdate?.(updated);
    } catch (_) {}
  };
  const [methods, setMethods] = useState(problem?.methods || []);
  const [selectedMethodIdx, setSelectedMethodIdx] = useState(0);
  const [showAddMethod, setShowAddMethod] = useState(false);
  const [newMethodTitle, setNewMethodTitle] = useState("");
  const [newMethodDesc, setNewMethodDesc] = useState("");

  const handleAddMethod = async () => {
    if (!newMethodTitle.trim()) return;
    const langName = problem.lang?.name || "solution";
    const newMethod = {
      title: newMethodTitle,
      language: langName,
      description: newMethodDesc,
      code: "",
      timestamp: Date.now(),
    };
    const updatedMethods = [...methods, newMethod];
    setMethods(updatedMethods);
    setShowAddMethod(false);
    setNewMethodTitle("");
    setNewMethodDesc("");
    try {
      const updated = { ...problem, methods: updatedMethods };
      await Storage.saveProblem(updated);
      onUpdate?.(updated);
    } catch (_) {}
  };

  const handleDeleteMethod = async (idx) => {
    const updatedMethods = methods.filter((_, i) => i !== idx);
    setMethods(updatedMethods);
    setSelectedMethodIdx(Math.min(selectedMethodIdx, updatedMethods.length - 1));
    try {
      const updated = { ...problem, methods: updatedMethods };
      await Storage.saveProblem(updated);
      onUpdate?.(updated);
    } catch (_) {}
  };

  useEffect(() => {
    Storage.getSettings()
      .then(setSettings)
      .catch(() => {});
  }, []);

  const fetchQueueStatus = useCallback(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.id) {
      setQueueStatus(null);
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_AI_REVIEW_QUEUE_STATUS" }, (resp) => {
        if (chrome.runtime.lastError || !resp?.ok) {
          setQueueStatus(null);
          setQueueStatusError(resp?.error || chrome.runtime.lastError?.message || "");
          resolve(null);
          return;
        }
        setQueueStatus(resp);
        setQueueStatusError("");
        resolve(resp);
      });
    });
  }, []);

  useEffect(() => {
    fetchQueueStatus();
    const timer = setInterval(fetchQueueStatus, 30000);
    return () => clearInterval(timer);
  }, [fetchQueueStatus]);

  // Update notes when problem changes
  useEffect(() => {
    setNotes(problem?.notes || "");
    setMethods(problem?.methods || []);
    setSelectedMethodIdx(0);
    setShowAddMethod(false);
  }, [problem?.id]);

  // Reset (or restore) tab and load chat history when problem changes
  useEffect(() => {
    if (settings?.remember_modal_tab && _lastModalTab && _lastModalTab !== "overview") {
      // Check if the remembered tab exists for this problem
      const regTabs = aiAwareTabs(problem, settings);
      const available = new Set([
        ...regTabs.map((t) => t.id),
        "notes",
        ...(problem?.methods?.length > 0 ? ["methods"] : []),
      ]);
      setActiveTab(available.has(_lastModalTab) ? _lastModalTab : "overview");
    } else {
      setActiveTab("overview");
    }
    if (problem) {
      setChatMessages([]);
      setChatInput("");
      setChatError("");
      setChatId(null);

      if (problem.titleSlug) {
        getChatsByProblem(problem.titleSlug)
          .then((chats) => {
            const latest = chats?.[0];
            if (!latest) return;
            setChatId(latest.id);
            setChatMessages(latest.messages || []);
          })
          .catch(() => {});
      }
    }
  }, [problem?.titleSlug, problem?.id, settings?.remember_modal_tab]);

  // Escape to close
  useEffect(() => {
    if (!problem) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [problem, onClose]);

  const isExtension = typeof chrome !== "undefined" && !!chrome.runtime?.id;
  const problemIndex = problemList.findIndex(
    (entry) => (entry?.id || entry?.titleSlug) === (problem?.id || problem?.titleSlug),
  );
  const canNavigate = problemList.length > 1 && problemIndex >= 0;

  // Arrow key navigation (← prev, → next)
  useEffect(() => {
    if (!problem || !canNavigate) return;
    const onKey = (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onNavigateProblem?.(
          problemList[(problemIndex - 1 + problemList.length) % problemList.length],
        );
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onNavigateProblem?.(problemList[(problemIndex + 1) % problemList.length]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [problem, canNavigate, problemIndex, problemList, onNavigateProblem]);

  if (!problem) return null;

  const meta = PLATFORM_META[problem.platform] || {
    label: problem.platform || "Unknown",
    color: "#64748b",
    url: () => "#",
    favicon: null,
  };
  const problemUrl = meta.url(problem.titleSlug || problem.id || "");

  // One chip per canonical topic, algorithms before structures. The axis a tag
  // belongs to comes from the shared taxonomy, so this list agrees with
  // Analytics and the graph about what "Binary Search" is — and merging
  // through the canonical name collapses "hash map" and "Hash Table" into one
  // chip instead of two.
  const kindRank = (k) => {
    const i = KIND_ORDER.indexOf(k);
    return i === -1 ? KIND_ORDER.length : i;
  };
  const topics = (() => {
    const raw =
      Array.isArray(problem.tags) && problem.tags.length
        ? problem.tags
        : problem.topic
          ? [problem.topic]
          : [];
    const seen = new Map();
    for (const t of raw) {
      if (!t) continue;
      const { topic, kind } = classifyTopic(t, topicKinds);
      if (!topic || topic === "Untagged" || seen.has(topic)) continue;
      seen.set(topic, kind);
    }
    return [...seen.entries()]
      .sort((a, b) => kindRank(a[1]) - kindRank(b[1]) || a[0].localeCompare(b[0]))
      .map(([topic, kind]) => ({ topic, kind }));
  })();
  const diffClass = DIFF_CLASS[problem.difficulty] || "bg-white/5 text-slate-400 border-white/10";
  const langName = problem.lang?.name || problem.language || null;

  const copyCode = async () => {
    if (!problem.code) return;
    try {
      await navigator.clipboard.writeText(cleanCode(problem.code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };

  // Siblings: same problem solved in a different language or on a different platform
  const siblings = problemList.filter((p) => {
    if (!p || p.id === problem.id) return false;
    const sameSlug = p.titleSlug && p.titleSlug === problem.titleSlug;
    const sameCanonical = p.canonical?.id && p.canonical.id === problem.canonical?.id;
    return sameSlug || sameCanonical;
  });

  /**
   * Refetch everything this problem is missing — statement, tags, difficulty,
   * and the code if it was never captured — in one press.
   *
   * The work happens in the service worker and is written straight to storage,
   * so closing this modal does not cancel it and does not lose the result. That
   * was the old behaviour: a popup window, a thirty-second polling loop living
   * inside this component, and "Refresh timeout" if the user looked away.
   */
  const handleRefreshData = useCallback(async () => {
    if (refreshing) return;
    if (typeof chrome === "undefined" || !chrome.runtime?.id) {
      setChatError("Refreshing needs the extension — open this problem in CodeLedger.");
      setTimeout(() => setChatError(""), 6000);
      return;
    }
    setRefreshing(true);
    try {
      const res = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            { type: "REFRESH_PROBLEM_ALL", problemId: problem.id },
            (resp) => {
              if (chrome.runtime.lastError) {
                resolve({ ok: false, error: chrome.runtime.lastError.message });
              } else {
                resolve(resp || { ok: false, error: "No response from the background worker" });
              }
            },
          );
        } catch (e) {
          resolve({ ok: false, error: e?.message || "Extension context error" });
        }
      });

      const updated = await Storage.getProblem(problem.id).catch(() => null);
      if (updated) onUpdate?.(updated);

      if (res?.changed?.length) return; // the page now shows what it fetched
      if (res?.codeQueued) {
        setChatError(
          "Fetching your submission in a background tab — it will appear here when it lands, " +
            "and it is saved even if you close this.",
        );
        setTimeout(() => setChatError(""), 8000);
      } else if (res?.healable === false) {
        setChatError("This platform has no description API — use Open Platform to read it.");
        setTimeout(() => setChatError(""), 6000);
      } else if (!res?.ok) {
        setChatError("Fetch failed: " + (res?.error || "Unknown error"));
        setTimeout(() => setChatError(""), 6000);
      } else {
        setChatError("Nothing more to fetch — the platform returned no extra details.");
        setTimeout(() => setChatError(""), 6000);
      }
    } catch (e) {
      setChatError("Refresh failed: " + (e.message || e));
      setTimeout(() => setChatError(""), 5000);
    } finally {
      setRefreshing(false);
    }
  }, [problem, refreshing, onUpdate]);

  // A repair that finished elsewhere — the background sweep, or a code-recovery
  // tab the user opened and walked away from — lands in this modal too.
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
    const onDone = (msg) => {
      if (!msg || msg.type !== "REFRESH_METADATA_DONE") return;
      const mine = msg.problemId === problem?.id || (msg.slug && msg.slug === problem?.titleSlug);
      if (!mine) return;
      Storage.getProblem(problem.id)
        .then((updated) => updated && onUpdate?.(updated))
        .catch(() => {});
    };
    chrome.runtime.onMessage.addListener(onDone);
    return () => chrome.runtime.onMessage.removeListener(onDone);
  }, [problem?.id, problem?.titleSlug, onUpdate]);

  const sendChat = async () => {
    const rawText = chatInput.trim();
    if (!rawText || chatPending) return;

    const text = await expandChatVariables(rawText, {
      problem,
      userCode: problem.code || "",
      hints: problem.hints || [],
      similar: problem.similar || [],
      constraints: problem.constraints || "",
    });

    const userMsg = { role: "user", content: text, ts: Date.now() };
    const updatedMsgs = [...chatMessages, userMsg];
    setChatMessages(updatedMsgs);
    setChatInput("");
    setChatPending(true);
    setChatError("");

    try {
      const context = buildAIChatContext({
        surface: "problem-modal",
        problem,
        text,
        code: problem.code || "",
        lang: problem.lang,
        aiReview: problem.aiReview || "",
        problemStatement: problem.problemStatement || "",
        hints: problem.hints || [],
        similar: problem.similar || [],
        constraints: problem.constraints || "",
        attachedProblemSlugs: problem.titleSlug ? [problem.titleSlug] : [],
        attachedProblems: problem.titleSlug
          ? [
              {
                slug: problem.titleSlug,
                title: problem.title || problem.titleSlug,
                platform: problem.platform || "leetcode",
                url: problemUrl,
              },
            ]
          : [],
      });

      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: "AI_CHAT",
            messages: updatedMsgs.map(({ role, content }) => ({
              role,
              content,
            })),
            context,
          },
          (resp) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else if (resp?.ok) resolve(resp.response);
            else reject(new Error(resp?.error || "AI failed"));
          },
        );
      });

      const aiMsg = {
        role: "assistant",
        content: response.response,
        providerId: response.providerId,
        modelId: response.modelId,
        isFallback: response.isFallback,
        ts: Date.now(),
      };
      const finalMsgs = [...updatedMsgs, aiMsg];
      setChatMessages(finalMsgs);

      const meta = {
        problemTitle: problem.title || "",
        problemTags: Array.isArray(problem.tags) ? problem.tags : [],
        attachedProblemSlugs: problem.titleSlug ? [problem.titleSlug] : [],
        attachedProblems: problem.titleSlug
          ? [
              {
                slug: problem.titleSlug,
                title: problem.title || problem.titleSlug,
                platform: problem.platform || "leetcode",
                url: problemUrl,
              },
            ]
          : [],
        surface: "problem-modal",
        requestType: context.requestType || "",
        usedCommands: context.usedCommands || [],
        requestTemplate: text,
        summary: text.slice(0, 120),
      };

      if (chatId) {
        await updateAIChat(chatId, finalMsgs, meta);
      } else {
        const newChatId = await saveAIChat(
          problem.titleSlug,
          problemUrl,
          finalMsgs,
          problem.platform || "leetcode",
          meta,
        );
        setChatId(newChatId);
      }
    } catch (e) {
      setChatError(e.message);
    } finally {
      setChatPending(false);
    }
  };

  const handleGenerateAIReview = async () => {
    if (reviewBusy) return;
    if (!problem?.code) {
      setReviewError("No code saved for this problem. Solve it on the platform first.");
      return;
    }
    if (typeof chrome === "undefined" || !chrome.runtime?.id) {
      setReviewError("Extension not available.");
      return;
    }
    setReviewBusy(true);
    setReviewError("");
    try {
      dbg.log(`Requesting AI review for problem ${problem.id || problem.titleSlug}`);
      const TIMEOUT_MS = 90000;
      // Keep the MV3 service worker alive for the duration of the request.
      // An open runtime port prevents Chrome from terminating the SW mid-call.
      let keepAlivePort = null;
      let keepAliveTimer = null;
      try {
        keepAlivePort = chrome.runtime.connect({ name: "ai-review-keepalive" });
        keepAliveTimer = setInterval(() => {
          try {
            keepAlivePort?.postMessage({ type: "ping" });
          } catch (_) {}
        }, 20000);
      } catch (_) {}
      const releaseKeepalive = () => {
        clearInterval(keepAliveTimer);
        try {
          keepAlivePort?.disconnect();
        } catch (_) {}
        keepAlivePort = null;
      };

      const result = await new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          releaseKeepalive();
          dbg.warn("AI review request timed out for UI request");
          reject(new Error("AI review timed out"));
        }, TIMEOUT_MS);

        chrome.runtime.sendMessage({ type: "REGENERATE_AI_REVIEW", problem }, (resp) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          releaseKeepalive();
          if (chrome.runtime.lastError) {
            dbg.warn("REGENERATE_AI_REVIEW message error:", chrome.runtime.lastError.message);
            reject(new Error(chrome.runtime.lastError.message));
          } else if (resp?.ok) {
            dbg.log(`AI review response received for ${problem.id || problem.titleSlug}`);
            resolve(resp);
          } else {
            dbg.warn("REGENERATE_AI_REVIEW failed:", resp?.error);
            reject(new Error(resp?.error || "AI review failed"));
          }
        });
      });

      if (result?.problem) {
        onUpdate?.(result.problem);
      }
      setActiveTab("review");
    } catch (e) {
      setReviewError(e.message || String(e));
    } finally {
      setReviewBusy(false);
    }
  };

  const handleRunAIReviewQueueNow = async () => {
    if (queueActionBusy) return;
    if (typeof chrome === "undefined" || !chrome.runtime?.id) {
      setQueueStatusError("Extension not available.");
      return;
    }
    setQueueActionBusy(true);
    setQueueStatusError("");
    try {
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "PROCESS_REVIEW_QUEUE_NOW" }, (resp) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (resp?.ok) {
            resolve(resp);
          } else {
            reject(new Error(resp?.error || "Failed to start queue"));
          }
        });
      });
      if (result?.ok) {
        await fetchQueueStatus();
      }
    } catch (e) {
      setQueueStatusError(e.message || String(e));
    } finally {
      setQueueActionBusy(false);
    }
  };

  const handleRemoveFromQueue = async () => {
    if (removeFromQueueBusy || !problem?.id) return;
    if (typeof chrome === "undefined" || !chrome.runtime?.id) return;
    setRemoveFromQueueBusy(true);
    try {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "REMOVE_QUEUE_ITEMS_BY_PROBLEM", problemId: problem.id },
          (resp) => {
            void chrome.runtime.lastError;
            resolve(resp);
          },
        );
      });
      await fetchQueueStatus();
    } catch (_) {
    } finally {
      setRemoveFromQueueBusy(false);
    }
  };

  const openAIChatsView = () => {
    const chatSlug = String(problem?.titleSlug || problem?.id || "").trim();
    const chatPrompt = chatInput.trim();
    try {
      chrome.runtime.sendMessage({
        type: "OPEN_LIBRARY",
        tab: "ai-chats",
        chatSlug,
        ...(chatPrompt ? { chatPrompt } : {}),
      });
      return;
    } catch (_) {}

    try {
      const params = new URLSearchParams({ tab: "ai-chats" });
      if (chatSlug) params.set("chatSlug", chatSlug);
      if (chatPrompt) params.set("chatPrompt", chatPrompt);
      window.open(chrome.runtime.getURL(`library/library.html?${params.toString()}`), "_blank");
    } catch (_) {}
  };

  const registryTabs = aiAwareTabs(problem, settings);
  const baseTabs = registryTabs.map((tab) => ({
    id: tab.id,
    label: typeof tab.label === "function" ? tab.label(problem) : tab.label,
  }));
  // Add Notes tab
  const tabs = [
    ...baseTabs,
    ...(methods.length > 0 ? [{ id: "methods", label: `🔄 Methods (${methods.length})` }] : []),
    { id: "notes", label: "📝 Notes" },
  ];

  return html`
    <div
      class="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style="background:rgba(0,0,0,0.8);backdrop-filter:blur(6px)"
      onClick=${(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        class="relative w-full max-w-[72rem] max-h-[calc(100vh-80px)] flex flex-col bg-[#0d1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        <!-- ── Header ── -->
        <div class="flex items-start gap-3 p-5 border-b border-white/5 shrink-0">
          ${meta.favicon
            ? html`
                <img
                  src=${meta.favicon}
                  alt=""
                  class="w-5 h-5 mt-0.5 object-contain shrink-0"
                  onError=${(e) => {
                    e.target.style.display = "none";
                  }}
                />
              `
            : ""}
          <div class="flex-1 min-w-0">
            <h2 class="text-base font-semibold text-white leading-snug">${problem.title}</h2>
            <div class="flex items-center gap-2 mt-1.5 flex-wrap">
              <span
                class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${diffClass}"
                >${problem.difficulty || "?"}</span
              >
              <span class="text-[10px] text-slate-500">${meta.label}</span>
              ${langName
                ? html`<span class="text-[10px] font-mono text-cyan-500/70">${langName}</span>`
                : ""}
              ${problem.timestamp
                ? html`<span class="text-[10px] text-slate-600"
                    >${new Date(
                      problem.timestamp < 1e12 ? problem.timestamp * 1000 : problem.timestamp,
                    ).toLocaleDateString()}</span
                  >`
                : ""}
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            ${onNavigate
              ? html`
                  <button
                    onClick=${() => {
                      onClose();
                      onNavigate("solutions");
                    }}
                    class="shrink-0 px-3 h-8 flex items-center justify-center rounded-lg text-[10px] font-medium text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                    title="Go to Solutions list"
                  >
                    Solutions
                  </button>
                  <button
                    onClick=${() => {
                      onClose();
                      onNavigate("analytics");
                    }}
                    class="shrink-0 px-3 h-8 flex items-center justify-center rounded-lg text-[10px] font-medium text-violet-300 bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 transition-colors"
                    title="Go to Analytics"
                  >
                    Analytics
                  </button>
                  <button
                    onClick=${() => {
                      onClose();
                      onNavigate("graph");
                    }}
                    class="shrink-0 px-3 h-8 flex items-center justify-center rounded-lg text-[10px] font-medium text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
                    title="Go to Knowledge Graph"
                  >
                    Graph
                  </button>
                `
              : onOpenGraphProblem
                ? html`
                    <button
                      onClick=${() => onOpenGraphProblem(problem)}
                      class="shrink-0 px-3 h-8 flex items-center justify-center rounded-lg text-[10px] font-medium text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
                      title="Open this problem in the graph"
                    >
                      Graph ↗
                    </button>
                  `
                : ""}
            ${httpUrl(problem.submissionsUrl) ||
            (problem.platform === "leetcode" && problem.titleSlug)
              ? html`
                  <a
                    href=${httpUrl(problem.submissionsUrl) ||
                    CONSTANTS.PLATFORMS.leetcode.problemsBase + problem.titleSlug + "/submissions/"}
                    target="_blank"
                    rel="noopener"
                    class="shrink-0 px-3 h-8 flex items-center justify-center rounded-lg text-[10px] font-medium text-amber-300 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                    title="View all submissions for this problem"
                    >Submissions ↗</a
                  >
                `
              : ""}
            ${canNavigate
              ? html`
                  <button
                    onClick=${() =>
                      onNavigateProblem?.(
                        problemList[(problemIndex - 1 + problemList.length) % problemList.length],
                      )}
                    class="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                    title="Previous problem"
                  >
                    ←
                  </button>
                  <button
                    onClick=${() =>
                      onNavigateProblem?.(problemList[(problemIndex + 1) % problemList.length])}
                    class="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                    title="Next problem"
                  >
                    →
                  </button>
                `
              : ""}
            ${!hideCloseButton
              ? html`
                  <button
                    onClick=${onClose}
                    class="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    ✕
                  </button>
                `
              : ""}
          </div>
        </div>

        <!-- ── Topics ── -->
        ${topics.length
          ? html`
              <div class="flex flex-wrap gap-1.5 px-5 pt-3 shrink-0">
                ${topics.map(
                  (t) => html`
                    <span
                      class=${`px-2 py-0.5 rounded-full text-[10px] border ${
                        t.kind === KIND.ALGO
                          ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-300"
                          : t.kind === KIND.DS
                            ? "bg-amber-500/10 border-amber-500/20 text-amber-300/90"
                            : "bg-white/5 border-white/10 text-slate-400"
                      }`}
                      title=${KIND_LABEL[t.kind] || ""}
                      >${t.topic}</span
                    >
                  `,
                )}
              </div>
            `
          : ""}

        <!-- ── Stats row ── -->
        ${problem.runtime || problem.memory || problem.acRate || problem.elapsedSeconds
          ? html`
              <div class="flex gap-6 px-5 pt-3 shrink-0">
                ${problem.runtime
                  ? html`
                      <div class="flex flex-col gap-0.5">
                        <span class="text-[9px] uppercase tracking-wider text-slate-600"
                          >Runtime</span
                        >
                        <span class="text-xs text-slate-300">
                          ${problem.runtime}
                          ${problem.runtimePct
                            ? html`<span class="text-cyan-500/60 text-[10px]">
                                · beats ${problem.runtimePct.toFixed(0)}%</span
                              >`
                            : ""}
                        </span>
                      </div>
                    `
                  : ""}
                ${problem.memory
                  ? html`
                      <div class="flex flex-col gap-0.5">
                        <span class="text-[9px] uppercase tracking-wider text-slate-600"
                          >Memory</span
                        >
                        <span class="text-xs text-slate-300">
                          ${problem.memory}
                          ${problem.memoryPct
                            ? html`<span class="text-cyan-500/60 text-[10px]">
                                · beats ${problem.memoryPct.toFixed(0)}%</span
                              >`
                            : ""}
                        </span>
                      </div>
                    `
                  : ""}
                ${problem.acRate
                  ? html`
                      <div class="flex flex-col gap-0.5">
                        <span class="text-[9px] uppercase tracking-wider text-slate-600"
                          >Accept Rate</span
                        >
                        <span class="text-xs text-slate-300"
                          >${typeof problem.acRate === "number"
                            ? problem.acRate.toFixed(1)
                            : problem.acRate}%</span
                        >
                      </div>
                    `
                  : ""}
                ${problem.elapsedSeconds
                  ? html`
                      <div class="flex flex-col gap-0.5">
                        <span class="text-[9px] uppercase tracking-wider text-slate-600"
                          >Solve Time</span
                        >
                        <span class="text-xs text-slate-300"
                          >${_fmtElapsed(problem.elapsedSeconds)}</span
                        >
                      </div>
                    `
                  : ""}
              </div>
            `
          : ""}

        <!-- ── Siblings (same problem, other language / platform) ── -->
        ${siblings.length
          ? html`
              <div class="flex items-center gap-2 px-5 pt-3 shrink-0 flex-wrap">
                <span class="text-[10px] uppercase tracking-wider text-slate-600 shrink-0"
                  >Also solved as</span
                >
                ${siblings.map((sib) => {
                  const sibMeta = PLATFORM_META[sib.platform] || {
                    label: sib.platform || "?",
                    favicon: null,
                  };
                  const sibLang = sib.lang?.name || sib.language || "?";
                  const isSamePlatform = sib.platform === problem.platform;
                  return html`
                    <button
                      onClick=${() => onNavigateProblem?.(sib)}
                      class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-colors"
                      title="Open ${sibMeta.label} / ${sibLang} solution"
                    >
                      ${sibMeta.favicon
                        ? html`<img
                            src=${sibMeta.favicon}
                            alt=""
                            class="w-3 h-3 object-contain"
                            onError=${(e) => {
                              e.target.style.display = "none";
                            }}
                          />`
                        : ""}
                      ${!isSamePlatform
                        ? html`<span class="text-slate-500">${sibMeta.label}</span>`
                        : ""}
                      <span class="font-mono text-cyan-400/80">${sibLang}</span>
                    </button>
                  `;
                })}
              </div>
            `
          : ""}

        <!-- ── Tabs ── -->
        ${tabs.length > 1
          ? html`
              <div class="flex gap-0.5 px-5 pt-3 border-b border-white/5 shrink-0">
                ${tabs.map(
                  (tab) => html`
                    <button
                      onClick=${() => {
                        _lastModalTab = tab.id;
                        setActiveTab(tab.id);
                      }}
                      class="px-3 py-1.5 text-xs rounded-t-lg transition-colors ${activeTab ===
                      tab.id
                        ? "bg-white/10 text-white border border-b-0 border-white/10"
                        : "text-slate-500 hover:text-slate-300"}"
                    >
                      ${tab.label}
                    </button>
                  `,
                )}
              </div>
            `
          : html`<div class="border-b border-white/5 shrink-0"></div>`}

        <!-- ── Tab content ── -->
        <div class="flex-1 overflow-y-auto p-5 min-h-0">
          ${activeTab === "methods"
            ? html`
                <div class="flex flex-col gap-4 h-full">
                  <!-- Navigation back to the problem code tab -->
                  <div class="flex items-center justify-between">
                    <button
                      onClick=${() => {
                        const codeTab = baseTabs[0]?.id || "code";
                        _lastModalTab = codeTab;
                        setActiveTab(codeTab);
                      }}
                      class="text-[10px] text-slate-500 hover:text-cyan-400 transition-colors flex items-center gap-1"
                    >
                      ← Problem Code
                    </button>
                    <span class="text-[10px] text-slate-600">
                      ${methods.length} approach${methods.length !== 1 ? "es" : ""}
                    </span>
                  </div>

                  ${methods.map(
                    (method, idx) => html`
                      <div
                        class="rounded-xl border overflow-hidden ${selectedMethodIdx === idx
                          ? "border-cyan-500/40"
                          : "border-white/10"} transition-colors"
                      >
                        <!-- Card header -->
                        <button
                          onClick=${() =>
                            setSelectedMethodIdx(idx === selectedMethodIdx ? -1 : idx)}
                          class="w-full text-left p-3 ${selectedMethodIdx === idx
                            ? "bg-cyan-500/8"
                            : "bg-white/[0.02] hover:bg-white/[0.04]"} transition-colors"
                        >
                          <div class="flex items-start justify-between">
                            <div class="flex-1 min-w-0">
                              <div class="flex items-center gap-2 mb-0.5">
                                <h4 class="font-semibold text-sm text-white">${method.title}</h4>
                                ${method.language
                                  ? html`<span class="text-[10px] font-mono text-cyan-400/80"
                                      >${method.language}</span
                                    >`
                                  : ""}
                              </div>
                              ${method.description
                                ? html`<p class="text-[10px] text-slate-400">
                                    ${method.description}
                                  </p>`
                                : ""}
                              <span class="text-[9px] text-slate-600">
                                ${method.timestamp
                                  ? new Date(method.timestamp).toLocaleDateString()
                                  : "No date"}
                              </span>
                            </div>
                            <div class="flex items-center gap-2 shrink-0 ml-3">
                              <span class="text-[10px] text-slate-600">
                                ${selectedMethodIdx === idx ? "▲" : "▼"}
                              </span>
                              <button
                                onClick=${(e) => {
                                  e.stopPropagation();
                                  handleDeleteMethod(idx);
                                }}
                                class="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </button>

                        <!-- Expanded: code view -->
                        ${selectedMethodIdx === idx
                          ? html`
                              <div class="border-t border-white/5">
                                ${method.code
                                  ? html`<pre
                                      class="text-[11px] leading-relaxed overflow-x-auto bg-black/40 py-3 whitespace-pre font-mono m-0 max-h-72"
                                      dangerouslySetInnerHTML=${{
                                        // Safe: highlightCodeWithLines() runs escHtml() on all user input
                                        // before adding its own controlled <span style="..."> tags.
                                        __html: highlightCodeWithLines(
                                          method.code,
                                          (method.language || "").toLowerCase(),
                                        ),
                                      }}
                                    ></pre>`
                                  : html`<p class="px-4 py-3 text-[11px] text-slate-600">
                                      No code saved for this approach.
                                    </p>`}
                                ${method.aiReview
                                  ? html`<div class="px-4 py-3 border-t border-white/5">
                                      <p
                                        class="text-[9px] uppercase tracking-wider text-slate-600 mb-1.5"
                                      >
                                        AI Review
                                      </p>
                                      <p class="text-[11px] text-slate-400 leading-relaxed">
                                        ${method.aiReview.slice(0, 300)}${method.aiReview.length >
                                        300
                                          ? "…"
                                          : ""}
                                      </p>
                                    </div>`
                                  : ""}
                              </div>
                            `
                          : ""}
                      </div>
                    `,
                  )}
                  <button
                    onClick=${() => setShowAddMethod(true)}
                    class="mt-2 px-3 py-2 rounded-lg text-sm bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
                  >
                    + Add Method
                  </button>
                  ${showAddMethod
                    ? html`
                        <div class="border border-white/10 rounded-lg p-3 bg-white/5">
                          <label
                            class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block mb-1"
                          >
                            Method Title
                          </label>
                          <input
                            type="text"
                            value=${newMethodTitle}
                            onInput=${(e) => setNewMethodTitle(e.target.value)}
                            placeholder="e.g., Recursive Approach"
                            class="w-full p-2 rounded text-sm bg-white/5 border border-white/10 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 mb-3"
                          />
                          <label
                            class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block mb-1"
                          >
                            Description (Optional)
                          </label>
                          <textarea
                            value=${newMethodDesc}
                            onInput=${(e) => setNewMethodDesc(e.target.value)}
                            placeholder="Brief description of this approach..."
                            class="w-full h-16 p-2 rounded text-sm bg-white/5 border border-white/10 text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-cyan-500/50 mb-3"
                          />
                          <div class="flex gap-2">
                            <button
                              onClick=${handleAddMethod}
                              class="flex-1 px-3 py-2 rounded text-xs font-semibold bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/40 transition-colors"
                            >
                              Create Method
                            </button>
                            <button
                              onClick=${() => {
                                setShowAddMethod(false);
                                setNewMethodTitle("");
                                setNewMethodDesc("");
                              }}
                              class="px-3 py-2 rounded text-xs text-slate-400 hover:text-slate-200 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      `
                    : ""}
                </div>
              `
            : activeTab === "notes"
              ? html`
                  <div class="flex flex-col gap-3 h-full">
                    <div>
                      <label
                        class="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block mb-2"
                      >
                        Problem Notes
                      </label>
                      <textarea
                        value=${notes}
                        onInput=${(e) => handleNotesChange(e.target.value)}
                        placeholder="Add notes, observations, or follow-up items..."
                        class="w-full h-64 p-3 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 font-mono"
                      />
                    </div>
                    <div class="text-[10px] text-slate-600">
                      Notes are saved automatically to your problem record.
                    </div>
                  </div>
                `
              : (() => {
                  const renderer = modalTabRegistry.getRenderer(
                    problem.platform || "leetcode",
                    activeTab,
                  );
                  if (!renderer) return html`<p class="text-slate-500 text-sm">No content.</p>`;
                  const onClearChat = async () => {
                    setChatMessages([]);
                    setChatError("");
                    if (chatId) {
                      await updateAIChat(chatId, [], {
                        problemTitle: problem.title || "",
                        problemTags: Array.isArray(problem.tags) ? problem.tags : [],
                        attachedProblemSlugs: problem.titleSlug ? [problem.titleSlug] : [],
                        attachedProblems: problem.titleSlug
                          ? [
                              {
                                slug: problem.titleSlug,
                                title: problem.title || problem.titleSlug,
                                platform: problem.platform || "leetcode",
                                url: problemUrl,
                              },
                            ]
                          : [],
                        surface: "problem-modal",
                        requestType: "",
                        usedCommands: [],
                        requestTemplate: "",
                      }).catch(() => {});
                    }
                  };
                  const ctx = {
                    html,
                    isExtension,
                    onClose,
                    onUpdate,
                    onDelete,
                    refreshing,
                    handleRefreshData,
                    problemUrl,
                    meta,
                    langName,
                    copied,
                    copyCode,
                    chatMessages,
                    chatInput,
                    setChatInput,
                    sendChat,
                    chatPending,
                    chatError,
                    AIMarkdownRenderer,
                    MultiLineAIChatInput,
                    ModelStatusBar,
                    openAIChatsView,
                    onClearChat,
                    chatId,
                    AIReviewPanel,
                    onGenerateAIReview: handleGenerateAIReview,
                    reviewBusy,
                    reviewError,
                    queueStatus,
                    queueError: queueStatusError,
                    onRunQueueNow: handleRunAIReviewQueueNow,
                    runQueueBusy: queueActionBusy,
                    onRemoveFromQueue: handleRemoveFromQueue,
                    removeFromQueueBusy,
                    settings,
                    problemList,
                    onNavigateProblem,
                  };
                  return renderer(problem, ctx);
                })()}
        </div>

        <!-- ── Footer ── -->
        <div class="border-t border-white/5 px-5 py-3 flex items-center justify-between shrink-0">
          <a
            href=${problemUrl}
            target="_blank"
            rel="noopener"
            class="flex items-center gap-2 text-xs text-cyan-400 hover:text-cyan-300 transition-colors no-underline"
          >
            ${meta.favicon
              ? html`<img
                  src=${meta.favicon}
                  class="w-3.5 h-3.5 object-contain"
                  alt=""
                  onError=${(e) => {
                    e.target.style.display = "none";
                  }}
                />`
              : ""}
            Open on ${meta.label} ↗
          </a>
          <span class="text-[10px] text-slate-700 font-mono">${problem.titleSlug || ""}</span>
        </div>
      </div>
    </div>
  `;
}

// ── CodeTab sub-component — shows code or a recovery button when code is missing ──

function CodeTab({ problem, langName, copied, copyCode, onUpdate }) {
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");

  if (!problem.code) {
    const isExtensionCtx = typeof chrome !== "undefined" && !!chrome.runtime?.id;
    const isGFG = problem.platform === "geeksforgeeks";
    const platformName = isGFG ? "GeeksForGeeks" : "LeetCode";
    const loginUrl = isGFG ? "https://www.geeksforgeeks.org" : "https://leetcode.com";
    return html`
      <div class="flex flex-col items-center gap-4 py-12 text-center">
        <p class="text-slate-500 text-sm">Code was not extracted for this submission.</p>
        ${isExtensionCtx
          ? html`
              <button
                onClick=${async () => {
                  setRecovering(true);
                  setRecoveryError("");
                  try {
                    const res = await new Promise((resolve) =>
                      chrome.runtime.sendMessage(
                        {
                          type: "TRIGGER_CODE_RECOVERY",
                          problemId: problem.id,
                        },
                        resolve,
                      ),
                    );
                    if (res?.ok && res.code) {
                      const updated = await Storage.getProblem(problem.id);
                      if (updated) onUpdate(updated);
                    } else {
                      setRecoveryError(res?.error || "Recovery failed — no code returned");
                    }
                  } catch (e) {
                    setRecoveryError(e?.message || "Recovery failed");
                  } finally {
                    setRecovering(false);
                  }
                }}
                disabled=${recovering}
                class="px-4 py-2 rounded-lg bg-cyan-600/15 border border-cyan-500/30 text-cyan-300 text-xs hover:bg-cyan-600/30 disabled:opacity-40 transition-colors"
              >
                ${recovering ? "Recovering code…" : `Recover Code from ${platformName}`}
              </button>
              ${recoveryError
                ? html`
                    <p class="text-rose-400 text-xs max-w-xs">${recoveryError}</p>
                    <div class="flex flex-col gap-1.5 mt-1">
                      <a
                        href=${loginUrl}
                        target="_blank"
                        rel="noopener"
                        class="text-[10px] text-cyan-500 hover:text-cyan-300 underline"
                      >
                        Open ${platformName} to log in, then retry
                      </a>
                      ${isGFG
                        ? html`
                            <a
                              href=${`https://www.geeksforgeeks.org/search/?q=${encodeURIComponent(problem.title)}`}
                              target="_blank"
                              rel="noopener"
                              class="text-[10px] text-cyan-500 hover:text-cyan-300 underline"
                            >
                              Search GFG for "${problem.title}" to find the new link
                            </a>
                          `
                        : ""}
                    </div>
                  `
                : ""}
              <p class="text-slate-600 text-[10px] max-w-xs">
                Opens a background ${platformName} tab to fetch your latest accepted submission.
                Make sure you are logged into ${platformName} first.
              </p>
            `
          : html`<p class="text-slate-600 text-xs">
              Open this problem in the extension to recover the code.
            </p>`}
      </div>
    `;
  }

  const rawLang = problem.lang?.slug || problem.lang?.name || problem.language || "";
  const highlighted = highlightCodeWithLines(problem.code, rawLang);
  return html`<div class="flex flex-col gap-1.5">
    <div
      class="flex items-center justify-between px-3 py-2 bg-[#0d0d14] border border-white/5 rounded-t-xl border-b-0"
    >
      <div class="flex items-center gap-2">
        <span
          class="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono uppercase tracking-wider"
        >
          ${langName || "code"}
        </span>
      </div>
      <button
        onClick=${copyCode}
        class="text-[10px] px-2.5 py-1 rounded bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
      >
        ${copied ? "✓ Copied" : "Copy"}
      </button>
    </div>
    <div
      class="overflow-x-auto bg-[#060609] rounded-b-xl border border-white/5 border-t-0"
      style="font-size:13px;line-height:1.65;"
    >
      <pre
        class="font-mono m-0 py-3"
        style="white-space:pre;"
        dangerouslySetInnerHTML=${{ __html: highlighted }}
      ></pre>
    </div>
  </div>`;
}

// ── EditTab sub-component — manages its own edit/delete state ───────────────

/** Problem timestamps are stored in seconds by some handlers and ms by others. */
function _tsToMs(t) {
  return t && t < 1e12 ? t * 1000 : t || 0;
}

/** Local-time value for a datetime-local input ("" when no timestamp). */
function _tsToLocalInput(t) {
  const ms = _tsToMs(t);
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Ask the service worker a question; resolves null outside the extension. */
function _sendMessage(msg) {
  return new Promise((resolve) => {
    if (!window.chrome?.runtime?.sendMessage) return resolve(null);
    try {
      chrome.runtime.sendMessage(msg, (res) => resolve(res || null));
    } catch (_) {
      resolve(null);
    }
  });
}

/** Slug from a pasted problem URL, or the input unchanged when it isn't one. */
function _slugFromPaste(value) {
  if (!/:\/\//.test(value)) return value;
  const m = value.match(/\/problems\/([^/?#]+)/i);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch (_) {
      return m[1];
    }
  }
  return value;
}

function EditTab({ problem, onUpdate, onDelete, onClose }) {
  const tagsOf = (p) => {
    const fromProblem = Array.isArray(p.tags) ? p.tags : [];
    const fallbackTopic = p.topic && p.topic !== "Untagged" ? [p.topic] : [];
    return [
      ...new Set(
        [...fromProblem, ...fallbackTopic].map((t) => String(t || "").trim()).filter(Boolean),
      ),
    ];
  };

  const [title, setTitle] = useState(problem.title || "");
  const [difficulty, setDifficulty] = useState(problem.difficulty || "Unknown");
  const [tagList, setTagList] = useState(tagsOf(problem));
  const [tagDraft, setTagDraft] = useState("");
  const [slug, setSlug] = useState(problem.titleSlug || "");
  const [solvedAt, setSolvedAt] = useState(_tsToLocalInput(problem.timestamp));
  const [elapsed, setElapsed] = useState(
    problem.elapsedSeconds > 0 ? String(problem.elapsedSeconds) : "",
  );
  const [langName, setLangName] = useState(problem.lang?.name || "");
  const [langExt, setLangExt] = useState(problem.lang?.ext || "");
  const [runtime, setRuntime] = useState(problem.runtime || "");
  const [memory, setMemory] = useState(problem.memory || "");
  const [runtimePct, setRuntimePct] = useState(
    Number.isFinite(problem.runtimePct) ? String(problem.runtimePct) : "",
  );
  const [memoryPct, setMemoryPct] = useState(
    Number.isFinite(problem.memoryPct) ? String(problem.memoryPct) : "",
  );
  const [acRate, setAcRate] = useState(
    problem.acRate != null && problem.acRate !== "" ? String(problem.acRate) : "",
  );
  const [code, setCode] = useState(problem.code || "");
  const [statement, setStatement] = useState(problem.problemStatement || "");
  const [notes, setNotes] = useState(problem.notes || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [linkChecking, setLinkChecking] = useState(false);
  const [linkCheck, setLinkCheck] = useState(null);

  useEffect(() => {
    setTitle(problem.title || "");
    setDifficulty(problem.difficulty || "Unknown");
    setTagList(tagsOf(problem));
    setTagDraft("");
    setSlug(problem.titleSlug || "");
    setSolvedAt(_tsToLocalInput(problem.timestamp));
    setElapsed(problem.elapsedSeconds > 0 ? String(problem.elapsedSeconds) : "");
    setLangName(problem.lang?.name || "");
    setLangExt(problem.lang?.ext || "");
    setRuntime(problem.runtime || "");
    setMemory(problem.memory || "");
    setRuntimePct(Number.isFinite(problem.runtimePct) ? String(problem.runtimePct) : "");
    setMemoryPct(Number.isFinite(problem.memoryPct) ? String(problem.memoryPct) : "");
    setAcRate(problem.acRate != null && problem.acRate !== "" ? String(problem.acRate) : "");
    setCode(problem.code || "");
    setStatement(problem.problemStatement || "");
    setNotes(problem.notes || "");
    setError("");
    setSaved(false);
    setConfirmDelete(false);
    setDeleting(false);
    setLinkChecking(false);
    setLinkCheck(null);
  }, [problem?.id, problem?.titleSlug]);

  const addTagsFromDraft = () => {
    const incoming = tagDraft
      .split(",")
      .map((t) => String(t || "").trim())
      .filter(Boolean);
    if (!incoming.length) return;
    setTagList((prev) => {
      const seen = new Set(prev.map((t) => t.toLowerCase()));
      const merged = [...prev];
      incoming.forEach((tag) => {
        const key = tag.toLowerCase();
        if (!seen.has(key)) {
          merged.push(tag);
          seen.add(key);
        }
      });
      return merged;
    });
    setTagDraft("");
  };

  const removeTag = (tagToRemove) => {
    setTagList((prev) => prev.filter((tag) => tag !== tagToRemove));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const newTags = [...new Set(tagList.map((t) => String(t || "").trim()).filter(Boolean))];
      const updated = {
        ...problem,
        title: title.trim() || problem.title,
        difficulty,
        tags: newTags,
        topic: newTags[0] || problem.topic || "Untagged",
        notes: notes.trim(),
        code,
        problemStatement: statement,
        manuallyEdited: true,
      };

      const newSlug = slug.trim();
      if (newSlug && newSlug !== problem.titleSlug) {
        updated.titleSlug = newSlug;
        // A hand-edited link supersedes any earlier verification verdict.
        delete updated.urlBroken;
        delete updated.urlBrokenAt;
        delete updated.urlVerifiedAt;
      }

      if (solvedAt) {
        const ms = new Date(solvedAt).getTime();
        if (Number.isFinite(ms)) {
          // Preserve the record's storage unit — some handlers store seconds.
          updated.timestamp =
            problem.timestamp && problem.timestamp < 1e12 ? Math.round(ms / 1000) : ms;
        }
      }

      const elapsedNum = parseInt(elapsed, 10);
      updated.elapsedSeconds = Number.isFinite(elapsedNum) && elapsedNum > 0 ? elapsedNum : 0;

      const newLangName = langName.trim();
      const newLangExt = langExt.trim().replace(/^\./, "");
      if (newLangName || newLangExt) {
        updated.lang = {
          ...(problem.lang || {}),
          name: newLangName || problem.lang?.name || "",
          ext: newLangExt || problem.lang?.ext || "",
        };
      }

      const setOrDrop = (key, value) => {
        const v = String(value).trim();
        if (v) updated[key] = v;
        else delete updated[key];
      };
      setOrDrop("runtime", runtime);
      setOrDrop("memory", memory);
      const numOrDrop = (key, value) => {
        const v = parseFloat(value);
        if (Number.isFinite(v)) updated[key] = v;
        else delete updated[key];
      };
      numOrDrop("runtimePct", runtimePct);
      numOrDrop("memoryPct", memoryPct);
      numOrDrop("acRate", acRate);

      await Storage.saveProblem(updated);
      const pendingKey = getProblemCommitKey(updated);
      if (pendingKey) await Storage.markPendingProblemKey(pendingKey).catch(() => {});
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onUpdate?.(updated);
    } catch (e) {
      setError("Save failed: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await Storage.deleteProblem(problem.id);
      onDelete?.(problem.id);
      onClose?.();
    } catch (e) {
      setError("Delete failed: " + (e.message || e));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const platformMeta = PLATFORM_META[problem.platform];
  let previewUrl = "";
  try {
    previewUrl = platformMeta && slug.trim() ? platformMeta.url(slug.trim()) : "";
  } catch (_) {
    previewUrl = "";
  }

  const runLinkCheck = async () => {
    const input = slug.trim();
    if (!input || linkChecking) return;
    setLinkChecking(true);
    setLinkCheck(null);
    const res = await _sendMessage({
      type: "LINK_CHECK",
      platform: problem.platform,
      url: input,
    });
    setLinkChecking(false);
    setLinkCheck(res?.ok ? res.status : "error");
  };

  const platformName = platformMeta?.label || problem.platform || "the platform";
  const linkCheckLabel = {
    ok: html`<span class="text-emerald-400">✓ verified on ${platformName}</span>`,
    notfound: html`<span class="text-rose-400/90">not found on ${platformName}</span>`,
    invalid: html`<span class="text-rose-400/90"
      >that doesn't look like a ${platformName} problem link</span
    >`,
    error: html`<span class="text-slate-400">couldn't check — try again</span>`,
    unverified: html`<span class="text-amber-400/90"
      >${platformName} can't be auto-checked — open the link to confirm</span
    >`,
  }[linkCheck];

  return html` <div class="flex flex-col gap-5">
    <p class="text-[11px] text-slate-500">
      Every field of this record is editable — metadata, link, code and statement. Changes save to
      your local database, and the record is queued for your next GitHub sync.
    </p>

    <div class="flex flex-col gap-1.5">
      <label class="text-[11px] uppercase tracking-wider text-slate-500">Title</label>
      <input
        type="text"
        value=${title}
        onInput=${(e) => setTitle(e.target.value)}
        class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
      />
    </div>

    <div class="flex flex-col gap-1.5">
      <label class="text-[11px] uppercase tracking-wider text-slate-500">Difficulty</label>
      <select
        value=${difficulty}
        onChange=${(e) => setDifficulty(e.target.value)}
        class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
      >
        ${["Easy", "Medium", "Hard", "Unknown"].map((d) => html`<option value=${d}>${d}</option>`)}
      </select>
    </div>

    <div class="flex flex-col gap-1.5">
      <label class="text-[11px] uppercase tracking-wider text-slate-500">Tag Editor</label>
      <div
        class="flex flex-wrap gap-1.5 p-2 bg-black border border-white/10 rounded-lg min-h-[44px]"
      >
        ${tagList.length
          ? tagList.map(
              (tag) => html`
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-cyan-500/10 border border-cyan-500/25 text-cyan-300"
                >
                  ${tag}
                  <button
                    onClick=${() => removeTag(tag)}
                    class="text-cyan-200/80 hover:text-white leading-none"
                    title="Remove tag"
                  >
                    ✕
                  </button>
                </span>
              `,
            )
          : html`<span class="text-[11px] text-slate-600">No tags yet</span>`}
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value=${tagDraft}
          onInput=${(e) => setTagDraft(e.target.value)}
          onKeyDown=${(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTagsFromDraft();
            }
          }}
          placeholder="Add tags (comma-separated or Enter)"
          class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 min-w-[250px]"
        />
        <button
          onClick=${addTagsFromDraft}
          class="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs rounded-lg transition-colors"
        >
          Add
        </button>
      </div>
      <p class="text-[10px] text-slate-600">
        First tag becomes the primary topic used in analytics and the graph.
      </p>
    </div>

    <!-- Problem link -->
    <div class="flex flex-col gap-1.5">
      <label class="text-[11px] uppercase tracking-wider text-slate-500">Problem link (slug)</label>
      <div class="flex items-center gap-2">
        <input
          type="text"
          value=${slug}
          onInput=${(e) => {
            setSlug(_slugFromPaste(e.target.value));
            setLinkCheck(null);
          }}
          placeholder="problem-slug — or paste the full problem URL"
          class="flex-1 min-w-0 px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 font-mono"
        />
        <button
          onClick=${runLinkCheck}
          disabled=${!slug.trim() || linkChecking}
          class="shrink-0 px-3 py-2 text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/10 disabled:opacity-50 rounded-lg transition-colors"
        >
          ${linkChecking ? "Checking…" : "Check link"}
        </button>
      </div>
      ${linkCheckLabel ? html`<p class="text-[11px]">${linkCheckLabel}</p>` : ""}
      ${previewUrl
        ? html`<p class="text-[10px] text-slate-600 break-all">
            Opens as:${" "}
            <a
              href=${previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="text-cyan-500/80 hover:text-cyan-400"
              >${previewUrl}</a
            >
          </p>`
        : ""}
      <p class="text-[10px] text-slate-600">
        Pasting a full URL extracts the slug automatically. Changing it clears any earlier
        link-verification result for this record.
      </p>
    </div>

    <!-- Solve details -->
    <div class="flex flex-col gap-1.5">
      <label class="text-[11px] uppercase tracking-wider text-slate-500">Solve details</label>
      <div class="grid grid-cols-2 gap-2 text-xs mb-1">
        <div class="bg-white/3 rounded p-2">
          <span class="text-slate-500 text-[10px]">Platform</span>
          <p class="text-slate-300 mt-0.5">${problem.platform || "—"}</p>
        </div>
        <div class="bg-white/3 rounded p-2 min-w-0">
          <span class="text-slate-500 text-[10px]">Record ID (fixed — keys the repo path)</span>
          <p class="text-slate-300 mt-0.5 font-mono truncate" title=${problem.id}>
            ${problem.id || "—"}
          </p>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="flex flex-col gap-1">
          <span class="text-[10px] text-slate-500">Solved at</span>
          <input
            type="datetime-local"
            value=${solvedAt}
            onInput=${(e) => setSolvedAt(e.target.value)}
            class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-[10px] text-slate-500">Time spent (seconds)</span>
          <input
            type="number"
            min="0"
            value=${elapsed}
            onInput=${(e) => setElapsed(e.target.value)}
            placeholder="0"
            class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-[10px] text-slate-500">Language</span>
          <input
            type="text"
            value=${langName}
            onInput=${(e) => setLangName(e.target.value)}
            placeholder="Python"
            class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-[10px] text-slate-500">File extension</span>
          <input
            type="text"
            value=${langExt}
            onInput=${(e) => setLangExt(e.target.value)}
            placeholder="py"
            class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 font-mono"
          />
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-[10px] text-slate-500">Runtime</span>
          <input
            type="text"
            value=${runtime}
            onInput=${(e) => setRuntime(e.target.value)}
            placeholder="52 ms"
            class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-[10px] text-slate-500">Memory</span>
          <input
            type="text"
            value=${memory}
            onInput=${(e) => setMemory(e.target.value)}
            placeholder="16.4 MB"
            class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-[10px] text-slate-500">Runtime beats (%)</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value=${runtimePct}
            onInput=${(e) => setRuntimePct(e.target.value)}
            placeholder="—"
            class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-[10px] text-slate-500">Memory beats (%)</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value=${memoryPct}
            onInput=${(e) => setMemoryPct(e.target.value)}
            placeholder="—"
            class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-[10px] text-slate-500">Acceptance rate (%)</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value=${acRate}
            onInput=${(e) => setAcRate(e.target.value)}
            placeholder="—"
            class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>
      <p class="text-[10px] text-slate-600">
        The file extension names the committed file — change it only if the language is wrong. Blank
        runtime/memory/percent fields are removed from the record.
      </p>
    </div>

    <!-- Code -->
    <div class="flex flex-col gap-1.5">
      <label class="text-[11px] uppercase tracking-wider text-slate-500">Solution code</label>
      <textarea
        value=${code}
        onInput=${(e) => setCode(e.target.value)}
        rows="12"
        spellcheck="false"
        placeholder="// paste or edit the committed solution"
        class="px-3 py-2 bg-black border border-white/10 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 resize-y font-mono whitespace-pre"
      ></textarea>
      ${Array.isArray(problem.methods) && problem.methods.length > 1
        ? html`<p class="text-[10px] text-slate-600">
            This record has ${problem.methods.length} solution methods — this edits the primary code
            committed to GitHub; the Code tab shows every method.
          </p>`
        : ""}
    </div>

    <!-- Problem statement -->
    <div class="flex flex-col gap-1.5">
      <label class="text-[11px] uppercase tracking-wider text-slate-500">Problem statement</label>
      <textarea
        value=${statement}
        onInput=${(e) => setStatement(e.target.value)}
        rows="8"
        placeholder="The problem description shown on the Problem tab and in the committed README. HTML from the platform is kept and sanitised on display."
        class="px-3 py-2 bg-black border border-white/10 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 resize-y font-mono"
      ></textarea>
    </div>

    <div class="flex flex-col gap-1.5">
      <label class="text-[11px] uppercase tracking-wider text-slate-500">Notes</label>
      <textarea
        value=${notes}
        onInput=${(e) => setNotes(e.target.value)}
        rows="4"
        placeholder="Personal notes, approach, key insights…"
        class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 resize-y font-sans"
      ></textarea>
    </div>

    <div class="flex items-center justify-between mt-1">
      <div>
        ${saved ? html`<span class="text-xs text-emerald-400">✓ Saved successfully</span>` : ""}
        ${error ? html`<span class="text-xs text-rose-400">${error}</span>` : ""}
      </div>
      <button
        onClick=${save}
        disabled=${saving}
        class="px-4 py-2 bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/30 text-cyan-300 text-xs rounded-lg transition-colors disabled:opacity-40"
      >
        ${saving ? "Saving…" : "Save changes"}
      </button>
    </div>

    <div class="border-t border-white/5 pt-4 mt-2">
      <p class="text-[10px] text-slate-600 mb-2">
        Danger zone — this removes the problem from your local database permanently.
      </p>
      ${confirmDelete
        ? html`
            <div class="flex items-center gap-2">
              <span class="text-xs text-rose-400">Are you sure?</span>
              <button
                onClick=${doDelete}
                disabled=${deleting}
                class="px-3 py-1.5 bg-rose-600/40 hover:bg-rose-600/60 border border-rose-500/30 text-rose-300 text-xs rounded-lg transition-colors disabled:opacity-40"
              >
                ${deleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                onClick=${() => setConfirmDelete(false)}
                class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 text-xs rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          `
        : html`
            <button
              onClick=${() => setConfirmDelete(true)}
              class="px-3 py-1.5 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/20 text-rose-400 text-xs rounded-lg transition-colors"
            >
              Delete problem
            </button>
          `}
    </div>
  </div>`;
}

// ── Global tabs (Code, AI Review, Notes, Edit) registered for all platforms ──
// Platform-specific registrations (e.g. leetcode) override these by tab id.

modalTabRegistry.register("*", [
  {
    id: "code",
    label: "Code",
    show: (p) => p && (!!p.code || p.platform === "leetcode" || p.platform === "geeksforgeeks"),
    render(problem, { html, langName, copied, copyCode, onUpdate }) {
      return html`<${CodeTab}
        problem=${problem}
        langName=${langName}
        copied=${copied}
        copyCode=${copyCode}
        onUpdate=${onUpdate}
      />`;
    },
  },
  {
    id: "review",
    label: "AI Review",
    show: () => true,
    render(
      problem,
      {
        html,
        AIReviewPanel,
        onGenerateAIReview,
        reviewBusy,
        reviewError,
        onRemoveFromQueue,
        removeFromQueueBusy,
        queueStatus,
        queueError,
        onRunQueueNow,
        runQueueBusy,
      },
    ) {
      if (!problem.code) {
        return html`
          <div
            class="p-6 bg-[#0a0a0f] rounded-2xl border border-white/5 flex flex-col items-center justify-center text-center gap-4"
          >
            <p class="text-sm text-slate-400">
              No code is saved for this problem. You must recover/import your solution code before
              running an AI review.
            </p>
            <p class="text-xs text-slate-500">
              Go to the <strong>Code</strong> tab to fetch your solution from the platform.
            </p>
          </div>
        `;
      }
      return html`<${AIReviewPanel}
        review=${problem.aiReview || ""}
        onGenerate=${onGenerateAIReview}
        loading=${reviewBusy}
        error=${reviewError}
        queueStatus=${queueStatus}
        queueError=${queueError}
        onRunQueueNow=${onRunQueueNow}
        runQueueBusy=${runQueueBusy}
        onRemoveFromQueue=${onRemoveFromQueue}
        removeFromQueueBusy=${removeFromQueueBusy}
        providerId=${problem._aiProvider}
        modelId=${problem._aiModel}
      />`;
    },
  },
  {
    id: "edit",
    label: "Edit",
    render(problem, { html, onUpdate, onDelete, onClose }) {
      return html`<${EditTab}
        problem=${problem}
        onUpdate=${onUpdate}
        onDelete=${onDelete}
        onClose=${onClose}
      />`;
    },
  },
]);
