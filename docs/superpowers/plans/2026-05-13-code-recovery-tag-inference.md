# Code Recovery & Tag Inference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the AI review queue finds a problem with no code, automatically fetch it from LeetCode's API via a background tab, then continue to generate the AI review; also have AI infer missing tags during review.

**Architecture:** A new `code-recovery-handler.js` opens a hidden LeetCode tab flagged with `codeledger_code_fetch=1`. The `handler-loader.js` content script detects the flag and calls `handleCodeFetch()` on the LeetCode handler, which uses existing GraphQL queries to fetch the latest accepted submission and sends it back via `chrome.runtime.sendMessage`. The SW receives it, saves the code+tags, and falls through to normal AI review. Separately, `buildReviewPrompt()` appends a TAGS instruction when `problem.tags` is empty, and `generateAIReview()` parses and saves the AI-inferred tags.

**Tech Stack:** Manifest V3 Service Worker, Chrome tabs API, IndexedDB (via `Storage`), LeetCode GraphQL (existing `QUERIES` in `graphql-queries.js`), `browser-compat.js` for all chrome.* calls

---

## Files

| File | Action | Responsibility |
|---|---|---|
| `src/background/code-recovery-handler.js` | **Create** | Opens background tab, awaits `CODELEDGER_CODE_FETCHED`, resolves/rejects with 30s timeout |
| `src/content/handler-loader.js` | **Modify** | Detect `codeledger_code_fetch=1` before normal init, call `handleCodeFetch()` |
| `src/handlers/platforms/leetcode/index.js` | **Modify** | Add `handleCodeFetch(problemId)` — fetches submission + tags, sends message |
| `src/background/service-worker.js` | **Modify** | Import `triggerCodeRecovery`, replace silent `markDone` for no-code, add TAGS parsing in `generateAIReview()` |
| `src/core/ai-prompts.js` | **Modify** | Append TAGS instruction in `buildReviewPrompt()` when `problemContext.tags` is empty |

---

## Task 1: Create `code-recovery-handler.js`

**Files:**
- Create: `src/background/code-recovery-handler.js`

- [ ] **Step 1: Create the file**

```js
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../lib/debug.js";
import { Storage } from "../core/storage.js";
import { tabs } from "../lib/browser-compat.js";

const dbg = createDebugger("CodeRecovery");

const RECOVERY_TIMEOUT_MS = 30000;

/**
 * Open a hidden LeetCode tab to fetch the latest accepted submission code + tags.
 * Resolves with { ok: true, code, lang, tags, runtime, memory, runtimePct, memoryPct }
 * or { ok: false, error } on failure/timeout.
 *
 * @param {{ id: string, titleSlug: string }} problem
 * @returns {Promise<{ ok: boolean, code?: string, lang?: object, tags?: string[], error?: string }>}
 */
export async function triggerCodeRecovery(problem) {
    const { id: problemId, titleSlug } = problem;
    if (!titleSlug) {
        return { ok: false, error: "Problem has no titleSlug — cannot open recovery tab" };
    }

    const url = `https://leetcode.com/problems/${encodeURIComponent(titleSlug)}/?codeledger_code_fetch=1&codeledger_problemid=${encodeURIComponent(problemId)}`;
    dbg.log(`triggerCodeRecovery(${titleSlug}): opening background tab`);

    return new Promise((resolve) => {
        let tabId = null;
        let settled = false;

        const timeoutHandle = setTimeout(() => {
            if (settled) return;
            settled = true;
            dbg.warn(`triggerCodeRecovery(${titleSlug}): timed out after ${RECOVERY_TIMEOUT_MS}ms`);
            if (tabId != null) {
                tabs.remove(tabId).catch(() => {});
            }
            chrome.runtime.onMessage.removeListener(listener);
            resolve({ ok: false, error: `Recovery timed out after ${RECOVERY_TIMEOUT_MS / 1000}s` });
        }, RECOVERY_TIMEOUT_MS);

        function listener(msg) {
            if (msg?.type !== "CODELEDGER_CODE_FETCHED") return;
            if (msg.problemId !== problemId) return;
            if (settled) return;
            settled = true;
            clearTimeout(timeoutHandle);
            chrome.runtime.onMessage.removeListener(listener);
            if (tabId != null) {
                tabs.remove(tabId).catch(() => {});
            }
            if (msg.error) {
                dbg.warn(`triggerCodeRecovery(${titleSlug}): content script error: ${msg.error}`);
                resolve({ ok: false, error: msg.error });
            } else {
                dbg.log(`triggerCodeRecovery(${titleSlug}): ✓ received code (${(msg.code || "").length} chars)`);
                // Save code + tags to storage immediately
                Storage.getProblem(problemId)
                    .then((stored) => {
                        if (!stored) return;
                        const updated = {
                            ...stored,
                            code: msg.code || stored.code,
                            lang: msg.lang || stored.lang,
                            runtime: msg.runtime || stored.runtime,
                            memory: msg.memory || stored.memory,
                            runtimePct: msg.runtimePct ?? stored.runtimePct,
                            memoryPct: msg.memoryPct ?? stored.memoryPct,
                        };
                        if (msg.tags?.length && (!stored.tags || !stored.tags.length)) {
                            updated.tags = msg.tags;
                            updated.topic = msg.tags[0];
                        }
                        return Storage.saveProblem(updated);
                    })
                    .catch((e) => dbg.warn(`triggerCodeRecovery(): save failed:`, e?.message));
                resolve({
                    ok: true,
                    code: msg.code,
                    lang: msg.lang,
                    tags: msg.tags || [],
                    runtime: msg.runtime,
                    memory: msg.memory,
                    runtimePct: msg.runtimePct,
                    memoryPct: msg.memoryPct,
                });
            }
        }

        chrome.runtime.onMessage.addListener(listener);
        tabs.create({ url, active: false })
            .then((tab) => {
                if (settled) {
                    tabs.remove(tab.id).catch(() => {});
                    return;
                }
                tabId = tab.id;
                dbg.log(`triggerCodeRecovery(${titleSlug}): ✓ opened tab ${tabId}`);
            })
            .catch((e) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutHandle);
                chrome.runtime.onMessage.removeListener(listener);
                dbg.error(`triggerCodeRecovery(${titleSlug}): ✗ tab creation failed:`, e?.message);
                resolve({ ok: false, error: `Tab creation failed: ${e?.message}` });
            });
    });
}
```

- [ ] **Step 2: Verify `tabs` export exists in `browser-compat.js`**

Run this grep — if `tabs` is not exported, add `export const tabs = { create: ..., remove: ... }` matching the existing `chrome` / `browser` wrapper pattern in that file:

```
grep -n "export.*tabs\|tabs\.create\|tabs\.remove" src/lib/browser-compat.js
```

If the export is missing, add it inside `browser-compat.js` following the same pattern as other exports.

- [ ] **Step 3: Commit**

```bash
git add src/background/code-recovery-handler.js
git commit -m "feat: add code-recovery-handler — background tab fetch for missing submission code"
```

---

## Task 2: Add `handleCodeFetch()` to the LeetCode handler

**Files:**
- Modify: `src/handlers/platforms/leetcode/index.js`

- [ ] **Step 1: Add `handleCodeFetch` method to `LeetCodeHandler`**

Append this method to the `LeetCodeHandler` class (after the last existing method, before the closing `}`):

```js
/**
 * Called when the page was opened with ?codeledger_code_fetch=1.
 * Fetches the latest accepted submission (code + tags) and sends it back to the SW.
 *
 * @param {string} problemId — the CodeLedger problem ID to match the SW listener
 */
async handleCodeFetch(problemId) {
    const slug = window.location.pathname.split("/problems/")[1]?.replace(/\//g, "");
    dbg.log(`handleCodeFetch(${problemId}): slug=${slug}`);
    try {
        // 1. Latest accepted submission ID
        const listRes = await this._gql(QUERIES.SUBMISSION_LIST, {
            questionSlug: slug,
            offset: 0,
            limit: 10,
            lastKey: null,
        });
        const submissions = listRes?.data?.questionSubmissionList?.submissions || [];
        const accepted = submissions.find((s) => s.statusDisplay === "Accepted");
        if (!accepted) throw new Error("No accepted submissions found");

        // 2. Submission details (code + runtime)
        const detailRes = await this._gql(QUERIES.SUBMISSION_DETAIL, {
            submissionId: +accepted.id,
        });
        const detail = detailRes?.data?.submissionDetails;
        if (!detail?.code) throw new Error("Submission details returned no code");

        // 3. Topic tags while we have the tab open
        let tags = [];
        try {
            const metaRes = await this._gql(QUERIES.QUESTION, { titleSlug: slug });
            tags = metaRes?.data?.question?.topicTags?.map((t) => t.name) || [];
        } catch (_) {
            // Non-fatal — tags can be inferred by AI review later
        }

        const rawLang = detail.lang || {};
        const lang = resolveLang(rawLang);

        runtime.sendMessage({
            type: "CODELEDGER_CODE_FETCHED",
            problemId,
            code: detail.code,
            lang: { name: lang.verbose, slug: lang.slug, ext: lang.ext },
            runtime: detail.runtimeDisplay || null,
            memory: detail.memoryDisplay || null,
            runtimePct: Math.round(detail.runtimePercentile || 0),
            memoryPct: Math.round(detail.memoryPercentile || 0),
            tags,
        });
    } catch (e) {
        dbg.error(`handleCodeFetch(${problemId}): ✗`, e?.message);
        runtime.sendMessage({
            type: "CODELEDGER_CODE_FETCHED",
            problemId,
            error: e.message,
        });
    }
}
```

Note: `runtime`, `resolveLang`, and `QUERIES` are all already in scope at the top of `index.js`.

- [ ] **Step 2: Verify `_gql` helper exists on `LeetCodeHandler`**

```
grep -n "_gql\|async _gql" src/handlers/platforms/leetcode/index.js
```

The method should already exist from the existing submission tracking logic. If not, it must be added.

- [ ] **Step 3: Commit**

```bash
git add src/handlers/platforms/leetcode/index.js
git commit -m "feat: add handleCodeFetch() to LeetCodeHandler for background code recovery"
```

---

## Task 3: Modify `handler-loader.js` to detect the recovery flag

**Files:**
- Modify: `src/content/handler-loader.js`

- [ ] **Step 1: Add recovery flag detection before the normal `loadHandler()` flow**

Replace the current `loadHandler()` call at the bottom of `handler-loader.js`:

```js
// BEFORE (bottom of file):
console.log(`[CodeLedger:HandlerLoader] script loaded, calling loadHandler()...`);
loadHandler();
```

With:

```js
console.log(`[CodeLedger:HandlerLoader] script loaded`);

// Code recovery mode: opened by code-recovery-handler.js with a flag in the URL
const _urlParams = new URLSearchParams(window.location.search);
if (_urlParams.get("codeledger_code_fetch") === "1" && window.location.hostname.includes("leetcode.com")) {
    const _problemId = _urlParams.get("codeledger_problemid") || "";
    console.log(`[CodeLedger:HandlerLoader] code-fetch mode detected, problemId=${_problemId}`);
    (async () => {
        try {
            const { initDebug } = await import(chrome.runtime.getURL("lib/debug.js"));
            await initDebug();
        } catch (_) {}
        const url = chrome.runtime.getURL("handlers/platforms/leetcode/index.js");
        const { LeetCodeHandler } = await import(url);
        await new LeetCodeHandler().handleCodeFetch(_problemId);
    })().catch((e) => {
        console.error("[CodeLedger:HandlerLoader] code-fetch failed:", e?.message);
        chrome.runtime.sendMessage({
            type: "CODELEDGER_CODE_FETCHED",
            problemId: _problemId,
            error: e?.message || "Unknown error in handler-loader code-fetch path",
        });
    });
} else {
    console.log(`[CodeLedger:HandlerLoader] calling loadHandler()...`);
    loadHandler();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/content/handler-loader.js
git commit -m "feat: detect codeledger_code_fetch flag in handler-loader, skip normal init"
```

---

## Task 4: Add TAGS instruction to `buildReviewPrompt()`

**Files:**
- Modify: `src/core/ai-prompts.js`

- [ ] **Step 1: Modify `buildReviewPrompt()` to append tag instruction**

Find the current return statement at the end of `buildReviewPrompt()`:

```js
    const filledTemplate = fillPromptTemplate(template, problemContext);
    const lang = problemContext.language || problemContext.lang?.name || "";
    dbg.log(`buildReviewPrompt(): ${platform} (${lang})`);
    return `${filledTemplate}\n\n## Code:\n\`\`\`${lang}\n${code}\n\`\`\``;
```

Replace with:

```js
    const filledTemplate = fillPromptTemplate(template, problemContext);
    const lang = problemContext.language || problemContext.lang?.name || "";
    dbg.log(`buildReviewPrompt(): ${platform} (${lang})`);
    const needsTags = !problemContext.tags?.length;
    const tagInstruction = needsTags
        ? `\n\nThis problem has no topic tags. On the very last line of your response, output 2–4 relevant algorithm/data structure tags in exactly this format (no other text on that line):\nTAGS: Tag One, Tag Two`
        : "";
    return `${filledTemplate}${tagInstruction}\n\n## Code:\n\`\`\`${lang}\n${code}\n\`\`\``;
```

- [ ] **Step 2: Commit**

```bash
git add src/core/ai-prompts.js
git commit -m "feat: append TAGS instruction in buildReviewPrompt() when tags missing"
```

---

## Task 5: Wire code recovery and TAGS parsing into `service-worker.js`

**Files:**
- Modify: `src/background/service-worker.js`

- [ ] **Step 1: Import `triggerCodeRecovery` at the top of the file**

Add to the import block (near the other background handler imports like `handleRefreshMetadata`):

```js
import { triggerCodeRecovery } from "./code-recovery-handler.js";
```

- [ ] **Step 2: Replace the silent `markDone` for no-code problems in `processAIReviewQueue()`**

Find the existing block:

```js
                if (!problem.code) {
                    await markDone(item.id);
                    dbg.warn(
                        `processAIReviewQueue(): problem ${item.problemId} has no code, skipping`
                    );
                    processed++;
                    item = await getNextPendingReview();
                    continue;
                }
```

Replace with:

```js
                if (!problem.code) {
                    if (problem.platform === "leetcode" && problem.titleSlug) {
                        dbg.log(`processAIReviewQueue(): ${item.problemId} has no code — attempting recovery`);
                        const recovery = await triggerCodeRecovery(problem);
                        if (!recovery.ok) {
                            await markFailedWithRetry(item.id, `Code recovery failed: ${recovery.error}`);
                            dbg.warn(`processAIReviewQueue(): recovery failed for ${item.problemId}: ${recovery.error}`);
                            processed++;
                            item = await getNextPendingReview();
                            continue;
                        }
                        // Reload problem — triggerCodeRecovery saved the code
                        problem = await Storage.getProblem(item.problemId);
                        if (!problem?.code) {
                            await markFailedWithRetry(item.id, "Code recovery succeeded but code still empty");
                            processed++;
                            item = await getNextPendingReview();
                            continue;
                        }
                        dbg.log(`processAIReviewQueue(): ✓ recovery succeeded for ${item.problemId}`);
                    } else {
                        await markFailedWithRetry(item.id, "No code stored and automatic recovery not supported for this platform");
                        dbg.warn(`processAIReviewQueue(): non-recoverable no-code for ${item.problemId}`);
                        processed++;
                        item = await getNextPendingReview();
                        continue;
                    }
                }
```

- [ ] **Step 3: Add TAGS parsing in `generateAIReview()` after receiving the review string**

Find the block in `generateAIReview()` where `review` is returned (after all provider attempts):

```js
            if (!review || String(review).trim() === "") {
```

After the final `return { review, providerId }` (or wherever the review string is finalized and returned), add the TAGS parsing. Look for the return statement at the end of the provider loop, and add before it:

```js
            // Parse AI-inferred tags if the problem had none
            if (review && (!problem.tags || problem.tags.length === 0)) {
                const tagsMatch = review.match(/^TAGS:\s*(.+)$/m);
                if (tagsMatch) {
                    const parsed = tagsMatch[1].split(",").map((t) => t.trim()).filter(Boolean);
                    if (parsed.length) {
                        const withTags = { ...problem, tags: parsed, topic: parsed[0] };
                        await Storage.saveProblem(withTags).catch(() => {});
                        const tagKey = getProblemCommitKey(withTags);
                        if (tagKey) await Storage.markPendingProblemKeys([tagKey]).catch(() => {});
                        dbg.log(`generateAIReview(): saved AI-inferred tags: ${parsed.join(", ")}`);
                    }
                    // Strip TAGS line from review so it doesn't show in the UI
                    review = review.replace(/^TAGS:\s*.+$/m, "").trim();
                }
            }
```

Note: `review` must be a `let` variable at that point in the function. If it is declared with `const`, change the declaration to `let`.

- [ ] **Step 4: Verify `CODELEDGER_CODE_FETCHED` message doesn't need explicit handling**

The one-time listener in `triggerCodeRecovery` handles the message directly via `chrome.runtime.onMessage.addListener`. The SW does NOT need an additional top-level handler for this message type — the promise-based listener in the handler resolves it. Confirm there's no conflicting handler by running:

```
grep -n "CODELEDGER_CODE_FETCHED" src/background/service-worker.js
```

If found, remove it (the handler in `code-recovery-handler.js` is sufficient).

- [ ] **Step 5: Commit**

```bash
git add src/background/service-worker.js
git commit -m "feat: wire code recovery into processAIReviewQueue, parse AI-inferred TAGS"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Task 1: `triggerCodeRecovery()` opens hidden tab, 30s timeout, resolves with code+tags or error
- ✅ Task 2: `handleCodeFetch()` fetches submission list → detail → topic tags, sends `CODELEDGER_CODE_FETCHED`
- ✅ Task 3: `handler-loader.js` detects flag, skips normal init, calls `handleCodeFetch()`
- ✅ Task 4: `buildReviewPrompt()` appends TAGS instruction when tags missing
- ✅ Task 5: `processAIReviewQueue()` attempts recovery for LeetCode no-code items, marks FAILED for others; `generateAIReview()` parses and saves inferred tags
- ✅ Spec: "after successful recovery, committed to GitHub" — handled by `triggerCodeRecovery` calling `Storage.saveProblem()` + `Storage.markPendingProblemKeys()`
- ✅ Spec: "failed recoveries show as FAILED" — `markFailedWithRetry()` called on all failure paths
- ✅ Spec: non-LeetCode no-code → `markFailedWithRetry("Automatic recovery not supported")`

**Type consistency:**
- `triggerCodeRecovery(problem)` — takes problem object, returns `{ ok, code?, lang?, tags?, error? }`
- `handleCodeFetch(problemId)` — takes string, sends `CODELEDGER_CODE_FETCHED` message
- `lang` shape sent: `{ name, slug, ext }` — matches `problem.lang` shape used elsewhere in the codebase
