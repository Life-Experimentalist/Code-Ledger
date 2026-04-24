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

export const CONSTANTS = Object.freeze({
  VERSION: "1.0.0",
  EXTENSION_NAME: "CodeLedger",
  DEBUG_DEFAULT: false,

  // Extension store IDs
  EXTENSION_ID_CHROME: "",
  EXTENSION_ID_FIREFOX: "",
  // Precomputed store links (append the extension id to the store URL if empty)
  EXTENSION_STORE_URLS: {
    chrome: "https://chrome.google.com/webstore/detail/",
    edge: "https://microsoftedge.microsoft.com/addons/detail/",
    firefox: "https://addons.mozilla.org/firefox/addon/",
    github: "https://github.com/Life-Experimentalist/Code-Ledger",
    github_releases:
      "https://github.com/Life-Experimentalist/Code-Ledger/releases/latest",
  },

  // ── External URLs ──
  URLS: {
    LANDING: "https://codeledger.vkrishna04.me",
    AUTH_WORKER: "https://api.codeledger.vkrishna04.me",
    TELEMETRY: "https://counter.vkrishna04.me",
    CANONICAL_MAP_RAW:
      "https://raw.githubusercontent.com/vkrishna04/codeledger/main/data/canonical-map.json",
    CANONICAL_MAP_SCHEMA:
      "https://raw.githubusercontent.com/vkrishna04/codeledger/main/data/schema/canonical-map.schema.json",
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
      defaultModel: "gemini-3-flash-preview",
      supportsLiveFetch: true,
      keyRequired: true,
    },
    openai: {
      id: "openai",
      name: "OpenAI",
      endpoint: "https://api.openai.com/v1",
      modelsEndpoint: "https://api.openai.com/v1/models",
      defaultModel: "gpt-5-mini",
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
  },

  AI_DEFAULT_PRIMARY: "gemini",
  AI_FALLBACK_CHAIN: ["openai", "ollama", "claude", "deepseek"],

  // ── Git Providers ──
  GIT_PROVIDERS: {
    github: {
      id: "github",
      name: "GitHub",
      apiBase: "https://api.github.com",
      oauthBase: "https://github.com/login/oauth",
      clientId: "",
    },
    gitlab: {
      id: "gitlab",
      name: "GitLab",
      apiBase: "https://gitlab.com/api/v4",
      oauthBase: "https://gitlab.com/oauth",
      clientId: "",
    },
    bitbucket: {
      id: "bitbucket",
      name: "Bitbucket",
      apiBase: "https://api.bitbucket.org/2.0",
      oauthBase: "https://bitbucket.org/site/oauth2",
      clientId: "",
    },
  },

  // ── Platforms ──
  PLATFORMS: {
    leetcode: {
      id: "leetcode",
      name: "LeetCode",
      color: "#FFA116",
      domains: ["leetcode.com"],
    },
    geeksforgeeks: {
      id: "geeksforgeeks",
      name: "GeeksForGeeks",
      color: "#2F8D46",
      domains: ["geeksforgeeks.org", "practice.geeksforgeeks.org"],
    },
    codeforces: {
      id: "codeforces",
      name: "Codeforces",
      color: "#1F8ACB",
      domains: ["codeforces.com"],
    },
  },

  CANONICAL_VOTES_REQUIRED: 5,
  CANONICAL_AI_CONFIDENCE_AUTO: 0.9,
  CANONICAL_AI_CONFIDENCE_REVIEW: 0.7,
  CANONICAL_CACHE_TTL_MS: 86_400_000,

  KEY_POOL_RETRY_AFTER_MS: 60_000,

  DEFAULT_REPO_NAME: "dsa-solutions",
  REPO_BRANCH: "main",
  COMMIT_MESSAGE_TEMPLATE: "[{topic}] {title} — {difficulty} | {language}",
  IMPORT_COMMIT_MESSAGE:
    "chore: import {count} solutions from {platform} profile",
  INDEX_JSON_PATH: "index.json",

  HEARTBEAT_PORT_NAME: "heartbeat",
  HEARTBEAT_INTERVAL_MS: 20_000,

  // Storage keys used with `Storage` helper. Values are the keys stored inside browser storage.
  // Naming convention: short, dot-separated, stable across releases.
  SK: {
    SETTINGS: "settings",
    DEBUG: "codeledger.debug",
    AUTH_TOKENS: "auth.tokens",
    AI_KEYS: "ai.keys",
    AI_KEY_INDICES: "ai.key.indices",
    AI_ENDPOINT_OVERRIDES: "ai.endpoint.overrides",
    TELEMETRY_OPT_IN: "telemetry.optIn",
    INCOGNITO_MODE: "incognito.mode",
    DISABLED_PLATFORMS: "platforms.disabled",
    CANONICAL_MAP_CACHE: "canonical.map.cache",
    CANONICAL_MAP_ETAG: "canonical.map.etag",
    AI_PROMPTS: "ai.prompts",
    SYNC_STATE: "sync.state",
    THEME: "ui.theme",
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
});
