# GitHub Copilot Instructions — CodeLedger

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
└── ui/components/       ← shared Preact components (SettingsSchema, HeatMap, etc.)
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

