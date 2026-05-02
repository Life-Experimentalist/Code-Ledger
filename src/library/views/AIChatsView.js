/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect, useMemo, useCallback } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { AIMarkdownRenderer } from "../../ui/components/AIMarkdownRenderer.js";
import { MultiLineAIChatInput } from "../../ui/components/MultiLineAIChatInput.js";
import { CHAT_COMMANDS, AI_MENTION_OPTIONS } from "../../lib/chat-variables.js";
import { getAllChats, searchChats, deleteChat, saveAIChat, updateAIChat } from "../../core/ai-chat-storage.js";

function formatTime(ts) {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString();
}

function normalizeProblem(problem = {}) {
  return {
    slug: problem.titleSlug || problem.slug || problem.id || "",
    title: problem.title || problem.titleSlug || problem.slug || problem.id || "Problem",
    platform: problem.platform || "leetcode",
    url: problem.url || problem.problemURL || "",
    tags: Array.isArray(problem.tags) ? problem.tags : [],
    difficulty: problem.difficulty || "",
    statement: problem.problemStatement || problem.description || "",
    code: problem.code || "",
    lang: problem.lang?.name || problem.language || "",
  };
}

export function AIChatsView({ copyableEnabled = false, problems = [], settings = {} }) {
  const [chats, setChats] = useState([]);
  const [activeTab, setActiveTab] = useState("by-problem");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChat, setSelectedChat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeText, setComposeText] = useState("");
  const [composeSearch, setComposeSearch] = useState("");
  const [selectedAttachments, setSelectedAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyPending, setReplyPending] = useState(false);
  const [replyError, setReplyError] = useState("");
  const [prefillHandled, setPrefillHandled] = useState(false);

  const problemIndex = useMemo(() => {
    const map = new Map();
    (problems || []).forEach((problem) => {
      const norm = normalizeProblem(problem);
      if (norm.slug) map.set(norm.slug, norm);
    });
    return map;
  }, [problems]);

  const loadChats = useCallback(async () => {
    setLoading(true);
    try {
      const allChats = searchQuery.trim() ? await searchChats(searchQuery.trim()) : await getAllChats();
      setChats(allChats);
    } catch (e) {
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (prefillHandled) return;
    const params = new URLSearchParams(window.location.search);
    const chatSlug = String(params.get("chatSlug") || "").trim();
    const chatPrompt = String(params.get("chatPrompt") || "").trim();
    if (!chatSlug && !chatPrompt) {
      setPrefillHandled(true);
      return;
    }

    const prefillProblem = chatSlug ? problemIndex.get(chatSlug) || null : null;
    setComposeOpen(true);
    setComposeText(chatPrompt);
    setComposeError("");
    setSelectedAttachments(prefillProblem ? [prefillProblem] : []);
    setSelectedChat(null);
    setPrefillHandled(true);

    params.delete("chatSlug");
    params.delete("chatPrompt");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, [prefillHandled, problemIndex]);

  const groupedChats = useMemo(() => {
    const byProblem = {};
    const byDate = {};
    for (const chat of chats) {
      const slug = chat.problemSlug || chat.attachedProblemSlugs?.[0] || "General";
      if (!byProblem[slug]) byProblem[slug] = [];
      byProblem[slug].push(chat);

      const dateKey = new Date(chat.createdAt || Date.now()).toLocaleDateString();
      if (!byDate[dateKey]) byDate[dateKey] = [];
      byDate[dateKey].push(chat);
    }
    return { byProblem, byDate };
  }, [chats]);

  const stats = useMemo(() => {
    const problemSet = new Set();
    chats.forEach((chat) => {
      if (chat.problemSlug) problemSet.add(chat.problemSlug);
      (chat.attachedProblemSlugs || []).forEach((slug) => problemSet.add(slug));
    });
    return { totalChats: chats.length, uniqueProblems: problemSet.size };
  }, [chats]);

  const visibleProblems = useMemo(() => {
    const q = composeSearch.trim().toLowerCase();
    const list = Array.from(problemIndex.values());
    if (!q) return list.slice(0, 30);
    return list.filter((problem) =>
      [problem.title, problem.slug, problem.platform, ...(problem.tags || [])]
        .some((value) => String(value || "").toLowerCase().includes(q))
    ).slice(0, 30);
  }, [composeSearch, problemIndex]);

  const handleDeleteChat = async (chatId) => {
    if (!confirm("Delete this conversation?")) return;
    try {
      await deleteChat(chatId);
      setChats((prev) => prev.filter((chat) => chat.id !== chatId));
      if (selectedChat?.id === chatId) setSelectedChat(null);
    } catch (_) { }
  };

  const toggleAttachment = (problem) => {
    const slug = problem.slug;
    if (!slug) return;
    setSelectedAttachments((prev) => {
      if (prev.some((item) => item.slug === slug)) {
        return prev.filter((item) => item.slug !== slug);
      }
      return [...prev, problem];
    });
  };

  const startNewChat = (problem = null) => {
    setComposeOpen(true);
    setComposeText("");
    setComposeError("");
    setSelectedAttachments(problem ? [problem] : []);
    setSelectedChat(null);
    setReplyText("");
    setReplyError("");
  };

  const sendNewChat = async () => {
    const text = composeText.trim();
    if (!text || sending) return;

    setSending(true);
    setComposeError("");
    try {
      const primary = selectedAttachments[0] || null;
      const context = primary ? {
        surface: "library-chat",
        title: primary.title,
        difficulty: primary.difficulty || "",
        code: primary.code || "",
        lang: { name: primary.lang || "" },
        platform: primary.platform,
        problemStatement: primary.statement || "",
        attachedProblemSlugs: selectedAttachments.map((p) => p.slug),
      } : {
        surface: "library-chat",
        title: "AI Study Chat",
        attachedProblemSlugs: selectedAttachments.map((p) => p.slug),
      };

      const response = await new Promise((resolve, reject) => {
        if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
          reject(new Error("AI chat is only available inside the extension."));
          return;
        }
        chrome.runtime.sendMessage({
          type: "AI_CHAT",
          messages: [{ role: "user", content: text }],
          context,
        }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (resp?.ok) resolve(resp.response);
          else reject(new Error(resp?.error || "AI request failed"));
        });
      });

      const now = Date.now();
      const messages = [
        { role: "user", content: text, timestamp: now },
        { role: "assistant", content: response, timestamp: now + 1 },
      ];

      const meta = {
        problemTitle: primary?.title || "AI Study Chat",
        problemTags: primary?.tags || [],
        attachedProblemSlugs: selectedAttachments.map((p) => p.slug),
        attachedProblems: selectedAttachments.map((p) => ({ slug: p.slug, title: p.title, platform: p.platform, url: p.url })),
        surface: "library-chat",
        summary: text.slice(0, 120),
      };

      const chatId = await saveAIChat(primary?.slug || "library-chat", primary?.url || "", messages, primary?.platform || "library", meta);
      const allChats = await getAllChats();
      setChats(allChats);
      setSelectedChat(allChats.find((chat) => chat.id === chatId) || null);
      setComposeText("");
      setComposeOpen(false);
    } catch (e) {
      setComposeError(e.message || String(e));
    } finally {
      setSending(false);
    }
  };

  const sendReplyToSelectedChat = async () => {
    const text = replyText.trim();
    if (!selectedChat || !text || replyPending) return;

    const userMessage = { role: "user", content: text, timestamp: Date.now() };
    const baseMessages = Array.isArray(selectedChat.messages) ? selectedChat.messages : [];
    const outboundMessages = [...baseMessages, userMessage].map(({ role, content }) => ({ role, content }));

    setReplyPending(true);
    setReplyError("");

    try {
      const primaryAttachment = selectedChat.attachedProblems?.[0]
        || (selectedChat.problemSlug ? problemIndex.get(selectedChat.problemSlug) : null)
        || null;

      const context = {
        surface: "library-chat",
        title: primaryAttachment?.title || selectedChat.problemTitle || "AI Study Chat",
        difficulty: primaryAttachment?.difficulty || "",
        code: primaryAttachment?.code || "",
        lang: { name: primaryAttachment?.lang || "" },
        platform: primaryAttachment?.platform || selectedChat.platform || "library",
        problemStatement: primaryAttachment?.statement || "",
        attachedProblemSlugs: selectedChat.attachedProblemSlugs || [],
      };

      const response = await new Promise((resolve, reject) => {
        if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
          reject(new Error("AI chat is only available inside the extension."));
          return;
        }
        chrome.runtime.sendMessage({
          type: "AI_CHAT",
          messages: outboundMessages,
          context,
        }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (resp?.ok) resolve(resp.response);
          else reject(new Error(resp?.error || "AI request failed"));
        });
      });

      const nextMessages = [
        ...baseMessages,
        userMessage,
        { role: "assistant", content: response, timestamp: Date.now() + 1 },
      ];

      const nextMeta = {
        problemTitle: selectedChat.problemTitle || primaryAttachment?.title || "AI Study Chat",
        problemTags: selectedChat.problemTags || primaryAttachment?.tags || [],
        attachedProblemSlugs: selectedChat.attachedProblemSlugs || [],
        attachedProblems: selectedChat.attachedProblems || (primaryAttachment ? [{
          slug: primaryAttachment.slug,
          title: primaryAttachment.title,
          platform: primaryAttachment.platform,
          url: primaryAttachment.url,
        }] : []),
        surface: "library-chat",
        summary: selectedChat.summary || (selectedChat.messages?.[0]?.content || "").slice(0, 120),
      };

      await updateAIChat(selectedChat.id, nextMessages, nextMeta);

      const updatedChat = { ...selectedChat, messages: nextMessages, updatedAt: Date.now() };
      setSelectedChat(updatedChat);
      setChats((prev) => prev.map((chat) => (chat.id === updatedChat.id ? updatedChat : chat)));
      setReplyText("");
    } catch (e) {
      setReplyError(e.message || String(e));
    } finally {
      setReplyPending(false);
    }
  };

  const groupByDate = (list) => {
    const byDate = {};
    list.forEach((chat) => {
      const dateKey = new Date(chat.createdAt || Date.now()).toLocaleDateString();
      if (!byDate[dateKey]) byDate[dateKey] = [];
      byDate[dateKey].push(chat);
    });
    return byDate;
  };

  if (loading) {
    return html`<div class="flex items-center justify-center h-64"><div class="text-slate-500">Loading AI conversations...</div></div>`;
  }

  return html`
      <div class="flex flex-col gap-4 w-full h-full min-h-0">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 class="text-lg font-bold text-white">AI Conversations</h2>
            <p class="text-xs text-slate-400">${stats.totalChats} chat${stats.totalChats === 1 ? "" : "s"} • ${stats.uniqueProblems} problem${stats.uniqueProblems === 1 ? "" : "s"}</p>
          </div>
          <button
            onClick=${() => startNewChat()}
            class="px-3 py-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-sm hover:bg-cyan-500/20 transition-colors"
          >+ New Chat</button>
        </div>

        ${composeOpen ? html`
          <div class="rounded-2xl border border-cyan-500/20 bg-slate-950/80 p-4 flex flex-col gap-4">
            <div class="flex items-center justify-between gap-2">
              <div>
                <h3 class="text-sm font-semibold text-white">Start a new chat</h3>
                <p class="text-xs text-slate-500">Attach one or more problems, then ask for a solution, explanation, optimization, or review.</p>
              </div>
              <button onClick=${() => setComposeOpen(false)} class="text-slate-500 hover:text-slate-200 text-sm">✕</button>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
              <div class="flex flex-col gap-2 min-h-0">
                <label class="text-[10px] uppercase tracking-[0.2em] text-slate-500">Attach problems</label>
                <input
                  type="text"
                  value=${composeSearch}
                  onInput=${(e) => setComposeSearch(e.target.value)}
                  placeholder="Search by title, tag, or platform"
                  class="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100 placeholder-slate-500"
                />
                <div class="flex flex-wrap gap-2 max-h-56 overflow-y-auto pr-1">
                  ${visibleProblems.map((problem) => {
    const active = selectedAttachments.some((item) => item.slug === problem.slug);
    return html`
                      <button
                        type="button"
                        onClick=${() => toggleAttachment(problem)}
                        class="px-3 py-2 rounded-xl border text-left transition-colors ${active ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}"
                      >
                        <div class="text-sm font-medium truncate max-w-56">${problem.title}</div>
                        <div class="text-[10px] text-slate-500 mt-1 truncate">${problem.platform}${problem.tags?.length ? ` • ${problem.tags.slice(0, 2).join(", ")}` : ""}</div>
                      </button>
                    `;
  })}
                </div>
              </div>

              <div class="flex flex-col gap-3 min-h-0">
                <label class="text-[10px] uppercase tracking-[0.2em] text-slate-500">Your message</label>
                <${MultiLineAIChatInput}
                  value=${composeText}
                  onChange=${setComposeText}
                  onSend=${sendNewChat}
                  disabled=${sending}
                  problem=${selectedAttachments[0] || null}
                  commandItems=${CHAT_COMMANDS}
                  mentionItems=${AI_MENTION_OPTIONS}
                />
                <div class="flex items-center gap-2 flex-wrap">
                  ${selectedAttachments.map((problem) => html`
                    <span class="px-2 py-1 rounded-full text-[10px] bg-white/5 border border-white/10 text-slate-300">${problem.title} ✕</span>
                  `)}
                </div>
                ${composeError ? html`<p class="text-xs text-rose-400">${composeError}</p>` : ""}
                <div class="flex justify-end gap-2">
                  <button onClick=${() => setComposeOpen(false)} class="px-3 py-2 rounded-lg border border-white/10 text-slate-400 hover:text-slate-200">Cancel</button>
                  <button onClick=${sendNewChat} disabled=${sending || !composeText.trim()} class="px-4 py-2 rounded-lg border border-cyan-500/30 bg-cyan-500/20 text-cyan-100 disabled:opacity-40">Create Chat</button>
                </div>
              </div>
            </div>
          </div>
        ` : ""}

        <div class="flex items-center gap-2">
          <input
            type="text"
            value=${searchQuery}
            onInput=${(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations, problems, tags, or content..."
            class="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none text-sm"
          />
          <button onClick=${() => setActiveTab("by-problem")} class="px-3 py-2 rounded-lg border text-sm ${activeTab === "by-problem" ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300" : "border-white/10 text-slate-400"}">By Problem</button>
          <button onClick=${() => setActiveTab("by-date")} class="px-3 py-2 rounded-lg border text-sm ${activeTab === "by-date" ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300" : "border-white/10 text-slate-400"}">By Date</button>
        </div>

        <div class="flex flex-1 gap-4 min-h-0">
          <div class="w-80 min-w-80 bg-slate-900/50 rounded-2xl border border-slate-700 overflow-y-auto">
            ${activeTab === "by-problem" ? Object.entries(groupedChats.byProblem).map(([slug, problemChats]) => html`
              <div class="border-b border-slate-700">
                <div class="sticky top-0 px-4 py-2 bg-slate-800/90 backdrop-blur font-semibold text-xs text-slate-300 truncate">${slug} (${problemChats.length})</div>
                ${problemChats.map((chat) => html`
                  <button
                    onClick=${() => {
      setSelectedChat(chat);
      setReplyText("");
      setReplyError("");
    }}
                    class="w-full text-left px-4 py-3 border-b border-slate-800 hover:bg-slate-800 transition-colors ${selectedChat?.id === chat.id ? "bg-slate-700" : ""}"
                  >
                    <div class="text-xs text-slate-300">${formatTime(chat.createdAt)}</div>
                    <div class="text-xs text-slate-400 mt-1 truncate">${chat.summary || chat.messages?.[0]?.content?.substring(0, 60) || "(empty)"}</div>
                    <div class="text-[10px] text-slate-500 mt-1">${(chat.messages || []).length} message${(chat.messages || []).length === 1 ? "" : "s"}</div>
                  </button>
                `)}
              </div>
            `) : Object.entries(groupedChats.byDate).map(([dateKey, dateChats]) => html`
              <div class="border-b border-slate-700">
                <div class="sticky top-0 px-4 py-2 bg-slate-800/90 backdrop-blur font-semibold text-xs text-slate-300">${dateKey}</div>
                ${dateChats.map((chat) => html`
                  <button
                    onClick=${() => {
        setSelectedChat(chat);
        setReplyText("");
        setReplyError("");
      }}
                    class="w-full text-left px-4 py-3 border-b border-slate-800 hover:bg-slate-800 transition-colors ${selectedChat?.id === chat.id ? "bg-slate-700" : ""}"
                  >
                    <div class="text-xs font-medium text-slate-200 truncate">${chat.problemTitle || chat.problemSlug || "AI Chat"}</div>
                    <div class="text-xs text-slate-400 mt-1 truncate">${chat.summary || chat.messages?.[0]?.content?.substring(0, 60) || "(empty)"}</div>
                    <div class="text-[10px] text-slate-500 mt-1">${(chat.messages || []).length} message${(chat.messages || []).length === 1 ? "" : "s"}</div>
                  </button>
                `)}
              </div>
            `)}
            ${!chats.length ? html`<div class="p-4 text-sm text-slate-500 text-center">No conversations yet</div>` : ""}
          </div>

          <div class="flex-1 bg-slate-900/50 rounded-2xl border border-slate-700 p-4 overflow-y-auto min-h-0">
            ${selectedChat ? html`
              <div class="flex flex-col gap-4 h-full">
                <div class="flex items-start justify-between border-b border-slate-700 pb-3 gap-3">
                  <div>
                    <h3 class="font-semibold text-slate-100">${selectedChat.problemTitle || selectedChat.problemSlug || "AI Chat"}</h3>
                    ${selectedChat.problemURL ? html`<a href=${selectedChat.problemURL} target="_blank" rel="noopener" class="text-xs text-cyan-400 hover:text-cyan-300">View problem ↗</a>` : ""}
                    <div class="text-xs text-slate-500 mt-1">${formatTime(selectedChat.createdAt)}</div>
                  </div>
                  <div class="flex items-center gap-2">
                    <button onClick=${() => startNewChat(selectedChat.attachedProblems?.[0] || (selectedChat.problemSlug ? problemIndex.get(selectedChat.problemSlug) : null))} class="px-2 py-1 rounded border border-cyan-500/30 text-cyan-300 text-xs hover:bg-cyan-500/10">Continue</button>
                    <button onClick=${() => handleDeleteChat(selectedChat.id)} class="text-slate-500 hover:text-red-400 text-sm px-2 py-1">🗑️</button>
                  </div>
                </div>

                ${selectedChat.attachedProblems?.length ? html`
                  <div class="flex flex-wrap gap-2">
                    ${selectedChat.attachedProblems.map((problem) => html`
                      <span class="px-2 py-1 rounded-full text-[10px] bg-white/5 border border-white/10 text-slate-300">${problem.title}</span>
                    `)}
                  </div>
                ` : ""}

                <div class="flex-1 flex flex-col gap-3 overflow-y-auto">
                  ${(selectedChat.messages || []).map((msg) => html`
                    <div class="flex gap-2">
                      <div class="text-xs font-medium text-slate-400 w-12 mt-1">${msg.role === "user" ? "You" : msg.role === "system" ? "System" : "AI"}</div>
                      <div class="flex-1 bg-slate-800 rounded-lg p-3">
                        ${msg.role === "user"
          ? html`<div class="text-sm text-slate-100 whitespace-pre-wrap">${msg.content}</div>`
          : html`<${AIMarkdownRenderer} content=${msg.content} copyableEnabled=${copyableEnabled} />`}
                        <div class="text-[10px] text-slate-600 mt-2">${formatTime(msg.timestamp || selectedChat.createdAt)}</div>
                      </div>
                    </div>
                  `)}
                </div>

                <div class="border-t border-slate-700 pt-3 flex flex-col gap-2">
                  <${MultiLineAIChatInput}
                    value=${replyText}
                    onChange=${setReplyText}
                    onSend=${sendReplyToSelectedChat}
                    disabled=${replyPending}
                    problem=${selectedChat.attachedProblems?.[0] || null}
                    commandItems=${CHAT_COMMANDS}
                    mentionItems=${AI_MENTION_OPTIONS}
                  />
                  <div class="flex items-center justify-between gap-2">
                    ${replyError ? html`<p class="text-xs text-rose-400">${replyError}</p>` : html`<span class="text-[11px] text-slate-500">Continue this chat in-place.</span>`}
                    <button
                      onClick=${sendReplyToSelectedChat}
                      disabled=${replyPending || !replyText.trim()}
                      class="px-3 py-2 rounded-lg border border-cyan-500/30 bg-cyan-500/20 text-cyan-100 text-xs disabled:opacity-40"
                    >${replyPending ? "Sending..." : "Send Reply"}</button>
                  </div>
                </div>
              </div>
            ` : html`<div class="flex items-center justify-center h-full text-slate-500">Select a conversation to view</div>`}
          </div>
        </div>
      </div>
    `;
}
