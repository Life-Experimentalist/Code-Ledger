# CodeLedger — Progress & Inbox

## How to use this file

- **Inbox:** Drop plain-text notes below. Claude will convert them to proper entries.
- **Completed sprints** list what shipped so contributors can orient quickly.
- Each sprint entry links to the relevant commit range or PR if available.

---

## Sprint: Comprehensive Overhaul (2026-05-05)

Goal: contributor-friendly codebase with robust MVP (LeetCode solve → GitHub commit).

### Shipped

| Area                | Change                                                                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo structure      | `src/core/path-builder.js` — single source of truth for all GitHub file paths; canonical problems use `{root}/{canonicalId}/{platform}/`; others use `{root}/{slug}/`                               |
| Repo structure      | `settings.problems_dir` field (default `"problems"`) via GitHub handler settings schema                                                                                                             |
| Rename pipeline     | `Storage.markRenameNeeded / getPendingRenames / clearPendingRenames`; `performPendingRenames()` in service-worker emits a maintenance commit that deletes old paths and creates new ones atomically |
| Modal tab registry  | `src/core/modal-tab-registry.js` — platform handlers register their own tabs; `ProblemModal` is a pure renderer                                                                                     |
| LeetCode modal tabs | `src/handlers/platforms/leetcode/modal-tabs.js` — Overview, Code, AI Review, Similar, Ask AI                                                                                                        |
| Global modal tabs   | Notes + Edit registered as `"*"` tabs; `EditTab` sub-component owns all edit/delete state                                                                                                           |
| Graph               | Removed topic-topic ring backbone edges from `knowledge-graph.js`                                                                                                                                   |
| Graph               | `getVisibleGraphData` edge-walk scoped to `topic-problem` only — prevents filter bleed                                                                                                              |
| Graph               | Single-topic orbit attraction in `simulationStep` (problems with 1 topic orbit at 80px)                                                                                                             |
| Graph               | "Clear filters" button — appears when any filter is non-default                                                                                                                                     |
| Platform timer      | `src/core/platform-timer.js` — `PlatformTimer` class; base handler holds `_timer`; GFG uses `startFloating`; LeetCode overrides `getNativeElapsed`                                                  |
| Code cleanup        | Removed `_formatHints` (always returned `""`), legacy `checkSubmission`/`fetchGraphQL`/`getProblemMetadata` shims, `cl-row-sync` DOM cleanup guard                                                  |
| Docs                | `FEATURE_REQUESTS.md` — moved completed items out of In Progress / Pending; removed "done" bug                                                                                                      |
| Docs                | This file created                                                                                                                                                                                   |
| Canonical endpoint  | `CONSTANTS.URLS.CANONICAL_MAP` → `codeledger.vkrishna04.me/api/data/canonical-map.json` primary; `CANONICAL_MAP_RAW` GitHub raw as fallback; `canonical-mapper.js` iterates both URLs              |
| Settings overhaul   | CF/GFG/LeetCode handlers all expose `getSettingsSchema()`; `telemetry.js` key mismatch fixed (`telemetryOptIn`); notifications gated on `settings.notifications`                                   |
| Analytics drilldown | Difficulty donut, language pie, platform cards, topic cards all clickable → scrollable problem list overlay; clicking problem opens `ProblemModal`; nav buttons to Solutions + Graph on all views  |
| Multi-lang modal    | `siblings` array in `ProblemModal` — same `titleSlug` (different language) or same `canonical.id` (cross-platform); "Also solved as" strip renders per-sibling pill with favicon + lang name       |

---

## Sprint: Graph & UI (prior, 2026-04-xx)

Shipped: graph platform color rings, multi-topic edges, node glow cascade, layered/circular/force layouts, hover tooltip, selected panel, legend, LOD system, drag modes, topic comparison, group drag.

---

## Sprint: AI & Chat (prior)

Shipped: floating AI panel, multi-line chat input, variable expansion (`/mycode` etc.), markdown rendering with syntax highlight, AI chat storage (IndexedDB), AIChatsView, temp-chat save confirmation.

---

## Sprint: GitHub Flow (prior)

Shipped: Trees API atomic init, OAuth-only token path, onboarding welcome page, repo validation, post-auth auto-setup, connected+ready indicator, GitHub Pages auto-setup, retroactive commits.
