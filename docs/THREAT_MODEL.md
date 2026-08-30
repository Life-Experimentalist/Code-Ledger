# CodeLedger threat model

What this extension defends against, what it does not, and what is left over.

This document is deliberately specific about its own weaknesses. A threat model
that claims total safety is worthless, and CodeLedger is in a category — an
extension holding a GitHub token, AI provider keys and a running record of what
you work on — where a user is entitled to know exactly what they are trusting.
Everything below is a claim about code in this repository, and the "not defended"
section is the important half.

Report anything not covered here through [.github/SECURITY.md](../.github/SECURITY.md).

---

## What CodeLedger holds

| Asset                    | Where it lives                            | What it is worth to an attacker                                   |
| ------------------------ | ----------------------------------------- | ----------------------------------------------------------------- |
| GitHub OAuth token       | `auth.tokens` in `chrome.storage.local`   | Write access to your repositories, at the granted scope           |
| GitHub PAT (legacy path) | `settings.github_token`                   | The same, at whatever scope you gave it                           |
| AI provider API keys     | `ai.keys` in `chrome.storage.local`       | Billable use of your account                                      |
| Your solutions           | IndexedDB, and your ledger repository     | Usually not secret; occasionally interview or coursework material |
| Your activity record     | The same, plus the published Pages report | When and how much you practise                                    |

The default OAuth scope is `public_repo,workflow`. `repo,workflow` is requested
only if you opt in to a private ledger, and is the only wider value the worker
accepts — the `scope` parameter is an allow-list, not a pass-through.

## Where the boundaries are

1. **Platform page → content script.** The extension runs an isolated-world
   content script on LeetCode, GeeksForGeeks, Codeforces, NeetCode and
   takeuforward. The page cannot read that script's variables. It shares the DOM
   with it.
2. **Platform page ↔ the network tap.** On NeetCode and takeuforward only, a
   second content script runs in the page's **own** world. There is no boundary
   here at all. This is the most important line in this document and it has its
   own section below.
3. **Ledger repository → extension.** `index.json` is read back during sync. It
   is repository content: hand-editable, writable by any collaborator or leaked
   token, and readable from whatever repository the user is pointed at. It is
   treated as untrusted input.
4. **Extension → AI provider.** Your code and the prompt leave your machine, to
   a provider you chose, with your key. This is the feature, not a failure.
5. **Extension → Cloudflare Worker.** The worker does OAuth and serves the
   landing page. Solve data never touches it.
6. **Worker → GitHub.** Standard OAuth code exchange.

---

## What it defends against

Each of these is implemented and covered by a test that fails without it.

**Repository content cannot steer the extension.** Every path segment written to
your repository goes through `safeSegment()` in `src/core/path-builder.js`, which
collapses any run of dots to one and maps separators to hyphens, so no value
originating in a repository or a platform can escape the `problems/` tree.
Records read back out of `index.json` have the extension's own underscore-prefixed
bookkeeping fields stripped, so a hand-written `_committedPaths` cannot nominate
files for deletion and a `_conflictResolvedAt` cannot silence a conflict prompt.
A remote record that would land in a local record's storage slot raises a conflict
instead of overwriting it. Malformed entries are skipped rather than aborting the
import.

**The OAuth flow is CSRF-protected and the callback page is locked down.** The
`state` value is HMAC-signed with a 10-minute lifetime, carried in an `HttpOnly;
Secure; SameSite=Lax` cookie, and verified in constant time before anything else
— including before rendering an `error_description`, so the callback cannot be
used to put chosen text on the page. Sign-in fails closed if `SESSION_SECRET` is
unset rather than proceeding unsigned. The callback response, which is the one
place a fresh repo-scoped token is handed through the DOM, carries
`default-src 'none'` with no `connect-src`, so a script that somehow ran there
has nowhere to send the token; the inline style and script carry a per-response
nonce, since a static hash cannot work on a script whose content includes the
token. `frame-ancestors 'none'`, `X-Frame-Options: DENY` and `nosniff` come with
it. A GitHub-App-shaped token response is detected and refused at sign-in rather
than surfacing later as an unexplained 403.

**The webhook fails closed.** An unset `CODELEDGER_GH_APP_WEBHOOK_SECRET` returns
503 rather than skipping verification. The signature is compared in constant time,
as is the admin upload token.

**Credentials stay out of the logs.** No debug line prints any part of a token or
an API key. Debug output is something people paste into bug reports.

**A page cannot drive the buttons that write to your repository.** Content scripts
share the page's DOM, so a compromised platform page can find our UI and call
`.click()` on it. The ten buttons that commit or import require a real user
gesture. This deliberately excludes buttons that write nothing, and the listeners
attached to the platforms' own submit buttons, where a site clicking its own
button is normal.

**Code recovery checks which tab answered.** The reply to a background recovery
fetch must come from the tab the extension opened, not merely carry the right
problem id — the id travels in a URL and is not a secret.

**A custom AI endpoint can only come from you.** The endpoint override decides
where your code is posted and where your key is sent. It is never written to the
repository, never accepted from one, and never carried in a backup; it is also
re-checked at the point of use, where a non-`https:` URL (except loopback, for
Ollama) is dropped in favour of the built-in endpoint.

**Rendered HTML goes through an allow-list.** Every HTML string the UI renders
passes `src/lib/sanitize-html.js`. Extension pages run under
`script-src 'self'`, and Preact and htm are vendored as committed bundles — nothing
is fetched from a CDN at runtime, and a store reviewer can read every line that
executes.

**The network tap's reach is pinned by tests.** One main-world script, two hosts,
top frame only, an endpoint allow-list checked before anything is read, no header
access, no wildcard target origin. Widening any of those is a one-line change in a
file nobody reads closely, so each is a test that fails.

---

## What it does not defend against

### A compromised platform page can fabricate a solve

This is the real limit and it is not fixable within the current design.

On NeetCode and takeuforward, the verdict lives in a JSON response no
isolated-world script can read, so `src/content/net-tap.js` runs in the page's own
world at `document_start` to wrap `fetch` and `XMLHttpRequest`. Sharing a world
means sharing a message channel. A compromised page on either host can post a
well-formed accepted-submission message and have code of its choosing committed to
your repository.

**This cannot be fixed with a shared secret, and a nonce there would be theatre.**
Both halves would have to agree one over `window`, where every `message` listener
hears every `postMessage` and `event.ports` is readable by all listeners. The
isolated half — `content/handler-loader.js` — runs at `document_idle`, after the
page's own scripts have run, so there is no window in which a handshake could be
private. Shipping a nonce would have made the code look defended without changing
what an attacker can do, which is worse than the honest gap.

The broader version of this is true on every platform, tap or no tap: on the
DOM-reading platforms the extension believes what the page tells it about what you
solved. A compromised or XSS'd platform page can make CodeLedger commit content
you never wrote. What holds is scope — the tap reads two hosts, top frame only,
from an endpoint allow-list — not authentication.

The consequence is bounded by what a commit can do: content in your ledger
repository, at the scope you granted. It is not token theft, and the tap never
touches headers.

### Anyone with your OS profile has your tokens and keys

`chrome.storage.local` is not separately encrypted. Anyone who can read your
browser profile — another local account with access, malware running as you, an
unencrypted backup of your disk — has your GitHub token and your AI keys. This is
true of the whole browser profile and is not something an extension can fix from
inside. It is disclosed in [PRIVACY.md](../PRIVACY.md).

### Another extension in the same browser

The storage API is per-extension: no other extension reads `chrome.storage.local`
through it. That is the only boundary the browser enforces, and it is narrower
than it sounds. An extension with debugger access can attach to CodeLedger's
pages, and one with host permissions on the same sites shares the DOM our content
scripts write to. MV3 offers no defence against either. Install extensions you
trust.

### Your AI provider sees your code

That is what sending it for review means. CodeLedger does not read your key or
your solutions itself, and no solve data reaches the CodeLedger worker — but the
provider you pick receives the code, the prompt, and whatever metadata the prompt
carries, under their retention policy and not ours.

The endpoint check validates the **scheme, not the host**. Any `https:` URL you can
be persuaded to type into the endpoint box will be used, because a host allow-list
narrow enough to mean anything would break the custom-gateway feature it was
guarding. Keeping a hostile URL out of your settings in the first place is what the
sync and backup exclusions are for; the scheme check is only a backstop.

### A leaked GitHub token

At `public_repo` an attacker can write to any public repository you own — not just
the ledger. At `repo`, private ones too. CodeLedger cannot narrow this; GitHub
OAuth scopes are not per-repository. If you want the blast radius limited to one
repository, use a fine-grained PAT scoped to it in the manual token field rather
than OAuth. Rotate at
[github.com/settings/applications](https://github.com/settings/applications).

### `index.json` is not signed, and sync trusts your judgement

There is nothing cryptographically binding a record to the device that wrote it.
Sync detects that two records disagree and asks you which to keep; it cannot tell
you which one is authentic. If someone can write to your ledger repository, they
can offer you plausible records and the only check is you reading them.

There is also **no size cap** on `index.json`. A very large or deeply nested file
can make the import slow or exhaust memory. This is resource exhaustion against
your own browser tab by content from your own repository, and it is not addressed.

### The worker operator

The OAuth flow runs through `codeledger.vkrishna04.me`, which means the person who
operates that worker could serve a callback page that keeps a copy of your token.
That is me. You are trusting a domain; the worker source is in `worker/` and the
routes are specified in `docs/OPENAPI.yaml`, so the claim is checkable, but a
deployed worker is not the same artifact as the source you read. If that trust is
not acceptable, use the manual PAT path, which never contacts the worker at all.

### Supply chain

`src/vendor/*.js` are committed esbuild bundles of packages installed from npm.
Committing them means a reviewer can read exactly what ships and nothing is fetched
at runtime — but npm is trusted at the moment `npm run vendor:preact` is run, and
the build tooling under `dev/` is trusted whenever it runs.

`mermaid.ink` is the one remote service the UI can call, only after an explicit
click, and it receives the diagram source of the AI response you chose to render.

### A public ledger is public

If you make your ledger repository public, your solutions and your activity record
are public, along with the Pages report. That is the point of the feature. The
extension says so before you create one.

---

## Residual risks, ranked

1. **A compromised NeetCode or takeuforward page can commit code to your
   repository**, with nothing on screen to show for it. Unfixable with a shared
   secret; bounded by the tap's scope and by what a commit can do. This is the one
   to know about.
2. **A compromised page on any supported platform can fabricate a solve** through
   the DOM. Same bound, wider surface, older problem.
3. **Local credential theft** by anything that already has your OS profile.
4. **A leaked GitHub token reaches every repository in scope**, not only the
   ledger.
5. **An untrusted or hostile ledger repository** can waste your time with
   plausible-looking conflicts and can make the import slow. It can no longer
   delete files, silence conflicts, or overwrite a solve without asking.
6. **The worker operator** is trusted for the OAuth flow.

## What would change these

Fixing (1) properly means not needing a main-world tap: either the platforms
expose the verdict somewhere an isolated world can read, or the extension stops
supporting those two sites. A per-message signature does not help while both
halves live in the same world.

Fixing (4) means per-repository authorisation, which needs a GitHub App —
deliberately not used here, because App tokens ignore the requested scope and
cannot create a repository, which is the first thing a new user does.
