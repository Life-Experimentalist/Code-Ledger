/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The copy-and-paste round trip for the `manual` AI provider.
 *
 * Content-script safe — no framework, no bundler, no Tailwind, same idiom as
 * floating-ai.js. It has to be: this runs both inside the library page and on
 * top of leetcode.com, and the second one has no stylesheet of ours.
 *
 * `askHuman()` shows the prompt CodeLedger built, offers to copy it, and waits
 * for the reply to be pasted back. It resolves with that text or rejects if the
 * exchange is cancelled — which is the same contract `review()` has with every
 * other provider, so nothing downstream has to know a person was involved.
 *
 * Install it with `setManualPromptResolver(askHuman)`; see core/manual-bridge.js
 * for why the handler cannot import this file directly.
 */

const OVERLAY_ID = "cl-manual-exchange";

/** @type {null | (() => void)} */
let closeOpen = null;

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) Object.assign(node.style, style);
  if (text != null) node.textContent = text;
  return node;
}

function button(label, accent) {
  return el(
    "button",
    {
      font: "inherit",
      fontSize: "12px",
      fontWeight: "600",
      padding: "7px 14px",
      borderRadius: "8px",
      cursor: "pointer",
      border: accent ? "1px solid rgba(6,182,212,0.5)" : "1px solid rgba(255,255,255,0.14)",
      background: accent ? "rgba(6,182,212,0.18)" : "transparent",
      color: accent ? "#67e8f9" : "#94a3b8",
    },
    label,
  );
}

/**
 * Put text on the clipboard, from wherever this happens to be running.
 *
 * The async Clipboard API is the right one and is what a library page gets. A
 * content script on somebody else's site may be denied it by that site's
 * permissions policy, and there the old selection-based copy still works — so
 * fall back rather than telling the user to select the box themselves.
 *
 * @param {HTMLTextAreaElement} source
 */
async function copyFrom(source) {
  try {
    await navigator.clipboard.writeText(source.value);
    return true;
  } catch (_) {
    try {
      source.focus();
      source.select();
      return document.execCommand("copy");
    } catch (_e) {
      return false;
    }
  }
}

/**
 * Show a prompt to the person at the keyboard and wait for their answer.
 *
 * @param {string} prompt the full prompt CodeLedger built
 * @param {{title?: string, difficulty?: string}} [meta]
 * @returns {Promise<string>} what they pasted back
 */
export function askHuman(prompt, meta = {}) {
  // One exchange at a time. A second prompt while the first is open would stack
  // two overlays and leave the earlier promise pending forever.
  if (closeOpen) closeOpen();

  return new Promise((resolve, reject) => {
    const overlay = el("div", {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      background: "rgba(2,6,23,0.72)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    });
    overlay.id = OVERLAY_ID;

    const card = el("div", {
      width: "min(680px, 100%)",
      maxHeight: "90vh",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      padding: "18px",
      borderRadius: "14px",
      background: "rgba(10,10,20,0.98)",
      border: "1px solid rgba(6,182,212,0.25)",
      boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
      color: "#e2e8f0",
      font: "13px/1.5 system-ui, -apple-system, Segoe UI, sans-serif",
    });

    const subject = meta.title
      ? `${meta.title}${meta.difficulty ? ` · ${meta.difficulty}` : ""}`
      : "AI request";
    card.appendChild(
      el("div", { fontSize: "14px", fontWeight: "700", color: "#67e8f9" }, "Answer this yourself"),
    );
    card.appendChild(
      el(
        "div",
        { fontSize: "12px", color: "#94a3b8" },
        `${subject} — copy the prompt into any AI chat you use, then paste the reply below. Nothing is sent from here.`,
      ),
    );

    const promptBox = /** @type {HTMLTextAreaElement} */ (
      el("textarea", {
        width: "100%",
        minHeight: "120px",
        maxHeight: "34vh",
        resize: "vertical",
        padding: "10px",
        borderRadius: "8px",
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(255,255,255,0.03)",
        color: "#cbd5e1",
        font: "12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
      })
    );
    promptBox.readOnly = true;
    promptBox.value = prompt;
    card.appendChild(promptBox);

    const copyRow = el("div", { display: "flex", alignItems: "center", gap: "10px" });
    const copyBtn = button("Copy prompt", true);
    const copyNote = el("span", { fontSize: "11px", color: "#64748b" }, "");
    copyBtn.addEventListener("click", async () => {
      const ok = await copyFrom(promptBox);
      copyNote.textContent = ok ? "Copied." : "Copy blocked here — select the box and copy.";
      copyNote.style.color = ok ? "#4ade80" : "#fbbf24";
    });
    copyRow.appendChild(copyBtn);
    copyRow.appendChild(copyNote);
    card.appendChild(copyRow);

    const answerBox = /** @type {HTMLTextAreaElement} */ (
      el("textarea", {
        width: "100%",
        minHeight: "110px",
        maxHeight: "30vh",
        resize: "vertical",
        padding: "10px",
        borderRadius: "8px",
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(255,255,255,0.03)",
        color: "#e2e8f0",
        font: "inherit",
      })
    );
    answerBox.placeholder = "Paste the reply here…";
    card.appendChild(answerBox);

    const actions = el("div", { display: "flex", justifyContent: "flex-end", gap: "8px" });
    const cancelBtn = button("Cancel", false);
    const useBtn = button("Use this answer", true);
    actions.appendChild(cancelBtn);
    actions.appendChild(useBtn);
    card.appendChild(actions);

    overlay.appendChild(card);

    let settled = false;
    const teardown = () => {
      if (closeOpen === teardown) closeOpen = null;
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
    };
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      teardown();
      fn();
    };
    const cancel = () => finish(() => reject(new Error("Manual answer cancelled.")));

    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        cancel();
      }
    }

    useBtn.addEventListener("click", () => {
      const text = answerBox.value.trim();
      // Nothing pasted is a cancel, not an empty review — an empty string here
      // would be committed as the review for that solve.
      if (!text) {
        answerBox.style.borderColor = "rgba(248,113,113,0.6)";
        answerBox.focus();
        return;
      }
      finish(() => resolve(text));
    });
    cancelBtn.addEventListener("click", cancel);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cancel();
    });
    // Capture phase: the host page may stop keydown before it reaches us.
    document.addEventListener("keydown", onKey, true);

    closeOpen = teardown;
    (document.body || document.documentElement).appendChild(overlay);
    answerBox.focus();
  });
}
