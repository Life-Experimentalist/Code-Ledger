# Security Policy

## Supported Versions

| Version         | Supported              |
| --------------- | ---------------------- |
| Latest (`main`) | ✅ Actively supported  |
| Previous minor  | ⚠️ Critical fixes only |
| Older releases  | ❌ No longer supported |

We recommend always running the latest release from the [Chrome Web Store](https://chrome.google.com/webstore/detail/codeledger/) or [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/codeledger/).

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report privately via email: **github@vkrishna04.me**

Use the subject line: `[CodeLedger Security] <brief description>`

### What to include

- **Component**: which part of the extension or worker is affected (e.g., OAuth handler, git-engine, storage)
- **Reproduction steps**: minimal, step-by-step instructions to trigger the issue
- **Impact**: what an attacker could achieve (data exfiltration, token theft, commit injection, etc.)
- **Affected version**: extension version from `src/manifest.json`
- **Suggested fix** _(optional)_: if you have a patch or a mitigation in mind

### What to expect

| Milestone                                          | Target                                              |
| -------------------------------------------------- | --------------------------------------------------- |
| Initial acknowledgement                            | Within 72 hours                                     |
| Triage decision (valid / invalid / need more info) | Within 7 days                                       |
| Fix ETA communicated                               | Within 14 days of confirmed validity                |
| Public disclosure                                  | After patch is released (coordinated with reporter) |

We will credit researchers by name (or handle) in the release notes unless they prefer to remain anonymous.

## Scope

Security reports are especially relevant for:

- **OAuth and token handling** — GitHub OAuth flow through the Cloudflare Worker; token storage and retrieval paths
- **Secret and API key storage** — AI provider keys, GitHub PATs stored in `chrome.storage.local`
- **Git commit pipeline** — tree API calls, commit integrity, ability to forge commits or modify other repos
- **Worker endpoints** — Cloudflare Worker routes (`/api/auth/*`, `/api/webhook/*`, `/api/admin/*`)
- **Content script isolation** — XSS from problem pages injected into extension UI
- **Supply chain** — compromised CDN dependencies (`esm.sh`, `mermaid.ink`)
- **Cross-origin message handling** — `postMessage` validation for OAuth callback

## Out of Scope

The following are **not** in scope for the security policy:

- Self-XSS (requires the user to paste malicious code into their own browser)
- Denial-of-service against third-party services (LeetCode, GitHub API, Cloudflare)
- Vulnerabilities in the user's own GitHub repository content
- Issues requiring physical access to the user's device

## Safe Harbor

CodeLedger welcomes good-faith security research. We will not pursue legal action against researchers who:

- Act in good faith and give us reasonable time to respond before any public disclosure
- Avoid accessing, modifying, or deleting data that does not belong to them
- Do not disrupt service availability or degrade user experience
- Do not violate user privacy (do not access other users' tokens or data)

We treat responsible disclosure as a contribution to the project.
