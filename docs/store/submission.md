# Store Submission Checklist

Complete requirements and checklist for submitting CodeLedger to Chrome Web Store and Firefox Add-ons.

---

## Overview

CodeLedger will be submitted to:

1. **Chrome Web Store** (codeledger by VKrishna04) — 🟡 **Coming Soon** (not yet published)
2. **Firefox Add-ons** (codeledger) — 🟡 **Coming Soon** (not yet published)
3. **Microsoft Edge Add-ons** (CodeLedger) — 🔮 **Future** (will publish in future releases)

This document provides comprehensive submission requirements for all three stores. Chrome and Firefox submissions are in progress; Edge will be published in a future release.

---

## Pre-Submission Checklist

Before uploading to any store, verify:

### Code & Build

- [ ] All tests pass:
pm run lint
- [ ] No TypeScript errors: 	sc --noEmit
- [ ] Build succeeds:
pm run build
- [ ] Zips are valid: unzip -t releases/*.zip
- [ ] Working directory clean: git status
- [ ] Latest commit tagged and pushed: git log --oneline -1

### Security

- [ ] No hardcoded credentials in code
- [ ] No network calls to analytics/tracking servers
- [ ] No user data leaves extension except to GitHub + optional AI providers (with user consent)
- [ ] OAuth tokens stored securely (only in uth.tokens, not settings)
- [ ] AI API keys stored securely (only in i.keys)
- [ ] CSP is strict (no inline scripts, no unsafe-eval)

### Functionality

- [ ] OAuth flow works (test with real GitHub account)
- [ ] Commit creation works (test on real problem)
- [ ] AI review works (if enabled)
- [ ] Dashboard loads and updates
- [ ] Settings persist across browser sessions
- [ ] Uninstall/reinstall preserves no data (clean uninstall)
- [ ] Works on latest Chrome, Firefox, Edge, Brave

### Documentation

- [ ] README.md is complete and user-friendly
- [ ] archive/changelog.md is up-to-date
- [ ] Icons are present (16, 32, 48, 128px)
- [ ] No broken links in documentation

---

## Chrome Web Store

### Account Requirements

- [ ] Google account (use Gmail or Google Workspace)
- [ ] Developer account registered at [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole)
- [ ] Payment information on file ( one-time registration fee already paid)
- [ ] Identity verified (Google may ask for ID)

### Store Listing

**Store URL**: https://chrome.google.com/webstore/detail/codeledger/

#### Title

`
CodeLedger
`

Length: 45 characters (Chrome: max 50)

#### Short Description

`
Track and commit all your solved DSA problems to GitHub automatically.
`

Length: 70 characters (Chrome: max 132)

#### Full Description

`
CodeLedger automatically commits every solved DSA problem from LeetCode, GeeksForGeeks, and Codeforces to your GitHub repository — code, problem statement, AI review, all zero-click.

## What You Get

⚡ **Zero-click commits** — Every accepted submission is committed to your GitHub the instant it's accepted.

🤖 **Instant AI review** — Get complexity analysis, hints, and optimization suggestions. Supports Gemini, OpenAI, Claude, DeepSeek, Ollama, and OpenRouter.

📊 **Dashboard** — GitHub-style heatmap, difficulty breakdown, solve velocity chart, and searchable problem table.

🕸️ **Knowledge graph** — Force-directed graph of everything you've solved, linked by topic.

🌍 **Multi-platform** — LeetCode, GeeksForGeeks, and Codeforces work out of the box. Bulk-import your entire LeetCode history in one click.

💬 **AI chat panel** — Floating chat on every problem page. Ask about complexity, request hints, paste errors — all with your code pre-loaded.

🔒 **100% yours** — Your data goes to your GitHub repo, period. No sign-ups, no tracking, no scraping.

## Setup (2 minutes)

1. Click the CodeLedger icon in your toolbar.
2. Click "Connect GitHub" — authorize via OAuth.
3. Set a repo name (e.g., "my-dsa-solutions").
4. Solve a problem. Check your GitHub. That's it.

Optional: Add an AI provider API key in Settings → AI to unlock code reviews.

## Supported Platforms

- LeetCode
- GeeksForGeeks
- Codeforces

## Supported AI Providers

- Google Gemini (default, free tier available)
- OpenAI (GPT-4o, o3-mini, …)
- Anthropic Claude
- DeepSeek
- Ollama (local, no key needed)
- OpenRouter (100+ models)

## Privacy

Your data is committed to your GitHub repository, which you own and control. CodeLedger never stores your code on our servers. GitHub OAuth is handled securely via our Cloudflare Worker — your access token never touches our servers beyond the handshake.

## Support

- GitHub Issues: https://github.com/Life-Experimentalist/Code-Ledger/issues
- Documentation: https://github.com/Life-Experimentalist/Code-Ledger#readme

## License

Apache 2.0
`

Length: ~1,400 characters (Chrome: max 4,000)

#### Category

- **Category**: Productivity
- **Content rating**: General Audiences (no adult content)

#### Language

- Default: English
- (Add other languages if translated)

#### Screenshots

**Desktop screenshots** (5 recommended, 2 minimum):

1. **Welcome/Setup** (showing popup and connection flow)
   - Size: 1280×800 or 640×400
   - Show: "Connect GitHub" button, repo setup

2. **Problem Detection** (showing extension on problem page)
   - Show: Problem title, extension detecting it, submit button

3. **Dashboard** (main library view)
   - Show: Heatmap, problem list, stats
   - Highlight: visual design, all-problems table

4. **Knowledge Graph** (force-directed graph view)
   - Show: Nodes colored by difficulty, links by topic

5. **AI Review** (problem with AI-generated review)
   - Show: Code, README, ai-review.md side-by-side

**Best practices**:
- Use real UI screenshots (not mockups)
- Highlight key features
- Use English text (add captions if needed)
- Include cursor/pointer to show interaction

#### Icon & Branding

- **Extension icon**: src/icons/icon-128.png (required, 128×128)
- **Marquee image**: 1400×560 (optional, header image on store listing)

#### Permissions Justification

For each permission listed, provide brief explanation:

`
Storage: Saves problem history and GitHub settings to your browser
Tabs: Checks which problem page you're viewing
Scripting: Detects when you solve problems on supported platforms
Alarms: Syncs with GitHub periodically (1-hour intervals)
`

#### Official URL

- **Website**: https://codeledger.vkrishna04.me
- **Support email**: github@vkrishna04.me
- **Privacy policy**: https://github.com/Life-Experimentalist/Code-Ledger/blob/main/PRIVACY.md (create this)

#### Submission Checklist

- [ ] Version number updated in manifest.json
- [ ] All permissions justified
- [ ] Screenshots uploaded (5 or 6)
- [ ] Description proofread
- [ ] No "placeholder" or "beta" language
- [ ] Links to privacy policy + support
- [ ] Review guidelines read and understood

### Uploading to Chrome Web Store

1. Go to [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole)
2. Click **+ Create new item**
3. Drag & drop codeledger-chrome-vX.Y.Z.zip into upload area
4. Fill in store listing fields (see above)
5. Upload screenshots
6. Set pricing: **Free**
7. Choose regions to distribute (leave as is for worldwide)
8. Click **Submit for review**

### Review Timeline

- **Processing time**: 1–7 days typically
- **Review feedback**: Check email for updates
- **Common rejections**: Missing privacy policy, unclear permissions, broken links
- **Resubmit**: Fix issues and reupload same zip

### After Approval

- [ ] Extension appears in Chrome Web Store
- [ ] Share store link on social media + README.md
- [ ] Monitor reviews and ratings
- [ ] Respond to user feedback and bug reports

---

## Firefox Add-ons

### Account Requirements

- [ ] Mozilla account (register at [addons.mozilla.org](https://addons.mozilla.org))
- [ ] Developer account verified (email verification)
- [ ] (No payment required for free add-ons)

### Store Listing

**Store URL**: https://addons.mozilla.org/firefox/addon/codeledger/

#### Name

`
CodeLedger
`

#### Summary

`
Automatically commit solved DSA problems from LeetCode, GeeksForGeeks, and Codeforces to your GitHub repository.
`

Length: max 250 characters

#### Description

`
CodeLedger automatically commits every solved DSA problem to your GitHub repository — code, problem statement, AI review, all zero-click.

What You Get:

⚡ Zero-click commits — Every accepted submission commits instantly.
🤖 Instant AI review — Gemini, OpenAI, Claude, DeepSeek, Ollama, OpenRouter.
📊 Dashboard — Heatmap, stats, searchable problem table.
🕸️ Knowledge graph — See your strengths and gaps at a glance.
🌍 Multi-platform — LeetCode, GeeksForGeeks, Codeforces.
💬 AI chat — Ask questions with your code pre-loaded.
🔒 100% yours — Your data, your repo, no tracking.

Setup:
1. Click the CodeLedger icon
2. Connect GitHub (OAuth)
3. Set a repo name
4. Solve a problem and watch it commit

Optional: Add an AI API key in Settings → AI for code reviews.

Supported Platforms:
- LeetCode
- GeeksForGeeks
- Codeforces

Supported AI Providers:
- Google Gemini (default, free)
- OpenAI
- Anthropic Claude
- DeepSeek
- Ollama (local)
- OpenRouter

Privacy:
Your code is committed to your GitHub repository only. CodeLedger never stores your code on our servers. GitHub OAuth is handled securely via Cloudflare Workers.

License: Apache 2.0
GitHub: https://github.com/Life-Experimentalist/Code-Ledger
Support: github@vkrishna04.me
`

#### Category

- **Category**: Productivity
- **Type**: Extension
- **Operating System**: All (no platform restriction)

#### Screenshots

Same as Chrome Web Store (see above). Firefox accepts:

- Size: 1280×800 (optimal) or 640×400 (minimum)
- Format: PNG, JPEG
- 5–6 recommended
- English captions welcome

#### Icon & Branding

- **Icon**: src/icons/icon-128.png (required, 128×128)
- **Featured image**: 32×32, 48×48 (optional)

#### Permissions

Firefox requires explicit user permission for each capability:

`
Access your data for sites in leetcode.com, geeksforgeeks.org, codeforces.com
Access your data for all websites  // only to check domain in popup
Access your browser tabs
Read and modify stored settings
Read and modify data on your GitHub.com account  // explain clearly
`

For each, provide justification:

`
"Tabs" permission: To detect which problem page you're viewing
"Storage" permission: To save problem history and GitHub settings
"GitHub access": To commit solved problems to your repository
`

#### Submission Checklist

- [ ] Version in manifest.json matches version in submission
- [ ] No Mozilla-specific restrictions violated
- [ ] Icons uploaded (48×48, 96×96, 128×128)
- [ ] Screenshots uploaded and captioned
- [ ] All links tested and working
- [ ] Privacy policy URL included
- [ ] Support contact included
- [ ] Review guidelines read

### Uploading to Firefox Add-ons

1. Go to [Add-ons Developer Hub](https://addons.mozilla.org/developers/addons)
2. Click **Submit a New Add-on**
3. Choose **On-site**
4. Upload codeledger-firefox-vX.Y.Z.zip
5. Fill in store listing (see above)
6. Upload screenshots
7. Set version number (must match manifest)
8. Click **Submit**

### Review Process

- **Automated checks**: Extension security/permissions scan (immediate)
- **Human review**: Code review by Mozilla team (1–5 days)
- **Common issues**:
  - Missing privacy policy (create one)
  - Overly broad permissions (narrow scope)
  - Unclear descriptions (be specific)
  - Broken links (test all URLs)

### After Approval

- [ ] Add-on appears on addons.mozilla.org
- [ ] Share link on social media
- [ ] Monitor reviews and user feedback
- [ ] Respond to bug reports

---

## Microsoft Edge Add-ons (Future Release)

**Status**: 🔮 **Not Yet Published** — Will be published in a future release

Edge Add-ons store uses the same Manifest V3 API as Chrome, so the same zip file can be submitted to both stores.

### When to Submit to Edge

Target: **v1.3.0 or later** (after Chrome & Firefox launch success)

### Submission Process

1. Go to [Microsoft Edge Add-ons Developer Dashboard](https://partner.microsoft.com/dashboard/microsoftedge)
2. Create developer account (requires Microsoft account)
3. Click **Create new extension**
4. Upload `codeledger-chrome-vX.Y.Z.zip` (same as Chrome)
5. Fill in store listing (same fields as Chrome Web Store, see above)
6. Upload screenshots (same as Chrome)
7. Submit for review

### Store Listing Requirements

**Same as Chrome Web Store** — Edge uses identical:
- Title format
- Description
- Screenshots
- Category (Productivity)
- Permissions justification

### Review Timeline

- **Processing**: 1–3 days (typically faster than Chrome)
- **Feedback**: Check dashboard for review comments
- **Resubmit**: Fix issues and reupload

### After Approval

- Add-on appears on [Microsoft Edge Add-ons store](https://microsoftedge.microsoft.com/addons)
- Share announcement: "Now available on Edge Add-ons!"
- Monitor reviews same as other stores

---

## Privacy Policy

Create PRIVACY.md at repository root:

`markdown
# Privacy Policy

## Data Collection

CodeLedger does not collect, store, or transmit any personal data to CodeLedger servers.

### What CodeLedger Stores

**Locally (in your browser)**:
- Problem history (IndexedDB)
- GitHub settings (Chrome storage)
- GitHub OAuth token (secure storage)
- AI API keys (if you provide them)

**On GitHub (you control)**:
- Problem code
- Problem statement
- AI review (if enabled)
- Repository metadata

### What CodeLedger Does NOT Do

- ❌ Track your browsing
- ❌ Collect usage metrics
- ❌ Store your code on our servers
- ❌ Sell or share your data
- ❌ Use cookies or analytics scripts
- ❌ Make requests to third parties (except GitHub + optional AI providers)

### Third-Party Services

**GitHub API** — If you use CodeLedger, your code is committed to GitHub, which you own and control. See [GitHub's Privacy Policy](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement).

**AI Providers** (optional) — If you enable AI review and provide an API key:
- **Google Gemini** — Your code is sent to Google. See [Google Privacy Policy](https://policies.google.com/privacy)
- **OpenAI** — Your code is sent to OpenAI. See [OpenAI Privacy Policy](https://openai.com/privacy)
- **Anthropic Claude** — Your code is sent to Anthropic. See [Anthropic Privacy Policy](https://www.anthropic.com/privacy)
- Similar for DeepSeek, Ollama (local), OpenRouter

Each AI provider has its own data retention and privacy terms. You can disable AI review at any time.

### Cloudflare Worker

CodeLedger uses a Cloudflare Worker at codeledger.vkrishna04.me to handle GitHub OAuth. The worker:
- Receives your GitHub authorization code
- Exchanges it for a GitHub access token
- Returns the token to your extension via postMessage
- Does NOT store your token or code

See [Cloudflare Privacy Policy](https://www.cloudflare.com/privacy/).

## Contacting Us

For privacy concerns or questions:
- **Email**: github@vkrishna04.me
- **GitHub Issues**: https://github.com/Life-Experimentalist/Code-Ledger/issues

---

Last updated: 2026-05-07
`

---

## Pre-Launch Checklist

### Code & Quality

- [ ] Lint passes:
pm run lint
- [ ] Build succeeds:
pm run build
- [ ] No console errors in DevTools (when extension runs)
- [ ] Tested on Chrome 120+
- [ ] Tested on Firefox 121+
- [ ] Tested on Edge (Chromium-based)
- [ ] Tested on Brave (Chromium-based)

### Functionality

- [ ] OAuth works (real GitHub account test)
- [ ] Problem detection on LeetCode
- [ ] Problem detection on GeeksForGeeks
- [ ] Problem detection on Codeforces
- [ ] Commits appear on GitHub
- [ ] Metrics (runtime/memory) captured
- [ ] AI review optional (not required)
- [ ] Dashboard loads
- [ ] Settings persist
- [ ] Uninstall removes all data

### Documentation

- [ ] README.md complete
- [ ] archive/changelog.md up-to-date
- [ ] PRIVACY.md created and linked
- [ ] CODE_OF_CONDUCT.md present
- [ ] SECURITY.md present
- [ ] architecture/README.md present
- [ ] All links tested (no 404s)

### Store-Specific

**Chrome Web Store**:
- [ ] Screenshots uploaded (5 minimum)
- [ ] Icon provided (128×128)
- [ ] Description proofread
- [ ] Permissions justified
- [ ] Store URL set
- [ ] Support email visible

**Firefox Add-ons**:
- [ ] Screenshots uploaded (5 minimum)
- [ ] Icons provided (48, 96, 128)
- [ ] Description proofread
- [ ] Privacy policy linked
- [ ] Support email visible
- [ ] Version matches manifest.json

### Legal

- [ ] LICENSE.md present (Apache 2.0)
- [ ] PRIVACY.md present
- [ ] CODE_OF_CONDUCT.md present
- [ ] SECURITY.md present
- [ ] No trademark/brand infringement in description

---

## Post-Launch

### First Week

- [ ] Monitor both stores for reviews
- [ ] Check for crash reports
- [ ] Respond to user feedback
- [ ] Fix any critical bugs (submit hotfix)
- [ ] Announce release on GitHub + social media

### Ongoing

- [ ] Update stores with new releases (same process)
- [ ] Keep archive/changelog.md current
- [ ] Respond to user issues
- [ ] Monitor store ratings + comments
- [ ] Security updates: prioritize and release ASAP

---

**Last updated**: 2026-05-07
**Version**: 1.1.0
