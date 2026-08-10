/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Universal ProblemModal tab definitions for LeetCode and GeeksForGeeks.
 * Registers with modalTabRegistry on import.
 */

import { h, useState } from "../../../vendor/preact-bundle.js";
import { htm } from "../../../vendor/preact-bundle.js";
import { modalTabRegistry } from "../../../core/modal-tab-registry.js";
import { highlightCode } from "../../../lib/syntax-highlight.js";
import { sanitizeHtml } from "../../../lib/sanitize-html.js";
import { Storage } from "../../../core/storage.js";
import { CONSTANTS } from "../../../core/constants.js";

const html = htm.bind(h);
const IS_EXTENSION = !!globalThis.chrome?.runtime?.id;

function UniversalCodeTab({ problem, langName, copied, copyCode, onUpdate }) {
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");

  if (!problem.code) {
    const isGFG = problem.platform === "geeksforgeeks";
    const platformLabel = isGFG ? "GeeksForGeeks" : "LeetCode";
    const loginUrl = isGFG
      ? CONSTANTS.PLATFORMS.geeksforgeeks.baseUrl
      : CONSTANTS.PLATFORMS.leetcode.baseUrl;
    return html`
      <div class="flex flex-col items-center gap-4 py-12 text-center">
        <p class="text-slate-500 text-sm">Code was not extracted for this submission.</p>
        ${IS_EXTENSION
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
                ${recovering ? "Recovering code…" : `Recover Code from ${platformLabel}`}
              </button>
              ${recoveryError
                ? html` <p class="text-rose-400 text-xs max-w-xs">${recoveryError}</p>
                    <a
                      href=${loginUrl}
                      target="_blank"
                      rel="noopener"
                      class="text-[10px] text-cyan-500 hover:text-cyan-300 underline"
                    >
                      Open ${platformLabel} to log in, then retry
                    </a>`
                : ""}
              <p class="text-slate-600 text-[10px] max-w-xs">
                Opens a background tab to fetch your latest accepted submission. Make sure you are
                logged into ${platformLabel} first.
              </p>
            `
          : html`<p class="text-slate-600 text-xs">
              Open this problem in the extension to recover the code.
            </p>`}
      </div>
    `;
  }

  const rawLang = problem.lang?.slug || problem.lang?.name || problem.language || "";
  const highlighted = highlightCode(problem.code, rawLang);
  return html`<div class="flex flex-col gap-2">
    <div class="flex justify-between items-center">
      <span class="text-[10px] uppercase tracking-wider text-slate-600">
        ${langName || "Solution"}
      </span>
      <button
        onClick=${copyCode}
        class="text-[10px] px-2.5 py-1 rounded bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
      >
        ${copied ? "✓ Copied" : "Copy"}
      </button>
    </div>
    <pre
      class="text-xs leading-relaxed overflow-x-auto bg-black/50 rounded-xl border border-white/5 p-4 whitespace-pre font-mono m-0"
      dangerouslySetInnerHTML=${{ __html: highlighted }}
    ></pre>
  </div>`;
}

const universalTabs = [
  {
    id: "overview",
    label: "Overview",
    render(
      problem,
      { html, handleRefreshData, refreshing, problemUrl, problemList = [], onNavigateProblem },
    ) {
      if (!problem) return html`<div></div>`;
      return html` <div class="flex flex-col gap-4">
        ${problem.problemStatement
          ? html`
              <div
                class="text-sm text-slate-300 leading-relaxed lc-content"
                dangerouslySetInnerHTML=${{
                  // The statement is scraped markup. It renders both in the host
                  // page's world and in the extension's own library page, so it
                  // is reduced to attribute-free formatting tags first.
                  __html: sanitizeHtml(problem.problemStatement),
                }}
              ></div>
            `
          : html`
              <div class="flex flex-col items-center justify-center py-8 gap-3 text-center">
                <span class="text-2xl">📄</span>
                <p class="text-slate-400 text-sm">No problem statement cached locally.</p>
                <p class="text-slate-600 text-xs">Open to view the full description.</p>
                <div class="flex gap-2 mt-3">
                  <a
                    href=${problemUrl}
                    target="_blank"
                    rel="noopener"
                    class="text-xs text-cyan-400 hover:text-cyan-300"
                    >Open Platform ↗</a
                  >
                  <button
                    onClick=${handleRefreshData}
                    disabled=${refreshing}
                    class="text-[10px] px-3 py-1.5 rounded font-medium transition-all ${refreshing
                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/30 cursor-wait"
                      : "bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20"}"
                  >
                    ${refreshing ? "⏳ Fetching…" : "📥 Fetch Description"}
                  </button>
                </div>
              </div>
            `}
        ${problem.constraints
          ? html`
              <div class="mt-3 border-t border-white/5 pt-3">
                <p class="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Constraints</p>
                <pre
                  class="text-xs text-slate-400 font-mono whitespace-pre-wrap leading-relaxed bg-black/30 rounded-lg p-2 border border-white/5"
                >
${problem.constraints}</pre
                >
              </div>
            `
          : ""}
        ${problem.similar?.length
          ? html`
              <div class="mt-3 border-t border-white/5 pt-3">
                <p class="text-[10px] uppercase tracking-wider text-slate-600 mb-2">
                  Similar Problems
                </p>
                <div class="flex flex-col gap-1">
                  ${problem.similar.slice(0, 5).map((s) => {
                    const targetPlatform = problem.platform || "leetcode";
                    const inLibraryProblem = problemList.find(
                      (p) => p.platform === targetPlatform && p.titleSlug === s.titleSlug,
                    );
                    const sDiffClass =
                      {
                        Easy: "text-emerald-400",
                        Medium: "text-amber-400",
                        Hard: "text-rose-400",
                      }[s.difficulty] || "text-slate-400";

                    if (inLibraryProblem) {
                      return html` <div
                        onClick=${() => onNavigateProblem?.(inLibraryProblem)}
                        class="flex items-center justify-between py-1 px-2 rounded hover:bg-white/5 cursor-pointer transition-colors group"
                      >
                        <span class="text-xs text-slate-300 group-hover:text-cyan-300"
                          >${s.title || s.titleSlug}
                          <span class="text-[9px] opacity-70 ml-1.5 text-emerald-400"
                            >📚 In Library</span
                          ></span
                        >
                        <span class="text-[10px] ${sDiffClass} ml-2 shrink-0"
                          >${s.difficulty || ""}</span
                        >
                      </div>`;
                    }

                    const sUrl =
                      targetPlatform === "geeksforgeeks"
                        ? `https://www.geeksforgeeks.org/problems/${s.titleSlug}/`
                        : CONSTANTS.PLATFORMS.leetcode.problemsBase + s.titleSlug + "/";

                    const handleClick = (e) => {
                      const platformLabel =
                        targetPlatform === "geeksforgeeks" ? "GeeksForGeeks" : "LeetCode";
                      if (
                        !confirm(
                          `This problem is not in your library. Open it on ${platformLabel} to solve it?`,
                        )
                      ) {
                        e.preventDefault();
                      }
                    };

                    return html` <a
                      href=${sUrl}
                      onClick=${handleClick}
                      target="_blank"
                      rel="noopener"
                      class="flex items-center justify-between py-1 px-2 rounded hover:bg-white/5 transition-colors no-underline group"
                    >
                      <span class="text-xs text-slate-300 group-hover:text-cyan-300"
                        >${s.title || s.titleSlug}</span
                      >
                      <span class="text-[10px] ${sDiffClass} ml-2 shrink-0"
                        >${s.difficulty || ""}</span
                      >
                    </a>`;
                  })}
                </div>
              </div>
            `
          : ""}
        ${problem.hints?.length
          ? html`
              <div class="mt-3 border-t border-white/5 pt-3">
                <p class="text-[10px] uppercase tracking-wider text-slate-600 mb-2">Hints</p>
                ${problem.hints.map(
                  (h, i) => html`
                    <details
                      class="mb-1 group"
                      onToggle=${(e) => {
                        if (e.target.open) {
                          chrome.runtime
                            .sendMessage({
                              type: "RECORD_HINT_VIEW",
                              slug: problem.titleSlug || problem.id || "",
                              platform: problem.platform || "leetcode",
                              hintIndex: i,
                            })
                            .catch(() => {});
                        }
                      }}
                    >
                      <summary
                        class="text-xs text-slate-500 cursor-pointer hover:text-slate-300 select-none"
                      >
                        Hint ${i + 1}
                      </summary>
                      <p class="text-xs text-slate-400 mt-1 pl-3 border-l border-white/10">${h}</p>
                    </details>
                  `,
                )}
              </div>
            `
          : ""}
      </div>`;
    },
  },
  {
    id: "code",
    label: "Code",
    show: () => true,
    render(problem, { langName, copied, copyCode, onUpdate }) {
      return html`<${UniversalCodeTab}
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
        queueStatus,
        queueError,
        onRunQueueNow,
        runQueueBusy,
      },
    ) {
      return html`
        <${AIReviewPanel}
          review=${problem.aiReview || ""}
          onGenerate=${onGenerateAIReview}
          loading=${reviewBusy}
          error=${reviewError}
          queueStatus=${queueStatus}
          queueError=${queueError}
          onRunQueueNow=${onRunQueueNow}
          runQueueBusy=${runQueueBusy}
          providerId=${problem._aiProvider}
          modelId=${problem._aiModel}
        />
      `;
    },
  },
  {
    id: "similar",
    label: (p) => `Similar (${p?.similar?.length || 0})`,
    show: (p) => p && (p.similar?.length || 0) > 0,
    render(problem, { html, problemList = [], onNavigateProblem }) {
      return html` <div class="flex flex-col gap-2">
        ${(problem.similar || []).map((s) => {
          const targetPlatform = problem.platform || "leetcode";
          const inLibraryProblem = problemList.find(
            (p) => p.platform === targetPlatform && p.titleSlug === s.titleSlug,
          );
          const sDiffClass =
            {
              Easy: "text-emerald-400",
              Medium: "text-amber-400",
              Hard: "text-rose-400",
            }[s.difficulty] || "text-slate-400";

          if (inLibraryProblem) {
            return html` <div
              onClick=${() => onNavigateProblem?.(inLibraryProblem)}
              class="flex items-center justify-between p-3 bg-white/3 border border-white/5 rounded-xl hover:border-cyan-500/20 hover:bg-white/5 cursor-pointer transition-colors"
            >
              <div class="flex items-center gap-2">
                <span class="text-sm text-slate-200">${s.title || s.titleSlug}</span>
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium"
                  >📚 In Library</span
                >
              </div>
              <span class="text-xs ${sDiffClass} shrink-0 ml-2">${s.difficulty || ""}</span>
            </div>`;
          }

          const sUrl =
            targetPlatform === "geeksforgeeks"
              ? `https://www.geeksforgeeks.org/problems/${s.titleSlug}/`
              : CONSTANTS.PLATFORMS.leetcode.problemsBase + s.titleSlug + "/";

          const handleClick = (e) => {
            const platformLabel = targetPlatform === "geeksforgeeks" ? "GeeksForGeeks" : "LeetCode";
            if (
              !confirm(
                `This problem is not in your library. Open it on ${platformLabel} to solve it?`,
              )
            ) {
              e.preventDefault();
            }
          };

          return html` <a
            href=${sUrl}
            onClick=${handleClick}
            target="_blank"
            rel="noopener"
            class="flex items-center justify-between p-3 bg-white/3 border border-white/5 rounded-xl hover:border-cyan-500/20 hover:bg-white/5 transition-colors no-underline"
          >
            <span class="text-sm text-slate-200">${s.title || s.titleSlug}</span>
            <span class="text-xs ${sDiffClass} shrink-0 ml-2">${s.difficulty || ""}</span>
          </a>`;
        })}
      </div>`;
    },
  },
  ...(IS_EXTENSION
    ? [
        {
          id: "chat",
          label: "Ask AI",
          render(
            problem,
            {
              html,
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
              settings,
            },
          ) {
            return html` <div class="flex flex-col gap-3 h-full">
              <div class="flex-1 flex flex-col gap-3 overflow-y-auto min-h-0 max-h-[340px]">
                ${chatMessages.length === 0
                  ? html`
                      <div
                        class="flex flex-col items-center justify-center py-10 gap-2 text-center"
                      >
                        <span class="text-2xl">💬</span>
                        <p class="text-slate-400 text-sm">
                          Ask anything about this problem or your solution.
                        </p>
                        <p class="text-slate-600 text-xs">Uses your configured AI provider.</p>
                      </div>
                    `
                  : chatMessages.map(
                      (msg) => html`
                        <div
                          class="flex flex-col gap-1 ${msg.role === "user"
                            ? "items-end"
                            : "items-start"}"
                        >
                          ${msg.role === "user"
                            ? html`
                                <div
                                  class="max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed bg-cyan-600/20 border border-cyan-500/30 text-cyan-100 whitespace-pre-wrap"
                                >
                                  ${msg.content}
                                </div>
                              `
                            : html`
                                <div
                                  class="max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed bg-white/5 border border-white/10 text-slate-200"
                                >
                                  <${AIMarkdownRenderer}
                                    content=${msg.content}
                                    copyableEnabled=${false}
                                  />
                                </div>
                              `}
                          <span class="text-[9px] text-slate-700 flex items-center gap-1.5"
                            >${msg.role === "user" ? "You" : "AI"}
                            ${msg.role === "assistant" && (msg.modelId || msg.providerId)
                              ? html`
                                  <span class="text-[8px] text-slate-500 font-mono">
                                    (${msg.modelId || msg.providerId}${msg.isFallback
                                      ? " • backup fallback"
                                      : ""})
                                  </span>
                                `
                              : ""}
                          </span>
                        </div>
                      `,
                    )}
                ${chatPending
                  ? html`
                      <div class="flex items-start gap-2">
                        <div class="px-3 py-2 bg-white/5 border border-white/10 rounded-xl">
                          <span class="text-xs text-slate-500 animate-pulse">Thinking…</span>
                        </div>
                      </div>
                    `
                  : ""}
                ${chatError ? html`<p class="text-xs text-rose-400 px-1">${chatError}</p>` : ""}
              </div>
              <div class="shrink-0 flex flex-col gap-2">
                <div class="flex justify-end">
                  <${ModelStatusBar} settings=${settings} />
                </div>
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
                  >
                    Send
                  </button>
                  <button
                    onClick=${openAIChatsView}
                    class="px-3 py-2 bg-white/5 border border-white/10 text-slate-300 hover:text-cyan-200 hover:border-cyan-500/30 text-xs rounded-lg transition-colors shrink-0"
                  >
                    Open AI Chats
                  </button>
                </div>
                ${chatMessages.length > 0
                  ? html`
                      <button
                        onClick=${onClearChat}
                        class="px-3 py-2 bg-white/5 border border-white/10 text-slate-500 hover:text-slate-300 text-xs rounded-lg transition-colors shrink-0"
                        title="Clear history"
                      >
                        ✕
                      </button>
                    `
                  : ""}
              </div>
            </div>`;
          },
        },
      ]
    : []),
];

modalTabRegistry.register("leetcode", universalTabs);
modalTabRegistry.register("geeksforgeeks", universalTabs);
