/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { h, useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

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
  Easy:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Hard:   "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

const CHAT_KEY = (slug) => `cl-chat-${slug}`;

function loadChatHistory(slug) {
  try {
    return JSON.parse(localStorage.getItem(CHAT_KEY(slug)) || "[]");
  } catch (_) { return []; }
}

function saveChatHistory(slug, msgs) {
  try { localStorage.setItem(CHAT_KEY(slug), JSON.stringify(msgs)); } catch (_) {}
}

export function ProblemModal({ problem, onClose }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [copied, setCopied] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatPending, setChatPending] = useState(false);
  const [chatError, setChatError] = useState("");

  // Reset tab and load chat history when problem changes
  useEffect(() => {
    setActiveTab("overview");
    if (problem?.titleSlug) {
      setChatMessages(loadChatHistory(problem.titleSlug));
      setChatInput("");
      setChatError("");
    }
  }, [problem?.titleSlug]);

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
  const topics = Array.isArray(problem.tags) && problem.tags.length > 0
    ? problem.tags
    : problem.topic ? [problem.topic] : [];
  const diffClass = DIFF_CLASS[problem.difficulty] || "bg-white/5 text-slate-400 border-white/10";
  const langName = problem.lang?.name || problem.language || null;

  const copyCode = async () => {
    if (!problem.code) return;
    try {
      await navigator.clipboard.writeText(problem.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };

  const isExtension = typeof chrome !== "undefined" && !!chrome.runtime?.id;

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
      saveChatHistory(problem.titleSlug, finalMsgs);
    } catch (e) {
      setChatError(e.message);
    } finally {
      setChatPending(false);
    }
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    ...(problem.code ? [{ id: "code", label: "Code" }] : []),
    ...(problem.aiReview ? [{ id: "review", label: "AI Review" }] : []),
    ...((problem.similar?.length) ? [{ id: "similar", label: `Similar (${problem.similar.length})` }] : []),
    ...(isExtension ? [{ id: "chat", label: "Ask AI" }] : []),
  ];

  return html`
    <div
      class="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style="background:rgba(0,0,0,0.8);backdrop-filter:blur(6px)"
      onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div class="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-[#0d1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

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
              ${problem.timestamp ? html`<span class="text-[10px] text-slate-600">${new Date(problem.timestamp * 1000).toLocaleDateString()}</span>` : ""}
            </div>
          </div>
          <button
            onClick=${onClose}
            class="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
          >✕</button>
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
                <div class="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">${problem.problemStatement}</div>
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
            <div class="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
              ${problem.aiReview || "No AI review available."}
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
                    <div class="max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-cyan-600/20 border border-cyan-500/30 text-cyan-100"
                        : "bg-white/5 border border-white/10 text-slate-200"
                    } whitespace-pre-wrap">${msg.content}</div>
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
              <div class="flex gap-2 shrink-0">
                <input
                  type="text"
                  value=${chatInput}
                  placeholder="Ask about complexity, approach, edge cases…"
                  class="flex-1 px-3 py-2 bg-black border border-white/10 rounded-lg text-sm text-white placeholder-slate-600"
                  onInput=${(e) => setChatInput(e.target.value)}
                  onKeyDown=${(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  disabled=${chatPending}
                />
                <button
                  onClick=${sendChat}
                  disabled=${chatPending || !chatInput.trim()}
                  class="px-4 py-2 bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/30 text-cyan-300 text-xs rounded-lg transition-colors disabled:opacity-40 shrink-0"
                >Send</button>
                ${chatMessages.length > 0 ? html`
                  <button
                    onClick=${() => { setChatMessages([]); saveChatHistory(problem.titleSlug, []); setChatError(""); }}
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
