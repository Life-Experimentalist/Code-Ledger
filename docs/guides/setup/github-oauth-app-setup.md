# GitHub OAuth App setup

CodeLedger authenticates through a **GitHub OAuth App**, registered at
<https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**.

> **It must be an OAuth App, not a GitHub App.** GitHub Apps silently ignore the
> `scope` parameter and issue user-to-server tokens, which cannot call
> `POST /user/repos` — every repository-creation attempt comes back
> `403 Resource not accessible by integration`. OAuth App client IDs begin with
> `Iv23li…`; GitHub App client IDs begin with `Ov23li…`. If yours starts with
> `Ov`, you registered the wrong kind. The Worker detects this at token exchange
> and reports it rather than handing back a token that cannot work.

## Registration values

| Field                      | Value                                                       |
| -------------------------- | ----------------------------------------------------------- |
| Application name           | `CodeLedger`                                                |
| Homepage URL               | `https://codeledger.vkrishna04.me`                          |
| Authorization callback URL | `https://codeledger.vkrishna04.me/api/auth/github/callback` |
| Enable Device Flow         | off                                                         |

The callback URL must match exactly — GitHub rejects the exchange on any
mismatch, including a trailing slash.

## Scopes

The Worker requests `public_repo,workflow` by default:

- `public_repo` — create and commit to public repositories
- `workflow` — required only because the generated ledger can contain a
  `.github/workflows/` file; GitHub refuses any commit touching that path
  without it

A user who chooses a private ledger triggers a second authorization at `repo`.
The Worker's allow-list is `public_repo`, `public_repo,workflow`, `repo`,
`repo,workflow`; anything else falls back to the default.

Scopes are not configured in the OAuth App — they are requested per
authorization. There is nothing to set on GitHub's side.

## Worker secrets

Set each with `wrangler secret put NAME` from the `worker/` directory. The
command takes only the name and prompts for the value; do not pass the value as
an argument, or it lands in your shell history.

```bash
cd worker
npx wrangler secret put CODELEDGER_OAUTH_CLIENT_ID
```

| Secret                           | Purpose                                      |
| -------------------------------- | -------------------------------------------- |
| `CODELEDGER_OAUTH_CLIENT_ID`     | OAuth App client ID (`Iv23li…`)              |
| `CODELEDGER_OAUTH_CLIENT_SECRET` | OAuth App client secret                      |
| `SESSION_SECRET`                 | HMAC key for the signed `state` cookie       |
| `CANONICAL_UPLOAD_TOKEN`         | Bearer token for `POST /api/admin/canonical` |

The Worker resolves the two client values through an alias list, newest name
first: `CODELEDGER_OAUTH_CLIENT_ID` → `CODELEDGER_GH_APP_CLIENT_ID` →
`GITHUB_CLIENT_ID`, and the matching chain for the secret. Deployments that
predate the OAuth App switch keep working under the older names; new ones should
use the `CODELEDGER_OAUTH_*` pair.

`CODELEDGER_GH_APP_WEBHOOK_SECRET` is optional. `POST /api/webhook/github`
refuses every request while it is unset, which is the correct posture unless you
have a webhook configured.

`CODELEDGER_GH_APP_ID` and `CODELEDGER_GH_APP_PRIVATE_KEY` are **not used**. The
Worker reads neither; they were needed only by the GitHub App token-minting
endpoints, which no longer exist. If they are still set on your deployment,
delete them.

`SESSION_SECRET` is not optional. `GET /api/auth/:provider` signs the OAuth
`state` with it, and the callback verifies it; without the secret, sign-in
returns 500 for everyone.

Generate the two random secrets locally. On Windows, `openssl` is usually not on
PATH, so use Node:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Do not use PowerShell's `Get-Random` — it is a seeded PRNG, not a CSPRNG.

The names carry a `CODELEDGER_` prefix because GitHub Actions refuses repository
secrets beginning with `GITHUB_`, and CI uploads these same values.

## Secret rotation

If a client secret is ever exposed — pasted into a chat, committed, logged —
rotate it in this order, so sign-in never breaks:

1. **Generate** a second client secret in the OAuth App settings. GitHub accepts
   both at once.
2. **Upload** it: `npx wrangler secret put CODELEDGER_OAUTH_CLIENT_SECRET`, then
   deploy.
3. **Verify** sign-in works end to end.
4. **Delete** the exposed secret on GitHub.

GitHub will not let you delete the only secret, which is why the new one must
exist first.

## Verifying

After `npx wrangler deploy`:

```bash
curl -sf https://codeledger.vkrishna04.me/api/health
```

Then open `https://codeledger.vkrishna04.me/api/auth/github` in a browser. It
should redirect to GitHub's authorization screen, and after approval the
callback should render a small page that `postMessage`s
`{ type: 'CODELEDGER_AUTH', provider: 'github', token }` back to the opener.
The extension listens for exactly that message type; any mismatch drops the
token silently.

## File references

- Worker auth routes: [worker/src/index.js](../../../worker/src/index.js)
- Worker config template: `worker/wrangler.toml.example` (the real
  `wrangler.toml` is git-ignored)
- Route contract: [docs/OPENAPI.yaml](../../OPENAPI.yaml)
