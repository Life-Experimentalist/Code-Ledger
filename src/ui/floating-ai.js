/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Self-contained floating AI assistant panel.
 * Content-script safe — no framework, no bundler, no Tailwind.
 * Returns a controller: { destroy }
 */

const CHAT_KEY = (slug) => `cl_ai_chat_${slug || "generic"}`;

function loadHistory(slug) {
  try { return JSON.parse(sessionStorage.getItem(CHAT_KEY(slug)) || "[]"); } catch { return []; }
}
function saveHistory(slug, msgs) {
  try { sessionStorage.setItem(CHAT_KEY(slug), JSON.stringify(msgs)); } catch {}
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
    const lines = document.querySelectorAll(".monaco-editor .view-lines .view-line");
    if (lines.length > 0) {
      return Array.from(lines).map((l) => l.textContent).join("\n");
    }
  } catch {}
  return "";
}

/** Reads page metadata — problem title and difficulty. */
function readPageMeta() {
  const titleEl =
    document.querySelector('[data-e2e-locator="question-title"]') ||
    document.querySelector('[data-cy="question-title"]') ||
    document.querySelector("h1");
  const diffEl =
    document.querySelector('[data-e2e-locator="question-difficulty"]') ||
    document.querySelector("div[diff]");
  return {
    title: titleEl?.textContent?.trim() || "",
    difficulty: diffEl?.textContent?.trim() || "",
  };
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
`;

export function createFloatingAI(slug = "", opts = {}) {
  const { position = { bottom: "70px", right: "20px" } } = opts;

  let messages = loadHistory(slug);
  let pending = false;
  let expanded = false;

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
      <span style="font-size:14px;">✦</span> AI Assistant
    </span>
    <button id="cl-ai-clear" title="Clear chat" style="background:none;border:none;cursor:pointer;color:#475569;font-size:11px;padding:2px 4px;border-radius:4px;transition:color 0.15s;">Clear</button>
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

  const input = document.createElement("input");
  input.id = "cl-ai-input";
  input.type = "text";
  input.placeholder = "Ask about complexity, approach…";
  Object.assign(input.style, {
    flex: "1",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    padding: "6px 10px",
    fontSize: "12px",
    color: "#e2e8f0",
    minWidth: "0",
    transition: "border-color 0.15s",
  });
  input.setAttribute("placeholder", "Ask about complexity, approach…");

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

  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);

  panel.appendChild(header);
  panel.appendChild(msgList);
  panel.appendChild(inputRow);

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

  // ── Render ──────────────────────────────────────────────────────────────────

  function renderMessages() {
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
      empty.textContent = "Ask anything about the problem or your current solution.";
      msgList.appendChild(empty);
      return;
    }
    for (const msg of messages) {
      const bubble = document.createElement("div");
      bubble.className = `cl-ai-msg-base ${msg.role === "user" ? "cl-ai-msg-user" : "cl-ai-msg-ai"}`;
      bubble.textContent = msg.content;
      msgList.appendChild(bubble);
    }
    msgList.scrollTop = msgList.scrollHeight;
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
    toggle.style.borderColor = expanded ? "rgba(6,182,212,0.5)" : "rgba(6,182,212,0.3)";
    toggle.style.color = expanded ? "#06b6d4" : "#94a3b8";
    if (expanded) {
      renderMessages();
      setTimeout(() => input.focus(), 50);
    }
  });

  const clearBtn = header.querySelector("#cl-ai-clear");
  clearBtn.addEventListener("click", () => {
    messages = [];
    saveHistory(slug, []);
    renderMessages();
  });

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || pending) return;

    const meta = readPageMeta();
    const code = readEditorCode();

    const userMsg = { role: "user", content: text };
    messages = [...messages, userMsg];
    input.value = "";
    pending = true;
    sendBtn.disabled = true;
    renderMessages();
    setThinking(true);

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: "AI_CHAT",
            messages: messages.map(({ role, content }) => ({ role, content })),
            context: {
              title: meta.title || slug,
              difficulty: meta.difficulty || "",
              code: code || "",
              lang: { name: "" },
            },
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
      saveHistory(slug, messages);
    } catch (e) {
      showError(e.message);
      // Remove the optimistic user message on failure
      messages = messages.slice(0, -1);
    } finally {
      pending = false;
      sendBtn.disabled = false;
      setThinking(false);
      renderMessages();
    }
  }

  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
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

  return {
    destroy() {
      root.remove();
      const styleEl = document.getElementById("cl-ai-styles");
      if (styleEl) styleEl.remove();
    },
  };
}
