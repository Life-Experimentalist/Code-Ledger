# Changelog

All notable changes to CodeLedger are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.4.7] — 2026-06-26

### Added

- **Compliance: Built-in Demo AI Assistant & Reviews** — If no AI API keys are configured (such as during Chrome Web Store review), the extension falls back to a built-in Demo model. This allows reviewers and new users to test AI reviews and chat functionality immediately without third-party setup.

### Fixed

- **CWS: Create Repository flow unblocked** — "Set up repository" button silently did nothing when no GitHub token was saved (user hadn't authenticated yet). It now triggers the OAuth popup immediately, so the full Create Repository flow is accessible without needing to go through Settings first. Additionally, the "Create Repository" button inside the onboarding modal was disabled while checking name availability; it now remains active (the 422 from GitHub handles the taken-name case) so reviewers and users are never stuck waiting on a background API check.
- **GeeksForGeeks: Actual Submission Time Import** — Fixed a bug where GFG on-demand code recovery would keep the profile-import timestamp (i.e. the import date) instead of updating it to the actual submission time scraped from GFG's submissions page. Problem timestamp now correctly matches the latest solve.
- **GeeksForGeeks: Backdated Git Commits** — Recovered GFG problems are now committed individually in the background with the correct backdated submission time as the commit time, matching LeetCode parity.
- **Library: Updated GeeksForGeeks Links** — Solutions panel page now links GFG Practice directly to `https://www.geeksforgeeks.org/explore` instead of the old URL. Added a direct link to `https://www.geeksforgeeks.org/profile` on the GFG card.
- **GeeksForGeeks: Secure Profile Import** — The "Import All Solves" button is now only injected if the profile page contains the "Edit Profile" button, preventing users from importing solves from profiles they do not own.
- **Compliance: Privacy Policy Clarified** — Rewrote `PRIVACY.md` to fully declare data collection, handling, storage, and sharing details to fully satisfy Chrome Web Store User Data Privacy requirements.
- **Build: Release zips no longer duplicated in releases root** — `packager.js`, `package-chrome.js`, and `package-firefox.js` were writing zips to both `releases/` (root) and `releases/{version}/`. Zips now go only to the versioned subdirectory. Existing stray `codeledger-chromium-v1.4.7.zip` and `codeledger-firefox-v1.4.7.zip` from the root have been removed.

## [1.4.6] — 2026-06-18

### Fixed

- **GitHub OAuth broken by COOP** — GitHub sets `Cross-Origin-Opener-Policy: same-origin`, which clears `window.opener` in the OAuth popup. The callback page now embeds auth data in a DOM element (`#codeledger-auth-result`); the `presence-marker.js` content script reads it at `document_end` and relays it to the background service worker via `CODELEDGER_AUTH_RELAY`, which then broadcasts `CODELEDGER_AUTH` to all open library tabs. A `tabs.onUpdated` background pull with a 15-attempt retry loop keeps the Chrome service worker alive for the full ~7.5 s window. This fixes both "cannot login" (v1.4.5) and "cannot create repo after login" (v1.4.4).
- **Conflict modal reappears after resolution** — Root cause fixed: `applyImport()` now stamps each resolved problem with `_conflictResolvedAt: Date.now()`. On the next import pass, `importFromRepo()` skips re-flagging any problem whose `_conflictResolvedAt > remote.timestamp`, preventing the modal from reappearing while the GitHub push is still pending. Additionally, `onCancel` previously discarded all partial resolutions (when the user closed the modal mid-way); it now immediately applies whatever the user already resolved via `applyImport()` and fires a best-effort RESYNC_ALL.
- **Conflict modal: partial resolutions lost on close** — The `_resolvedSoFar` list passed to `onCancel` was silently ignored. Closing the modal mid-session now saves all choices already made and updates `_pendingConflicts` to the remaining unresolved count.
- **Conflict push failure was silent** — A failed `RESYNC_ALL` after conflict resolution previously set `importMsg` (invisible once the modal closed) instead of calling `flash()`. The error now appears as a visible toast with an explanation that a retry will happen on the next solve.
- **Library not updated after LeetCode solve** — Service worker now broadcasts `PROBLEM_SAVED` to all open library tabs immediately after `Storage.saveProblem()`. Library listens and calls `reloadProblems()` so the new problem appears without a manual refresh.
- **AMO: Telemetry setting key mismatch** — `PanelAdvanced.js` was saving the toggle under key `telemetryEnabled` while `telemetry.js` reads `telemetryOptIn`, so the UI toggle had no effect. Key unified to `telemetryOptIn` with `defaultOn=false` (opt-in, off by default) to match `telemetry.js` runtime behaviour and AMO data-collection policy.
- **AMO: Third-party vendor files lacked source attribution** — `vendor/preact.js` and `vendor/htm.js` were copied from the `esm.sh` CDN (not the official npm release), which AMO reviewers flag as an unverifiable source. Both files now contain unmodified official npm package content (`preact@10.29.1`, `htm@3.1.1`) with version headers. `vendor/preact-bundle.js` is regenerated from official npm sources via esbuild (see `dev/generate-preact-vendor.js`). `vendor/chart-bundle.js` also gained a version/source header.
- **LeetCode auto-save not working** — `onSubmitFired` used a single hardcoded `[data-e2e-locator="submission-result"]` selector that silently fails when LeetCode changes its UI. The selector list is now an array of fallbacks (`data-e2e-locator`, `data-testid*=result`, `data-testid*=verdict`, `role=status`, `class*=result-state`). Additionally, a 1 500 ms delay is now inserted between detecting the "Accepted" banner and calling the GraphQL API — LeetCode's WebSocket pushes the DOM update ~1.5 s before the backend marks the submission as Accepted in the API, causing the dedup check to fetch the previous submission (already in DB → skip). The delay ensures the API returns the correct new submission ID.
- **Conflict modal: "Keep both" caused file-path collision on push** — `buildResolved` created a second problem record with a mutated `"-alt-"` ID for the remote copy. Because both records share the same `titleSlug`, RESYNC_ALL tried to write two entries with the same git file path, corrupting the commit. "Keep both" now saves the remote's code as a new method entry on the local problem (title: "Remote approach (date)", preserving the remote code, AI review, and runtime stats) instead of creating a duplicate problem record.
- **Methods tab shown twice in problem modal** — The global `modalTabRegistry` registration included "methods" and "notes" tabs, while the modal's `tabs` array also added them manually, producing two identical tabs. The registry registrations for "methods" and "notes" have been removed; the manually-built tabs and their custom JSX renderers are the sole source of truth.
- **Release zips included `desktop.ini` files** — Windows generates `desktop.ini` in every folder. All three packager methods (Chromium, Firefox, source) now filter files matching `desktop.ini` (case-insensitive) before adding to the zip.

### Added

- **Auto-import from existing repo** — When a user links a repository that already contains CodeLedger data (`index.json`) and their local library is empty, the Git settings panel automatically triggers an import pass, bringing in all existing solutions without requiring a manual click.
- **Welcome page: direct GitHub OAuth popup** — Clicking "Connect GitHub →" on the welcome page now opens the GitHub OAuth popup directly (same flow as the Settings panel). If the browser blocks the popup, it falls back to opening the settings tab. The welcome page also listens on `chrome.storage.onChanged` so the "Connect GitHub" step auto-checks as soon as the token is saved by the relay.
- **`npm run vendor:preact`** — New script (`dev/generate-preact-vendor.js`) to regenerate all three preact-family vendor files from official npm packages using esbuild. Required to regenerate these files after npm package updates.
- **Conflict modal: rich field-level diff** — Version cards now show a side-by-side metadata diff table: actual tag pills (unique-to-one-side tags highlighted in cyan), difficulty with colour coding, language, AI review presence, runtime/memory stats. For "different approach" conflicts the code diff panel additionally shows a runtime/memory bar above each pane. Tag counts have been replaced with the actual tag names.

### Changed

- **Welcome page on first install** — Extension now opens `welcome.html` automatically on first install (`chrome.runtime.onInstalled` with `reason === "install"`). The welcome page has a full guided checklist: GitHub login → repo setup → AI provider (Gemini recommended with link to Google AI Studio for free keys) → import past LeetCode solutions (skippable) → solve first problem (skippable). Optional steps can be skipped and are persisted locally.
- **Firefox manifest `data_collection_permissions`** — `optional` array updated from `[]` to `["interaction"]` to accurately declare the opt-in anonymous solve-count telemetry to AMO reviewers.
- **Methods tab: expandable code view + back navigation** — Method cards in the methods tab are now collapsible: clicking a card expands it to show the method's syntax-highlighted code and a truncated AI review inline. A "← Problem Code" button at the top of the tab navigates back to the first code tab.

---

## [1.4.5] — 2026-06-15

### Fixed

- **Telemetry: opt-in default was reversed** — `telemetryOptIn` defaulted to `true` in both `src/core/telemetry.js` (fallback) and `src/core/handler-registry.js` (settings schema), meaning anonymous usage data was sent to `counter.vkrishna04.me` without explicit user consent. Both now default to `false`. No data is sent until the user enables "Anonymous Usage Stats" in Settings → General.
- **Telemetry: install-event fired before settings loaded** — `Telemetry.track("install")` in `service-worker.js` ran inside `chrome.runtime.onInstalled` before user settings could be read, bypassing the opt-in check entirely. The call has been removed; install counts are obtained from store dashboards instead.
- **Store listings: false privacy claims** — The AMO and CWS privacy descriptions stated "no data is sent to our servers" while telemetry was active by default. All store listing docs (`firefox-amo.md`, `chrome.md`, `edge.md`) now accurately disclose the opt-in telemetry endpoint, payload, and default-off behaviour.
- **Firefox manifest: `strict_min_version` too low** — `browser_specific_settings.gecko.strict_min_version` was `112.0` but `data_collection_permissions` requires Firefox 140 (desktop) and 142 (Android). Bumped to `142.0`.

### Changed

- **Telemetry setting description** — Settings UI label updated to clarify "Off by default" and that only `{ platform, version }` is sent — no code, tokens, or identifiers.
- **Landing page FAQ** — "Does it upload my code?" answer updated to accurately mention the opt-in telemetry counter.
- **Store links** — `config.json`, `constants.js`, and `README.md` updated with the live Chrome Web Store URL (`chromewebstore.google.com/detail/codeledger/dpalidbhndcbppmjgmbloffehbhfchmb`) and AMO URL (`addons.mozilla.org/en-US/firefox/addon/code-ledger/`).
- **Landing page version badge** — Hero badge updated to `v1.4.5`.

---

## [1.4.4] — 2026-06-11 (resubmission)

### Fixed

- **CWS rejection: remotely-hosted code** — Chrome Web Store rejected v1.4.4 for referencing `cdn.jsdelivr.net/chart.js` inside `handlers/git/github/pages-template.js`. Chart.js 4.5.1 UMD minified source is now bundled in `src/vendor/chart-source.js` and inlined directly into the generated GitHub Pages dashboard HTML. No remote requests are made by the extension itself.

### Changed

- **Build: chart-source auto-regeneration** — `dev/build.js` now detects when `src/vendor/chart-source.js` is missing or version-mismatched against `node_modules/chart.js` and regenerates it automatically. Upgrading `chart.js` in `package.json` + `npm install` + `npm run build` is sufficient; no manual vendor step required.

### Removed

- **Dead vendor stubs** — `src/vendor/chart.js` and `src/vendor/preact-hooks.js` were broken `// Module not found` stubs from failed esm.sh downloads; nothing imported them.

---

## [1.4.4] — 2026-06-06

### Fixed

- **Manifest: `web_accessible_resources` missing UI modules** — `ui/floating-ai.js`, `ui/floating-timer.js`, and `ui/components/AIMarkdownRenderer.js` are loaded from web page context (platform handler → content script dynamic import chain) and must be declared web-accessible. They were incorrectly omitted in the v1.4.3 permission tightening pass, which would have broken the floating AI panel and timer overlay on all platforms.
- **CI: release workflow read deleted `src/manifest.json`** — Manifest version validation step now reads `src/manifest-chromium.json` (the split-manifest source introduced in v1.4.3).

### Changed

- **Manifest permissions tightened** — Removed unused `scripting`, `webRequest`, and `tabs` permissions (none are called in the codebase). Removed `https://bitbucket.org/api/*` host permission (Bitbucket handler is `UNDER_CONSTRUCTION`). `web_accessible_resources` matches narrowed from `<all_urls>` to only the three DSA platform domains plus the landing page.
- **Landing page** — Hero badge and "What's new" section updated to v1.4.3; footer now links to `/privacy`, `/terms`, and `/support`. Chrome Web Store URL in `config.json` now includes the full extension ID.
- **Prettier standardised** — All `src/**/*.js`, `dev/**/*.js`, and `worker/src/**/*.js` formatted with Prettier (printWidth 100, double quotes, trailing commas). `format` and `format:check` scripts added; `format:check` runs in CI on every release tag.

### Added

- **Landing pages: Privacy, Terms, Support** — `/privacy.html`, `/terms.html`, `/support.html` served from the Cloudflare Worker, matching the site dark theme. Each includes a consistent footer with links to all three pages.
- **CI: Chrome Web Store auto-publish** — `.github/workflows/publish-chrome.yml` triggers on `release: published` (after the GitHub Release is created), downloads the chromium zip from release assets, and publishes via the Chrome Web Store API. Requires `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` repository secrets. Edge and Firefox AMO publish workflows are stub stubs to be added once those listings are live.

---

## [1.4.3] — 2026-06-05

### Fixed

- **Conflict Resolution Modal: Banner persists after resolve** — After applying resolved conflicts, the amber "conflicts detected" banner now clears immediately. Previously `_pendingConflicts` was zeroed in storage but the React settings state was not updated, so the banner remained until the next full reload.

---

## [1.4.2] — 2026-06-02

### Added

- **Analytics: Monthly activity chart** — AnalyticsView now shows a rolling 12-month bar chart of solve activity alongside the existing weekly chart.
- **Analytics: Day-of-week heatmap** — New bar chart showing which day of the week you solve most; peak day is highlighted and surfaced as a "Best Day" stat.
- **Analytics: Rolling 7/30-day counts** — `last7Days` and `last30Days` replace the previous calendar-week/month counters so the numbers always reflect a true rolling window.
- **Floating AI: Guided (Socratic) mode** — Default panel mode now leads the learner through questions instead of handing over the answer. A "Guided / Direct" toggle chip in the panel header lets you switch modes; selection is persisted to storage.
- **Floating AI: Apply-code button** — AI-suggested code blocks now render an "Apply" button that writes the code directly into the active Monaco editor without copy-paste.
- **Floating AI: Alt+\` keyboard hint** — Keyboard shortcut hint displayed in the panel title bar.
- **Floating AI: Improved Monaco code extraction** — `getActiveCodeEditor()` is tried first, then `getEditors()`, then `getModels()`, then DOM view-lines sorted by `top` CSS value for correct ordering; covers all LeetCode editor states.
- **Conflict Resolution Modal: SameCodeStep** — When both versions have identical (normalised) code, the modal shows a compact three-way choice (local / remote / both) with an 8 s auto-resolve countdown and progress bar.
- **Conflict Resolution Modal: DiffApproachStep** — When code differs the modal shows a three-way choice with per-side metadata (difficulty, language, date, AI review status, tag count) and the fields that differ.
- **PanelAI: Queue management controls** — Settings → AI now polls and displays real-time review queue stats; exposes "Queue Missing Reviews", "Requeue All", and "Cancel" actions.
- **AIReviewPanel: QueueStatusCard** — Inline status card in the review panel shows queue depth, snail-mode pause state, and time-to-next-batch.
- **Service worker: Snail Mode state** — Persistent `snailMode` state (`lastBatch`, `consecutiveErrors`, `isPaused`, `pausedUntil`, `totalProcessed`, `totalErrors`) tracks AI review batch throttling across browser restarts.
- **Popup: settingsTab deep-link** — `openLibrary()` accepts a `settingsTab` parameter to deep-link directly to a Settings sub-panel from the popup.
- **DedupReviewQueue: "Let AI Decide" action** — Per-conflict button that requests an AI comparison and auto-resolves within 10 s timeout; default countdown reduced from 12 s to 5 s.

### Fixed

- **AI prompts: chatMode respected** — `buildConversationSystemPrompt()` now switches to the direct-answer prompt when `context.chatMode === "direct"`, preventing Socratic rules from leaking into Direct mode sessions.
- **Floating AI: DOM line sort** — View-lines are now sorted by `style.top` before joining, fixing incorrect line ordering when code spans the visible scroll window.

## [1.4.1] — 2026-05-21

### Added

- **Codeforces: Full platform handler (alpha)** — complete submission detection, code capture, language resolution, and GitHub commit for all CF problem types (`/contest`, `/gym`, `/problemset`). Uses sessionStorage to preserve code across CF's full-page reloads.
- **Codeforces: Floating AI panel** — AI chat injected on CF problem pages; reads editor code (`<textarea id="editor">`), language, problem statement, and test failure verdicts.
- **Codeforces: QoL buttons** — "Copy Code" and "AI Review" buttons injected above the CF editor.
- **Codeforces: Verdict detection** — MutationObserver on `span[submissionverdict="OK"]`; works on both inline problem table and `/my` page without any API calls.
- **Codeforces: Difficulty normalisation** — numeric CF ratings mapped to Easy (≤1200) / Medium (1201–1900) / Hard (≥1901) following community standard.
- **GFG: AI test-failure connector** — `readTestFailures()` now reads the GFG result/verdict container and error pre-elements, filtered to exclude success messages.
- **Platforms: Alpha/Beta status badges** — GFG and Codeforces platform cards in Settings → Platforms now show an amber "Alpha" badge.
- **Handler activation** — GFG and Codeforces handlers are now fully activated in `handler-loader.js` (previously logged "under construction" and exited).
- **Docs: Testing guide** — `docs/TESTING_GUIDE.md` with per-platform test steps and common issue resolutions.

### Fixed

- **Codeforces: Title prefix stripped** — CF problem titles like "A. Theatre Square" are stored as "Theatre Square" (letter prefix removed).
- **Codeforces: Language prefix matching** — verbose CF lang strings ("GNU G++17 7.3.0") resolved by keyword prefix so future compiler bumps don't break detection.

## [1.4.0] — 2026-05-21

### Added

- **GFG: Floating AI chat panel** — AI review/chat panel injected on GeeksForGeeks problem pages, matching LeetCode parity.
- **GFG: Copy code button** — copy-to-clipboard button injected into the GFG editor toolbar alongside the existing QoL buttons.
- **GFG: Bulk profile import** — import all accepted submissions from a GFG user profile page in one click (same flow as LeetCode profile import).
- **GFG: Hook-based submission detection** — hooks the submit button and polls the result panel to catch accepted submissions automatically.
- **GFG: Ace editor code extraction** — on-demand fetch now recovers the current editor code via script injection into the page context (GFG uses Ace, not CodeMirror).
- **GFG: PROFILE page type** — `detectPage()` now recognises `/user/{username}` as a distinct `PROFILE` page type.
- **GFG: `gfg_username` setting** — new settings key for specifying the GFG username used in profile import.
- **LeetCode: Handler split into focused modules** — `index.js` reduced from ~2 000 to ~740 lines by extracting `file-builder.js`, `lang-utils.js`, `profile-import.js`, `submission-detector.js`, and `ui-injection.js`.

### Fixed

- **AI: Stale default model names** — updated to `gemini-2.0-flash`, `gpt-4o-mini`, and the current OpenRouter free-tier model slug.
- **AI: Ollama model listing** — was parsing `data.tags` (wrong key); now correctly reads `data.models`.
- **AI: Claude model fetch** — added missing `anthropic-version` header to model-fetch and key-test requests.
- **AI: OpenRouter headers** — added required `HTTP-Referer` header to all OpenRouter API calls.
- **AI: OpenAI model filter** — filter now returns all models; previously excluded `o1`/`o3`/`o4` reasoning models unintentionally.
- **GFG: Timestamp in milliseconds** — timestamp was emitted in seconds; now correctly multiplied to milliseconds so the library sort order is correct.
- **GFG: browser-compat runtime** — replaced direct `chrome.runtime.sendMessage` call with `browser-compat.js` runtime for Firefox compatibility.
- **GFG: Lang slug field** — lang object now includes the `slug` field (was missing, causing path-builder failures).
- **GFG: Code extraction via Ace** — submission code is now read from the Ace editor model; the previous CodeMirror approach was a no-op on GFG.

---

## [1.3.1] — 2026-05-19

### Fixed

- **Auto AI review not triggering** — `_requestAIReview` flag was set on the local submission object but never included in the `emitSolved()` payload; the service worker always saw `undefined` and skipped the review. Flag is now forwarded correctly.
- **"Sync to Ledger" false positive** — clicking the button while auto-sync was in progress caused `_processSubmission` to exit early due to `_processingLock`, but `_manualSync` still showed "✓ Synced". The button now waits up to 8 s for the in-progress sync to finish before reporting "✓ Auto-synced", and only shows "✓ Synced" when `_processSubmission` actually emitted a solve event.
- **Floating AI panel position** — panel was anchored at `bottom: 110px`, sitting high above the window bottom. Moved to `bottom: 20px` to sit at the bottom edge.
- **AI system prompt context dropped** — `buildConversationSystemPrompt` had a dead `return base` statement that prevented the context hints array (problem title, difficulty, request-type behaviour modifiers like "Return useful tests" for `/test`) from ever reaching the system prompt.
- **QoL copy/paste buttons lost on React re-render** — LeetCode's React occasionally re-mounts the editor toolbar, silently removing injected buttons. A `_maybeReinjectQoL()` check is now wired to the existing MutationObserver so buttons are restored within ~600 ms of being removed.

### Added

- **Monaco language detection in AI panel** — `_getEditorLanguage()` reads the language from `monaco.editor.getModels()[0].getLanguageId()` and maps it to a human-readable name (e.g. `python3` → `Python3`). Language is now passed to the floating AI context so code blocks include the correct syntax identifier.
- **Problem statement auto-injected into AI panel context** — `_readProblemStatement()` reads the problem description from the DOM (`[data-track-load="description_content"]`) and passes it as `problemStatement` in the AI chat context, giving the AI full problem context without the user needing `/problem`.

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

- **AI Review Queue — Queue Missing button** — dedicated button that queues only problems with no AI review yet, separate from the full re-queue action.
- **AI Review Queue — Requeue All button** — queues every problem for re-review (including those already reviewed); asks for confirmation before submitting.
- **AI Review Queue — Cancel Queue button** — gracefully cancels all pending reviews: any review currently processing finishes naturally, then the rest are removed. Button appears only when there are pending or processing items.
- **AI Review Queue — built-in dedup** — `enqueueReview()` now checks for an existing pending/processing entry before adding; duplicate submissions are silently skipped and reported as `skipped` in the response.
- **GitHub Pages heatmap full width** — activity heatmap now fills the full card width. Cell size is computed from available width via a `--hm-cell` CSS variable set by a `resizeHeatmap()` function (minimum 8 px); re-runs on every window resize.
- **User repo README — social banner, logo & badges** — generated `README.md` now opens with the CodeLedger social preview image, the extension logo, and four flat-square shields (total / easy / medium / hard counts) with difficulty colours, all using raw GitHub image links.
- **Auto-save settings to repo** — every settings change in the Library UI now calls `markSettingsPendingCommit()` so the next problem commit automatically includes `.codeledger/config.json` with the updated portable settings. Manual "Force Commit Settings" and "Backup Config" buttons continue to work as before.
- **AI Behaviour Bank** — personal memory layer for the AI assistant: Knowledge Bank (insights), user-defined Skills (trigger on command/difficulty/after-solve), and a learning Roadmap. All context is automatically injected into AI chat conversations. Accessible as a full Library tab.
- **MCP Tool-calling** — AI assistant can now invoke tools mid-conversation: save/recall Knowledge Bank insights, open problems, set roadmap goals, list and delete chats. Tools are configurable per-provider in Settings → AI.
- **Cross-device AI chat sync** — every AI conversation is committed as `chats/YYYY-MM-DD-HH-mm-ss-{id}.md` with YAML frontmatter. Bidirectional sync via GitHub on every startup; deleted chats are tombstoned and removed from remote.
- **Rolling GitHub backups** — automatically snapshot local problems + settings to `backups/YYYY-MM-DD-HH-mm-ss.json` in the repo. Configurable interval (default every 20 commits) and retention count (default 10). Full restore from the Library Settings → Backups panel.
- **Deduplication engine** — `duplicate-detector.js` finds same-slug same-language duplicates; `ai-deduplication.js` generates AI merge proposals stored on the problem. A dedicated `DedupReviewQueue` modal lets users approve/reject proposed merges.
- **`MissingMetadataModal`** — review queue for problems missing tags or difficulty; supports individual refresh, per-problem ignore, and bulk ignore/unignore with persistent state.
- **Setup completion notification** — Library sidebar and main content area show a dismissable amber banner if GitHub is not connected or no repo is linked, with a direct link to the Welcome page.
- **GitHub handler refactor** — `commit-builder.js` (tree items + commit payload), `api-client.js` (REST wrappers), and `infra-builder.js` (README/index.html generation) extracted from the monolithic `github/index.js`.
- **Landing page v1.2** — dynamic "Open Library" links (extension URL when installed, web URL otherwise); "What's new in v1.2" features section; new FAQ entries for Behaviour Bank, MCP tools, sync, and migration.
- **Prettier formatter** — `.prettierrc` config; `npm run format` script formats all `src/**/*.js` and `worker/public/assets/**/*.js` files.
- **New repository path layout v2** — `problems/{slug}/{slug}.{ext}` (no platform subdir without canonical); `problems/{slug}/{platform}/{slug}.{ext}` when canonical is assigned. Solution files named after slug (`two-sum.py`) instead of verbose language name (`Python3.py`).
- **Commit taxonomy** — structured commit messages: `[solved]`, `[update]`, `[comprehensive-update]`, `[maintenance]`, `[chore]`, `[init]` via `src/core/commit-messages.js`.
- **Bulk progress-page import → GitHub** — imported problems now build proper v2 paths and READMEs; a "Commit N to GitHub" button appears after import that fires a `[comprehensive-update]` commit.
- **Migration manager** — `MIGRATE_REPO` message for layout v1→v2 migration, `RESET_REPO` for full repo rebuild (self-healing). Finds old `topics/` paths and replaces them atomically via GitHub Trees API.
- **Migration UI in Settings → GitHub** — "Check layout version", "Migrate to v2 layout", and "Full rebuild" buttons.
- **Extension update detection on startup** — compares `manifest.version` against stored version; sets `extensionUpdated` flag so UI can prompt user to run migration.
- **Slash-command autocomplete** in floating AI assistant — typing `/` shows a dropdown of available commands; clicking inserts the command.
- **`index.html` and root `README.md` always regenerated** on every GitHub commit (no longer "only if missing"). GitHub Trees API deduplicates unchanged blobs automatically.
- **`index.json` layout stats** — now includes `layoutVersion`, `byPlatform`, and `byLang` breakdown fields.
- **Root `README.md`** generated in user repos linking to their GitHub Pages stats dashboard (supports custom domains).
- **Under Construction badge** in settings section renderer — sections with `underConstruction: true` show an amber badge and are visually marked.
- **Missing Metadata review modal** — surfaces problems missing tags/difficulty and queues metadata refresh from the background.
- **Dedup review queue** — same-language duplicate candidates now appear in a dedicated review modal with approve/reject actions.
- **AI merge proposals** — same-language duplicates can generate an AI merge proposal that is stored on the problem and reviewed before applying.
- **Mirror repository settings** — a dedicated settings panel manages additional git mirrors alongside the primary repository.
- **Cross-device auto-sync** — periodic background sync is scheduled with `chrome.alarms` so remote changes are picked up automatically.
- **LeetCode: non-accepted submissions could auto-sync** — submission detail pages now check `statusCode === 10` (Accepted) before auto-committing; WA / TLE / Runtime Error submissions are silently skipped. Manual "Sync to Ledger" still works on any submission.
- **LeetCode: sync button appearance delay** — replaced the 1200 ms `setTimeout` retry with a `MutationObserver` that injects the button the instant the action button row enters the DOM; button now appears as soon as the page renders.
- **LeetCode: Monaco code extraction** — added `_getCodeFromMonaco()` fallback (`window.monaco.editor.getModels()[0].getValue()`) for cases where GraphQL returns an empty code field.
- **LeetCode: copy button only copied visible lines** — `qol.js` copy button now uses the Monaco model API as primary source, getting the full file regardless of scroll position; DOM `.view-line` scraping kept as fallback for edge cases.
- **LeetCode: copy button produced dirty code** — both the copy button and `_getCodeFromMonaco()` now strip whitespace-visualization characters Monaco injects (`U+00B7` middle dot, `U+200C` ZWNJ, `U+00A0` NBSP) so clipboard output is clean, runnable code.
- **Graph: scroll zoom snaps to min/max** — replaced binary 0.9/1.1 zoom step with `Math.exp(-deltaY * 0.001)`, making trackpad pinch-to-zoom smooth and proportional while keeping single mouse-wheel notch at ≈ 9.5 % per step.
- **Graph: zoom buttons** — `+` and `-` buttons in the toolbar for click-to-zoom (centered on canvas), grouped with the existing Fit view (▣) button.

### Fixed

- **`import()` banned in MV3 service workers** — all dynamic `await import(...)` calls inside `service-worker.js` removed and replaced with top-level static imports. Affected modules: `ai-review-queue.js`, `ai-deduplication.js`, `backup-manager.js`, `migration-manager.js`, `api-client.js`, and `path-builder.js`. Fixes "Queue AI Reviews" and "Backup" features that were silently failing in production.
- **AI Review Queue — IndexedDB version conflict** — `ai-review-queue.js` was opening a `"CodeLedger"` database at version 1 while the browser had an existing version 2, causing a hard error on every queue operation. Database renamed to `"codeledger-queue"` to open fresh at version 1.
- **`git.apiFetch` not a function in PanelGit.js** — two call sites replaced with a direct call to `ghGetCurrentUser(token)` from the statically imported `api-client.js`. Fixed the manual import preview and individual-sync path when `github_owner` was unset.
- **422 non-fast-forward on sequential commits** — `GitHubHandler.commit()` now retries up to 3 times (500 ms, then 1 000 ms back-off), fetching a fresh ref and rebuilding the tree on each retry.
- **Stale `index.json` showing 0 problems after full sync** — a repair commit is now issued when the remote index contains an empty `problems: []` but local problems are already committed.
- **Repo name forced to lowercase** — `GitHubOnboardingModal.js` `sanitize()` no longer calls `.toLowerCase()`; the allowed-character regex updated to `[^a-zA-Z0-9._-]` to match GitHub's actual rules.
- **`/errors` command in AI assistant always showed "no errors"** — raw error string from `readTestFailures()` now passed directly to `expandChatVariables`, bypassing `normalizeList()` which was converting the string to `[]`.
- **Manual sync blocked by submission dedup** — `forceCommit: isManual` now bypasses the `alreadyCommitted` session-storage dedup check so the Sync button always commits.
- **AI floating panel overlapping LeetCode's submit bar** — moved from `bottom: 70px` to `bottom: 110px`.
- **Bulk-imported problems had no READMEs and used old hardcoded `topics/` paths** — now uses `solutionPath()` + `readmePath()` from path-builder and builds a full README per problem.
- **GitHub avatar showed a placeholder instead of the real profile image** — avatar is now hydrated from saved settings on startup and stored as a data URL when OAuth can fetch it.
- **Console logging was noisy when debug was disabled** — `console.log` / `console.error` are now gated behind the debug flag and re-enabled cleanly after OAuth.
- **`index.json` could throw on malformed remote content** — remote sync now guards JSON parsing and falls back to an empty remote index.
- **`providerId` could be undefined in the AI review loop** — the provider id is now scoped before use and falls back safely.

### Changed

- **AI Review Queue stats display** — replaced verbose paragraph list with a compact inline pill row that only shows non-zero counts; processing count highlighted in cyan.
- **`handleQueueAllAIReviews` now accepts a `missingOnly` flag** — single function drives both "Queue Missing" and "Requeue All" to avoid duplicating logic.
- **`Shift+Enter` inserts newline** in AI assistant input (previously single-line `<input>` — replaced with auto-growing `<textarea>`).
- **Solution files named after problem slug** (`two-sum.py`) — `solutionPath()` no longer uses the verbose language name.
- **`buildIndexJson`** includes layout version and per-platform / per-language stats.
- **LeetCode import now preserves every accepted submission** — imports keep multiple languages and multiple accepted submissions instead of collapsing them too early.
- **Atomic chore commits include notes and AI chats** — maintenance sync commits now bundle `notes.md` and `ai-chats/*.json` alongside problem files.
- **AI review tags are ordered by importance** — tag presentation is now priority-based instead of alphabetical.

### Removed

- Old `topics/{topic}/{slug}/` path pattern — migrated by `MIGRATE_REPO`.

---

## [1.1.0] — 2026-05-07

### Added

- **Syntax highlighting** in the Code tab of ProblemModal — regex-based tokenizer for Python, JavaScript, TypeScript, Java, C++, C, Go, Rust, Kotlin, Swift; keywords in blue, strings in green, comments in gray, numbers in amber, types in purple.
- **`src/lib/syntax-highlight.js`** — new module with `highlightCode(code, lang)` and `cleanCode(code)` helpers; no external dependencies, works inside the extension's strict CSP.
- **Mermaid diagram rendering** via [mermaid.ink](https://mermaid.ink) — renders diagrams as images without loading external scripts (previously blocked by extension CSP). Includes a "View in Mermaid Live" fallback link.
- **Vertical-first Mermaid layout** — flowcharts and graph diagrams without an explicit direction, or with LR/RL, are automatically rewritten to TD (top-down) for more readable AI-generated diagrams.
- **Extension handshake v2** — `presence-marker.js` now dispatches a `CODELEDGER_HANDSHAKE` CustomEvent (in addition to the existing DOM marker) carrying the browser-specific `chrome-extension://` / `moz-extension://` library URL. Works on Chrome, Edge, Brave, and Firefox.
- **Session-persistent install detection** — `landing.js` caches the handshake in `sessionStorage` to avoid the "flash of install link" on page refresh.
- **Firefox + all Chromium support** for the handshake: `presence-marker.js` uses `browser.*` when available, falls back to `chrome.*`.
- **`AICommandPalette` scroll** — pressing ArrowDown/ArrowUp now scrolls the active item into view inside the dropdown list.
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

- **Copy issue with whitespace visualization characters** — Monaco editor (LeetCode) injects U+00B7 (middle dot) and U+200C (zero-width non-joiner) as visible space indicators. `cleanCode()` strips these before display and before writing to clipboard, so copied code is clean.
- **Mermaid showed only raw code** — CDN script injection was blocked by extension CSP; replaced with `mermaid.ink` image approach; code-block fallback now also provides an external link.
- **Double-escaping in markdown tables** — fixed in previous sprint; tables now render properly.
- **KaTeX CSP violation** — fixed in previous sprint; math blocks render as styled code spans.

### Changed

- Extension version bumped to **1.1.0** in `manifest.json` and `package.json`.
- `mermaid-stub.js` — completely rewritten; no longer attempts CDN script injection.
- `presence-marker.js` — now dispatches both DOM marker and CustomEvent for maximum reliability.
- `landing.js` — extended with sessionStorage caching and CustomEvent listener.
- `index.html` — substantially expanded with FAQ, stats, browser badges, and SEO improvements.

---

## [1.0.0] — 2026-04 (Initial Release)

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

[Unreleased]: https://github.com/Life-Experimentalist/Code-Ledger/compare/v1.4.6...HEAD
[1.4.6]: https://github.com/Life-Experimentalist/Code-Ledger/compare/v1.4.5...v1.4.6
[1.4.5]: https://github.com/Life-Experimentalist/Code-Ledger/compare/v1.4.4...v1.4.5
[1.4.4]: https://github.com/Life-Experimentalist/Code-Ledger/compare/v1.4.3...v1.4.4
[1.4.3]: https://github.com/Life-Experimentalist/Code-Ledger/compare/v1.4.2...v1.4.3
[1.4.2]: https://github.com/Life-Experimentalist/Code-Ledger/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/Life-Experimentalist/Code-Ledger/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/Life-Experimentalist/Code-Ledger/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/Life-Experimentalist/Code-Ledger/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/Life-Experimentalist/Code-Ledger/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Life-Experimentalist/Code-Ledger/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Life-Experimentalist/Code-Ledger/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Life-Experimentalist/Code-Ledger/releases/tag/v1.0.0
