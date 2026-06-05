# GitHub Copilot Instructions — CodeLedger

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For tiny, low-risk tasks like typo fixes, formatting-only changes, or a single-file tweak, use judgment to choose the fastest safe path.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for states the current code has already ruled out, such as an impossible branch after validation.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

**Tradeoff:** These guidelines bias toward caution over speed. For tiny, low-risk tasks like typo fixes, formatting-only changes, or a single-file tweak, use judgment to choose the fastest safe path.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

When rules conflict, prefer repository-specific conventions first, then extension API/storage/auth rules, then general style guidance.

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Project Overview

CodeLedger is a **Manifest V3 Chrome/Firefox extension** that automatically commits solved DSA problems (LeetCode, GeeksForGeeks, Codeforces) to a user-owned GitHub repository. No bundler, no transpiler — pure ES6 modules with Preact + htm.

## Stack

- **Extension**: Pure ES6 modules, Preact v10 + htm (CDN re-export via `src/vendor/preact-bundle.js`)
- **Styling**: Tailwind CSS (pre-compiled to `src/ui/styles/compiled.css`) — no runtime
- **Backend**: Cloudflare Worker (Hono framework) for GitHub OAuth
- **Storage**: IndexedDB (via `Storage` abstraction) + `chrome.storage.local` for settings

## Critical Rules

### Never use console.log directly

Use `createDebugger('Name')` from `src/lib/debug.js`:

```js
import { createDebugger } from "../lib/debug.js";
const dbg = createDebugger("MyModule");
dbg.log("message");
```

### UI: Preact + htm, no JSX, no build step

```js
import { h, render } from "../../vendor/preact-bundle.js";
import { useState, useEffect } from "../../vendor/preact-bundle.js";
import { htm } from "../../vendor/preact-bundle.js";
const html = htm.bind(h);
```

### Storage keys — never use raw strings

Use `CONSTANTS.SK.*` from `src/core/constants.js`. Validate keys before reading or writing; if a key is unsupported or missing, fall back to the documented constant instead of throwing. Storage shape:

- `Storage.getAllProblems()` → IndexedDB
- `Storage.getSettings()` → chrome.storage.local
- `Storage.getAuthToken(provider)` → OAuth tokens at `auth.tokens`
- `Storage.getAIKeys()` → AI API keys at `ai.keys`

### Token priority in GitHub handler

The canonical key is `settings.github_repo`. When **reading** anywhere in the codebase, always fall back for legacy compat:

```js
const repo = settings.github_repo || settings.gitRepo;
```

Never write `settings.gitRepo` in new code. Never save an OAuth token to settings — use `Storage.setAuthToken("github", token)`.

### GitHub repo init — always use Trees API

When creating/initialising a repo (e.g., `GitHubOnboardingModal`):

- Create repo with `auto_init: true` (ensures a base branch + commit SHA exists)
- Use `POST /git/trees` + `POST /git/commits` + `PATCH /git/refs/heads/main` for all file creation
- Never use `PUT /contents/{path}` for initial setup — it creates one commit per file and requires `btoa()` which breaks on non-ASCII content
- If a GitHub request fails, check for rate limiting or a transient 5xx first, retry once with backoff when safe, and fall back to the mirror or alternate target path when one exists.

### OAuth message contract

Worker posts: `{ type: "CODELEDGER_AUTH", provider: "github", token: "..." }`
If the token is missing or invalid, stop the flow and prompt the user to reauthenticate instead of continuing with a partial login state.

If commits fail, check the owner, repo, auth token, and GitHub response status first; only then change the commit flow.

```
src/
├── background/service-worker.js  ← event bus, handles problem:solved, git commit
├── content/handler-loader.js     ← matches hostname → imports platform handler
├── handlers/
│   ├── _base/BasePlatformHandler.js
│   ├── platforms/{leetcode,geeksforgeeks,codeforces}/index.js
│   ├── ai/{gemini,openai,claude,deepseek,ollama}/index.js
│   └── git/{github,gitlab,bitbucket}/index.js
├── core/
│   ├── constants.js     ← SINGLE SOURCE OF TRUTH for URLs, keys, storage keys
│   ├── storage.js       ← unified storage abstraction
│   ├── event-bus.js     ← typed pub/sub (problem:solved → service-worker)
│   └── ai-prompts.js    ← prompt templates
├── library/             ← web app (extension sidebar + GitHub Pages)
│   └── views/{ProblemsView,AnalyticsView,GraphView,SettingsView}.js
├── ui/
│   ├── components/      ← shared Preact components (SettingsSchema, GitHubOnboardingModal, etc.)
│   └── floating-timer.js ← draggable solve-time stopwatch (content-script safe, plain JS)
└── welcome/             ← onboarding checklist page (auto-opened on first repo link)
```

## Problem Solve Flow

1. Content script → platform handler → detects accepted submission
2. Handler fires `eventBus.emit("problem:solved", data)`
3. Service worker saves to IndexedDB → AI review → GitHub commit
4. GitHub commit includes: solution file + index.json + index.html (first commit only)

## Data Shape (problem object)

```js
{
  title: string, titleSlug: string, platform: string,
  difficulty: "Easy"|"Medium"|"Hard",
  lang: { name: string, ext: string },
  tags: string[],
  timestamp: number,  // Unix seconds
  code: string,
  files: [{ path: string, content: string }],
  topic: string,      // first tag (for folder path)
  aiReview: string,
  runtime: string, memory: string, runtimePct: number, memoryPct: number,
  elapsedSeconds: number,   // solve time from floating timer; 0 if not used
  files: [{ path: string, content: string }],  // pre-built by handler; SW appends index.json
}
```

## OpenAPI Spec Compliance

**Reference:** `docs/OPENAPI.yaml` is the single source of truth for all Worker routes, endpoints, and API contracts.

### When updating Worker code:

1. **Check the spec first** — reference `docs/OPENAPI.yaml` for endpoint definitions, parameters, and response schemas
2. **Ensure code matches spec** — no endpoint changes without updating the spec
3. **Spec-first development** — if adding a new route, update the spec before or during implementation
4. **Keep servers section synced** — `servers:` URLs must match `CONSTANTS.URLS` in `src/core/constants.js`

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
  - `index.js` — AI handler class extending `BaseAIHandler`
  - `model-fetcher.js` — fetch live models or static list
  - Examples: `gemini/`, `openai/`, `claude/`, `deepseek/`, `ollama/`, `openrouter/`

- **Git repository handlers**: `src/handlers/git/{name}/`
  - `index.js` — Git handler class extending `BaseGitHandler`
  - Examples: `github/`, `gitlab/`, `bitbucket/`

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

| Category            | Style             | Examples                                                   | Notes                               |
| ------------------- | ----------------- | ---------------------------------------------------------- | ----------------------------------- |
| Handler directories | kebab-case        | `leetcode`, `gemini`, `github`                             | All handlers indexed by name        |
| Handler files       | `index.js`        | `index.js`                                                 | Standard entry point                |
| Support files       | kebab-case        | `dom-selectors.js`, `page-detector.js`, `model-fetcher.js` | Clear purpose from name             |
| Components          | PascalCase        | `SettingsSchema.js`, `ModelSelector.js`                    | React/Preact convention             |
| Views               | PascalCase + View | `ProblemsView.js`, `SettingsView.js`                       | Distinguish from generic components |
| Core/lib modules    | kebab-case        | `ai-deduplication.js`, `browser-compat.js`                 | Lowercase for utility modules       |
| Storage keys        | CONSTANT_CASE     | `CONSTANTS.SK.GITHUB_REPO`                                 | Via `CONSTANTS.SK.*` export only    |
| CSS files           | kebab-case        | `floating-timer.css`                                       | Tailwind input files or compiled    |
| Data files          | kebab-case        | `canonical-map.json`, `metadata.json`                      | In `src/data/`                      |

### Storage Key Conventions

**Never hardcode storage keys.** Always use `CONSTANTS.SK.*` from `src/core/constants.js`:

```js
// ✅ Correct
const repo =
  settings[CONSTANTS.SK.GITHUB_REPO] ||
  settings[CONSTANTS.SK.GITHUB_REPO_LEGACY];

// ❌ Wrong
const repo = settings["github_repo"];
const repo = settings.github_repo;
```

**Canonical storage paths** (documented in CLAUDE.md):

- OAuth tokens: `auth.tokens[provider]` via `Storage.setAuthToken(provider, token)`
- Settings: `chrome.storage.local` via `Storage.setSettings(map)`
- AI keys: `ai.keys[provider]` via `Storage.setAIKeys(map)`
- Problems: IndexedDB via `Storage.setProblems(problems)`

### Import Path Conventions

- **From extension root**: Use relative paths with no `src/` prefix

  ```js
  import { createDebugger } from "../../lib/debug.js";
  import { BasePlatformHandler } from "../_base/BasePlatformHandler.js";
  ```

- **In manifest.json paths**: Use paths relative to `src/`, without `src/` prefix

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

### Common updates:

- New endpoint → add `paths:/{endpoint}` section with correct method, parameters, responses, and security
- Parameter change → update `parameters:` array and validate code matches
- Response schema change → update `responses:` with correct example and description
- Auth change → update `components: securitySchemes:` and endpoint security arrays

### Validation:

````

If this check fails, code reviews should catch it.

---

## Common Patterns

### Background → library page message

```js
chrome.runtime.sendMessage({ type: "MY_TYPE", ...payload }, (response) => {
    if (chrome.runtime.lastError) {
        /* handle */
    }
    // use response
});
// In service-worker.js listener, MUST return true for async:
return true;
````

### Platform handler injection

```js
import { BasePlatformHandler } from "../../_base/BasePlatformHandler.js";
export class MyHandler extends BasePlatformHandler {
  constructor() {
    super("myplatform", "MyPlatform", {});
  }
  async init() {
    /* setup MutationObserver, inject QoL */
  }
}
```

## Versioning & Release

**Source of truth:** `package.json`. The release pipeline validates they match.

### Release workflow

3. Run `npm run publish` — builds CSS + dist, creates Chrome zip, Firefox zip (strips `side_panel`), and source zip in `releases/`.
4. Commit everything (`git commit -m "chore: release vX.Y.Z"`).
5. Tag: `git tag vX.Y.Z && git push origin vX.Y.Z` — this triggers `.github/workflows/release.yml` which creates the GitHub Release and attaches the zips.

### CHANGELOG format

Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) with sections:

- **Added** — new features
- **Fixed** — bug fixes
- **Changed** — changes in existing functionality
- **Removed** — deprecated features removed
- **Security** — security fixes (always include these)

When implementing a feature, append to the relevant section in `docs/CHANGELOG.md` under `[Unreleased]` if the release hasn't been cut yet.

## File Naming Conventions
