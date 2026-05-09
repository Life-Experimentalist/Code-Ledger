/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect, useCallback } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";
import { cleanCode } from "../../lib/syntax-highlight.js";
import { getChatsByProblem, saveAIChat, updateAIChat } from "../../core/ai-chat-storage.js";
import { buildAIChatContext } from "../../lib/ai-chat-context.js";
import { MultiLineAIChatInput } from "../../ui/components/MultiLineAIChatInput.js";
import { AIMarkdownRenderer } from "../../ui/components/AIMarkdownRenderer.js";
import { ModelStatusBar } from "../../ui/components/ModelStatusBar.js";
import { modalTabRegistry } from "../../core/modal-tab-registry.js";
import { expandChatVariables } from "../../lib/chat-variables.js";
// Side-effect: registers LeetCode tabs into modalTabRegistry
import "../../handlers/platforms/leetcode/modal-tabs.js";

function renderMarkdown(md) {
  if (!md) return "";
  let html = String(md)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // fenced code blocks
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
      `<pre class="my-3 p-3 bg-black/60 rounded-lg border border-white/10 overflow-x-auto text-xs font-mono text-slate-200 leading-relaxed">${code.trimEnd()}</pre>`)
    // inline code
    .replace(/`([^`\n]+)`/g, '<code class="px-1 py-0.5 rounded bg-white/10 text-cyan-300 text-[0.85em] font-mono">$1</code>')
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    // italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // headings
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-white mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold text-slate-100 mt-4 mb-1 uppercase tracking-wide">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-base font-bold text-white mt-4 mb-2">$1</h1>')
    // unordered lists: accumulate items into <ul>
    .replace(/((?:^[*\-] .+\n?)+)/gm, (block) => {
      const items = block.trim().split("\n")
        .map(l => `<li class="ml-4 list-disc">${l.replace(/^[*\-] /, "").trim()}</li>`)
        .join("");
      return `<ul class="my-2 space-y-0.5 text-slate-300">${items}</ul>`;
    })
    // ordered lists
    .replace(/((?:^\d+\. .+\n?)+)/gm, (block) => {
      const items = block.trim().split("\n")
        .map(l => `<li class="ml-4 list-decimal">${l.replace(/^\d+\. /, "").trim()}</li>`)
        .join("");
      return `<ol class="my-2 space-y-0.5 text-slate-300">${items}</ol>`;
    })
    // horizontal rule
    .replace(/^---+$/gm, '<hr class="my-3 border-white/10"/>')
    // paragraphs: wrap consecutive non-empty lines not already in a block tag
    .replace(/^(?!<[houpl]|<hr|<pre)(.+)$/gm, '<p class="mb-1">$1</p>');
  return html;
}

export const PLATFORM_META = {
  leetcode: {
    favicon: "https://assets.leetcode.com/static_assets/public/icons/favicon.ico",
    label: "LeetCode",
    color: "#FFA116",
    url: (slug) => `https://leetcode.com/problems/${slug}/`,
  },
  geeksforgeeks: {
    favicon: "https://www.geeksforgeeks.org/favicon.ico",
    label: "GeeksForGeeks",
    color: "#2F8D46",
    url: (slug) => `https://practice.geeksforgeeks.org/problems/${slug}`,
  },
  codeforces: {
    favicon: "https://codeforces.com/favicon.ico",
    label: "Codeforces",
    color: "#1F8ACB",
    url: (slug) => `https://codeforces.com/problemset/problem/${slug}`,
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

const CHAT_KEY = (slug) => `cl-chat-${slug}`;

export function ProblemModal({ problem, onClose, onUpdate, onDelete, problemList = [], onNavigateProblem, onOpenGraphProblem, onNavigate }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [copied, setCopied] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatPending, setChatPending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatId, setChatId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState({});

  useEffect(() => {
    Storage.getSettings().then(setSettings).catch(() => {});
  }, []);

  // Reset tab and load chat history when problem changes
  useEffect(() => {
    setActiveTab("overview");
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
          .catch(() => { });
      }
    }
  }, [problem?.titleSlug, problem?.id]);

  // Escape to close
  useEffect(() => {
    if (!problem) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [problem, onClose]);

  // Arrow key navigation (← prev, → next)
  useEffect(() => {
    if (!problem || !canNavigate) return;
    const onKey = (e) => {
      if (e.key === "ArrowLeft")  { e.preventDefault(); onNavigateProblem?.(problemList[(problemIndex - 1 + problemList.length) % problemList.length]); }
      if (e.key === "ArrowRight") { e.preventDefault(); onNavigateProblem?.(problemList[(problemIndex + 1) % problemList.length]); }
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

  const topics = (Array.isArray(problem.tags) && problem.tags.length > 0
    ? problem.tags
    : problem.topic ? [problem.topic] : []
  ).filter(t => t && t !== "Untagged");
  const diffClass = DIFF_CLASS[problem.difficulty] || "bg-white/5 text-slate-400 border-white/10";
  const langName = problem.lang?.name || problem.language || null;

  const copyCode = async () => {
    if (!problem.code) return;
    try {
      await navigator.clipboard.writeText(cleanCode(problem.code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) { }
  };

  const isExtension = typeof chrome !== "undefined" && !!chrome.runtime?.id;
  const problemIndex = problemList.findIndex((entry) => (entry?.id || entry?.titleSlug) === (problem?.id || problem?.titleSlug));
  const canNavigate = problemList.length > 1 && problemIndex >= 0;

  // Siblings: same problem solved in a different language or on a different platform
  const siblings = problemList.filter((p) => {
    if (!p || p.id === problem.id) return false;
    const sameSlug = p.titleSlug && p.titleSlug === problem.titleSlug;
    const sameCanonical = p.canonical?.id && p.canonical.id === problem.canonical?.id;
    return sameSlug || sameCanonical;
  });

  // Handle refresh of problem statement from handler
  const handleRefreshData = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const id = encodeURIComponent(problem.titleSlug || problem.id || "");
      const url = `${problemUrl}${problemUrl.includes("?") ? "&" : "?"}codeledger_fetch=1&cl_fetch_id=${id}`;
      window.open(url, "_blank", "noopener,noreferrer,width=800,height=600");

      let fetched = false;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          const updated = await Storage.getProblem(problem.id || problem.titleSlug);
          if (updated?.problemStatement && updated.problemStatement !== problem.problemStatement) {
            onUpdate?.(updated);
            fetched = true;
            break;
          }
        } catch (_) { }
      }
      if (!fetched) {
        setChatError("Refresh timeout. Check the opened tab and try again.");
        setTimeout(() => setChatError(""), 5000);
      }
    } catch (e) {
      setChatError("Refresh failed: " + (e.message || e));
      setTimeout(() => setChatError(""), 5000);
    } finally {
      setRefreshing(false);
    }
  }, [problem, refreshing, onUpdate, problemUrl]);

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
        attachedProblems: problem.titleSlug ? [{
          slug: problem.titleSlug,
          title: problem.title || problem.titleSlug,
          platform: problem.platform || "leetcode",
          url: problemUrl,
        }] : [],
      });

      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: "AI_CHAT",
          messages: updatedMsgs.map(({ role, content }) => ({ role, content })),
          context,
        }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (resp?.ok) resolve(resp.response);
          else reject(new Error(resp?.error || "AI failed"));
        });
      });

      const aiMsg = { role: "assistant", content: response, ts: Date.now() };
      const finalMsgs = [...updatedMsgs, aiMsg];
      setChatMessages(finalMsgs);

      const meta = {
        problemTitle: problem.title || "",
        problemTags: Array.isArray(problem.tags) ? problem.tags : [],
        attachedProblemSlugs: problem.titleSlug ? [problem.titleSlug] : [],
        attachedProblems: problem.titleSlug ? [{
          slug: problem.titleSlug,
          title: problem.title || problem.titleSlug,
          platform: problem.platform || "leetcode",
          url: problemUrl,
        }] : [],
        surface: "problem-modal",
        requestType: context.requestType || "",
        usedCommands: context.usedCommands || [],
        requestTemplate: text,
        summary: text.slice(0, 120),
      };

      if (chatId) {
        await updateAIChat(chatId, finalMsgs, meta);
      } else {
        const newChatId = await saveAIChat(problem.titleSlug, problemUrl, finalMsgs, problem.platform || "leetcode", meta);
        setChatId(newChatId);
      }
    } catch (e) {
      setChatError(e.message);
    } finally {
      setChatPending(false);
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
    } catch (_) { }

    try {
      const params = new URLSearchParams({ tab: "ai-chats" });
      if (chatSlug) params.set("chatSlug", chatSlug);
      if (chatPrompt) params.set("chatPrompt", chatPrompt);
      window.open(chrome.runtime.getURL(`library/library.html?${params.toString()}`), "_blank");
    } catch (_) { }
  };

  const registryTabs = modalTabRegistry.getTabs(problem.platform || "leetcode", problem);
  const tabs = registryTabs.map(tab => ({
    id: tab.id,
    label: typeof tab.label === "function" ? tab.label(problem) : tab.label,
  }));

  return html`
    <div
      class="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style="background:rgba(0,0,0,0.8);backdrop-filter:blur(6px)"
      onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div class="relative w-full max-w-[72rem] max-h-[calc(100vh-80px)] flex flex-col bg-[#0d1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

        <!-- ── Header ── -->
        <div class="flex items-start gap-3 p-5 border-b border-white/5 shrink-0">
          ${meta.favicon ? html`
            <img src=${meta.favicon} alt="" class="w-5 h-5 mt-0.5 object-contain shrink-0"
              onError=${(e) => { e.target.style.display = "none"; }} />
          ` : ""}
          <div class="flex-1 min-w-0">
            <h2 class="text-base font-semibold text-white leading-snug">${problem.title}</h2>
            <div class="flex items-center gap-2 mt-1.5 flex-wrap">
              <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${diffClass}">${problem.difficulty || "?"}</span>
              <span class="text-[10px] text-slate-500">${meta.label}</span>
              ${langName ? html`<span class="text-[10px] font-mono text-cyan-500/70">${langName}</span>` : ""}
              ${problem.timestamp ? html`<span class="text-[10px] text-slate-600">${new Date(problem.timestamp < 1e12 ? problem.timestamp * 1000 : problem.timestamp).toLocaleDateString()}</span>` : ""}
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            ${onNavigate ? html`
              <button
                onClick=${() => { onClose(); onNavigate("solutions"); }}
                class="shrink-0 px-3 h-8 flex items-center justify-center rounded-lg text-[10px] font-medium text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                title="Go to Solutions list"
              >Solutions</button>
              <button
                onClick=${() => { onClose(); onNavigate("analytics"); }}
                class="shrink-0 px-3 h-8 flex items-center justify-center rounded-lg text-[10px] font-medium text-violet-300 bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 transition-colors"
                title="Go to Analytics"
              >Analytics</button>
              <button
                onClick=${() => { onClose(); onNavigate("graph"); }}
                class="shrink-0 px-3 h-8 flex items-center justify-center rounded-lg text-[10px] font-medium text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
                title="Go to Knowledge Graph"
              >Graph</button>
            ` : onOpenGraphProblem ? html`
              <button
                onClick=${() => onOpenGraphProblem(problem)}
                class="shrink-0 px-3 h-8 flex items-center justify-center rounded-lg text-[10px] font-medium text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
                title="Open this problem in the graph"
              >Graph ↗</button>
            ` : ""}
            ${problem.submissionsUrl || (problem.platform === "leetcode" && problem.titleSlug) ? html`
                          <a
                            href=${problem.submissionsUrl || `https://leetcode.com/problems/${problem.titleSlug}/submissions/`}
                            target="_blank"
                            rel="noopener"
                            class="shrink-0 px-3 h-8 flex items-center justify-center rounded-lg text-[10px] font-medium text-amber-300 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                            title="View all submissions for this problem"
                          >Submissions ↗</a>
            ` : ""}
            ${canNavigate ? html`
              <button
                onClick=${() => onNavigateProblem?.(problemList[(problemIndex - 1 + problemList.length) % problemList.length])}
                class="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                title="Previous problem"
              >←</button>
              <button
                onClick=${() => onNavigateProblem?.(problemList[(problemIndex + 1) % problemList.length])}
                class="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                title="Next problem"
              >→</button>
            ` : ""}
            <button
              onClick=${onClose}
              class="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
            >✕</button>
          </div>
        </div>

        <!-- ── Topics ── -->
        ${topics.length ? html`
          <div class="flex flex-wrap gap-1.5 px-5 pt-3 shrink-0">
            ${topics.map(t => html`
              <span class="px-2 py-0.5 rounded-full text-[10px] bg-white/5 border border-white/10 text-slate-400">${t}</span>
            `)}
          </div>
        ` : ""}

        <!-- ── Stats row ── -->
        ${(problem.runtime || problem.memory || problem.acRate || problem.elapsedSeconds) ? html`
          <div class="flex gap-6 px-5 pt-3 shrink-0">
            ${problem.runtime ? html`
              <div class="flex flex-col gap-0.5">
                <span class="text-[9px] uppercase tracking-wider text-slate-600">Runtime</span>
                <span class="text-xs text-slate-300">
                  ${problem.runtime}
                  ${problem.runtimePct ? html`<span class="text-cyan-500/60 text-[10px]"> · beats ${problem.runtimePct.toFixed(0)}%</span>` : ""}
                </span>
              </div>
            ` : ""}
            ${problem.memory ? html`
              <div class="flex flex-col gap-0.5">
                <span class="text-[9px] uppercase tracking-wider text-slate-600">Memory</span>
                <span class="text-xs text-slate-300">
                  ${problem.memory}
                  ${problem.memoryPct ? html`<span class="text-cyan-500/60 text-[10px]"> · beats ${problem.memoryPct.toFixed(0)}%</span>` : ""}
                </span>
              </div>
            ` : ""}
            ${problem.acRate ? html`
              <div class="flex flex-col gap-0.5">
                <span class="text-[9px] uppercase tracking-wider text-slate-600">Accept Rate</span>
                <span class="text-xs text-slate-300">${typeof problem.acRate === "number" ? problem.acRate.toFixed(1) : problem.acRate}%</span>
              </div>
            ` : ""}
            ${problem.elapsedSeconds ? html`
              <div class="flex flex-col gap-0.5">
                <span class="text-[9px] uppercase tracking-wider text-slate-600">Solve Time</span>
                <span class="text-xs text-slate-300">${_fmtElapsed(problem.elapsedSeconds)}</span>
              </div>
            ` : ""}
          </div>
        ` : ""}

        <!-- ── Siblings (same problem, other language / platform) ── -->
        ${siblings.length ? html`
          <div class="flex items-center gap-2 px-5 pt-3 shrink-0 flex-wrap">
            <span class="text-[10px] uppercase tracking-wider text-slate-600 shrink-0">Also solved as</span>
            ${siblings.map(sib => {
              const sibMeta = PLATFORM_META[sib.platform] || { label: sib.platform || "?", favicon: null };
              const sibLang = sib.lang?.name || sib.language || "?";
              const isSamePlatform = sib.platform === problem.platform;
              return html`
                <button
                  onClick=${() => onNavigateProblem?.(sib)}
                  class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-colors"
                  title="Open ${sibMeta.label} / ${sibLang} solution"
                >
                  ${sibMeta.favicon ? html`<img src=${sibMeta.favicon} alt="" class="w-3 h-3 object-contain"
                    onError=${(e) => { e.target.style.display = "none"; }} />` : ""}
                  ${!isSamePlatform ? html`<span class="text-slate-500">${sibMeta.label}</span>` : ""}
                  <span class="font-mono text-cyan-400/80">${sibLang}</span>
                </button>
              `;
            })}
          </div>
        ` : ""}

        <!-- ── Tabs ── -->
        ${tabs.length > 1 ? html`
          <div class="flex gap-0.5 px-5 pt-3 border-b border-white/5 shrink-0">
            ${tabs.map(tab => html`
              <button
                onClick=${() => setActiveTab(tab.id)}
                class="px-3 py-1.5 text-xs rounded-t-lg transition-colors ${activeTab === tab.id
      ? "bg-white/10 text-white border border-b-0 border-white/10"
      : "text-slate-500 hover:text-slate-300"}"
              >${tab.label}</button>
            `)}
          </div>
        ` : html`<div class="border-b border-white/5 shrink-0"></div>`}

        <!-- ── Tab content ── -->
        <div class="flex-1 overflow-y-auto p-5 min-h-0">
          ${(() => {
            const renderer = modalTabRegistry.getRenderer(problem.platform || "leetcode", activeTab);
            if (!renderer) return html`<p class="text-slate-500 text-sm">No content.</p>`;
            const onClearChat = async () => {
              setChatMessages([]);
              setChatError("");
              if (chatId) {
                await updateAIChat(chatId, [], {
                  problemTitle: problem.title || "",
                  problemTags: Array.isArray(problem.tags) ? problem.tags : [],
                  attachedProblemSlugs: problem.titleSlug ? [problem.titleSlug] : [],
                  attachedProblems: problem.titleSlug ? [{ slug: problem.titleSlug, title: problem.title || problem.titleSlug, platform: problem.platform || "leetcode", url: problemUrl }] : [],
                  surface: "problem-modal", requestType: "", usedCommands: [], requestTemplate: "",
                }).catch(() => {});
              }
            };
            const ctx = {
              html, isExtension, onClose, onUpdate, onDelete,
              refreshing, handleRefreshData, problemUrl, meta,
              langName, copied, copyCode,
              chatMessages, chatInput, setChatInput, sendChat, chatPending, chatError,
              AIMarkdownRenderer, MultiLineAIChatInput, ModelStatusBar, openAIChatsView, onClearChat, chatId,
              settings,
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
            ${meta.favicon ? html`<img src=${meta.favicon} class="w-3.5 h-3.5 object-contain" alt=""
              onError=${(e) => { e.target.style.display = "none"; }} />` : ""}
            Open on ${meta.label} ↗
          </a>
          <span class="text-[10px] text-slate-700 font-mono">${problem.titleSlug || ""}</span>
        </div>
      </div>
    </div>
  `;
}

// ── EditTab sub-component — manages its own edit/delete state ───────────────

function EditTab({ problem, onUpdate, onDelete, onClose }) {
  const [title, setTitle]           = useState(problem.title || "");
  const [difficulty, setDifficulty] = useState(problem.difficulty || "Unknown");
  const [tags, setTags]             = useState(() => {
    const t = Array.isArray(problem.tags) && problem.tags.length > 0
      ? problem.tags.join(", ")
      : problem.topic && problem.topic !== "Untagged" ? problem.topic : "";
    return t;
  });
  const [notes, setNotes]           = useState(problem.notes || "");
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting]     = useState(false);

  const save = async () => {
    setSaving(true); setError("");
    try {
      const newTags = tags.split(",").map(t => t.trim()).filter(Boolean);
      const updated = {
        ...problem,
        title: title.trim() || problem.title,
        difficulty,
        tags: newTags,
        topic: newTags[0] || problem.topic || "Untagged",
        notes: notes.trim(),
        manuallyEdited: true,
      };
      await Storage.saveProblem(updated);
      const slug = String(updated.titleSlug || updated.id || "").trim();
      const lang = updated.lang?.name || updated.lang?.slug || updated.lang?.ext || "";
      const normLang = String(lang).toLowerCase().replace(/\s+/g, "");
      const pendingKey = slug ? (normLang ? `${slug}::${normLang}` : slug) : "";
      if (pendingKey) await Storage.markPendingProblemKey(pendingKey).catch(() => {});
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onUpdate?.(updated);
    } catch (e) { setError("Save failed: " + (e.message || e)); }
    finally { setSaving(false); }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await Storage.deleteProblem(problem.id);
      onDelete?.(problem.id);
      onClose?.();
    } catch (e) { setError("Delete failed: " + (e.message || e)); setDeleting(false); setConfirmDelete(false); }
  };

  return html`
    <div class="flex flex-col gap-5">
      <p class="text-[11px] text-slate-500">Update metadata for this problem. Changes are saved locally to your browser database.</p>

      <div class="flex flex-col gap-1.5">
        <label class="text-[11px] uppercase tracking-wider text-slate-500">Title</label>
        <input type="text" value=${title} onInput=${e => setTitle(e.target.value)}
          class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50" />
      </div>

      <div class="flex flex-col gap-1.5">
        <label class="text-[11px] uppercase tracking-wider text-slate-500">Difficulty</label>
        <select value=${difficulty} onChange=${e => setDifficulty(e.target.value)}
          class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50">
          ${["Easy","Medium","Hard","Unknown"].map(d => html`<option value=${d}>${d}</option>`)}
        </select>
      </div>

      <div class="flex flex-col gap-1.5">
        <label class="text-[11px] uppercase tracking-wider text-slate-500">Tags / Topics <span class="text-slate-600 normal-case">(comma-separated)</span></label>
        <input type="text" value=${tags} onInput=${e => setTags(e.target.value)}
          placeholder="Array, Dynamic Programming, Two Pointers…"
          class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50" />
        <p class="text-[10px] text-slate-600">First tag becomes the primary topic used in analytics and the graph.</p>
      </div>

      <!-- Platform metadata (read-only) -->
      <div class="flex flex-col gap-1">
        <span class="text-[10px] uppercase tracking-wider text-slate-500">Metadata</span>
        <div class="grid grid-cols-3 gap-2 text-xs">
          ${[
            ["Platform", problem.platform],
            ["Language", problem.lang?.name],
            ["Runtime", problem.runtime],
            ["Memory", problem.memory],
            ["Accept Rate", problem.acRate ? (typeof problem.acRate === "number" ? problem.acRate.toFixed(1) : problem.acRate) + "%" : null],
            ["Solved", problem.timestamp ? new Date(problem.timestamp < 1e12 ? problem.timestamp * 1000 : problem.timestamp).toLocaleDateString() : null],
          ].map(([label, val]) => val ? html`
            <div class="bg-white/3 rounded p-2">
              <span class="text-slate-500 text-[10px]">${label}</span>
              <p class="text-slate-300 mt-0.5">${val}</p>
            </div>
          ` : "")}
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <label class="text-[11px] uppercase tracking-wider text-slate-500">Notes</label>
        <textarea value=${notes} onInput=${e => setNotes(e.target.value)} rows="4"
          placeholder="Personal notes, approach, key insights…"
          class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 resize-y font-sans"
        ></textarea>
      </div>

      <div class="flex items-center justify-between mt-1">
        <div>
          ${saved ? html`<span class="text-xs text-emerald-400">✓ Saved successfully</span>` : ""}
          ${error ? html`<span class="text-xs text-rose-400">${error}</span>` : ""}
        </div>
        <button onClick=${save} disabled=${saving}
          class="px-4 py-2 bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/30 text-cyan-300 text-xs rounded-lg transition-colors disabled:opacity-40"
        >${saving ? "Saving…" : "Save changes"}</button>
      </div>

      <div class="border-t border-white/5 pt-4 mt-2">
        <p class="text-[10px] text-slate-600 mb-2">Danger zone — this removes the problem from your local database permanently.</p>
        ${confirmDelete ? html`
          <div class="flex items-center gap-2">
            <span class="text-xs text-rose-400">Are you sure?</span>
            <button onClick=${doDelete} disabled=${deleting}
              class="px-3 py-1.5 bg-rose-600/40 hover:bg-rose-600/60 border border-rose-500/30 text-rose-300 text-xs rounded-lg transition-colors disabled:opacity-40"
            >${deleting ? "Deleting…" : "Yes, delete"}</button>
            <button onClick=${() => setConfirmDelete(false)}
              class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 text-xs rounded-lg transition-colors"
            >Cancel</button>
          </div>
        ` : html`
          <button onClick=${() => setConfirmDelete(true)}
            class="px-3 py-1.5 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/20 text-rose-400 text-xs rounded-lg transition-colors"
          >Delete problem</button>
        `}
      </div>
    </div>`;
}

// ── Global tabs (Notes + Edit) registered for all platforms ─────────────────

modalTabRegistry.register("*", [
  {
    id: "notes",
    label: "Notes",
    show: (p) => !!p.notes,
    render(problem, { html }) {
      return html`
        <div class="prose prose-invert prose-sm max-w-none">
          <pre class="whitespace-pre-wrap text-sm text-slate-300 font-sans leading-relaxed">${problem.notes}</pre>
        </div>`;
    },
  },
  {
    id: "edit",
    label: "Edit",
    render(problem, { html, onUpdate, onDelete, onClose }) {
      return html`<${EditTab} problem=${problem} onUpdate=${onUpdate} onDelete=${onDelete} onClose=${onClose} />`;
    },
  },
]);
