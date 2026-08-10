# CodeLedger — LinkedIn Post Series (10 posts)

Schedule: one post per day. Mix recruiter-facing and user-facing content.

---

## Post 1 — The Hook / STAR Story

**Audience:** Both | **Tone:** Personal, honest

---

I was grinding LeetCode every single day.

500+ problems solved. Arrays, trees, graphs, DP — the works.

But when a recruiter asked to see my GitHub, it looked empty.

Because none of that work was there. It lived inside LeetCode's servers, invisible to everyone including me.

I couldn't show a single line of code from 6 months of daily practice.

So I built CodeLedger.

It's a browser extension that intercepts every accepted submission — the instant it's accepted — and commits it to your own GitHub repository. Solution file, problem description, AI code review, runtime stats. One atomic git commit. Zero manual steps.

Your contribution graph fills up. Your profile becomes a living portfolio. Recruiters see consistent, real work.

If you're grinding DSA and your GitHub looks empty, this is for you.

🔗 codeledger.vkrishna04.me — free, open-source, Apache 2.0.

#LeetCode #DSA #GitHub #OpenSource #SoftwareEngineering

---

## Post 2 — Zero-click Commits (Feature Focus)

**Audience:** Users | **Tone:** Demo, practical

---

What happens the moment you hit "Accept" on LeetCode:

1. CodeLedger detects the accepted submission (via DOM observation — no page scraping)
2. Fetches your code, problem description, runtime stats
3. Calls the GitHub Trees API
4. One atomic commit lands in your repo — solution file + description, same SHA

Total time: under 3 seconds.

The commit message looks like: `[solved] Two Sum`

Your repo gets:

```
problems/lc-two-sum/
├── lc-two-sum.py     ← your actual code
└── lc-two-sum.md     ← problem + your runtime + memory stats
```

No browser refresh. No button. No copy-paste. It just happens.

That's what "zero-click" actually means — not "one click less" but "zero interaction required."

CodeLedger is free and open-source → codeledger.vkrishna04.me

#LeetCode #GitHub #Automation #DSA #DevTools

---

## Post 3 — Technical Architecture (Recruiter / Developer credibility)

**Audience:** Recruiters + senior developers | **Tone:** Technical, confident

---

Here's what I built under the hood for CodeLedger (a browser extension that auto-commits LeetCode solutions to GitHub):

**No bundler. No transpiler.**
Pure ES6 modules, Preact + htm from a local vendor shim, Tailwind pre-compiled. The extension runs directly in Chrome and Firefox from the `src/` directory. Zero build step to load unpacked.

**Manifest V3 compliance.**
The service worker is the orchestrator. All dynamic `import()` calls replaced with static top-level imports (MV3 bans dynamic imports in service workers). `chrome.*` and `browser.*` are accessed only through a single compatibility shim — the rest of the codebase never touches extension APIs directly.

**GitHub Trees API for atomic commits.**
No Contents API (`PUT /contents/`) — that creates one commit per file and breaks on non-ASCII characters. The Trees API lets me commit multiple files (solution + description + AI review + index.json) in a single SHA. I also built retry logic for GitHub's distributed ref store lag (3 retries, exponential back-off).

**OAuth without a secret in the extension.**
A Cloudflare Worker (Hono) handles the GitHub OAuth exchange so the Client Secret never appears in the extension bundle. The worker posts the token back via postMessage — the extension listens for exactly one message type.

Fully open-source → github.com/Life-Experimentalist/Code-Ledger

#SystemDesign #BrowserExtension #GitHub #OpenSource #SoftwareArchitecture

---

## Post 4 — Bulk LeetCode Import (Feature Focus)

**Audience:** Users | **Tone:** Practical, exciting

---

Already solved 300+ LeetCode problems?

You don't have to start from scratch.

CodeLedger has a bulk importer that brings your entire LeetCode history into your GitHub repo in one shot.

How it works:
→ Open your LeetCode Progress page
→ CodeLedger detects your history
→ Click "Commit N solutions to GitHub"
→ Every accepted solution — with code, problem description, difficulty, tags, runtime stats — lands in your repo in a single atomic commit

No re-solving. No copy-pasting. 300 solutions in under a minute.

Each solution gets a clean, consistent path:
`problems/lc-{slug}/lc-{slug}.py`

And a description file with the full problem statement, your performance stats, and links to similar problems.

Your contribution graph goes from empty → years of real work, instantly.

Free at codeledger.vkrishna04.me

#LeetCode #GitHub #DSA #Portfolio #Automation

---

## Post 5 — AI Code Review (Feature Focus)

**Audience:** Both | **Tone:** Impressive, accessible

---

What if every LeetCode solution you commit also came with a code review?

Not from another developer. From an AI that reads your exact code.

CodeLedger commits an AI review alongside every solution — automatically.

What the review covers:
✅ Time complexity (with the reasoning)
✅ Space complexity
✅ Edge cases you may have missed
✅ Optimization suggestions
✅ Alternative approaches

The review gets committed as part of the same file (`lc-two-sum.md`) — so it lives in your GitHub repo alongside the solution forever.

Supported providers: Google Gemini (free tier), OpenAI, Anthropic Claude, DeepSeek, Ollama (local — no API key), OpenRouter.

Bring your own key. Zero lock-in. If one provider fails, it automatically tries the next.

Connect your key under Settings → AI, and every future solve gets reviewed.

→ codeledger.vkrishna04.me

#AI #LeetCode #CodeReview #GitHub #DSA

---

## Post 6 — The Viral Hook (Profile / contribution graph)

**Audience:** Both | **Tone:** Bold, provocative

---

Your GitHub contribution graph is a lie.

If you've been grinding LeetCode for months and your graph looks empty — it's not because you haven't been coding. It's because your work is trapped inside a closed platform.

Those 200 problems you solved? Gone from your public profile. Those daily streaks? Invisible. That Three Months of consistent effort? Nowhere to be seen.

GitHub contribution graphs only count what's committed to GitHub.

CodeLedger fixes that. Every accepted LeetCode solution gets committed to your own GitHub repo — automatically, the instant it's accepted.

Your contribution graph starts showing the truth: that you code every single day.

And unlike LeetCode's internal stats (which only you can see), your GitHub profile is what recruiters look at.

Free and open-source → codeledger.vkrishna04.me

Share this with someone whose GitHub looks emptier than it should.

#GitHub #LeetCode #DSA #SoftwareEngineering #JobSearch

---

## Post 7 — Google XYZ Portfolio Framing (Recruiter targeted)

**Audience:** Recruiters | **Tone:** Professional, quantified

---

I've started framing CodeLedger in Google's XYZ resume format. Here's what that looks like:

• Accomplished **zero-click GitHub commits for DSA solutions**, as measured by a <3 second accept-to-commit pipeline, by intercepting accepted submissions via DOM observation and committing via GitHub Trees API.

• Built **a bulk history importer** that migrates hundreds of past solutions into a clean repo layout in a single atomic commit, eliminating manual effort for every existing user.

• Designed **an AI review pipeline** supporting 6 providers with automatic fallback, measured by consistent review commits on >95% of solves, by decoupling review from commit so neither blocks the other.

• Engineered **cross-device sync** via a machine-readable `index.json` committed to the user's own repo, with zero additional infrastructure beyond GitHub.

• Delivered **a live GitHub Pages analytics dashboard** auto-generated on every commit from the repo's own data, requiring no external service.

Why am I posting this? Because I want developers building side projects to know: you can (and should) quantify your work. A GitHub repo link is not a portfolio. A quantified outcome is.

The project: github.com/Life-Experimentalist/Code-Ledger

#Portfolio #SoftwareEngineering #Hiring #OpenSource #CareerAdvice

---

## Post 8 — Knowledge Graph + Analytics (Feature Focus)

**Audience:** Users | **Tone:** Visual, compelling

---

What if you could see a map of your brain for DSA?

CodeLedger generates a force-directed knowledge graph of everything you've solved — with every problem as a node and edges connecting problems that share topics.

What you can see at a glance:
• Dense clusters = your strong areas (Arrays, Hash Tables, Binary Search)
• Sparse nodes = coverage gaps (Segment Trees, anyone?)
• Connected bridges = where topics overlap

Plus a full analytics dashboard:
📅 GitHub-style solve heatmap
🎯 Topic radar chart
🥧 Difficulty distribution
📈 Solve velocity over time

All of it hosted on your own GitHub Pages. All built from your own data. No third-party analytics account needed.

The dashboard updates automatically on every commit. Your stats are always current, on every device.

→ codeledger.vkrishna04.me

#DSA #LeetCode #Analytics #GitHub #DataVisualization

---

## Post 9 — Open Source + Contributing (Community CTA)

**Audience:** Developers | **Tone:** Inviting, direct

---

CodeLedger is open source and I need contributors.

Specifically for two features that a lot of people have asked for:

**1. GeeksForGeeks platform handler**
The contract is fully documented. LeetCode's handler is the reference implementation. If you know GFG's DOM structure and submission flow, this is a well-scoped, impactful first PR.

**2. Codeforces platform handler**
Same deal. Codeforces uses a different submission model (verdict polling vs. DOM observation) but the base class handles the heavy lifting.

Both are listed in `docs/FEATURE_REQUESTS.md` with acceptance criteria.

Beyond platform handlers — AI providers, canonical problem mapping, UI improvements, and the CLI importer are all open.

The stack:
• Pure ES6, no bundler
• Manifest V3 (Chrome + Firefox)
• Preact + htm
• Cloudflare Workers (Hono) for the backend

If you've been wanting to contribute to a real extension used by real developers — this is the one.

github.com/Life-Experimentalist/Code-Ledger

#OpenSource #JavaScript #BrowserExtension #Contributing #DSA

---

## Post 10 — v1.2 Release Announcement

**Audience:** Both | **Tone:** Launch energy, comprehensive

---

CodeLedger v1.2 is live. This is the biggest release yet.

Here's what's new:

🧠 **AI Behaviour Bank** — personal memory for your AI assistant. Save insights, define skills, build a learning roadmap. All context auto-injected into every chat.

🔄 **Cross-device AI chat sync** — every AI conversation committed as a markdown file. Available on every machine, always.

💾 **Rolling backups** — automatic snapshots of your problems and settings. Restore in one click.

🔁 **Deduplication engine** — finds duplicate solutions and generates AI merge proposals. Review and approve in a dedicated modal.

📤 **v2 repo layout migration** — new `problems/{slug}/` structure with a one-click migration tool for existing repos.

🛠️ **AI Review Queue** — queue missing reviews, re-queue all, cancel mid-run. Full control over review generation.

📊 **Heatmap full width** — responsive heatmap that fills the card and adapts to any screen size.

⚡ **MV3 service worker fixes** — dynamic imports removed; "Queue AI Reviews" and "Backup" now work correctly in production.

And a lot more — full list in CHANGELOG.

Available now on Chrome, Firefox, and Edge.
→ codeledger.vkrishna04.me

Drop a ⭐ on GitHub if this is useful: github.com/Life-Experimentalist/Code-Ledger

#OpenSource #LeetCode #GitHub #BrowserExtension #DSA #Release
