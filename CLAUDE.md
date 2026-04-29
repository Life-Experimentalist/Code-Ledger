# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What CodeLedger Is

A **Manifest V3 browser extension** (Chrome + Firefox) that automatically commits solved DSA problems from LeetCode, GeeksForGeeks, and Codeforces to a user-owned GitHub repository. Backed by a **Cloudflare Worker** (Hono) that handles GitHub OAuth and serves the landing page.

- **Domain:** `codeledger.vkrishna04.me`
- **Auth worker:** `https://codeledger.vkrishna04.me/api`
- **Extension root:** `src/` — this is the directory loaded unpacked in Chrome
- **Stack:** Pure ES6 modules, no bundler, no transpiler. Preact + htm from CDN. Tailwind CSS for the compiled stylesheet only.

---

## Commands

### Extension development
```bash
npm install
npm run build:css        # Tailwind → src/ui/styles/compiled.css (run after CSS changes)
npm run build            # CSS + dist packaging
npm run watch            # rebuild on file changes (dev mode)
npm run lint             # tsc --noEmit (type-check only, no transpile)
```

Load the extension unpacked from `src/` in `chrome://extensions`.

### Worker (Cloudflare)
```bash
cd worker && npm install
npx wrangler dev         # local dev (requires wrangler.toml with secrets)
npx wrangler deploy      # deploy to production
cd .. && npm run deploy:worker   # shorthand from root
```

`worker/wrangler.toml` is git-ignored — create it from the template in `CODELEDGER_EXECUTION_GUIDE.md`.

### Dev utilities
```bash
node dev/generate-manifest-domains.js   # regenerates host_permissions from dom-selectors DOMAINS exports
node dev/build-canonical-map.js         # validate data/canonical-map.json against schema
node dev/package-chrome.js              # produce codeledger-chrome-vX.zip
node dev/package-firefox.js             # produce codeledger-firefox-vX.zip
node dev/import-profile/leetcode-importer.js --github-token=TOKEN --repo=owner/repo
node dev/import-profile/gfg-importer.js --github-token=TOKEN --repo=owner/repo
```

### Smoke test (post-deploy)
```bash
curl -sf https://codeledger.vkrishna04.me/api/health
```

---

## Architecture

### Extension layers (all in `src/`)

```
manifest.json
├── background/service-worker.js      — SW: init, event bus, handles problem:solved
│   ├── git-engine.js                 — atomic GitHub Tree API commits
│   ├── sync-engine.js                — cross-device sync via repo index.json
│   └── alarm-manager.js             — chrome.alarms for reminders/sync
├── content/handler-loader.js         — matches hostname → dynamically imports platform handler
│   ├── heartbeat.js                  — SW keepalive port
│   └── presence-marker.js            — injects #codeledger-present on landing page
├── handlers/
│   ├── _base/BasePlatformHandler.js  — safeQuery(), MutationObserver lifecycle
│   ├── platforms/{leetcode,geeksforgeeks,codeforces}/index.js
│   ├── ai/{gemini,openai,claude,deepseek,ollama}/index.js
│   └── git/{github,gitlab,bitbucket}/index.js
├── core/
│   ├── constants.js                  — SINGLE SOURCE OF TRUTH for all URLs, keys, storage key names
│   ├── storage.js                    — unified storage abstraction (wraps browser-compat)
│   ├── event-bus.js                  — typed pub/sub (problem:solved → service-worker)
│   ├── canonical-mapper.js           — resolves platform problem → canonical ID
│   └── ai-prompts.js                 — prompt templates + normalizeAIPrompts()
├── lib/
│   ├── browser-compat.js             — THE ONLY FILE that uses chrome.* or browser.*
│   └── debug.js                      — createDebugger() with console.bind() trick
├── ui/
│   ├── components/SettingsSchema.js  — schema-driven settings renderer (Preact + htm)
│   ├── components/GitHubOnboardingModal.js — first-time repo setup wizard (Trees API)
│   └── floating-timer.js             — draggable solve-time stopwatch (content-script safe, no framework)
└── welcome/
    └── welcome.js                    — onboarding checklist page (auto-opened on first repo link)
```

### Data flow for a solve event
1. Content script (`handler-loader.js`) → imports platform handler → calls `handler.init()`
2. Platform handler detects accepted submission (DOM / GraphQL / REST)
3. Fires `eventBus.emit("problem:solved", data)` → caught by service-worker
4. SW saves to IndexedDB, optionally calls AI review, then calls `git-engine.js`
5. `git-engine.js` calls GitHub Tree API for a single atomic commit

### Cloudflare Worker (`worker/src/index.js`)
- Built with **Hono** framework
- Routes: `/api/health`, `/api/auth/github`, `/api/auth/github/callback`, `/api/webhook/github`, `/api/admin/canonical`, `/api/data/canonical-map.json`
- Serves static landing page from `worker/public/`
- OAuth callback posts `{ type: 'CODELEDGER_AUTH', provider, token }` — the extension listens for exactly this message type

### Library / Web App (`src/library/`)
- Shared HTML + Preact components used both inside the extension sidebar and at `codeledger.vkrishna04.me/library`
- Auto-detects context: `IS_EXTENSION = !!chrome.runtime?.id`
- Extension mode: reads IndexedDB; Web app mode: reads GitHub API via OAuth token

---

## Critical Rules

### Never use `chrome.*` or `browser.*` directly
All extension API calls must go through `src/lib/browser-compat.js`. This is the only file that touches those namespaces.

### Never use `console.log` directly
Use `createDebugger('HandlerName')` from `src/lib/debug.js`. The `.bind()` trick preserves caller file+line in DevTools.

```js
import { createDebugger } from '../../lib/debug.js';
const dbg = createDebugger('MyHandler');
dbg.log('message');  // shows at the correct source location in DevTools
```

### Import paths from extension pages
The extension root is `src/`. `chrome.runtime.getURL('handlers/...')` — no `src/` prefix in the path. This is a common bug source.

### UI: Preact + htm, no build step
All UI files import Preact and htm from `https://esm.sh`. No JSX. No webpack. No transpilation. Every UI file starts with:
```js
import { h, render } from '../../vendor/preact-bundle.js';
import { useState, useEffect } from '../../vendor/preact-bundle.js';
import { htm } from '../../vendor/preact-bundle.js';
const html = htm.bind(h);
```
`src/vendor/preact-bundle.js` is a CDN re-export shim — all UI files import from this single path.

### OAuth message contract
Worker posts: `{ type: 'CODELEDGER_AUTH', provider: 'github', token: '...' }`
Extension listens for exactly `data.type === 'CODELEDGER_AUTH'`. Any mismatch silently drops the token.

### Token storage paths
- OAuth tokens: `Storage.setAuthToken(provider, token)` → stored at `auth.tokens`
- AI API keys: `Storage.setAIKeys(map)` → stored at `ai.keys`
- Manual PAT: `settings['github_token']`
- `GitHubHandler.getToken()` checks OAuth path first, then settings PAT — order matters.

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

## Settings Keys — Canonical Conventions

These conventions apply across all files. Inconsistency here causes silent commit failures.

| Key | Where stored | Canonical name | Notes |
| --- | ------------ | -------------- | ----- |
| GitHub repo name | `chrome.storage.local` (via `Storage.setSettings`) | `github_repo` | Do NOT use `gitRepo` (legacy camelCase) — always use `settings.github_repo \|\| settings.gitRepo` when reading for backwards compat |
| GitHub repo owner | `chrome.storage.local` | `github_owner` | Falls back to `github_username` then `gitUser` from API |
| GitHub PAT (manual) | `chrome.storage.local` | `github_token` | Only for legacy PAT — OAuth tokens go in `auth.tokens` |
| OAuth token | `auth.tokens` (via `Storage.setAuthToken`) | accessed via `Storage.getAuthToken("github")` | Never save OAuth tokens to settings |

**When reading the repo name anywhere in the codebase, always use:**
```js
const repo = settings.github_repo || settings.gitRepo;
```

---

## Worker Secrets (Wrangler)

| Secret name                        | Source                                                       |
| ---------------------------------- | ------------------------------------------------------------ |
| `CODELEDGER_GH_APP_PRIVATE_KEY`    | PKCS#8 PEM file (convert PKCS#1 with `openssl pkcs8 -topk8`) |
| `CODELEDGER_GH_APP_ID`             | GitHub App numeric ID                                        |
| `CODELEDGER_GH_APP_CLIENT_ID`      | GitHub App Client ID                                         |
| `CODELEDGER_GH_APP_CLIENT_SECRET`  | GitHub App client secret                                     |
| `CODELEDGER_GH_APP_WEBHOOK_SECRET` | `openssl rand -hex 32`                                       |
| `CANONICAL_UPLOAD_TOKEN`           | `openssl rand -hex 32`                                       |
| `SESSION_SECRET`                   | `openssl rand -hex 32`                                       |

---

## Adding a New Platform Handler

1. Create `src/handlers/platforms/{name}/index.js` extending `BasePlatformHandler`
2. Create `dom-selectors.js` with versioned `SELECTORS`, `LEGACY_SELECTORS`, and `DOMAINS` export
3. Create `page-detector.js` with `detectPage()` and `isSolveCapablePage()`
4. Add hostname match in `src/content/handler-loader.js`
5. Run `node dev/generate-manifest-domains.js` to update `manifest.json` host_permissions
6. See `docs/ADDING_PLATFORM_HANDLER.md` for full contract

## Adding a New AI Provider

1. Create `src/handlers/ai/{name}/index.js` extending `BaseAIHandler`
2. Create `model-fetcher.js` that fetches live models (or static list for providers without a models endpoint)
3. Add provider config to `CONSTANTS.AI_PROVIDERS` in `src/core/constants.js`
4. Register settings schema in `src/handlers/init.js`
5. Wire into `ModelSelector.js` `loadModels()` switch

---

## GitHub Onboarding Flow

The `GitHubOnboardingModal` (`src/ui/components/GitHubOnboardingModal.js`) handles first-time repo setup:

- **Create new repo**: Uses `auto_init: true` so GitHub creates an initial commit and default branch. Required for the Trees API to work (needs a base SHA).
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

The `files` array drives the git commit. If absent, SW builds a fallback single-file path: `topics/{topic}/{titleSlug}/{lang}.{ext}`. The SW always appends `index.json` as the last file in the commit.
