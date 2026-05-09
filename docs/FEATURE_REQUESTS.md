# Feature Requests & Backlog

Tracked from user sessions. Status: `done` | `in-progress` | `pending` | `wont-do`

## How to add new feature requests
Drop plain text at the bottom of this file (below the tables). Claude/GitHub Copilot will read it, convert it into a proper row in the right section, and delete the raw text.

1.
2.

---

## Completed ✅

| Feature          | Notes |
| ---------------- | ----- |
| (currently none) | —     |

---

## In Progress 🔄

| Feature                              | Status  | Notes                                                                                      |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------ |
| Multi-platform analytics integration | partial | Graph has platform colors; analytics still mostly LeetCode-centric                         |
| LeetCode import completeness         | partial | Recent 20 via public API; full history via profile page button only                        |
| LeetCode profile import overhaul     | active  | GraphQL 400 errors; tags/difficulty not fetched; timestamp wrong; integrate with analytics |
| Solutions advanced search & filters  | active  | Add dropdowns, tag/topic/language filters, free-text search across title/tags/overview     |

---

## Bugs to Fix 🐛

| Bug                   | Priority | Notes |
| --------------------- | -------- | ----- |
| (none currently open) | —        | —     |

## Pending 📋

| Feature                                      | Priority    | Notes                                                                                                                                                         |
| -------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Problem multi-select + bulk CRUD             | high        | Checkbox select mode in Solutions view; bulk delete, bulk re-tag, bulk export                                                                                 |
| Per-problem topic tag editor                 | high        | In ProblemModal Edit tab: add/remove individual tags (not just comma-list); toggle enabled/disabled per tag; Single Chat can be linked with multiple problems |
| ProblemModal enhancements                    | medium      | Show: accept rate, hints, similar problems with links; remove non-useful fields (likes/dislikes from LeetCode)                                                |
| Custom scrollbar design                      | medium      | Replace stock OS scrollbars with styled thin scrollbar across the library UI                                                                                  |
| LeetCode /progress page stats integration    | low         | Reference `leetcode.com/progress` for streak calendar, topic breakdown, badge data                                                                            |
| AI submission context (test vs submit)       | high        | Detect test case failures vs accept/reject submission; auto-fetch errors and analysis                                                                         |
| AI chat in library                           | medium      | API-key powered chat; conversation saved to git repo alongside solution                                                                                       |
| AI system on LeetCode/platform pages         | medium      | Floating panel with question + editor code context; calls configured AI handler                                                                               |
| Incognito mode timer + "indefinitely" option | medium      | Time selector on incognito toggle; options: 1h, 4h, 24h, indefinitely                                                                                         |
| Enhanced recommendation system               | low         | Beyond Blind 75 — personalized from weak topics / recent solves                                                                                               |
| Full multi-platform analytics                | low         | GFG + Codeforces in heatmap, difficulty chart, topic breakdown                                                                                                |
| Submission auto-detect investigation         | investigate | LeetCode handler MutationObserver may miss accepted results in some layouts                                                                                   |
| GitHub Action: auto-merge canonical issues   | low         | GH Action on main repo: when issue gets ≥5 👍 → append to canonical-map.json and close issue                                                                   |
| Platform-specific scraping in handlers only  | high        | Ensure all site scraping/fetching logic lives in `src/handlers/*` and library UI only opens pages or sends generic requests                                   |


### Math & Scientific Notation

| Feature               | Priority | Notes                                                                           |
| --------------------- | -------- | ------------------------------------------------------------------------------- |
| Math rendering parity | HIGH     | Render inline and block math correctly when AI returns math syntax in responses |

### Diagram & Visual Generation

| Feature                  | Priority | Notes                                                               |
| ------------------------ | -------- | ------------------------------------------------------------------- |
| Mermaid rendering parity | HIGH     | Render Mermaid code blocks correctly when AI responses include them |

### AI Command Palette & UX

| Feature                         | Priority | Notes                                                                                 |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| AI command palette on `/` input | HIGH     | Dropdown showing available commands `/mycode`, `/problem`, `/test`, `/optimize`, etc. |
| Command descriptions & hints    | HIGH     | Show usage hints and what each command does; context-aware suggestions                |
| Command autocomplete            | HIGH     | Fuzzy search commands as user types; keyboard navigation (arrow keys, Enter)          |
| Recently used commands          | MEDIUM   | Pin favorite commands to top; show history; sorting by usage frequency                |
| AI request templates            | MEDIUM   | Save common requests as templates; quick-insert with Ctrl+K shortcut                  |

### New Chat Variables

| Feature                               | Priority | Notes                                                                           |
| ------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| `/mermaid` - Diagram generation       | HIGH     | Insert ```mermaid ... ``` block generated by AI                                 |
| `/test` - Test case extractor         | HIGH     | Generate test cases and test if the code works or not                           |
| `/optimize` - Optimization request    | HIGH     | Suggest code optimizations; show before/after; explain trade-offs               |
| `/explain` - Detailed explanation     | HIGH     | Break down algorithm step-by-step; explain data structures, operations          |
| `/math` - Math helper                 | MEDIUM   | Show relevant formulas; LaTeX rendering for complex expressions                 |
| `/similar-patterns` - Pattern matcher | MEDIUM   | Show similar problems solved; extract common patterns; suggest technique to use |
| `/complexity` - Complexity analyzer   | MEDIUM   | Detailed time/space complexity analysis; include proof or derivation            |

### AI Enhanced Storage

| Feature                     | Priority | Notes                                                                                        |
| --------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| AI chat metadata enrichment | HIGH     | Store request templates, favorite commands, tags per conversation                            |
| Chat response ratings       | HIGH     | 👍/👎 feedback; thumbs up helpful responses for AI training feedback                           |
| AI session analytics        | MEDIUM   | Track which commands used most; which AI responses most helpful; patterns in problem solving |

### Enhanced AIChatsView 📚

| Feature                     | Priority | Notes                                                                                                            |
| --------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| New chat from AIChatsView   | HIGH     | "+ New Chat" button; modal to select problem, AI model, difficulty level; start chat directly                    |
| Problem attachment in chats | HIGH     | Link multiple problems from different platforms to single conversation; browse related solutions in same context |

### Graph Advanced Visualization 📊

| Feature                   | Priority | Notes                                                                              |
| ------------------------- | -------- | ---------------------------------------------------------------------------------- |
| Multi-node selection      | HIGH     | Ctrl+Click to select multiple; shows interaction between selected problems         |
| Node density filtering    | HIGH     | Zoom-based: far=topics only, medium=topics+solved, close=all; improves readability |
| Graph community detection | MEDIUM   | Detect topic clusters; highlight communities; suggest learning paths               |
| Edge label rendering      | MEDIUM   | Show edge types: "topic", "similar", "canonical"; toggle visibility                |

### Unified Problem Modal 🔧

| Feature           | Priority | Notes                                                                               |
| ----------------- | -------- | ----------------------------------------------------------------------------------- |
| Modal persistence | HIGH     | Keep modal state across tab switches; restore scroll position and expanded sections |

### AI-MCP Integration 🧠

| Feature                              | Priority | Notes                                                                                            |
| ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| MCP Tool: Query Problems             | HIGH     | AI can search: by topic, difficulty, platform, pass rate; get problem recommendations            |
| MCP Tool: Get Problem Stats          | HIGH     | Get detailed stats for any problem: solve time, pass rate, difficulty consensus, acceptance rate |
| MCP Tool: Next Problem Suggestion    | HIGH     | Analyze weak topics from solved; suggest next best problem; explain why it's recommended         |
| MCP Tool: Code Quality Analysis      | MEDIUM   | Run code analysis: complexity, edge cases, improvement suggestions; cache results                |
| MCP Tool: Trend Analysis             | MEDIUM   | Show learning trends: improvement over time, difficulty progression, platform distribution       |
| MCP Tool: Similar Solution Discovery | MEDIUM   | Find similar problems solved; extract patterns; suggest technique application                    |
| MCP Context: User Profile            | HIGH     | Provide IndexedDB snapshot: solved problems, weak topics, preferred platforms, solve patterns    |

---

## Won't Do / Deferred ❌

| Feature                                      | Reason                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Full history via Settings import (unlimited) | LeetCode public API caps at 20; full import must use profile page button or CLI importer |
| Real-time leaderboard                        | Requires server-side infra; out of scope for client-only extension                       |