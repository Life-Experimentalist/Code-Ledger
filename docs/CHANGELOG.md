# Changelog

All notable changes to CodeLedger are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
