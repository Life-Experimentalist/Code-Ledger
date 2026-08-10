# Store Auto-Publish: Secrets Setup

All secrets live in **GitHub → repository → Settings → Secrets and variables → Actions → New repository secret**.
Nothing runs locally except the one-time CWS refresh-token OAuth flow.

---

## Chrome Web Store

Workflow: `.github/workflows/publish-chrome.yml`

### Step 1 — Create a Google Cloud OAuth client

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or reuse one)
3. Enable the **Chrome Web Store API** (APIs & Services → Library → search "Chrome Web Store API")
4. Create credentials: **OAuth client ID** → Application type: **Desktop app**
5. Note the **Client ID** and **Client Secret**

### Step 2 — Get a refresh token (one-time, done in browser)

Open this URL (replace `YOUR_CLIENT_ID`):

```
https://accounts.google.com/o/oauth2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob&scope=https://www.googleapis.com/auth/chromewebstore&response_type=code&access_type=offline
```

1. Approve the OAuth consent screen
2. Copy the **authorization code** shown
3. Exchange it for a refresh token:

```bash
curl -s -X POST https://oauth2.googleapis.com/token \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=YOUR_AUTH_CODE" \
  -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob" \
  -d "grant_type=authorization_code"
```

Copy the `refresh_token` from the response.

### Step 3 — Add GitHub secrets

| Secret name         | Value                      |
| ------------------- | -------------------------- |
| `CWS_CLIENT_ID`     | Google OAuth client ID     |
| `CWS_CLIENT_SECRET` | Google OAuth client secret |
| `CWS_REFRESH_TOKEN` | Refresh token from step 2  |

---

## Firefox AMO

Workflow: `.github/workflows/publish-firefox.yml`

> **Prerequisite:** The extension must already exist on AMO (first submission is always manual).

### Step 1 — Get AMO API credentials

1. Go to [addons.mozilla.org/developers/addon/api/key](https://addons.mozilla.org/en-US/developers/addon/api/key/)
2. Generate API credentials — note the **JWT issuer** and **JWT secret**

### Step 2 — Get your addon slug

Your addon slug is the URL-friendly identifier shown in the AMO developer dashboard:
`https://addons.mozilla.org/addon/YOUR-SLUG/`

### Step 3 — Add GitHub secrets

| Secret name      | Value                               |
| ---------------- | ----------------------------------- |
| `AMO_JWT_ISSUER` | JWT issuer from AMO API credentials |
| `AMO_JWT_SECRET` | JWT secret from AMO API credentials |
| `AMO_ADDON_SLUG` | Your addon slug (e.g. `codeledger`) |

---

## Microsoft Edge Add-ons

Workflow: `.github/workflows/publish-edge.yml`

> **Prerequisite:** The extension must already exist in Partner Center (first submission is always manual).

### Step 1 — Enable API access in Partner Center

1. Go to [partner.microsoft.com/dashboard/microsoftedge/overview](https://partner.microsoft.com/dashboard/microsoftedge/overview)
2. Select your extension → **API access**
3. Create API credentials — Partner Center will create an Azure AD app registration for you
4. Note: **Product ID**, **Client ID**, **Client Secret**, and the **access token URL** (includes your tenant ID)

### Step 2 — Add GitHub secrets

| Secret name             | Value                                                            |
| ----------------------- | ---------------------------------------------------------------- |
| `EDGE_PRODUCT_ID`       | Extension product ID from Partner Center                         |
| `EDGE_CLIENT_ID`        | Azure AD app client ID                                           |
| `EDGE_CLIENT_SECRET`    | Azure AD app client secret                                       |
| `EDGE_ACCESS_TOKEN_URL` | `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token` |

---

## How the workflows chain

```
git push tag v1.x.x
    └─► release.yml          builds zips, creates GitHub Release
            └─► (on: release published)
                    ├─► publish-chrome.yml   uploads + publishes to CWS
                    ├─► publish-firefox.yml  uploads + submits to AMO
                    └─► publish-edge.yml     uploads + submits to Edge
```

Each store workflow is independent — a failure in one does not affect the others.
Workflows with missing secrets skip silently (the `if:` condition checks for the secret).

---

## Notes

- **First submission is always manual** for all three stores. Auto-publish only works for version updates.
- **Chrome** auto-publishes immediately if no review is triggered. If a review is triggered, the workflow still succeeds (status `ITEM_PENDING_REVIEW` is treated as success).
- **Firefox** and **Edge** updates go into a review queue. The workflow submits and exits — it does not wait for review approval.
- Refresh tokens and secrets never expire unless you revoke them or rotate them manually.
