# Design: Autonomous Code Recovery & Tag Inference

**Date:** 2026-05-13  
**Status:** Approved

---

## Problem

When problems are imported from LeetCode (via the profile importer or early extension versions), some arrive with `code: null` or `code: ""`. The AI review queue currently silently marks these items **done** without generating any review, and they appear as "done" items that never got a review. Users see 200+ "done" queue entries with empty AI reviews and have no way to fix them.

Secondary issue: some problems have no `tags` (empty array or missing field), which means the AI review has less context and the library filtering is incomplete.

---

## Goals

1. When the queue finds a problem with no code, **fetch it automatically** from LeetCode's API using a background tab — then continue to generate the AI review in the same pass.
2. While the background tab is open, **also fetch missing tags** from LeetCode's GraphQL endpoint.
3. If tags still can't be fetched from the API (non-LeetCode platform, paid-only problem, network error), **have the AI review infer 2–4 tags** from the code and problem title and save them.
4. Failed recoveries show up in the queue as **FAILED** with a clear error — not silently done.
5. After successful recovery, the problem is **committed to GitHub** automatically.

---

## Non-Goals

- Does not handle GeeksForGeeks or Codeforces code recovery (no authenticated submission API).
- Does not re-run recovery for problems already marked FAILED more than `MAX_RETRIES` times.
- Does not replace the bulk importer — recovery is a per-problem background fix.

---

## Architecture

```
processAIReviewQueue() [service-worker.js]
│
├─ problem not found → markDone() [unchanged]
│
├─ !problem.code
│   └─ triggerCodeRecovery(problem, settings)  [code-recovery-handler.js]
│       ├─ opens hidden tab: leetcode.com/problems/{slug}/?codeledger_code_fetch=1
│       ├─ 30s timeout watchdog
│       ├─ LeetCode content script detects flag → handleCodeFetch()
│       │   ├─ submissionList(questionSlug) → latest accepted submissionId
│       │   ├─ submissionDetails(submissionId) → { code, lang, runtime, memory, percentiles }
│       │   ├─ question(titleSlug) → { topicTags }  [if problem.tags missing]
│       │   └─ sendMessage(CODELEDGER_CODE_FETCHED, { problemId, code, lang, tags?, ... })
│       ├─ SW receives CODELEDGER_CODE_FETCHED → saves code + tags, marks pending commit
│       └─ returns { ok: true } or { ok: false, error }
│
│   ├─ recovery ok → problem now has code → fall through to AI review
│   └─ recovery failed → markFailedWithRetry(item.id, error) → visible in queue
│
└─ problem.code exists
    └─ generateAIReview(problem, settings) [existing]
        ├─ buildReviewPrompt() — if !problem.tags?.length, appends tag instruction
        │   > "...TAGS: Dynamic Programming, Array  (last line, exact format)"
        ├─ AI response received
        ├─ parse TAGS: line → suggestedTags[]  [if present]
        ├─ if suggestedTags && !problem.tags?.length → saveProblem({ tags, topic })
        ├─ strip TAGS: line from displayed review
        └─ return { review, providerId }
```

---

## New File: `src/background/code-recovery-handler.js`

Responsibility: open a background tab for a single problem, wait for the content script to fetch and return the code, resolve or reject after timeout.

```js
// Interface
export async function triggerCodeRecovery(problem, settings) -> { ok, code?, lang?, tags?, error? }
```

Internals:
- Creates a `chrome.tabs.create({ url, active: false })` call
- Registers a one-time `chrome.runtime.onMessage` listener for `CODELEDGER_CODE_FETCHED` with matching `problemId`
- Sets a 30-second `setTimeout` to reject if no response
- On success: calls `Storage.saveProblem()`, `Storage.markPendingProblemKeys()`, closes tab, resolves
- On timeout/error: closes tab (if still open), rejects with error message

URL format: `https://leetcode.com/problems/{titleSlug}/?codeledger_code_fetch=1&codeledger_problemid={encodedProblemId}`

---

## Modified: `src/content/handler-loader.js`

Add detection for `codeledger_code_fetch=1` in `window.location.search` **before** platform handler loading. When detected:

```js
if (new URLSearchParams(window.location.search).get("codeledger_code_fetch") === "1") {
    const problemId = new URLSearchParams(window.location.search).get("codeledger_problemid");
    // Import LeetCode handler and call handleCodeFetch(problemId)
    // handler-loader already knows the platform from the hostname
    import("../handlers/platforms/leetcode/index.js")
        .then(({ LeetCodeHandler }) => new LeetCodeHandler().handleCodeFetch(problemId));
    return; // Don't init the normal solve detection
}
```

---

## Modified: `src/handlers/platforms/leetcode/index.js`

New method `handleCodeFetch(problemId)`:

```js
async handleCodeFetch(problemId) {
    const slug = window.location.pathname.split("/problems/")[1]?.replace(/\//g, "");
    try {
        // 1. Get latest accepted submission ID
        const listRes = await this._gql(QUERIES.SUBMISSION_LIST, { questionSlug: slug, offset: 0, limit: 5 });
        const submissions = listRes.data?.submissionList?.submissions || [];
        const accepted = submissions.find(s => s.statusDisplay === "Accepted");
        if (!accepted) throw new Error("No accepted submissions found");

        // 2. Get submission code
        const detailRes = await this._gql(QUERIES.SUBMISSION_DETAIL, { submissionId: +accepted.id });
        const detail = detailRes.data?.submissionDetails;
        if (!detail?.code) throw new Error("Submission detail returned no code");

        // 3. Fetch tags while we're here
        const metaRes = await this._gql(QUERIES.QUESTION, { titleSlug: slug });
        const tags = metaRes.data?.question?.topicTags?.map(t => t.name) || [];

        chrome.runtime.sendMessage({
            type: "CODELEDGER_CODE_FETCHED",
            problemId,
            code: detail.code,
            lang: { name: detail.lang?.verboseName || detail.lang?.name, slug: detail.lang?.name },
            runtime: detail.runtimeDisplay,
            memory: detail.memoryDisplay,
            runtimePct: Math.round(detail.runtimePercentile || 0),
            memoryPct: Math.round(detail.memoryPercentile || 0),
            tags,
        });
    } catch (e) {
        chrome.runtime.sendMessage({
            type: "CODELEDGER_CODE_FETCHED",
            problemId,
            error: e.message,
        });
    }
}
```

Also ensure `SUBMISSION_LIST` query exists in `graphql-queries.js` (already present at line 1566 via existing handler usage, but verify the `questionSlug` parameter name).

---

## Modified: `src/background/service-worker.js`

### `processAIReviewQueue()` change

Replace the silent `markDone()` on missing code:

```js
// BEFORE:
if (!problem.code) {
    await markDone(item.id);
    continue;
}

// AFTER:
if (!problem.code) {
    if (problem.platform === "leetcode" && problem.titleSlug) {
        const recovery = await triggerCodeRecovery(problem, settings);
        if (!recovery.ok) {
            await markFailedWithRetry(item.id, `Code recovery failed: ${recovery.error}`);
            processed++;
            item = await getNextPendingReview();
            continue;
        }
        // Reload problem — triggerCodeRecovery already saved the code
        problem = await Storage.getProblem(item.problemId);
        if (!problem?.code) {
            await markFailedWithRetry(item.id, "Code recovery succeeded but code still missing");
            processed++;
            item = await getNextPendingReview();
            continue;
        }
    } else {
        // Non-LeetCode platform or missing slug — mark failed so user can see it
        await markFailedWithRetry(item.id, "No code stored and automatic recovery not supported for this platform");
        processed++;
        item = await getNextPendingReview();
        continue;
    }
}
```

### New `CODELEDGER_CODE_FETCHED` message handler

```js
if (msg.type === "CODELEDGER_CODE_FETCHED") {
    // Handled inside code-recovery-handler — just needs SW to be awake to relay
    // The handler's Promise listener receives this via onMessage directly
    // No sendResponse needed here; handled by the one-time listener in triggerCodeRecovery
    return false;
}
```

### `generateAIReview()` tag parsing

After receiving AI `review` string:
```js
const TAGS_LINE = /^TAGS:\s*(.+)$/m;
const tagsMatch = review.match(TAGS_LINE);
if (tagsMatch && (!problem.tags || problem.tags.length === 0)) {
    const parsed = tagsMatch[1].split(",").map(t => t.trim()).filter(Boolean);
    if (parsed.length) {
        const withTags = { ...problem, tags: parsed, topic: parsed[0] };
        await Storage.saveProblem(withTags);
        const key = getProblemCommitKey(withTags);
        if (key) await Storage.markPendingProblemKeys([key]).catch(() => {});
    }
}
const cleanReview = review.replace(TAGS_LINE, "").trim();
return { review: cleanReview, providerId };
```

---

## Modified: `src/core/ai-prompts.js`

In `buildReviewPrompt()`, append tag instruction when tags are missing:

```js
const needsTags = !problemContext.tags?.length;
const tagInstruction = needsTags
    ? `\n\nThis problem has no topic tags. On the very last line of your response, output 2–4 relevant algorithm/data structure tags in exactly this format with no other text on that line:\nTAGS: Tag One, Tag Two`
    : "";

return `${filledTemplate}${tagInstruction}\n\n## Code:\n\`\`\`${lang}\n${code}\n\`\`\``;
```

---

## Error Handling Summary

| Scenario | Current behaviour | New behaviour |
|---|---|---|
| Problem has no code (LeetCode) | markDone silently | Attempt code recovery via background tab |
| Code recovery: no accepted submissions | — | markFailedWithRetry("No accepted submissions found") |
| Code recovery: GraphQL error / timeout | — | markFailedWithRetry("Code recovery failed: {reason}") |
| Code recovery: network down | — | markFailedWithRetry after 30s timeout |
| Problem has no code (non-LeetCode) | markDone silently | markFailedWithRetry("Automatic recovery not supported") |
| Tags missing, API returns none | Tags stay empty | AI review infers tags, saves them |
| AI tag parsing fails | — | Silently skipped (non-critical path) |

---

## Commit behaviour

After successful code recovery:
- `Storage.saveProblem()` writes code + tags to IndexedDB
- `Storage.markPendingProblemKeys([key])` queues the problem for the next GitHub sync
- The existing sync engine picks it up on the next alarm tick

---

## Files Changed

| File | Type |
|---|---|
| `src/background/code-recovery-handler.js` | New |
| `src/content/handler-loader.js` | Modified — detect `codeledger_code_fetch` |
| `src/handlers/platforms/leetcode/index.js` | Modified — add `handleCodeFetch()` |
| `src/handlers/platforms/leetcode/graphql-queries.js` | Verify SUBMISSION_LIST has `questionSlug` param |
| `src/background/service-worker.js` | Modified — import handler, queue logic, message handler, tag parsing |
| `src/core/ai-prompts.js` | Modified — tag instruction in `buildReviewPrompt()` |
