# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What CodeLedger Is

A **Manifest V3 browser extension** (Chrome + Firefox) that automatically commits solved DSA problems from LeetCode, GeeksForGeeks, and Codeforces to a user-owned GitHub repository. Backed by a **Cloudflare Worker** (Hono) that handles GitHub OAuth and serves the landing page.

- **Domain:** `codeledger.vkrishna04.me`
- **Auth worker:** `https://codeledger.vkrishna04.me/api`
- **Extension root:** `src/` — every import path is relative to it. You load
  `dist/chromium` (or `dist/firefox`) unpacked, not `src/`: the build is what
  picks one of the two source manifests and writes it out as `manifest.json`.
- **Stack:** Pure ES6 modules, no bundler and no transpiler for our own code.
  Preact + htm are vendored into `src/vendor/` as committed esbuild bundles built
  from npm — nothing is fetched from a CDN at runtime. Tailwind CSS compiles the
  stylesheet only.

---

## Quick Start

### Extension development

```bash
npm install
npm run build:css        # Tailwind → src/ui/styles/compiled.css (run after CSS changes)
npm run build            # CSS + dist packaging
npm run watch            # rebuild on file changes (dev mode)
npm run lint             # type gate — fails on undefined names, see below
npm test                 # node:test suites under test/ and worker/test/
```

`npm run lint` runs `dev/typecheck.js`, which type-checks **every** file with
`tsc --checkJs` and fails the build on the four errors that are never a false
positive on untyped JS: TS2304 / TS2552 (a name that does not exist), TS2349
(calling something that is not a function), TS1117 (a duplicate key in an object
literal). Structural complaints about untyped object literals are printed as a
count only; read them with `npm run lint:all`. Plain `tsc --noEmit` is not enough
— it only reads files carrying a `@ts-check` pragma, which was 11 of 153, and
four crashing bugs shipped through that gap.

`npm run build:fast` skips the Tailwind step and is the fast inner loop; run
`npm run build:css` after touching a class or the new utility silently does
nothing. Then load `dist/chromium` unpacked in `chrome://extensions`.

### Worker (Cloudflare)

```bash
cd worker && npm install
npx wrangler dev         # local dev (requires wrangler.toml with secrets)
npx wrangler deploy      # deploy to production
cd .. && npm run deploy:worker   # shorthand from root
```

`worker/wrangler.toml` is git-ignored — copy `worker/wrangler.toml.example` to
`worker/wrangler.toml`. Secrets never go in that file; see Worker Secrets below.

### Dev utilities

```bash
node dev/generate-manifest-domains.js   # regenerates host_permissions from dom-selectors DOMAINS exports
node dev/build-canonical-map.js         # validate data/canonical-map.json against schema
node dev/package-chrome.js              # produce codeledger-chrome-vX.zip
node dev/package-firefox.js             # produce codeledger-firefox-vX.zip
node dev/import-profile/leetcode-importer.js --github-token=TOKEN --repo=owner/repo
node dev/import-profile/gfg-importer.js --github-token=TOKEN --repo=owner/repo
```

### Release (automated)

```bash
npm run release             # validates, builds zips, commits, tags, pushes all in one command
npm run release -- --dry-run   # preview what would happen (no git changes)
```

Or manually:

```bash
npm run publish             # clean → build:css → build:dist → zip Chrome + Firefox + source
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push origin main vX.Y.Z   # triggers .github/workflows/release.yml
```

### Smoke test (post-deploy)

```bash
curl -sf https://codeledger.vkrishna04.me/api/health
```

---

## Architecture

### Extension layers (all in `src/`)

```
manifest-chromium.json / manifest-firefox.json   — the build emits one manifest.json per target
├── background/service-worker.js      — SW: init, event bus, handles problem:solved, commits
│   ├── sync-engine.js                — cross-device sync via repo index.json
│   └── migration-manager.js          — versioned storage migrations run on install/update
├── content/handler-loader.js         — matches hostname → dynamically imports platform handler
│   └── presence-marker.js            — injects #codeledger-present on landing page
├── handlers/
│   ├── _base/BasePlatformHandler.js  — safeQuery(), MutationObserver lifecycle
│   ├── platforms/{leetcode,geeksforgeeks,codeforces}/index.js
│   ├── ai/{gemini,openai,claude,deepseek,ollama,openrouter}/index.js
│   └── git/github/index.js           — the only implemented git provider (see below)
├── core/
│   ├── constants.js                  — SINGLE SOURCE OF TRUTH for all URLs, keys, storage key names
│   ├── storage.js                    — unified storage abstraction (wraps browser-compat)
│   ├── event-bus.js                  — typed pub/sub (problem:solved → service-worker)
│   ├── handler-registry.js           — resolves a provider name to its handler instance
│   ├── canonical-mapper.js           — resolves platform problem → canonical ID
│   └── ai-prompts.js                 — prompt templates + normalizeAIPrompts()
├── lib/
│   ├── browser-compat.js             — THE ONLY FILE that uses chrome.* or browser.*
│   ├── sanitize-html.js              — the allow-list sanitiser every rendered HTML string goes through
│   └── debug.js                      — createDebugger() with console.bind() trick
├── ui/
│   ├── components/SettingsSchema.js  — schema-driven settings renderer (Preact + htm)
│   ├── components/GitHubOnboardingModal.js — first-time repo setup wizard (Trees API)
│   └── floating-timer.js             — draggable solve-time stopwatch (content-script safe, no framework)
└── welcome/
    └── welcome.js                    — onboarding checklist page (auto-opened on first repo link)
```

GitHub is the only git provider. The GitLab and Bitbucket handlers were deleted
in 1.7.0 — every method on them threw, and they were still reachable from the
provider chips, the mirror picker and the `@gitlab`/`@bitbucket` chat mentions.
Do not reintroduce a provider anywhere in the UI before its `commit()` works.

### Data flow for a solve event

1. Content script (`handler-loader.js`) → imports platform handler → calls `handler.init()`
2. Platform handler detects accepted submission (DOM / GraphQL / REST)
3. Fires `eventBus.emit("problem:solved", data)` → caught by service-worker
4. SW saves to IndexedDB, optionally calls AI review, then calls `_commitWithFailover()`
5. `_commitWithFailover()` resolves the ordered target list (primary, then any
   configured mirrors) and calls `handler.commit()` on each until one succeeds
6. `src/handlers/git/github/index.js` `commit()` builds a single atomic commit
   through the GitHub Trees API (`POST /git/trees` → `POST /git/commits` →
   `PATCH /git/refs/heads/{branch}`)

### Cloudflare Worker (`worker/src/index.js`)

- Built with **Hono** framework
- Routes: `GET /api/health`, `GET /api/auth/:provider`, `GET /api/auth/github/callback`, `POST /api/webhook/github`, `GET /api/data/canonical-map.json`, `POST /api/admin/canonical`
- `GET /*` serves the static landing page from `worker/public/`
- OAuth callback posts `{ type: 'CODELEDGER_AUTH', provider, token }` — the extension listens for exactly this message type
- `GET /api/auth/:provider` mints an HMAC-signed `state` (10-minute TTL) into an
  `HttpOnly; Secure; SameSite=Lax` cookie; the callback verifies it in constant
  time before exchanging the code. A missing or stale cookie is a hard failure,
  not a warning.
- Every route is documented in `docs/OPENAPI.yaml`. Adding or changing one means
  changing the spec in the same commit.

### Library (`src/library/`)

- The extension's own full-page UI (sidebar and the expanded library tab), built
  from the same Preact components.
- Reads solve data from IndexedDB through `src/core/storage.js`.
- The code carries an `IS_EXTENSION = !!chrome.runtime?.id` branch for a
  GitHub-API-backed web build. **That build is not deployed** — the worker serves
  no `/library` route, so the branch is currently dead. Do not describe the
  library as a hosted web app.

---

## Critical Rules

### Never use `chrome.*` or `browser.*` directly

All extension API calls must go through `src/lib/browser-compat.js`. This is the only file that touches those namespaces.

### Never use `console.log` directly

Use `createDebugger('HandlerName')` from `src/lib/debug.js`. The `.bind()` trick preserves caller file+line in DevTools.

```js
import { createDebugger } from "../../lib/debug.js";
const dbg = createDebugger("MyHandler");
dbg.log("message"); // shows at the correct source location in DevTools
```

### Import paths from extension pages

The extension root is `src/`. `chrome.runtime.getURL('handlers/...')` — no `src/` prefix in the path. This is a common bug source.

### UI: Preact + htm, vendored locally

No JSX. No webpack. No transpilation of our own code. Every UI file starts with:

```js
import { h, render } from "../../vendor/preact-bundle.js";
import { useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);
```

`src/vendor/preact-bundle.js` is a **generated file committed to the repo** — an
esbuild bundle of the `preact` and `htm` packages installed from npm, produced by
`npm run vendor:preact`. It is not a CDN shim, and nothing at runtime fetches a
remote script: MV3's `script-src 'self'` would block that anyway, and a store
reviewer must be able to read every line that executes. `chart-bundle.js` is
built the same way. Never reintroduce an `https://esm.sh` (or any remote) import
— regenerate the bundle instead.

### OAuth message contract

Worker posts: `{ type: 'CODELEDGER_AUTH', provider: 'github', token: '...' }`
Extension listens for exactly `data.type === 'CODELEDGER_AUTH'`. Any mismatch silently drops the token.

### Token storage paths

- OAuth tokens: `Storage.setAuthToken(provider, token)` → stored at `auth.tokens`
- AI API keys: `Storage.setAIKeys(map)` → stored at `ai.keys`
- Manual PAT: `settings['github_token']`
- `GitHubHandler.getToken()` checks OAuth path first, then settings PAT — order matters.
- If a token is missing or invalid, **stop the flow and prompt the user to reauthenticate** instead of continuing with a partial login state.

### GitHub API Error Handling

When GitHub requests fail:

1. **Check rate limiting first** — HTTP 403 with `x-ratelimit-remaining: 0` means wait until reset time
2. **Check transient errors** — 5xx or 429 (too many requests) should retry once with exponential backoff
3. **Check auth issues** — 401/403 (unauthorized) means token expired or is invalid; prompt for reauthentication
4. **Check payload issues** — 422 (validation failed) or 400 (bad request) usually indicates malformed commit or tree payload
5. **Fallback to mirror** — If primary target fails after retry, push to mirror repo (if configured) instead of blocking the user

**Never silently drop errors.** Always log the full response status, message, and headers; this is critical for debugging cross-device sync issues.

### Commit Failure Troubleshooting

If commits fail, check in this order:

1. **Owner/repo are set correctly** — `settings.github_owner` and `settings.github_repo` (or `gitRepo` legacy)
2. **Token is valid** — `Storage.getAuthToken('github')` is non-empty; if empty, OAuth failed
3. **GitHub response status** — Check response.status before parsing body; 404 usually means repo doesn't exist
4. **Files array is valid** — Each file has `path` (string), `content` (string); if missing, commit prep was incomplete
5. **Base branch exists** — If `git/ref/heads/{branch}` 404s the repo is empty, so the commit must be built as a root commit (no `base_tree`, no `parents`) and the ref created rather than patched

If all checks pass but commit still fails, the issue is likely in the Trees API call itself (check OPENAPI.yaml for the exact endpoint contract).

### OpenAPI spec maintenance

**Source of truth:** `docs/OPENAPI.yaml`

**When to update the spec:**

- Adding new Worker endpoints or routes
- Changing request/response schemas, parameters, or status codes
- Modifying authentication methods or security schemes
- Updating server URLs (must match `CONSTANTS.URLS` in `src/core/constants.js`)

**Spec compliance rules:**

- Every Worker route must be documented in `docs/OPENAPI.yaml`
- Code implementation must match the spec (path, method, parameters, response format)
- If Worker behavior changes, update the spec **and** the code in the same commit
- Run `npm run validate:openapi` (or equivalent) to lint the spec for syntax errors
- Use the spec as the source of truth for API contracts; never let code drift from documented behavior
- When implementing features that touch Worker routes, reference `docs/OPENAPI.yaml` first

---

## File Naming Conventions

Consistent naming across the codebase reduces cognitive load and makes intent immediately clear. Follow these patterns strictly.

### Handler Directories

All handlers live in `src/handlers/` and follow a strict structure:

- **Platform handlers**: `src/handlers/platforms/{name}/`
  - `index.js` — the platform handler class extending `BasePlatformHandler`
  - `dom-selectors.js` — DOM selectors, legacy selectors, and DOMAINS export (for manifest)
  - `page-detector.js` — exports `detectPage()` and `isSolveCapablePage()`
  - Optional: `enhanced-selectors.js` for version-specific overrides (e.g., LeetCode)
  - Examples: `leetcode/`, `geeksforgeeks/`, `codeforces/`

- **AI provider handlers**: `src/handlers/ai/{name}/`
  - `index.js` — AI handler class extending `BaseAIHandler`; this is the only
    required file. Model listing is centralised in `src/core/model-fetch.js`
    (`fetchModelsForProvider`), which reads the provider's entry in
    `CONSTANTS.AI_PROVIDERS`. `openrouter/` ships as `index.js` alone.
  - Examples: `gemini/`, `openai/`, `claude/`, `deepseek/`, `ollama/`, `openrouter/`

- **Git repository handlers**: `src/handlers/git/{name}/`
  - `index.js` — Git handler class extending `BaseGitHandler`
  - `github/` is the only one

### UI Components & Views

- **Reusable components**: `src/ui/components/{PascalCase}.js`
  - One component per file; file name matches exported class/function name
  - Examples: `SettingsSchema.js`, `GitHubOnboardingModal.js`, `DedupReviewQueue.js`, `AIReviewPanel.js`
  - These are shared between extension sidebar and web app

- **Library views**: `src/library/views/{PascalCase}View.js`
  - Always end with `View` suffix to distinguish from generic components
  - Examples: `ProblemsView.js`, `AnalyticsView.js`, `SettingsView.js`, `AIChatsView.js`, `GraphView.js`

### Core Utilities & Modules

- **Core modules**: `src/core/{hyphen-case}.js`
  - Examples: `constants.js`, `storage.js`, `event-bus.js`, `ai-deduplication.js`, `canonical-mapper.js`, `ai-prompts.js`, `duplicate-detector.js`
  - Each core module handles one responsibility

- **Library utilities**: `src/lib/{hyphen-case}.js`
  - Examples: `debug.js`, `browser-compat.js`

### Naming Style Summary

| Category            | Style             | Examples                                                     | Notes                                      |
| ------------------- | ----------------- | ------------------------------------------------------------ | ------------------------------------------ |
| Handler directories | kebab-case        | `leetcode`, `gemini`, `github`                               | All handlers indexed by name               |
| Handler files       | `index.js`        | `index.js`                                                   | Standard entry point                       |
| Support files       | kebab-case        | `dom-selectors.js`, `page-detector.js`, `graphql-queries.js` | Clear purpose from name                    |
| Components          | PascalCase        | `SettingsSchema.js`, `ModelSelector.js`                      | React/Preact convention                    |
| Views               | PascalCase + View | `ProblemsView.js`, `SettingsView.js`                         | Distinguish from generic components        |
| Core/lib modules    | kebab-case        | `ai-deduplication.js`, `browser-compat.js`                   | Lowercase for utility modules              |
| Storage keys        | CONSTANT_CASE     | `CONSTANTS.SK.TELEMETRY_OPT_IN`                              | Via `CONSTANTS.SK.*` where it has an entry |
| CSS files           | kebab-case        | `floating-timer.css`                                         | Tailwind input files or compiled           |
| Data files          | kebab-case        | `canonical-map.json`, `metadata.json`                        | In `src/data/`                             |

### Storage Key Conventions

**Prefer `CONSTANTS.SK.*` from `src/core/constants.js` over a bare string** — but only
where the key has an entry there. `SK` covers the keys the extension itself
namespaces (`TELEMETRY_OPT_IN`, `SYNC_STATE`, `BEHAVIOR_BANK`, …). It has **no**
`GITHUB_REPO`, `GITHUB_OWNER` or `GITHUB_TOKEN` entry, and the GitHub settings
are read as plain keys off the settings map with a legacy fallback:

```js
// ✅ Correct — these three have no SK entry; the fallback is the compatibility path
const repo = settings.github_repo || settings.gitRepo;

// ✅ Correct — this one does have an SK entry, so use it
const optIn = settings[CONSTANTS.SK.TELEMETRY_OPT_IN] === true;

// ❌ Wrong — invents an SK member that does not exist and reads undefined
const repo = settings[CONSTANTS.SK.GITHUB_REPO];
```

**Canonical storage paths** (must never vary across modules):

- OAuth tokens: `auth.tokens[provider]` via `Storage.setAuthToken(provider, token)` — NOT settings
- Settings: `chrome.storage.local` via `Storage.setSettings(map)`
- AI keys: `ai.keys[provider]` via `Storage.setAIKeys(map)` — NOT settings
- Problems: IndexedDB via `Storage.setProblems(problems)`

Before reading or writing a storage key, validate it exists in `CONSTANTS.SK`; if a key is unsupported or missing, fall back to the documented constant instead of throwing. This prevents silent data loss on schema changes.

### Import Path Conventions

- **From extension root**: Use relative paths with no `src/` prefix

  ```js
  import { createDebugger } from "../../lib/debug.js";
  import { BasePlatformHandler } from "../_base/BasePlatformHandler.js";
  ```

- **In the manifest paths**: Use paths relative to `src/`, without `src/` prefix

  ```json
  "background": { "service_worker": "background/service-worker.js" }
  "content_scripts": [{ "js": ["content/handler-loader.js"] }]
  ```

- **In chrome.runtime.getURL()**: Same as manifest paths — no `src/` prefix
  ```js
  const url = chrome.runtime.getURL("handlers/platforms/leetcode/index.js");
  ```

### Version-Specific Selectors

When DOM selectors change between platform versions (e.g., LeetCode refactors):

- Base selectors live in `dom-selectors.js` (current version)
- Legacy selectors in same file via `LEGACY_SELECTORS` export
- Platform handler tries base selectors first, then legacy fallback
- If multiple major versions need different selectors, create `enhanced-selectors.js` and conditionally load

Example pattern in `dom-selectors.js`:

```js
export const SELECTORS = {
  /* current */
};
export const LEGACY_SELECTORS = {
  /* old versions */
};
export const DOMAINS = ["leetcode.com", "www.leetcode.com"];
```

---

## Settings Keys — Canonical Conventions

These conventions apply across all files. Inconsistency here causes silent commit failures.

| Key                 | Where stored                                       | Canonical name                                | Notes                                                                                                                               |
| ------------------- | -------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| GitHub repo name    | `chrome.storage.local` (via `Storage.setSettings`) | `github_repo`                                 | Do NOT use `gitRepo` (legacy camelCase) — always use `settings.github_repo \|\| settings.gitRepo` when reading for backwards compat |
| GitHub repo owner   | `chrome.storage.local`                             | `github_owner`                                | Falls back to `github_username` then `gitUser` from API                                                                             |
| GitHub PAT (manual) | `chrome.storage.local`                             | `github_token`                                | Only for legacy PAT — OAuth tokens go in `auth.tokens`                                                                              |
| OAuth token         | `auth.tokens` (via `Storage.setAuthToken`)         | accessed via `Storage.getAuthToken("github")` | Never save OAuth tokens to settings                                                                                                 |

**When reading the repo name anywhere in the codebase, always use:**

```js
const repo = settings.github_repo || settings.gitRepo;
```

---

## Worker Secrets (Wrangler)

Auth uses a **classic GitHub OAuth App**, not a GitHub App. This is load-bearing:
GitHub Apps silently ignore the `scope` parameter and issue expiring
user-to-server tokens that get `403 Resource not accessible by integration` on
`POST /user/repos` — which is exactly the "permission denied while creating the
repository" a store reviewer hit. The callback detects an App-shaped token
response (`expires_in`/`refresh_token` present, `scope` absent) and reports the
misconfiguration at sign-in rather than letting it surface as a later 403.

| Secret name                        | Required | Source                                                     |
| ---------------------------------- | -------- | ---------------------------------------------------------- |
| `CODELEDGER_OAUTH_CLIENT_ID`       | yes      | OAuth App Client ID (`Iv23li…`; `Ov23li…` is a GitHub App) |
| `CODELEDGER_OAUTH_CLIENT_SECRET`   | yes      | OAuth App client secret                                    |
| `SESSION_SECRET`                   | yes      | 32 random bytes — signs the OAuth `state` cookie           |
| `CANONICAL_UPLOAD_TOKEN`           | no       | 32 random bytes — guards `POST /api/admin/canonical`       |
| `CODELEDGER_GH_APP_WEBHOOK_SECRET` | no       | 32 random bytes — HMAC for `POST /api/webhook/github`      |

The worker also accepts the older `CODELEDGER_GH_APP_CLIENT_ID` /
`CODELEDGER_GH_APP_CLIENT_SECRET` names as fallbacks so an existing deployment
keeps working; new setups should use the `CODELEDGER_OAUTH_*` names.

**Sign-in returns 500 until `SESSION_SECRET` is set** — the state cookie cannot be
signed without it, and an unsigned state is not accepted.

Set each one interactively (the command takes the name only and prompts for the
value — never pass the secret as an argument, it lands in shell history):

```bash
cd worker && npx wrangler secret put CODELEDGER_OAUTH_CLIENT_ID
```

Generate the random ones locally. `openssl` is not on PATH in a default Windows
PowerShell; this works anywhere Node does:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Adding a New Platform Handler

1. Create `src/handlers/platforms/{name}/index.js` extending `BasePlatformHandler`
2. Create `dom-selectors.js` with versioned `SELECTORS`, `LEGACY_SELECTORS`, and `DOMAINS` export
3. Create `page-detector.js` with `detectPage()` and `isSolveCapablePage()`
4. Add hostname match in `src/content/handler-loader.js`
5. Run `node dev/generate-manifest-domains.js` to update host_permissions in both manifests
6. See `docs/ADDING_PLATFORM_HANDLER.md` for full contract

## Adding a New AI Provider

1. Create `src/handlers/ai/{name}/index.js` extending `BaseAIHandler`
2. Add the provider config to `CONSTANTS.AI_PROVIDERS` in `src/core/constants.js` —
   this is what `src/core/model-fetch.js` reads to list models, so no
   per-provider fetcher is needed
3. Import the class in `src/handlers/init.js` and add it to the `ais` array;
   `initializeHandlers()` registers it and calls its `getSettingsSchema()` if it
   defines one
4. If the provider needs a non-standard response shape, override
   `fetchModels()` on the handler rather than adding a new module

---

## GitHub Onboarding Flow

The `GitHubOnboardingModal` (`src/ui/components/GitHubOnboardingModal.js`) handles first-time repo setup:

- **Create new repo**: Uses `auto_init: false`, then writes the first commit itself. `initializeRepository()` detects the empty repo (the `git/ref/heads/{branch}` lookup fails), omits `base_tree` and `parents` to build a **root commit**, and then creates `refs/heads/main` explicitly. This keeps the repo free of a GitHub-generated README. Note `api-client.js` `createRepo()` still passes `auto_init: true` for the non-onboarding path — both work, but the two paths differ.
- **Repo init**: Uses the **Trees API** (`POST /git/trees` → `POST /git/commits` → `PATCH /git/refs/heads/main`) for atomic multi-file creation. Never use the Contents API (`PUT /contents/`) — it creates one commit per file and requires `btoa()` which breaks on non-ASCII (emoji).
- **Token flow**: OAuth token is already saved to `auth.tokens` by the time the modal opens (saved by `library.js` handleOAuthMessage). The modal should NOT re-save the token to settings.
- **Trigger**: Only `library.js` shows the modal (via `showGitHubOnboarding` state). `SettingsSchema.js` does NOT trigger onboarding — it only stores the token and fetches the username.

## Problem Solve Data Shape

The `problem:solved` event payload (emitted by platform handlers, consumed by service-worker):

```js
{
  title: string,
  titleSlug: string,
  platform: string,           // "leetcode" | "geeksforgeeks" | "codeforces"
  difficulty: "Easy" | "Medium" | "Hard",
  lang: { name: string, ext: string, slug: string },
  tags: string[],
  topic: string,              // first tag, used as folder path
  timestamp: number,          // Unix ms
  code: string,
  files: [{ path: string, content: string }],  // pre-built by handler
  aiReview: string,           // populated by SW after AI review
  runtime: string, memory: string, runtimePct: number, memoryPct: number,
  elapsedSeconds: number,     // solve time from floating timer (0 if timer unused)
}
```

The `files` array drives the git commit. If absent, the SW builds the path through
`src/core/path-builder.js`, which is the single authority on layout:

```
with a canonical match:  problems/{canonicalId}/{platform}/{platformId}.{ext}
without one:             problems/{platformId}/{platformId}.{ext}
```

The `topics/{topic}/…` layout is the **pre-1.5 one**. It survives only in
`migration-manager.js` and the old-layout detection in `service-worker.js`, which
exist to move a repository off it — never write a new path in that shape. The SW
always appends `index.json` as the last file in the commit.

---

## Versioning & Changelog

Version is canonical in **three places that must always match**:

- `package.json` → `"version"`
- `src/manifest-chromium.json` → `"version"`
- `src/manifest-firefox.json` → `"version"`

**Source of truth for releases:** `package.json`. `node dev/sync-manifests.js` copies
it into both manifests, and the CI release pipeline validates they match before tagging.

### Release checklist

1. Add a `## [x.y.z] — YYYY-MM-DD` section to `docs/CHANGELOG.md` (Added / Fixed / Changed / Removed / Security).
2. Bump `package.json`, then run `node dev/sync-manifests.js` to carry the version into both manifests.
3. Run `npm run release` (validates, builds, commits, tags, pushes all at once).
   - Or `npm run release -- --dry-run` to preview first.
4. GitHub Actions (`.github/workflows/release.yml`) triggers automatically on tag push → creates GitHub Release with attached zips.

### CHANGELOG sections

- **Added** — new features or capabilities
- **Fixed** — bug fixes
- **Changed** — behaviour changes in existing features
- **Removed** — removed features or APIs
- **Security** — vulnerabilities fixed (always document these)

When landing a feature mid-sprint, add it under `## [Unreleased]` at the top of the file. Promote to a numbered section at release time.
