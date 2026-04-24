# CodeLedger — AI Studio Generation Prompt v2
# Paste into Google AI Studio with Gemini 2.5 Pro, 1M token context window.
# Generate one top-level directory at a time if context is tight.

---

## PRIME DIRECTIVE

Generate the **complete, production-ready, fully implemented codebase** for **CodeLedger**.

Every single file must be 100% implemented. No stubs. No `// TODO`. No placeholder functions.
Real working code throughout. Every import must resolve. Every function must have a body.

**Reference project by the same author:** https://github.com/Life-Experimentalist/RanobeGemini
Study its patterns for: extension detection from landing page, CFlair-Counter telemetry, multi-provider AI, OAuth redirect, no-bundler pure JS build, DOM handler registration, manifest domain generation scripts. Mirror those exact patterns in CodeLedger wherever applicable.

**Author's portfolio:** https://github.com/VKrishna04/VKrishna04.github.io
React + Vite + Tailwind, driven entirely by a `settings.json` in the repo. Dynamically pulls from GitHub at runtime. CodeLedger must provide a portfolio integration that reads the DSA repo's `index.json` via the GitHub API and can be wired into this portfolio's `settings.json` as a data source entry.

---

## PROJECT IDENTITY

| Field | Value |
|---|---|
| Name | CodeLedger |
| Tagline | Your DSA journey, committed. |
| License | Apache 2.0 |
| Author | VKrishna04 |
| Domain | `codeledger.vkrishna04.me` |
| Auth worker | `https://api.codeledger.vkrishna04.me` |
| Telemetry | `https://counter.vkrishna04.me` (CFlair-Counter, deployed) |
| Canonical map | `https://raw.githubusercontent.com/vkrishna04/codeledger/main/data/canonical-map.json` |

---

## TECHNOLOGY STACK — STRICT RULES

### UI: Preact + htm (no build step required)
All UI is component-based using **Preact** loaded from CDN (`https://esm.sh/preact`) and **htm** for tagged template literals. No JSX, no transpilation, no webpack. Pure ES6 modules that work directly in the browser.

```js
// Every UI file starts with:
import { h, render, Component } from 'https://esm.sh/preact';
import { useState, useEffect, useCallback, useRef } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
const html = htm.bind(h);
```

Components are exported as named functions. Props are typed via JSDoc. Every component is in its own file. Shared components are imported across popup, sidebar, library, and web app — same files, same import paths.

### Charts: Chart.js (CDN, loaded in library/analytics pages only)
```js
import Chart from 'https://esm.sh/chart.js/auto';
```

### Graph: vis.js (CDN, loaded in library graph view only)
```js
// Via script tag in HTML, not ES module import:
// <script src="https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/vis.min.js"></script>
```

### Browser compatibility: NO webextension-polyfill library
Instead, use a **self-contained compatibility shim** (`src/lib/browser-compat.js`) that normalises `browser` vs `chrome` namespace at runtime:

```js
// src/lib/browser-compat.js
// This file is the ONLY place that touches chrome.* or browser.* directly.
// Everything else in the codebase imports from this file.
export const ext = (typeof browser !== 'undefined' && browser.runtime)
  ? browser
  : chrome;

// Promisify callback-based chrome APIs for Firefox compatibility
export const storage = {
  local: {
    get: (keys) => new Promise((resolve, reject) => {
      ext.storage.local.get(keys, (result) => {
        if (ext.runtime.lastError) reject(ext.runtime.lastError);
        else resolve(result);
      });
    }),
    set: (items) => new Promise((resolve, reject) => {
      ext.storage.local.set(items, () => {
        if (ext.runtime.lastError) reject(ext.runtime.lastError);
        else resolve();
      });
    }),
    remove: (keys) => new Promise((resolve, reject) => {
      ext.storage.local.remove(keys, () => {
        if (ext.runtime.lastError) reject(ext.runtime.lastError);
        else resolve();
      });
    }),
  },
  session: { /* same pattern */ },
};
export const runtime = ext.runtime;
export const tabs = ext.tabs;
export const alarms = ext.alarms;
export const action = ext.action || ext.browserAction; // MV3 vs MV2 compat
export const sidePanel = ext.sidePanel;    // Chrome only — guard with if(sidePanel)
export const sidebar = ext.sidebarAction; // Firefox only — guard with if(sidebar)
```

Every file imports from `../../lib/browser-compat.js`. Never `chrome.*` or `browser.*` directly anywhere else.

### No bundler, no transpiler, no minification
Pure ES6+ modules. `type="module"` on all script tags. The extension ships as readable source for AMO review compliance.

---

## CENTRALIZED DEBUG SYSTEM — `src/lib/debug.js`

This is critical. The debug system must preserve caller file+line context in console output. The RanobeGemini problem (logs all showing `debug.js:504`) is caused by wrapping `console.log` in a function — the call stack collapses. Fix this with the `Error` stack trick:

```js
// src/lib/debug.js

const DEBUG_KEY = 'codeledger.debug';

// Read debug state synchronously from storage (best-effort; defaults false)
let _debugEnabled = false;

// Called once at extension startup from service-worker.js
export async function initDebug() {
  try {
    const { [DEBUG_KEY]: val } = await import('./browser-compat.js')
      .then(m => m.storage.local.get(DEBUG_KEY));
    _debugEnabled = val === true;
  } catch (_) {
    _debugEnabled = false;
  }
}

export function setDebug(enabled) {
  _debugEnabled = enabled;
}

export function isDebugEnabled() {
  return _debugEnabled;
}

// THE KEY INSIGHT: instead of wrapping console.log (which loses caller context),
// we conditionally assign the console methods themselves.
// When debug is off, these are no-ops. When on, they ARE the real console methods,
// so DevTools shows the correct caller file and line number.

function noop() {}

// Returns a debug object whose methods show correct caller context.
// Usage: const dbg = createDebugger('LeetCodeHandler');
// dbg.log('detected submission') → shows "[CodeLedger:LeetCodeHandler] detected submission"
//                                    at leetcode/index.js:42  ← correct file+line
export function createDebugger(namespace) {
  const prefix = `[CodeLedger:${namespace}]`;

  // Build a bound console method with prefix already applied.
  // bind() preserves the native call stack frame so DevTools shows the CALLER, not this file.
  const makeMethod = (method) => {
    if (!_debugEnabled) return noop;
    // console.log.bind(console, prefix) creates a function that, when called,
    // invokes console.log with `prefix` prepended — but the stack frame shown
    // is the CALLER of the returned function, not this file. This is the fix.
    return console[method].bind(console, prefix);
  };

  // Return a proxy-like object that re-evaluates _debugEnabled on each call.
  // This means toggling debug at runtime takes effect immediately.
  return {
    get log()   { return _debugEnabled ? console.log.bind(console, prefix)   : noop; },
    get warn()  { return _debugEnabled ? console.warn.bind(console, prefix)  : noop; },
    get error() { return _debugEnabled ? console.error.bind(console, prefix) : noop; },
    get info()  { return _debugEnabled ? console.info.bind(console, prefix)  : noop; },
    get table() { return _debugEnabled ? console.table.bind(console, prefix) : noop; },
    get group() { return _debugEnabled ? console.group.bind(console, prefix) : noop; },
    get groupEnd() { return _debugEnabled ? console.groupEnd.bind(console)   : noop; },
  };
}

// Convenience: module-level debugger for core files
export const coreDebug = createDebugger('Core');
```

**Usage pattern in every file:**
```js
// src/handlers/platforms/leetcode/index.js
import { createDebugger } from '../../../lib/debug.js';
const dbg = createDebugger('LeetCodeHandler');

// In code:
dbg.log('Submission detected', { problemSlug, language }); // Shows at leetcode/index.js:XX
dbg.warn('Selector stale, trying legacy fallback');
dbg.error('GraphQL fetch failed', err);
```

The Settings page has a **Debug Mode toggle** that calls `setDebug(true/false)` and saves to storage. When toggled on, all `dbg.*` calls immediately start logging with correct file+line context in DevTools.

---

## COMPLETE REPOSITORY LAYOUT

```
codeledger/
├── .github/
│   ├── workflows/
│   │   ├── canonical-map-validator.yml
│   │   ├── release.yml
│   │   └── deploy-worker.yml
│   └── ISSUE_TEMPLATE/
│       ├── canonical-mapping.yml
│       ├── bug-report.yml
│       └── handler-request.yml
├── src/                              # extension source — pure ES6, no build
│   ├── manifest.json
│   ├── lib/
│   │   ├── browser-compat.js         # THE ONLY chrome.*/browser.* file
│   │   └── debug.js                  # centralized debug system (see above)
│   ├── core/
│   │   ├── constants.js              # ALL configuration (see §CONSTANTS)
│   │   ├── event-bus.js              # typed pub/sub event bus
│   │   ├── handler-registry.js       # plugin registration
│   │   ├── canonical-mapper.js       # problem identity resolution
│   │   ├── problem-graph.js          # vis.js graph data builder
│   │   ├── storage.js                # unified storage abstraction using browser-compat
│   │   ├── crypto.js                 # token encryption via crypto.subtle
│   │   ├── api-key-pool.js           # round-robin keys + fallback chain
│   │   └── telemetry.js              # CFlair-Counter integration
│   ├── background/
│   │   ├── service-worker.js         # SW: registry, event bus, heartbeat listener
│   │   ├── git-engine.js             # atomic Git Tree API commits
│   │   ├── sync-engine.js            # cross-browser sync via index.json
│   │   └── alarm-manager.js          # chrome.alarms wrapper for reminders
│   ├── content/
│   │   ├── handler-loader.js         # matches URL → dynamically imports handler
│   │   ├── heartbeat.js              # SW keepalive via runtime.connect port
│   │   └── presence-marker.js        # injects #codeledger-present on landing page
│   ├── handlers/
│   │   ├── _base/
│   │   │   ├── BasePlatformHandler.js
│   │   │   ├── BaseGitHandler.js
│   │   │   └── BaseAIHandler.js
│   │   ├── platforms/
│   │   │   ├── leetcode/
│   │   │   │   ├── index.js          # LeetCode: GraphQL + MutationObserver
│   │   │   │   ├── graphql-queries.js
│   │   │   │   ├── page-detector.js  # classifies: problems|contest|explore|other
│   │   │   │   ├── dom-selectors.js  # versioned selectors + legacy fallbacks
│   │   │   │   └── qol.js            # copy-code, timer, success banner
│   │   │   ├── geeksforgeeks/
│   │   │   │   ├── index.js
│   │   │   │   ├── page-detector.js
│   │   │   │   ├── dom-selectors.js
│   │   │   │   └── qol.js
│   │   │   └── codeforces/
│   │   │       ├── index.js          # Codeforces: public REST API
│   │   │       ├── api-client.js
│   │   │       ├── page-detector.js
│   │   │       ├── dom-selectors.js
│   │   │       └── qol.js
│   │   ├── git/
│   │   │   ├── github/
│   │   │   │   ├── index.js
│   │   │   │   └── api-client.js
│   │   │   ├── gitlab/
│   │   │   │   ├── index.js
│   │   │   │   └── api-client.js
│   │   │   └── bitbucket/
│   │   │       ├── index.js
│   │   │       └── api-client.js
│   │   └── ai/
│   │       ├── gemini/
│   │       │   ├── index.js
│   │       │   └── model-fetcher.js  # live fetches available models from Gemini API
│   │       ├── openai/
│   │       │   ├── index.js
│   │       │   └── model-fetcher.js  # fetches /v1/models — works for any OAI-compatible
│   │       ├── claude/
│   │       │   ├── index.js
│   │       │   └── model-fetcher.js
│   │       ├── deepseek/
│   │       │   └── index.js          # deepseek models are static; no live fetch needed
│   │       └── ollama/
│   │           ├── index.js
│   │           └── model-fetcher.js  # fetches from localhost:11434/api/tags
│   ├── ui/
│   │   ├── components/               # Preact + htm components, shared across all pages
│   │   │   ├── ProblemCard.js
│   │   │   ├── StatsRing.js          # topic completion donut (Chart.js)
│   │   │   ├── HeatMap.js            # GitHub-style contribution grid
│   │   │   ├── GraphView.js          # vis.js wrapper
│   │   │   ├── AIReviewPanel.js
│   │   │   ├── HandlerStatus.js
│   │   │   ├── ProviderBadge.js
│   │   │   ├── TelemetryPrompt.js    # one-time opt-in modal
│   │   │   ├── ModelSelector.js      # dynamic model picker (calls model-fetcher)
│   │   │   ├── IncognitoBanner.js    # shown when incognito mode is active
│   │   │   └── SettingsSchema.js     # schema-driven settings renderer
│   │   └── styles/
│   │       ├── base.css              # CSS custom properties, dark/light/system themes
│   │       ├── components.css        # shared component styles
│   │       └── animations.css        # smooth transitions, reduced-motion aware
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js                  # Preact root for popup
│   │   └── popup.css
│   ├── sidebar/
│   │   ├── sidebar.html
│   │   ├── sidebar.js
│   │   └── sidebar.css
│   ├── library/
│   │   ├── library.html              # shared by extension + web app
│   │   ├── library.js                # Preact root; detects extension vs web app mode
│   │   ├── library.css
│   │   └── views/
│   │       ├── ProblemsView.js       # filterable, sortable problem table
│   │       ├── GraphView.js          # vis.js knowledge graph
│   │       ├── AnalyticsView.js      # full analytics dashboard
│   │       └── SettingsView.js       # settings hub, schema-driven
│   └── icons/
│       ├── icon-16.png
│       ├── icon-32.png
│       ├── icon-48.png
│       ├── icon-128.png
│       └── icon-incognito-48.png
├── worker/                           # Cloudflare Worker — OAuth + landing page
│   ├── src/
│   │   └── index.js                  # Hono: /auth/*, static landing serve
│   ├── public/                       # Static landing page assets served by worker
│   │   ├── index.html
│   │   ├── library.html              # web app (uses same src/library/ components)
│   │   ├── auth/
│   │   │   └── callback.html
│   │   └── assets/
│   │       ├── landing.css
│   │       ├── landing.js            # extension detection
│   │       └── manifest.webmanifest  # PWA manifest
│   ├── wrangler.toml
│   └── package.json
├── data/
│   ├── canonical-map.json            # 150+ entries (Blind 75 + NeetCode 150)
│   └── schema/
│       ├── canonical-map.schema.json
│       ├── index.schema.json
│       └── meta.schema.json
├── dev/
│   ├── generate-manifest-domains.js  # handler domains → manifest.json (RanobeGemini pattern)
│   ├── build-canonical-map.js        # validates canonical-map.json against schema
│   ├── package-chrome.js             # zip src/ for CWS
│   ├── package-firefox.js            # zip src/ for AMO
│   └── import-profile/
│       ├── README.md                 # how to use the import scripts
│       ├── leetcode-importer.js      # automated profile import for LeetCode
│       └── gfg-importer.js          # automated profile import for GFG
├── docs/
│   ├── ARCHITECTURE.md               # 7 Mermaid diagrams
│   ├── ADDING_PLATFORM_HANDLER.md
│   ├── ADDING_GIT_HANDLER.md
│   ├── ADDING_AI_HANDLER.md
│   ├── CANONICAL_MAP.md
│   ├── SCRAPING_SYSTEM.md
│   ├── DEBUG_SYSTEM.md
│   ├── PORTFOLIO_INTEGRATION.md      # how to wire into VKrishna04.github.io
│   ├── SECURITY.md
│   └── OPENAPI.yaml
├── .env.example
├── .gitignore
├── .editorconfig
├── .eslintrc.json
├── .prettierrc
├── package.json
├── LICENSE
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
└── README.md
```

---

## §CONSTANTS — `src/core/constants.js`

Generate completely. This is the single source of truth for every URL, key, threshold, and config. Users can override endpoint URLs in Settings — the Settings page reads from this file as defaults and stores overrides in `chrome.storage.local`. On startup, constants are merged with user overrides.

```js
// src/core/constants.js
export const CONSTANTS = Object.freeze({

  VERSION: '1.0.0',
  EXTENSION_NAME: 'CodeLedger',
  DEBUG_DEFAULT: false,

  // Extension store IDs (fill after publishing)
  EXTENSION_ID_CHROME: '',
  EXTENSION_ID_FIREFOX: '',

  // ── External URLs (all user-overridable via Settings > Advanced) ──
  URLS: {
    LANDING:            'https://codeledger.vkrishna04.me',
    AUTH_WORKER:        'https://api.codeledger.vkrishna04.me',
    TELEMETRY:          'https://counter.vkrishna04.me',
    CANONICAL_MAP_RAW:  'https://raw.githubusercontent.com/vkrishna04/codeledger/main/data/canonical-map.json',
    CANONICAL_MAP_SCHEMA: 'https://raw.githubusercontent.com/vkrishna04/codeledger/main/data/schema/canonical-map.schema.json',
    GITHUB_OAUTH_BASE:  'https://github.com/login/oauth',
    GITLAB_OAUTH_BASE:  'https://gitlab.com/oauth',
    BITBUCKET_OAUTH_BASE: 'https://bitbucket.org/site/oauth2',
  },

  // ── AI Providers (endpoint user-overridable for self-hosted/proxies) ──
  AI_PROVIDERS: {
    gemini: {
      id: 'gemini',
      name: 'Google Gemini',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta',
      modelsEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
      defaultModel: 'gemini-2.0-flash',
      supportsLiveFetch: true,    // can fetch available models at runtime
      keyRequired: true,
    },
    openai: {
      id: 'openai',
      name: 'OpenAI',
      endpoint: 'https://api.openai.com/v1',
      modelsEndpoint: 'https://api.openai.com/v1/models',
      defaultModel: 'gpt-4o-mini',
      supportsLiveFetch: true,    // GET /v1/models works for any OAI-compatible
      keyRequired: true,
    },
    claude: {
      id: 'claude',
      name: 'Anthropic Claude',
      endpoint: 'https://api.anthropic.com/v1',
      modelsEndpoint: 'https://api.anthropic.com/v1/models',
      defaultModel: 'claude-haiku-4-5-20251001',
      supportsLiveFetch: true,
      keyRequired: true,
    },
    deepseek: {
      id: 'deepseek',
      name: 'DeepSeek',
      endpoint: 'https://api.deepseek.com/v1',
      modelsEndpoint: null,       // no models endpoint; use static list
      staticModels: ['deepseek-chat', 'deepseek-reasoner'],
      defaultModel: 'deepseek-chat',
      supportsLiveFetch: false,
      keyRequired: true,
    },
    ollama: {
      id: 'ollama',
      name: 'Ollama (local)',
      endpoint: 'http://localhost:11434/api',
      modelsEndpoint: 'http://localhost:11434/api/tags',
      defaultModel: 'llama3.2',
      supportsLiveFetch: true,    // fetches installed models from local Ollama
      keyRequired: false,
    },
  },

  // Primary AI → fallback chain. User-configurable in Settings.
  AI_DEFAULT_PRIMARY: 'gemini',
  AI_FALLBACK_CHAIN: ['ollama'],  // tried in order if primary fails

  // ── Git Providers ──
  GIT_PROVIDERS: {
    github: {
      id: 'github',
      name: 'GitHub',
      apiBase: 'https://api.github.com',
      oauthBase: 'https://github.com/login/oauth',
      clientId: '',  // injected at build time via .env; safe to store here (public)
    },
    gitlab: {
      id: 'gitlab',
      name: 'GitLab',
      apiBase: 'https://gitlab.com/api/v4',
      oauthBase: 'https://gitlab.com/oauth',
      clientId: '',
    },
    bitbucket: {
      id: 'bitbucket',
      name: 'Bitbucket',
      apiBase: 'https://api.bitbucket.org/2.0',
      oauthBase: 'https://bitbucket.org/site/oauth2',
      clientId: '',
    },
  },

  // ── Platforms ──
  PLATFORMS: {
    leetcode:      { id: 'leetcode',      name: 'LeetCode',      color: '#FFA116', domains: ['leetcode.com'] },
    geeksforgeeks: { id: 'geeksforgeeks', name: 'GeeksForGeeks', color: '#2F8D46', domains: ['geeksforgeeks.org', 'practice.geeksforgeeks.org'] },
    codeforces:    { id: 'codeforces',    name: 'Codeforces',    color: '#1F8ACB', domains: ['codeforces.com'] },
  },

  // ── Canonical map ──
  CANONICAL_VOTES_REQUIRED: 5,
  CANONICAL_AI_CONFIDENCE_AUTO: 0.90,
  CANONICAL_AI_CONFIDENCE_REVIEW: 0.70,
  CANONICAL_CACHE_TTL_MS: 86_400_000,

  // ── API Key Pool ──
  KEY_POOL_RETRY_AFTER_MS: 60_000,

  // ── Git repo ──
  DEFAULT_REPO_NAME: 'dsa-solutions',
  REPO_BRANCH: 'main',
  COMMIT_MESSAGE_TEMPLATE: '[{topic}] {title} — {difficulty} | {language}',
  IMPORT_COMMIT_MESSAGE: 'chore: import {count} solutions from {platform} profile',
  INDEX_JSON_PATH: 'index.json',

  // ── Heartbeat ──
  HEARTBEAT_PORT_NAME: 'heartbeat',
  HEARTBEAT_INTERVAL_MS: 20_000,

  // ── Storage keys ──
  SK: {
    SETTINGS:           'settings',
    DEBUG:              'codeledger.debug',
    AUTH_TOKENS:        'auth.tokens',
    AI_KEYS:            'ai.keys',
    AI_KEY_INDICES:     'ai.key.indices',
    AI_ENDPOINT_OVERRIDES: 'ai.endpoint.overrides',
    TELEMETRY_OPT_IN:   'telemetry.optIn',
    INCOGNITO_MODE:     'incognito.mode',
    DISABLED_PLATFORMS: 'platforms.disabled',
    CANONICAL_MAP_CACHE:'canonical.map.cache',
    CANONICAL_MAP_ETAG: 'canonical.map.etag',
    AI_PROMPTS:         'ai.prompts',
    SYNC_STATE:         'sync.state',
    THEME:              'ui.theme',
  },

  // ── IndexedDB ──
  IDB_NAME: 'codeledger',
  IDB_VERSION: 1,
  IDB_STORES: { PROBLEMS: 'problems', REVIEWS: 'reviews', GRAPH_CACHE: 'graph_cache' },

  // ── Telemetry events ──
  TEL: {
    INSTALL:    'codeledger-install',
    UPDATE:     'codeledger-update',
    SOLVE:      'codeledger-solve',
    AI_REVIEW:  'codeledger-ai-review',
    COMMIT:     'codeledger-commit',
    IMPORT:     'codeledger-import',
    OPT_IN:     'codeledger-opt-in',
    OPT_OUT:    'codeledger-opt-out',
  },

  // ── UI ──
  LIBRARY_SIDEBAR_PARAM: 'sidebar',
  LIBRARY_PANEL_PARAM: 'panel',
  SYNC_ALARM_PERIOD_MIN: 30,
  ALARM_NAMES: {
    DAILY_REMINDER: 'reminder.daily',
    STREAK_CHECK:   'reminder.streak',
    SYNC:           'sync.periodic',
  },

  // ── Portfolio integration ──
  PORTFOLIO_DSA_SECTION_ID: 'dsa-stats', // ID in portfolio settings.json
  PORTFOLIO_INDEX_JSON_FIELD: 'dsaIndexUrl', // field name in portfolio settings
});
```

---

## §DYNAMIC AI MODEL SYSTEM

This is a core requirement. Models must be fetched live from each provider's API — never hardcoded lists. The `ModelSelector` component shows a loading state, fetches models, and lets the user pick.

### `src/handlers/ai/gemini/model-fetcher.js`

```js
import { createDebugger } from '../../../lib/debug.js';
const dbg = createDebugger('GeminiModelFetcher');

// Fetches all available Gemini models that support generateContent.
// Result is cached in memory for the session.
let _cache = null;

export async function fetchGeminiModels(apiKey) {
  if (_cache) return _cache;
  dbg.log('Fetching Gemini models from API');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    { headers: { 'Content-Type': 'application/json' } }
  );
  if (!res.ok) throw new Error(`Gemini models fetch failed: ${res.status}`);

  const { models } = await res.json();

  // Filter to only models that support text generation
  const textModels = (models || [])
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => ({
      id: m.name.replace('models/', ''),  // e.g. "gemini-2.0-flash"
      displayName: m.displayName,
      description: m.description,
      inputTokenLimit: m.inputTokenLimit,
      outputTokenLimit: m.outputTokenLimit,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  dbg.log(`Found ${textModels.length} Gemini models`);
  _cache = textModels;
  return textModels;
}

export function clearModelCache() { _cache = null; }
```

### `src/handlers/ai/openai/model-fetcher.js`

```js
// Works for OpenAI AND any OpenAI-compatible endpoint (Groq, Together, etc.)
export async function fetchOpenAIModels(apiKey, endpoint = 'https://api.openai.com/v1') {
  const res = await fetch(`${endpoint}/models`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenAI models fetch failed: ${res.status}`);
  const { data } = await res.json();
  return (data || [])
    .filter(m => m.id.includes('gpt') || m.id.includes('chat'))
    .map(m => ({ id: m.id, displayName: m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
```

### `src/handlers/ai/ollama/model-fetcher.js`

```js
// Fetches locally installed Ollama models
export async function fetchOllamaModels(endpoint = 'http://localhost:11434') {
  try {
    const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const { models } = await res.json();
    return (models || []).map(m => ({
      id: m.name,
      displayName: m.name,
      size: m.size,
      modifiedAt: m.modified_at,
    }));
  } catch (_) {
    return []; // Ollama not running — return empty list, not error
  }
}
```

### `src/ui/components/ModelSelector.js`

```js
import { h } from 'https://esm.sh/preact';
import { useState, useEffect } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
const html = htm.bind(h);

/**
 * @param {{ providerId: string, apiKey: string, selectedModel: string,
 *           onSelect: (modelId: string) => void, endpoint?: string }} props
 */
export function ModelSelector({ providerId, apiKey, selectedModel, onSelect, endpoint }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!providerId) return;
    if (providerId !== 'ollama' && !apiKey) return;

    setLoading(true);
    setError(null);

    loadModels(providerId, apiKey, endpoint)
      .then(setModels)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [providerId, apiKey, endpoint]);

  if (loading) return html`<span class="model-selector-loading">Loading models…</span>`;
  if (error)   return html`<span class="model-selector-error">⚠ ${error}</span>`;
  if (!models.length) return html`<span class="model-selector-empty">No models found</span>`;

  return html`
    <select
      class="model-selector"
      value=${selectedModel}
      onChange=${e => onSelect(e.target.value)}
    >
      ${models.map(m => html`
        <option key=${m.id} value=${m.id} selected=${m.id === selectedModel}>
          ${m.displayName || m.id}
        </option>
      `)}
    </select>
  `;
}

async function loadModels(providerId, apiKey, endpoint) {
  switch (providerId) {
    case 'gemini': {
      const { fetchGeminiModels } = await import('../../handlers/ai/gemini/model-fetcher.js');
      return fetchGeminiModels(apiKey);
    }
    case 'openai': {
      const { fetchOpenAIModels } = await import('../../handlers/ai/openai/model-fetcher.js');
      return fetchOpenAIModels(apiKey, endpoint);
    }
    case 'claude': {
      const { fetchClaudeModels } = await import('../../handlers/ai/claude/model-fetcher.js');
      return fetchClaudeModels(apiKey);
    }
    case 'ollama': {
      const { fetchOllamaModels } = await import('../../handlers/ai/ollama/model-fetcher.js');
      return fetchOllamaModels(endpoint);
    }
    case 'deepseek': {
      const { CONSTANTS } = await import('../../core/constants.js');
      return CONSTANTS.AI_PROVIDERS.deepseek.staticModels.map(id => ({ id, displayName: id }));
    }
    default: return [];
  }
}
```

---

## §PAGE DETECTOR SYSTEM

Every platform handler must export a `PageDetector` that identifies what kind of page the user is on. This is critical — the extension must only activate tracking on problem/submission pages, not on explore/contest/home pages.

### `src/handlers/platforms/leetcode/page-detector.js`

```js
import { createDebugger } from '../../../lib/debug.js';
const dbg = createDebugger('LeetCodePageDetector');

export const PAGE_TYPES = {
  PROBLEM:     'problem',      // /problems/{slug}/
  SUBMISSION:  'submission',   // /submissions/detail/{id}/
  CONTEST:     'contest',      // /contest/
  EXPLORE:     'explore',      // /explore/
  DISCUSS:     'discuss',      // /discuss/
  PROFILE:     'profile',      // /u/{username}/  or /{username}/
  HOME:        'home',         // leetcode.com/
  UNKNOWN:     'unknown',
};

/**
 * Determines what kind of LeetCode page we're on.
 * @param {string} pathname - window.location.pathname
 * @returns {{ type: string, slug?: string, submissionId?: string }}
 */
export function detectPage(pathname) {
  const clean = pathname.replace(/\/$/, ''); // strip trailing slash

  // /problems/{slug} or /problems/{slug}/description or /problems/{slug}/submissions
  const problemMatch = clean.match(/^\/problems\/([^/]+)/);
  if (problemMatch) {
    const slug = problemMatch[1];
    const isSubmissionTab = clean.includes('/submissions');
    dbg.log(`Problem page detected: ${slug}`, { isSubmissionTab });
    return { type: PAGE_TYPES.PROBLEM, slug };
  }

  // /submissions/detail/{id}/
  const submissionMatch = clean.match(/^\/submissions\/detail\/(\d+)/);
  if (submissionMatch) {
    return { type: PAGE_TYPES.SUBMISSION, submissionId: submissionMatch[1] };
  }

  if (clean.startsWith('/contest'))   return { type: PAGE_TYPES.CONTEST };
  if (clean.startsWith('/explore'))   return { type: PAGE_TYPES.EXPLORE };
  if (clean.startsWith('/discuss'))   return { type: PAGE_TYPES.DISCUSS };
  if (clean === '' || clean === '/') return { type: PAGE_TYPES.HOME };

  // Profile: /u/{username} or /{username}
  const profileMatch = clean.match(/^\/(u\/)?([^/]+)\/?$/);
  if (profileMatch) return { type: PAGE_TYPES.PROFILE, username: profileMatch[2] };

  return { type: PAGE_TYPES.UNKNOWN };
}

/**
 * Returns true only if this page can trigger a solve detection.
 */
export function isSolveCapablePage(pathname) {
  const { type } = detectPage(pathname);
  return type === PAGE_TYPES.PROBLEM || type === PAGE_TYPES.SUBMISSION;
}
```

Generate equivalent `page-detector.js` for GFG and Codeforces with their own URL patterns.

---

## §PROFILE IMPORT SYSTEM — `dev/import-profile/`

This is a **standalone Node.js script** (not part of the extension) that a user runs once to bulk-import their existing solved solutions. It uses Puppeteer to automate the browser.

### `dev/import-profile/leetcode-importer.js`

The importer:
1. Opens LeetCode in a Puppeteer browser (the user logs in manually or via saved cookies)
2. Fetches the user's full submission list via the GraphQL endpoint
3. For each accepted submission (deduplicated per problem — takes the latest per language):
   - Navigates to the problem page
   - Fetches problem metadata (title, difficulty, tags) via GraphQL
   - Fetches the solution code via GraphQL submissionDetail query
4. Builds the full file structure locally (topics/{topic}/{problem}/{lang}.{ext})
5. Creates `meta.json` and updates `index.json` locally
6. Makes **ONE single atomic commit** via the GitHub API Tree endpoint with ALL files
7. Commit message: `chore: import {count} solutions from LeetCode profile`

```js
// dev/import-profile/leetcode-importer.js
// Usage: node leetcode-importer.js --github-token=TOKEN --repo=owner/repo --cookie=SESSION_COOKIE
// Or: node leetcode-importer.js --github-token=TOKEN --repo=owner/repo  (will open browser for login)

import puppeteer from 'puppeteer';
import { Octokit } from 'octokit';
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONSTANTS } from '../../src/core/constants.js';

// [Full implementation: GraphQL queries, tree building, atomic commit]
// The script must:
// 1. Authenticate with LeetCode (cookie or Puppeteer login flow)
// 2. Call graphql to get all submissions: submissionList(limit:9999, offset:0)
// 3. Deduplicate: per (slug, lang) pair, keep most recent accepted
// 4. Enrich each with problem metadata: question(titleSlug:) for tags/difficulty
// 5. Map each problem to canonicalId using the canonical-map.json
// 6. Build full directory structure in memory (Map<filePath, content>)
// 7. Single atomic GitHub commit via Tree API
// 8. Print summary: X problems imported, Y languages, Z topics
```

Generate this file completely with real Puppeteer and Octokit code.

Also generate `dev/import-profile/gfg-importer.js` with equivalent logic for GeeksForGeeks.

Both importers must handle the case where the user has already imported some problems (skip duplicates by checking if `filePath` already exists in the repo).

---

## §VERSIONED SCRAPING SYSTEM

Every `dom-selectors.js` must follow this exact pattern. This is the contract for maintainability.

```js
// src/handlers/platforms/geeksforgeeks/dom-selectors.js

export const SELECTORS = {
  version: '2025-04-24',
  lastVerified: '2025-04-24',

  // Page classification selectors
  page: {
    isProblemPage: '.problems-header, .problem-statement-container',
    isEditorPage: '#editor, .ace_editor',
  },

  // Problem metadata extraction
  problem: {
    title:       '.problems-header h3, .problem-title h3',
    difficulty:  '.difficulty-block .difficulty-tag, .problems-header .tag-item:first-child',
    tags:        '.tags-section .tag-item, .topic-tag',
    description: '.problem-statement, .problem-description',
    platformId:  null, // extracted from URL
  },

  // Submission success detection
  submission: {
    // The element that appears ONLY on successful submission
    successIndicator: '.problems-submission-result.accepted, .success-container.accepted, [class*="accepted"][class*="submission"]',
    code:     '.ace_content .ace_text-layer, #editor .CodeMirror-code',
    language: '.language-dropdown .selected-option, select[name="language"]',
    runtime:  '.result-table tr:nth-child(2) td:last-child',
    memory:   '.result-table tr:nth-child(3) td:last-child',
  },

  // QoL augmentation targets
  qol: {
    editorContainer:  '#editor, .ace_editor',
    editorToolbar:    '.editor-toolbar, .editor-header',
    submitButton:     '.problems-submit-btn, button[type="submit"]',
    resultContainer:  '.result-container, .submission-result',
  },
};

// Legacy fallbacks for each key — tried in order when primary fails
export const LEGACY_SELECTORS = {
  'problem.title':                ['.problem-title', '.question-title', 'h1.header-title'],
  'submission.successIndicator':  ['.accepted-banner', '#result-accepted', '.submission-success'],
  'submission.code':              ['.CodeMirror-code', '.ace_text-layer', '#code-editor pre'],
};

// Domain list for manifest.json generation (dev/generate-manifest-domains.js reads this)
export const DOMAINS = ['geeksforgeeks.org', 'practice.geeksforgeeks.org', 'www.geeksforgeeks.org'];
```

The `BasePlatformHandler.safeQuery(key, scope)` uses the `LEGACY_SELECTORS` map automatically when the primary selector fails.

---

## §ANALYTICS DASHBOARD — `src/library/views/AnalyticsView.js`

Full analytics using Chart.js. All charts must be Preact components. Implement all of these:

### Charts to implement:

1. **Activity Heatmap** (`HeatMap.js` component)
   - GitHub-style 52-week grid, one cell per day
   - Color intensity = problems solved that day
   - Hover tooltip: date + count
   - Shows streak below: "Current streak: 7 days | Longest: 23 days"

2. **Topic Mastery Radar** (Chart.js `radar`)
   - Axes: each topic (DP, Graphs, Trees, etc.)
   - Value: (solved/total) × 100 for that topic
   - Overlay: easy/medium/hard stacked

3. **Difficulty Donut** (Chart.js `doughnut`)
   - Easy / Medium / Hard solved counts
   - Center label: total solved

4. **Platform Distribution** (Chart.js `bar`)
   - Horizontal bars, one per platform
   - Color-coded by platform brand color

5. **Language Distribution** (Chart.js `pie`)
   - Languages used across all solutions

6. **Solve Velocity** (Chart.js `line`)
   - Problems solved per week over time
   - 12-week rolling average line overlay

7. **Topic Progress Grid**
   - Card grid, one card per topic
   - Shows: Easy/Medium/Hard counts + progress bar
   - Click → filters ProblemsView to that topic

8. **Unsolved Next** widget
   - Graph-based: "Based on what you've solved, try these next"
   - Shows 3–5 unsolved problems adjacent to solved ones in the graph

All charts respond to dark/light theme changes via `prefers-color-scheme` media query and Chart.js `color` plugin.

---

## §SETTINGS SYSTEM — Schema-Driven

Every handler registers its settings schema on startup. The SettingsView renders them automatically.

### Schema format:

```js
// How a handler registers settings:
registry.registerSettings('leetcode', {
  section: 'Platforms',
  label: 'LeetCode',
  icon: '🟠',
  order: 10,
  fields: [
    { key: 'enabled',         type: 'toggle', label: 'Enable tracking',        default: true },
    { key: 'autoReview',      type: 'toggle', label: 'Auto AI review on solve', default: false },
    { key: 'copyCodeButton',  type: 'toggle', label: 'Copy-code button',        default: true },
    { key: 'showTimer',       type: 'toggle', label: 'Show solve timer',        default: true },
    { key: 'graphqlEndpoint', type: 'url',    label: 'GraphQL endpoint (advanced)',
      default: 'https://leetcode.com/graphql',
      description: 'Override if you use a proxy. Default: official endpoint.' },
  ],
});

// AI handler registers:
registry.registerSettings('ai-gemini', {
  section: 'AI Providers',
  label: 'Google Gemini',
  icon: '✨',
  order: 20,
  fields: [
    { key: 'keys',        type: 'key-list', label: 'API Keys (round-robin)',
      description: 'Add multiple keys for automatic rotation.' },
    { key: 'model',       type: 'model-picker', label: 'Model',
      providerRef: 'gemini',   // used by ModelSelector component
      default: 'gemini-2.0-flash' },
    { key: 'endpoint',    type: 'url',  label: 'API Endpoint',
      default: 'https://generativelanguage.googleapis.com/v1beta' },
    { key: 'enabled',     type: 'toggle', label: 'Enable', default: true },
    { key: 'isPrimary',   type: 'radio', label: 'Set as primary', group: 'ai-primary' },
  ],
});
```

The `SettingsSchema.js` component renders `type: 'key-list'` as an add/remove list of password fields. It renders `type: 'model-picker'` by instantiating the `ModelSelector` component with the stored API key for that provider. It renders `type: 'url'` as a text input with validation and a "Reset to default" button.

**General Settings section** (always present, not from handlers):

```
- Theme: [System / Light / Dark]
- Debug Mode: [toggle] — when on, shows file+line logs in DevTools
- Incognito Mode: [Off / This session / Always]
- Telemetry: [On / Off] with explanation
- AI Prompt: [textarea for user suffix] + [Reset to default] button
- Advanced: URL overrides for all external endpoints (from CONSTANTS.URLS)
- Danger Zone: [Clear all local data] [Reset all settings]
```

---

## §CROSS-BROWSER COMPATIBILITY — No External Polyfill

The `src/lib/browser-compat.js` file handles everything. Additional compatibility notes:

**Firefox sidebar vs Chrome Side Panel:**
```js
// In service-worker.js:
import { ext, sidebar, sidePanel } from '../lib/browser-compat.js';

// Firefox uses sidebarAction, Chrome uses sidePanel
const hasSidebar = typeof sidebar !== 'undefined' && sidebar;
const hasSidePanel = typeof sidePanel !== 'undefined' && sidePanel;

// Open library in appropriate sidebar:
export async function openSidebar() {
  if (hasSidebar) {
    // Firefox
    await sidebar.open();
  } else if (hasSidePanel) {
    // Chrome 114+
    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    await sidePanel.open({ tabId: tab.id });
  } else {
    // Fallback: open as popup window
    await ext.windows.create({
      url: ext.runtime.getURL('library/library.html?sidebar=true'),
      type: 'popup', width: 400, height: 700,
    });
  }
}
```

**Firefox manifest extras** (generate-manifest-domains.js handles this):
The manifest must include `browser_specific_settings.gecko` for Firefox and `side_panel` for Chrome. Generate a single `manifest.json` that works on both.

---

## §PORTFOLIO INTEGRATION — `docs/PORTFOLIO_INTEGRATION.md` + `src/core/portfolio-bridge.js`

CodeLedger exports a read-only data bridge for the portfolio.

### `src/core/portfolio-bridge.js`

```js
// Exposes DSA stats for the portfolio to consume via postMessage or direct API read.
// The portfolio at VKrishna04.github.io reads the DSA repo's index.json from GitHub API.

export async function getDSAStatsForPortfolio(githubToken, repoOwner, repoName) {
  const raw = await fetch(
    `https://api.github.com/repos/${repoOwner}/${repoName}/contents/index.json`,
    { headers: { 'Authorization': `Bearer ${githubToken}`, 'Accept': 'application/vnd.github.raw' } }
  );
  const index = await raw.json();

  return {
    totalSolved: index.stats.total,
    byDifficulty: { easy: index.stats.easy, medium: index.stats.medium, hard: index.stats.hard },
    byTopic: index.stats.byTopic,
    languages: extractLanguages(index.problems),
    recentSolves: index.problems.slice(-5).reverse(),
    longestStreak: calculateStreak(index.problems),
    repoUrl: `https://github.com/${repoOwner}/${repoName}`,
  };
}
```

### Portfolio `settings.json` integration snippet (document in `docs/PORTFOLIO_INTEGRATION.md`):

```json
{
  "integrations": {
    "codeledger": {
      "enabled": true,
      "dsaRepoOwner": "vkrishna04",
      "dsaRepoName": "dsa-solutions",
      "statsDisplaySection": "skills",
      "showInHero": true,
      "badgeStyle": "flat-square"
    }
  }
}
```

The portfolio (React+Vite) reads this config and calls the GitHub API directly to fetch `index.json` from the DSA repo. The CodeLedger integration provides the exact schema of `index.json` so the portfolio knows what fields to expect.

Generate `docs/PORTFOLIO_INTEGRATION.md` with:
- Complete setup guide
- Example `settings.json` snippet
- The `index.json` schema reference
- A React hook example: `useDSAStats(config)` that the portfolio can use
- Screenshot placeholders with descriptions of what the integration looks like

---

## §WEB APP (`worker/public/library.html`)

The web app is the full Library page accessible at `https://codeledger.vkrishna04.me/library`. It is NOT a static page — it is a fully functional app that:

1. Authenticates via GitHub OAuth (same worker flow)
2. Reads the user's DSA repo `index.json` via GitHub API
3. Renders the same Preact components as the extension's library
4. Is installable as a PWA (add to homescreen)
5. Detects if the extension is installed and shows "Open in Extension" button
6. Allows the user to navigate to any problem's solution file on GitHub

The web app shares components by importing from relative paths. It uses ES modules with `importmap` in the HTML head to resolve shared paths:

```html
<script type="importmap">
{
  "imports": {
    "preact":        "https://esm.sh/preact",
    "preact/hooks":  "https://esm.sh/preact/hooks",
    "htm":           "https://esm.sh/htm",
    "chart.js/auto": "https://esm.sh/chart.js/auto"
  }
}
</script>
```

The library page auto-detects its context:
```js
// src/library/library.js
const IS_EXTENSION = typeof chrome !== 'undefined' && chrome.runtime?.id;
const IS_WEB_APP = !IS_EXTENSION;

// In extension mode: reads from IndexedDB + git sync
// In web app mode: reads from GitHub API via stored OAuth token
```

---

## §README — Complete Production README

Generate with:

### Header badges:
```markdown
[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Firefox](https://img.shields.io/badge/Firefox-supported-red?style=flat-square&logo=firefox)](https://addons.mozilla.org/en-US/firefox/addon/codeledger/)
[![Chrome](https://img.shields.io/badge/Chrome-supported-green?style=flat-square&logo=googlechrome)](https://chrome.google.com/webstore/detail/codeledger/)
[![Platforms](https://img.shields.io/badge/platforms-3%2B-teal?style=flat-square)](docs/ADDING_PLATFORM_HANDLER.md)
[![Views](https://counter.vkrishna04.me/api/views/codeledger/badge?style=flat-square&color=blueviolet&label=views)](https://counter.vkrishna04.me)
[![Installs](https://counter.vkrishna04.me/api/views/codeledger-install/badge?style=flat-square&color=purple&label=installs)](https://counter.vkrishna04.me)
```

### STAR section (exact format, prominent placement):
```markdown
## Why CodeLedger exists

**Situation:** DSA practice is scattered across 5+ platforms. Solutions get lost.
Progress is invisible to recruiters. There's no single view of what you've built.

**Task:** Unify all platforms into one developer-owned, Git-backed record of
every DSA problem ever solved — searchable, graphable, AI-reviewable, and
automatically visible on your GitHub contribution graph.

**Action:** A plugin-based MV3 browser extension where the core has zero
website-specific logic. Each platform is a self-contained handler. Every solve
triggers a single atomic Git commit via the Tree API. Cross-browser sync uses
the repo's own index.json as the source of truth — like MALSync but for DSA.
Community-voted canonical mappings (SponsorBlock model) unify the same
problem across platforms. AI review with round-robin key pools and fallback
provider chains. Knowledge graph built from your solved problems.

**Result:** One repo. Every problem. Every language. Visible on your GitHub
profile. Owned entirely by you. Shareable on your portfolio. No servers.
```

### Architecture Mermaid diagrams (all 7 — generate fully):

1. System overview flowchart
2. Plugin registration sequence diagram
3. OAuth flow sequence diagram (showing Worker role)
4. Git atomic commit sequence diagram
5. Canonical map community voting pipeline
6. Cross-browser sync state diagram
7. AI key pool fallback chain flowchart

---

## §DOCUMENTATION — `docs/ARCHITECTURE.md`

Generate all 7 Mermaid diagrams completely. They must be syntactically valid Mermaid.

Also include in `docs/DEBUG_SYSTEM.md`:
- Explanation of the `console.bind()` trick that preserves caller context
- How to enable debug mode (Settings toggle, or `chrome.storage.local.set({'codeledger.debug': true})` in DevTools)
- How to create a debugger in a new file
- Why NOT to use `console.log` directly anywhere except `debug.js`

---

## §GITHUB ACTIONS

### `.github/workflows/canonical-map-validator.yml`

Triggered when an issue has label `canonical-mapping` and has ≥ 5 `+1` comments from distinct accounts (excluding bots and accounts created after the issue). Uses Gemini API to validate. Full implementation using GitHub Actions, `@actions/github`, and `@google/generative-ai`.

### `.github/workflows/release.yml`

Triggered on `git tag v*`. Runs:
1. `node dev/generate-manifest-domains.js`
2. `node dev/package-chrome.js` → `releases/codeledger-chrome-vX.X.X.zip`
3. `node dev/package-firefox.js` → `releases/codeledger-firefox-vX.X.X.zip`
4. Creates GitHub Release with both zips attached
5. Publishes to AMO using `web-ext sign`
6. Publishes to CWS using CWS API

### `.github/workflows/deploy-worker.yml`

Triggered on push to `main` affecting `worker/**`. Uses `CLOUDFLARE_API_TOKEN` secret. Deploys both the auth worker and the landing page worker.

---

## §INITIAL CANONICAL MAP — `data/canonical-map.json`

Generate **all 150 entries** from the NeetCode 150 list. For each entry provide:
- `canonicalId` (slug form)
- `canonicalTitle`
- `topic` (from NeetCode categories: arrays, two-pointers, sliding-window, stack, binary-search, linked-list, trees, tries, heap, backtracking, graphs, dynamic-programming, greedy, intervals, math, bit-manipulation)
- `difficulty`
- `pattern` (e.g., `dp-linear`, `bfs`, `sliding-window-variable`, etc.)
- `tags` (array)
- `aliases` with real platform slugs for LeetCode and GFG where known equivalents exist

Use the actual NeetCode 150 problem list with real LeetCode slugs (e.g., `two-sum`, `best-time-to-buy-and-sell-stock`, etc.).

---

## §SECURITY

1. `src/lib/browser-compat.js` is the ONLY file that uses `chrome.*` or `browser.*`. Everything else imports the compat layer.
2. Tokens are encrypted via `src/core/crypto.js` using AES-GCM with `crypto.subtle`. Never stored as plaintext.
3. `innerHTML` is NEVER used. DOM manipulation uses `createElement`, `setAttribute`, `textContent` exclusively.
4. Content scripts never make AI API calls (CSP violation). All AI calls happen in the service worker or library page.
5. The Cloudflare Worker holds `GITHUB_CLIENT_SECRET` etc. as env vars. NEVER in source.
6. `.env.example` documents all variables with descriptions. No actual secrets.

---

## §BUILD SYSTEM

### `dev/generate-manifest-domains.js`

Reads every `dom-selectors.js` `DOMAINS` export from handlers. Writes `host_permissions` and `content_scripts` matches into `manifest.json`. Also generates Firefox-specific `browser_specific_settings.gecko.strict_min_version` entry. Same pattern as RanobeGemini's domain generator.

### `package.json` scripts:

```json
{
  "scripts": {
    "update-domains":   "node dev/generate-manifest-domains.js",
    "build:chrome":     "npm run update-domains && node dev/package-chrome.js",
    "build:firefox":    "npm run update-domains && node dev/package-firefox.js",
    "build":            "npm run build:chrome && npm run build:firefox",
    "deploy:worker":    "cd worker && wrangler deploy",
    "deploy:landing":   "cd worker && wrangler pages deploy public",
    "validate:map":     "node dev/build-canonical-map.js",
    "import:leetcode":  "node dev/import-profile/leetcode-importer.js",
    "import:gfg":       "node dev/import-profile/gfg-importer.js",
    "lint":             "eslint src/ --ext .js"
  },
  "devDependencies": {
    "puppeteer": "^22.0.0",
    "octokit":   "^4.0.0",
    "eslint":    "^9.0.0",
    "web-ext":   "^8.0.0"
  }
}
```

---

## GENERATION ORDER

Generate files in this order. Complete each directory before moving to the next.

1. `src/lib/` — browser-compat.js and debug.js (these are imported by everything)
2. `src/core/` — constants.js, then all other core files
3. `src/handlers/_base/` — base classes
4. `src/handlers/platforms/leetcode/` — complete, all 5 files
5. `src/handlers/platforms/geeksforgeeks/` — complete
6. `src/handlers/platforms/codeforces/` — complete
7. `src/handlers/ai/` — all 5 providers with model fetchers
8. `src/handlers/git/` — all 3 providers
9. `src/background/` — all 4 files
10. `src/content/` — all 3 files
11. `src/ui/components/` — all 11 components
12. `src/ui/styles/` — all 3 CSS files
13. `src/popup/` — html + js + css
14. `src/sidebar/` — html + js + css
15. `src/library/` — html + js + css + all 4 views
16. `src/manifest.json`
17. `worker/` — complete
18. `data/` — canonical-map.json (150 entries) + all schemas
19. `dev/` — all scripts including import tools
20. `.github/` — all workflows and templates
21. `docs/` — all documentation with complete Mermaid diagrams
22. Root config files — package.json, .env.example, .eslintrc.json, .gitignore, etc.
23. `README.md` — complete with all diagrams and STAR section

---

## CRITICAL CONSTRAINTS — READ BEFORE GENERATING

- Every file is 100% implemented. Zero stubs.
- Use `src/lib/browser-compat.js` for all extension API calls. Never `chrome.*` directly.
- Use `src/lib/debug.js` `createDebugger()` in every file. Never `console.log` directly.
- All UI uses Preact + htm loaded from `https://esm.sh`. No build step.
- Models are fetched live from provider APIs. Never hardcode model lists (except DeepSeek which has a static list).
- The `ModelSelector` component is used everywhere a model is picked.
- Page detectors must correctly identify problem pages vs other pages for every platform.
- Import scripts create ONE atomic commit for the entire profile, not one per problem.
- Portfolio integration documents exactly how `VKrishna04.github.io/src/settings.json` should reference the DSA repo.
- Apache 2.0 license header on every file.
- The `data/canonical-map.json` must contain all 150 NeetCode 150 problems with real slugs.

*End of prompt. Begin generation.*
