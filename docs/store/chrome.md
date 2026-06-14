# Chrome Web Store — Submission Copy

## Short Description (132 chars max)

> Your DSA journey, committed. Auto-commit every accepted LeetCode solution to GitHub with AI review, analytics, and a live dashboard.

---

## Category

**Developer Tools**

---

## Long Description (4000 chars max)

**CodeLedger — Your DSA grind, on your GitHub. Automatically.**

Solve a problem on LeetCode. The instant it's accepted, CodeLedger commits it to your GitHub repo — solution file, problem description, AI code review, runtime stats, and all. Your GitHub contribution graph fills up with real, attributed work. No manual steps. No copy-pasting.

---

**WHAT YOU GET**

⚡ Zero-click commits
Every accepted submission creates a single atomic git commit in your own GitHub repo — the moment it's accepted.

📥 Bulk LeetCode import
Already have hundreds of solutions? Import your entire LeetCode history from your Progress page in one click. All past accepted solutions committed with clean paths, problem descriptions, and stats.

🤖 AI code review
Connect any AI provider API key and get time/space complexity analysis, optimization suggestions, and hints committed alongside your code. Supports Google Gemini (free tier), OpenAI, Anthropic Claude, DeepSeek, Ollama (local), and OpenRouter.

📊 Live analytics dashboard
A GitHub-style contribution heatmap, topic radar, difficulty breakdown, and solve velocity chart — all hosted on your own GitHub Pages, built from your own data.

🕸️ Knowledge graph
A force-directed graph of everything you've solved, linked by topic. Spot your strengths and coverage gaps instantly.

💬 AI chat panel
A floating AI chat on every problem page. Ask about complexity, request hints, paste errors — with your code pre-loaded via /mycode. Supports slash-command autocomplete.

🧠 AI Behaviour Bank
Personal memory for your AI assistant. Save insights, define custom skills that trigger on command, and build a learning roadmap that auto-injects context into every conversation.

🔄 Cross-device sync
Your entire history synced via your own GitHub repo on every startup. Always current on every machine.

💾 Rolling backups
Automatic snapshots of your problems and settings committed to your repo. Full restore in one click.

🔒 100% yours
Your data goes to your GitHub repo, period. No sign-ups, no dashboards on our servers, no scraping. You own everything — plain files, Apache 2.0.

---

**REPOSITORY LAYOUT (v3)**

problems/
lc-two-sum/
lc-two-sum.py ← your code
lc-two-sum.md ← description + AI review + stats
index.json ← machine-readable index
index.html ← live GitHub Pages dashboard

---

**SETUP (2 MINUTES)**

1. Click the CodeLedger icon → Connect GitHub (OAuth, no token stored on our servers)
2. Set a repo name — CodeLedger creates it automatically
3. Solve a problem. Check your GitHub. Done.

Optional: add an AI provider key under Settings → AI for code reviews.

---

**PRIVACY**

Your code and GitHub token are never stored on our servers. The OAuth exchange happens through a Cloudflare Worker proxy — the token is passed directly to your browser and stored only in the extension's local storage; the server does not log or retain it.

The extension includes **optional, opt-in anonymous usage telemetry** (disabled by default). If you enable it in Settings → General → Anonymous Usage Stats, it sends only `{ event: "solve", platform: "leetcode", version: "x.y.z" }` to our self-hosted counter at `counter.vkrishna04.me`. No code, no tokens, no problem data, no identifiers. Full source at github.com/Life-Experimentalist/Code-Ledger.

---

## CWS Privacy Form — Exact Answers

### Single Purpose Description
*(paste as-is into the form)*

> CodeLedger automatically detects when a user solves a DSA problem on LeetCode, GeeksForGeeks, or Codeforces and commits their solution code to a GitHub repository they own. All other features (AI review, analytics, conflict sync, knowledge graph) exist solely to enrich that single commit workflow.

---

### Permission Justifications

**storage**
> Stores the user's GitHub repository settings, OAuth token reference, problem cache, AI provider configuration, and sync state locally in the browser. If the user opts in to anonymous usage stats (disabled by default), a solve-event counter `{ platform, version }` is sent to `counter.vkrishna04.me`. No other data leaves the browser.

**alarms**
> Schedules periodic background sync checks (every 30 minutes) to detect when new solutions need to be pushed to the user's GitHub repository, and to throttle AI review batches to avoid API rate limits.

**sidePanel**
> Hosts the CodeLedger Library panel, which lets users browse all saved solutions, view analytics, explore the knowledge graph, and manage sync settings — all without navigating away from the current coding platform tab.

**Host permissions**
> • `*.leetcode.com`, `*.geeksforgeeks.org`, `*.codeforces.com` — content scripts detect accepted submissions and inject UI on these platforms.
> • `api.github.com` — commits solution files to the user's own repository via the GitHub Trees API.
> • `api.gitlab.com` — optional mirror repository target; only contacted if the user configures a GitLab mirror.
> • `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`, `api.deepseek.com`, `localhost:11434` — AI code review providers; only contacted if the user has enabled AI review and entered their own API key for that provider.

---

### Remote Code

**No.** All JavaScript — including Preact, htm, and Chart.js — is bundled inside the extension package under `src/vendor/`. No `<script>` tags reference external URLs, no `eval()` or `new Function()` is used, and no Wasm is fetched at runtime.

---

### Data Usage Checkboxes

| Category | Check? | Reason |
|---|---|---|
| Personally identifiable information | **No** | No name, address, email, or ID is collected. |
| Health information | **No** | Not applicable. |
| Financial and payment information | **No** | Not applicable. CodeLedger is free. |
| Authentication information | **No** | GitHub OAuth tokens are stored only in `chrome.storage.local` on the user's device. The OAuth proxy passes the token through without logging or retaining it. |
| Personal communications | **No** | Not applicable. |
| Location | **No** | No IP, GPS, or region data is collected. |
| Web history | **No** | Content scripts run only on the three configured coding platforms; no general browsing history is accessed. |
| **User activity** | **Yes** | If the user opts in to "Anonymous Usage Stats" (off by default), a solve event `{ event: "solve", platform: "leetcode", version: "1.4.5" }` is sent to `counter.vkrishna04.me`. No clicks, scrolls, or keystrokes. Anonymous, no user identifier. |
| Website content | **No** | Submitted code is read from the platform DOM and committed to the user's own GitHub repo only — never sent to the developer. |

**Certifications — all three apply:**
- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** `https://codeledger.vkrishna04.me/privacy`

---

## CWS Reviewer Notes

**No remote code.** All JavaScript — including Preact, htm, and Chart.js — is bundled inside the extension package under `src/vendor/`. No scripts are loaded from external URLs at runtime. No `eval()` or `new Function()` is used.

**Telemetry (opt-in, disabled by default).** `src/core/telemetry.js` sends `{ version, platform }` to `https://counter.vkrishna04.me` only when the user explicitly enables "Anonymous Usage Stats" in Settings → General. Default is off. No code, tokens, or user identifiers are ever included. The single call site is in `src/background/service-worker.js` (`Telemetry.track("solve", { platform })`).

**OAuth flow.** GitHub OAuth uses a Cloudflare Worker (`codeledger.vkrishna04.me`) as a proxy to keep the Client Secret out of the extension. The worker exchanges the auth code for a token and posts `{ type: 'CODELEDGER_AUTH', provider: 'github', token: '...' }` back to the extension via `window.postMessage`. The token is stored in `chrome.storage.local` and sent only to `api.github.com`.

---

## Keywords / Tags

leetcode, github, dsa, competitive programming, code review, ai, automation, solutions, algorithms, developer tools

---

## Screenshots Guidance

1. Before/after: empty GitHub profile vs. contribution graph full of solves
2. The auto-commit in action: accepted submission → GitHub commit appears
3. Live GitHub Pages dashboard (heatmap + charts)
4. Knowledge graph view
5. AI review committed alongside solution
6. Bulk import progress page
