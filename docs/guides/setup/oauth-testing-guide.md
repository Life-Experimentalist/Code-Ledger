/\*\*

- @license
- SPDX-License-Identifier: Apache-2.0
  \*/

# OAuth & Git Provider Testing Guide

## Prerequisites

Before testing OAuth, you need:

**Worker secrets:**

```
CODELEDGER_OAUTH_CLIENT_ID=<OAuth App client ID, starts with Iv23li>
CODELEDGER_OAUTH_CLIENT_SECRET=<OAuth App client secret>
SESSION_SECRET=<random hex, 32 bytes>
CANONICAL_UPLOAD_TOKEN=<random hex, 32 bytes>
```

Set these with `npx wrangler secret put NAME` from `worker/`, not in
`wrangler.toml` — the file is git-ignored, but secrets still do not belong in
it. See [GitHub OAuth App setup](github-oauth-app-setup.md).

## Testing Sequence

### Phase 1: Local Development (No OAuth yet)

**Step 1a: Load extension in Chrome**

```bash
npm run build:fast
# Go to chrome://extensions
# Enable Developer mode
# Load unpacked: choose v:\Code\ProjectCode\CodeLedger\dist\chromium
```

**Step 1b: Check handler initialization**

- Open DevTools Console
- Go to extension popup or sidebar
- Look for: "LeetCode handler active" or "GitHub Integration" in logs
- Check Settings tab loads without errors

**Step 1c: Verify git provider detection**

- Settings → Git section
- GitHub is the only provider and is shown as such
- If mirrors are configured they are listed in order; the primary is tried
  first and a mirror only after it throws

### Phase 2: Manual PAT Testing (Before OAuth)

**Step 2a: Test GitHub with Personal Access Token**

```bash
# In GitHub: Settings → Developer settings → Personal access tokens
# Create token with "repo" scope
# Copy token to clipboard
```

**Step 2b: Add token to settings**

- In CodeLedger Settings
- GitHub section → paste PAT into "GitHub Token" field
- Save settings

**Step 2c: Test commit**

- Go to LeetCode, solve a problem
- Should see commit attempt in console
- Check if repository was created/updated on GitHub

### Phase 3: OAuth Testing (After Worker Deploy)

**Step 3a: Deploy worker**

```bash
cd worker
npx wrangler deploy
```

**Step 3b: Test OAuth flow**

- In CodeLedger Library view
- Header → "Connect" button
- Should open OAuth window
- After GitHub authorization
- Should redirect back with token
- Token appears in Storage

**Step 3c: Verify token saved**

- DevTools → Application → Storage → Extension
- Should see `auth.tokens` containing `{ github: "ghu_..." }`

### Phase 4: LeetCode Integration Test

**Step 4a: Enable LeetCode tracking**

- Settings → LeetCode section
- Toggle "Enable tracking"
- Verify observer is active

**Step 4b: Solve a LeetCode problem**

- Go to LeetCode.com
- Solve any problem (Python, JavaScript, etc.)
- Submit solution
- Check CodeLedger console for problem:solved event
- Should see commit log

**Step 4c: Verify GitHub sync**

```bash
# Check GitHub repo
# Should see new directory: problems/leetcode/<problem-slug>/
# File structure: solution.py, index.json, etc.
```

## Diagnostic Commands

### Check handler status

```bash
node dev/diagnose.js
```

Expected: three platform handlers, one git provider, six AI providers, no issues.

### Verify build output

```bash
# Check if dist files were created
ls dist/chromium/handlers/platforms/leetcode/
ls dist/chromium/handlers/git/github/
```

### Check storage in DevTools

```javascript
// Run in DevTools console of library page
const items = await chrome.storage.local.get(null);
console.log("Auth tokens:", items["auth.tokens"]);
console.log("AI keys:", items["ai.keys"]);
console.log("Settings:", items.settings);
```

## Troubleshooting

### OAuth not working

- [ ] Check worker secrets are set: `npx wrangler secret list`
- [ ] Verify the app is an **OAuth App** at github.com/settings/developers —
      not a GitHub App. A client ID starting `Ov23li` is a GitHub App and cannot
      create repositories.
- [ ] Confirm `SESSION_SECRET` is set; without it every sign-in returns 500
- [ ] Check worker is deployed: `npx wrangler deploy`
- [ ] Test health endpoint: `curl https://codeledger.vkrishna04.me/api/health`
- [ ] Check browser DevTools for auth message

### LeetCode not detecting submissions

- [ ] Open problem page and wait 5 seconds
- [ ] Check DOM selectors haven't changed (run `node dev/generate-manifest-domains.js`)
- [ ] Look for MutationObserver errors in console
- [ ] Verify LeetCode is in enabled platforms list

### Git commit failing

- [ ] Check the token is present: `Storage.getAuthToken('github')`
- [ ] Check the granted scopes in the `X-OAuth-Scopes` response header from any
      `api.github.com` call. A private ledger needs `repo`; `public_repo` gets a
      403 on creation.
- [ ] Check the repository exists, or that the name is still free if it is about
      to be created
- [ ] Look for GitHub API errors in the service worker console — the handler
      logs status, message and headers on every failure

### Mirror target not used after a failure

- [ ] Confirm a mirror is configured in **Settings → Git**
- [ ] `_commitWithFailover()` walks the primary first, then each mirror in order;
      it only moves on after the primary throws

## Success criteria

- Extension loads without errors
- Settings shows GitHub as the git provider
- The Connect button opens GitHub's authorization screen
- The token lands in `auth.tokens` after the callback
- LeetCode detects an accepted submission
- The commit creates the repository and the first root commit
- Files land under `problems/{canonicalId}/{platform}/`
