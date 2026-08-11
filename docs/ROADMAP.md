# Roadmap and recommendations

Written against the 1.0.0 tree. Every claim here was checked against the code,
not inferred from other docs. Items are grouped by what they ask you to do:
**remove**, **modify**, **add**.

---

## Remove

### 1. Eighteen modules nothing imports — **applied**

Each of these has zero references from any `.js`, `.html` or `.json` under
`src/`, `dev/`, `test/` or `worker/`. They are not lazily loaded — the two places
that do dynamic imports (`content/handler-loader.js` and the AI review path) both
name their targets literally, and neither names any of these.

```
src/background/alarm-manager.js
src/content/heartbeat.js
src/core/canonical.js
src/core/crypto.js
src/core/git-provider-selector.js
src/core/markdown-generator.js
src/core/problem-graph.js
src/handlers/ai/claude/model-fetcher.js
src/handlers/ai/deepseek/model-fetcher.js
src/handlers/ai/gemini/model-fetcher.js
src/handlers/ai/ollama/model-fetcher.js
src/handlers/ai/openai/model-fetcher.js
src/handlers/platforms/leetcode/enhanced-detection.js
src/library/settings-panels/PanelMCP.js
src/ui/components/HandlerStatus.js
src/ui/components/ProviderBadge.js
src/ui/components/StatsRing.js
src/ui/components/TelemetryPrompt.js
```

Three of them are worth calling out individually:

- **`crypto.js`** is a PBKDF2 + AES-GCM-256 wrapper with a hardcoded salt
  (`"codeledger-salt"`). Nothing calls it. Security-shaped code that no path
  exercises is worse than no code — it invites a future contributor to reach for
  it and inherit the fixed salt.
- **`heartbeat.js`** is dead twice over. It is not in either manifest's
  `content_scripts` (which load only `content/handler-loader.js` and
  `content/presence-marker.js`), and the port name it opens, `"heartbeat"`, is
  not one of the three the service worker's `onConnect` handler accepts
  (`ai-review-keepalive`, `sync-keepalive`, `backup-keepalive`).
  `constants.js` still exports `HEARTBEAT_PORT_NAME` for it.
- **The five per-provider `model-fetcher.js` files** are vestigial.
  `src/core/model-fetch.js` `fetchModelsForProvider()` serves every provider from
  its `CONSTANTS.AI_PROVIDERS` entry — which is why OpenRouter ships with no
  fetcher at all and works.

Deleting them removes 1,353 lines that a reader has to rule out before trusting
the module graph.

### 2. `HEARTBEAT_PORT_NAME` from `constants.js` — **applied**

Follows the file above. It was referenced only by the dead module.
`HEARTBEAT_INTERVAL_MS` sat next to it with no reader at all and went with it.

### 3. The GitLab and Bitbucket handler stubs — **applied (deleted)**

`src/handlers/git/gitlab/` and `src/handlers/git/bitbucket/` were registered in
`init.js` with every method throwing `"not yet implemented"`, which meant the
registry could hand a caller a provider that could only fail.

Deleting the handlers turned out to be the smaller half. They were still named
in four places a user could reach: the provider chips in `PanelGit` (drawn from
`CONSTANTS.GIT_PROVIDERS`, where both carried an `underConstruction` status),
the mirror-target picker in the same panel, and the `@gitlab` / `@bitbucket`
chat mentions in `chat-variables.js` — each offering context for a provider
that had none. All four are gone, along with the two OAuth base URLs in
`CONSTANTS.URLS` that nothing read.

Re-adding a provider is a day's work. The `gitlab_token` and `bitbucket_token`
entries stay in the settings-sync denylist: a denylist costs nothing and a
future provider should not have to remember to add itself to one.

---

## Modify

### 4. Four periodic alarms are created unconditionally at startup — **applied**

`service-worker.js` registers all of these whether or not there is any work:

| Alarm                 | Period | Handler when idle          |
| --------------------- | ------ | -------------------------- |
| `CODE_RECOVERY_QUEUE` | 1 min  | returns on an empty queue  |
| `AI_REVIEW_QUEUE`     | 5 min  | returns on an empty queue  |
| `MAINTENANCE_COMMIT`  | 10 min | returns on no pending keys |
| `SYNC`                | 30 min | performs a real sync       |

Three of the four exist only to notice that they have nothing to do. The
one-minute recovery alarm is the aggressive one: it wakes the service worker
sixty times an hour, indefinitely, for a queue that is empty except in the
minutes after a failed extraction.

`AI_REVIEW_QUEUE` and `CODE_RECOVERY_QUEUE` are now armed only while their
queue has work and cleared the moment it drains, by `refreshQueueAlarms()` in
`service-worker.js`. Work can also be queued from a library tab, which writes
storage directly and cannot create an alarm from a page context, so
`MAINTENANCE_COMMIT` — which stays periodic, already reads the pending-key map
every ten minutes, and is cheap — does the re-arming pass.

The worst case for work queued from a tab is therefore a ten-minute wait before
the queue starts draining. Idle cost drops from seventy-eight service-worker
wakes an hour to eight.

`SYNC` was left alone: it is the one of the four that does real work on every
tick.

### 5. `presence-marker.js` uses raw `console.*`

About fifteen call sites, against the project's own rule that everything goes
through `createDebugger()`. It is a non-module content script, so the fix is not
a one-line import swap. It also carries the OAuth relay, which is the single most
rejection-sensitive path in the extension.

Deliberately not changed before a store resubmission. Worth doing immediately
after acceptance, not before.

### 6. Repo URLs still point at `Life-Experimentalist/Code-Ledger`

The rename to `Life-Experimentalist/CodeLedger` has not happened yet. GitHub
serves redirects after a rename, so every current link keeps working either way
— which is why they were left alone rather than pre-broken. After the rename,
sweep `README.md`, `worker/public/`, and the canonical-map fallback URL in
`worker/src/index.js`.

---

## Add

### 7. A first-run health check — **applied**

The Chrome Web Store rejection was a user who could not tell why repository
creation failed. The fixes address the causes, but nothing yet tells a user
_what state they are in_. A single panel that reports, in plain language:

- token present / absent, and which storage path it came from
- token type (OAuth App vs GitHub App) and granted scopes, read from the
  `X-OAuth-Scopes` response header
- target repo resolved, and whether it exists and is writable
- last commit attempt and its outcome

…turns every future report of this class from "it doesn't work" into a
screenshot you can act on. This is the highest-value addition on the list.

Most of the pieces exist already. `GitHubOnboardingModal.js` reads
`X-OAuth-Scopes`, derives `canCreatePrivateRepo(scopes)`, and offers
`grantPrivateAccess()` to re-run OAuth at the wider scope. What is missing is a
place to see that state outside the first-run wizard, once something has gone
wrong. **Settings → Advanced** is the natural home.

Built as `src/core/health-check.js` and mounted as the **Connection check** panel
in Settings → Advanced. It takes its `fetch` as an argument, so every branch is
covered without a network. Two judgement calls are worth recording, because both
are cases where saying less is more accurate:

- A token that reports no `X-OAuth-Scopes` header is a GitHub App token **or** a
  fine-grained PAT, and nothing in the response distinguishes them. Only the
  first cannot create a repository, so the check warns and names both rather
  than declaring a failure it has not observed.
- A 404 on the repository means it does not exist **or** this token cannot see
  it. Telling somebody to recreate a repository they already have is the more
  expensive of the two wrong answers, so it says both.

### 8. An end-to-end test against a real repository

The suite is 572 passing tests across 25 files, all unit-level with the GitHub
API mocked. The one path that has now broken in production twice — OAuth token →
create repo → root commit → ref creation — is the one path no test exercises
against a live endpoint. A single opt-in integration test, gated on a PAT in the
environment and skipped otherwise, would have caught both failures.

### 9. Finish cross-browser sync through the repository — **partly applied**

`src/background/sync-engine.js` reads the remote `index.json` to work out what a
fresh install is missing, and every commit writes `.codeledger/sync.json`
alongside it. `src/core/settings-sync.js` now carries the settings in both
directions: one allow-list (`PORTABLE_SETTINGS` plus a prefix scan) decides what
may leave the device, a suffix rule refuses anything credential-shaped whichever
list it matched, and `github_owner` / `github_repo` / `github_username` are never
overwritten from remote — a second device that has already been pointed at a
repository keeps pointing at it.

Two things named below are still open. Conflict resolution is whole-file, not
per-key: `syncSettingsFromGitHub()` compares one `__syncedAt` against one local
`__updatedAt` and skips the pull if local is newer, so two devices editing
different settings in the same window still resolve as one winner rather than a
merge. And gamification _state_ — the streak itself, freezes banked, vacation
ranges — is deliberately not in the file: the settings that shape it travel, the
numbers do not, so a second browser reconstructs the ledger but starts its streak
fresh.

The repository is the right channel for this, not `chrome.storage.sync`. That
API allows 102,400 bytes in total, 8,192 per item, 512 items, and 1,800 writes
an hour — comfortable for a settings blob, nowhere near a ledger of solved
problems, and it never leaves the browser it belongs to. A Chrome profile and a
Firefox profile do not share it, which is precisely the case the feature is for.
The repository has no size ceiling worth worrying about, is already
authenticated, is already written on every solve, and is readable from anything
that can make an HTTPS request.

What is left to build:

- Per-key `updatedAt` rather than one timestamp for the whole file, so two
  devices editing different settings do not resolve as one winner.
- Deduplicate the ledger on merge by the key `getProblemCommitKey` already
  computes, so the same solve arriving from two devices stays one entry.
- Mark the device that wrote each key, so a conflict can be shown as "your
  laptop set this an hour ago" rather than a silent overwrite.
- Decide whether streak state should travel at all. It is the one thing in the
  ledger a user could gain by editing, and the file lands in a repository they
  control — which is an argument for leaving it where it is.

`chrome.storage.sync` is still worth using for one thing: the handful of
same-browser preferences that should follow a Chrome profile across machines
without waiting on a repository fetch. It is a cache in front of the repository,
never the source of truth.

### 10. Let an AI provider invoke MCP tools itself

Fifteen tools are registered, executable, individually toggleable, and reachable
by hand from the 🔧 panel in the chat view. What does not exist is the model
deciding on its own to call one. The supporting parts are all written —
`_buildMCPToolsContext()`, converters for the OpenAI, Claude, Gemini and DeepSeek
tool schemas, an executor, a result formatter — but `BaseAIHandler` sets
`supportsMCPTools = false` and no provider overrides it, no provider passes a
tool array to its API, and `processMCPToolCalls()` has no caller outside its own
module.

The flag is not the work, and flipping it alone makes the product worse: it
prepends a list of tool names to the prompt, so the model starts emitting tool
calls that nothing executes and then answers as though it had the results. A
provider is only wired up once it also sends the tool array on the request and
routes the response back through the executor — six providers, six live request
shapes, none verifiable without a paid key for each.

Two things were fixed while establishing the above, and are not part of the
remaining work: `getAvailableMCPToolsForAI()` filtered on `id || name`, which the
`openai` and `deepseek` shapes carry under `function` instead, so both formats
resolved to an empty tool list; and the settings panel listed 7 of the 15 tools,
leaving the knowledge-bank, roadmap, chat and navigation tools with no toggle.

Do one provider first, end to end, against a real key, before touching the other
five.

---

## Applying the deletions

Done. The eighteen files and the two heartbeat constants are gone, and the gate
(`npm run lint`, the full suite, `npm run format:check`) is green without them.

One of the eighteen deserves a note rather than a silent removal.
`PanelMCP.js` was the only screen for editing `mcp.config`, and
`SettingsPageView.js` never imported it, so there has been no way to reach that
screen for as long as the panel has existed. Deleting it takes away nothing a
user could get to. The setting itself and `src/core/mcp-tools.js` are untouched;
if the MCP surface comes back it needs a panel that is actually mounted.

---

## Not recommended

**Rewriting history to shrink the pack.** Thirty release zips were tracked
before 1.0.0; the pack is 275 MiB and stays that way even though `releases/` is
now ignored. Shrinking it needs `git filter-repo` and a force push, which breaks
every existing clone and every commit SHA referenced from the changelog or the
store listings. Not worth it for a repository this size.

**A second git provider before 1.0.0 ships.** GitHub is the only target anyone
has asked for, and the OAuth path there is still being validated against a store
reviewer. Adding a second provider now doubles the surface of the exact thing
that is currently under review.
