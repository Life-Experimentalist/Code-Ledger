# Feature Requests & Backlog

Tracked from user sessions. Status: `done` | `in-progress` | `pending` | `wont-do`

---

## Completed ✅

| Feature                                   | Notes                                                                                                                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language detection fix (py/undefined)     | `resolveLang()` in LeetCode handler; lang stored as `{ name, ext, slug }`                                                                                                                                            |
| Analytics overhaul                        | Heatmap, difficulty donut, topic bars, platform bars, streaks                                                                                                                                                        |
| Heatmap tooltip stays on click            | Click pins tooltip; click elsewhere dismisses                                                                                                                                                                        |
| Graph multi-topic edges                   | `knowledge-graph.js` builds edges for ALL tags, not just first                                                                                                                                                       |
| Graph platform color rings                | Problem nodes have colored stroke rings per platform; blended for multi-platform                                                                                                                                     |
| Blind 75 link fix                         | Points to neetcode.io/practice?tab=neetcode75                                                                                                                                                                        |
| Backup & Restore                          | Export/import JSON; in Git settings tab                                                                                                                                                                              |
| Org repo support                          | `github_owner` advanced field in GitHub settings                                                                                                                                                                     |
| View Repo link                            | Library header links to connected GitHub repo                                                                                                                                                                        |
| GitHub Pages auto-setup                   | Creates `index.html` stats page on new repo creation                                                                                                                                                                 |
| Retroactive/backdated commits             | `commit(files, msg, repo, { date })` sets author/committer dates                                                                                                                                                     |
| Cloudflare Worker secrets deployed        | All 7 secrets uploaded via `wrangler secret put`                                                                                                                                                                     |
| LeetCode sync always injected             | Sync button not behind QoL toggle                                                                                                                                                                                    |
| Sync button on submission history list    | Per-row Sync on `/problems/{slug}/submissions/`                                                                                                                                                                      |
| Profile page import button                | "Import All Solves" on `leetcode.com/u/{username}/`                                                                                                                                                                  |
| Paginated profile import                  | Loops over all pages with 1200ms delay via authenticated GraphQL                                                                                                                                                     |
| QoL copy/paste buttons fixed              | `findEditorToolbar()` with 5 selector strategies + 800ms retry loop                                                                                                                                                  |
| GitHub repo name whitespace fix           | `.replace(/\s+/g, '-')` on repo name before API calls                                                                                                                                                                |
| LeetCode import message port fix          | Settings panel calls LeetCode GraphQL directly (no background relay)                                                                                                                                                 |
| Import panel in LeetCode Advanced         | `LeetCodeImportPanel` inside LeetCode section's Advanced block                                                                                                                                                       |
| Analytics difficulty donut height fix     | `maintainAspectRatio: false` + explicit `height:180px` wrapper                                                                                                                                                       |
| Archive → Solutions rename                | Nav tab renamed; old `?tab=archive` URLs redirect to `?tab=solutions`                                                                                                                                                |
| Problem cards show all topics             | `ProblemCard` renders all `tags[]` as pill badges                                                                                                                                                                    |
| Problem cards clickable → modal           | `ProblemCard` onClick opens `ProblemModal`; ↗ still navigates directly                                                                                                                                               |
| ProblemModal                              | Full-screen modal with tabs: Overview, Code, AI Review, Similar; Escape to close; backdrop click to close                                                                                                            |
| ProblemModal in GraphView                 | "Expand ↗" button on selected node panel opens full modal                                                                                                                                                            |
| Platform favicons                         | Real favicons in ProblemsView hub cards, ProblemCard, and ProblemModal                                                                                                                                               |
| LeetCode favicon fixed                    | `https://assets.leetcode.com/static_assets/public/icons/favicon.ico`                                                                                                                                                 |
| Graph hover tooltip                       | HTML overlay near cursor; click to pin full panel; platform favicons in tooltip                                                                                                                                      |
| Graph page overhaul (readability)         | Radial initial layout (topics in circle, problems clustered by topic); LOD system hides ghost nodes/similar edges at low zoom; O(1) edge filter via Set; zoom indicator; separate Fit View button; min zoom 0.05     |
| gitEnabled defaults to true for new users | service-worker, git-engine, sync-engine treat `undefined` as enabled                                                                                                                                                 |
| Repo validation before linking            | "Validate" button calls GitHub API; checks empty repo or CodeLedger `index.json`                                                                                                                                     |
| GitHub flow: post-auth auto-setup         | After OAuth success, if no repo configured → auto-expands setup wizard and scrolls to it                                                                                                                             |
| GitHub flow: setup-incomplete banner      | Yellow warning + "Setup repo →" button shown in GitHub section when connected but no repo linked                                                                                                                     |
| GitHub flow: connected & ready indicator  | Green "✓ Connected & repository linked" shown once both token and repo are set                                                                                                                                       |
| Canonical linking pipeline                | `CanonicalView`: search canonical-map, submit GitHub Issues, vote with 👍, progress bar per issue                                                                                                                     |
| Timer integration                         | `src/ui/floating-timer.js`: draggable overlay on LeetCode/GFG problem pages; elapsed time stored in problem record, shown in README and ProblemModal; Avg Solve Time KPI in Analytics                                |
| Onboarding welcome page                   | `src/welcome/welcome.{html,js}`: 5-step checklist (installed → GitHub → repo → solve → commit); auto-opened on first repo link via `OPEN_WELCOME` message from SettingsSchema; platforms grid; "Open Library" button |
| GitHub flow end-to-end fix                | `auto_init: true`; Trees API for atomic repo init (no btoa, no emoji crash); OAuth-only token path; removed duplicate onboarding trigger from SettingsSchema; `github_repo` key used consistently                    |
| Graph physics singularity fix             | 12px softening radius (Plummer sphere), 15 px/frame velocity cap; prevents node collapse to origin                                                                                                                   |
| Graph edge visibility (glow + colors)     | Two-pass rendering with glow layer, lighter colors (slate-500/blue/amber), hover highlighting on connected edges                                                                                                     |
| AI chat markdown rendering                | All AI responses render markdown: headings, lists, code blocks with syntax highlighting, links, emphasis                                                                                                             |
| AI chat copyable text system              | Default OFF (global `aiCopyable` setting); on selection attempt → hover card with 15-min expiring copy button                                                                                                        |
| AI multi-line input with variables        | `MultiLineAIChatInput.js`: Textarea, Ctrl+Enter send, Tab indent, `/` autocomplete for 7 variables                                                                                                                   |
| Chat variable expansion engine            | Support 7 variables: `/mycode`, `/problem`, `/errors`, `/submission`, `/hints`, `/similar`, `/constraints` with context extraction                                                                                   |
| AI chat storage in IndexedDB              | `ai-chat-storage.js`: Full CRUD, problem tagging, metadata, search, timestamp per message                                                                                                                            |
| AIChatsView library page                  | Browse stored conversations; dual organization (by problem/date); search; continue from modal; delete with confirmation                                                                                              |
| LeetCode QoL button robustness            | Enhanced `findEditorToolbar()` with 8+ selector strategies, fallback chain, 800ms retry loop                                                                                                                         |
| Floating AI panel persistence             | MutationObserver detects panel removal on tab navigation, auto-reattaches; survives LeetCode SPA                                                                                                                     |
| Graph physics flexibility panel           | Settings panel with 5 adjustable sliders (Gravity, Repulsion, Center Pull, Damping, Max Velocity)                                                                                                                    |
| Graph physics presets                     | 4 built-in presets (Balanced, Compact, Spread Out, Physics Lab) + unlimited custom presets                                                                                                                           |
| aiCopyable global setting                 | New toggle in core settings, default OFF; controls text copy ability across all AI responses                                                                                                                         |
| AI key draft/save safety                  | Key input is now draft-only; deleting textbox content no longer removes saved keys until explicit save                                                                                                               |
| Deferred sync queue for imports/edits     | Imported and edited problems are marked pending locally and committed on next auto/manual sync                                                                                                                       |

---

## In Progress 🔄

| Feature                              | Status  | Notes                                                                                      |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------ |
| Multi-platform analytics integration | partial | Graph has platform colors; analytics still mostly LeetCode-centric                         |
| LeetCode import completeness         | partial | Recent 20 via public API; full history via profile page button only                        |
| LeetCode profile import overhaul     | active  | GraphQL 400 errors; tags/difficulty not fetched; timestamp wrong; integrate with analytics |

---

## Pending 📋

| Feature                                      | Priority    | Notes                                                                                                          |
| -------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| Problem multi-select + bulk CRUD             | high        | Checkbox select mode in Solutions view; bulk delete, bulk re-tag, bulk export                                  |
| Per-problem topic tag editor                 | high        | In ProblemModal Edit tab: add/remove individual tags (not just comma-list); toggle enabled/disabled per tag    |
| Auto-add accepted submissions                | high        | On LeetCode accept event, auto-save to library respecting incognito toggle                                     |
| Profile import button on /progress page      | medium      | Inject import button on `leetcode.com/progress` instead of profile page (more stable URL)                      |
| ProblemModal enhancements                    | medium      | Show: accept rate, hints, similar problems with links; remove non-useful fields (likes/dislikes from LeetCode) |
| Custom scrollbar design                      | medium      | Replace stock OS scrollbars with styled thin scrollbar across the library UI                                   |
| LeetCode /progress page stats integration    | low         | Reference `leetcode.com/progress` for streak calendar, topic breakdown, badge data                             |
| AI submission context (test vs submit)       | high        | Detect test case failures vs accept/reject submission; auto-fetch errors and analysis                          |
| AI chat in library                           | medium      | API-key powered chat; conversation saved to git repo alongside solution                                        |
| AI system on LeetCode/platform pages         | medium      | Floating panel with question + editor code context; calls configured AI handler                                |
| Incognito mode timer + "indefinitely" option | medium      | Time selector on incognito toggle; options: 1h, 4h, 24h, indefinitely                                          |
| Enhanced recommendation system               | low         | Beyond Blind 75 — personalized from weak topics / recent solves                                                |
| Full multi-platform analytics                | low         | GFG + Codeforces in heatmap, difficulty chart, topic breakdown                                                 |
| Submission auto-detect investigation         | investigate | LeetCode handler MutationObserver may miss accepted results in some layouts                                    |
| GitHub Action: auto-merge canonical issues   | low         | GH Action on main repo: when issue gets ≥5 👍 → append to canonical-map.json and close issue                    |

---

## Bugs to Fix 🐛

| Bug                                      | Priority     | Notes                                                                                        |
| ---------------------------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| **Commit on LeetCode accept not firing** | **CRITICAL** | Service worker doesn't receive problem:solved event on submit; handler detection may fail    |
| **Graph node glow cascade missing**      | **HIGH**     | Selected node should glow full intensity; connected nodes glow 50%; connected edges glow 50% |
| **Problem modal not unified**            | **HIGH**     | Each handler creates own modal; should use single constant component across all platforms    |

---

## AI Advanced Features 🤖

### Math & Scientific Notation

| Feature                   | Priority | Notes                                                                           |
| ------------------------- | -------- | ------------------------------------------------------------------------------- |
| **Math rendering parity** | **HIGH** | Render inline and block math correctly when AI returns math syntax in responses |

### Diagram & Visual Generation

| Feature                      | Priority | Notes                                                               |
| ---------------------------- | -------- | ------------------------------------------------------------------- |
| **Mermaid rendering parity** | **HIGH** | Render Mermaid code blocks correctly when AI responses include them |

### AI Command Palette & UX

| Feature                             | Priority   | Notes                                                                                                      |
| ----------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| **AI command palette on `/` input** | **HIGH**   | Dropdown showing available commands `/mycode`, `/problem`, `/mermaid`, `/math`, `/test`, `/optimize`, etc. |
| **Command descriptions & hints**    | **HIGH**   | Show usage hints and what each command does; context-aware suggestions                                     |
| **Command autocomplete**            | **HIGH**   | Fuzzy search commands as user types; keyboard navigation (arrow keys, Enter)                               |
| **Recently used commands**          | **MEDIUM** | Pin favorite commands to top; show history; sorting by usage frequency                                     |
| **AI request templates**            | **MEDIUM** | Save common requests as templates; quick-insert with Ctrl+K shortcut                                       |

### New Chat Variables

| Feature                                   | Priority   | Notes                                                                           |
| ----------------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| **`/mermaid` - Diagram generation**       | **HIGH**   | Insert `\`\`\`mermaid ... \`\`\`` block generated by AI                         |
| **`/test` - Test case extractor**         | **HIGH**   | Extract all test cases from problem; format as structured JSON                  |
| **`/optimize` - Optimization request**    | **HIGH**   | Suggest code optimizations; show before/after; explain trade-offs               |
| **`/explain` - Detailed explanation**     | **HIGH**   | Break down algorithm step-by-step; explain data structures, operations          |
| **`/math` - Math helper**                 | **MEDIUM** | Show relevant formulas; LaTeX rendering for complex expressions                 |
| **`/similar-patterns` - Pattern matcher** | **MEDIUM** | Show similar problems solved; extract common patterns; suggest technique to use |
| **`/complexity` - Complexity analyzer**   | **MEDIUM** | Detailed time/space complexity analysis; include proof or derivation            |

### AI Enhanced Storage

| Feature                         | Priority   | Notes                                                                                        |
| ------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| **AI chat metadata enrichment** | **HIGH**   | Store request templates, favorite commands, tags per conversation                            |
| **Chat response ratings**       | **HIGH**   | 👍/👎 feedback; thumbs up helpful responses for AI training feedback                           |
| **AI session analytics**        | **MEDIUM** | Track which commands used most; which AI responses most helpful; patterns in problem solving |

---

## Enhanced AIChatsView 📚

| Feature                         | Priority   | Notes                                                                                         |
| ------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| **New chat from AIChatsView**   | **HIGH**   | "+ New Chat" button; modal to select problem, AI model, difficulty level; start chat directly |
| **Problem attachment in chats** | **HIGH**   | Link multiple problems to single conversation; browse related solutions in same context       |
| **Chat templates & favorites**  | **HIGH**   | Save conversation patterns; reuse templates for similar problems                              |
| **Export chat as markdown/PDF** | **MEDIUM** | Download individual chats or entire collection; include diagrams, math, code                  |
| **Chat collaboration metadata** | **MEDIUM** | Track sources: platform, timestamp, difficulty, duration; show learning journey               |
| **Share chat links**            | **LOW**    | Generate shareable links; paste as markdown in GitHub discussions                             |

---

## Graph Advanced Visualization 📊

| Feature                         | Priority     | Notes                                                                                        |
| ------------------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| **Node selection cascade glow** | **CRITICAL** | Selected node: full intensity; 1-hop neighbors: 50% glow; edges: same 50% glow               |
| **Multi-node selection**        | **HIGH**     | Ctrl+Click to select multiple; shows interaction between selected problems                   |
| **Node density filtering**      | **HIGH**     | Zoom-based: far=topics only, medium=topics+solved, close=all; improves readability           |
| **Graph filter controls**       | **HIGH**     | Toggles: by difficulty, platform, solved/unsolved; combined filtering                        |
| **Dynamic layout switching**    | **HIGH**     | Force-directed (current), Circular (topics in ring), Hierarchical (tree); smooth transitions |
| **Graph community detection**   | **MEDIUM**   | Detect topic clusters; highlight communities; suggest learning paths                         |
| **Edge label rendering**        | **MEDIUM**   | Show edge types: "topic", "similar", "canonical"; toggle visibility                          |

---

## Unified Problem Modal 🔧

| Feature                             | Priority     | Notes                                                                               |
| ----------------------------------- | ------------ | ----------------------------------------------------------------------------------- |
| **Constant ProblemModal component** | **CRITICAL** | Single unified component used by ALL platforms; consistent UX regardless of handler |
| **Handler-agnostic modal**          | **CRITICAL** | Abstract platform-specific data into standard schema before passing to modal        |
| **Modal tabs standard**             | **HIGH**     | Overview, Code, AI Chat, Similar, Analysis; same for all platforms                  |
| **Modal persistence**               | **HIGH**     | Keep modal state across tab switches; restore scroll position and expanded sections |

---

## AI-MCP Integration 🧠

| Feature                                  | Priority   | Notes                                                                                            |
| ---------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| **MCP Tool: Query Problems**             | **HIGH**   | AI can search: by topic, difficulty, platform, pass rate; get problem recommendations            |
| **MCP Tool: Get Problem Stats**          | **HIGH**   | Get detailed stats for any problem: solve time, pass rate, difficulty consensus, acceptance rate |
| **MCP Tool: Next Problem Suggestion**    | **HIGH**   | Analyze weak topics from solved; suggest next best problem; explain why it's recommended         |
| **MCP Tool: Code Quality Analysis**      | **MEDIUM** | Run code analysis: complexity, edge cases, improvement suggestions; cache results                |
| **MCP Tool: Trend Analysis**             | **MEDIUM** | Show learning trends: improvement over time, difficulty progression, platform distribution       |
| **MCP Tool: Similar Solution Discovery** | **MEDIUM** | Find similar problems solved; extract patterns; suggest technique application                    |
| **MCP Context: User Profile**            | **HIGH**   | Provide IndexedDB snapshot: solved problems, weak topics, preferred platforms, solve patterns    |

---

---

## How to add new feature requests

Drop plain text at the bottom of this file (below the tables). Claude/GitHub Copilot will read it, convert it into a proper row in the right section, and delete the raw text.

---

## Won't Do / Deferred ❌

| Feature                                      | Reason                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Full history via Settings import (unlimited) | LeetCode public API caps at 20; full import must use profile page button or CLI importer |
| Real-time leaderboard                        | Requires server-side infra; out of scope for client-only extension                       |