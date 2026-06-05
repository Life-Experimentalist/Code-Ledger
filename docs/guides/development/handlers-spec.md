# Handler Specification — CodeLedger

This document summarizes the handler contracts, registration API, and implementation notes so contributors can implement new platform, AI, or git handlers.

Overview

- Handlers live under `src/handlers/` and are grouped into `platforms`, `ai`, and `git`.
- Each handler type extends one of the base classes in `src/handlers/_base/`:
  - `BasePlatformHandler` — platform-specific page integrations (LeetCode, GFG, Codeforces).
  - `BaseAIHandler` — AI providers (Gemini, OpenAI, Claude, etc.).
  - `BaseGitHandler` — Git providers (GitHub, GitLab, Bitbucket).

Registration

- Handlers are instantiated and registered from `src/handlers/init.js` by calling the `registry` methods:
  - `registry.registerPlatform(id, handler)`
  - `registry.registerGitProvider(id, handler)`
  - `registry.registerAIProvider(id, handler)`
- If a handler exposes `getSettingsSchema()`, `init.js` will call `registry.registerSettings(id, schema)` to include the handler settings in the Settings UI.

Base Classes & Required Methods

1. BasePlatformHandler (`src/handlers/_base/BasePlatformHandler.js`)

- Constructor signature: `constructor(id, name, config)`
- Common helpers provided:
  - `safeQuery(selectors, scope)` — robust selector lookup with fallbacks.
  - `extractText(selector, scope)` — get trimmed text content.
  - `getDefaultPrompt()` — return a default AI review prompt (optional).
- Required overrides (throw by default):
  - `async detectSubmission()` — detect an accepted submission on the page; return an object describing the problem or falsy if none.
  - `async getSolutionCode()` — return the code string (and optionally `files` array) to commit.

2. BaseGitHandler (`src/handlers/_base/BaseGitHandler.js`)

- Constructor: `constructor(id, name)`
- Required overrides:
  - `async authenticate()` — ensure the handler can authenticate (OAuth, PAT, etc.).
  - `async commit(files, message)` — perform commit; `files` is [{path, content}].
  - `async getFile(path)` — read a repo file (used by sync/preview).

3. BaseAIHandler (`src/handlers/_base/BaseAIHandler.js`)

- Constructor: `constructor(id, name)`
- Key methods to implement:
  - `async review(code, problemContext)` — analyze code and return AI review string/object.
  - Optionally override `supportsMCPTools`, `mcpToolFormat`, and `getSupportedMCPTools()` to enable tools.

Data Shape — Problem Object

- The service-worker and handlers expect a canonical `problem` shape when emitting `problem:solved` events. Recommended shape:

```
{
  title: string,
  titleSlug: string,
  platform: string, // leetcode|geeksforgeeks|codeforces
  difficulty: "Easy"|"Medium"|"Hard",
  lang: { name: string, ext: string, slug?: string },
  tags: string[],
  topic: string,
  timestamp: number, // Unix ms
  code: string,
  files: [{ path: string, content: string }],
  aiReview: string,
  runtime: string,
  memory: string,
  elapsedSeconds: number
}
```

File Layout Expectations

- Platform handlers directory should include:
  - `index.js` — main handler class (required)
  - `dom-selectors.js` — `SELECTORS`, `LEGACY_SELECTORS`, `DOMAINS` exports
  - `page-detector.js` — exports `detectPage()` and `isSolveCapablePage()`
  - Optional: `enhanced-selectors.js`, `qol.js`, `graphql-queries.js`

Page Detector Contract

- `detectPage()` should return contextual data about the page (e.g., problem id, title, submission status) and should not throw. `isSolveCapablePage()` returns boolean.

Registration Example (Platform)

```js
import { BasePlatformHandler } from "../_base/BasePlatformHandler.js";

export class ExamplePlatformHandler extends BasePlatformHandler {
  constructor() {
    super("example", "Example", {});
  }

  async detectSubmission() {
    // return { title, titleSlug, lang, difficulty, files } or null
  }

  async getSolutionCode() {
    // return code string or files array
  }

  getDefaultPrompt() {
    return "Review this solution for correctness and style: {code}";
  }
}
```

Registration Tip

- Add your handler to `src/handlers/init.js` so it is discovered and registered at runtime. Use `registry.registerPlatform()` for platforms.

Testing & Diagnostics

- Use `node dev/diagnose.js` to run handler-linking diagnostics and basic smoke checks.
- The extension includes `dev/import-profile/*` scripts that can be used as integration examples.

Best Practices

- Keep `dom-selectors.js` minimal and provide `LEGACY_SELECTORS` for older site variants.
- Avoid long-running work in `detectSubmission()` — keep it fast and idempotent.
- When committing files, provide a deterministic `path` (e.g., `topics/{topic}/{titleSlug}/{lang}.{ext}`) and include a consistent `index.json` metadata file.

Further reading

- See `src/handlers/platforms/leetcode/index.js` for a complete real-world example.
