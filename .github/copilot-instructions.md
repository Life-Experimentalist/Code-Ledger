# GitHub Copilot Instructions — CodeLedger

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

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
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

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

### Never use chrome._ or browser._ directly

All extension API calls must go through `src/lib/browser-compat.js`. This is the ONLY file that touches those namespaces.

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

Use `CONSTANTS.SK.*` from `src/core/constants.js`. Storage shape:

- `Storage.getAllProblems()` → IndexedDB
- `Storage.getSettings()` → chrome.storage.local
- `Storage.getAuthToken(provider)` → OAuth tokens at `auth.tokens`
- `Storage.getAIKeys()` → AI API keys at `ai.keys`

### Token priority in GitHub handler

`Storage.getAuthToken("github")` (OAuth) first, then `settings["github_token"]` (PAT) — order matters.

### Settings key for GitHub repo name

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

### OAuth message contract

Worker posts: `{ type: "CODELEDGER_AUTH", provider: "github", token: "..." }`
Extension listens for exactly `data.type === "CODELEDGER_AUTH"`.

## Architecture

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

### Common updates:

- New endpoint → add `paths:/{endpoint}` section with correct method, parameters, responses, and security
- Parameter change → update `parameters:` array and validate code matches
- Response schema change → update `responses:` with correct example and description
- Auth change → update `components: securitySchemes:` and endpoint security arrays

### Validation:

After modifying `docs/OPENAPI.yaml`, run:

```bash
node dev/validate-openapi.js
```

If this check fails, code reviews should catch it.

---

## Common Patterns

### Background → library page message

```js
// From extension page:
chrome.runtime.sendMessage({ type: "MY_TYPE", ...payload }, (response) => {
    if (chrome.runtime.lastError) {
        /* handle */
    }
    // use response
});
// In service-worker.js listener, MUST return true for async:
return true;
```

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

## File Naming Conventions

- Platform handlers: `src/handlers/platforms/{name}/index.js`
- AI handlers: `src/handlers/ai/{name}/index.js`
- Git handlers: `src/handlers/git/{name}/index.js`
- Selectors: `dom-selectors.js` alongside each platform handler
- Page detection: `page-detector.js` alongside each platform handler

## Versioning & Release

Version is maintained in two canonical places that **must always match**:
- `src/manifest.json` → `"version"` field
- `package.json` → `"version"` field

**Source of truth:** `package.json`. The release pipeline validates they match.

### Release workflow

1. Update `docs/CHANGELOG.md` — add a `## [x.y.z] — YYYY-MM-DD` section above the previous release.
2. Bump version in both `src/manifest.json` AND `package.json` to the new version.
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

