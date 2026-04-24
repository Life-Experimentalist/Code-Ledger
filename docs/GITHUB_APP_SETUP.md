## GitHub App — Code Ledger (recommended configuration)

This document provides recommended values and a manifest to create the GitHub App used by CodeLedger. Use these values when creating the App in the GitHub settings for the `Life-Experimentalist` account.

**App name**: Code Ledger

**Homepage URL**: https://codeledger.vkrishna04.me

**Callback URL (OAuth / redirect)**: https://api.codeledger.vkrishna04.me/auth/github/callback

**Webhook URL**: https://api.codeledger.vkrishna04.me/webhook/github

**Webhook secret**: generate a strong random secret and store it as an environment variable in your Cloudflare Worker (e.g. `GITHUB_APP_WEBHOOK_SECRET`).

Recommended choices in the App creation UI:

- Expire user authorization tokens: Enable (recommended)
- Request user authorization during installation: Enable (if you want to link GitHub users to extension accounts)
- Enable Device Flow: Optional
- Setup URL: https://codeledger.vkrishna04.me/setup (optional)
- Redirect on update: Enable + use the same Setup URL

Installation target:
- If you want the App to be installable only on your organization, choose **Only on this account** and select `Life-Experimentalist`.
- If you intend to make CodeLedger available publicly, choose **Any account**.

Permissions (minimal required and rationale):

- Repository permissions
  - Contents: Read & Write — required to create/update files and make atomic commits via the Trees API.
  - Metadata: Read-only — for listing repositories and reading repo metadata.
  - Pull requests: Read-only — optional, if you plan to open PRs or read PR metadata.

- Organization permissions: None required by default.

Subscribe to events (recommended):

- Installation — to receive install/uninstall events.
- Push — optional; subscribe if you want worker-side sync triggers when repo changes.

Security notes:

- Do NOT embed the App private key or webhook secret in source. Store them as environment secrets in Cloudflare Workers (or GitHub Secrets for CI).
- Use the App's private key to create JWTs server-side and exchange for installation tokens when acting as the App.

Example GitHub App manifest (use via GitHub App creation flow):

```json
{
  "name": "Code Ledger",
  "url": "https://codeledger.vkrishna04.me",
  "hook_attributes": { "url": "https://api.codeledger.vkrishna04.me/webhook/github" },
  "redirect_url": "https://api.codeledger.vkrishna04.me/auth/github/callback",
  "public": false,
  "default_permissions": {
    "metadata": "read",
    "contents": "write",
    "pull_requests": "read"
  },
  "default_events": ["installation", "push"]
}
```

How it will be used by CodeLedger:

- The Cloudflare Worker (Auth worker) will perform the OAuth redirect / callback flow and store installation tokens in a secure, encrypted store (or issue them to users via short-lived endpoints).
- The Worker will use installation tokens to call the GitHub API and perform atomic commits via the Git Tree API.

Post-creation steps (high level):

1. Download the App private key from the GitHub App settings. Store it as an encrypted secret in Cloudflare Worker (e.g. `GITHUB_APP_PRIVATE_KEY`).
2. Save the webhook secret in `GITHUB_APP_WEBHOOK_SECRET` in the Worker environment.
3. In the Worker code (`worker/src/index.js`) configure the App ID and endpoints via environment variables.
4. Install the App on the `Life-Experimentalist/CodeLedger` repository (or choose the desired installation target).

Cloudflare Worker environment variables (set these in the Cloudflare dashboard for your Worker):

- `GITHUB_APP_ID` — GitHub App numeric ID
- `GITHUB_APP_PRIVATE_KEY` — the PEM private key (store as a secret; newline-escaped if pasting)
- `GITHUB_APP_WEBHOOK_SECRET` — webhook secret used to validate incoming hooks
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` — only needed if you use OAuth user flow instead of App-installation flow
- `TELEMETRY_ENDPOINT` — e.g. `https://counter.vkrishna04.me`

Manual Cloudflare Worker deployment (via Cloudflare dashboard):

1. Zip the `worker/public` and `worker/src` contents or use the `worker` directory as the Worker script source.
2. In the Cloudflare dashboard, create a new Worker, choose "Upload a script" or use the online editor and paste `worker/src/index.js`.
3. In Worker settings, add the environment variables listed above under "Variables" (or "Secrets/Environment").
4. If your Worker serves static assets (worker/public), configure a KV or Pages deployment, or copy the static assets into the Worker script's `serveStatic` root.
5. Test the endpoints: `/auth/github` should redirect to GitHub, `/auth/github/callback` should return a small HTML page that posts the token back to the opener window.

Notes on the two auth modes:

- GitHub App (recommended for server-side automated commits): Worker exchanges an App JWT for installation tokens and acts on installed repositories. Requires the App private key and App ID.
- OAuth App (simpler user-level flow): Worker redirects users through `https://github.com/login/oauth/authorize` and exchanges the `code` for a `access_token`. This is supported by the existing `worker/src/index.js` but does not grant repository-level automation via App installations.


Deploying the worker from this repository (recommended GitHub Actions flow):

- Add repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_ID`, `GITHUB_APP_WEBHOOK_SECRET`.
- Create a GitHub Actions workflow that runs `wrangler publish` (or `wrangler deploy`) using those secrets.

Quick local steps to publish the worker (you must have `wrangler` installed):

```powershell
cd worker
wrangler login
wrangler publish
```

If you want, I can:

- Add a `docs` page with a sample `worker/.env.example` and the minimal `worker/src/index.js` auth routes wired to the App settings.
- Prepare a GitHub Actions workflow that deploys the worker using `CLOUDFLARE_API_TOKEN`.

---
File references:

- Worker auth entry: [worker/src/index.js](../worker/src/index.js)
- Cloudflare config: [worker/wrangler.toml](../worker/wrangler.toml)

