/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect, useCallback } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";
import { getChatsByProblem, saveAIChat, updateAIChat } from "../../core/ai-chat-storage.js";
import { MultiLineAIChatInput } from "../../ui/components/MultiLineAIChatInput.js";
import { AIMarkdownRenderer } from "../../ui/components/AIMarkdownRenderer.js";

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

export function ProblemModal({ problem, onClose, onUpdate, onDelete, problemList = [], onNavigateProblem }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [copied, setCopied] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatPending, setChatPending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatId, setChatId] = useState(null);

  // Edit state
  const [editTitle, setEditTitle] = useState("");
  const [editDifficulty, setEditDifficulty] = useState("Unknown");
  const [editTags, setEditTags] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editSaved, setEditSaved] = useState(false);
  const [editError, setEditError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset tab and load chat history when problem changes
  useEffect(() => {
    setActiveTab("overview");
    if (problem) {
      setChatMessages([]);
      setChatInput("");
      setChatError("");
      setChatId(null);
      // Seed edit fields
      setEditTitle(problem.title || "");
      setEditDifficulty(problem.difficulty || "Unknown");
      const existingTags = Array.isArray(problem.tags) && problem.tags.length > 0
        ? problem.tags.join(", ")
        : problem.topic && problem.topic !== "Untagged" ? problem.topic : "";
      setEditTags(existingTags);
      setEditSaved(false);
      setEditError("");
      setConfirmDelete(false);
      setDeleting(false);

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
      await navigator.clipboard.writeText(problem.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) { }
  };

  const isExtension = typeof chrome !== "undefined" && !!chrome.runtime?.id;
  const problemIndex = problemList.findIndex((entry) => (entry?.id || entry?.titleSlug) === (problem?.id || problem?.titleSlug));
  const canNavigate = problemList.length > 1 && problemIndex >= 0;

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await Storage.deleteProblem(problem.id);
      if (onDelete) onDelete(problem.id);
      onClose();
    } catch (e) {
      setEditError("Delete failed: " + (e.message || e));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [confirmDelete, problem, onDelete, onClose]);

  const handleSaveEdit = useCallback(async () => {
    setEditSaving(true);
    setEditError("");
    try {
      const newTags = editTags.split(",").map(t => t.trim()).filter(Boolean);
      const updated = {
        ...problem,
        title: editTitle.trim() || problem.title,
        difficulty: editDifficulty,
        tags: newTags,
        topic: newTags[0] || problem.topic || "Untagged",
        manuallyEdited: true,
      };
      await Storage.saveProblem(updated);
      {
        const slug = String(updated.titleSlug || updated.slug || updated.id || "").trim();
        const lang = updated.lang?.name || updated.lang?.slug || updated.lang?.ext || updated.language || "";
        const normLang = String(lang).toLowerCase().replace(/\s+/g, "");
        const pendingKey = slug ? (normLang ? `${slug}::${normLang}` : slug) : "";
        if (pendingKey) {
          await Storage.markPendingProblemKey(pendingKey).catch(() => { });
        }
      }
      setEditSaved(true);
      setTimeout(() => setEditSaved(false), 2500);
      if (onUpdate) onUpdate(updated);
    } catch (e) {
      setEditError("Save failed: " + (e.message || e));
    } finally {
      setEditSaving(false);
    }
  }, [problem, editTitle, editDifficulty, editTags, onUpdate]);

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatPending) return;

    const userMsg = { role: "user", content: text, ts: Date.now() };
    const updatedMsgs = [...chatMessages, userMsg];
    setChatMessages(updatedMsgs);
    setChatInput("");
    setChatPending(true);
    setChatError("");

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: "AI_CHAT",
          messages: updatedMsgs.map(({ role, content }) => ({ role, content })),
          context: {
            title: problem.title,
            difficulty: problem.difficulty,
            code: problem.code || "",
            lang: problem.lang,
            aiReview: problem.aiReview || "",
            problemStatement: problem.problemStatement || "",
          },
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

  const tabs = [
    { id: "overview", label: "Overview" },
    ...(problem.code ? [{ id: "code", label: "Code" }] : []),
    ...(problem.aiReview ? [{ id: "review", label: "AI Review" }] : []),
    ...((problem.similar?.length) ? [{ id: "similar", label: `Similar (${problem.similar.length})` }] : []),
    ...(isExtension ? [{ id: "chat", label: "Ask AI" }] : []),
    { id: "edit", label: "Edit" },
  ];

  return html`
    <div
      class="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style="background:rgba(0,0,0,0.8);backdrop-filter:blur(6px)"
      onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div class="relative w-full max-w-[72rem] max-h-[90vh] flex flex-col bg-[#0d1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

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

          ${activeTab === "overview" ? html`
            <div class="flex flex-col gap-4">
              ${problem.problemStatement ? html`
                <div
                  class="text-sm text-slate-300 leading-relaxed lc-content"
                  dangerouslySetInnerHTML=${{ __html: problem.problemStatement }}
                ></div>
              ` : html`
                <div class="flex flex-col items-center justify-center py-8 gap-3 text-center">
                  <span class="text-2xl">📄</span>
                  <p class="text-slate-400 text-sm">No problem statement cached locally.</p>
                  <p class="text-slate-600 text-xs">Open on ${meta.label} to view the full description.</p>
                </div>
              `}
              ${problem.hints?.length ? html`
                <div class="mt-2">
                  <p class="text-[10px] uppercase tracking-wider text-slate-600 mb-2">Hints</p>
                  ${problem.hints.map((h, i) => html`
                    <details class="mb-1 group">
                      <summary class="text-xs text-slate-500 cursor-pointer hover:text-slate-300 select-none">Hint ${i + 1}</summary>
                      <p class="text-xs text-slate-400 mt-1 pl-3 border-l border-white/10">${h}</p>
                    </details>
                  `)}
                </div>
              ` : ""}
            </div>
          ` : ""}

          ${activeTab === "code" ? html`
            <div class="flex flex-col gap-2">
              <div class="flex justify-between items-center">
                <span class="text-[10px] uppercase tracking-wider text-slate-600">${langName || "Solution"}</span>
                <button
                  onClick=${copyCode}
                  class="text-[10px] px-2.5 py-1 rounded bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >${copied ? "✓ Copied" : "Copy"}</button>
              </div>
              <pre class="text-xs text-slate-300 leading-relaxed overflow-x-auto bg-black/50 rounded-xl border border-white/5 p-4 whitespace-pre font-mono m-0">${problem.code || "// No code saved for this problem."}</pre>
            </div>
          ` : ""}

          ${activeTab === "review" ? html`
            <div
              class="text-sm text-slate-300 leading-relaxed prose-sm"
            >
              ${problem.aiReview ? html`<${AIMarkdownRenderer} content=${problem.aiReview} copyableEnabled=${false} />` : html`<p class='text-slate-500'>No AI review available.</p>`}
            </div>
          ` : ""}

          ${activeTab === "chat" ? html`
            <div class="flex flex-col gap-3 h-full">
              <!-- Message list -->
              <div class="flex-1 flex flex-col gap-3 overflow-y-auto min-h-0 max-h-[340px]">
                ${chatMessages.length === 0 ? html`
                  <div class="flex flex-col items-center justify-center py-10 gap-2 text-center">
                    <span class="text-2xl">💬</span>
                    <p class="text-slate-400 text-sm">Ask anything about this problem or your solution.</p>
                    <p class="text-slate-600 text-xs">Uses your configured AI provider.</p>
                  </div>
                ` : chatMessages.map((msg) => html`
                  <div class="flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}">
                    ${msg.role === "user" ? html`
                    <div class="max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed bg-cyan-600/20 border border-cyan-500/30 text-cyan-100 whitespace-pre-wrap">${msg.content}</div>
                  ` : html`
                    <div
                      class="max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed bg-white/5 border border-white/10 text-slate-200"
                    >
                      <${AIMarkdownRenderer} content=${msg.content} copyableEnabled=${false} />
                    </div>
                  `}
                    <span class="text-[9px] text-slate-700">${msg.role === "user" ? "You" : "AI"}</span>
                  </div>
                `)}
                ${chatPending ? html`
                  <div class="flex items-start gap-2">
                    <div class="px-3 py-2 bg-white/5 border border-white/10 rounded-xl">
                      <span class="text-xs text-slate-500 animate-pulse">Thinking…</span>
                    </div>
                  </div>
                ` : ""}
                ${chatError ? html`
                  <p class="text-xs text-rose-400 px-1">${chatError}</p>
                ` : ""}
              </div>
              <!-- Input row -->
              <div class="shrink-0">
                <${MultiLineAIChatInput}
                  value=${chatInput}
                  onChange=${setChatInput}
                  onSend=${sendChat}
                  disabled=${chatPending}
                  problem=${problem}
                />
              </div>
              <div class="flex items-center justify-between gap-2 shrink-0">
                <div class="flex items-center gap-2">
                  <button
                    onClick=${sendChat}
                    disabled=${chatPending || !chatInput.trim()}
                    class="px-4 py-2 bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/30 text-cyan-300 text-xs rounded-lg transition-colors disabled:opacity-40 shrink-0"
                  >Send</button>
                  <button
                    onClick=${openAIChatsView}
                    class="px-3 py-2 bg-white/5 border border-white/10 text-slate-300 hover:text-cyan-200 hover:border-cyan-500/30 text-xs rounded-lg transition-colors shrink-0"
                  >Open AI Chats</button>
                </div>
                ${chatMessages.length > 0 ? html`
                  <button
                    onClick=${async () => {
          setChatMessages([]);
          setChatError("");
          if (chatId) {
            await updateAIChat(chatId, [], {
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
            }).catch(() => { });
          }
        }}
                    class="px-3 py-2 bg-white/5 border border-white/10 text-slate-500 hover:text-slate-300 text-xs rounded-lg transition-colors shrink-0"
                    title="Clear history"
                  >✕</button>
                ` : ""}
              </div>
            </div>
          ` : ""}

          ${activeTab === "similar" ? html`
            <div class="flex flex-col gap-2">
              ${(problem.similar || []).length === 0 ? html`
                <p class="text-slate-500 text-sm text-center py-4">No similar problems found.</p>
              ` : (problem.similar || []).map(s => {
          const sUrl = `https://leetcode.com/problems/${s.titleSlug}/`;
          const sDiffClass = { Easy: "text-emerald-400", Medium: "text-amber-400", Hard: "text-rose-400" }[s.difficulty] || "text-slate-400";
          return html`
                  <a
                    href=${sUrl}
                    target="_blank"
                    rel="noopener"
                    class="flex items-center justify-between p-3 bg-white/3 border border-white/5 rounded-xl hover:border-cyan-500/20 hover:bg-white/5 transition-colors no-underline"
                  >
                    <span class="text-sm text-slate-200">${s.title || s.titleSlug}</span>
                    <span class="text-xs ${sDiffClass} shrink-0 ml-2">${s.difficulty || ""}</span>
                  </a>
                `;
        })}
            </div>
          ` : ""}

          ${activeTab === "edit" ? html`
            <div class="flex flex-col gap-5">
              <p class="text-[11px] text-slate-500">Update metadata for this problem. Changes are saved locally to your browser database.</p>

              <div class="flex flex-col gap-1.5">
                <label class="text-[11px] uppercase tracking-wider text-slate-500">Title</label>
                <input
                  type="text"
                  value=${editTitle}
                  onInput=${(e) => setEditTitle(e.target.value)}
                  class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              <div class="flex flex-col gap-1.5">
                <label class="text-[11px] uppercase tracking-wider text-slate-500">Difficulty</label>
                <select
                  value=${editDifficulty}
                  onChange=${(e) => setEditDifficulty(e.target.value)}
                  class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                  <option value="Unknown">Unknown</option>
                </select>
              </div>

              <div class="flex flex-col gap-1.5">
                <label class="text-[11px] uppercase tracking-wider text-slate-500">Tags / Topics <span class="text-slate-600 normal-case">(comma-separated)</span></label>
                <input
                  type="text"
                  value=${editTags}
                  onInput=${(e) => setEditTags(e.target.value)}
                  placeholder="Array, Dynamic Programming, Two Pointers…"
                  class="px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
                />
                <p class="text-[10px] text-slate-600">First tag becomes the primary topic used in analytics and the graph.</p>
              </div>

              <div class="flex items-center justify-between mt-1">
                <div>
                  ${editSaved ? html`<span class="text-xs text-emerald-400">✓ Saved successfully</span>` : ""}
                  ${editError ? html`<span class="text-xs text-rose-400">${editError}</span>` : ""}
                </div>
                <button
                  onClick=${handleSaveEdit}
                  disabled=${editSaving}
                  class="px-4 py-2 bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/30 text-cyan-300 text-xs rounded-lg transition-colors disabled:opacity-40"
                >${editSaving ? "Saving…" : "Save changes"}</button>
              </div>

              <div class="border-t border-white/5 pt-4 mt-2">
                <p class="text-[10px] text-slate-600 mb-2">Danger zone — this removes the problem from your local database permanently.</p>
                ${confirmDelete ? html`
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-rose-400">Are you sure?</span>
                    <button
                      onClick=${handleDelete}
                      disabled=${deleting}
                      class="px-3 py-1.5 bg-rose-600/40 hover:bg-rose-600/60 border border-rose-500/30 text-rose-300 text-xs rounded-lg transition-colors disabled:opacity-40"
                    >${deleting ? "Deleting…" : "Yes, delete"}</button>
                    <button
                      onClick=${() => setConfirmDelete(false)}
                      class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 text-xs rounded-lg transition-colors"
                    >Cancel</button>
                  </div>
                ` : html`
                  <button
                    onClick=${() => setConfirmDelete(true)}
                    class="px-3 py-1.5 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/20 text-rose-400 text-xs rounded-lg transition-colors"
                  >Delete problem</button>
                `}
              </div>
            </div>
          ` : ""}
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
