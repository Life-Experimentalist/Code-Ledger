/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Self-contained floating AI assistant panel.
 * Content-script safe — no framework, no bundler, no Tailwind.
 * Returns a controller: { destroy }
 */

import {
  getChatsByProblem,
  saveAIChat,
  updateAIChat,
  deleteChat,
} from "../core/ai-chat-storage.js";
import { buildAIChatContext } from "../lib/ai-chat-context.js";
import { parseMarkdown } from "./components/AIMarkdownRenderer.js";
import { Storage } from "../core/storage.js";
import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("FloatingAI");

import {
  expandChatVariables,
  getUsedCommands,
  CHAT_COMMANDS,
} from "../lib/chat-variables.js";
const DEFAULT_PLATFORM = {
  id: "generic",
  label: "AI Assistant",
  chatPlatform: "leetcode",
  titleFallback: "",
  readPageMeta: readGenericPageMeta,
  readEditorCode: readMonacoEditorCode,
  readTestFailures: readGenericTestFailures,
  buildChatContext: null,
  openAIChatsPage: null,
};

function readMonacoEditorCode() {
  try {
    const active = window.monaco?.editor
      ?.getActiveCodeEditor?.()
      ?.getModel?.()
      ?.getValue?.();
    if (active && active.trim()) return active;
    const editors = window.monaco?.editor?.getEditors?.();
    if (editors?.length) {
      for (const ed of editors) {
        const val = ed.getModel?.()?.getValue?.();
        if (val && val.trim()) return val;
      }
    }
    const models = window.monaco?.editor?.getModels?.();
    if (models?.length) {
      const val = models[0].getValue?.();
      if (val && val.trim()) return val;
    }
  } catch {}
  try {
    const lineEls = [
      ...document.querySelectorAll(".monaco-editor .view-lines .view-line"),
    ];
    lineEls.sort(
      (a, b) =>
        (parseInt(a.style.top, 10) || 0) - (parseInt(b.style.top, 10) || 0),
    );
    if (lineEls.length > 0) return lineEls.map((l) => l.textContent).join("\n");
  } catch {}
  return "";
}

function readGenericPageMeta() {
  const titleEl = document.querySelector("h1") || document.querySelector("h2");
  const title = titleEl?.textContent?.trim() || document.title || "";
  return {
    title,
    difficulty: "",
  };
}

/** Attempts to read the current code from the Monaco editor on the page. */
function readEditorCode() {
  try {
    // Monaco global model approach (most reliable)
    if (window.monaco?.editor) {
      const models = window.monaco.editor.getModels();
      if (models?.length) {
        const code = models[0].getValue();
        if (code && code.trim()) return code;
      }
    }
  } catch {}
  try {
    // Fallback: read visible lines from the DOM
    const lines = document.querySelectorAll(
      ".monaco-editor .view-lines .view-line",
    );
    if (lines.length > 0) {
      return Array.from(lines)
        .map((l) => l.textContent)
        .join("\n");
    }
  } catch {}
  return "";
}

/** Reads generic failure-like output in a platform-agnostic way. */
function readGenericTestFailures() {
  try {
    const resultLines = [];
    document
      .querySelectorAll("pre, .console-output, [role='alert']")
      .forEach((el) => {
        const t = (el.textContent || "").trim();
        if (t && t.length > 4) resultLines.push(t);
      });
    return resultLines.filter(Boolean).slice(0, 8).join("\n\n");
  } catch {
    return "";
  }
}

const PANEL_STYLE = `
  #cl-ai-panel * { box-sizing: border-box; }
  #cl-ai-panel { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
  #cl-ai-messages::-webkit-scrollbar { width: 4px; }
  #cl-ai-messages::-webkit-scrollbar-track { background: transparent; }
  #cl-ai-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
  #cl-ai-input:focus { outline: none; border-color: rgba(6,182,212,0.5); }
  .cl-ai-msg-user { background: rgba(6,182,212,0.12); border: 1px solid rgba(6,182,212,0.25); color: #a5f3fc; align-self: flex-end; }
  .cl-ai-msg-ai { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #cbd5e1; align-self: flex-start; }
  .cl-ai-msg-base { padding: 8px 10px; border-radius: 10px; font-size: 12px; line-height: 1.5; max-width: 90%; white-space: pre-wrap; word-break: break-word; }
  @keyframes cl-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .cl-thinking { animation: cl-pulse 1.4s ease-in-out infinite; }
  #cl-ai-send:hover:not(:disabled) { background: rgba(6,182,212,0.25); }
  #cl-ai-send:disabled { opacity: 0.4; cursor: not-allowed; }
  #cl-ai-clear:hover { color: #94a3b8; }
  #cl-ai-open:hover { color: #67e8f9; border-color: rgba(6,182,212,0.35); }
  #cl-ai-close-confirm { display: none; }
  #cl-ai-close-confirm.visible { display: block; }
  .cl-ai-apply-btn { display:inline-block;margin-top:5px;font-size:10px;padding:2px 8px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.28);border-radius:6px;color:#67e8f9;cursor:pointer;font-family:inherit;transition:background 0.15s; }
  .cl-ai-apply-btn:hover { background:rgba(6,182,212,0.22); }
  .cl-ai-kbd-hint { font-size:9px;color:#334155;margin-left:4px;letter-spacing:0.02em; }
`;

const TEMP_CHAT_KEY = (slug) =>
  `cl-temp-chat-${String(slug || "global").trim()}`;

export function createFloatingAI(slug = "", opts = {}) {
  const platform = { ...DEFAULT_PLATFORM, ...(opts.platform || {}) };
  const { position = { bottom: "70px", right: "20px" } } = opts;

  let messages = [];
  let pending = false;
  let expanded = false;
  let chatId = null;
  let copyableEnabled = false;
  let chatMode = "guided"; // "guided" (Socratic default) or "direct"

  // Load persisted mode
  chrome.storage.local.get("cl_chat_mode", (res) => {
    const v = res?.cl_chat_mode;
    if (v === "direct" || v === "guided") chatMode = v;
    if (modeBtnEl) updateModeBtnLabel();
  });

  let modeBtnEl = null;
  function updateModeBtnLabel() {
    if (!modeBtnEl) return;
    modeBtnEl.textContent = chatMode === "guided" ? "Guided" : "Direct";
    modeBtnEl.title =
      chatMode === "guided"
        ? "Socratic mode: AI asks questions instead of giving answers. Click to switch to Direct."
        : "Direct mode: AI answers directly. Click to switch to Guided (Socratic).";
    modeBtnEl.style.color = chatMode === "guided" ? "#67e8f9" : "#94a3b8";
    modeBtnEl.style.borderColor =
      chatMode === "guided" ? "rgba(6,182,212,0.35)" : "rgba(255,255,255,0.12)";
  }
  let copyPrompt = null;
  let copyPromptTimer = null;

  function openAIChatsPage() {
    if (typeof platform.openAIChatsPage === "function") {
      platform.openAIChatsPage({ slug, input, window });
      return;
    }
    const chatSlug = String(slug || "").trim();
    const chatPrompt = String(input?.value || "").trim();
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
      const url = chrome.runtime.getURL(
        `library/library.html?${params.toString()}`,
      );
      window.open(url, "_blank");
    } catch (_) {}
  }

  // Inject styles once
  if (!document.getElementById("cl-ai-styles")) {
    const style = document.createElement("style");
    style.id = "cl-ai-styles";
    style.textContent = PANEL_STYLE;
    document.head.appendChild(style);
  }

  // ── Root container ──────────────────────────────────────────────────────────
  const root = document.createElement("div");
  root.id = "cl-ai-panel";
  Object.assign(root.style, {
    position: "fixed",
    bottom: position.bottom,
    right: position.right,
    zIndex: "2147483646",
    userSelect: "none",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "0",
  });

  // ── Expanded panel ──────────────────────────────────────────────────────────
  const panel = document.createElement("div");
  Object.assign(panel.style, {
    width: "320px",
    background: "rgba(10,10,20,0.96)",
    border: "1px solid rgba(6,182,212,0.25)",
    borderRadius: "14px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(6,182,212,0.08)",
    backdropFilter: "blur(12px)",
    display: "none",
    flexDirection: "column",
    marginBottom: "8px",
    overflow: "hidden",
    maxHeight: "420px",
  });

  // Panel header
  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px 8px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    flexShrink: "0",
  });
  header.innerHTML = `
    <span style="font-size:12px;font-weight:600;color:#94a3b8;letter-spacing:0.04em;display:flex;align-items:center;gap:6px;">
      <span style="font-size:14px;">✦</span> AI Assistant<span class="cl-ai-kbd-hint">Alt+\`</span>
    </span>
    <div style="display:flex;align-items:center;gap:6px;">
      <button id="cl-ai-mode" title="Toggle guided/direct mode" style="background:none;border:1px solid rgba(255,255,255,0.12);cursor:pointer;color:#94a3b8;font-size:10px;padding:2px 6px;border-radius:999px;transition:color 0.15s,border-color 0.15s;">Guided</button>
      <button id="cl-ai-open" title="Open AI Chats" style="background:none;border:1px solid rgba(255,255,255,0.12);cursor:pointer;color:#94a3b8;font-size:10px;padding:2px 6px;border-radius:999px;transition:color 0.15s,border-color 0.15s;">Chats</button>
      <button id="cl-ai-clear" title="Clear chat" style="background:none;border:none;cursor:pointer;color:#475569;font-size:11px;padding:2px 4px;border-radius:4px;transition:color 0.15s;">Clear</button>
      <button id="cl-ai-close" title="Close panel" style="background:none;border:none;cursor:pointer;color:#64748b;font-size:14px;line-height:1;padding:2px 4px;border-radius:4px;transition:color 0.15s;">×</button>
    </div>
  `;

  // Message list
  const msgList = document.createElement("div");
  msgList.id = "cl-ai-messages";
  Object.assign(msgList.style, {
    flex: "1",
    overflowY: "auto",
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minHeight: "120px",
    maxHeight: "280px",
    userSelect: "text",
  });

  // Input area
  const inputRow = document.createElement("div");
  Object.assign(inputRow.style, {
    display: "flex",
    gap: "6px",
    padding: "8px 10px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    flexShrink: "0",
  });

  const input = document.createElement("textarea");
  input.id = "cl-ai-input";
  input.rows = 1;
  input.placeholder =
    "Ask… (Enter to send, Shift+Enter for newline, / for commands)";
  Object.assign(input.style, {
    flex: "1",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    padding: "6px 10px",
    fontSize: "12px",
    color: "#e2e8f0",
    minWidth: "0",
    resize: "none",
    overflow: "hidden",
    lineHeight: "1.4",
    maxHeight: "120px",
    overflowY: "hidden",
    fontFamily: "inherit",
    transition: "border-color 0.15s",
  });

  const sendBtn = document.createElement("button");
  sendBtn.id = "cl-ai-send";
  sendBtn.textContent = "→";
  Object.assign(sendBtn.style, {
    background: "rgba(6,182,212,0.15)",
    border: "1px solid rgba(6,182,212,0.3)",
    borderRadius: "8px",
    padding: "6px 10px",
    color: "#06b6d4",
    fontSize: "13px",
    cursor: "pointer",
    flexShrink: "0",
    transition: "background 0.15s",
  });

  // Command autocomplete dropdown
  const autocompleteEl = document.createElement("div");
  autocompleteEl.id = "cl-ai-autocomplete";
  Object.assign(autocompleteEl.style, {
    position: "absolute",
    bottom: "100%",
    left: "0",
    right: "0",
    marginBottom: "4px",
    background: "rgba(10,10,20,0.97)",
    border: "1px solid rgba(6,182,212,0.25)",
    borderRadius: "10px",
    boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
    display: "none",
    flexDirection: "column",
    zIndex: "2",
    maxHeight: "180px",
    overflowY: "auto",
  });
  inputRow.style.position = "relative";
  // Append autocomplete to inputRow before input so absolute positioning works;
  // input is not yet a child at this point, so insertBefore would throw.
  inputRow.appendChild(autocompleteEl);

  function showAutocomplete(query) {
    const cmds = CHAT_COMMANDS.filter(
      (c) =>
        !query ||
        c.id.startsWith(query) ||
        c.label?.toLowerCase().includes(query),
    );
    if (!cmds.length) {
      hideAutocomplete();
      return;
    }
    autocompleteEl.innerHTML = "";
    cmds.forEach((cmd) => {
      const item = document.createElement("div");
      Object.assign(item.style, {
        padding: "6px 12px",
        cursor: "pointer",
        display: "flex",
        alignItems: "baseline",
        gap: "10px",
        fontSize: "11px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      });
      item.innerHTML = `<span style="color:#06b6d4;font-family:monospace;font-weight:700;flex-shrink:0">/${cmd.id}</span><span style="color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cmd.description || cmd.label || ""}</span>`;
      item.addEventListener("mouseenter", () => {
        item.style.background = "rgba(6,182,212,0.1)";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "";
      });
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const val = input.value;
        const lastSlash = val.lastIndexOf("/");
        input.value = val.slice(0, lastSlash) + "/" + cmd.id + " ";
        hideAutocomplete();
        autoGrow();
        input.focus();
      });
      autocompleteEl.appendChild(item);
    });
    autocompleteEl.style.display = "flex";
  }

  function hideAutocomplete() {
    autocompleteEl.style.display = "none";
  }

  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  }

  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);

  panel.appendChild(header);
  panel.appendChild(msgList);
  panel.appendChild(inputRow);

  const copyPromptEl = document.createElement("div");
  Object.assign(copyPromptEl.style, {
    position: "fixed",
    zIndex: "2147483647",
    display: "none",
  });
  document.body.appendChild(copyPromptEl);

  const closeConfirmEl = document.createElement("div");
  closeConfirmEl.id = "cl-ai-close-confirm";
  closeConfirmEl.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(2,6,23,0.78);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:2147483647;padding:16px;">
      <div style="width:min(380px,calc(100vw - 32px));background:#0b1220;border:1px solid rgba(56,189,248,0.18);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.55);padding:18px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="width:34px;height:34px;border-radius:999px;background:rgba(6,182,212,0.12);display:flex;align-items:center;justify-content:center;color:#67e8f9;">?</div>
          <div>
            <div style="font-size:14px;font-weight:700;color:#e2e8f0;">Save this conversation?</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:3px;">Your current AI chat is not saved yet.</div>
          </div>
        </div>
        <div style="font-size:11px;color:#64748b;line-height:1.55;margin-bottom:14px;">Save it to AI Chats now, or discard the draft and close the panel.</div>
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
          <button id="cl-ai-close-cancel" style="background:#ffffff0d;border:1px solid rgba(255,255,255,0.08);color:#cbd5e1;padding:8px 12px;border-radius:10px;font-size:11px;cursor:pointer;">Keep editing</button>
          <button id="cl-ai-close-discard" style="background:rgba(244,63,94,0.12);border:1px solid rgba(244,63,94,0.25);color:#fecdd3;padding:8px 12px;border-radius:10px;font-size:11px;cursor:pointer;">Discard</button>
          <button id="cl-ai-close-save" style="background:rgba(6,182,212,0.16);border:1px solid rgba(6,182,212,0.25);color:#a5f3fc;padding:8px 12px;border-radius:10px;font-size:11px;cursor:pointer;">Save & open chats</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(closeConfirmEl);

  // ── Toggle button ───────────────────────────────────────────────────────────
  const toggle = document.createElement("button");
  Object.assign(toggle.style, {
    background: "rgba(10,10,20,0.92)",
    border: "1px solid rgba(6,182,212,0.3)",
    borderRadius: "10px",
    padding: "6px 10px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    color: "#94a3b8",
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(6,182,212,0.08)",
    backdropFilter: "blur(8px)",
    transition: "border-color 0.2s, color 0.2s",
    userSelect: "none",
  });
  toggle.innerHTML = `<span style="font-size:13px;opacity:0.8;">✦</span><span style="font-weight:600;letter-spacing:0.03em;">AI</span>`;
  toggle.title = "CodeLedger AI Assistant";

  root.appendChild(panel);
  root.appendChild(toggle);
  document.body.appendChild(root);

  getChatsByProblem(slug)
    .then((chats) => {
      const latest = chats?.[0];
      if (!latest) return;
      chatId = latest.id;
      messages = latest.messages || [];
      renderMessages();
    })
    .catch(() => {});

  try {
    const tempRaw = sessionStorage.getItem(TEMP_CHAT_KEY(slug));
    if (tempRaw) {
      const temp = JSON.parse(tempRaw);
      if (
        Array.isArray(temp?.messages) &&
        temp.messages.length > 0 &&
        messages.length === 0
      ) {
        messages = temp.messages;
        renderMessages();
      }
    }
  } catch (_) {}

  Storage.getSettings()
    .then((settings) => {
      copyableEnabled = settings?.aiCopyable === true;
    })
    .catch(() => {});

  // ── Render ──────────────────────────────────────────────────────────────────

  function applyCodeToEditor(code) {
    try {
      const activeEd = window.monaco?.editor?.getActiveCodeEditor?.();
      if (activeEd) {
        activeEd.getModel()?.setValue?.(code);
        return true;
      }
      const eds = window.monaco?.editor?.getEditors?.();
      if (eds?.length) {
        eds[0].getModel()?.setValue?.(code);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function addApplyButtons(bubble) {
    bubble.querySelectorAll("pre").forEach((pre) => {
      const codeEl = pre.querySelector("code");
      const codeText = (codeEl ? codeEl.textContent : pre.textContent) || "";
      if (codeText.trim().length < 8) return;
      const btn = document.createElement("button");
      btn.className = "cl-ai-apply-btn";
      btn.textContent = "Apply to editor";
      btn.title = "Replace editor content with this code block";
      btn.addEventListener("click", () => {
        const ok = applyCodeToEditor(codeText);
        btn.textContent = ok ? "✓ Applied!" : "✗ Editor not found";
        setTimeout(() => {
          btn.textContent = "Apply to editor";
        }, 2000);
      });
      pre.after(btn);
    });
  }

  function renderMessages(scrollToNew = false) {
    msgList.innerHTML = "";
    if (messages.length === 0) {
      const empty = document.createElement("div");
      Object.assign(empty.style, {
        textAlign: "center",
        color: "#475569",
        fontSize: "11px",
        padding: "24px 8px",
        lineHeight: "1.6",
      });
      empty.textContent =
        "Ask anything about the problem or your current solution.";
      msgList.appendChild(empty);
      return;
    }
    let lastAiBubble = null;
    for (const msg of messages) {
      const bubble = document.createElement("div");
      bubble.className = `cl-ai-msg-base ${msg.role === "user" ? "cl-ai-msg-user" : "cl-ai-msg-ai"}`;
      bubble.style.userSelect = "text";
      if (msg.role === "user") {
        bubble.textContent = msg.content;
      } else {
        bubble.innerHTML = parseMarkdown(msg.content || "");
        addApplyButtons(bubble);
        lastAiBubble = bubble;
      }
      msgList.appendChild(bubble);
    }
    if (scrollToNew && lastAiBubble) {
      // Scroll so the top of the new AI message is visible
      requestAnimationFrame(() => {
        lastAiBubble.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } else {
      msgList.scrollTop = msgList.scrollHeight;
    }
  }

  function persistTempChat() {
    try {
      sessionStorage.setItem(
        TEMP_CHAT_KEY(slug),
        JSON.stringify({
          slug,
          messages,
          chatId,
          platform: platform.chatPlatform || "leetcode",
          updatedAt: Date.now(),
        }),
      );
    } catch (_) {}
  }

  function clearTempChat() {
    try {
      sessionStorage.removeItem(TEMP_CHAT_KEY(slug));
    } catch (_) {}
  }

  function hasUnsavedConversation() {
    return !chatId && Array.isArray(messages) && messages.length > 0;
  }

  function buildSaveRecord() {
    const pageMeta =
      typeof platform.readPageMeta === "function"
        ? platform.readPageMeta({ slug, window, document })
        : readGenericPageMeta();
    const code =
      (typeof platform.readEditorCode === "function"
        ? platform.readEditorCode({ slug, window, document })
        : readEditorCode()) || "";
    const latestUserMessage =
      [...messages].reverse().find((msg) => msg?.role === "user")?.content ||
      "";
    const context = buildAIChatContext({
      surface: "floating-panel",
      text: latestUserMessage,
      title: pageMeta.title || platform.titleFallback || slug,
      difficulty: pageMeta.difficulty || "",
      platform: platform.chatPlatform || "leetcode",
      code,
      lang: { name: "" },
      problem: {
        title: pageMeta.title || platform.titleFallback || slug,
        statement: "",
        description: "",
        constraints: "",
        code,
        platform: platform.chatPlatform || "leetcode",
        difficulty: pageMeta.difficulty || "",
        lang: { name: "" },
      },
      attachedProblemSlugs: slug ? [slug] : [],
      attachedProblems: slug
        ? [
            {
              slug,
              title: pageMeta.title || slug,
              platform: platform.chatPlatform || "leetcode",
              url: window.location.href,
            },
          ]
        : [],
    });

    return {
      context,
      meta: {
        problemSlug: slug,
        problemURL: window.location.href,
        platform: platform.chatPlatform || "leetcode",
        problemTitle: pageMeta.title || slug,
        attachedProblemSlugs: slug ? [slug] : [],
        attachedProblems: slug
          ? [
              {
                slug,
                title: pageMeta.title || slug,
                platform: platform.chatPlatform || "leetcode",
                url: window.location.href,
              },
            ]
          : [],
        surface: "floating-panel",
        requestType: context.requestType || "",
        usedCommands: context.usedCommands || [],
        requestTemplate: latestUserMessage || "",
        summary: (
          latestUserMessage || messages.map((m) => m.content || "").join(" ")
        ).slice(0, 120),
      },
    };
  }

  function collapsePanel() {
    expanded = false;
    panel.style.display = "none";
    toggle.style.borderColor = "rgba(6,182,212,0.3)";
    toggle.style.color = "#94a3b8";
  }

  function showCloseConfirm() {
    closeConfirmEl.classList.add("visible");
  }

  function hideCloseConfirm() {
    closeConfirmEl.classList.remove("visible");
  }

  async function saveConversationAndOpenChats() {
    if (!messages.length) return;
    const { context, meta } = buildSaveRecord();
    if (chatId) {
      await updateAIChat(chatId, messages, meta).catch(() => {});
    } else {
      chatId = await saveAIChat(
        slug,
        window.location.href,
        messages,
        platform.chatPlatform || "leetcode",
        meta,
      ).catch(() => null);
    }
    clearTempChat();
    try {
      chrome.runtime
        .sendMessage({
          type: "AI_CHAT_UPDATED",
          chatId,
          problemSlug: slug,
          surface: "floating-panel",
          context,
        })
        .catch(() => {});
    } catch (_) {}
    openAIChatsPage();
    hideCloseConfirm();
    collapsePanel();
  }

  // × just collapses the panel; destroy() is only for SPA navigation teardown.
  function requestClose() {
    if (hasUnsavedConversation()) {
      showCloseConfirm();
      return;
    }
    collapsePanel();
  }

  function hideCopyPrompt() {
    copyPrompt = null;
    copyPromptEl.style.display = "none";
    copyPromptEl.innerHTML = "";
    if (copyPromptTimer) {
      clearTimeout(copyPromptTimer);
      copyPromptTimer = null;
    }
  }

  function showCopyPrompt(text, x, y) {
    if (!copyableEnabled) return;
    copyPrompt = { text, x, y };
    copyPromptEl.style.left = `${Math.max(8, x)}px`;
    copyPromptEl.style.top = `${Math.max(8, y)}px`;
    copyPromptEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;background:#1e293b;border:1px solid rgba(148,163,184,0.35);border-radius:10px;padding:8px 10px;box-shadow:0 12px 40px rgba(0,0,0,0.35);max-width:260px;">
        <span style="font-size:11px;color:#cbd5e1;">Copy text?</span>
        <button id="cl-ai-copy-now" style="background:#0891b2;color:white;border:none;border-radius:8px;padding:4px 8px;font-size:11px;cursor:pointer;">Copy</button>
        <span style="font-size:10px;color:#64748b;">15 min</span>
      </div>
    `;
    copyPromptEl.style.display = "block";
    const btn = copyPromptEl.querySelector("#cl-ai-copy-now");
    if (btn) {
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {}
        hideCopyPrompt();
      });
    }
    if (copyPromptTimer) clearTimeout(copyPromptTimer);
    copyPromptTimer = setTimeout(hideCopyPrompt, 15 * 60 * 1000);
  }

  function maybeShowCopyPrompt() {
    if (!copyableEnabled) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hideCopyPrompt();
      return;
    }
    const range = selection.rangeCount ? selection.getRangeAt(0) : null;
    if (!range) return;
    // Ensure the selection is inside the message list (covers text nodes too)
    const container =
      range.commonAncestorContainer &&
      (range.commonAncestorContainer.nodeType === 3
        ? range.commonAncestorContainer.parentElement
        : range.commonAncestorContainer);
    if (!container || !msgList.contains(container)) return;
    // Clone the range contents to reliably extract text in document order
    const frag = range.cloneContents();
    const tmp = document.createElement("div");
    tmp.appendChild(frag);
    const text = tmp.innerText || tmp.textContent || "";
    if (!text || text.length < 10) return;
    const rect = range.getBoundingClientRect?.();
    if (!rect) return;
    // Preserve whitespace exactly as rendered (do not trim)
    showCopyPrompt(
      text,
      rect.left + window.scrollX,
      rect.bottom + window.scrollY + 10,
    );
  }

  function setThinking(on) {
    const existing = document.getElementById("cl-ai-thinking");
    if (on && !existing) {
      const bubble = document.createElement("div");
      bubble.id = "cl-ai-thinking";
      bubble.className = "cl-ai-msg-base cl-ai-msg-ai cl-thinking";
      bubble.textContent = "Thinking…";
      msgList.appendChild(bubble);
      msgList.scrollTop = msgList.scrollHeight;
    } else if (!on && existing) {
      existing.remove();
    }
  }

  function showError(msg) {
    const err = document.createElement("div");
    Object.assign(err.style, {
      fontSize: "11px",
      color: "#f87171",
      padding: "4px 2px",
      alignSelf: "flex-start",
    });
    err.textContent = "⚠ " + msg;
    msgList.appendChild(err);
    msgList.scrollTop = msgList.scrollHeight;
    setTimeout(() => err.remove(), 6000);
  }

  renderMessages();

  // ── Event handlers ──────────────────────────────────────────────────────────

  toggle.addEventListener("click", () => {
    expanded = !expanded;
    panel.style.display = expanded ? "flex" : "none";
    toggle.style.borderColor = expanded
      ? "rgba(6,182,212,0.5)"
      : "rgba(6,182,212,0.3)";
    toggle.style.color = expanded ? "#06b6d4" : "#94a3b8";
    if (expanded) {
      renderMessages();
      setTimeout(() => input.focus(), 50);
    }
  });

  const clearBtn = header.querySelector("#cl-ai-clear");
  const openBtn = header.querySelector("#cl-ai-open");
  const closeBtn = header.querySelector("#cl-ai-close");
  modeBtnEl = header.querySelector("#cl-ai-mode");
  updateModeBtnLabel();
  modeBtnEl.addEventListener("click", async () => {
    chatMode = chatMode === "guided" ? "direct" : "guided";
    updateModeBtnLabel();
    chrome.storage.local.set({ cl_chat_mode: chatMode });
  });
  openBtn.addEventListener("click", openAIChatsPage);
  closeBtn.addEventListener("click", requestClose);
  clearBtn.addEventListener("click", () => {
    messages = [];
    if (chatId) {
      deleteChat(chatId).catch(() => {});
      chatId = null;
    }
    clearTempChat();
    renderMessages();
  });

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || pending) return;

    const code =
      (typeof platform.readEditorCode === "function"
        ? platform.readEditorCode({ slug, window, document })
        : readEditorCode()) || "";
    const langName =
      (typeof platform.readEditorLang === "function"
        ? platform.readEditorLang()
        : "") || "";
    const problemStatement =
      (typeof platform.readProblemStatement === "function"
        ? platform.readProblemStatement()
        : "") || "";
    const pageMeta =
      typeof platform.readPageMeta === "function"
        ? platform.readPageMeta({ slug, window, document })
        : readGenericPageMeta();
    const rawErrors =
      (typeof platform.readTestFailures === "function"
        ? platform.readTestFailures({ slug, window, document })
        : readGenericTestFailures()) || "";
    const baseContext = buildAIChatContext({
      surface: "floating-panel",
      chatMode,
      text,
      title: pageMeta.title || platform.titleFallback || slug,
      difficulty: pageMeta.difficulty || "",
      platform: platform.chatPlatform || "leetcode",
      code: code || "",
      lang: langName ? { name: langName } : { name: "" },
      problemStatement: problemStatement || "",
      problem: {
        title: pageMeta.title || platform.titleFallback || slug,
        statement: problemStatement || "",
        description: problemStatement || "",
        constraints: "",
        code: code || "",
        platform: platform.chatPlatform || "leetcode",
        difficulty: pageMeta.difficulty || "",
        lang: langName ? { name: langName } : { name: "" },
      },
      attachedProblemSlugs: slug ? [slug] : [],
      attachedProblems: slug
        ? [
            {
              slug,
              title: pageMeta.title || slug,
              platform: platform.chatPlatform || "leetcode",
              url: window.location.href,
            },
          ]
        : [],
      errors: rawErrors,
    });
    const context =
      typeof platform.buildChatContext === "function"
        ? platform.buildChatContext({
            baseContext,
            text,
            pageMeta,
            code,
            errors: rawErrors,
            slug,
            window,
            document,
          })
        : baseContext;

    // Expand variables in the input (e.g., /mycode → code block)
    const expandedText = await expandChatVariables(text, {
      problem: context.problem || {},
      userCode: code || "",
      errors: rawErrors, // raw string — bypass normalizeList in buildAIChatContext
      submission: context.submission || {},
      hints: context.hints || [],
      similar: context.similar || [],
      constraints: context.constraints || "",
    }).catch(() => text);

    // Track which commands were used
    const usedCommands = getUsedCommands(text);

    const userMsg = { role: "user", content: expandedText };
    messages = [...messages, userMsg];
    input.value = "";
    autoGrow();
    pending = true;
    sendBtn.disabled = true;
    renderMessages();
    persistTempChat();
    setThinking(true);

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: "AI_CHAT",
            messages: messages.map(({ role, content }) => ({
              role,
              content,
            })),
            context,
          },
          (resp) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (resp?.ok) {
              resolve(resp.response);
            } else {
              reject(new Error(resp?.error || "AI request failed"));
            }
          },
        );
      });

      const aiMsg = { role: "assistant", content: response };
      messages = [...messages, aiMsg];
      const problemRecord = {
        problemSlug: slug,
        problemURL: window.location.href,
        platform: platform.chatPlatform || "leetcode",
        problemTitle: pageMeta.title || slug,
        attachedProblemSlugs: slug ? [slug] : [],
        attachedProblems: slug
          ? [
              {
                slug,
                title: pageMeta.title || slug,
                platform: platform.chatPlatform || "leetcode",
                url: window.location.href,
              },
            ]
          : [],
        surface: "floating-panel",
        requestType: context.requestType || "",
        usedCommands: context.usedCommands || [],
        requestTemplate: text,
        summary: text.slice(0, 120),
        usedCommands, // include detected commands from this message
      };
      if (chatId) {
        await updateAIChat(chatId, messages, problemRecord).catch(() => {});
      } else {
        chatId = await saveAIChat(
          slug,
          window.location.href,
          messages,
          "leetcode",
          problemRecord,
        ).catch(() => null);
      }
      persistTempChat();

      // Broadcast chat update to all other surfaces (e.g., library view)
      try {
        chrome.runtime
          .sendMessage({
            type: "AI_CHAT_UPDATED",
            chatId,
            problemSlug: slug,
            surface: "floating-panel",
          })
          .catch(() => {});
      } catch (_) {}
    } catch (e) {
      showError(e.message);
      // Remove the optimistic user message on failure
      messages = messages.slice(0, -1);
      persistTempChat();
    } finally {
      pending = false;
      sendBtn.disabled = false;
      setThinking(false);
      renderMessages(true);
    }
  }

  msgList.addEventListener("mouseup", maybeShowCopyPrompt);
  msgList.addEventListener("keyup", maybeShowCopyPrompt);
  document.addEventListener("selectionchange", maybeShowCopyPrompt);
  document.addEventListener("click", (e) => {
    if (!copyPromptEl.contains(e.target)) {
      hideCopyPrompt();
    }
  });

  closeConfirmEl
    .querySelector("#cl-ai-close-cancel")
    ?.addEventListener("click", hideCloseConfirm);
  closeConfirmEl
    .querySelector("#cl-ai-close-discard")
    ?.addEventListener("click", () => {
      if (chatId) {
        deleteChat(chatId).catch(() => {});
        chatId = null;
      }
      messages = [];
      clearTempChat();
      hideCloseConfirm();
      collapsePanel();
    });
  closeConfirmEl
    .querySelector("#cl-ai-close-save")
    ?.addEventListener("click", () => {
      saveConversationAndOpenChats().catch(() => {
        hideCloseConfirm();
      });
    });

  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      hideAutocomplete();
      sendMessage();
    }
    if (e.key === "Escape") {
      hideAutocomplete();
    }
  });

  input.addEventListener("input", () => {
    autoGrow();
    const val = input.value;
    const match = val.match(/\/(\w*)$/);
    if (match) {
      showAutocomplete(match[1]);
    } else {
      hideAutocomplete();
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(hideAutocomplete, 150);
  });

  // ── Drag support ────────────────────────────────────────────────────────────
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let origRight = 0;
  let origBottom = 0;

  toggle.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const rect = root.getBoundingClientRect();
    origRight = window.innerWidth - rect.right;
    origBottom = window.innerHeight - rect.bottom;
    toggle.style.cursor = "grabbing";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    const newRight = Math.max(4, origRight - dx);
    const newBottom = Math.max(4, origBottom - dy);
    root.style.right = newRight + "px";
    root.style.bottom = newBottom + "px";
  });

  document.addEventListener("mouseup", (e) => {
    if (!dragging) return;
    dragging = false;
    toggle.style.cursor = "pointer";
    // If barely moved, treat as a click — toggle will handle it naturally
  });

  // ── Persistence: re-attach panel if DOM gets mutated (e.g., tab switch) ─────
  let persistenceObserver = null;
  function ensurePanelAttached() {
    if (!root.parentElement) {
      document.body.appendChild(root);
    }
  }

  function startPersistenceMonitor() {
    if (persistenceObserver) return;
    persistenceObserver = new MutationObserver(() => {
      // On any DOM mutation, check if panel is still attached
      setTimeout(ensurePanelAttached, 0);
    });
    persistenceObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  startPersistenceMonitor();
  // Keyboard shortcut: Alt+` toggles the panel
  const _kbHandler = (e) => {
    if (e.altKey && e.key === "`") {
      e.preventDefault();
      toggle.click();
    }
  };
  document.addEventListener("keydown", _kbHandler);

  return {
    destroy(options = {}) {
      const force = options?.force === true;
      if (!force && hasUnsavedConversation()) {
        showCloseConfirm();
        return false;
      }
      persistTempChat();
      // Disconnect observer BEFORE DOM removal to prevent ensurePanelAttached
      // from firing on the mutation caused by root.remove().
      if (persistenceObserver) {
        persistenceObserver.disconnect();
        persistenceObserver = null;
      }
      document.removeEventListener("keydown", _kbHandler);
      root.remove();
      copyPromptEl.remove();
      closeConfirmEl.remove();
      const styleEl = document.getElementById("cl-ai-styles");
      if (styleEl) styleEl.remove();
      return true;
    },
    /** Programmatically expand the panel (e.g., from toolbar button). */
    expand() {
      if (!expanded) toggle.click();
    },
    /** Expand and pre-fill the input (e.g., /review for selected code). */
    preFill(text) {
      this.expand();
      setTimeout(() => {
        input.value = text || "";
        autoGrow();
        input.focus();
      }, 60);
    },
  };
}
