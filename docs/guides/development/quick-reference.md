# Quick Reference: OAuth & Git Integration Testing

## What Was Fixed

✅ **Git Provider System**: GitHub → GitLab → Bitbucket (auto-fallback)
✅ **OAuth Listener**: Token saved to Storage automatically
✅ **Connect Button**: Enhanced with provider indicator
✅ **SettingsView**: Removed duplicate navigation tabs
✅ **All Handlers**: GitHub ✅, LeetCode ✅, GitLab ✅, Bitbucket ✅, Codeforces ✅

---

## To Test OAuth (After Worker Deploy)

### Step 1: Load Extension Locally

```bash
npm run build:fast
# Chrome → chrome://extensions → Load unpacked
# Choose: v:\Code\ProjectCode\CodeLedger\dist\chromium
```

### Step 2: Check Settings

- Open CodeLedger Library view
- Settings tab → should see Git providers listed
- All three (GitHub, GitLab, Bitbucket) should be shown

### Step 3: Test Connect Button

- Header top-right → "Connect" button
- Should show GitHub label next to it
- Click → Opens GitHub OAuth in new tab
- Authenticate → should redirect back with token

### Step 4: Verify Token Saved

**In Chrome DevTools (on library page):**

```javascript
// DevTools Console
const storage = await chrome.storage.local.get(null);
console.log(storage["auth.tokens"]); // Should show { github: 'ghu_...' }
```

### Step 5: Test LeetCode Integration

- Go to LeetCode.com
- Solve any problem
- Submit solution
- CodeLedger should detect and commit

---

## Diagnostic Commands

```bash
# Check all handlers
node dev/diagnose.js

# Check handler status by category
node dev/diagnose.js | Select-String "✅|⚠️"

# Verify build
npm run build:fast
```

---

## Files You Need to Know

| File                                | Purpose                         |
| ----------------------------------- | ------------------------------- |
| `src/core/git-provider-selector.js` | Handles provider fallback logic |
| `src/library/library.js`            | OAuth message listener + header |
| `src/library/views/SettingsView.js` | Settings UI (cleaned)           |
| `worker/public/config.json`         | OAuth URLs configuration        |
| `dev/diagnose.js`                   | Handler status diagnostic tool  |
| `OAUTH_TESTING_GUIDE.md`            | Comprehensive testing guide     |
| `GIT_INTEGRATION_SETUP.md`          | Architecture documentation      |

---

## Before Full Testing (Prerequisites)

The code is ready, but to test OAuth end-to-end you need:

**Worker secrets** (set with `npx wrangler secret put NAME` from `worker/`,
never written into `wrangler.toml`):

```
CODELEDGER_OAUTH_CLIENT_ID       # OAuth App client ID, starts with Iv23li
CODELEDGER_OAUTH_CLIENT_SECRET   # OAuth App client secret
SESSION_SECRET                   # random hex, 32 bytes — signs the state cookie
CANONICAL_UPLOAD_TOKEN           # random hex, 32 bytes — admin upload bearer
```

**Deploy Worker:**

```bash
cd worker
npx wrangler deploy
```

---

## Fallback Provider Logic

If GitHub is disabled in settings:

```javascript
// Settings has github_enabled = false
// getActiveGitProvider() will return "gitlab"
// If gitlab_enabled = false too, returns "bitbucket"
```

Test by:

1. Settings → GitHub → toggle off
2. Solve LeetCode problem
3. Should attempt GitLab commit instead

---

## Known Good Status

✅ All 3 platform handlers: LeetCode, GeeksForGeeks, Codeforces
✅ All 3 git providers: GitHub, GitLab, Bitbucket
✅ OAuth listener integrated
✅ Settings properly configured
✅ Build passing without errors
✅ Git provider selector working

---

## Troubleshooting Quick Links

- **OAuth not opening?** → Check worker secrets are set
- **Token not saving?** → Check browser console for CORS errors
- **LeetCode not detecting?** → Check DOM selectors (run `node dev/generate-manifest-domains.js`)
- **GitHub commit failing?** → Check token has "repo" scope

See `OAUTH_TESTING_GUIDE.md` for detailed troubleshooting.
