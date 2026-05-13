# Design: Smart Deduplication on Import + Post-Import Validation

**Date:** 2026-05-13  
**Status:** Approved

---

## Problem

Reimporting from LeetCode's progress page creates duplicate problem entries for every previously-imported solve. The current dedup flow relies entirely on the user manually reviewing an `aiMergePending` queue in Advanced Settings, with no auto-resolution, no field-level diff, and no time pressure. This means a full re-import of 200+ problems generates 200+ pending items that the user must manually review one by one. Meanwhile, problems with missing code/tags silently pass through import and only surface as "done but no review" queue items much later.

---

## Goals

1. **Auto-merge exact duplicates** — same language + same normalized code → silently keep the oldest submission, discard the newer one. Zero user interaction required.
2. **Conflict UI with diff** — same language + different code → show a side-by-side diff with field-level comparison. Auto-resolve via AI after 10–15 seconds if user doesn't act.
3. **Different language → keep both** — treat as intentional multi-language solutions; no conflict.
4. **AI auto-resolution** — when the timer expires, AI compares the two codes. If same logic → keep oldest. If genuinely different → store both as Methods on the primary problem.
5. **Methods access** — secondary code is stored as a `Method` entry, accessible from the Methods tab, AI chat context (`/mycode` command), and conversation system prompts.
6. **Post-import validation** — immediately after import, problems with missing code, tags, or difficulty are auto-queued for recovery and a summary report is shown.

---

## Non-Goals

- Does not handle cross-platform duplicates (LeetCode vs GFG with same title) — that is a separate canonical-mapping concern.
- Does not re-open conflicts already resolved (manually edited problems are skipped as before).
- The 10–15s timer is UI-side only — it does not persist across page refreshes (unresolved conflicts stay in the queue for next session).

---

## Data Model

### Conflict fields on primary problem

```js
// Replaces aiMergePending / aiMergeProposedCode / aiMergeSources pattern
// (backward compat: existing aiMergePending items still shown)
{
  conflictPending: true,
  conflictCandidates: [
    {
      id: string,            // Problem ID of the duplicate entry
      code: string,          // Candidate's code
      lang: { name, ext, slug },
      runtime: string | null,
      memory: string | null,
      runtimePct: number | null,
      memoryPct: number | null,
      timestamp: number,
      submissionId: string | null,
    }
  ],
}
```

Resolved by: clearing `conflictPending` + `conflictCandidates`, deleting duplicate entries, optionally appending to `problem.methods`.

### Method entry shape (existing, unchanged)

```js
{
  title: string,           // e.g. "Alt approach (Python) — imported"
  language: string,
  code: string,
  description: string,    // e.g. "Imported submission #987654321"
  timestamp: number,
}
```

---

## Import Decision Tree

Executed inside `handleBulkImport()` for each `titleSlug` group:

```
ALL submissions for same titleSlug
│
├─ Group by language (lang.slug)
│   │
│   ├─ Size == 1 per language → no conflict, save normally
│   │
│   └─ Size > 1 in same language
│       │
│       ├─ Normalize all codes (trim, strip comments, lowercase)
│       │
│       ├─ All identical → AUTO-MERGE
│       │   Keep: oldest by timestamp
│       │   Discard: all newer (Storage.deleteProblem / skip save)
│       │   Counter: autoMerged++
│       │
│       └─ Some differ → CONFLICT
│           Primary = oldest timestamp
│           Others = conflictCandidates[]
│           Store: primary.conflictPending = true
│           Store: primary.conflictCandidates = [...]
│           Mark: duplicates isDuplicate = true, duplicateOf = primary.id
│           Counter: conflicts++
│
└─ Different language groups → keep all, no conflict
```

---

## `handleBulkImport()` Changes

### Phase 1 — Save & dedup (modified)

```js
// Group by titleSlug
const bySlug = {};
for (const p of problems) {
    (bySlug[p.titleSlug] ??= []).push(p);
}

let autoMerged = 0, conflicts = 0;

for (const [slug, group] of Object.entries(bySlug)) {
    // Sub-group by language
    const byLang = {};
    for (const p of group) {
        (byLang[p.lang.slug] ??= []).push(p);
    }

    for (const langGroup of Object.values(byLang)) {
        if (langGroup.length === 1) {
            // Check against already-stored problems for cross-session dedup
            await saveOrSkipIfExact(langGroup[0]);
            continue;
        }

        // Sort oldest first
        langGroup.sort((a, b) => a.timestamp - b.timestamp);
        const primary = langGroup[0];
        const rest = langGroup.slice(1);

        const normalize = (code) =>
            (code || "")
                .split("\n")
                .map(l => l.trim())
                .filter(l => l && !l.startsWith("//") && !l.startsWith("#"))
                .join("\n")
                .toLowerCase();

        const primaryNorm = normalize(primary.code);
        const allSame = rest.every(r => normalize(r.code) === primaryNorm);

        if (allSame) {
            // Auto-merge: save primary only
            await Storage.saveProblem(primary);
            pendingKeys.push(getProblemCommitKey(primary));
            autoMerged += rest.length;
        } else {
            // Conflict: save primary with conflict metadata
            const candidates = rest.map(r => ({
                id: r.id,
                code: r.code,
                lang: r.lang,
                runtime: r.runtime,
                memory: r.memory,
                runtimePct: r.runtimePct,
                memoryPct: r.memoryPct,
                timestamp: r.timestamp,
                submissionId: r.submissionId || null,
            }));
            await Storage.saveProblem({
                ...primary,
                conflictPending: true,
                conflictCandidates: candidates,
            });
            pendingKeys.push(getProblemCommitKey(primary));
            // Mark duplicates
            for (const r of rest) {
                await Storage.saveProblem({ ...r, isDuplicate: true, duplicateOf: primary.id });
            }
            conflicts++;
        }
    }
}
```

### Phase 2 — Post-import validation (new)

```js
const allSaved = await Storage.getAllProblems();
const imported = allSaved.filter(p => problems.some(ip => ip.id === p.id));

let missingCode = 0, missingTags = 0, missingDifficulty = 0;

for (const p of imported) {
    if (!p.code && p.platform === "leetcode" && p.titleSlug) {
        await enqueueReview(p.id, 999); // Low priority — code recovery path handles it
        missingCode++;
    }
    if (!p.tags?.length || !["Easy","Medium","Hard"].includes(p.difficulty)) {
        // Queue for metadata refresh (existing mechanism)
        await Storage.markForMetadataRefresh(p.id).catch(() => {});
        if (!p.tags?.length) missingTags++;
        if (!["Easy","Medium","Hard"].includes(p.difficulty)) missingDifficulty++;
    }
}
```

### Return value (enhanced)

```js
return {
    saved: pendingKeys.length,
    autoMerged,
    conflicts,
    missingCode,
    missingTags,
    missingDifficulty,
};
```

---

## Conflict UI — `DedupReviewQueue.js` (heavily enhanced)

### Item detection (expanded)

Show items where `p.conflictPending === true` OR `p.aiMergePending === true` (backward compat).

### Layout per conflict item

```
┌─────────────────────────────────────────────────────┐
│ [Platform badge] Two Sum • Python • Easy             │
│ ─────────────────────────────────────────────────── │
│ PRIMARY (oldest · 2024-01-15)   CANDIDATE (2024-03-20) │
│ ┌──────────────────────┐  ┌──────────────────────┐  │
│ │ def twoSum(...):     │  │ def twoSum(...):     │  │
│ │   d = {}             │  │   seen = {}          │  │
│ │   for i, n in...     │  │   for idx, val in... │  │
│ └──────────────────────┘  └──────────────────────┘  │
│ 48ms · 13.4MB · #12345     61ms · 14.1MB · #98765  │
│                                                      │
│ [Keep oldest] [Keep newest] [Both as Methods]        │
│                                                      │
│  AI decides in  ████████░░  8s                      │
└─────────────────────────────────────────────────────┘
```

### Timer behaviour

- On item render: start a 10–15s `setInterval` countdown (displayed as a progress bar)
- Each item has its own independent timer
- On timer zero: call `handleAIResolve(item)` automatically
- User clicking any manual action cancels the timer

### AI auto-resolution flow

```js
async function handleAIResolve(primaryProblem, candidate) {
    const result = await compareSolutions(
        { code: primaryProblem.code, lang: primaryProblem.lang.name },
        { code: candidate.code, lang: candidate.lang.name }
    );

    if (result?.same) {
        // Keep oldest (primary), discard candidate
        await resolveKeepPrimary(primaryProblem, candidate);
    } else {
        // Different approaches → add as Method
        await resolveAddAsMethod(primaryProblem, candidate);
    }
}
```

### Manual action handlers

**Keep oldest:** Delete candidate entry, clear conflict fields on primary, commit primary.

**Keep newest:** Copy candidate.code → primary.code, delete candidate entry, clear conflict fields, commit primary.

**Both as Methods:**
```js
const newMethod = {
    title: `Alt approach (${candidate.lang.name}) — imported`,
    language: candidate.lang.name,
    code: candidate.code,
    description: `Submission #${candidate.submissionId || "?"}`,
    timestamp: candidate.timestamp,
};
const updated = {
    ...primary,
    methods: [...(primary.methods || []), newMethod],
    conflictPending: false,
    conflictCandidates: undefined,
};
await Storage.saveProblem(updated);
await Storage.deleteProblem(candidate.id); // or mark isDuplicate
await Storage.markPendingProblemKeys([getProblemCommitKey(updated)]);
```

---

## Methods Integration

### AI chat context (`src/lib/ai-chat-context.js`)

If `problem.methods?.length`, include method titles and code in the system prompt context:

```
Problem has ${methods.length} alternative approach(es):
${methods.map((m, i) => `[${i+1}] ${m.title} (${m.language})`).join(", ")}
```

When user types `/mycode`, the response includes all methods, not just `problem.code`.

### `/mycode` command expansion

In `src/lib/chat-variables.js` (or equivalent): if `problem.methods` exists, append a "--- Alternative approaches ---" section listing each method's code.

---

## Post-Import Report

### Surface

After the LeetCode handler receives the `BULK_IMPORT` response, it sends a `CODELEDGER_IMPORT_COMPLETE` message to any open library tab. The library shows a dismissable banner at the top of the library:

```
Import complete: 204 problems saved · 18 auto-merged (exact match) · 3 conflicts need review
· 12 queued for code recovery · 5 queued for tag refresh
[View conflicts] [Dismiss]
```

"View conflicts" scrolls to the dedup queue in Advanced Settings or opens the DedupReviewQueue modal.

### Implementation

New message type `CODELEDGER_IMPORT_COMPLETE` with payload `{ saved, autoMerged, conflicts, missingCode, missingTags }`.

Library listens via `chrome.runtime.onMessage` and sets a `importReport` state that renders the banner.

---

## Files Changed

| File | Change |
|---|---|
| `src/background/service-worker.js` | Rewrite dedup logic in `handleBulkImport()`, add post-import validation, add `CODELEDGER_IMPORT_COMPLETE` broadcast |
| `src/ui/components/DedupReviewQueue.js` | Full redesign: conflict layout, per-item countdown timer, AI auto-resolve, Method storage |
| `src/core/duplicate-detector.js` | Minor: expose `normalizeCode()` as named export for reuse in import handler |
| `src/core/ai-deduplication.js` | `compareSolutions()` used as-is; verify it works without problem context (code-only compare) |
| `src/library/library.js` (or app root) | Listen for `CODELEDGER_IMPORT_COMPLETE`, show import report banner |
| `src/lib/ai-chat-context.js` | Include `problem.methods` summary in context when present |
| `src/lib/chat-variables.js` | Expand `/mycode` to include alternative Methods |

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| AI `compareSolutions()` fails on timer expire | Default to "Keep oldest" (safe conservative choice), log warning |
| `Storage.deleteProblem()` not available | Fall back to marking `isDuplicate: true` instead of deleting |
| Conflict UI closed before all timers expire | Conflicts stay in `conflictPending` state; appear again next time queue is opened |
| Same titleSlug but no code on either side | Skip dedup (can't normalize empty code); save both, flag both for code recovery |
| `CODELEDGER_IMPORT_COMPLETE` no open library tab | Report is silently dropped; conflicts still appear in the dedup queue |

---

## Open Questions Resolved

- **Auto-merge picks oldest** — the original solve is canonical; newer re-submission with identical code is just noise.
- **10–15 second window** — per-item, not per-batch. Each conflict gets its own countdown so conflicts don't all expire simultaneously and hammer the AI.
- **Methods vs separate entries** — Methods are the right storage: they appear in the existing Methods tab, feed the AI chat, and keep the library list clean.
- **Post-import recovery** — enqueue for the code recovery queue (already designed); no separate mechanism needed.
