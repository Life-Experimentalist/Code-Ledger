# CodeLedger Queue Systems & Orchestration

**Comprehensive guide to AI Review Queue, Commit Processing, and Synchronization Pipeline**

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Diagrams](#architecture-diagrams)
3. [AI Review Queue System](#ai-review-queue-system)
4. [Commit Processing Pipeline](#commit-processing-pipeline)
5. [Synchronization Engine](#synchronization-engine)
6. [Error Handling & Retry Logic](#error-handling--retry-logic)
7. [Data Flow Examples](#data-flow-examples)
8. [Configuration & Monitoring](#configuration--monitoring)

---

## Overview

CodeLedger uses a **multi-layered queue system** to manage problem-solving events, AI reviews, and GitHub commits asynchronously and reliably:

| Component                  | Purpose                                                      | Storage              | Persistence           |
| -------------------------- | ------------------------------------------------------------ | -------------------- | --------------------- |
| **AI Review Queue**        | Enqueue, prioritize, and process AI reviews with retry logic | IndexedDB            | ✅ Cross-session      |
| **Commit Queue**           | Batched GitHub commits for solved problems                   | Memory + GitHub      | ✅ Resumed on restart |
| **Sync Engine**            | Cross-device sync via GitHub repo index                      | GitHub + IndexedDB   | ✅ Webhook-triggered  |
| **Settings Commit Queue**  | Auto-commit settings changes on interval                     | chrome.storage.local | ✅ Persisted          |
| **Metadata Refresh Queue** | Background metadata refresh for problems                     | In-flight state      | ⚠️ Per-session        |

**Key Properties:**

- **Persistent**: Survives browser crashes, restarts, and closed tabs
- **Prioritized**: Problems can be prioritized (lower = higher priority)
- **Retry-aware**: Exponential backoff with max retries before manual intervention
- **Rate-limited**: Respects GitHub API rate limits with adaptive delays
- **Observable**: Full debug logging at each transition

---

## Architecture Diagrams

### System Overview Flowchart

```mermaid
graph TB
    subgraph "Content Scripts"
        Handler["Platform Handler<br/>(Detects Solve)"]
    end

    subgraph "Event Bus"
        EventBus["problem:solved Event"]
    end

    subgraph "Service Worker"
        SW["Service Worker<br/>(Orchestrator)"]
        ReviewQ["AI Review Queue<br/>(IndexedDB)"]
        CommitQ["Commit Processing<br/>(In-Memory)"]
    end

    subgraph "External Services"
        AI["AI Provider<br/>(Gemini/OpenAI/Claude)"]
        GitHub["GitHub API<br/>(Tree API)"]
    end

    subgraph "Storage"
        IndexedDB["IndexedDB<br/>(Problems + Queue)"]
        ChromeStorage["chrome.storage.local<br/>(Settings)"]
    end

    Handler -->|emit| EventBus
    EventBus -->|listen| SW
    SW -->|enqueue| ReviewQ
    SW -->|process| CommitQ
    ReviewQ -->|read/write| IndexedDB
    CommitQ -->|call| AI
    CommitQ -->|call| GitHub
    SW -->|persist| ChromeStorage

    style Handler fill:#4A90E2
    style EventBus fill:#F5A623
    style SW fill:#7ED321
    style ReviewQ fill:#FF6B6B
    style CommitQ fill:#50E3C2
    style AI fill:#9013FE
    style GitHub fill:#B8E986
    style IndexedDB fill:#C1D82F
    style ChromeStorage fill:#FF0000
```

**Legend:**

- **Blue** = Content Script (HTML injection)
- **Orange** = Event System
- **Green** = Background Service Worker
- **Red** = Queue Systems
- **Purple/Teal** = External Services
- **Yellow** = Storage

---

### AI Review Queue State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING: enqueueReview()

    PENDING --> PROCESSING: getNextPendingReview()<br/>+ markProcessing()
    PENDING --> [*]: cancelPendingReviews()<br/>or timeout

    PROCESSING --> DONE: markDone()<br/>(✓ success)
    PROCESSING --> FAILED: markFailedWithRetry()<br/>(✗ error)

    FAILED --> PENDING: retry after backoff<br/>(< MAX_RETRIES)
    FAILED --> [*]: abandoned<br/>(retries exhausted)

    DONE --> [*]: clearCompletedReviews()<br/>or user cleanup

    note right of PENDING
        Deduped: no duplicate
        problems for same ID
    end note

    note right of PROCESSING
        Rate limited:
        2000ms between requests
    end note

    note right of FAILED
        Exponential backoff:
        5s → 10s → 20s...
        → max 5min
    end note
```

**Transitions:**

- **PENDING → PROCESSING**: Next item pulled by review processor alarm
- **PROCESSING → DONE**: AI review succeeds, problem updated
- **PROCESSING → FAILED**: Network error, rate limit, or AI error
- **FAILED → PENDING**: Retry with exponential backoff (retryCount < 5)
- **FAILED → [*]**: All retries exhausted, manual intervention needed

---

### Problem Solve Complete Flow

```mermaid
graph LR
    subgraph "Step 1: Detection"
        A1["User submits<br/>solution"]
        A2["Handler detects<br/>accepted"]
        A3["problem:solved<br/>event fired"]
    end

    subgraph "Step 2: AI Review"
        B1["enqueueReview()<br/>added to queue"]
        B2["Alarm triggers<br/>processAIReviewQueue()"]
        B3["getNextPendingReview()"]
        B4["AI review generated<br/>(Gemini/OpenAI/Claude)"]
        B5["Result saved to IndexedDB"]
    end

    subgraph "Step 3: Commit"
        C1["Service-worker handles<br/>problem:solved"]
        C2["Storage.setProblems()"]
        C3["Build file tree"]
        C4["GitHub Tree API call"]
        C5["Atomic multi-file<br/>commit to main"]
    end

    subgraph "Step 4: Sync"
        D1["Commit callback<br/>updates index.json"]
        D2["Library page<br/>refreshes"]
        D3["Cross-device webhook<br/>triggered"]
    end

    A1 --> A2 --> A3 --> B1
    B1 --> B2 --> B3 --> B4 --> B5
    A3 --> C1 --> C2 --> C3 --> C4 --> C5
    C5 --> D1 --> D2
    D1 -.-> D3

    style A1 fill:#4A90E2
    style B1 fill:#FF6B6B
    style B4 fill:#9013FE
    style C4 fill:#B8E986
    style D3 fill:#50E3C2
```

**Timing:**

- Steps 1-3 happen within 1-2 seconds of solve
- Step 2 (AI Review) happens on scheduled alarm (default: every 5-10 seconds)
- Step 4 (Sync) triggered by webhook (GitHub → Cloudflare Worker → Extension)

---

### Detailed Queue Architecture

```mermaid
graph TB
    subgraph "IndexedDB: codeledger-queue"
        QStore["Object Store: ai-review-queue<br/>key: id (review-{problemId}-{timestamp})"]
        QIdx1["Index: statusIndex<br/>(pending, processing, done, failed)"]
        QIdx2["Index: problemIdIndex<br/>(deduplication)"]
    end

    subgraph "Queue Item Schema"
        Item["<b>QueueItem</b><br/>├─ id: string<br/>├─ problemId: string<br/>├─ status: 'pending'|'processing'|'done'|'failed'<br/>├─ priority: number (0=highest)<br/>├─ retryCount: number<br/>├─ lastAttempt: timestamp<br/>├─ nextRetryTime: timestamp<br/>├─ error: string?<br/>├─ createdAt: timestamp<br/>└─ updatedAt: timestamp"]
    end

    subgraph "Operations"
        Op1["initializeReviewQueueStore()<br/>Creates DB + indexes"]
        Op2["enqueueReview(problemId, priority)<br/>Add + deduplicate"]
        Op3["getNextPendingReview()<br/>Fetch oldest pending"]
        Op4["markProcessing(itemId)<br/>Transition state"]
        Op5["markDone(itemId)<br/>Mark complete"]
        Op6["markFailedWithRetry(itemId, error)<br/>Exponential backoff"]
        Op7["getQueueStats()<br/>Count by status"]
        Op8["clearCompletedReviews()<br/>Delete done/failed"]
    end

    QStore --> QIdx1
    QStore --> QIdx2
    QStore --> Item
    Op1 -.-> QStore
    Op2 -.-> QStore
    Op3 -.-> QIdx1
    Op4 -.-> QStore
    Op5 -.-> QStore
    Op6 -.-> QStore
    Op7 -.-> QIdx1
    Op8 -.-> QStore

    style QStore fill:#FF6B6B
    style Item fill:#FFB3B3
    style Op1 fill:#50E3C2
    style Op2 fill:#50E3C2
```

---

## AI Review Queue System

### Detailed Specification

**File:** [`src/core/ai-review-queue.js`](../src/core/ai-review-queue.js)

#### Key Features

| Feature            | Implementation                                             | Notes                        |
| ------------------ | ---------------------------------------------------------- | ---------------------------- |
| **Persistence**    | IndexedDB (`codeledger-queue` DB)                          | Survives browser restart     |
| **Deduplication**  | Query by `problemId` before enqueuing                      | Prevents duplicate reviews   |
| **Prioritization** | `priority` field (0 = highest)                             | Lower wins in sort order     |
| **Retry Logic**    | Exponential backoff: 5s → 10s → 20s → 40s → 80s → 300s max | Max 5 retries (configurable) |
| **Rate Limiting**  | 2000ms between requests (configurable)                     | Respects GitHub API limits   |
| **Debugging**      | Full `createDebugger("AIReviewQueue")` logging             | Track state transitions      |

#### Database Schema

```javascript
{
    id: "review-lc/123-1715600000000",      // Unique: review-{problemId}-{timestamp}
    problemId: "lc/123",                    // Platform-scoped problem ID
    status: "pending",                      // pending | processing | done | failed
    priority: 100,                          // Lower = higher priority
    retryCount: 0,                          // Current retry attempt
    lastAttempt: null,                      // Timestamp of last processing attempt
    nextRetryTime: null,                    // When to retry (for failed items)
    error: null,                            // Error message if failed
    createdAt: 1715600000000,               // Created timestamp
    updatedAt: 1715600000000,               // Last updated timestamp
}
```

#### Example: Complete Review Flow

```javascript
// 1. Enqueue a review
const result = await enqueueReview("lc/123", 50);
// → { id: "review-lc/123-1715600000000", status: "pending", skipped: false }

// 2. Service worker polls on alarm (every 5-10 seconds)
const nextItem = await getNextPendingReview();
// → Returns oldest pending item (sorted by priority ASC, createdAt ASC)

// 3. Mark as processing
await markProcessing(nextItem.id);
// → Updates status to "processing", sets lastAttempt

// 4. AI provider generates review
const review = await aiProvider.generateReview(problem);
// → Returns { content: "...", suggestions: [...] }

// 5. Save review to problem
problem.aiReview = review.content;
await Storage.setProblems([problem]);

// 6. Mark as done
await markDone(nextItem.id);
// → Updates status to "done", updatedAt = now()

// 7. On next cleanup, remove from queue
await clearCompletedReviews();
// → Deletes all done/failed items
```

#### Error Handling & Retries

```javascript
// If AI review fails:
try {
  const review = await aiProvider.generateReview(problem);
} catch (error) {
  await markFailedWithRetry(item.id, error.message);
  // → Updates retryCount++, calculates nextRetryTime with backoff
  // → If retryCount >= MAX_RETRIES, stays in "failed" status
  // → Otherwise, item will be retried on next alarm
}

// Backoff calculation:
const backoffMs = Math.min(
  RETRY_BASE_DELAY_MS * Math.pow(2, retryCount),
  RETRY_MAX_DELAY_MS,
);
// 1st retry: 5000ms (5s)
// 2nd retry: 10000ms (10s)
// 3rd retry: 20000ms (20s)
// 4th retry: 40000ms (40s)
// 5th retry: 80000ms (80s)
// 6th+ retry: 300000ms (5min, capped)
```

---

## Commit Processing Pipeline

### How Problems Become GitHub Commits

**Location:** [`src/background/service-worker.js`](../src/background/service-worker.js) → `handleSolved()`

```mermaid
graph LR
    subgraph "Input"
        Event["<b>problem:solved Event</b><br/>title, titleSlug, code, lang,<br/>tags, difficulty, aiReview,<br/>runtime, memory, ..."]
    end

    subgraph "Normalization"
        Step1["Normalize problem ID<br/>(lc/123, gfg/456, cf/789)"]
        Step2["Validate code & metadata<br/>Check for required fields"]
        Step3["Detect duplicate<br/>Compare against existing"]
    end

    subgraph "Preparation"
        Step4["Build file tree<br/>(buildProblemFiles)"]
        Step5["Generate commit message<br/>(resolveCommitType)"]
        Step6["Add index.json entry<br/>(metadata + timestamp)"]
    end

    subgraph "Execution"
        Step7["Call GitHub Trees API<br/>POST /git/trees"]
        Step8["Create commit<br/>POST /git/commits"]
        Step9["Update branch ref<br/>PATCH /git/refs/heads/main"]
    end

    subgraph "Result"
        Step10["Save to IndexedDB<br/>(update problem.committed)"]
        Step11["Enqueue AI review<br/>(if enabled)"]
        Step12["Trigger sync webhook<br/>(update library)"]
    end

    Event --> Step1 --> Step2 --> Step3
    Step3 --> Step4 --> Step5 --> Step6
    Step6 --> Step7 --> Step8 --> Step9
    Step9 --> Step10 --> Step11 --> Step12

    style Event fill:#4A90E2
    style Step7 fill:#B8E986
    style Step10 fill:#FF6B6B
    style Step11 fill:#FF6B6B
```

### File Tree Structure Generated

```javascript
// Example problem solve generates:
{
    topic: "arrays",
    titleSlug: "two-sum",
    files: [
        // User code
        {
            path: "arrays/two-sum/two-sum.js",
            content: "function twoSum(nums, target) { ... }"
        },
        // Runtime metadata
        {
            path: "arrays/two-sum/index.json",
            content: JSON.stringify({
                platform: "leetcode",
                difficulty: "Easy",
                runtime: "75ms",
                memory: "45MB",
                aiReview: "Well-optimized...",
                timestamp: 1715600000000,
                lang: { name: "JavaScript", ext: "js" },
                tags: ["hash-table", "array"]
            }, null, 2)
        }
    ]
}
```

### Commit Message Types

**File:** [`src/core/commit-messages.js`](../src/core/commit-messages.js)

| Type         | Pattern                    | Example                                           |
| ------------ | -------------------------- | ------------------------------------------------- |
| **solve**    | New problem                | `solve(arrays/two-sum): Two Sum`                  |
| **optimize** | Existing problem re-solved | `optimize(arrays/two-sum): Improved solution`     |
| **refactor** | Code improvements          | `refactor(arrays/two-sum): Better variable names` |
| **metadata** | Only metadata changed      | `metadata(arrays/two-sum): Update runtime`        |

---

## Synchronization Engine

### Cross-Device Sync Overview

**File:** [`src/background/sync-engine.js`](../src/background/sync-engine.js)

```mermaid
graph TB
    subgraph "Device A (Primary)"
        A1["User solves problem"]
        A2["Service Worker commits<br/>to GitHub"]
        A3["Updates index.json<br/>with problem metadata"]
    end

    subgraph "GitHub"
        GH["GitHub Repository<br/>Branch: main<br/>File: index.json<br/>(all problems)"]
        WH["GitHub Webhook<br/>(on push to main)"]
    end

    subgraph "Backend"
        Worker["Cloudflare Worker<br/>/api/webhook/github<br/>(processes push)"]
        Pub["Publishes event:<br/>device-sync-triggered"]
    end

    subgraph "Device B (Secondary)"
        B1["Receives webhook event"]
        B2["Fetches latest index.json<br/>from GitHub"]
        B3["Detects new problems"]
        B4["Imports to IndexedDB<br/>(applyImport)"]
        B5["Library page refreshes<br/>auto-synced"]
    end

    A1 --> A2 --> A3
    A3 --> GH
    GH --> WH
    WH --> Worker
    Worker --> Pub
    Pub --> B1
    B1 --> B2 --> B3 --> B4 --> B5

    style A2 fill:#B8E986
    style A3 fill:#FF6B6B
    style GH fill:#4A90E2
    style Worker fill:#7ED321
    style B4 fill:#FF6B6B
```

### Sync Data Flow

```javascript
// On every problem solve:
{
    // Existing index.json (from GitHub)
    index: {
        "lc/1": { title: "Two Sum", ... },
        "lc/2": { title: "Add Two Numbers", ... }
    }

    // New problem to add
    newProblem: {
        problemId: "lc/3",
        title: "Longest Substring",
        platform: "leetcode",
        timestamp: Date.now()
    }

    // After commit, index.json becomes:
    // {
    //     "lc/1": { ... },
    //     "lc/2": { ... },
    //     "lc/3": { title: "Longest Substring", ... }
    // }
}

// On Device B (webhook trigger):
// 1. Fetch updated index.json
// 2. Compare with local IndexedDB index
// 3. For each new problemId in remote:
//    a. Fetch problem files from GitHub
//    b. Import to IndexedDB
//    c. Add to library view
```

---

## Error Handling & Retry Logic

### Multi-Level Retry Strategy

```mermaid
graph TD
    subgraph "Level 1: Queue-Level Retry"
        L1A["markFailedWithRetry()<br/>called"]
        L1B["Exponential backoff:<br/>5s → 10s → 20s → ... → 5min"]
        L1C["Max 5 retries<br/>per problem"]
        L1D{Retries<br/>exhausted?}
        L1E["Item stays in<br/>queue (manual)"]
    end

    subgraph "Level 2: Service Worker Alarm"
        L2A["processAIReviewQueue()<br/>runs every 5-10s"]
        L2B["Checks for failed items<br/>past nextRetryTime"]
        L2C["Transitions to PENDING<br/>for retry"]
    end

    subgraph "Level 3: GitHub API"
        L3A["Trees API call<br/>fails"]
        L3B{Transient error?<br/>429, 5xx, timeout}
        L3C["Retry with<br/>exponential backoff"]
        L3D["Permanent error?<br/>401, 403, 404, 422"]
        L3E["Fallback to<br/>mirror repo"]
    end

    subgraph "Level 4: User Intervention"
        L4A["Queue UI shows<br/>failed item"]
        L4B["User can:<br/>• Retry manually<br/>• Remove item<br/>• Check logs"]
    end

    L1A --> L1B --> L1C --> L1D
    L1D -->|No| L2A
    L1D -->|Yes| L1E --> L4A
    L2A --> L2B --> L2C
    L2C -.-> L1A
    L3A --> L3B
    L3B -->|Yes| L3C
    L3B -->|No| L3D
    L3D -->|Yes| L3E
    L3D -->|No| L1A
    L4A --> L4B

    style L1A fill:#FF6B6B
    style L1E fill:#FF0000
    style L2A fill:#50E3C2
    style L3C fill:#FFD700
    style L3E fill:#FFA500
    style L4A fill:#9013FE
```

### Error Classification

| Error Type         | Cause                                        | Action                      |
| ------------------ | -------------------------------------------- | --------------------------- |
| **Transient**      | 429 (rate limit), 5xx, timeout, network      | Retry with backoff          |
| **Authentication** | 401 (invalid token), 403 (no permission)     | Prompt re-auth, skip commit |
| **Client Error**   | 400, 422 (bad payload), 404 (repo not found) | Log & fail (no retry)       |
| **Concurrent**     | Duplicate problem already exists             | Deduplicate, update instead |
| **AI Provider**    | Quota exceeded, model unavailable            | Fallback to simpler review  |

### Logging Example

```javascript
// In createDebugger("ServiceWorker"):

dbg.log(`handleSolved(): entering - problem=${problem.titleSlug}`);
dbg.log(`handleSolved(): normalizing ID to platform format`);

// Try commit
try {
  dbg.log(`handleSolved(): calling GitEngine.commit()...`);
  await gitEngine.commit(problem);
  dbg.log(`handleSolved(): ✓ commit succeeded`);
} catch (error) {
  dbg.error(`handleSolved(): commit failed - ${error.message}`);

  if (error.status === 429) {
    dbg.log(`handleSolved(): rate limit detected - will retry`);
    await markFailedWithRetry(queueId, error.message);
  } else if (error.status === 404) {
    dbg.error(`handleSolved(): repo not found - abandoning`);
  }
}

// Enqueue review
dbg.log(`handleSolved(): enqueueing AI review...`);
await enqueueReview(problem.problemId);
dbg.log(`handleSolved(): ✓ review enqueued`);
```

---

## Data Flow Examples

### Example 1: Complete Solve → Review → Commit → Sync

```mermaid
sequenceDiagram
    participant User as User<br/>(LeetCode)
    participant Content as Content<br/>Script
    participant SW as Service<br/>Worker
    participant ReviewQ as Review<br/>Queue
    participant AI as AI<br/>Provider
    participant GitHub as GitHub<br/>API
    participant Device2 as Device 2<br/>(optional)

    User->>Content: Submit solution
    Content->>SW: problem:solved event
    SW->>SW: Save problem to IndexedDB
    SW->>ReviewQ: enqueueReview(lc/123)

    SW->>GitHub: Commit files (Tree API)
    GitHub->>SW: ✓ Commit created

    Note over ReviewQ: [Next alarm tick]
    ReviewQ->>ReviewQ: getNextPendingReview()
    ReviewQ->>AI: generateReview(problem)
    AI->>AI: Call LLM (Gemini/OpenAI)
    AI->>ReviewQ: ✓ Review generated
    ReviewQ->>SW: Update problem.aiReview

    SW->>GitHub: Update index.json
    GitHub->>GitHub: Webhook triggered
    GitHub->>Device2: POST /webhook
    Device2->>Device2: Import new problem
    Device2->>Device2: Library refreshes

    Note over User: [Result] Problem saved<br/>with AI review visible
```

### Example 2: Error & Retry Flow

```mermaid
sequenceDiagram
    participant SW as Service Worker
    participant ReviewQ as Review Queue
    participant AI as AI Provider
    participant GitHub as GitHub

    SW->>ReviewQ: enqueueReview(lc/123)
    Note over ReviewQ: status=PENDING

    ReviewQ->>ReviewQ: getNextPendingReview()
    ReviewQ->>AI: generateReview()

    AI-->>ReviewQ: ✗ Error: Quota exceeded
    ReviewQ->>ReviewQ: markFailedWithRetry()
    Note over ReviewQ: status=FAILED<br/>retryCount=1<br/>nextRetryTime=now+5s

    Note over ReviewQ: [5s later]
    ReviewQ->>ReviewQ: Check nextRetryTime
    ReviewQ->>ReviewQ: Transition to PENDING
    Note over ReviewQ: status=PENDING (retry)

    ReviewQ->>AI: generateReview() [retry]
    AI->>ReviewQ: ✓ Review generated
    ReviewQ->>SW: Update problem
    Note over ReviewQ: status=DONE

    SW->>GitHub: Commit to repo
```

---

## Configuration & Monitoring

### Configuration Constants

**File:** [`src/core/constants.js`](../src/core/constants.js)

```javascript
// AI Review Queue
const REVIEW_RATE_LIMIT_MS = 2000; // Min interval between reviews
const RETRY_BASE_DELAY_MS = 5000; // Start at 5 seconds
const RETRY_MAX_DELAY_MS = 300000; // Cap at 5 minutes
const MAX_RETRIES = 5; // Max retry attempts

// Alarms (periodic tasks)
const ALARM_NAMES = {
  SYNC: "codeledger-sync", // Full sync every 4 hours
  REVIEW: "codeledger-review-queue", // Process reviews every 5-10s
  SETTINGS_COMMIT: "codeledger-settings", // Commit settings every 30s
  BACKUP: "codeledger-backup", // Backup every 24 hours
};

// Backoff strategy
function calculateBackoff(retryCount) {
  const exponential = RETRY_BASE_DELAY_MS * Math.pow(2, retryCount);
  return Math.min(exponential, RETRY_MAX_DELAY_MS);
}
```

### Monitoring & Debugging

#### Check Queue Status

```javascript
// In browser console (library page):
import { getQueueStats, getAllQueueItems } from "/core/ai-review-queue.js";

// Get stats
const stats = await getQueueStats();
console.log("Queue Stats:", stats);
// Output:
// {
//     pending: 3,
//     processing: 0,
//     done: 42,
//     failed: 2,
//     total: 47
// }

// Get all items
const items = await getAllQueueItems();
console.log("Queue Items:", items);
// Output: [{ id, problemId, status, retryCount, ... }, ...]
```

#### Enable Debug Logging

```javascript
// In browser console:
import { setDebug } from "/lib/debug.js";

// Enable all debug logs
setDebug(true);

// Or enable specific modules:
// Logs will appear as:
// [CodeLedger:ServiceWorker] init(): ✓ debug initialized...
// [CodeLedger:AIReviewQueue] enqueueReview: lc/123 enqueued
// [CodeLedger:GitEngine] commit(): building tree...
```

#### Monitor Alarms

```javascript
// Check all active alarms:
chrome.alarms.getAll((alarms) => {
  console.log("Active Alarms:", alarms);
  // Output:
  // [
  //     { name: 'codeledger-sync', scheduledTime: 1715603600000 },
  //     { name: 'codeledger-review-queue', scheduledTime: 1715600005000 },
  //     { name: 'codeledger-settings', scheduledTime: 1715600030000 }
  // ]
});
```

#### Export Queue State (for debugging)

```javascript
// Export all queue items for debugging
const state = await exportQueueState();
console.log(JSON.stringify(state, null, 2));

// Save to file for analysis
const blob = new Blob([JSON.stringify(state, null, 2)], {
  type: "application/json",
});
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = "codeledger-queue-export.json";
a.click();
```

### Health Check Dashboard (Proposed)

```mermaid
graph LR
    subgraph "Health Indicators"
        H1["Queue<br/>Pending: 3<br/>Failed: 0"]
        H2["Last Sync<br/>5 min ago<br/>✓ OK"]
        H3["AI Status<br/>Gemini ✓<br/>OpenAI ✓"]
        H4["GitHub<br/>Rate: 45/60<br/>✓ OK"]
    end

    subgraph "Actions"
        A1["Force Sync Now"]
        A2["Clear Queue"]
        A3["Export Logs"]
        A4["Test AI"]
    end

    H1 --> A2
    H2 --> A1
    H3 --> A4
    H4 --> A3

    style H1 fill:#7ED321
    style H2 fill:#7ED321
    style H3 fill:#7ED321
    style H4 fill:#7ED321
```

---

## Related Documentation

- **[Architecture](../architecture/README.md)** — System-wide architecture overview
- **[System Architecture](../architecture/system-architecture.md)** — Detailed commit flow
- **[OAuth Testing Guide](../guides/setup/oauth-testing-guide.md)** — Auth setup
- **[Adding Platform Handlers](../guides/development/adding-platform-handler.md)** — Platform integration

---

## Glossary

| Term              | Definition                                                     |
| ----------------- | -------------------------------------------------------------- |
| **problemId**     | Platform-scoped ID: `lc/123`, `gfg/456`, `cf/789`              |
| **Queue**         | Persistent FIFO store with retry & prioritization logic        |
| **Enqueue**       | Add item to queue; deduplicates if already pending             |
| **Dequeue**       | Retrieve next item (oldest pending, sorted by priority)        |
| **Backoff**       | Exponential delay between retries: 5s → 10s → 20s → ... → 5min |
| **Rate Limit**    | GitHub API limit; handled with 429 retry strategy              |
| **Atomic Commit** | Single GitHub commit with multiple files (via Trees API)       |
| **Webhook**       | GitHub → Cloudflare Worker → Extension (cross-device sync)     |
| **IndexedDB**     | Browser-local persistent database (survives page close)        |

---

**Document Version:** 1.0
**Last Updated:** May 2026
**Maintained by:** CodeLedger Team
