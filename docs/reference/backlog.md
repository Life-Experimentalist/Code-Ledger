# Feature Requests & Backlog

Tracked from user sessions. Status: `done` | `in-progress` | `pending` | `wont-do`

## How to add new feature requests

Drop plain text at the bottom of this file (below the tables). Claude/GitHub Copilot will read it, convert it into a proper row in the right section, and delete the raw text.

1.
2.

---

## Completed ✅

| Feature                                        | Notes                                                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Sync preview + conflict resolution flow        | Added preview, conflict modal resolution, apply-import, and sync-all continuation path.         |
| Sync mirror failover with active-target switch | Primary failure falls back to mirrors in order; first healthy mirror becomes active target.     |
| Multi-language analytics tracking              | Added unique-problem and multi-language aggregation in the analytics dashboard.                 |
| Sync regression checks in release pipeline     | Added dedicated regression test and enforced it in local release plus GitHub release workflow.  |
| Problem multi-select + bulk CRUD               | Added select mode in Solutions with bulk delete, bulk re-tag, and bulk JSON export.             |
| Per-problem topic tag editor                   | Replaced comma-only tags with add/remove chip editor in the ProblemModal Edit tab.              |
| Platform-specific scraping in handlers only    | Moved floating AI LeetCode scraping readers into the LeetCode handler platform adapter.         |
| AI chat in library                             | AIChatsView ships with saved conversations, context-aware prompts, and attached problems.       |
| New chat from AIChatsView                      | The library has a dedicated "+ New Chat" flow to start conversations from the chat view.        |
| Problem attachment in chats                    | Multiple problems can be attached to one chat and reused in the conversation context.           |
| Math rendering parity                          | AI markdown rendering supports inline and block math through the KaTeX renderer.                |
| Mermaid rendering parity                       | AI markdown rendering supports Mermaid fences with inline render and fallback live-link output. |

---

## In Progress 🔄

| Feature                              | Status  | Notes                                                                                             |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------- |
| Multi-platform analytics integration | partial | Graph has platform colors; analytics is still mostly LeetCode-centric.                            |
| LeetCode import completeness         | partial | Recent 20 via public API; full history still requires the profile page button.                    |
| LeetCode profile import overhaul     | active  | GraphQL 400 errors; tags and difficulty are not fetched yet; timestamp still needs fixing.        |
| Solutions advanced search & filters  | active  | Add dropdowns, tag/topic/language filters, and free-text search across title, tags, and overview. |
| Documentation revamp and dedupe      | done    | Canonical docs index, archive layout, and root markdown cleanup are complete.                     |

---

## Bugs to Fix 🐛

| Bug                   | Priority | Notes |
| --------------------- | -------- | ----- |
| (none currently open) | —        | —     |

## Pending 📋

### Core UI

| Feature                                      | Priority | Notes                                                                                   |
| -------------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| ProblemModal enhancements                    | medium   | Show accept rate, hints, and similar problems with links; remove low-value fields.      |
| Custom scrollbar design                      | medium   | Replace stock OS scrollbars with a styled thin scrollbar across the library UI.         |
| LeetCode /progress page stats integration    | low      | Reference `leetcode.com/progress` for streak calendar, topic breakdown, and badge data. |
| Incognito mode timer + "indefinitely" option | medium   | Add time selector on incognito toggle with 1h, 4h, 24h, and indefinite options.         |
| Modal persistence                            | high     | Keep modal state across tab switches and expanded sections.                             |

### AI Context and Commands

| Feature                               | Priority | Notes                                                                                                                              |
| ------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| AI command palette on `/` input       | high     | Dropdown of commands such as `/mycode`, `/problem`, `/test`, `/optimize`, and `/explain` with auto-attached context when relevant. |
| `/mycode` - Personal code context     | high     | Automatically surface the user’s code when it improves the answer.                                                                 |
| `/problem` - Problem context          | high     | Automatically attach current problem details when relevant.                                                                        |
| `/test` - Test case extractor         | high     | Generate tests and run them against the editor code before submit.                                                                 |
| `/optimize` - Optimization request    | high     | Suggest code optimizations with before/after trade-offs.                                                                           |
| `/explain` - Detailed explanation     | high     | Break down algorithms step by step with clear data-structure reasoning.                                                            |
| `/mermaid` - Diagram generation       | high     | Generate Mermaid diagrams inline when they make the explanation clearer.                                                           |
| `/math` - Math helper                 | medium   | Surface formulas and render math when the response needs it.                                                                       |
| `/similar-patterns` - Pattern matcher | medium   | Show similar problems solved and the common technique used.                                                                        |
| `/complexity` - Complexity analyzer   | medium   | Provide time and space complexity analysis with the reasoning.                                                                     |
| Recently used commands                | medium   | Pin favorite commands to the top and sort by usage frequency.                                                                      |
| AI request templates                  | medium   | Save common requests as templates with a quick-insert shortcut.                                                                    |

### AI Enhanced Storage

| Feature                     | Priority | Notes                                                                                   |
| --------------------------- | -------- | --------------------------------------------------------------------------------------- |
| AI chat metadata enrichment | high     | Local-only storage for request templates, favorite commands, and per-conversation tags. |
| Chat response ratings       | high     | Local feedback for the user’s own history and future prompt selection.                  |
| AI session analytics        | medium   | Track local command usage and response usefulness for personal insights only.           |

### Graph Advanced Visualization 📊

| Feature                                | Priority    | Notes                                                                                        |
| -------------------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| AI submission context (test vs submit) | high        | Detect test-case failures versus accepted/rejected submissions and fetch the right analysis. |
| AI system on LeetCode/platform pages   | medium      | Floating panel with question plus editor context that calls the configured AI handler.       |
| Enhanced recommendation system         | low         | Move beyond Blind 75 with personalized recommendations from weak topics and recent solves.   |
| Full multi-platform analytics          | low         | Bring GFG and Codeforces into heatmap, difficulty chart, and topic breakdown views.          |
| Submission auto-detect investigation   | investigate | LeetCode handler MutationObserver may miss accepted results in some layouts.                 |
| Graph community detection              | high        | Detect topic clusters, highlight communities, and suggest learning paths.                    |
| Node density filtering                 | high        | Zoom-based density levels: far = topics only, medium = topics plus solved, close = all.      |
| Zoom to node whose modal is open       | high        | Auto-center the graph on the open problem modal when that improves context.                  |
| Multi-node selection                   | low         | Ctrl+Click to select multiple nodes and compare interactions between problems.               |
| Edge label rendering                   | medium      | Show edge types such as topic, similar, and canonical with a visibility toggle.              |

### AI-MCP Integration 🧠

| Feature                              | Priority | Notes                                                                                   |
| ------------------------------------ | -------- | --------------------------------------------------------------------------------------- |
| MCP Tool: Query Problems             | high     | Search by topic, difficulty, platform, or pass rate and return recommendations.         |
| MCP Tool: Get Problem Stats          | high     | Return solve time, pass rate, difficulty consensus, and acceptance rate.                |
| MCP Tool: Next Problem Suggestion    | high     | Analyze weak topics and suggest the next best problem with rationale.                   |
| MCP Tool: Code Quality Analysis      | medium   | Run code analysis for complexity, edge cases, and improvement suggestions.              |
| MCP Tool: Trend Analysis             | medium   | Show learning trends, difficulty progression, and platform distribution.                |
| MCP Tool: Similar Solution Discovery | medium   | Find similar problems and extract the pattern or technique used.                        |
| MCP Context: User Profile            | high     | Provide an IndexedDB snapshot of solved problems, weak topics, and preferred platforms. |

---

## Won't Do / Deferred ❌

| Feature                                      | Reason                                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Full history via Settings import (unlimited) | LeetCode public API caps at 20; full import must use the profile page button or CLI importer. |
| Real-time leaderboard                        | Requires server-side infrastructure and is out of scope for a client-only extension.          |
