# Privacy Policy for Code Ledger

**Last updated**: August 2026

## 1. Introduction and Scope

This Privacy Policy describes how **Code Ledger** ("we," "our," or "the Extension"), a browser extension designed to help software developers track and commit solved Data Structures and Algorithms (DSA) problems to their own repositories, handles user data.

We take your privacy extremely seriously. Code Ledger is designed from the ground up as a **local-first** application. Your code and authentication credentials belong entirely to you, and we do not operate any proprietary servers to collect, store, or transmit your personal data.

By installing and using the Code Ledger extension, you agree to the data practices described in this policy.

---

## 2. Types of Data We Process

Because Code Ledger runs entirely within your browser context, the following categories of data are processed and stored locally on your device:

1. **Authentication Information**:
   - GitHub OAuth Access Tokens, or a GitHub Personal Access Token if you supply one instead (stored to commit your solutions).
   - Optional AI Provider API Keys (e.g., Google Gemini, OpenAI, Anthropic Claude, DeepSeek, OpenRouter) if you choose to enable automated AI reviews.

2. **Problem and Solution Data**:
   - Problem details: Title, slug, platform (LeetCode, GeeksForGeeks, Codeforces), difficulty level, and tags.
   - Code submissions: The source code of your solved problems.
   - Execution metrics: Time/memory usage and runtime percentiles.
   - User notes: Any manual study notes or descriptions you add.

3. **AI Chat History**:
   - Local records of conversations with the AI Assistant.

4. **Integration Settings**:
   - Target repository names, sync status, and feature toggle preferences.

5. **Streak State**:
   - Vacation days you have taken and which achievements you have already been shown.

6. **Party List**:
   - If you use the party comparison, the list of friends' repositories you added. It is a list of public repository names held on your side; nobody is told that you added them.

So a second browser can pick up where the first left off, some of this is also written into your own repository, in a `.codeledger/` folder beside your solutions:

- `sync.json` and `config.json` — your settings and your party list.
- `behaviour-bank.json` — the behaviour bank: solve times, attempt counts, hint views, and short summaries of what an AI review flagged. Settings → Advanced turns the recording off.
- `roadmaps.json` and `knowledge.json` — the learning roadmaps and saved insights you and the AI assistant write in the Behaviour Bank tab.

Your GitHub token, your AI API keys and your streak state are deliberately excluded and never leave your device. Everything else in that folder is as public as the repository you chose: if the repository is public, so is it.

---

## 3. How Data is Collected

All data is collected directly from your active inputs and browser interactions:

- **Direct Input**: API keys, repository settings, and personal notes are provided directly by you in the Settings panel.
- **Browser Automation**: When you submit a correct solution on LeetCode, GeeksForGeeks, or Codeforces, the content script reads the active page elements (problem statement, difficulty, and your submitted code) to automatically save them to your local database.
- **OAuth Authentication**: During GitHub authentication, you are redirected to our temporary authentication relay (a secure Cloudflare Worker) to exchange an authorization code for an access token. This token is instantly sent back to your browser and is never stored, logged, or saved on our worker.

---

## 4. Purpose of Collection and Data Usage

We process your data strictly to provide the extension's core features:

- **Git Commits**: To automatically commit your solved problems, readme files, and notes to your designated GitHub repository.
- **AI Reviews & Chat**: To submit your code to your configured AI model (Gemini, Claude, etc.) to receive automated code analysis and answer your follow-up questions.
- **Local Dashboard**: To build your library search index, activity heatmaps, language breakdowns, and solve history in the Library sidebar.
- **Opt-in Telemetry**: If you explicitly opt-in to "Anonymous Usage Stats" in settings, the extension sends a minimal payload containing `{ platform: "leetcode" | "geeksforgeeks" | "codeforces", version: "<extension version>" }` to a hit counter at `counter.vkrishna04.me` to help us track active installations. **No personal details, tokens, repository names, or code are ever sent.** Telemetry is off by default.

---

## 5. Data Storage, Security, and Retention

- **Local Storage**: All authentication tokens, API keys, solve history, and AI chats are saved in your browser's sandboxed `IndexedDB` and `chrome.storage.local` environment.
- **Security**: The browser's extension storage boundary isolates this data — other sites and other extensions cannot read it. It is **not** separately encrypted at rest, so anyone with access to your operating system profile can read it, exactly as with the rest of your browser profile.
- **Retention**: We retain your local data indefinitely to maintain your solve history. You can purge all data at any time by clicking the "Clear all data" button in the advanced settings tab or by uninstalling the extension.
- **Remote Copies**: Commits pushed to your GitHub repository are retained according to your repository settings and must be managed or deleted directly through GitHub.

---

## 6. Data Sharing, Transfer, and Disclosure

We maintain a strict **zero-sharing policy**. We do not sell, rent, trade, or share your data with advertisers, data brokers, or any third parties. Data is only transferred to external services that you explicitly configure:

- **GitHub API**: Used to push commits directly to your personal repository. [GitHub Privacy Policy](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement).
- **AI Providers (Optional)**: If you choose to enable AI Reviews, your code and problem statements are sent to your selected provider (e.g., Google, OpenAI, Anthropic) using your personal API key. Your data is subject to the privacy terms of the specific provider you select.
- **Ollama (Optional)**: If you use Ollama, data is processed locally on your own machine.
- **mermaid.ink (Optional)**: When an AI response contains a Mermaid diagram, the extension shows the diagram's source code and a **Render diagram** button. Only if you press that button is the diagram source sent to `mermaid.ink` to be drawn as an image. Nothing is sent otherwise. [Mermaid Live Editor](https://mermaid.live).
- **CodeLedger authentication service**: `codeledger.vkrishna04.me` performs the GitHub OAuth exchange. It receives the temporary authorization code GitHub issues, exchanges it for your access token, and returns that token to the extension. The token is stored on your device only — the service does not retain it, and no solve data ever passes through it.
- **shields.io (Optional, off by default)**: Streak badges are generated as SVG files committed to your own repository, with nothing in the middle. If you switch the badge style to shields under Settings → Streaks, your README loads badge images from `shields.io`, which reads the numbers from a small JSON file in your repository — so shields learns your repository URL and sees one request per README view. It receives no code and no token, and switching back stops it. [Shields privacy](https://github.com/badges/shields/blob/master/PRIVACY.md).
- **raw.githubusercontent.com (Optional, only once you add a friend)**: The party comparison reads each added repository's public `badges/stats.json` with an anonymous request — no token is sent, and nothing of yours is uploaded. GitHub therefore sees your IP address asking for their file. The people you add are not notified, and removing everyone from the list stops the requests.
- **The CodeLedger compare page (Optional, only if you share a link)**: The share button builds a URL of the form `/compare?repos=owner/repo,…`. That page holds no state — it reads the repositories named in the link directly from GitHub in the visitor's own browser. The repository names do appear in the request line to our server, as they do in any URL, and anyone you send the link to can open it.

Separately from any third party: if your ledger repository is **public**, then your solutions, your solve history, your streak badges and the generated GitHub Pages site can be read by anyone with the link. That is a property of the repository you chose rather than anything the extension transmits elsewhere, and making the repository private keeps all of it to you and anyone you invite.

The extension shows this same list live under **Settings → Privacy**, computed from your actual configuration rather than written down, so it cannot fall out of date with what the code does.

---

## 7. Chrome Web Store and Firefox AMO Compliance

Code Ledger fully complies with the Google Chrome Web Store User Data Policy and the Mozilla Add-on Policies:

- **Limited Use**: We only use the permissions requested (storage, unlimitedStorage, alarms, sidePanel, tabs) to provide and improve the user-facing features of the extension. We do not use or transfer any data for advertising, marketing, or profiling purposes.
- **Encryption**: All communications with external APIs (GitHub, Google, OpenAI, etc.) are encrypted in transit via standard HTTPS (SSL/TLS).
- **Single Purpose**: The extension's single purpose is to automate DSA solve commits and provide local analytics.

---

## 8. User Rights and Controls

You have full control over your data:

- **Access and Portability**: You can browse your entire library at any time in the Library tab. You can export your data via your GitHub repository.
- **Correction**: You can modify notes, tags, and settings directly in the extension interface.
- **Deletion**: You can wipe all local settings, tokens, and solutions by using the "Clear all data" button in settings or by uninstalling the extension.

---

## 9. Children's Privacy

Code Ledger is not directed at children under the age of 13. We do not knowingly collect or process any information from children.

---

## 10. Changes to this Privacy Policy

We may update this Privacy Policy from time to time. When we make changes, we will update the "Last updated" date at the top of this page. We encourage you to review this policy periodically.

---

## 11. Contact Information

If you have any questions, concerns, or requests regarding your privacy, please contact us:

- **Email**: github@vkrishna04.me
- **Issue Tracker**: [GitHub Issues](https://github.com/Life-Experimentalist/Code-Ledger/issues)
