# Changelog

All notable changes to CodeLedger are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.0] — 2026-05-17

### Added
- **Per-method AI review** — each code approach in a multi-method problem gets its own AI review. `MethodCard` renders per-method code + AI review inline in the Methods tab of ProblemModal. Clicking "Generate Review" triggers an immediate on-demand review for that method alone.
- **Per-method AI review queue** — `handleQueueAllAIReviews` now enqueues `${problemId}::method::${index}` entries for methods without a review. `processAIReviewQueue` detects the `::method::` pattern and processes them separately from problem-level reviews.
- **MAINTENANCE_COMMIT alarm** — every 10 minutes the service worker batches all pending AI reviews, metadata edits, and notes updates into a single atomic chore commit instead of one commit per edit.
- **Bulk import resilience** — individual-mode sync (onboarding commit-per-problem) persists its state to `chrome.storage.local`. If the browser closes mid-import, a `BULK_IMPORT_RESUME` alarm fires 45 seconds after the next browser open to automatically resume.
- **Onboarding progress bar** — the "done" step of GitHubOnboardingModal now shows a live progress bar (current/total) streamed from the SW via a `sync-keepalive` port. "Start Coding" is always enabled; the user can close the modal and sync continues in the background.
- **Refresh README Stats button** — new button in Settings → Git that commits a fresh `index.json` and triggers a full infra rebuild (README + index.html) from current local data, without needing a new problem commit. Useful after repo recreation or when stats are stale.
- **Config backup in every commit** — every problem commit and every resync now bundles `.codeledger/sync.json` (portable settings), `.codeledger/behaviour-bank.json`, and `.codeledger/roadmaps.json` into the same atomic tree, keeping user configuration always in sync with the latest solve. GitHub's Trees API deduplicates unchanged blobs so there is no overhead when nothing changed.
- **Collapsible hints in problem README** — `buildProblemMarkdown()` now emits a `<details><summary>Hint N</summary>` block for each hint stored on the problem. Hints are collapsed by default and work in both GitHub's file view and raw markdown.
- **Canonical path resolution at commit time** — `_handleResyncAllInner` pre-loads the canonical map and enriches each problem with its canonical ID before building file paths. Problems previously committed without canonical (e.g., via bulk importer) are now placed under `problems/{canonicalId}/{platform}/` on resync.
- **Two-phase resync with stable commit history** — `_handleResyncAllInner` now categorises problems into `newProblems` (never committed) and `maintenanceItems` (committed but layout/content drifted). Phase A commits only new problems (individual backdated or bulk). Phase B issues a single maintenance commit that atomically writes new-layout files and deletes stale old paths via `opts.deletes` → GitHub Trees API `sha: null`. Each problem appears in history exactly once for its initial solve; all subsequent path renames or content updates land in a single maintenance commit per sync cycle — no duplicate commits, no orphaned files.
- **`_committedPaths` tracking** — after every commit (regular solve, resync, maintenance) the problem's committed file paths are stored in IndexedDB. Future resyncs use these to compute the exact deletion set instead of guessing.
- **Remote file tree inference** — on resync, `GET /git/trees/{sha}?recursive=1` fetches the full repo tree once. `_inferCommittedPaths()` matches problem directory prefixes (including `::submissionId`-style old paths) to locate all blobs belonging to a problem, enabling correct deletions even for problems committed before `_committedPaths` tracking started.
- **Landing page library links** — `data-cl-open` added to the nav Library link and the CTA button; `landing.js` already rewrites these to the extension URL when the extension is detected.
- **Landing page platform icons** — LeetCode, GeeksForGeeks, and Codeforces chips now use actual favicons instead of emoji.

### Changed
- **Problem description file renamed to README.md** — `descriptionPath()` now returns `{dir}/README.md` instead of `{dir}/{platformId}.md`. GitHub automatically renders this when browsing the problem directory.
- **Infra bundled into the last meaningful commit** — `index.json`, `README.md`, `index.html`, and `.codeledger/*` are included in whichever commit is already happening (last problem commit in individual mode, the bulk commit, the maintenance commit). No separate trailing infra commit is issued when problem commits are made. An infra-only commit is still issued when all problems are already up-to-date.
- **GitHub Pages "src" link uses v3 path** — `repoFileUrl()` now reconstructs the correct v3 path (`problems/{canonicalId}/{platform}/README.md` or `problems/{platformId}/README.md`) instead of the old v1 slug-based format.
- **Language label normalization on GitHub Pages** — `pythondata` → "Python (Pandas)", `mysql` → "MySQL", `postgresql` → "PostgreSQL", etc., for cleaner display in the Recent Solves table and badges.
- **Recent Solves date includes year** — dates in a prior year now display as "Jan 5, 2024" instead of "Jan 5" to avoid ambiguity.
- **Removed AI "Progress Summary" from README** — the AI-generated narrative block is no longer included in the generated repository README; it produced inconsistent output and added noise.
- **Welcome page** — removed the Diagnostics & Migration tab and `DiagnosticsPanel` component. Path fixes and the two-phase resync make manual layout repair tools unnecessary.

### Fixed
- **`::submissionId` suffix in problem paths** — `platformId()` now strips the `::number` suffix that the LeetCode bulk importer appended (e.g. `lc-best-time-to-buy-and-sell-stock::1427680302` → `lc-best-time-to-buy-and-sell-stock`). Affected paths are corrected on the next resync via the maintenance commit.
- **Stale README stats (one-commit-lag)** — `buildInfraFiles` now accepts an `indexMetaOverride` parameter. Callers pass the freshly-built `index.json` data so README stats reflect the new problem count in the same commit rather than the previous state.
- **Stale paths not deleted on layout change** — old problem files (`{slug}.md`, `::submissionId` dirs, pre-canonical paths) are now explicitly deleted in the maintenance commit via `opts.deletes`, eliminating orphaned files that accumulated across layout versions.
- **GitHub App `read:org` 401** — `/user/orgs` returns 401 for GitHub App tokens that lack `read:org` scope. The onboarding modal now silently treats this as an empty org list instead of clearing the valid auth token.
- **Avatar CORS failure** — removed the `Authorization` header from avatar CDN fetches in `library.js`; `avatars.githubusercontent.com` is a public CDN that blocks auth headers via CORS.
- **LaTeX rendering** — `\times`, `\leq`, `\geq`, `\neq`, `\rightarrow`, Greek letters, and other LaTeX symbols are now substituted to Unicode in AI review output via `substituteLatex()` in `katex-stub.js`. Applied in both `renderMath()` and inline `parseMarkdown()`.
- **ProblemModal null notes crash** — the Notes tab `show` guard now uses `p?.notes` safe navigation, preventing a crash when `p` is null during modal initialisation.
- **AI review batch size** — background queue processes 2 items per alarm tick (was 10) to avoid rate-limiting AI providers during backfill.
- **On-demand AI review no longer commits immediately** — `handleRegenerateAIReview` marks the problem as pending for the MAINTENANCE_COMMIT batch instead of making an individual commit per review.

## [1.2.0] — 2026-05-13

### Added
- **AI Review Queue ΓÇö Queue Missing button** ΓÇö dedicated button that queues only problems with no AI review yet, separate from the full re-queue action.
- **AI Review Queue ΓÇö Requeue All button** ΓÇö queues every problem for re-review (including those already reviewed); asks for confirmation before submitting.
- **AI Review Queue ΓÇö Cancel Queue button** ΓÇö gracefully cancels all pending reviews: any review currently processing finishes naturally, then the rest are removed. Button appears only when there are pending or processing items.
- **AI Review Queue ΓÇö built-in dedup** ΓÇö `enqueueReview()` now checks for an existing pending/processing entry before adding; duplicate submissions are silently skipped and reported as `skipped` in the response.
- **GitHub Pages heatmap full width** ΓÇö activity heatmap now fills the full card width. Cell size is computed from available width via a `--hm-cell` CSS variable set by a `resizeHeatmap()` function (minimum 8 px); re-runs on every window resize.
- **User repo README ΓÇö social banner, logo & badges** ΓÇö generated `README.md` now opens with the CodeLedger social preview image, the extension logo, and four flat-square shields (total / easy / medium / hard counts) with difficulty colours, all using raw GitHub image links.
- **Auto-save settings to repo** ΓÇö every settings change in the Library UI now calls `markSettingsPendingCommit()` so the next problem commit automatically includes `.codeledger/config.json` with the updated portable settings. Manual "Force Commit Settings" and "Backup Config" buttons continue to work as before.
- **AI Behaviour Bank** ΓÇö personal memory layer for the AI assistant: Knowledge Bank (insights), user-defined Skills (trigger on command/difficulty/after-solve), and a learning Roadmap. All context is automatically injected into AI chat conversations. Accessible as a full Library tab.
- **MCP Tool-calling** ΓÇö AI assistant can now invoke tools mid-conversation: save/recall Knowledge Bank insights, open problems, set roadmap goals, list and delete chats. Tools are configurable per-provider in Settings ΓåÆ AI.
- **Cross-device AI chat sync** ΓÇö every AI conversation is committed as `chats/YYYY-MM-DD-HH-mm-ss-{id}.md` with YAML frontmatter. Bidirectional sync via GitHub on every startup; deleted chats are tombstoned and removed from remote.
- **Rolling GitHub backups** ΓÇö automatically snapshot local problems + settings to `backups/YYYY-MM-DD-HH-mm-ss.json` in the repo. Configurable interval (default every 20 commits) and retention count (default 10). Full restore from the Library Settings ΓåÆ Backups panel.
- **Deduplication engine** ΓÇö `duplicate-detector.js` finds same-slug same-language duplicates; `ai-deduplication.js` generates AI merge proposals stored on the problem. A dedicated `DedupReviewQueue` modal lets users approve/reject proposed merges.
- **`MissingMetadataModal`** ΓÇö review queue for problems missing tags or difficulty; supports individual refresh, per-problem ignore, and bulk ignore/unignore with persistent state.
- **Setup completion notification** ΓÇö Library sidebar and main content area show a dismissable amber banner if GitHub is not connected or no repo is linked, with a direct link to the Welcome page.
- **GitHub handler refactor** ΓÇö `commit-builder.js` (tree items + commit payload), `api-client.js` (REST wrappers), and `infra-builder.js` (README/index.html generation) extracted from the monolithic `github/index.js`.
- **Landing page v1.2** ΓÇö dynamic "Open Library" links (extension URL when installed, web URL otherwise); "What's new in v1.2" features section; new FAQ entries for Behaviour Bank, MCP tools, sync, and migration.
- **Prettier formatter** ΓÇö `.prettierrc` config; `npm run format` script formats all `src/**/*.js` and `worker/public/assets/**/*.js` files.
- **New repository path layout v2** ΓÇö `problems/{slug}/{slug}.{ext}` (no platform subdir without canonical); `problems/{slug}/{platform}/{slug}.{ext}` when canonical is assigned. Solution files named after slug (`two-sum.py`) instead of verbose language name (`Python3.py`).
- **Commit taxonomy** ΓÇö structured commit messages: `[solved]`, `[update]`, `[comprehensive-update]`, `[maintenance]`, `[chore]`, `[init]` via `src/core/commit-messages.js`.
- **Bulk progress-page import ΓåÆ GitHub** ΓÇö imported problems now build proper v2 paths and READMEs; a "Commit N to GitHub" button appears after import that fires a `[comprehensive-update]` commit.
- **Migration manager** ΓÇö `MIGRATE_REPO` message for layout v1ΓåÆv2 migration, `RESET_REPO` for full repo rebuild (self-healing). Finds old `topics/` paths and replaces them atomically via GitHub Trees API.
- **Migration UI in Settings ΓåÆ GitHub** ΓÇö "Check layout version", "Migrate to v2 layout", and "Full rebuild" buttons.
- **Extension update detection on startup** ΓÇö compares `manifest.version` against stored version; sets `extensionUpdated` flag so UI can prompt user to run migration.
- **Slash-command autocomplete** in floating AI assistant ΓÇö typing `/` shows a dropdown of available commands; clicking inserts the command.
- **`index.html` and root `README.md` always regenerated** on every GitHub commit (no longer "only if missing"). GitHub Trees API deduplicates unchanged blobs automatically.
- **`index.json` layout stats** ΓÇö now includes `layoutVersion`, `byPlatform`, and `byLang` breakdown fields.
- **Root `README.md`** generated in user repos linking to their GitHub Pages stats dashboard (supports custom domains).
- **Under Construction badge** in settings section renderer ΓÇö sections with `underConstruction: true` show an amber badge and are visually marked.
- **Missing Metadata review modal** ΓÇö surfaces problems missing tags/difficulty and queues metadata refresh from the background.
- **Dedup review queue** ΓÇö same-language duplicate candidates now appear in a dedicated review modal with approve/reject actions.
- **AI merge proposals** ΓÇö same-language duplicates can generate an AI merge proposal that is stored on the problem and reviewed before applying.
- **Mirror repository settings** ΓÇö a dedicated settings panel manages additional git mirrors alongside the primary repository.
- **Cross-device auto-sync** ΓÇö periodic background sync is scheduled with `chrome.alarms` so remote changes are picked up automatically.
- **LeetCode: non-accepted submissions could auto-sync** ΓÇö submission detail pages now check `statusCode === 10` (Accepted) before auto-committing; WA / TLE / Runtime Error submissions are silently skipped. Manual "Sync to Ledger" still works on any submission.
- **LeetCode: sync button appearance delay** ΓÇö replaced the 1200 ms `setTimeout` retry with a `MutationObserver` that injects the button the instant the action button row enters the DOM; button now appears as soon as the page renders.
- **LeetCode: Monaco code extraction** ΓÇö added `_getCodeFromMonaco()` fallback (`window.monaco.editor.getModels()[0].getValue()`) for cases where GraphQL returns an empty code field.
- **LeetCode: copy button only copied visible lines** ΓÇö `qol.js` copy button now uses the Monaco model API as primary source, getting the full file regardless of scroll position; DOM `.view-line` scraping kept as fallback for edge cases.
- **LeetCode: copy button produced dirty code** ΓÇö both the copy button and `_getCodeFromMonaco()` now strip whitespace-visualization characters Monaco injects (`U+00B7` middle dot, `U+200C` ZWNJ, `U+00A0` NBSP) so clipboard output is clean, runnable code.
- **Graph: scroll zoom snaps to min/max** ΓÇö replaced binary 0.9/1.1 zoom step with `Math.exp(ΓêÆdeltaY ├ù 0.001)`, making trackpad pinch-to-zoom smooth and proportional while keeping single mouse-wheel notch at Γëê 9.5 % per step.
- **Graph: zoom buttons** ΓÇö `+` and `ΓêÆ` buttons in the toolbar for click-to-zoom (centered on canvas), grouped with the existing Fit view (Γûú) button.

### Fixed
- **`import()` banned in MV3 service workers** ΓÇö all dynamic `await import(...)` calls inside `service-worker.js` removed and replaced with top-level static imports. Affected modules: `ai-review-queue.js`, `ai-deduplication.js`, `backup-manager.js`, `migration-manager.js`, `api-client.js`, and `path-builder.js`. Fixes "Queue AI Reviews" and "Backup" features that were silently failing in production.
- **AI Review Queue ΓÇö IndexedDB version conflict** ΓÇö `ai-review-queue.js` was opening a `"CodeLedger"` database at version 1 while the browser had an existing version 2, causing a hard error on every queue operation. Database renamed to `"codeledger-queue"` to open fresh at version 1.
- **`git.apiFetch` not a function in PanelGit.js** ΓÇö two call sites replaced with a direct call to `ghGetCurrentUser(token)` from the statically imported `api-client.js`. Fixed the manual import preview and individual-sync path when `github_owner` was unset.
- **422 non-fast-forward on sequential commits** ΓÇö `GitHubHandler.commit()` now retries up to 3 times (500 ms, then 1 000 ms back-off), fetching a fresh ref and rebuilding the tree on each retry.
- **Stale `index.json` showing 0 problems after full sync** ΓÇö a repair commit is now issued when the remote index contains an empty `problems: []` but local problems are already committed.
- **Repo name forced to lowercase** ΓÇö `GitHubOnboardingModal.js` `sanitize()` no longer calls `.toLowerCase()`; the allowed-character regex updated to `[^a-zA-Z0-9._-]` to match GitHub's actual rules.
- **`/errors` command in AI assistant always showed "no errors"** ΓÇö raw error string from `readTestFailures()` now passed directly to `expandChatVariables`, bypassing `normalizeList()` which was converting the string to `[]`.
- **Manual sync blocked by submission dedup** ΓÇö `forceCommit: isManual` now bypasses the `alreadyCommitted` session-storage dedup check so the Sync button always commits.
- **AI floating panel overlapping LeetCode's submit bar** ΓÇö moved from `bottom: 70px` to `bottom: 110px`.
- **Bulk-imported problems had no READMEs and used old hardcoded `topics/` paths** ΓÇö now uses `solutionPath()` + `readmePath()` from path-builder and builds a full README per problem.
- **GitHub avatar showed a placeholder instead of the real profile image** ΓÇö avatar is now hydrated from saved settings on startup and stored as a data URL when OAuth can fetch it.
- **Console logging was noisy when debug was disabled** ΓÇö `console.log` / `console.error` are now gated behind the debug flag and re-enabled cleanly after OAuth.
- **`index.json` could throw on malformed remote content** ΓÇö remote sync now guards JSON parsing and falls back to an empty remote index.
- **`providerId` could be undefined in the AI review loop** ΓÇö the provider id is now scoped before use and falls back safely.

### Changed
- **AI Review Queue stats display** ΓÇö replaced verbose paragraph list with a compact inline pill row that only shows non-zero counts; processing count highlighted in cyan.
- **`handleQueueAllAIReviews` now accepts a `missingOnly` flag** ΓÇö single function drives both "Queue Missing" and "Requeue All" to avoid duplicating logic.
- **`Shift+Enter` inserts newline** in AI assistant input (previously single-line `<input>` ΓÇö replaced with auto-growing `<textarea>`).
- **Solution files named after problem slug** (`two-sum.py`) ΓÇö `solutionPath()` no longer uses the verbose language name.
- **`buildIndexJson`** includes layout version and per-platform / per-language stats.
- **LeetCode import now preserves every accepted submission** ΓÇö imports keep multiple languages and multiple accepted submissions instead of collapsing them too early.
- **Atomic chore commits include notes and AI chats** ΓÇö maintenance sync commits now bundle `notes.md` and `ai-chats/*.json` alongside problem files.
- **AI review tags are ordered by importance** ΓÇö tag presentation is now priority-based instead of alphabetical.

### Removed
- Old `topics/{topic}/{slug}/` path pattern ΓÇö migrated by `MIGRATE_REPO`.

---

## [1.1.0] ΓÇö 2026-05-07

### Added
- **Syntax highlighting** in the Code tab of ProblemModal ΓÇö regex-based tokenizer for Python, JavaScript, TypeScript, Java, C++, C, Go, Rust, Kotlin, Swift; keywords in blue, strings in green, comments in gray, numbers in amber, types in purple.
- **`src/lib/syntax-highlight.js`** ΓÇö new module with `highlightCode(code, lang)` and `cleanCode(code)` helpers; no external dependencies, works inside the extension's strict CSP.
- **Mermaid diagram rendering** via [mermaid.ink](https://mermaid.ink) ΓÇö renders diagrams as images without loading external scripts (previously blocked by extension CSP). Includes a "View in Mermaid Live" fallback link.
- **Vertical-first Mermaid layout** ΓÇö flowcharts and graph diagrams without an explicit direction, or with LR/RL, are automatically rewritten to TD (top-down) for more readable AI-generated diagrams.
- **Extension handshake v2** ΓÇö `presence-marker.js` now dispatches a `CODELEDGER_HANDSHAKE` CustomEvent (in addition to the existing DOM marker) carrying the browser-specific `chrome-extension://` / `moz-extension://` library URL. Works on Chrome, Edge, Brave, and Firefox.
- **Session-persistent install detection** ΓÇö `landing.js` caches the handshake in `sessionStorage` to avoid the "flash of install link" on page refresh.
- **Firefox + all Chromium support** for the handshake: `presence-marker.js` uses `browser.*` when available, falls back to `chrome.*`.
- **`AICommandPalette` scroll** ΓÇö pressing ArrowDown/ArrowUp now scrolls the active item into view inside the dropdown list.
- **Landing page improvements**
  - Browser badges (Chrome/Brave/Edge, Firefox, GitHub Releases) dynamically linked from `config.json`
  - FAQ section (8 questions covering privacy, AI, platforms, BYOK)
  - Stats strip (platforms, AI providers, servers that see your code = 0)
  - JSON-LD structured data (`SoftwareApplication`) for better search indexing
  - Extended Open Graph and Twitter Card metadata
  - Extension-detected indicator ("Extension installed and ready") badge
  - Data attributes (`data-cl-show-when-installed`, `data-cl-hide-when-installed`) for dynamic UI based on install state
  - OpenRouter added to BYOK pills

### Fixed
- **Copy issue with whitespace visualization characters** ΓÇö Monaco editor (LeetCode) injects U+00B7 (middle dot) and U+200C (zero-width non-joiner) as visible space indicators. `cleanCode()` strips these before display and before writing to clipboard, so copied code is clean.
- **Mermaid showed only raw code** ΓÇö CDN script injection was blocked by extension CSP; replaced with `mermaid.ink` image approach; code-block fallback now also provides an external link.
- **Double-escaping in markdown tables** ΓÇö fixed in previous sprint; tables now render properly.
- **KaTeX CSP violation** ΓÇö fixed in previous sprint; math blocks render as styled code spans.

### Changed
- Extension version bumped to **1.1.0** in `manifest.json` and `package.json`.
- `mermaid-stub.js` ΓÇö completely rewritten; no longer attempts CDN script injection.
- `presence-marker.js` ΓÇö now dispatches both DOM marker and CustomEvent for maximum reliability.
- `landing.js` ΓÇö extended with sessionStorage caching and CustomEvent listener.
- `index.html` ΓÇö substantially expanded with FAQ, stats, browser badges, and SEO improvements.

---

## [1.0.0] ΓÇö 2026-04 (Initial Release)

### Added
- Core extension: LeetCode, GeeksForGeeks, and Codeforces platform handlers
- GitHub integration via OAuth + Trees API (atomic multi-file commits)
- AI code review (Gemini, OpenAI, Claude, DeepSeek, Ollama, OpenRouter)
- Problem library (extension sidebar + standalone web app)
- Analytics dashboard: heatmap, topic radar, difficulty donut, solve velocity, drilldown
- Knowledge graph: force-directed, topic-linked problem network
- Floating AI panel and timer on problem pages
- AI chat with `/mycode`, `/problem`, `/errors` slash commands and `@platform` mentions
- Multi-language AI input with command palette dropdown
- Behavior bank for passive interaction tracking (opt-out)
- Settings UI: General, AI, Git, Platforms, Backups, Advanced panels
- Backup system: manual JSON export, scheduled snapshots, on-solve snapshots
- Service worker: solve event pipeline, sync engine, alarm manager
- Cross-device sync via GitHub `index.json`
- First-run defaults: all AI providers disabled until user adds keys
- Full Chrome + Firefox support via `browser-compat.js` shim

---

<!-- Add new releases above this line -->
[Unreleased]: https://github.com/Life-Experimentalist/Code-Ledger/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/Life-Experimentalist/Code-Ledger/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Life-Experimentalist/Code-Ledger/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Life-Experimentalist/Code-Ledger/releases/tag/v1.0.0
