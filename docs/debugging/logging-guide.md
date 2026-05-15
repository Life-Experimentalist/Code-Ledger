# CodeLedger Complete Debug Logging System

**Comprehensive guide to debugging, monitoring, and instrumenting CodeLedger**

---

## Quick Start: Enable Debug Mode

```javascript
// In browser console (any page):
import { setDebug } from '/lib/debug.js';
setDebug(true);

// Now ALL logs will appear in DevTools Console with format:
// [CodeLedger:ModuleName] functionName(): message
```

---

## Module-by-Module Logging Reference

### Service Worker (`src/background/service-worker.js`)

**Purpose:** Orchestrates all background operations

```javascript
// ✅ Enabled Logging Points:

[CodeLedger:ServiceWorker] init(): ✓ debug initialized, background starting...
[CodeLedger:ServiceWorker] init(): registering handlers...
[CodeLedger:ServiceWorker] init(): initializing AI review queue store...
[CodeLedger:ServiceWorker] init(): extension updated: <old> → <new>
[CodeLedger:ServiceWorker] init(): setting up event listeners...

// On problem solve event:
[CodeLedger:ServiceWorker] handleSolved(): entering - problem=two-sum
[CodeLedger:ServiceWorker] handleSolved(): normalizing problem ID to platform format
[CodeLedger:ServiceWorker] handleSolved(): checking for duplicates...
[CodeLedger:ServiceWorker] handleSolved(): ✓ no duplicates found
[CodeLedger:ServiceWorker] handleSolved(): calling GitEngine.commit()...
[CodeLedger:ServiceWorker] handleSolved(): ✓ commit succeeded - SHA=abc123...
[CodeLedger:ServiceWorker] handleSolved(): enqueueing AI review...
[CodeLedger:ServiceWorker] handleSolved(): ✓ review enqueued - queue depth=3
[CodeLedger:ServiceWorker] handleSolved(): ✓ complete - duration=234ms

// On error:
[CodeLedger:ServiceWorker] handleSolved(): commit failed - error=404 not found
[CodeLedger:ServiceWorker] handleSolved(): ✗ failed - marking for retry
```

### AI Review Queue (`src/core/ai-review-queue.js`)

**Purpose:** Manages asynchronous AI reviews with retry logic

```javascript
// ✅ Initialization:
[CodeLedger:AIReviewQueue] initializeReviewQueueStore(): creating IndexedDB...
[CodeLedger:AIReviewQueue] initializeReviewQueueStore(): ✓ store ready
[CodeLedger:AIReviewQueue] initializeReviewQueueStore(): indexes created: statusIndex, problemIdIndex

// ✅ Enqueueing:
[CodeLedger:AIReviewQueue] enqueueReview(lc/123, priority=50): entering
[CodeLedger:AIReviewQueue] enqueueReview(): checking for existing entries...
[CodeLedger:AIReviewQueue] enqueueReview(): lc/123 already queued — skipping duplicate
[CodeLedger:AIReviewQueue] enqueueReview(): adding new entry with priority=50
[CodeLedger:AIReviewQueue] enqueueReview(): ✓ lc/123 added to queue (id=review-lc/123-1715600000000)

// ✅ Processing (on alarm trigger):
[CodeLedger:AIReviewQueue] processAIReviewQueue(): alarm triggered
[CodeLedger:AIReviewQueue] processAIReviewQueue(): fetching next pending item...
[CodeLedger:AIReviewQueue] getNextPendingReview(): found 5 pending items, 2 in backoff
[CodeLedger:AIReviewQueue] getNextPendingReview(): selected review-lc/123-1715600000000 (priority=50)
[CodeLedger:AIReviewQueue] markProcessing(review-lc/123-1715600000000): transitioning to PROCESSING
[CodeLedger:AIReviewQueue] markProcessing(): ✓ status updated

// ✅ Success:
[CodeLedger:AIReviewQueue] handleReviewComplete(): review successful
[CodeLedger:AIReviewQueue] markDone(review-lc/123-1715600000000): ✓ complete
[CodeLedger:AIReviewQueue] handleReviewComplete(): ✓ problem updated with review

// ✅ Failure & Retry:
[CodeLedger:AIReviewQueue] handleReviewError(): lc/123 failed - error=RATE_LIMIT
[CodeLedger:AIReviewQueue] markFailedWithRetry(): retry count=1/5
[CodeLedger:AIReviewQueue] markFailedWithRetry(): scheduling retry after 5000ms
[CodeLedger:AIReviewQueue] markFailedWithRetry(): ✓ item scheduled for backoff

// [5s later]
[CodeLedger:AIReviewQueue] getNextPendingReview(): backoff expired, moving back to PENDING
[CodeLedger:AIReviewQueue] getNextPendingReview(): retry #2 for lc/123

// ✅ Max Retries Exceeded:
[CodeLedger:AIReviewQueue] markFailedWithRetry(): retry count=6/5 - MAX RETRIES EXCEEDED
[CodeLedger:AIReviewQueue] markFailedWithRetry(): ✗ item abandoned - manual intervention needed
[CodeLedger:AIReviewQueue] Review lc/123 max retries exceeded: Network timeout

// ✅ Cleanup:
[CodeLedger:AIReviewQueue] getQueueStats(): fetching current queue status...
[CodeLedger:AIReviewQueue] getQueueStats(): ✓ pending=3, processing=0, done=42, failed=2, total=47
[CodeLedger:AIReviewQueue] clearCompletedReviews(): removing done/failed items...
[CodeLedger:AIReviewQueue] clearCompletedReviews(): ✓ removed 44 items
```

### GitHub Git Engine (`src/handlers/git/github/index.js`)

**Purpose:** Creates atomic commits to GitHub using Trees API

```javascript
// ✅ Commit Flow:
[CodeLedger:GitHandler] commit(): entering - problem=two-sum, files=2
[CodeLedger:GitHandler] commit(): building file tree...
[CodeLedger:GitHandler] commit(): tree ready - 2 files, ~1.2KB
[CodeLedger:GitHandler] commit(): generating commit message...
[CodeLedger:GitHandler] commit(): message="solve(arrays/two-sum): Two Sum"
[CodeLedger:GitHandler] commit(): calling GitHub Trees API...

// ✅ Trees API:
[CodeLedger:GitHandler] _createTree(): POST /git/trees
[CodeLedger:GitHandler] _createTree(): ✓ tree created - SHA=tree123abc...

// ✅ Commit API:
[CodeLedger:GitHandler] _createCommit(): POST /git/commits
[CodeLedger:GitHandler] _createCommit(): ✓ commit created - SHA=commit456def...

// ✅ Ref Update:
[CodeLedger:GitHandler] _updateRef(): PATCH /git/refs/heads/main
[CodeLedger:GitHandler] _updateRef(): ✓ ref updated

// ✅ Complete:
[CodeLedger:GitHandler] commit(): ✓ complete - SHA=commit456def..., duration=1234ms

// ✅ Error Handling:
[CodeLedger:GitHandler] commit(): API call failed - status=429, retrying...
[CodeLedger:GitHandler] commit(): retry #1/3 after 5000ms backoff
[CodeLedger:GitHandler] commit(): ✓ retry successful

[CodeLedger:GitHandler] commit(): permanent error - status=401 (invalid token)
[CodeLedger:GitHandler] commit(): ✗ auth failed - skipping fallback
```

### Sync Engine (`src/background/sync-engine.js`)

**Purpose:** Cross-device synchronization

```javascript
// ✅ Import Flow:
[CodeLedger:SyncEngine] importFromRepo(): entering
[CodeLedger:SyncEngine] importFromRepo(): fetching remote index.json...
[CodeLedger:SyncEngine] importFromRepo(): ✓ fetched - 127 remote problems

[CodeLedger:SyncEngine] importFromRepo(): comparing with local (local=120 problems)
[CodeLedger:SyncEngine] importFromRepo(): detected 7 new problems

[CodeLedger:SyncEngine] importFromRepo(): importing gfg/1...
[CodeLedger:SyncEngine] importFromRepo(): ✓ gfg/1 imported
[CodeLedger:SyncEngine] importFromRepo(): importing cf/50...
[CodeLedger:SyncEngine] importFromRepo(): ✓ cf/50 imported

[CodeLedger:SyncEngine] importFromRepo(): ✓ sync complete - 7 new problems imported, duration=2341ms

// ✅ Webhook Trigger:
[CodeLedger:SyncEngine] handleWebhook(): device-sync-triggered event
[CodeLedger:SyncEngine] handleWebhook(): initiating full resync...
[CodeLedger:SyncEngine] handleWebhook(): ✓ resync queued
```

### Storage Abstraction (`src/core/storage.js`)

**Purpose:** Persistent data management

```javascript
// ✅ Problem Operations:
[CodeLedger:Storage] getAllProblems(): querying IndexedDB...
[CodeLedger:Storage] getAllProblems(): ✓ fetched 120 problems

[CodeLedger:Storage] getProblemById(lc/1): fetching single problem...
[CodeLedger:Storage] getProblemById(): ✓ found - title=Two Sum, committed=true

[CodeLedger:Storage] setProblems(): saving 1 problems...
[CodeLedger:Storage] setProblems(): ✓ saved - duration=45ms

// ✅ Settings Operations:
[CodeLedger:Storage] getSettings(): fetching from chrome.storage.local...
[CodeLedger:Storage] getSettings(): ✓ loaded - github_owner=VKrishna04, ai_providers=3

[CodeLedger:Storage] setSettings(): updating github_repo
[CodeLedger:Storage] setSettings(): ✓ updated - duration=12ms

// ✅ Auth Token Operations:
[CodeLedger:Storage] getAuthToken(github): fetching OAuth token...
[CodeLedger:Storage] getAuthToken(): ✓ found - token_len=40

[CodeLedger:Storage] setAuthToken(github): saving new token
[CodeLedger:Storage] setAuthToken(): ✓ saved - token_len=40
```

### AI Providers (`src/handlers/ai/{provider}/index.js`)

**Purpose:** Interface with external AI services

```javascript
// ✅ Gemini:
[CodeLedger:GeminiAI] generateReview(): entering - problem=two-sum
[CodeLedger:GeminiAI] generateReview(): building prompt...
[CodeLedger:GeminiAI] generateReview(): calling Gemini API...
[CodeLedger:GeminiAI] generateReview(): ✓ response received - length=234 chars, duration=1234ms
[CodeLedger:GeminiAI] generateReview(): parsing markdown...
[CodeLedger:GeminiAI] generateReview(): ✓ complete

// ✅ Error:
[CodeLedger:GeminiAI] generateReview(): API error - 429 QUOTA_EXCEEDED
[CodeLedger:GeminiAI] generateReview(): ✗ failed - will retry

// ✅ OpenAI:
[CodeLedium:OpenAIAI] generateReview(): calling OpenAI API...
[CodeLedger:OpenAIAI] generateReview(): ✓ response received - tokens_used=150

// ✅ Claude:
[CodeLedger:ClaudeAI] generateReview(): calling Claude API...
[CodeLedger:ClaudeAI] generateReview(): ✓ response received - stop_reason=end_turn
```

---

## Debug Checklist

### Problem Not Getting Committed

```
1. Check service worker is running:
   [CodeLedger:ServiceWorker] handleSolved(): ✓ complete

2. Check Git commit succeeded:
   [CodeLedger:GitHandler] commit(): ✓ complete - SHA=...

3. Check GitHub API credentials:
   [CodeLedger:GitHandler] commit(): permanent error - status=401
   → Re-authenticate in Settings

4. Verify GitHub repo settings:
   [CodeLedger:Storage] getSettings(): github_owner=VKrishna04, github_repo=DSA-Solutions
```

### AI Review Not Processing

```
1. Check queue is initialized:
   [CodeLedger:AIReviewQueue] initializeReviewQueueStore(): ✓ store ready

2. Check item was enqueued:
   [CodeLedger:AIReviewQueue] enqueueReview(): ✓ added to queue

3. Check alarm is running:
   chrome.alarms.getAll() → should show codeledger-review-queue

4. Check AI provider is configured:
   [CodeLedger:Storage] getSettings(): ai_providers={gemini: enabled}

5. Check for failed items:
   await getQueueStats() → check "failed" count

6. Export queue state:
   const state = await exportQueueState();
   console.log(state.filter(i => i.status === "failed"));
```

### Cross-Device Sync Not Working

```
1. Check webhook endpoint:
   Settings → verify codeledger.vkrishna04.me is configured

2. Check index.json is updated:
   [CodeLedger:GitHandler] commit(): ✓ updated index.json

3. Check sync engine is listening:
   [CodeLedger:SyncEngine] handleWebhook(): device-sync-triggered event

4. Manually trigger sync:
   await handleResyncAll()

5. Check for import errors:
   [CodeLedger:SyncEngine] importFromRepo(): failed - error=...
```

---

## Performance Profiling

### Measure Full Solve Cycle

```javascript
// Instrument in handleSolved():
const startTime = performance.now();

dbg.log(`handleSolved(): entering - problem=${problem.titleSlug}`);

// ... processing ...

const duration = performance.now() - startTime;
dbg.log(`handleSolved(): ✓ complete - duration=${duration.toFixed(0)}ms`);
// Output: ✓ complete - duration=234ms
```

**Expected Timings:**
- Validation & normalization: 10-50ms
- Duplicate detection: 20-100ms
- Git commit (Trees API): 500-1500ms
- AI queue enqueue: 5-20ms
- **Total:** 600-1700ms

### Measure Queue Processing

```javascript
// In processAIReviewQueue():
const stats = await getQueueStats();
dbg.log(`Queue stats: pending=${stats.pending}, processing=${stats.processing}, done=${stats.done}, failed=${stats.failed}`);

// Measure AI generation time:
const aiStart = performance.now();
const review = await aiProvider.generateReview(problem);
const aiDuration = performance.now() - aiStart;
dbg.log(`AI generation: ${aiDuration.toFixed(0)}ms`);
// Output: AI generation: 1234ms (typically 1-3 seconds)
```

---

## Monitoring Dashboard (Browser Console)

```javascript
// Create real-time dashboard
async function showDashboard() {
    setInterval(async () => {
        console.clear();
        console.log("╔════════════════════════════════════╗");
        console.log("║   CodeLedger Queue Health Check    ║");
        console.log("╚════════════════════════════════════╝");

        const stats = await getQueueStats();
        console.table({
            "Pending": `${stats.pending} items`,
            "Processing": `${stats.processing} items`,
            "Done": `${stats.done} items`,
            "Failed": `${stats.failed} items`,
            "Total": `${stats.total} items`
        });

        // Show failed items
        const items = await getAllQueueItems();
        const failed = items.filter(i => i.status === "failed");
        if (failed.length > 0) {
            console.warn(`⚠️ ${failed.length} FAILED ITEMS:`);
            failed.forEach(i => {
                console.log(`   ${i.problemId}: ${i.error}`);
            });
        }

        // Check alarms
        chrome.alarms.getAll((alarms) => {
            console.log("🔔 Active Alarms:");
            alarms.forEach(a => {
                const inMs = a.scheduledTime - Date.now();
                console.log(`   ${a.name}: in ${(inMs/1000).toFixed(1)}s`);
            });
        });

    }, 5000); // Update every 5 seconds
}

// Start dashboard
showDashboard();
```

---

## Log Levels & Conventions

### Log Levels Used

```javascript
// ✅ dbg.log() — Normal operation
[CodeLedger:ServiceWorker] init(): ✓ debug initialized

// ⚠️ dbg.warn() — Warning/recoverable error
[CodeLedger:GitHandler] commit(): API call failed - status=429, retrying...

// ❌ dbg.error() — Error/non-recoverable
[CodeLedger:ServiceWorker] handleSolved(): ✗ failed - error=AUTH_FAILED
```

### Message Conventions

```javascript
// Entry
dbg.log(`functionName(): entering with param=${value}`);

// Progress
dbg.log(`functionName(): building tree...`);

// Success (with ✓ checkmark)
dbg.log(`functionName(): ✓ result=${value}`);

// Info with metrics
dbg.log(`functionName(): ✓ complete - duration=${ms}ms, count=${n}`);

// Warning (with ⚠️)
dbg.warn(`functionName(): skipping ${reason}`);

// Error (with ✗)
dbg.error(`functionName(): ✗ failed`, error?.message);
```

---

## Exporting Logs for Debugging

```javascript
// Get all console messages (if supported)
chrome.tabs.executeScript({
    code: `
        window.codeLedgerLogs = [];
        const originalLog = console.log;
        console.log = function(...args) {
            window.codeLedgerLogs.push({
                timestamp: new Date().toISOString(),
                level: 'log',
                args: args.map(a => typeof a === 'string' ? a : JSON.stringify(a))
            });
            originalLog.apply(console, args);
        };
    `
});

// Export logs
const logs = await chrome.tabs.executeScript({
    code: 'window.codeLedgerLogs'
});

// Save to file
const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `codeledger-logs-${Date.now()}.json`;
a.click();
```

---

## Related Documentation

- [Queues & Orchestration](../queues/orchestration.md)
- [System Architecture](../architecture/system-architecture.md)
- [Adding Platform Handlers](../guides/development/adding-platform-handler.md)

---

**Version:** 1.0 | **Last Updated:** May 2026
