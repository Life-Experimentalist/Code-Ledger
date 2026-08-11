# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use GitHub's private reporting — **Security → Report a vulnerability** on
[the repository](https://github.com/Life-Experimentalist/Code-Ledger/security) —
or email **github@vkrishna04.me**.

Tell us what you found, how to reproduce it, and what an attacker gets out of it.
A proof of concept helps but is not required.

This is a one-person project, so there is no paid bounty and no guaranteed
response time. In practice you should hear back within a few days. If a fix is
warranted it ships in the next release, and the CHANGELOG says so under
**Security**.

## Supported versions

The latest release is the supported one. There is no long-term support branch.

## What is in scope

- The extension in `src/`
- The Cloudflare Worker in `worker/`
- The landing page and the `/compare` page in `worker/public/`

Anything that lets one user's data reach somewhere the user did not choose is
in scope, and so is anything that lets a page CodeLedger runs on read a token or
an API key.

## What is not

- Vulnerabilities in GitHub, in the coding platforms, or in an AI provider —
  report those to them
- The contents of a user's own public repository. A public ledger is public on
  purpose; the extension says so before you make one
- The fact that local storage is not separately encrypted at rest. Browser
  extension storage is readable by anyone who already has the OS profile, which
  is true of the whole browser profile and is documented in
  [PRIVACY.md](PRIVACY.md)

## Where the secrets are

No credential belongs in this repository. The OAuth client ID and secret, the
session signing key and the optional webhook and upload tokens are Wrangler
secrets, set with `npx wrangler secret put NAME` from `worker/`, which prompts
for the value rather than taking it as an argument. `worker/wrangler.toml` is
git-ignored for the same reason.

If you believe a secret has been exposed, say so in the report and rotate it
first — rotating is always safe.
