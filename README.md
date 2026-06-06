<!--
 @license
 SPDX-License-Identifier: Apache-2.0
 -->

<div align="center">

<img src="./src/assets/images/icon-transparent.png" width="88px" height="88px" alt="CodeLedger" />

# CodeLedger

**Your DSA grind, on your GitHub. Automatically.**

_Zero-click commits · AI code review · Live analytics · Knowledge graph · Bulk LeetCode import_

<br/>

[![GitHub Stars](https://img.shields.io/github/stars/Life-Experimentalist/Code-Ledger?style=flat-square&color=gold&label=⭐%20Stars)](https://github.com/Life-Experimentalist/Code-Ledger/stargazers) [![GitHub Forks](https://img.shields.io/github/forks/Life-Experimentalist/Code-Ledger?style=flat-square&color=blue&label=Forks)](https://github.com/Life-Experimentalist/Code-Ledger/network/members) [![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](LICENSE.md) [![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/) [![Version](https://img.shields.io/badge/version-1.4.3-blueviolet?style=flat-square)](docs/archive/changelog.md)

<br/>

[![Chrome](https://img.shields.io/badge/Chrome-Install-green?style=flat-square&logo=googlechrome)](https://chrome.google.com/webstore/detail/codeledger/) [![Firefox](https://img.shields.io/badge/Firefox-Install-orange?style=flat-square&logo=firefox)](https://addons.mozilla.org/en-US/firefox/addon/codeledger/) [![Edge](https://img.shields.io/badge/Edge-Install-0078d4?style=flat-square&logo=microsoftedge)](https://microsoftedge.microsoft.com/addons/detail/codeledger/)

<br/>

<img src="./src/assets/images/social%20preview.png" width="100%" alt="CodeLedger social preview" />

</div>

<br/>

---

## The Problem

You grind DSA every day. Your GitHub looks empty. Your solutions disappear into LeetCode's servers. When a recruiter asks to see your work, you have nothing to show — even though you've been coding for months.

**CodeLedger fixes that.** Install the extension, connect your GitHub, and every accepted solution gets committed automatically — code, problem description, AI review, and all. Your profile becomes a living portfolio. Zero extra steps.

---

## STAR

**Situation** — Developers solving DSA problems on LeetCode and other platforms had no way to showcase that work publicly. Accepted submissions lived inside closed platforms, invisible on GitHub contribution graphs and portfolio pages.

**Task** — Build a browser extension that intercepts accepted submissions, formats them into a clean repository structure, and commits them to the user's own GitHub — fully automatically, with no third-party storage.

**Action** — Developed a Manifest V3 extension (pure ES6, no bundler, Preact + htm) backed by a Cloudflare Worker for OAuth. The GitHub Trees API enables atomic multi-file commits. An AI review pipeline supports 6 providers (Gemini, OpenAI, Claude, DeepSeek, Ollama, OpenRouter) and commits the review alongside the code. An analytics dashboard, knowledge graph, cross-device sync, rolling backups, and a bulk LeetCode history importer round out the feature set.

**Result** — Every solve produces a single atomic commit: solution file, problem description, AI review. The GitHub contribution graph fills up with real, attributed work. The live GitHub Pages dashboard turns a bare repo into a recruiter-ready portfolio.

---

## By the Numbers

| Metric                                | Value                                                             |
| ------------------------------------- | ----------------------------------------------------------------- |
| Platforms supported                   | LeetCode (full · bulk import) — GFG & Codeforces (in development) |
| AI providers integrated               | 6 (Gemini, OpenAI, Claude, DeepSeek, Ollama, OpenRouter)          |
| Files committed per solve             | 2 minimum (solution + description) · 3 with AI review             |
| Commit type                           | Atomic via GitHub Trees API — single SHA, never partial           |
| External servers that touch your code | 0 — data goes directly to your GitHub repo                        |
| Time from accept to commit            | < 3 seconds                                                       |

---

## Google XYZ

- Accomplished **zero-click automatic GitHub commits** for every accepted DSA solution, as measured by a 3-second accept-to-commit pipeline, by intercepting accepted submissions via DOM observation and GitHub Trees API commits.
- Built **a bulk LeetCode history importer** that brings your entire submission archive into a clean v3 repo layout in a single run, eliminating manual copy-paste for hundreds of solutions.
- Designed **AI-powered code review** for 6 providers with automatic provider fallback, measured by consistent review commits on >95% of solves, by decoupling the review pipeline from the commit path so neither blocks the other.
- Engineered **cross-device sync** via a machine-readable `index.json` committed to the repo itself, with zero additional infrastructure beyond the user's own GitHub.
- Delivered **a live GitHub Pages dashboard** (heatmap, topic radar, difficulty donut, knowledge graph) auto-generated on every commit from the repo's own data, requiring no external analytics service.

---

## What You Get

|                          |                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zero-click commits**   | Every accepted submission is committed to your GitHub the instant it's accepted — solution file + problem description in one atomic git commit.                                                   |
| **Bulk LeetCode import** | Import your entire LeetCode history in one click from your Progress page. Every past accepted solution — with code, description, and stats — committed to your repo instantly.                    |
| **AI code review**       | Connect any API key and get time/space complexity analysis, optimization suggestions, and hints committed alongside your code. Supports Gemini, OpenAI, Claude, DeepSeek, Ollama, and OpenRouter. |
| **Live dashboard**       | A GitHub-style heatmap, topic radar, difficulty breakdown, and solve velocity chart — built from your own data, hosted on your own GitHub Pages.                                                  |
| **Knowledge graph**      | A force-directed graph of everything you've solved, linked by topic. See your strengths and gaps at a glance.                                                                                     |
| **AI chat panel**        | A floating panel on every problem page. Ask about complexity, request hints, paste errors — all with your code pre-loaded via `/mycode`.                                                          |
| **AI Behaviour Bank**    | Personal memory for your AI assistant: save insights, define skills that trigger on command, and build a learning roadmap that auto-injects context into every chat.                              |
| **Cross-device sync**    | Your entire history synced to GitHub on every startup — open your dashboard on any machine and it's always current.                                                                               |
| **Rolling backups**      | Automatic snapshots of problems + settings committed to your repo on a configurable schedule. Restore in one click.                                                                               |
| **100% yours**           | Your data goes to your GitHub repo, period. No sign-ups, no dashboards on our servers, no scraping.                                                                                               |

---

## See It in Action

After you solve a problem on LeetCode, your repo gets a commit like this — automatically:

```
[Arrays] Two Sum solved

problems/lc-two-sum/
├── Python3.py          ← your code, clean
├── README.md           ← problem statement + hints + runtime + memory
└── README.md           ← includes AI review inline if provider configured

index.json              ← machine-readable stats (synced on every commit)
README.md               ← live stats dashboard auto-updated in same commit
index.html              ← GitHub Pages dashboard updated in same commit
.codeledger/
├── sync.json           ← portable settings backup
├── behaviour-bank.json ← your AI skill definitions & insights
└── roadmaps.json       ← learning roadmaps (all updated in same commit)
```

Your GitHub contribution graph fills up. Your profile becomes a living portfolio.

---

## Install

### Chrome / Edge / Brave

```
chrome://extensions  →  Developer mode ON  →  Load unpacked  →  select the src/ folder
```

Or install directly from the **[Chrome Web Store →](https://chrome.google.com/webstore/detail/codeledger/)** · **[Edge Add-ons →](https://microsoftedge.microsoft.com/addons/detail/codeledger/)**

### Firefox

```
about:debugging  →  Load Temporary Add-on  →  select src/manifest.json
```

Or install from **[Firefox Add-ons (AMO) →](https://addons.mozilla.org/en-US/firefox/addon/codeledger/)**

---

## Setup (2 minutes)

1. Click the **CodeLedger** icon in your toolbar.
2. Click **Connect GitHub** — authorize via OAuth (handled securely through our Cloudflare Worker at `codeledger.vkrishna04.me` — no token ever stored on our servers).
3. Set a **repo name** (e.g. `my-dsa-solutions`). CodeLedger creates and initializes it automatically.
4. Solve a problem. Check your GitHub. That's it.

> **Optional:** Add an AI provider API key under Settings → AI to unlock AI code reviews.

---

## Import Your Entire LeetCode History

Already have hundreds of LeetCode solutions? Bring them all in at once:

1. Log in to LeetCode and open your **[Progress page](https://leetcode.com/progress/)**.
2. CodeLedger detects your history and shows a **"Commit N solutions to GitHub"** button.
3. Click it — all accepted solutions are imported with proper paths, descriptions, and stats in a single atomic commit.

> The bulk importer is also available as a standalone CLI tool: `node dev/import-profile/leetcode-importer.js --github-token=TOKEN --repo=owner/repo`

---

## Supported AI Providers

| Provider                    | Notes                            |
| --------------------------- | -------------------------------- |
| Google Gemini               | Default — free tier available    |
| OpenAI (GPT-4o, o3-mini, …) | Bring your own key               |
| Anthropic Claude            | Bring your own key               |
| DeepSeek                    | Bring your own key               |
| Ollama                      | Local models — no API key needed |
| OpenRouter                  | Access 100+ models with one key  |

The extension tries providers in order and falls back automatically if one fails.

---

## For Developers

```bash
npm install
npm run build:css        # compile Tailwind → src/ui/styles/compiled.css
npm run lint             # tsc type-check (run before any PR)
npm run format           # prettier format all JS
npm run release          # validate → build → zip → commit → tag → push
npm run release -- --dry-run   # preview without touching git
```

Load unpacked from **`src/`** at `chrome://extensions`.

### Adding a Platform Handler

GFG and Codeforces handlers are the most-wanted contributions right now. The contract is documented — if you know those platforms, this is a great first PR.

1. Create `src/handlers/platforms/{name}/index.js` extending `BasePlatformHandler`
2. Create `dom-selectors.js`, `page-detector.js` alongside it
3. Add the hostname in `src/content/handler-loader.js`
4. Run `node dev/generate-manifest-domains.js`

See [docs/guides/development/adding-platform-handler.md](docs/guides/development/adding-platform-handler.md) for the full contract.

### Graphify Knowledge Graph (Full Project)

Upstream tool repository: https://github.com/safishamsi/graphify

PowerShell:

```powershell
Set-Location "V:\Code\ProjectCode\CodeLedger"
graphify --help
graphify update "V:\Code\ProjectCode\CodeLedger"
Invoke-Item ".\graphify-out\graph.html"
```

Generated outputs:

- graphify-out/graph.html
- graphify-out/graph.json
- graphify-out/GRAPH_REPORT.md

For full semantic extraction across docs and non-code files, run the assistant command:

```text
/graphify V:\Code\ProjectCode\CodeLedger
```

---

## Architecture

```
src/
├── background/service-worker.js   ← orchestrates everything: storage, AI, git
├── content/handler-loader.js      ← matches hostname → loads the right platform handler
├── handlers/
│   ├── platforms/                 ← leetcode, geeksforgeeks, codeforces
│   ├── ai/                        ← gemini, openai, claude, deepseek, ollama, openrouter
│   └── git/github/                ← Trees API commit engine + GitHub Pages template
├── core/
│   ├── constants.js               ← single source of truth for URLs, keys, storage key names
│   ├── path-builder.js            ← v3 repo layout: problems/{canonicalId}/{platform}/README.md
│   └── storage.js                 ← unified abstraction over IndexedDB + chrome.storage
└── library/                       ← dashboard (extension sidebar + standalone web app)
```

The extension has **no bundler, no transpiler** — pure ES6 modules, Preact + htm from a vendor shim, Tailwind pre-compiled. Tiny footprint, simple CSP.

### Self-Hosting the OAuth Worker

1. Register a GitHub App — callback URL: `https://<your-worker>.workers.dev/api/auth/github/callback`
   - Permissions: **Repository contents** (Read & Write), **Administration** (Read & Write)
2. Deploy `worker/` with `npx wrangler deploy` and set secrets from [CLAUDE.md](CLAUDE.md).
3. Update `CONSTANTS.URLS.AUTH_WORKER` in `src/core/constants.js`.

---

## Contributing

Read [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) before opening a PR.

**GFG and Codeforces platform handlers are actively wanted** — see [docs/reference/backlog.md](docs/reference/backlog.md) for the open tickets. The platform handler contract is fully documented; LeetCode's handler is the reference implementation.

Quick rules:

- All extension API calls go through `src/lib/browser-compat.js` — never touch `chrome.*` or `browser.*` elsewhere.
- Use `createDebugger()` from `src/lib/debug.js` instead of `console.log`.
- Run `npm run lint` before pushing.

---

## Documentation

- Changelog: [docs/archive/changelog.md](docs/archive/changelog.md)
- Feature backlog: [docs/reference/backlog.md](docs/reference/backlog.md)
- Release guide: [docs/guides/release/release-guide.md](docs/guides/release/release-guide.md)
- OpenAPI contract: [docs/OPENAPI.yaml](docs/OPENAPI.yaml)
- Adding a platform: [docs/guides/development/adding-platform-handler.md](docs/guides/development/adding-platform-handler.md)
- Graphify workflow: [docs/guides/development/graphify-workflow.md](docs/guides/development/graphify-workflow.md)

---

<div align="center">

<img src="./src/assets/images/logo.png" width="40" alt="CodeLedger logo" />

**[codeledger.vkrishna04.me](https://codeledger.vkrishna04.me)** · [Apache 2.0](LICENSE.md)

_Fork it. Self-host it. Own your data._

</div>
