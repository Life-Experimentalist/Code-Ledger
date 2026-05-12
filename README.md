<div align="center">

<img src="./src/assets/images/icon-transparent.png" width="72px" height="72px" alt="CodeLedger icon" />

# CodeLedger

**Every problem you solve, committed to your GitHub — automatically.**

*LeetCode · GeeksForGeeks · Codeforces · AI review · Analytics · Knowledge graph*

<br/>

[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](LICENSE.md) [![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/) [![Chrome](https://img.shields.io/badge/Chrome-install-green?style=flat-square&logo=googlechrome)](https://chrome.google.com/webstore/detail/codeledger/) [![Firefox](https://img.shields.io/badge/Firefox-install-red?style=flat-square&logo=firefox)](https://addons.mozilla.org/en-US/firefox/addon/codeledger/) [![Views](https://counter.vkrishna04.me/api/views/codeledger/badge?style=flat-square&color=blueviolet&label=views)](https://counter.vkrishna04.me) [![Installs](https://counter.vkrishna04.me/api/views/codeledger-install/badge?style=flat-square&color=purple&label=installs)](https://counter.vkrishna04.me)

<br/>

<img src="./src/assets/images/social%20preview.png" width="100%" alt="CodeLedger social preview" />

</div>

<br/>

## The problem it solves

You grind DSA problems across five different platforms. Your solutions disappear into their servers. Your GitHub contribution graph looks empty even though you've been coding every day. When someone asks to see your work, you have nothing to show them.

**CodeLedger fixes that.** Install the extension, connect your GitHub, and every accepted solution you submit gets committed to a repo you own — code, problem description, AI review, and all. Zero extra steps.

<br/>

## What you get

|                          |                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **⚡ Zero-click commits** | Every accepted submission is committed to your GitHub the instant it's accepted — code file + problem README in one atomic git commit.                                                            |
| **🤖 Instant AI review**  | Connect any API key and get time/space complexity analysis, hints, and optimization suggestions committed alongside your code. Supports Gemini, OpenAI, Claude, DeepSeek, Ollama, and OpenRouter. |
| **📊 Dashboard**          | A GitHub-style heatmap, topic radar, difficulty breakdown, and solve velocity chart — all built from your own data, no third-party accounts.                                                      |
| **🕸️ Knowledge graph**    | A force-directed graph of everything you've solved, linked by topic. See your strengths and gaps at a glance.                                                                                     |
| **🌍 Multi-platform**     | LeetCode, GeeksForGeeks, and Codeforces work out of the box. Bulk-import your entire LeetCode history in one click.                                                                               |
| **💬 AI chat panel**      | A floating chat on every problem page. Ask about complexity, request hints, paste errors — all with your code pre-loaded via `/mycode`.                                                           |
| **🔒 100% yours**         | Your data goes to your GitHub repo, period. No sign-ups, no dashboards on our servers, no scraping. One repo, everything in it.                                                                   |

<br/>

## See it in action

> After you solve a problem on LeetCode, your repo gets a commit like this — automatically:

```
[Array] Two Sum solved

topics/Array/two-sum/
├── Python3.py          ← your code, clean
├── README.md           ← problem statement + your runtime/memory
└── (ai-review.md)      ← if you have an AI key configured
```

Your GitHub contribution graph fills up. Your profile becomes a living portfolio. Recruiters see consistent, real work.

<br/>

## Install

**Chrome / Edge / Brave**

```
chrome://extensions  →  Developer mode ON  →  Load unpacked  →  select the src/ folder
```

Or install directly from the **[Chrome Web Store →](https://chrome.google.com/webstore/detail/codeledger/)**

**Firefox**

```
about:debugging  →  Load Temporary Add-on  →  select src/manifest.json
```

Or install from **[Firefox Add-ons →](https://addons.mozilla.org/en-US/firefox/addon/codeledger/)**

<br/>

## Setup (2 minutes)

1. Click the **CodeLedger** icon in your toolbar.
2. Click **Connect GitHub** — authorize via OAuth (handled securely through our Cloudflare Worker at `codeledger.vkrishna04.me`, no token ever touches our servers beyond the handshake).
3. Set a **repo name** (e.g. `my-dsa-solutions`). CodeLedger creates and initializes it automatically.
4. Solve a problem. Check your GitHub. That's it.

> **Optional:** Add an AI provider API key under Settings → AI to unlock code reviews. You can use your own key — BYOK, zero lock-in.

<br/>

## Supported AI providers

| Provider                    | Notes                           |
| --------------------------- | ------------------------------- |
| Google Gemini               | Default — free tier available   |
| OpenAI (GPT-4o, o3-mini, …) | Bring your own key              |
| Anthropic Claude            | Bring your own key              |
| DeepSeek                    | Bring your own key              |
| Ollama                      | Local models, no API key needed |
| OpenRouter                  | Access 100+ models with one key |

The extension tries providers in order and falls back automatically if one fails.

<br/>

## For developers

```bash
npm install
npm run build:css        # compile Tailwind → src/ui/styles/compiled.css
npm run lint             # tsc type-check (run before any PR)
npm run publish          # full release build → releases/
```

Load unpacked from **`src/`** at `chrome://extensions`.

### Adding a platform

1. Create `src/handlers/platforms/{name}/index.js` extending `BasePlatformHandler`
2. Create `dom-selectors.js`, `page-detector.js` alongside it
3. Add the hostname in `src/content/handler-loader.js`
4. Run `node dev/generate-manifest-domains.js`

See [docs/ADDING_PLATFORM_HANDLER.md](docs/ADDING_PLATFORM_HANDLER.md) for the full contract.

### Self-hosting the OAuth worker

The extension uses a Cloudflare Worker to handle the GitHub OAuth exchange so your Client Secret is never in the extension. If you want to run your own:

1. Register a GitHub App at **GitHub → Settings → Developer settings → GitHub Apps**.
   - Homepage URL: anything
   - Callback URL: `https://<your-worker>.workers.dev/api/auth/github/callback`
   - Permissions: **Repository contents** (Read & Write), **Administration** (Read & Write)
2. Deploy `worker/` to Cloudflare with `npx wrangler deploy` and set the secrets listed in [CLAUDE.md](CLAUDE.md).
3. Update `CONSTANTS.URLS.AUTH_WORKER` in `src/core/constants.js` to point to your worker.

<br/>

## Architecture

```
src/
├── background/service-worker.js   ← orchestrates everything: storage, AI, git
├── content/handler-loader.js      ← matches the current hostname → loads the right handler
├── handlers/
│   ├── platforms/                 ← leetcode, geeksforgeeks, codeforces
│   ├── ai/                        ← gemini, openai, claude, deepseek, ollama, openrouter
│   └── git/github/                ← Trees API commit engine + GitHub Pages template
├── core/
│   ├── constants.js               ← single source of truth for URLs, keys, storage key names
│   └── storage.js                 ← unified abstraction over IndexedDB + chrome.storage
└── library/                       ← the dashboard (works in sidebar and as a standalone web app)
```

The extension has **no bundler, no transpiler** — pure ES6 modules, Preact + htm from a vendor shim, Tailwind pre-compiled. This keeps the footprint tiny and the CSP simple.

<br/>

## Documentation

The canonical documentation index lives in [docs/README.md](docs/README.md).

- Backlog: [docs/FEATURE_REQUESTS.md](docs/FEATURE_REQUESTS.md)
- Changelog: [docs/CHANGELOG.md](docs/CHANGELOG.md)
- Release guide: [docs/guides/RELEASE_GUIDE.md](docs/guides/RELEASE_GUIDE.md)
- Release policy: [docs/RELEASE_VERSIONING.md](docs/RELEASE_VERSIONING.md)
- OpenAPI contract: [docs/OPENAPI.yaml](docs/OPENAPI.yaml)

<br/>

## Contributing

Read [CONTRIBUTING.md](.github/CONTRIBUTING.md) before opening a PR. The short version:

- All extension API calls go through `src/lib/browser-compat.js` — never touch `chrome.*` or `browser.*` directly anywhere else.
- Use `createDebugger()` from `src/lib/debug.js` instead of `console.log`.
- Run `npm run lint` before pushing.

See [docs/FEATURE_REQUESTS.md](docs/FEATURE_REQUESTS.md) for what's planned and what's open for contribution.

<br/>

## License

[Apache 2.0](LICENSE.md) — fork it, self-host it, own your data.
