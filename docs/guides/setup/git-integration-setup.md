/\*\*

- @license
- SPDX-License-Identifier: Apache-2.0
  \*/

# Git integration

CodeLedger commits to **GitHub and only GitHub**. There is one git handler,
`src/handlers/git/github/`, and it is the only one registered in
`src/handlers/init.js`. GitLab and Bitbucket handlers existed until 1.7.0 but
every method threw, so they were deleted rather than left where a user could
pick them.

## Settings keys

| Key             | Holds                        | Set by                                        |
| --------------- | ---------------------------- | --------------------------------------------- |
| `github_owner`  | Account or org that owns it  | Onboarding, from `GET /user`                  |
| `github_repo`   | Repository name              | Onboarding, or typed in **Settings → Git**    |
| `github_token`  | Manual personal access token | **Settings → Git**, only when not using OAuth |
| `git_mirrors[]` | Extra push targets           | **Settings → Git → Mirror Repositories**      |

OAuth tokens do **not** live in settings. They go to `auth.tokens` via
`Storage.setAuthToken("github", token)` and are read back with
`Storage.getAuthToken("github")`. `GitHubHandler.getToken()` checks that path
first and falls back to `settings.github_token`.

`settings.gitRepo` is a legacy camelCase spelling still honoured on read. Write
`github_repo`; read `settings.github_repo || settings.gitRepo`.

## Commit flow

```
Accepted submission on LeetCode / GeeksForGeeks / Codeforces
    ↓
eventBus.emit("problem:solved", data)
    ↓
service-worker.js saves to IndexedDB, optionally runs the AI review
    ↓
_commitWithFailover(files, message, ...)
    ↓
resolves the ordered target list — primary repo, then each configured mirror
    ↓
GitHubHandler.commit(files, message, repo)
    ↓
POST /git/trees → POST /git/commits → PATCH /git/refs/heads/{branch}
    ↓
one atomic commit for the whole file set
```

`_commitWithFailover()` tries the primary first and only moves to a mirror after
the primary throws. A mirror is a full push target, not a backup copy: the same
files go to every active mirror on every commit.

An empty repository has no `refs/heads/{branch}` to patch. `initializeRepository()`
detects that, builds a **root commit** — no `base_tree`, no `parents` — and
creates the ref instead of patching it.

## OAuth token flow

```
"Connect" in the library header opens https://codeledger.vkrishna04.me/api/auth/github
    ↓
Worker mints an HMAC-signed state cookie (10-minute TTL) and redirects to GitHub
    ↓
GitHub redirects back to /api/auth/github/callback
    ↓
Worker verifies the state cookie in constant time, exchanges the code
    ↓
Worker posts { type: "CODELEDGER_AUTH", provider: "github", token }
    ↓
library.js listener → Storage.setAuthToken("github", token)
```

The message type must match exactly. Anything else is dropped in silence.

## Before OAuth will work

Worker secrets, set from `worker/` with `npx wrangler secret put NAME` — the
command takes the name only and prompts for the value, so nothing lands in shell
history:

- `CODELEDGER_OAUTH_CLIENT_ID` — classic **OAuth App** client ID, starts `Iv23li`
- `CODELEDGER_OAUTH_CLIENT_SECRET`
- `SESSION_SECRET` — 32 random bytes; **sign-in returns 500 without it**
- `CANONICAL_UPLOAD_TOKEN` (optional) — guards `POST /api/admin/canonical`
- `CODELEDGER_GH_APP_WEBHOOK_SECRET` (optional) — HMAC for the webhook route

A client ID starting `Ov23li` belongs to a **GitHub App**, not an OAuth App.
GitHub Apps ignore the `scope` parameter and issue expiring user-to-server
tokens that get `403 Resource not accessible by integration` on
`POST /user/repos`. The callback detects that token shape and reports it at
sign-in. See [GitHub OAuth App setup](github-oauth-app-setup.md).

Then deploy and check:

```bash
cd worker && npx wrangler deploy
```

```bash
curl -sf https://codeledger.vkrishna04.me/api/health
```

## Adding a second provider

The registry, the settings schema, the mirror picker and the failover loop are
all provider-agnostic already — `_commitWithFailover()` reads `target.provider`
and asks the registry for it. What a new provider needs is a handler under
`src/handlers/git/{name}/` implementing `BaseGitHandler`, an entry in
`CONSTANTS.GIT_PROVIDERS`, a line in the `gits` array in `src/handlers/init.js`,
and an entry in `PROVIDERS` in `src/ui/components/MirrorsPanel.js` and
`MIRROR_PROVIDERS` in `src/library/settings-panels/PanelGit.js`.

The `gitlab_token` and `bitbucket_token` keys are still in the settings-sync
denylist. A denylist costs nothing, and a future provider should not have to
remember to add itself to one.

## See also

- [OAuth testing guide](oauth-testing-guide.md)
- [GitHub OAuth App setup](github-oauth-app-setup.md)
- `node dev/diagnose.js` — reports which handlers are present and wired
