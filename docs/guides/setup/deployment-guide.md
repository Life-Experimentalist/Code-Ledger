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
    ├─ Upload runtime secrets to Cloudflare (CANONICAL_UPLOAD_TOKEN, SESSION_SECRET, CODELEDGER_OAUTH_*)
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
User → approves the requested scope
    ↓
GitHub → redirects back to /api/auth/github/callback?code=XXX
    ↓
Worker → verifies the signed state cookie, then exchanges the code for a token
Worker → posts the token to the opener window (postMessage)
    ↓
Extension → stores the token via Storage.setAuthToken("github", …)
```

For the registration walkthrough, see
[GitHub OAuth App setup](github-oauth-app-setup.md).

---

## Required Secrets (GitHub Repository)

| Secret                             | Purpose                                               | Required |
| ---------------------------------- | ----------------------------------------------------- | -------- |
| `CF_API_TOKEN`                     | Cloudflare API token for publishing Worker            | yes      |
| `CF_ZONE_ID`                       | DNS zone ID for codeledger.vkrishna04.me              | yes      |
| `CANONICAL_KV_ID`                  | Workers KV namespace ID for canonical map             | yes      |
| `CANONICAL_UPLOAD_TOKEN`           | Bearer token for admin `/api/admin/canonical` uploads | no       |
| `SESSION_SECRET`                   | Signs the OAuth `state` cookie — sign-in 500s without | yes      |
| `CODELEDGER_OAUTH_CLIENT_ID`       | OAuth App client ID (`Ov23li…`)                       | yes      |
| `CODELEDGER_OAUTH_CLIENT_SECRET`   | OAuth App client secret                               | yes      |
| `CODELEDGER_GH_APP_WEBHOOK_SECRET` | Webhook HMAC secret                                   | no       |

`gh secret list --repo Life-Experimentalist/Code-Ledger` reports which of these
exist. It cannot report whether their **values** are right — a secret set to the
wrong string looks identical to a correct one until something calls it, which is
what the smoke tests further down are for. This has bitten before: a client ID
pasted with Ctrl+V at a `wrangler secret put` prompt was recorded as a single
control byte, the secret existed, and sign-in was broken until someone read the
authorize URL by hand.

> **Note:** These are named `CODELEDGER_*` instead of `GITHUB_*` because GitHub Actions forbids repository secret names starting with `GITHUB_`.

> The Worker also accepts the older `CODELEDGER_GH_APP_CLIENT_ID` /
> `CODELEDGER_GH_APP_CLIENT_SECRET` names as aliases, so a deployment made
> before the OAuth App switch keeps working.
>
> `CODELEDGER_GH_APP_ID` and `CODELEDGER_GH_APP_PRIVATE_KEY` are no longer read
> by any code path. They existed for the GitHub App installation-token
> endpoints, which have been removed. Delete them if they are still set.

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

The CI workflow uploads these from the repository secrets at deployment time.
List what the Worker currently holds:

```bash
cd worker && npx wrangler secret list
```

Expected: `SESSION_SECRET` and the two `CODELEDGER_OAUTH_*` values, plus
`CANONICAL_UPLOAD_TOKEN` and `CODELEDGER_GH_APP_WEBHOOK_SECRET` if you use those
features. `wrangler secret list` prints names only, never values.

To set one by hand:

```bash
cd worker && npx wrangler secret put CODELEDGER_OAUTH_CLIENT_ID
```

The command takes the **name** only and prompts for the value — passing the
secret as an argument would put it in your shell history. At that prompt, type
the value or paste it with right-click; Ctrl+V is not a paste in a Windows
console and records a control character instead.

---

## GitHub OAuth App setup

The app is a classic **OAuth App**, not a GitHub App — a GitHub App's
user-to-server token cannot create repositories. Register it at
<https://github.com/settings/developers> with:

1. **Authorization callback URL:** `https://codeledger.vkrishna04.me/api/auth/github/callback`
2. **Homepage URL:** `https://codeledger.vkrishna04.me`

There are no permissions to configure. OAuth Apps carry no stored permission
set; scopes are requested per authorization, and the Worker requests
`public_repo,workflow` by default and `repo` when the user chooses a private
ledger.

> For the full walkthrough, including secret rotation, see
> [GitHub OAuth App setup](github-oauth-app-setup.md).

---

## Deployment Steps

### 1. Verify All Secrets Are Set

```powershell
gh secret list --repo Life-Experimentalist/Code-Ledger
```

Expected output: every secret marked **yes** in the table above.

### 2. Verify Worker Route in Cloudflare

Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **codeledger.vkrishna04.me** → **Workers** → **Routes** and confirm:

- Route `codeledger.vkrishna04.me/*` is bound to the `codeledger` Worker.

### 3. Deploy

**Option A: Using GitHub Actions UI (recommended)**

1. Go to [Actions](https://github.com/Life-Experimentalist/Code-Ledger/actions)
2. Select **Deploy Worker** workflow, then **Run workflow**

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

### 5. Removed endpoints stay removed

```bash
curl -o /dev/null -w '%{http_code}\n' https://codeledger.vkrishna04.me/api/app/installations
```

Expected: `404`. The GitHub App installation and token-minting endpoints were
removed; they served unauthenticated token requests. A `200` here means an old
Worker build is still live — redeploy.

---

## Local Development

### Prerequisites

- Node.js 20+
- Wrangler CLI: `npm install -g wrangler` (or `npx wrangler`)

### Setup

```bash
cd worker
npm ci
```

### Run Locally

```bash
cd worker && npm run dev
```

This starts a local Worker on `http://localhost:8787`. It reads
`worker/wrangler.toml`, which is git-ignored — copy `worker/wrangler.toml.example`
first. Secrets for local runs go in `worker/.dev.vars`, not in the toml.

### Test Local Endpoints

```bash
curl http://localhost:8787/api/health
```

```bash
curl -sI http://localhost:8787/api/auth/github
```

```bash
curl http://localhost:8787/api/data/canonical-map.json
```

---

## Troubleshooting

### Issue: Workflow fails with "Authentication error [code: 10000]"

**Cause:** API token lacks permissions to update Worker routes.
**Solution:**

- Regenerate API token with these permissions:
- Update `CF_API_TOKEN` in GitHub repo secrets.
- Re-run the workflow.

Alternatively, manually create/manage routes in the Cloudflare dashboard (as we do now).

### Issue: Worker deployed but OAuth redirect not working

**Cause:** OAuth App callback URL or client ID/secret misconfigured.

**Check:**

1. OAuth App settings: callback URL is exactly
   `https://codeledger.vkrishna04.me/api/auth/github/callback`
2. The client ID starts with `Ov23li`. An `Iv23li` prefix — or the older `Iv1.`
   — means the app was registered as a **GitHub App**, whose user-to-server
   tokens cannot create a repository; the callback refuses such a token and
   says so.
3. `cd worker && npx wrangler secret list` shows `CODELEDGER_OAUTH_CLIENT_ID`,
   `CODELEDGER_OAUTH_CLIENT_SECRET` and `SESSION_SECRET`.

`GET /api/auth/github` distinguishes the failure modes for you: `302` is
healthy, and `500` names which of the three is missing or malformed.

### Issue: Secrets not uploaded to Cloudflare

**Check workflow logs:**

```powershell
gh run view <run-id> --repo Life-Experimentalist/Code-Ledger --log | Select-String "CANONICAL_UPLOAD_TOKEN|SESSION_SECRET|CODELEDGER_GH"
```

Expected output: `✨ Success! Uploaded secret <NAME>` for each secret.

### Issue: Sign-in returns 500

The body says which one it is. `SESSION_SECRET` unset means the `state` cookie
cannot be signed, and the Worker refuses to start an unauthenticated flow rather
than continue without CSRF protection. A missing or malformed
`CODELEDGER_OAUTH_CLIENT_ID` is reported separately, because a bad-but-present
ID used to be percent-encoded straight into the authorize URL, where GitHub
answered with a generic login page that named no cause.

---

## Post-deploy checklist

Run these against the live deployment, in order. Each is a fact you can check,
not a claim to take on trust.

1. `curl -sf https://codeledger.vkrishna04.me/api/health` returns `{"ok":true,…}`
   with the deployed version.
2. `curl -sI https://codeledger.vkrishna04.me/api/auth/github` returns `302`, and
   the `location` header carries a `client_id` that starts with `Ov23li` — not a
   percent-escape.
3. `curl -sf https://codeledger.vkrishna04.me/api/data/canonical-map.json` returns
   JSON.
4. The removed installation endpoints still 404 (see above).
5. Sign in from the extension once, end to end, and confirm a repository is
   created. Nothing above proves the token exchange works; only this does.
6. Test deployed endpoints to verify OAuth and API flows work
7. Chrome Extension can then use the `/api/auth/github` endpoint to authenticate users

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

- [GitHub OAuth App setup](github-oauth-app-setup.md)
- [OPENAPI.yaml](../OPENAPI.yaml)
- [Architecture](../architecture/README.md)
