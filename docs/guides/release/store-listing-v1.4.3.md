# CodeLedger — Store Listing Content (v1.4.3)

Copy-paste content for Chrome Web Store, Edge Add-ons, and Firefox AMO.
Screenshots are in `src/assets/images/`.

---

## 1. Chrome Web Store

**Dashboard URL:** https://chrome.google.com/webstore/devconsole

### Extension name
```
CodeLedger
```

### Short description (132 chars max)
```
Auto-commit every DSA solve from LeetCode, GFG & Codeforces to your GitHub repo. AI review, analytics, and conflict sync included.
```

### Detailed description
```
CodeLedger automatically commits every accepted DSA problem you solve — from LeetCode, GeeksForGeeks, and Codeforces — to a GitHub repository you own. No copy-paste, no manual uploads. Just solve, and the commit appears.

✦ AUTOMATIC COMMITS
Solved a problem? CodeLedger detects the accepted submission, captures your code, and commits it to GitHub in a single atomic operation. Works across LeetCode, GFG (alpha), and Codeforces (alpha).

✦ AI CODE REVIEW
Optional AI review (Gemini, ChatGPT, Claude, DeepSeek, or Ollama) runs after every accepted solve. Reviews appear in the library panel and are committed alongside your solution. A floating AI chat panel on each problem page lets you ask follow-up questions.

✦ LIBRARY & ANALYTICS
Browse all your saved solutions in the built-in Library side panel. Filter by platform, difficulty, language, or tag. View rolling 7/30-day solve counts, a monthly activity chart, a day-of-week heatmap, and a per-language breakdown.

✦ KNOWLEDGE GRAPH (GRAPHIFY)
Visualise connections between problems by topic, difficulty, and tag clusters in an interactive force-directed graph — powered by Graphify.

✦ CROSS-DEVICE SYNC
Solutions sync between devices via your GitHub repo. Conflict resolution is handled by a step-by-step modal that classifies same-code vs. different-approach conflicts and lets you keep either version — or both.

✦ PROFILE IMPORT
Bulk-import your entire LeetCode solution history in one click. Existing problems merge intelligently.

✦ YOUR DATA, YOUR REPO
CodeLedger writes to a repository you own. No proprietary servers store your code. Authentication uses GitHub OAuth — no tokens stored in unsafe locations.

SUPPORTED PLATFORMS
• LeetCode (stable)
• GeeksForGeeks (alpha)
• Codeforces (alpha)

AI PROVIDERS
• Google Gemini · OpenAI · Anthropic Claude · DeepSeek · Ollama (local)

PERMISSIONS USED
• storage — save settings and problem cache locally
• alarms — schedule background sync reminders
• tabs — open the library panel and OAuth popup
• scripting — inject commit indicators on coding platforms
• webRequest — detect accepted submissions
• Host permissions — limited to supported coding platforms and their APIs

Open-source · Apache 2.0 License · https://codeledger.vkrishna04.me
```

### Category
`Developer Tools`

### Language
`English (United States)`

### Screenshots — order and captions

| #   | File                            | Caption                                                                   |
| --- | ------------------------------- | ------------------------------------------------------------------------- |
| 1   | `popup.png`                     | One-click access: live sync status and quick actions from the popup       |
| 2   | `Solutions Library Tab.png`     | Browse every solved problem — filter by platform, difficulty, or language |
| 3   | `Analytics Library Tab.png`     | Rolling stats, monthly activity chart, day-of-week heatmap                |
| 4   | `AI Chat Leetcode.png`          | Floating AI panel: get guided hints or a direct review on any problem     |
| 5   | `Graph Library Tab.png`         | Knowledge graph: visualise topic clusters and connections                 |
| 6   | `User Report.png`               | Per-language and per-difficulty breakdown across your full history        |
| 7   | `User Repo auto Maintained.png` | Your GitHub repo — kept in sync automatically                             |
| 8   | `conflict ui.png`               | Step-by-step conflict resolution when merging from multiple devices       |
| 9   | `Portfolio Integration.png`     | Portfolio integration: your solve history embeddable anywhere             |
| 10  | `Problems Modal.png`            | Rich problem detail: code, AI review, tags, and edit in place             |

### Promotional images (if required)
- **Small tile (440×280):** use `social preview.png` cropped or `icon-dark-bg.png` centered on dark bg
- **Marquee (1400×560):** use `social preview.png`

### Privacy policy URL
```
https://codeledger.vkrishna04.me/privacy
```

### Homepage URL
```
https://codeledger.vkrishna04.me
```

### Upload
- **File:** `releases/1.4.3/codeledger-chromium-v1.4.3.zip`

---

## 2. Microsoft Edge Add-ons

**Dashboard URL:** https://partner.microsoft.com/en-us/dashboard/microsoftedge/

Edge uses the same Chromium zip. All text fields below are identical to Chrome Web Store — copy from Section 1. Differences noted.

### Upload
- **File:** `releases/1.4.3/codeledger-chromium-v1.4.3.zip` (same zip as Chrome)

### Edge-specific fields

**Store listing language:** English (United States)

**Extension name:** `CodeLedger`

**Short description (300 chars max — more room than Chrome):**
```
Auto-commit every solved DSA problem from LeetCode, GeeksForGeeks, and Codeforces to your own GitHub repository. Built-in AI code review, knowledge graph, rolling analytics, and cross-device conflict sync.
```

**Long description:** (same as Chrome detailed description above)

**Category:** `Developer tools`

**Website URL:** `https://codeledger.vkrishna04.me`

**Privacy policy URL:** `https://codeledger.vkrishna04.me/privacy`

**Screenshots:** same order and files as Chrome (Edge accepts 1280×800 or 640×400 screenshots)

---

## 3. Firefox Add-ons (AMO)

**Dashboard URL:** https://addons.mozilla.org/en-US/developers/

### Upload
- **Extension file:** `releases/1.4.3/codeledger-firefox-v1.4.3.zip`
- **Source code (required if minified/bundled — check "yes, submit source"):** `releases/1.4.3/codeledger-source-v1.4.3.zip`

> AMO requires source upload when your extension contains code that is "not human-readable". CodeLedger has no bundler/transpiler, so source may not be required — but upload the source zip anyway to avoid review delays.

### Name
```
CodeLedger
```

### Summary (250 chars max)
```
Auto-commit every accepted DSA solve from LeetCode, GFG & Codeforces to your own GitHub repo. Includes AI review, analytics, knowledge graph, and cross-device sync.
```

### Description
```
CodeLedger automatically commits every accepted DSA problem you solve to a GitHub repository you own — no copy-paste, no manual uploads.

✦ AUTOMATIC COMMITS
Detected on LeetCode (stable), GeeksForGeeks (alpha), and Codeforces (alpha). Each accepted submission is committed atomically via the GitHub Trees API.

✦ AI CODE REVIEW
Choose from Gemini, GPT-4o, Claude, DeepSeek, or a local Ollama model. Reviews are saved with your solution and a floating chat panel lets you ask follow-up questions directly on the problem page.

✦ LIBRARY & ANALYTICS
Side-panel library with search, filters, rolling 7/30-day stats, monthly activity chart, day-of-week heatmap, and per-language breakdown.

✦ KNOWLEDGE GRAPH
Interactive force-directed graph visualises topic clusters and problem connections across your full solve history.

✦ CROSS-DEVICE SYNC & CONFLICT RESOLUTION
Solutions sync between devices via your repo. A step-by-step conflict modal resolves same-code vs. different-approach conflicts — keep local, remote, or both.

✦ BULK PROFILE IMPORT
Import your entire LeetCode or GFG history in one click.

Your data lives in your own GitHub repo. No third-party servers store your code. Open-source (MIT) — https://codeledger.vkrishna04.me
```

### Categories
- `Developer Tools`

### Add-on homepage
```
https://codeledger.vkrishna04.me
```

### Support site
```
https://github.com/VKrishna04/codeledger/issues
```

### Screenshots — same files as Chrome, same order

### Gecko ID (already in manifest)
```
codeledger@vkrishna04.me
```

### Firefox minimum version (already in manifest)
```
109.0
```

### Source code note for reviewers
```
This extension uses no bundler or transpiler — all JS is plain ES6 modules loaded directly by the browser. The source zip is identical to the extension zip but includes dev tooling (node_modules excluded). Entry points: src/background/service-worker.js, src/content/handler-loader.js, src/popup/popup.js, src/library/library.js.
```

---

## Screenshots reference

All screenshots are in `src/assets/images/`. Minimum Chrome/Edge upload size is 1280×800. Firefox minimum is 400×300 (recommended 1280×800).

| File                            | What it shows                                      |
| ------------------------------- | -------------------------------------------------- |
| `popup.png`                     | Extension popup with sync status                   |
| `Solutions Library Tab.png`     | Problems list with filters                         |
| `Analytics Library Tab.png`     | Analytics dashboard                                |
| `AI Chat Leetcode.png`          | Floating AI chat on LeetCode                       |
| `Graph Library Tab.png`         | Knowledge graph view                               |
| `Current Graphify Graph.png`    | Alternative graph view (use if higher resolution)  |
| `User Report.png`               | Stats report card                                  |
| `User Repo auto Maintained.png` | GitHub repo structure auto-maintained by extension |
| `conflict ui.png`               | Conflict resolution wizard                         |
| `Portfolio Integration.png`     | Portfolio / external embed view                    |
| `Problems Modal.png`            | Problem detail modal with AI review                |

> Note: Screenshots must be 1280×800 or 640×400 for Chrome. If any image is a different size, resize before uploading — do not stretch.
