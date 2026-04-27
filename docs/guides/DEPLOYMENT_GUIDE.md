# CodeLedger Deployment & Auth Guide

## Overview

CodeLedger uses a unified Cloudflare Worker deployment serving:
- **Landing page** (`https://codeledger.vkrishna04.me`)
- **OAuth endpoints** (`https://codeledger.vkrishna04.me/api/auth/*`)
- **Webhook receiver** (`https://codeledger.vkrishna04.me/api/webhook/github`)
- **Canonical map API** (`https://codeledger.vkrishna04.me/api/data/canonical-map.json`)
- **Admin upload endpoint** (`https://codeledger.vkrishna04.me/api/admin/canonical`)

---

## Architecture

### Deployment Flow

```
git push to main
    ↓
GitHub Actions (.github/workflows/deploy-worker.yml)
    ├─ Generate worker/wrangler.toml from secrets
    ├─ Upload runtime secrets to Cloudflare (CANONICAL_UPLOAD_TOKEN, SESSION_SECRET, CODELEDGER_GH_*)
    └─ Publish Worker to codeledger.vkrishna04.me
```

### OAuth Flow

```
Extension User → clicks "Connect GitHub"
    ↓
Extension → opens popup to /api/auth/github
    ↓
Worker → redirects to GitHub's OAuth authorize endpoint
    ↓
User → approves scope (repo access)
    ↓
GitHub → redirects back to /api/auth/github/callback?code=XXX
    ↓
Worker → exchanges code for access token (using OAuth client ID/secret)
    ↓
Worker → posts token back to opener window (via postMessage)
    ↓
Extension → stores token in chrome.storage.local
```

---

## Required Secrets (GitHub Repository)

All secrets are **already set** in your repository. Here's what they do:

| Secret                             | Purpose                                               | Set? |
| ---------------------------------- | ----------------------------------------------------- | ---- |
| `CF_API_TOKEN`                     | Cloudflare API token for publishing Worker            | ✅    |
| `CF_ACCOUNT_ID`                    | Your Cloudflare account ID (32-char string)           | ✅    |
| `CF_ZONE_ID`                       | DNS zone ID for codeledger.vkrishna04.me              | ✅    |
| `CANONICAL_KV_ID`                  | Workers KV namespace ID for canonical map             | ✅    |
| `CANONICAL_UPLOAD_TOKEN`           | Bearer token for admin `/api/admin/canonical` uploads | ✅    |
| `SESSION_SECRET`                   | Secret for signing session tokens/JWTs                | ✅    |
| `CODELEDGER_GH_APP_ID`             | GitHub App ID (numeric)                               | ✅    |
| `CODELEDGER_GH_APP_PRIVATE_KEY`    | GitHub App private key (PEM format)                   | ✅    |
| `CODELEDGER_GH_APP_CLIENT_ID`      | OAuth client ID from GitHub App                       | ✅    |
| `CODELEDGER_GH_APP_CLIENT_SECRET`  | OAuth client secret                                   | ✅    |
| `CODELEDGER_GH_APP_WEBHOOK_SECRET` | Webhook secret for verifying GitHub events            | ✅    |

> **Note:** These are named `CODELEDGER_GH_*` instead of `GITHUB_*` because GitHub Actions forbids repository secret names starting with `GITHUB_`.

---

## Cloudflare Configuration

### Worker Route

The Worker route **must be manually created** in the Cloudflare dashboard to avoid requiring route/edit permissions on the API token:

```
Pattern: codeledger.vkrishna04.me/*
Worker: codeledger
```

**If not already created**, add it here:
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select **codeledger.vkrishna04.me** zone
3. Go to **Workers** → **Routes**
4. Create route: `codeledger.vkrishna04.me/*` → assign `codeledger` Worker

### Runtime Secrets (in Cloudflare Worker)

The CI workflow automatically uploads these at deployment time. To verify they're set:

```bash
# List all secrets for the codeledger worker
npx wrangler secret list --env production
```

Expected secrets in Cloudflare:
- `CANONICAL_UPLOAD_TOKEN` (from GitHub repo secret)
- `SESSION_SECRET` (from GitHub repo secret)
- `CODELEDGER_GH_APP_PRIVATE_KEY` (from GitHub repo secret)
- `CODELEDGER_GH_APP_CLIENT_ID` (from GitHub repo secret)
- `CODELEDGER_GH_APP_CLIENT_SECRET` (from GitHub repo secret)
- `CODELEDGER_GH_APP_WEBHOOK_SECRET` (from GitHub repo secret)

---

## GitHub App Setup

### GitHub App Configuration

Your GitHub App (`CodeLedger Dev`) should be configured with:

1. **Callback URL:** `https://codeledger.vkrishna04.me/api/auth/github/callback`
2. **Webhook URL:** `https://codeledger.vkrishna04.me/api/webhook/github`
3. **Permissions:**
   - **Repository:**
     - `Contents` (read & write) — for committing solutions
     - `Metadata` (read) — required
     - `Webhooks` (read) — for receiving events
   - **Organization:** (if applicable)
     - `Members` (read) — optional, for org-wide insights
4. **Events:** `push`, `pull_request`, `issues`, `workflow_run`

> For details, see [GITHUB_APP_SETUP.md](docs/GITHUB_APP_SETUP.md).

---

## Deployment Steps

### 1. Verify All Secrets Are Set

```powershell
gh secret list --repo Life-Experimentalist/Code-Ledger
```

Expected output: all 11 secrets listed above should be present.

### 2. Verify Worker Route in Cloudflare

Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **codeledger.vkrishna04.me** → **Workers** → **Routes** and confirm:
- Route `codeledger.vkrishna04.me/*` is bound to the `codeledger` Worker.

### 3. Trigger Deployment

**Option A: Using GitHub Actions UI (recommended)**

1. Go to [Actions](https://github.com/Life-Experimentalist/Code-Ledger/actions)
2. Select **Deploy Worker** workflow
3. Click **"Run workflow"** button
4. Select **Branch: main**
5. Click **"Run workflow"**

**Option B: Via CLI**

```powershell
gh workflow run deploy-worker.yml -r main --repo Life-Experimentalist/Code-Ledger
```

**Option C: Automatic (on push)**

Simply push to `main`:

```powershell
git add .
git commit -m "trigger deployment"
git push origin main
```

### 4. Monitor Workflow

```powershell
# Watch the workflow in real-time
gh run list --repo Life-Experimentalist/Code-Ledger --workflow "Deploy Worker" -L 1

# View logs for the latest run
gh run view --repo Life-Experimentalist/Code-Ledger --log | Select-Object -Last 100
```

---

## Testing Deployed Endpoints

Once deployed, test these endpoints:

### 1. Landing Page

```bash
curl https://codeledger.vkrishna04.me/
```

Expected: Returns HTML landing page (200 OK).

### 2. OAuth Redirect

```bash
curl -L https://codeledger.vkrishna04.me/api/auth/github
```

Expected: Redirects to GitHub authorize endpoint (302 redirect).

### 3. Canonical Map

```bash
curl https://codeledger.vkrishna04.me/api/data/canonical-map.json
```

Expected: Returns canonical map JSON (200 OK, CORS headers included).

### 4. Admin Upload Endpoint (protected by token)

```bash
curl -X POST https://codeledger.vkrishna04.me/api/admin/canonical \
  -H "Authorization: Bearer $CANONICAL_UPLOAD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mapping": {...}}'
```

Expected: Accepts upload (200 OK or 401 if token missing/invalid).

### 5. App Installations (requires GitHub App JWT)

```bash
curl https://codeledger.vkrishna04.me/api/app/installations
```

Expected: Returns list of GitHub App installations (200 OK) or 500 if secrets missing.

---

## Local Development

### Prerequisites

- Node.js 20+
- `npm` (or `uv` if using Python)
- Wrangler CLI: `npm install -g wrangler` (or `npx wrangler`)

### Setup

```bash
cd worker
npm ci
```

### Run Locally

```bash
npm run dev
# or
npx wrangler dev --local
```

This starts a local Worker on `http://localhost:8787`.

### Test Local Endpoints

```bash
# Landing page
curl http://localhost:8787/

# OAuth redirect
curl -L http://localhost:8787/api/auth/github

# Canonical map
curl http://localhost:8787/api/data/canonical-map.json
```

---

## Troubleshooting

### Issue: Workflow fails with "Authentication error [code: 10000]"

**Cause:** API token lacks permissions to update Worker routes.

**Solution:**
- Regenerate API token with these permissions:
  - **Account:** Workers Scripts (Edit)
  - **Zone:** Workers Routes (Edit), Workers KV (Edit)
  - **User:** User Details (Read)
- Update `CF_API_TOKEN` in GitHub repo secrets.
- Re-run the workflow.

Alternatively, manually create/manage routes in the Cloudflare dashboard (as we do now).

### Issue: Worker deployed but OAuth redirect not working

**Cause:** GitHub App callback URL or client ID/secret misconfigured.

**Check:**
1. GitHub App settings: callback URL is `https://codeledger.vkrishna04.me/api/auth/github/callback`
2. Repo secrets: `CODELEDGER_GH_APP_CLIENT_ID` and `CODELEDGER_GH_APP_CLIENT_SECRET` are set
3. Verify they're uploaded to Cloudflare: `npx wrangler secret list --env production`

### Issue: Secrets not uploaded to Cloudflare

**Check workflow logs:**

```powershell
gh run view <run-id> --repo Life-Experimentalist/Code-Ledger --log | Select-String "CANONICAL_UPLOAD_TOKEN|SESSION_SECRET|CODELEDGER_GH"
```

Expected output: `✨ Success! Uploaded secret <NAME>` for each secret.

### Issue: "Cannot modify Vite config: could not find a valid plugins array"

**Cause:** Your `vite.config.js` was missing a `plugins` array.

**Solution:** Ensure `vite.config.js` includes:

```javascript
export default defineConfig({
  plugins: [],  // ← This line was added
  // ... rest of config
});
```

This is already fixed in the current code.

---

## Summary

✅ **All secrets are set** in GitHub
✅ **Worker code is complete** with all OAuth, webhook, and API endpoints
✅ **CI workflow is configured** to generate wrangler config and upload secrets
✅ **Vite config has plugins array** to avoid Wrangler errors
✅ **Worker route manually created** in Cloudflare dashboard

**Next steps:**
1. Trigger the deployment workflow (via GitHub Actions UI or CLI)
2. Monitor logs to confirm all secrets upload successfully
3. Test deployed endpoints to verify OAuth and API flows work
4. Chrome Extension can then use the `/api/auth/github` endpoint to authenticate users

---

## Quick Commands

```powershell
# Deploy via GitHub Actions UI
gh workflow run deploy-worker.yml -r main --repo Life-Experimentalist/Code-Ledger

# Check workflow status
gh run list --repo Life-Experimentalist/Code-Ledger --workflow "Deploy Worker" -L 1

# View latest workflow logs
gh run view --repo Life-Experimentalist/Code-Ledger --log | tail -200

# Test landing page (after deployment)
curl https://codeledger.vkrishna04.me/

# Test canonical map
curl https://codeledger.vkrishna04.me/api/data/canonical-map.json

# Run locally
cd worker && npm ci && npm run dev
```

---

For more details, see:
- [GITHUB_APP_SETUP.md](docs/GITHUB_APP_SETUP.md)
- [OPENAPI.yaml](docs/OPENAPI.yaml)
- [ARCHITECTURE.md](docs/ARCHITECTURE.md)
