# Firefox AMO — Submission Copy

## Add-on Name

Code Ledger

## Summary (250 chars max)

> Auto-commit every accepted LeetCode solution to your own GitHub repo — with AI code review, live analytics dashboard, bulk history import, and cross-device sync. Zero extra steps.

---

## Description (AMO long description)

**Code Ledger — Your DSA grind, on your GitHub. Automatically.**

Solve a problem on LeetCode. The instant it's accepted, Code Ledger commits it to your GitHub repo — solution file, problem description, AI code review, and runtime stats — in a single atomic commit. Your contribution graph fills up with real work. No copy-pasting. No manual steps.

**FEATURES**

• Zero-click commits — every accepted submission committed automatically via GitHub Trees API
• Bulk LeetCode import — bring your entire history from the Progress page in one click
• AI code review — 6 providers: Gemini (free), OpenAI, Claude, DeepSeek, Ollama, OpenRouter
• Live GitHub Pages dashboard — heatmap, topic radar, difficulty chart, solve velocity
• Knowledge graph — force-directed graph of all solves linked by topic
• AI chat panel — floating assistant on every problem page with /mycode, /problem, /errors commands
• AI Behaviour Bank — personal memory: insights, custom skills, learning roadmap
• Cross-device sync — history always current via your own GitHub repo
• Rolling backups — automatic snapshots with one-click restore
• 100% yours — data goes to your repo only, open-source Apache 2.0

**SETUP**

1. Click the CodeLedger icon → Connect GitHub
2. Set a repo name
3. Solve a problem. Done.

**PRIVACY**

Your code and GitHub tokens are never stored on our servers. OAuth is handled via a Cloudflare Worker proxy (`codeledger.vkrishna04.me`) — the token passes through and is stored only in local extension storage; the server does not log or retain it.

The extension includes **optional, opt-in anonymous usage telemetry** (disabled by default). If you enable it in Settings → General → Anonymous Usage Stats, it sends only `{ event: "solve", platform: "leetcode", version: "x.y.z" }` to `counter.vkrishna04.me` when a problem is solved. No code, no tokens, no problem data, no identifiers. You can verify this in the open source at github.com/Life-Experimentalist/Code-Ledger (`src/core/telemetry.js`).

---

## AMO Reviewer Notes

Thank you for reviewing CodeLedger. Please read these notes before testing.

**Permissions justification:**

| Permission                                        | Why it is needed                                                                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                         | Stores user settings, OAuth token, and IndexedDB problem records locally. The only external data sent is optional opt-in anonymous telemetry (disabled by default) — see Telemetry section below. |
| `tabs`                                            | Reads the active tab URL to detect supported platforms (leetcode.com) and inject the correct content script.                                                                                      |
| `scripting`                                       | Injects content scripts into platform pages to detect accepted submissions via DOM observation.                                                                                                   |
| `alarms`                                          | Schedules periodic background sync (cross-device) and reminder alarms via chrome.alarms.                                                                                                          |
| `identity` (not used)                             | Not requested — OAuth is handled via a web redirect to our Cloudflare Worker, not the identity API.                                                                                               |
| Host permissions `*://leetcode.com/*`             | Required to run content scripts on LeetCode pages to detect submission results.                                                                                                                   |
| Host permissions `*://codeledger.vkrishna04.me/*` | Our Cloudflare Worker URL — handles GitHub OAuth callback. No user code is ever sent here.                                                                                                        |
| Host permissions `*://api.github.com/*`           | Directly calls GitHub REST API (Trees API, Contents API) from the extension to commit files to the user's repo.                                                                                   |

**No remote code execution.** The extension never uses `eval()`, `new Function()`, or loads scripts from remote URLs at runtime. All JavaScript is bundled statically. Preact and htm are loaded from a local vendor shim (`src/vendor/preact-bundle.js`), not from a CDN at runtime. This satisfies AMO's policy on no remote code execution.

**CSP compliance.** The manifest declares a strict `content_security_policy` with no `unsafe-eval` or `unsafe-inline` directives. All inline event handlers use Preact's synthetic event system.

**OAuth flow.** The GitHub OAuth exchange uses a Cloudflare Worker (`codeledger.vkrishna04.me`) as a proxy to keep the GitHub App Client Secret out of the extension bundle. The worker receives the auth code, exchanges it for a token, and posts `{ type: 'CODELEDGER_AUTH', provider: 'github', token: '...' }` back to the extension via `window.postMessage`. The extension listens for exactly this message type. The token is then stored in `chrome.storage.local` and is never transmitted to any server other than `api.github.com`.

**Telemetry (opt-in, disabled by default).** The extension contains optional anonymous usage telemetry in `src/core/telemetry.js`. It is **disabled by default** (`telemetryOptIn` defaults to `false`). If the user explicitly enables "Anonymous Usage Stats" in Settings → General, it sends a POST to `https://counter.vkrishna04.me/api/v1/counter/solve/hit` containing only `{ version: "x.y.z", platform: "leetcode" }` when a problem is solved. No code, no tokens, no user identifiers, no problem content is ever included. There is no install-event tracking — install counts are obtained from the AMO developer dashboard. Reviewers can verify the exact payload in `src/core/telemetry.js` and the single call site in `src/background/service-worker.js`.

**Testing the extension:**

1. Load the extension as a temporary add-on via about:debugging.
2. Click the toolbar icon → Connect GitHub (requires a GitHub account).
3. Set a repository name in settings.
4. Navigate to leetcode.com, solve an Easy problem (e.g. Two Sum), submit an accepted solution.
5. Verify a commit appears in the configured GitHub repo within ~3 seconds.

---

## Categories

Primary: **Developer Tools**
Secondary: **Productivity**

## Tags

leetcode, github, dsa, algorithms, automation, code-review, ai
