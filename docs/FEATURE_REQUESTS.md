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
| gitEnabled defaults to true for new users | service-worker, git-engine, sync-engine treat `undefined` as enabled                                                                                                                                                 |
| Repo validation before linking            | "Validate" button calls GitHub API; checks empty repo or CodeLedger `index.json`                                                                                                                                     |
| GitHub flow: post-auth auto-setup         | After OAuth success, if no repo configured → auto-expands setup wizard and scrolls to it                                                                                                                             |
| GitHub flow: setup-incomplete banner      | Yellow warning + "Setup repo →" button shown in GitHub section when connected but no repo linked                                                                                                                     |
| GitHub flow: connected & ready indicator  | Green "✓ Connected & repository linked" shown once both token and repo are set                                                                                                                                       |
| Canonical linking pipeline                | `CanonicalView`: search canonical-map, submit GitHub Issues, vote with 👍, progress bar per issue                                                                                                                     |
| Timer integration                         | `src/ui/floating-timer.js`: draggable overlay on LeetCode/GFG problem pages; elapsed time stored in problem record, shown in README and ProblemModal; Avg Solve Time KPI in Analytics                                |
| Onboarding welcome page                   | `src/welcome/welcome.{html,js}`: 5-step checklist (installed → GitHub → repo → solve → commit); auto-opened on first repo link via `OPEN_WELCOME` message from SettingsSchema; platforms grid; "Open Library" button |
| GitHub flow end-to-end fix                | `auto_init: true`; Trees API for atomic repo init (no btoa, no emoji crash); OAuth-only token path; removed duplicate onboarding trigger from SettingsSchema; `github_repo` key used consistently                    |

---

## In Progress 🔄

| Feature                              | Status  | Notes                                                                                      |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------ |
| Multi-platform analytics integration | partial | Graph has platform colors; analytics still mostly LeetCode-centric                         |
| LeetCode import completeness         | partial | Recent 20 via public API; full history via profile page button only                        |
| Graph page overhaul                  | active  | Nodes disappear on zoom; canvas size race condition; hitTest bug with filter               |
| LeetCode profile import overhaul     | active  | GraphQL 400 errors; tags/difficulty not fetched; timestamp wrong; integrate with analytics |

---

## Pending 📋

| Feature                                      | Priority    | Notes                                                                                                          |
| -------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| AI chat in library                           | medium      | API-key powered chat; conversation saved to git repo alongside solution                                        |
| AI system on LeetCode/platform pages         | medium      | Floating panel with question + editor code context; calls configured AI handler                                |
| Incognito mode timer + "indefinitely" option | medium      | Time selector on incognito toggle; options: 1h, 4h, 24h, indefinitely                                          |
| Enhanced recommendation system               | low         | Beyond Blind 75 — personalized from weak topics / recent solves                                                |
| Full multi-platform analytics                | low         | GFG + Codeforces in heatmap, difficulty chart, topic breakdown                                                 |
| Submission auto-detect investigation         | investigate | LeetCode handler MutationObserver may miss accepted results in some layouts                                    |
| GitHub Action: auto-merge canonical issues   | low         | GH Action on main repo: when issue gets ≥5 👍 → append to canonical-map.json and close issue                    |
| Manual GitHub sync button                    | done        | "Push to GitHub" button in GitHub settings tab triggers single-commit batch sync                               |
| Import problem description + solution        | done        | Phase 4 fetches QUESTION content/hints/acRate/similar; stored in IndexedDB; rendered in modal Overview tab     |
| Unknown difficulty graph crash fix           | done        | `mapDifficulty("Unknown")` now returns "Unknown" (not "Easy"); analytics donut shows Unknown slice; explicit DIFFICULTY_COLOR |
| AI key removal fix                           | done        | "Remove failed keys" button appears after testing; removes only failed keys from textarea, keeps valid ones     |
| AI review markdown rendering                 | done        | AI review tab + chat responses rendered as styled HTML via inline markdown parser                               |
| AI chat context                              | done        | problem statement, code, difficulty, prior review injected as context messages before chat history             |
| Delete button state persistence fix          | done        | `confirmDelete`/`deleting` already reset in `useEffect([problem?.titleSlug, problem?.id])`                     |
| Timestamp import bug fix                     | done        | REST API returns seconds; guard: `tsRaw > 4_102_444_800 ? tsRaw : tsRaw * 1000`                                |
| Problem multi-select + bulk CRUD             | high        | Checkbox select mode in Solutions view; bulk delete, bulk re-tag, bulk export                                  |
| Per-problem topic tag editor                 | high        | In ProblemModal Edit tab: add/remove individual tags (not just comma-list); toggle enabled/disabled per tag    |
| Auto-add accepted submissions                | high        | On LeetCode accept event, auto-save to library respecting incognito toggle                                     |
| Profile import button on /progress page      | medium      | Inject import button on `leetcode.com/progress` instead of profile page (more stable URL)                      |
| ProblemModal enhancements                    | medium      | Show: accept rate, hints, similar problems with links; remove non-useful fields (likes/dislikes from LeetCode) |
| Custom scrollbar design                      | medium      | Replace stock OS scrollbars with styled thin scrollbar across the library UI                                    |
| LeetCode /progress page stats integration    | low         | Reference `leetcode.com/progress` for streak calendar, topic breakdown, badge data                             |

---

## Won't Do / Deferred ❌

| Feature                                      | Reason                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Full history via Settings import (unlimited) | LeetCode public API caps at 20; full import must use profile page button or CLI importer |
| Real-time leaderboard                        | Requires server-side infra; out of scope for client-only extension                       |
