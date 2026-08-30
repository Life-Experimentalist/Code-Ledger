# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Two private channels, either is fine:

- GitHub's private reporting — **Security → Report a vulnerability** on
  [the repository](https://github.com/Life-Experimentalist/Code-Ledger/security).
  This is enabled and is the preferred route, because it keeps the report, the
  discussion and the eventual advisory in one place.
- Email **github@vkrishna04.me**, subject `[CodeLedger Security] <brief description>`.

### What to include

- **Component** — which part is affected (the OAuth callback, the GitHub handler,
  storage, a platform content script)
- **Reproduction steps** — minimal and step-by-step
- **Impact** — what an attacker actually gets: token theft, commit injection,
  data reaching somewhere the user did not choose
- **Version** — shown in the extension's settings and in `package.json`
- **Suggested fix**, optional

A proof of concept helps and is not required.

### What to expect

This is a one-person project. There is no bounty, and no response time is
guaranteed — treat everything below as intent rather than a commitment.

In practice you should hear back within a few days. If a fix is warranted it
ships in the next release, and `docs/CHANGELOG.md` records it under **Security**.
Public disclosure happens after the fix is released, coordinated with you.
Researchers are credited by name or handle in the release notes unless you would
rather stay anonymous.

## Supported versions

The latest release is the supported one. There is no long-term support branch and
no backporting — releases are tags off `main`. Install from
[Releases](https://github.com/Life-Experimentalist/Code-Ledger/releases/latest).

## Scope

Anything that lets one user's data reach somewhere the user did not choose is in
scope, and so is anything that lets a page CodeLedger runs on read a token or an
API key. Concretely:

- **OAuth and token handling** — the GitHub flow through the Cloudflare Worker,
  and every path that stores or reads a token
- **Secret storage** — AI provider keys and GitHub PATs in `chrome.storage.local`
- **The commit pipeline** — Trees API calls, commit integrity, anything that can
  forge a commit or reach a repository the user did not name
- **Worker endpoints** — `/api/auth/*`, `/api/webhook/*`, `/api/admin/*`
- **Content script isolation** — a platform page reaching extension state or UI
- **Sync ingest** — `index.json` is repository content and is treated as
  untrusted input; anything it can make the extension do is in scope
- **Supply chain** — the vendored bundles under `src/vendor/`, regenerated from
  npm by `npm run vendor:preact`, and `mermaid.ink`, the one remote service the
  UI can call and only after an explicit click

## Out of scope

- Vulnerabilities in GitHub, in the coding platforms, or in an AI provider —
  report those to them
- The contents of a user's own public repository. A public ledger is public on
  purpose, and the extension says so before you make one
- The fact that extension storage is not separately encrypted at rest. It is
  readable by anyone who already has the OS profile, which is true of the whole
  browser profile, and it is documented in [PRIVACY.md](../PRIVACY.md)
- Self-XSS that needs the user to paste hostile code into their own browser
- Denial of service against third-party services
- Anything requiring physical access to the user's device

Known and deliberately unfixed weaknesses are written down in
[docs/THREAT_MODEL.md](../docs/THREAT_MODEL.md) — read it before reporting, so you
do not spend time on something already documented. Finding a way past one of the
limits described there is very much in scope.

## Where the secrets are

No credential belongs in this repository. The OAuth client ID and secret, the
session signing key and the optional webhook and upload tokens are Wrangler
secrets, set with `npx wrangler secret put NAME` from `worker/`, which prompts for
the value rather than taking it as a command-line argument. `worker/wrangler.toml`
is git-ignored for the same reason.

If you believe a secret has been exposed, say so in the report and rotate it
first — rotating is always safe.

## Safe harbour

CodeLedger welcomes good-faith security research, and will not pursue legal action
against researchers who act in good faith, give reasonable time to respond before
public disclosure, avoid accessing or destroying data that is not theirs, and do
not degrade the service for others.
