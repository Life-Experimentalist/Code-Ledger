# Microsoft Edge Add-ons — Submission Copy

## Extension Name

CodeLedger

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

## Notes for Edge Store Reviewers

The extension uses these permissions:

- **storage** — local settings and OAuth token only; nothing sent to external servers
- **tabs** — reads active tab URL to detect supported platforms
- **scripting** — injects content scripts into leetcode.com to detect accepted submissions
- **alarms** — schedules periodic sync via chrome.alarms
- Host permissions for leetcode.com, api.github.com, and codeledger.vkrishna04.me (OAuth worker only)

No eval, no remote scripts, no unsafe-inline. Strict CSP. Full details in AMO reviewer notes at docs/store/firefox-amo.md in the source repository.
