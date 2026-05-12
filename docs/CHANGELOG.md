# Changelog

All notable changes to CodeLedger are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] — 2026-05-12

### Added
- **AI Behaviour Bank** — personal memory layer for the AI assistant: Knowledge Bank (insights), user-defined Skills (trigger on command/difficulty/after-solve), and a learning Roadmap. All context is automatically injected into AI chat conversations. Accessible as a full Library tab.
- **MCP Tool-calling** — AI assistant can now invoke tools mid-conversation: save/recall Knowledge Bank insights, open problems, set roadmap goals, list and delete chats. Tools are configurable per-provider in Settings → AI.
- **Cross-device AI chat sync** — every AI conversation is committed as `chats/YYYY-MM-DD-HH-mm-ss-{id}.md` with YAML frontmatter. Bidirectional sync via GitHub on every startup; deleted chats are tombstoned and removed from remote.
- **Rolling GitHub backups** — automatically snapshot local problems + settings to `backups/YYYY-MM-DD-HH-mm-ss.json` in the repo. Configurable interval (default every 20 commits) and retention count (default 10). Full restore from the Library Settings → Backups panel.
- **Deduplication engine** — `duplicate-detector.js` finds same-slug same-language duplicates; `ai-deduplication.js` generates AI merge proposals stored on the problem. A dedicated `DedupReviewQueue` modal lets users approve/reject proposed merges.
- **`MissingMetadataModal`** — review queue for problems missing tags or difficulty; supports individual refresh, per-problem ignore, and bulk ignore/unignore with persistent state.
- **Setup completion notification** — Library sidebar and main content area show a dismissable amber banner if GitHub is not connected or no repo is linked, with a direct link to the Welcome page.
- **Welcome page diagnostic tool** — second tab "Diagnostics & Migration" scans the repo for layout version mismatches, missing infra files, and uncommitted problems; offers one-click repair and bulk/individual migration commit.
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
- **Graph: scroll zoom snaps to min/max** — replaced binary 0.9/1.1 zoom step with `Math.exp(−deltaY × 0.001)`, making trackpad pinch-to-zoom smooth and proportional while keeping single mouse-wheel notch at ≈ 9.5 % per step.
- **Graph: zoom buttons** — `+` and `−` buttons in the toolbar for click-to-zoom (centered on canvas), grouped with the existing Fit view (▣) button.

### Fixed
- **`/errors` command in AI assistant always showed "no errors"** — raw error string from `readTestFailures()` now passed directly to `expandChatVariables`, bypassing `normalizeList()` which was converting the string to `[]`.
- **Manual sync blocked by submission dedup** — `forceCommit: isManual` now bypasses the `alreadyCommitted` session-storage dedup check so the Sync button always commits.
- **AI floating panel overlapping LeetCode's submit bar** — moved from `bottom: 70px` to `bottom: 110px`.
- **Bulk-imported problems had no READMEs and used old hardcoded `topics/` paths** — now uses `solutionPath()` + `readmePath()` from path-builder and builds a full README per problem.
- **GitHub avatar showed a placeholder instead of the real profile image** — avatar is now hydrated from saved settings on startup and stored as a data URL when OAuth can fetch it.
- **Console logging was noisy when debug was disabled** — `console.log` / `console.error` are now gated behind the debug flag and re-enabled cleanly after OAuth.
- **`index.json` could throw on malformed remote content** — remote sync now guards JSON parsing and falls back to an empty remote index.
- **`providerId` could be undefined in the AI review loop** — the provider id is now scoped before use and falls back safely.

### Changed
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
[Unreleased]: https://github.com/Life-Experimentalist/Code-Ledger/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/Life-Experimentalist/Code-Ledger/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Life-Experimentalist/Code-Ledger/releases/tag/v1.0.0
