/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Application-wide constants and configuration values.
 *
 * Guidelines:
 * - Change values here for different deployment environments (dev/stage/prod).
 * - Keep provider metadata (AI_PROVIDERS) authoritative for model discovery and UI hints.
 * - Storage keys (SK) are used with the Storage abstraction and should be stable.
 *
 * Possible value notes:
 * - `URLS.AUTH_WORKER`: should point to your Cloudflare Worker or backend used for OAuth and server-side operations.
 *   Examples: https://api.codeledger.example.com (production), http://localhost:8787 (local dev)
 * - `AI_PROVIDERS` entries:
 *   - `id`: unique provider id used throughout the codebase.
 *   - `endpoint`: base API URL for the provider (no trailing slash preferred).
 *   - `modelsEndpoint`: optional explicit models/listing endpoint (recommended when different from `${endpoint}/models`).
 *   - `defaultModel`: a sensible default model name for prompt/initial selection.
 *   - `supportsLiveFetch`: whether the provider supports listing models from the client (true) or requires server-side handling (false).
 *   - `keyRequired`: whether an API key is required in order to use this provider.
 *
 * - `AI_DEFAULT_PRIMARY`: provider id used as the preferred primary provider.
 * - `AI_FALLBACK_CHAIN`: ordered provider ids to try when the primary is unavailable.
 */

import { createDebugger } from "../lib/debug.js";

export const FEATURE_STATUS = Object.freeze({
  STABLE: "stable",
  BETA: "beta",
  ALPHA: "alpha",
  UNDER_CONSTRUCTION: "underConstruction",
});

export const FEATURE_STATUS_META = Object.freeze({
  [FEATURE_STATUS.STABLE]: {
    label: "Stable",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  },
  [FEATURE_STATUS.ALPHA]: {
    label: "Alpha",
    className: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/25",
  },
  [FEATURE_STATUS.BETA]: {
    label: "Beta",
    className: "bg-sky-500/15 text-sky-300 border-sky-500/25",
  },
  [FEATURE_STATUS.UNDER_CONSTRUCTION]: {
    label: "Under Construction",
    className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
});

/**
 * The running extension's version, read from the manifest so it cannot drift
 * from what was actually packaged. Falls back to the literal only outside an
 * extension context, where there is no manifest to read.
 */
function readVersion() {
  try {
    const rt = globalThis.chrome?.runtime ?? globalThis.browser?.runtime;
    return rt?.getManifest?.()?.version || "1.0.0";
  } catch {
    return "1.0.0";
  }
}

export const CONSTANTS = Object.freeze({
  VERSION: readVersion(),
  EXTENSION_NAME: "CodeLedger",
  DEBUG_DEFAULT: false,
  DEBUG_OVERRIDE: null, // null = use stored setting; true/false = force override (dev use)
  // Extension store IDs
  EXTENSION_ID_CHROME: "dpalidbhndcbppmjgmbloffehbhfchmb",
  EXTENSION_ID_FIREFOX: "code-ledger",
  // Precomputed store links (append the extension id to the store URL if empty)
  EXTENSION_STORE_URLS: {
    chrome: "https://chromewebstore.google.com/detail/codeledger/dpalidbhndcbppmjgmbloffehbhfchmb",
    edge: "https://microsoftedge.microsoft.com/addons/detail/codeledger/",
    firefox: "https://addons.mozilla.org/en-US/firefox/addon/code-ledger/",
    github: "https://github.com/Life-Experimentalist/Code-Ledger",
    github_releases: "https://github.com/Life-Experimentalist/Code-Ledger/releases/latest",
  },

  // ── External URLs ──
  URLS: {
    LANDING: "https://codeledger.vkrishna04.me",
    AUTH_WORKER: "https://codeledger.vkrishna04.me/api",
    TELEMETRY: "https://counter.vkrishna04.me",
    // Primary: served from the worker (CDN-cached, versioned)
    CANONICAL_MAP: "https://codeledger.vkrishna04.me/api/data/canonical-map.json",
    // Fallback: raw GitHub (used only when primary 4xx/5xx)
    CANONICAL_MAP_RAW:
      "https://raw.githubusercontent.com/Life-Experimentalist/Code-Ledger/refs/heads/main/src/data/canonical-map.json",
    CANONICAL_MAP_SCHEMA:
      "https://raw.githubusercontent.com/Life-Experimentalist/Code-Ledger/main/data/schema/canonical-map.schema.json",
    GITHUB_OAUTH_BASE: "https://github.com/login/oauth",
    GITLAB_OAUTH_BASE: "https://gitlab.com/oauth",
    BITBUCKET_OAUTH_BASE: "https://bitbucket.org/site/oauth2",
  },

  // ── AI Providers ──
  AI_PROVIDERS: {
    gemini: {
      id: "gemini",
      name: "Google Gemini",
      endpoint: "https://generativelanguage.googleapis.com/v1beta",
      modelsEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",
      defaultModel: "gemini-2.0-flash",
      supportsLiveFetch: true,
      keyRequired: true,
    },
    openai: {
      id: "openai",
      name: "OpenAI",
      endpoint: "https://api.openai.com/v1",
      modelsEndpoint: "https://api.openai.com/v1/models",
      defaultModel: "gpt-4o-mini",
      supportsLiveFetch: true,
      keyRequired: true,
    },
    claude: {
      id: "claude",
      name: "Anthropic Claude",
      endpoint: "https://api.anthropic.com/v1",
      modelsEndpoint: "https://api.anthropic.com/v1/models",
      defaultModel: "claude-haiku-4-5-20251001",
      supportsLiveFetch: true,
      keyRequired: true,
    },
    deepseek: {
      id: "deepseek",
      name: "DeepSeek",
      endpoint: "https://api.deepseek.com/v1",
      modelsEndpoint: null,
      staticModels: ["deepseek-chat", "deepseek-reasoner"],
      defaultModel: "deepseek-chat",
      supportsLiveFetch: false,
      keyRequired: true,
    },
    ollama: {
      id: "ollama",
      name: "Ollama (local)",
      endpoint: "http://localhost:11434/api",
      modelsEndpoint: "http://localhost:11434/api/tags",
      defaultModel: "llama3.2",
      supportsLiveFetch: true,
      keyRequired: false,
    },
    openrouter: {
      id: "openrouter",
      name: "OpenRouter",
      endpoint: "https://openrouter.ai/api/v1",
      modelsEndpoint: "https://openrouter.ai/api/v1/models",
      defaultModel: "meta-llama/llama-3.1-8b-instruct:free",
      supportsLiveFetch: true,
      keyRequired: true,
    },
  },

  AI_DEFAULT_PRIMARY: "gemini",
  AI_FALLBACK_CHAIN: ["openai", "ollama", "claude", "deepseek"],

  FEATURE_STATUS,
  FEATURE_STATUS_META,

  // ── Git Providers ──
  GIT_PROVIDERS: {
    github: {
      id: "github",
      name: "GitHub",
      status: FEATURE_STATUS.STABLE,
      apiBase: "https://api.github.com",
      oauthBase: "https://github.com/login/oauth",
      clientId: "",
    },
    gitlab: {
      id: "gitlab",
      name: "GitLab",
      status: FEATURE_STATUS.UNDER_CONSTRUCTION,
      apiBase: "https://gitlab.com/api/v4",
      oauthBase: "https://gitlab.com/oauth",
      clientId: "",
    },
    bitbucket: {
      id: "bitbucket",
      name: "Bitbucket",
      status: FEATURE_STATUS.UNDER_CONSTRUCTION,
      apiBase: "https://api.bitbucket.org/2.0",
      oauthBase: "https://bitbucket.org/site/oauth2",
      clientId: "",
    },
  },

  // ── Platforms ──
  //
  // Each entry carries URL constants so every file that needs to build a
  // link can import CONSTANTS instead of hard-coding the domain.
  //
  // Naming:
  //   baseUrl         — scheme + host, no trailing slash
  //   problemsBase    — prefix for individual problem pages; append slug + "/"
  //   problemsetUrl   — public listing / problemset page
  //   graphqlUrl      — GraphQL endpoint (platform-specific; undefined if absent)
  //   apiBase         — REST API base (platform-specific; undefined if absent)
  PLATFORMS: {
    leetcode: {
      id: "leetcode",
      name: "LeetCode",
      color: "#FFA116",
      domains: ["leetcode.com"],
      baseUrl: "https://leetcode.com",
      problemsBase: "https://leetcode.com/problems/",
      problemsetUrl: "https://leetcode.com/problemset/",
      submissionsBase: "https://leetcode.com/problems/", // append slug + "/submissions/"
      graphqlUrl: "https://leetcode.com/graphql/",
      // REST API — append "/problems/all/" or "/submissions/" etc.
      apiBase: "https://leetcode.com/api",
    },
    geeksforgeeks: {
      id: "geeksforgeeks",
      name: "GeeksForGeeks",
      color: "#2F8D46",
      // Keep all three variants in sync with dom-selectors.js DOMAINS
      domains: ["geeksforgeeks.org", "practice.geeksforgeeks.org", "www.geeksforgeeks.org"],
      baseUrl: "https://www.geeksforgeeks.org",
      problemsBase: "https://www.geeksforgeeks.org/problems/",
      practiceBase: "https://www.geeksforgeeks.org/problems/",
      status: FEATURE_STATUS.STABLE,
    },
    codeforces: {
      id: "codeforces",
      name: "Codeforces",
      color: "#1F8ACB",
      domains: ["codeforces.com"],
      baseUrl: "https://codeforces.com",
      problemsBase: "https://codeforces.com/problemset/problem/",
      problemsetUrl: "https://codeforces.com/problemset/",
      apiBase: "https://codeforces.com/api",
      contestsBase: "https://codeforces.com/contest/",
      status: FEATURE_STATUS.ALPHA,
    },
  },

  PLATFORM_CODE: {
    leetcode: "lc",
    geeksforgeeks: "gfg",
    codeforces: "cf",
  },

  CANONICAL_VOTES_REQUIRED: 5,
  CANONICAL_AI_CONFIDENCE_AUTO: 0.9,
  CANONICAL_AI_CONFIDENCE_REVIEW: 0.7,
  CANONICAL_CACHE_TTL_MS: 86_400_000,

  KEY_POOL_RETRY_AFTER_MS: 60_000,

  DEFAULT_REPO_NAME: "CodeLedger-Sync",
  REPO_BRANCH: "main",
  COMMIT_MESSAGE_TEMPLATE: "[{topic}] {title} — {difficulty} | {language}",
  IMPORT_COMMIT_MESSAGE: "chore: import {count} solutions from {platform} profile",
  INDEX_JSON_PATH: "index.json",
  PROBLEMS_DIR_DEFAULT: "problems",
  COMMIT_TYPE: {
    SOLVE: "solve",
    MAINTENANCE: "maintenance",
    IMPORT: "import",
  },

  HEARTBEAT_PORT_NAME: "heartbeat",
  HEARTBEAT_INTERVAL_MS: 20_000,

  // Duplicate-detection modal timings — change here to affect all dedup UI.
  DEDUP: {
    SAME_CODE_COUNTDOWN_S: 10, // seconds before auto-keeping the better version
    ADVANCE_DELAY_MS: 1000, // ms to pause on "✓ resolved" before advancing
  },

  // Storage keys used with `Storage` helper. Values are the keys stored inside browser storage.
  // Naming convention: short, dot-separated, stable across releases.
  SK: {
    SETTINGS: "settings",
    DEBUG: "codeledger.debug",
    AUTH_TOKENS: "auth.tokens",
    AI_KEYS: "ai.keys",
    AI_KEY_INDICES: "ai.key.indices",
    AI_ENDPOINT_OVERRIDES: "ai.endpoint.overrides",
    // Must match the settingKey the Advanced panel writes; a differing value
    // here reads as authoritative and silently disconnects the toggle.
    TELEMETRY_OPT_IN: "telemetryOptIn",
    INCOGNITO_MODE: "incognito.mode",
    DISABLED_PLATFORMS: "platforms.disabled",
    CANONICAL_MAP_CACHE: "canonical.map.cache",
    CANONICAL_MAP_ETAG: "canonical.map.etag",
    CANONICAL_LOCAL_ENTRIES: "canonical.local.entries",
    AI_PROMPTS: "ai.prompts",
    SYNC_STATE: "sync.state",
    THEME: "ui.theme",
    BEHAVIOR_BANK: "cl-behavior-bank",
    ROADMAPS: "cl-roadmaps",
    ROLLING_BACKUPS: "cl-rolling-backups",
    // Optional per-user difficulty mapping for non-standard difficulty labels.
    // Stored shape: { "extra hard": "Hard", "school": "Easy" }
    DIFFICULTY_MAP: "difficulty.map",
  },

  IDB_NAME: "codeledger",
  IDB_VERSION: 1,
  IDB_STORES: {
    PROBLEMS: "problems",
    REVIEWS: "reviews",
    GRAPH_CACHE: "graph_cache",
  },

  TEL: {
    INSTALL: "codeledger-install",
    UPDATE: "codeledger-update",
    SOLVE: "codeledger-solve",
    AI_REVIEW: "codeledger-ai-review",
    COMMIT: "codeledger-commit",
    IMPORT: "codeledger-import",
    OPT_IN: "codeledger-opt-in",
    OPT_OUT: "codeledger-opt-out",
  },

  LIBRARY_SIDEBAR_PARAM: "sidebar",
  LIBRARY_PANEL_PARAM: "panel",
  SYNC_ALARM_PERIOD_MIN: 30,
  ALARM_NAMES: {
    DAILY_REMINDER: "reminder.daily",
    STREAK_CHECK: "reminder.streak",
    SYNC: "sync.periodic",
  },

  PORTFOLIO_DSA_SECTION_ID: "dsa-stats",
  PORTFOLIO_INDEX_JSON_FIELD: "dsaIndexUrl",

  /** Returns the platform-scoped unique id, e.g. "lc-two-sum". */
  makeProblemId(platform, titleSlug) {
    const code = this.PLATFORM_CODE[platform] || platform.slice(0, 3).toLowerCase();
    return `${code}-${titleSlug}`;
  },

  /**
   * Build the canonical public URL for a problem page.
   * Falls back to "#" for unknown platforms.
   *
   * @param {string} platform   "leetcode" | "geeksforgeeks" | "codeforces"
   * @param {string} titleSlug  URL-safe problem slug
   * @returns {string}
   */
  makeProblemUrl(platform, titleSlug) {
    if (!titleSlug) return "#";
    const p = this.PLATFORMS[platform];
    if (!p?.problemsBase) return "#";
    if (platform === "geeksforgeeks") {
      return p.problemsBase + titleSlug + "/1";
    }
    return p.problemsBase + titleSlug + "/";
  },

  // ── Snail Mode Configuration (passive background dedup processing) ──────────
  SNAIL_MODE: {
    // Process N items per batch (configurable in settings)
    BATCH_SIZE: 3,
    // Wait M hours between batches (configurable in settings)
    BATCH_INTERVAL_MS: 1 * 60 * 60 * 1000,
    // Storage key for snail mode state
    STORAGE_KEY: "snailMode:state",
    // Track consecutive AI errors before pausing
    ERROR_THRESHOLD: 3,
    // Max error batches before auto-pause
    MAX_RETRIES_BEFORE_PAUSE: 2,
    // Duration to pause after hitting error threshold (2 hours)
    PAUSE_DURATION_MS: 1.5 * 60 * 60 * 1000,
  },

  // ── Canonical Topics List ──
  CANONICAL_DSA_TOPICS: [
    "Dynamic Programming",
    "Greedy",
    "Recursion",
    "Backtracking",
    "Divide and Conquer",
    "Bit Manipulation",
    "Math",
    "Two Pointers",
    "Sliding Window",
    "Binary Search",
    "Sorting",
    "Depth-First Search",
    "Breadth-First Search",
    "Array",
    "String",
    "Hash Table",
    "Linked List",
    "Stack",
    "Queue",
    "Heap (Priority Queue)",
    "Tree",
    "Binary Search Tree",
    "Trie",
    "Graph",
    "Union Find",
    "Segment Tree",
    "Binary Indexed Tree",
  ],

  // ── Language Display Name Normalization Map ──
  LANG_NORM_MAP: {
    python: "Python",
    py: "Python",
    python2: "Python2",
    py2: "Python2",
    python3: "Python3",
    py3: "Python3",
    cpp: "C++",
    "c++": "C++",
    c: "C",
    java: "Java",
    javascript: "JavaScript",
    js: "JavaScript",
    typescript: "TypeScript",
    ts: "TypeScript",
    ruby: "Ruby",
    golang: "Go",
    go: "Go",
    swift: "Swift",
    kotlin: "Kotlin",
    scala: "Scala",
    rust: "Rust",
    php: "PHP",
    csharp: "C#",
    "c#": "C#",
    dart: "Dart",
    racket: "Racket",
    erlang: "Erlang",
    elixir: "Elixir",
    mysql: "MySQL",
    postgresql: "PostgreSQL",
    bash: "Bash",
  },
});

