# Microsoft Edge Add-ons — Submission Copy

## Notes for Certification
*(paste into the "Notes for certification" field — must be under 2,000 characters)*

CodeLedger detects accepted DSA submissions on LeetCode, GeeksForGeeks, and Codeforces and commits the solution code to the user's own GitHub repository via the GitHub Trees API.

**To test:**
 1. Load the extension and click the toolbar icon.
 2. Click "Connect GitHub" — this redirects to GitHub OAuth via our Cloudflare Worker proxy at codeledger.vkrishna04.me/api/auth/github. The worker exchanges the code for a token and passes it back to the extension; it does not store the token.
 3. Set a repository name in Settings. The repo is created automatically on first solve.
 4. Navigate to leetcode.com, solve an Easy problem (e.g. "Two Sum"), submit, and wait for the Accepted verdict.
 5. Within ~3 seconds a commit should appear in the configured GitHub repo.

**Permission notes:**
 - storage: persists settings, OAuth token, and problem cache locally. The only external call is opt-in anonymous telemetry (disabled by default) — sends { platform, version } to counter.vkrishna04.me only if user enables "Anonymous Usage Stats" in Settings → General.
 - alarms: periodic cross-device sync every 30 min and AI review rate-limiting.
 - sidePanel: CodeLedger Library panel (solve history, analytics, knowledge graph).
 - Host permissions: leetcode/gfg/codeforces for content scripts; api.github.com for commits; AI provider APIs only contacted when user has configured that provider with their own key; localhost:11434 for local Ollama only.

**No remote code.** All JS (Preact, Chart.js, htm) is bundled in src/vendor/. No eval(), no external script tags.

Full source: github.com/Life-Experimentalist/Code-Ledger

---

## Extension Name

Code Ledger

## Short Description (150 chars max)

> Auto-commit every accepted LeetCode solution to your GitHub — with AI review, live analytics, bulk import, and cross-device sync. Zero extra steps.

---

## Long Description

**CodeLedger — Your DSA grind, on your GitHub. Automatically.**

Every time you solve a LeetCode problem and it's accepted, CodeLedger commits it to your own GitHub repository — solution file, problem description, AI code review, and performance stats — in a single atomic git commit. Your GitHub contribution graph fills up with real work. No manual steps, no copy-pasting.

**KEY FEATURES**

**⚡ Zero-click commits**
Accepted submissions are committed the instant they're accepted via the GitHub Trees API. One commit, all files, atomic.

**📥 Bulk LeetCode import**
Already have hundreds of solutions? Import your entire LeetCode history from your Progress page in one click. Every accepted solution gets a clean path, problem description, and stats.

**🤖 AI code review**
Connect any AI provider and get complexity analysis, optimization hints, and suggestions committed alongside your code. Supports Google Gemini (free tier), OpenAI, Claude, DeepSeek, Ollama, and OpenRouter.

**📊 Live dashboard**
A GitHub-style heatmap, topic radar, difficulty breakdown, and solve velocity chart — hosted on your own GitHub Pages, built from your own data.

**🕸️ Knowledge graph**
A force-directed graph linking all your solves by topic. Spot coverage gaps instantly.

**💬 AI chat panel**
Floating AI assistant on every problem page with slash commands (/mycode, /problem, /errors).

**🔒 100% yours**
Data goes to your GitHub repo only. No external dashboards, no scraping, open-source Apache 2.0.

**PRIVACY**

CodeLedger never stores your code or GitHub token externally. OAuth is handled via a transparent Cloudflare Worker proxy — the token goes directly to your browser. Full source at github.com/Life-Experimentalist/Code-Ledger.

**SETUP (2 MINUTES)**

1. Click the CodeLedger icon → Connect GitHub
2. Set a repo name — created automatically
3. Solve a problem. Check your GitHub. Done.

---

## Category

**Developer Tools**

## Privacy Policy URL

https://codeledger.vkrishna04.me/privacy

## Website URL

https://codeledger.vkrishna04.me

## Support URL

https://github.com/Life-Experimentalist/Code-Ledger/issues

---

## Edge Add-ons Store — Privacy & Permissions Form

### Single Purpose Description

CodeLedger automatically detects accepted DSA problem submissions on LeetCode, GeeksForGeeks, and Codeforces and commits the solution code, problem metadata, and optional AI review to the user's own GitHub repository via the GitHub Trees API.

---

### Permission Justifications

**storage**
Required to persist user settings (GitHub repository name and owner, AI provider preferences, OAuth tokens, and per-problem solve history in IndexedDB). All data remains exclusively in local browser storage or the user's own GitHub repository. Nothing is transmitted to the extension developer.

**alarms**
Required to schedule periodic cross-device sync checks via `chrome.alarms`. The extension uses alarms to poll the user's own GitHub repository index for solutions committed from other devices, and to fire solve-streak reminder notifications if the user has enabled them.

**sidePanel**
Required to display the CodeLedger Library panel — a full-page view of the user's solve history, analytics dashboard (contribution heatmap, topic radar, difficulty charts), knowledge graph, and AI chat history — accessible as a side panel without leaving the current problem page.

**Host permissions**
- `*://*.leetcode.com/*`, `*://*.geeksforgeeks.org/*`, `*://*.codeforces.com/*` — Content scripts observe DOM changes on these platforms to detect when a submission is accepted. The only data read from these pages is the user's own submitted code and problem metadata (title, difficulty, tags), which is then committed to the user's own GitHub repo.
- `https://api.github.com/*` — Required to commit solutions to the user's GitHub repository via the Trees API, read repository state for cross-device sync, and look up repository/user metadata during onboarding.
- `https://api.gitlab.com/*` — Required for users who configure GitLab as their git provider instead of GitHub. Only contacted when the user has set up a GitLab repository.
- `https://api.openai.com/*`, `https://api.anthropic.com/*`, `https://generativelanguage.googleapis.com/*`, `https://api.deepseek.com/*` — Required to call AI providers for optional AI code review. Each endpoint is only contacted if the user has explicitly configured and enabled that provider. API keys are stored locally via `chrome.storage.local` and never transmitted to the extension developer.
- `http://localhost:11434/*` — Required to call a locally-running Ollama instance for users who opt for a fully local AI provider. Only contacted when Ollama is selected and a local server is running.

---

### Remote Code

**No** — the extension contains no remote code. All JavaScript (including Preact, Chart.js, and htm) is bundled inside the extension package under `src/vendor/`. No `<script>` tags reference external URLs, no `eval()` or `new Function()` is used, and no Wasm is fetched at runtime. Strict CSP is enforced.

*Justification (for the form field):* All JavaScript is shipped inside the extension package. Preact, Chart.js, and htm are vendored locally under `src/vendor/`. No external scripts are referenced or evaluated at runtime.

---

### Data Usage

**What user data do you plan to collect from users now or in the future?**

Answer for each category in the Edge form:

| Category                            | Collected?            | Notes                                                                                                                                                                                                                                                                                              |
| ----------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personally identifiable information | **No**                | No name, address, email, age, or ID number is collected or transmitted to the developer.                                                                                                                                                                                                           |
| Health information                  | **No**                | Not applicable.                                                                                                                                                                                                                                                                                    |
| Financial and payment information   | **No**                | No payment data is collected. CodeLedger is free and open-source.                                                                                                                                                                                                                                  |
| Authentication information          | **No**                | GitHub OAuth tokens are stored only in `chrome.storage.local` on the user's own device. The OAuth proxy (`codeledger.vkrishna04.me`) passes the token through without logging or storing it server-side.                                                                                           |
| Personal communications             | **No**                | Not applicable.                                                                                                                                                                                                                                                                                    |
| Location                            | **No**                | No region, IP, GPS, or proximity data is collected.                                                                                                                                                                                                                                                |
| Web history                         | **No**                | Content scripts run only on the three configured coding platforms (LeetCode, GeeksForGeeks, Codeforces). No browsing history outside those domains is accessed.                                                                                                                                    |
| User activity                       | **Yes (opt-in only)** | If the user explicitly enables "Anonymous Usage Stats" in Settings → General (off by default), the extension sends `{ event: "solve", platform: "leetcode", version: "1.4.5" }` to `counter.vkrishna04.me` when a problem is solved. No clicks, scrolls, keystrokes, or other activity is tracked. |
| Website content                     | **No**                | The extension reads the user's own submitted code from the platform DOM solely to commit it to the user's own GitHub repository. This data is never sent to the developer.                                                                                                                         |

**Privacy policy URL:** https://codeledger.vkrishna04.me/privacy

The extension is open-source (Apache 2.0): `https://github.com/Life-Experimentalist/Code-Ledger`
