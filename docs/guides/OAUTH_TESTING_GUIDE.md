/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

# OAuth & Git Provider Testing Guide

## Setup Status

### ✅ Completed
- [x] Git provider fallback system (GitHub → GitLab → Bitbucket)
- [x] OAuth message listener in library.js
- [x] SettingsView cleaned (removed duplicate navigation)
- [x] Connect button enhanced with provider indicator
- [x] Worker config updated with OAuth URLs
- [x] All handlers properly initialized (LeetCode ✅, GitHub ✅)
- [x] Build passing without errors

### ⚠️ Prerequisites for OAuth to Work
Before testing OAuth, you need:

**Worker Secrets (in wrangler.toml):**
```
CODELEDGER_GH_APP_PRIVATE_KEY=<PKCS#8 format private key>
CODELEDGER_GH_APP_ID=<numeric GitHub App ID>
CODELEDGER_GH_APP_CLIENT_ID=<GitHub App Client ID>
CODELEDGER_GH_APP_CLIENT_SECRET=<GitHub App secret>
CODELEDGER_GH_APP_WEBHOOK_SECRET=<webhook secret for validation>
SESSION_SECRET=<random hex 32 bytes>
```

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
- Should see "GitHub" as active provider by default
- Can toggle enable/disable and see fallback work

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
Expected: LeetCode ✅, GitHub ✅

### Verify build output
```bash
# Check if dist files were created
ls dist/chromium/handlers/platforms/leetcode/
ls dist/chromium/handlers/git/github/
```

### Check storage in DevTools
```javascript
// Run in DevTools console of library page
await chrome.storage.local.get(null, (items) => {
  console.log('All storage:', items);
  console.log('Git providers:', items['git.providers']);
  console.log('Auth tokens:', items['auth.tokens']);
  console.log('Settings:', items['settings']);
});
```

## Troubleshooting

### OAuth not working
- [ ] Check worker secrets are set in wrangler.toml
- [ ] Verify GitHub App is created at github.com/settings/apps
- [ ] Check worker is deployed: `npx wrangler deploy`
- [ ] Test health endpoint: `curl https://codeledger.vkrishna04.me/api/health`
- [ ] Check browser DevTools for auth message

### LeetCode not detecting submissions
- [ ] Open problem page and wait 5 seconds
- [ ] Check DOM selectors haven't changed (run `node dev/generate-manifest-domains.js`)
- [ ] Look for MutationObserver errors in console
- [ ] Verify LeetCode is in enabled platforms list

### Git commit failing
- [ ] Check if token is present: `Storage.getAuthToken('github')`
- [ ] Verify token has "repo" scope
- [ ] Check if repository exists or can be created
- [ ] Look for GitHub API errors in console

### Git provider not switching
- [ ] Check settings.js has github_enabled flag
- [ ] Verify getActiveGitProvider() returning correct value
- [ ] Test fallback by disabling GitHub in settings

## Files Modified

1. `src/core/git-provider-selector.js` - NEW
2. `src/library/views/SettingsView.js` - Cleaned duplicate nav
3. `src/library/library.js` - Added OAuth listener
4. `worker/public/config.json` - Added OAuth config
5. `dev/diagnose.js` - NEW diagnostic tool

## Success Criteria

- ✅ Extension loads without errors
- ✅ Settings page shows Git providers
- ✅ OAuth Connect button opens GitHub auth
- ✅ Token saves to storage after OAuth
- ✅ LeetCode detects submissions
- ✅ Git commit creates repository on GitHub
- ✅ Files appear in correct directory structure
- ✅ Provider fallback works (disable GitHub → use GitLab)

## Next Steps

1. Deploy worker with secrets
2. Create GitHub App if not exist
3. Test OAuth flow end-to-end
4. Add more platform handlers (Codeforces getSettingsSchema)
5. Add AI provider settings (Claude, OpenAI, etc.)
6. Document API key setup for each AI provider
