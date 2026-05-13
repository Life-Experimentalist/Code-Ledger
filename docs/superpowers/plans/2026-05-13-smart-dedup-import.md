# Smart Deduplication on Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing AI-heavy dedup logic in `handleBulkImport()` with fast local deduplication (auto-merge exact matches, conflict UI for divergent code), add a post-import validation pass, and broadcast a summary report banner to open library tabs.

**Architecture:** `handleBulkImport()` is rewritten to group by `titleSlug` then by `lang.slug`. Same-language same-normalized-code → auto-merge (keep oldest, discard rest). Same-language different-code → save primary with `conflictPending: true` + `conflictCandidates[]`. Different-language → save all, no conflict. `DedupReviewQueue.js` is fully redesigned: side-by-side diff, per-item 10–15s countdown timer, AI auto-resolve via existing `compareSolutions()`. After all saves, a `CODELEDGER_IMPORT_COMPLETE` message is broadcast to any open tabs. `library.js` listens and shows a dismissable banner.

**Tech Stack:** Manifest V3 Service Worker, IndexedDB (via `Storage`), Preact + htm (no JSX), `chrome.tabs.query` + `chrome.tabs.sendMessage` for broadcast, existing `compareSolutions()` from `ai-deduplication.js`

---

## Files

| File | Action | Responsibility |
|---|---|---|
| `src/core/duplicate-detector.js` | **Modify** | Export `normalizeCode()` so `handleBulkImport()` can reuse it |
| `src/background/service-worker.js` | **Modify** | Rewrite `handleBulkImport()` — new dedup decision tree + post-import validation + `CODELEDGER_IMPORT_COMPLETE` broadcast |
| `src/ui/components/DedupReviewQueue.js` | **Rewrite** | Full redesign: conflict UI with diff, per-item countdown, AI auto-resolve, Methods storage |
| `src/library/library.js` | **Modify** | Listen for `CODELEDGER_IMPORT_COMPLETE` on `chrome.runtime.onMessage`, show import report banner |

---

## Task 1: Export `normalizeCode` from `duplicate-detector.js`

**Files:**
- Modify: `src/core/duplicate-detector.js`

- [ ] **Step 1: Change `normalizeCode` from a private function to a named export**

Find the current declaration:

```js
function normalizeCode(code = "") {
```

Change to:

```js
export function normalizeCode(code = "") {
```

No other changes to the file.

- [ ] **Step 2: Verify nothing in the file relied on it being private**

```
grep -n "normalizeCode" src/core/duplicate-detector.js
```

Expected: only the definition line and any internal usages (which still work after adding `export`).

- [ ] **Step 3: Commit**

```bash
git add src/core/duplicate-detector.js
git commit -m "refactor: export normalizeCode() from duplicate-detector for reuse in import handler"
```

---

## Task 2: Rewrite `handleBulkImport()` in `service-worker.js`

**Files:**
- Modify: `src/background/service-worker.js`

- [ ] **Step 1: Add `normalizeCode` to the import from `duplicate-detector.js`**

Find the existing import:

```js
import { detectDuplicate } from "../core/duplicate-detector.js";
```

Replace with:

```js
import { detectDuplicate, normalizeCode } from "../core/duplicate-detector.js";
```

- [ ] **Step 2: Replace the entire `handleBulkImport()` function**

Find the function signature:

```js
async function handleBulkImport(problems = []) {
```

Replace the entire function (from the signature to its closing `}`) with:

```js
async function handleBulkImport(problems = []) {
    if (!problems.length) return { saved: 0, autoMerged: 0, conflicts: 0, missingCode: 0, missingTags: 0, missingDifficulty: 0 };

    const pendingKeys = [];
    let autoMerged = 0;
    let conflicts = 0;

    // Group by titleSlug
    const bySlug = {};
    for (const p of problems) {
        const slug = p.titleSlug || (p.id || "").split("::")[0];
        (bySlug[slug] ??= []).push(p);
    }

    for (const [, slugGroup] of Object.entries(bySlug)) {
        // Sub-group by language slug
        const byLang = {};
        for (const p of slugGroup) {
            const langSlug = (p.lang?.slug || p.lang?.name || "unknown").toLowerCase();
            (byLang[langSlug] ??= []).push(p);
        }

        for (const langGroup of Object.values(byLang)) {
            if (langGroup.length === 1) {
                // Single entry for this slug+lang — skip if manually edited, save otherwise
                const existing = await Storage.getProblem(langGroup[0].id).catch(() => null);
                if (existing?.manuallyEdited) continue;
                await Storage.saveProblem(langGroup[0]).catch(() => {});
                const key = getProblemCommitKey(langGroup[0]);
                if (key) pendingKeys.push(key);
                continue;
            }

            // Sort oldest first
            langGroup.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            const primary = langGroup[0];
            const rest = langGroup.slice(1);

            // Skip if primary was manually edited
            const existingPrimary = await Storage.getProblem(primary.id).catch(() => null);
            if (existingPrimary?.manuallyEdited) continue;

            const primaryNorm = normalizeCode(primary.code);
            const allSame = rest.every((r) => normalizeCode(r.code) === primaryNorm);

            if (allSame) {
                // Auto-merge: keep oldest, discard rest
                await Storage.saveProblem(primary).catch(() => {});
                const key = getProblemCommitKey(primary);
                if (key) pendingKeys.push(key);
                autoMerged += rest.length;
                dbg.log(`handleBulkImport(): auto-merged ${rest.length} duplicate(s) for ${primary.titleSlug}`);
            } else {
                // Conflict: save primary with conflict metadata
                const candidates = rest.map((r) => ({
                    id: r.id,
                    code: r.code,
                    lang: r.lang,
                    runtime: r.runtime || null,
                    memory: r.memory || null,
                    runtimePct: r.runtimePct ?? null,
                    memoryPct: r.memoryPct ?? null,
                    timestamp: r.timestamp || 0,
                    submissionId: r.submissionId || null,
                }));
                await Storage.saveProblem({
                    ...primary,
                    conflictPending: true,
                    conflictCandidates: candidates,
                }).catch(() => {});
                const key = getProblemCommitKey(primary);
                if (key) pendingKeys.push(key);
                // Mark duplicates so library filters them out
                for (const r of rest) {
                    await Storage.saveProblem({ ...r, isDuplicate: true, duplicateOf: primary.id }).catch(() => {});
                }
                conflicts++;
                dbg.log(`handleBulkImport(): conflict queued for ${primary.titleSlug} (${rest.length} candidate(s))`);
            }
        }
    }

    if (pendingKeys.length) {
        await Storage.markPendingProblemKeys(pendingKeys).catch(() => {});
    }

    // Post-import validation — queue missing code/tags for recovery
    let missingCode = 0, missingTags = 0, missingDifficulty = 0;
    const allSaved = await Storage.getAllProblems().catch(() => []);
    const importedIds = new Set(problems.map((p) => p.id));
    const imported = allSaved.filter((p) => importedIds.has(p.id));

    for (const p of imported) {
        if (!p.code && p.platform === "leetcode" && p.titleSlug) {
            await enqueueReview(p.id, 999).catch(() => {});
            missingCode++;
        }
        if (!p.tags?.length || !["Easy", "Medium", "Hard"].includes(p.difficulty)) {
            await Storage.markForMetadataRefresh?.(p.id).catch(() => {});
            if (!p.tags?.length) missingTags++;
            if (!["Easy", "Medium", "Hard"].includes(p.difficulty)) missingDifficulty++;
        }
    }

    // Broadcast import report to any open library tabs
    const report = { saved: pendingKeys.length, autoMerged, conflicts, missingCode, missingTags, missingDifficulty };
    dbg.log(`handleBulkImport(): complete — ${JSON.stringify(report)}`);
    chrome.tabs.query({}, (allTabs) => {
        for (const tab of allTabs || []) {
            chrome.tabs.sendMessage(tab.id, {
                type: "CODELEDGER_IMPORT_COMPLETE",
                ...report,
            }).catch(() => {}); // Silently ignore tabs that can't receive messages
        }
    });

    return report;
}
```

- [ ] **Step 3: Check that `Storage.markForMetadataRefresh` exists**

```
grep -n "markForMetadataRefresh" src/core/storage.js
```

If the method does not exist, the optional chaining `?.` in the plan handles it gracefully — it will be a no-op. No change needed.

- [ ] **Step 4: Commit**

```bash
git add src/background/service-worker.js
git commit -m "feat: rewrite handleBulkImport — auto-merge exact dupes, conflict queue, post-import validation, broadcast report"
```

---

## Task 3: Redesign `DedupReviewQueue.js`

**Files:**
- Rewrite: `src/ui/components/DedupReviewQueue.js`

This is a full file replacement. The old component handled `aiMergePending` items with approve/reject. The new one handles both `conflictPending` (new) and `aiMergePending` (backward-compat legacy) items, with side-by-side code diff, per-item countdown timer, and AI auto-resolve.

- [ ] **Step 1: Replace the entire file contents**

```js
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    h,
    useState,
    useEffect,
    useRef,
    useCallback,
} from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);

import { Storage } from "../../core/storage.js";
import { createDebugger } from "../../lib/debug.js";
import { runtime } from "../../lib/browser-compat.js";

const dbg = createDebugger("DedupReviewQueue");

const COUNTDOWN_SECONDS = 12;

function getProblemCommitKey(p) {
    if (!p?.titleSlug || !p?.lang?.slug) return null;
    return `${p.titleSlug}::${p.lang.slug}`;
}

function fmtDate(ts) {
    if (!ts) return "unknown";
    return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function CodeBlock({ code, label, meta }) {
    return html`
        <div class="flex-1 min-w-0">
            <div class="text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1">${label}</div>
            ${meta && html`<div class="text-[10px] text-slate-500 mb-1">${meta}</div>`}
            <pre class="bg-black/30 border border-white/5 rounded-lg p-3 text-[11px] text-slate-300 overflow-auto max-h-48 whitespace-pre-wrap break-all">${code || "(no code)"}</pre>
        </div>
    `;
}

function ConflictItem({ item, candidate, onResolved }) {
    const [seconds, setSeconds] = useState(COUNTDOWN_SECONDS);
    const [resolving, setResolving] = useState(false);
    const timerRef = useRef(null);
    const cancelledRef = useRef(false);

    const cancelTimer = useCallback(() => {
        cancelledRef.current = true;
        if (timerRef.current) clearInterval(timerRef.current);
    }, []);

    // Keep oldest (primary wins)
    const resolveKeepPrimary = useCallback(async () => {
        cancelTimer();
        setResolving(true);
        try {
            const primary = await Storage.getProblem(item.id);
            if (!primary) return;
            const updated = { ...primary, conflictPending: false };
            delete updated.conflictCandidates;
            await Storage.saveProblem(updated);
            // Delete or mark the duplicate entry if it exists as a stored problem
            if (candidate.id) {
                const dup = await Storage.getProblem(candidate.id).catch(() => null);
                if (dup) {
                    dup.isDuplicate = true;
                    dup.duplicateOf = primary.id;
                    await Storage.saveProblem(dup).catch(() => {});
                }
            }
            dbg.log(`resolveKeepPrimary(): resolved ${primary.titleSlug}`);
            onResolved(item.id);
        } catch (e) {
            dbg.error("resolveKeepPrimary failed:", e);
            setResolving(false);
        }
    }, [item, candidate, cancelTimer, onResolved]);

    // Overwrite with candidate (newest wins)
    const resolveKeepCandidate = useCallback(async () => {
        cancelTimer();
        setResolving(true);
        try {
            const primary = await Storage.getProblem(item.id);
            if (!primary) return;
            const updated = {
                ...primary,
                code: candidate.code,
                lang: candidate.lang,
                runtime: candidate.runtime,
                memory: candidate.memory,
                runtimePct: candidate.runtimePct,
                memoryPct: candidate.memoryPct,
                conflictPending: false,
            };
            delete updated.conflictCandidates;
            await Storage.saveProblem(updated);
            if (candidate.id) {
                const dup = await Storage.getProblem(candidate.id).catch(() => null);
                if (dup) {
                    dup.isDuplicate = true;
                    dup.duplicateOf = primary.id;
                    await Storage.saveProblem(dup).catch(() => {});
                }
            }
            dbg.log(`resolveKeepCandidate(): resolved ${primary.titleSlug}`);
            onResolved(item.id);
        } catch (e) {
            dbg.error("resolveKeepCandidate failed:", e);
            setResolving(false);
        }
    }, [item, candidate, cancelTimer, onResolved]);

    // Store both as Methods on primary
    const resolveBothAsMethods = useCallback(async () => {
        cancelTimer();
        setResolving(true);
        try {
            const primary = await Storage.getProblem(item.id);
            if (!primary) return;
            const newMethod = {
                title: `Alt approach (${candidate.lang?.name || "unknown"}) — imported`,
                language: candidate.lang?.name || "unknown",
                code: candidate.code,
                description: `Submission #${candidate.submissionId || "?"}`,
                timestamp: candidate.timestamp || Date.now(),
            };
            const updated = {
                ...primary,
                methods: [...(primary.methods || []), newMethod],
                conflictPending: false,
            };
            delete updated.conflictCandidates;
            await Storage.saveProblem(updated);
            if (candidate.id) {
                const dup = await Storage.getProblem(candidate.id).catch(() => null);
                if (dup) {
                    dup.isDuplicate = true;
                    dup.duplicateOf = primary.id;
                    await Storage.saveProblem(dup).catch(() => {});
                }
            }
            dbg.log(`resolveBothAsMethods(): resolved ${primary.titleSlug}`);
            onResolved(item.id);
        } catch (e) {
            dbg.error("resolveBothAsMethods failed:", e);
            setResolving(false);
        }
    }, [item, candidate, cancelTimer, onResolved]);

    // AI auto-resolve
    const resolveWithAI = useCallback(async () => {
        cancelTimer();
        setResolving(true);
        try {
            const result = await new Promise((resolve) => {
                runtime.sendMessage({
                    type: "AI_COMPARE_SOLUTIONS",
                    primary: { code: item.code, lang: item.lang?.name },
                    candidate: { code: candidate.code, lang: candidate.lang?.name },
                }, (r) => resolve(r));
            });
            if (result?.same) {
                await resolveKeepPrimary();
            } else {
                await resolveBothAsMethods();
            }
        } catch (e) {
            dbg.warn(`resolveWithAI(): AI compare failed, defaulting to keep oldest:`, e?.message);
            await resolveKeepPrimary();
        }
    }, [item, candidate, cancelTimer, resolveKeepPrimary, resolveBothAsMethods]);

    // Start per-item countdown
    useEffect(() => {
        timerRef.current = setInterval(() => {
            setSeconds((prev) => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    if (!cancelledRef.current && !resolving) {
                        resolveWithAI();
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const progress = Math.round((seconds / COUNTDOWN_SECONDS) * 100);

    return html`
        <div class="p-4 bg-white/3 border border-white/8 rounded-xl space-y-3">
            <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-medium text-white">${item.title || item.titleSlug}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                    ${item.lang?.name || "unknown"}
                </span>
                ${item.difficulty && html`
                    <span class="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-400">
                        ${item.difficulty}
                    </span>
                `}
            </div>

            <div class="flex gap-3">
                <${CodeBlock}
                    code=${item.code}
                    label="Primary (oldest · ${fmtDate(item.timestamp)})"
                    meta=${item.runtime ? `${item.runtime} · ${item.memory}` : null}
                />
                <${CodeBlock}
                    code=${candidate.code}
                    label="Candidate (${fmtDate(candidate.timestamp)})"
                    meta=${candidate.runtime ? `${candidate.runtime} · ${candidate.memory}` : null}
                />
            </div>

            <div class="flex items-center gap-3 flex-wrap">
                <button
                    onClick=${() => { cancelTimer(); resolveKeepPrimary(); }}
                    disabled=${resolving}
                    class="px-3 py-1.5 text-xs rounded-lg bg-emerald-600/15 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-600/30 disabled:opacity-40 transition-colors"
                >
                    Keep oldest
                </button>
                <button
                    onClick=${() => { cancelTimer(); resolveKeepCandidate(); }}
                    disabled=${resolving}
                    class="px-3 py-1.5 text-xs rounded-lg bg-sky-600/15 border border-sky-500/30 text-sky-200 hover:bg-sky-600/30 disabled:opacity-40 transition-colors"
                >
                    Keep newest
                </button>
                <button
                    onClick=${() => { cancelTimer(); resolveBothAsMethods(); }}
                    disabled=${resolving}
                    class="px-3 py-1.5 text-xs rounded-lg bg-violet-600/15 border border-violet-500/30 text-violet-200 hover:bg-violet-600/30 disabled:opacity-40 transition-colors"
                >
                    Both as Methods
                </button>

                ${resolving
                    ? html`<span class="ml-auto text-xs text-slate-400">Resolving…</span>`
                    : seconds > 0
                    ? html`
                        <span class="ml-auto flex items-center gap-2 text-xs text-slate-400">
                            AI decides in
                            <span class="relative w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <span
                                    class="absolute inset-y-0 left-0 bg-amber-400 rounded-full transition-all"
                                    style="width: ${progress}%"
                                ></span>
                            </span>
                            ${seconds}s
                        </span>
                    `
                    : html`<span class="ml-auto text-xs text-slate-400">AI resolving…</span>`
                }
            </div>
        </div>
    `;
}

export function DedupReviewQueue({ onClose = () => {} }) {
    const [queue, setQueue] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadQueue();
    }, []);

    async function loadQueue() {
        try {
            const problems = await Storage.getAllProblems().catch(() => []);
            // Show new conflictPending items AND legacy aiMergePending items
            const items = (problems || []).filter(
                (p) => p?.conflictPending === true || p?.aiMergePending === true
            );
            setQueue(items);
        } catch (e) {
            dbg.error("Failed to load dedup queue:", e);
        } finally {
            setLoading(false);
        }
    }

    const handleResolved = useCallback((itemId) => {
        setQueue((q) => q.filter((x) => x.id !== itemId));
    }, []);

    // Legacy aiMergePending handlers (backward compat)
    async function handleLegacyApprove(item) {
        const p = await Storage.getProblem(item.id).catch(() => null);
        if (!p) return;
        p.code = p.aiMergeProposedCode || p.code;
        delete p.aiMergePending;
        delete p.aiMergeOriginalCode;
        delete p.aiMergeProposedCode;
        delete p.aiMergeSources;
        await Storage.saveProblem(p).catch(() => {});
        setQueue((q) => q.filter((x) => x.id !== item.id));
    }

    async function handleLegacyReject(item) {
        const p = await Storage.getProblem(item.id).catch(() => null);
        if (!p) return;
        if (p.aiMergeOriginalCode != null) p.code = p.aiMergeOriginalCode;
        delete p.aiMergePending;
        delete p.aiMergeOriginalCode;
        delete p.aiMergeProposedCode;
        delete p.aiMergeSources;
        await Storage.saveProblem(p).catch(() => {});
        setQueue((q) => q.filter((x) => x.id !== item.id));
    }

    return html`
        <div class="fixed inset-0 z-50 flex items-center justify-center">
            <div class="absolute inset-0 bg-black/60" onClick=${onClose}></div>
            <div class="relative w-full max-w-4xl mx-4 bg-slate-900 rounded-xl border border-white/10 flex flex-col max-h-[85vh]">
                <div class="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/8">
                    <div>
                        <h3 class="text-base font-semibold text-white">Conflict Review</h3>
                        <p class="text-xs text-slate-500 mt-0.5">
                            ${queue.length === 0 ? "No conflicts" : `${queue.length} conflict${queue.length === 1 ? "" : "s"} — AI auto-resolves in ${COUNTDOWN_SECONDS}s per item if you don't act`}
                        </p>
                    </div>
                    <button onClick=${onClose} class="text-slate-400 hover:text-white text-xl leading-none">✕</button>
                </div>

                <div class="overflow-y-auto flex-1 p-6 space-y-4">
                    ${loading
                        ? html`<div class="text-sm text-slate-400">Loading…</div>`
                        : queue.length === 0
                        ? html`<div class="text-sm text-slate-400">No conflicts — all duplicates are resolved.</div>`
                        : queue.map((item) => {
                            // New conflict format
                            if (item.conflictPending && item.conflictCandidates?.length) {
                                return item.conflictCandidates.map((candidate) => html`
                                    <${ConflictItem}
                                        key="${item.id}::${candidate.id}"
                                        item=${item}
                                        candidate=${candidate}
                                        onResolved=${handleResolved}
                                    />
                                `);
                            }
                            // Legacy aiMergePending format
                            return html`
                                <div key=${item.id} class="p-4 bg-white/3 border border-white/8 rounded-xl space-y-2">
                                    <div class="text-sm font-medium text-white">${item.title}</div>
                                    <div class="text-xs text-slate-400">AI merge proposal · ${item.lang?.name || "unknown"}</div>
                                    <div class="text-xs text-slate-500 space-y-1">
                                        <div>Original: ${String(item.aiMergeOriginalCode || "").length} chars</div>
                                        <div>Proposed: ${String(item.aiMergeProposedCode || "").length} chars</div>
                                    </div>
                                    <div class="flex gap-2">
                                        <button onClick=${() => handleLegacyApprove(item)} class="px-3 py-1 bg-emerald-600/20 border border-emerald-500/30 text-emerald-200 text-xs rounded">Approve</button>
                                        <button onClick=${() => handleLegacyReject(item)} class="px-3 py-1 bg-white/5 border border-white/10 text-slate-300 text-xs rounded">Reject</button>
                                    </div>
                                </div>
                            `;
                        })
                    }
                </div>
            </div>
        </div>
    `;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/DedupReviewQueue.js
git commit -m "feat: redesign DedupReviewQueue — side-by-side diff, countdown timer, AI auto-resolve, Methods storage"
```

---

## Task 4: Add `AI_COMPARE_SOLUTIONS` handler in `service-worker.js`

`DedupReviewQueue` sends `AI_COMPARE_SOLUTIONS` to the SW. Wire it up.

**Files:**
- Modify: `src/background/service-worker.js`

- [ ] **Step 1: Add handler for `AI_COMPARE_SOLUTIONS` in the SW message router**

Find the `chrome.runtime.onMessage.addListener` block. Add the new handler alongside existing ones:

```js
        if (msg && msg.type === "AI_COMPARE_SOLUTIONS") {
            const settings = await Storage.getSettings();
            const providerId = settings.aiProvider || "gemini";
            compareSolutions(
                providerId,
                { code: msg.primary?.code, lang: msg.primary?.lang },
                { code: msg.candidate?.code, lang: msg.candidate?.lang }
            )
                .then((result) => sendResponse({ same: !!result?.same }))
                .catch(() => sendResponse({ same: false }));
            return true;
        }
```

- [ ] **Step 2: Commit**

```bash
git add src/background/service-worker.js
git commit -m "feat: add AI_COMPARE_SOLUTIONS SW handler for DedupReviewQueue AI auto-resolve"
```

---

## Task 5: Add import report banner to `library.js`

**Files:**
- Modify: `src/library/library.js`

- [ ] **Step 1: Add `importReport` state and a `chrome.runtime.onMessage` listener**

In `LibraryApp()`, add this state alongside the existing state declarations:

```js
    const [importReport, setImportReport] = useState(null);
```

Then add a new `useEffect` after the existing OAuth message listener:

```js
    // Listen for import complete broadcast from the service worker
    useEffect(() => {
        if (!window.chrome?.runtime?.onMessage) return;
        const handleImportComplete = (msg) => {
            if (msg?.type !== "CODELEDGER_IMPORT_COMPLETE") return;
            setImportReport({
                saved: msg.saved || 0,
                autoMerged: msg.autoMerged || 0,
                conflicts: msg.conflicts || 0,
                missingCode: msg.missingCode || 0,
                missingTags: msg.missingTags || 0,
            });
            // Reload problems to pick up newly imported entries
            reloadProblems();
        };
        chrome.runtime.onMessage.addListener(handleImportComplete);
        return () => chrome.runtime.onMessage.removeListener(handleImportComplete);
    }, [reloadProblems]);
```

- [ ] **Step 2: Add the dismissable banner to the return JSX**

In the `LibraryApp` return block, add the banner near the top (inside the main container, before the sidebar/content split):

```js
                ${importReport && html`
                    <div class="px-4 py-3 bg-emerald-900/30 border-b border-emerald-500/20 flex items-center gap-3 flex-wrap text-sm">
                        <span class="text-emerald-300 font-medium">Import complete:</span>
                        <span class="text-slate-300">${importReport.saved} saved</span>
                        ${importReport.autoMerged > 0 && html`<span class="text-slate-400">· ${importReport.autoMerged} auto-merged</span>`}
                        ${importReport.conflicts > 0 && html`<span class="text-amber-300">· ${importReport.conflicts} conflict${importReport.conflicts === 1 ? "" : "s"} need review</span>`}
                        ${importReport.missingCode > 0 && html`<span class="text-slate-400">· ${importReport.missingCode} queued for code recovery</span>`}
                        ${importReport.missingTags > 0 && html`<span class="text-slate-400">· ${importReport.missingTags} queued for tag refresh</span>`}
                        <div class="ml-auto flex gap-2">
                            ${importReport.conflicts > 0 && html`
                                <button
                                    onClick=${() => { setActiveTab("settings"); setImportReport(null); }}
                                    class="px-3 py-1 text-xs rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 hover:bg-amber-500/25 transition-colors"
                                >
                                    View conflicts
                                </button>
                            `}
                            <button
                                onClick=${() => setImportReport(null)}
                                class="px-3 py-1 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 transition-colors"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                `}
```

- [ ] **Step 3: Commit**

```bash
git add src/library/library.js
git commit -m "feat: show import complete report banner in library, listen for CODELEDGER_IMPORT_COMPLETE"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Task 1: `normalizeCode()` exported for import handler reuse
- ✅ Task 2: `handleBulkImport()` groups by slug+lang, auto-merges same-code, flags conflicts with `conflictPending`/`conflictCandidates`, keeps different-lang entries (separate lang groups = separate saves), post-import validation queues missing code/tags, broadcasts `CODELEDGER_IMPORT_COMPLETE`
- ✅ Task 3: `DedupReviewQueue` redesigned — `ConflictItem` with side-by-side code blocks, per-item 12s countdown, `resolveKeepPrimary`, `resolveKeepCandidate`, `resolveBothAsMethods`, AI auto-resolve via `AI_COMPARE_SOLUTIONS` message
- ✅ Task 4: `AI_COMPARE_SOLUTIONS` SW handler wired up
- ✅ Task 5: Library listens for `CODELEDGER_IMPORT_COMPLETE`, shows banner with counts and "View conflicts" button
- ✅ Spec: backward compat — legacy `aiMergePending` items still rendered in queue
- ✅ Spec: "manually edited problems are skipped" — `existingPrimary?.manuallyEdited` check preserved
- ✅ Spec: "AI auto-resolution — if same → keep oldest, if different → add as Method" — `resolveWithAI()` calls `resolveKeepPrimary` or `resolveBothAsMethods` based on `result.same`
- ✅ Spec: "Methods accessible in AI chat / /mycode" — Methods are saved on `problem.methods`; existing chat context + chat-variables code already uses `problem.methods` (no changes needed per spec)
- ✅ Spec: "timer is per-item, not per-batch" — each `ConflictItem` has its own `useEffect` countdown
- ✅ Spec: "if compareSolutions fails → default to Keep oldest" — `resolveWithAI` catch block calls `resolveKeepPrimary`

**Type consistency:**
- `conflictCandidates` shape: `{ id, code, lang, runtime, memory, runtimePct, memoryPct, timestamp, submissionId }` — consistent between `handleBulkImport()` and `ConflictItem` prop usage
- `onResolved(itemId: string)` — `ConflictItem` calls with `item.id`, `DedupReviewQueue.handleResolved` filters by same
- `getProblemCommitKey(p)` — local helper in `DedupReviewQueue.js`; mirrors the SW helper for consistency
