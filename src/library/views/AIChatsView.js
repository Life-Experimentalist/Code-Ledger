/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect, useRef, useCallback } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);
import {
    getChatsByProblem,
    getChatsByDateRange,
    getAllChats,
    searchChats,
    deleteChat,
} from "../../core/ai-chat-storage.js";
import { AIMarkdownRenderer } from "../../ui/components/AIMarkdownRenderer.js";

export function AIChatsView({ copyableEnabled = false }) {
    const [chats, setChats] = useState([]);
    const [activeTab, setActiveTab] = useState("by-problem"); // "by-problem" or "by-date"
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedChat, setSelectedChat] = useState(null);
    const [groupedChats, setGroupedChats] = useState({});
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ totalChats: 0, uniqueProblems: 0 });

    // Load chats on mount
    useEffect(() => {
        async function loadChats() {
            setLoading(true);
            try {
                const allChats = await getAllChats();
                setChats(allChats);

                // Group by problem
                const byProblem = {};
                const problemSet = new Set();
                allChats.forEach((chat) => {
                    if (!byProblem[chat.problemSlug]) {
                        byProblem[chat.problemSlug] = [];
                    }
                    byProblem[chat.problemSlug].push(chat);
                    problemSet.add(chat.problemSlug);
                });
                setGroupedChats(byProblem);
                setStats({
                    totalChats: allChats.length,
                    uniqueProblems: problemSet.size,
                });
            } catch (e) {
                console.error("Failed to load AI chats:", e);
            } finally {
                setLoading(false);
            }
        }
        loadChats();
    }, []);

    // Handle search
    const handleSearch = useCallback(
        async (query) => {
            setSearchQuery(query);
            if (!query.trim()) {
                setChats(await getAllChats());
                return;
            }
            const results = await searchChats(query);
            setChats(results);
        },
        []
    );

    // Delete chat
    const handleDeleteChat = async (chatId) => {
        if (confirm("Delete this conversation?")) {
            try {
                await deleteChat(chatId);
                setChats(chats.filter((c) => c.id !== chatId));
                if (selectedChat?.id === chatId) {
                    setSelectedChat(null);
                }
            } catch (e) {
                console.error("Failed to delete chat:", e);
            }
        }
    };

    // Format timestamp
    function formatTime(ts) {
        const date = new Date(ts);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } else if (date.toDateString() === yesterday.toDateString()) {
            return "Yesterday";
        }
        return date.toLocaleDateString();
    }

    // Group chats by date (for "by-date" tab)
    function groupChatsByDate(chatsToGroup) {
        const byDate = {};
        chatsToGroup.forEach((chat) => {
            const dateKey = new Date(chat.createdAt).toLocaleDateString();
            if (!byDate[dateKey]) byDate[dateKey] = [];
            byDate[dateKey].push(chat);
        });
        return byDate;
    }

    if (loading) {
        return html`
      <div class="flex items-center justify-center h-64">
        <div class="text-slate-500">Loading AI conversations...</div>
      </div>
    `;
    }

    return html`
    <div class="flex flex-col gap-4 w-full h-full">
      <!-- Header with stats -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-bold text-white">AI Conversations</h2>
          <p class="text-xs text-slate-400">
            ${stats.totalChats} chat${stats.totalChats !== 1 ? "s" : ""} • ${stats.uniqueProblems} problem${stats.uniqueProblems !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <!-- Search bar -->
      <input
        type="text"
        value=${searchQuery}
        onChange=${(e) => handleSearch(e.target.value)}
        placeholder="Search conversations, problems, or content..."
        class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none text-sm"
      />

      <!-- Tabs -->
      <div class="flex gap-2 border-b border-slate-700">
        <button
          onClick=${() => setActiveTab("by-problem")}
          class="px-3 py-2 text-sm font-medium ${activeTab === "by-problem"
            ? "text-cyan-400 border-b-2 border-cyan-500"
            : "text-slate-400 hover:text-slate-300"}"
        >
          By Problem
        </button>
        <button
          onClick=${() => setActiveTab("by-date")}
          class="px-3 py-2 text-sm font-medium ${activeTab === "by-date"
            ? "text-cyan-400 border-b-2 border-cyan-500"
            : "text-slate-400 hover:text-slate-300"}"
        >
          By Date
        </button>
      </div>

      <!-- Main content: list + detail -->
      <div class="flex flex-1 gap-4 min-h-0">
        <!-- Left panel: chat list -->
        <div class="w-80 bg-slate-900/50 rounded-lg border border-slate-700 overflow-y-auto">
          ${activeTab === "by-problem"
            ? Object.entries(groupedChats).map(
                ([slug, chatsForProblem]) => html`
                  <div class="border-b border-slate-700">
                    <div class="sticky top-0 px-4 py-2 bg-slate-800 font-semibold text-xs text-slate-300 truncate">
                      ${slug} (${chatsForProblem.length})
                    </div>
                    ${chatsForProblem.map(
                    (chat) => html`
                        <button
                          onClick=${() => setSelectedChat(chat)}
                          class="w-full text-left px-4 py-3 border-b border-slate-800 hover:bg-slate-800 transition-colors ${selectedChat?.id === chat.id ? "bg-slate-700" : ""}"
                        >
                          <div class="text-xs text-slate-300">${formatTime(chat.createdAt)}</div>
                          <div class="text-xs text-slate-400 mt-1 truncate">${chat.messages[0]?.content.substring(0, 60) || "(empty)"}</div>
                          <div class="text-[10px] text-slate-500 mt-1">${chat.messages.length} message${chat.messages.length !== 1 ? "s" : ""}</div>
                        </button>
                      `
                )}
                  </div>
                `
            )
            : Object.entries(groupChatsByDate(chats)).map(
                ([dateKey, chatsForDate]) => html`
                  <div class="border-b border-slate-700">
                    <div class="sticky top-0 px-4 py-2 bg-slate-800 font-semibold text-xs text-slate-300">
                      ${dateKey}
                    </div>
                    ${chatsForDate.map(
                    (chat) => html`
                        <button
                          onClick=${() => setSelectedChat(chat)}
                          class="w-full text-left px-4 py-3 border-b border-slate-800 hover:bg-slate-800 transition-colors ${selectedChat?.id === chat.id ? "bg-slate-700" : ""}"
                        >
                          <div class="text-xs font-medium text-slate-200 truncate">${chat.problemSlug}</div>
                          <div class="text-xs text-slate-400 mt-1 truncate">${chat.messages[0]?.content.substring(0, 60) || "(empty)"}</div>
                          <div class="text-[10px] text-slate-500 mt-1">${chat.messages.length} message${chat.messages.length !== 1 ? "s" : ""}</div>
                        </button>
                      `
                )}
                  </div>
                `
            )}
          ${!chats.length && html` <div class="p-4 text-sm text-slate-500 text-center">No conversations yet</div> `}
        </div>

        <!-- Right panel: chat detail -->
        <div class="flex-1 bg-slate-900/50 rounded-lg border border-slate-700 p-4 overflow-y-auto">
          ${selectedChat
            ? html`
                <div class="flex flex-col gap-4 h-full">
                  <!-- Chat header -->
                  <div class="flex items-start justify-between border-b border-slate-700 pb-3">
                    <div>
                      <h3 class="font-semibold text-slate-100">${selectedChat.problemSlug}</h3>
                      <a href=${selectedChat.problemURL} target="_blank" rel="noopener" class="text-xs text-cyan-400 hover:text-cyan-300">
                        View problem ↗
                      </a>
                      <div class="text-xs text-slate-500 mt-1">${formatTime(selectedChat.createdAt)}</div>
                    </div>
                    <button
                      onClick=${() => handleDeleteChat(selectedChat.id)}
                      class="text-slate-500 hover:text-red-400 text-sm px-2 py-1"
                    >
                      🗑️
                    </button>
                  </div>

                  <!-- Messages -->
                  <div class="flex-1 flex flex-col gap-3 overflow-y-auto">
                    ${selectedChat.messages.map(
                (msg, i) => html`
                        <div class="flex gap-2">
                          <div class="text-xs font-medium text-slate-400 w-12 mt-1">
                            ${msg.role === "user" ? "You" : msg.role === "system" ? "System" : "AI"}
                          </div>
                          <div class="flex-1 bg-slate-800 rounded-lg p-3">
                            <${AIMarkdownRenderer} content=${msg.content} copyableEnabled=${copyableEnabled} />
                            <div class="text-[10px] text-slate-600 mt-2">${formatTime(msg.timestamp)}</div>
                          </div>
                        </div>
                      `
            )}
                  </div>
                </div>
              `
            : html` <div class="flex items-center justify-center h-full text-slate-500">Select a conversation to view</div> `}
        </div>
      </div>
    </div>
  `;
}
