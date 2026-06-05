# Privacy Policy

**Last updated**: 2026-05-07

## Overview

CodeLedger does not collect, store, or transmit any personal data to CodeLedger servers. All problem data is stored in your browser and on GitHub (which you own and control).

---

## Data Collection

### What CodeLedger Stores (Locally)

**In your browser** (IndexedDB + Chrome storage):

- Problem history (title, code, language, difficulty, tags, metrics)
- GitHub repository settings (owner, repo name)
- GitHub OAuth access token (or manual PAT if you provide one)
- Optional AI provider API keys (Gemini, OpenAI, Claude, DeepSeek, OpenRouter)
- Sync metadata (last sync time, sync count)

**None of this data leaves your browser except to:**

1. Your GitHub repository (you own it)
2. Optional AI providers (only if you enable AI review and provide an API key)

### What CodeLedger Does NOT Do

- ❌ Collect usage analytics or metrics
- ❌ Track your browsing activity
- ❌ Store your code on CodeLedger servers
- ❌ Sell or share your data
- ❌ Use cookies or tracking pixels
- ❌ Make requests to external servers (except GitHub + optional AI providers)
- ❌ Require account creation on our servers

---

## Third-Party Services

### GitHub

**What is shared**: Your solved problem code and metadata (problem description, difficulty, etc.)

**Where it goes**: Your GitHub repository (you own it)

**Your control**: You can delete commits, change privacy settings, or delete the repo at any time

**Privacy**: See [GitHub's Privacy Policy](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement)

### AI Providers (Optional)

CodeLedger supports six AI providers for code review. **You choose which one to use and provide your own API key** (Bring Your Own Key model).

**If you enable AI review**, your code is sent to your chosen provider:

| Provider             | Data Sent                  | Privacy Policy                                         | Your Control              |
| -------------------- | -------------------------- | ------------------------------------------------------ | ------------------------- |
| **Google Gemini**    | Problem code               | [Google Privacy](https://policies.google.com/privacy)  | Disable AI review anytime |
| **OpenAI**           | Problem code               | [OpenAI Privacy](https://openai.com/privacy)           | Disable AI review anytime |
| **Anthropic Claude** | Problem code               | [Anthropic Privacy](https://www.anthropic.com/privacy) | Disable AI review anytime |
| **DeepSeek**         | Problem code               | [DeepSeek Privacy](https://www.deepseek.com/privacy)   | Disable AI review anytime |
| **Ollama**           | Problem code (stays local) | No external server                                     | Runs on your machine only |
| **OpenRouter**       | Problem code               | [OpenRouter Privacy](https://openrouter.ai/privacy)    | Disable AI review anytime |

**You are responsible for**:

- Providing your own API keys (never shared with CodeLedger)
- Understanding each provider's data retention policy
- Agreeing to each provider's terms of service

### Cloudflare Worker

**What is shared**: GitHub authorization code (temporary)

**Where it goes**: https://codeledger.vkrishna04.me (Cloudflare Worker)

**What happens**:

1. You click "Connect GitHub"
2. GitHub authorization window opens
3. You approve CodeLedger access
4. GitHub redirects to our worker with an authorization code
5. Worker exchanges code for access token
6. Worker returns token to your extension via postMessage
7. **Token never stored on our worker** — returned immediately to your browser

**Worker does NOT**:

- Store your token
- Store your code
- Log your activity
- Sell your data

**Privacy**: See [Cloudflare Privacy Policy](https://www.cloudflare.com/privacy/)

---

## Browser Storage Security

### IndexedDB (Problem History)

- Stored in your browser profile
- Protected by your browser's encryption
- Protected by your OS (Windows BitLocker, macOS FileVault, etc.)
- Deleted when you uninstall the extension

### chrome.storage.local (Settings + Tokens)

- Stored in your browser profile
- Same security as IndexedDB
- GitHub OAuth token stored securely (not plain text)
- AI API keys stored securely (not plain text)
- Cleared when you uninstall or clear extension data

---

## Your Rights

### Access

You can view all data CodeLedger stores:

- **Problem history**: Right-click extension → "Open extension options" → "Sync" tab
- **GitHub settings**: Same → "GitHub" tab
- **AI keys**: Same → "Settings" → "AI provider"

### Delete

You can delete all data:

- **Uninstall extension**: Clears all IndexedDB + chrome.storage data
- **Clear data button**: Settings → "Clear all data" → confirms deletion

You can also:

- Delete specific problems from "Sync" tab
- Delete your GitHub repository (removes commits)
- Revoke GitHub OAuth access (GitHub → Settings → Applications)

### Disable Features

- Disable AI review: Settings → "AI enabled" toggle off
- Don't provide GitHub PAT: Use OAuth instead (token never stored)
- Don't provide AI keys: Extension works without them

---

## Children & COPPA

CodeLedger is designed for developers solving DSA problems. **If you are under 13**, you may need parental consent to:

- Create a GitHub account
- Use optional AI providers

See GitHub's [Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service) and each AI provider's terms.

---

## Changes to This Policy

We may update this privacy policy to reflect changes in our service. If we make material changes, we will:

- Update the date at the top of this document
- Notify you via GitHub release notes or email (if we contact you)

Your continued use of CodeLedger after changes means you accept the new policy.

---

## Contact Us

For privacy questions or concerns:

- **Email**: github@vkrishna04.me
- **GitHub Issues**: https://github.com/Life-Experimentalist/Code-Ledger/issues/new
- **GitHub Discussions**: https://github.com/Life-Experimentalist/Code-Ledger/discussions

We will respond within 7 business days.

---

## Summary for Store Reviews

**CodeLedger privacy in 30 seconds:**

CodeLedger stores all data locally in your browser. It commits code to your GitHub repository (which you own). If you enable optional AI review, your code goes to your chosen AI provider. We do not collect analytics, sell data, or use tracking. Your browser and operating system protect all stored data with encryption.

---

**License**: Apache 2.0
**Last updated**: 2026-05-07
**Version**: 1.1.0
