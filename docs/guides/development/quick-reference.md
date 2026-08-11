# Quick reference

The commands and storage paths you reach for most often. Everything here was
checked against the tree, not copied from an older note.

## Commands

```bash
npm run build:fast      # dist only, skips the Tailwind step — the fast inner loop
npm run watch           # rebuild on change
npm run lint            # type gate: fails on TS2304/TS2552/TS2349/TS1117 only
npm test                # the node:test suites under test/ and worker/test/
npm run format:check    # prettier, read-only
node dev/diagnose.js    # which handlers are present and wired
```

`npm run lint` prints a count of structural advisories and exits 0 on them.
`npm run lint:all` shows them.

## Load the extension

```bash
npm run build:fast
```

Then `chrome://extensions` → Developer mode → **Load unpacked** →
`dist/chromium`. Firefox uses `dist/firefox` via `about:debugging`.

Load from `dist/`, not from `src/`. `src/` holds `manifest-chromium.json` and
`manifest-firefox.json`; the build picks one and writes it out as
`manifest.json`, which is the name the browser looks for.

Run `npm run build:css` after touching a Tailwind class — `build:fast` skips it,
so a new utility class will silently do nothing until you do.

## Handlers that exist

| Kind     | Registered                                                       |
| -------- | ---------------------------------------------------------------- |
| Platform | `leetcode`, `geeksforgeeks`, `codeforces`                        |
| Git      | `github` — the only one                                          |
| AI       | `gemini`, `openai`, `claude`, `deepseek`, `ollama`, `openrouter` |

Registration happens in `src/handlers/init.js`. If a handler is not in one of
those three arrays, nothing can reach it.

## Where things are stored

| What            | Path                    | Read with                        |
| --------------- | ----------------------- | -------------------------------- |
| OAuth token     | `auth.tokens[provider]` | `Storage.getAuthToken("github")` |
| AI API keys     | `ai.keys[provider]`     | `Storage.getAIKeys()`            |
| Settings        | `settings`              | `Storage.getSettings()`          |
| Solved problems | IndexedDB               | `Storage.getAllProblems()`       |

Inspect them from the DevTools console of the library page:

```javascript
const all = await chrome.storage.local.get(null);
console.log(all["auth.tokens"], all["ai.keys"], all.settings);
```

Never hardcode a settings key — use `CONSTANTS.SK.*` from
`src/core/constants.js`.

## Files worth knowing

| File                               | Purpose                                              |
| ---------------------------------- | ---------------------------------------------------- |
| `src/core/constants.js`            | Every URL, storage key name and provider config      |
| `src/background/service-worker.js` | Solve → commit pipeline, alarms, queues              |
| `src/handlers/init.js`             | The registration arrays                              |
| `src/handlers/git/github/index.js` | The commit itself (Trees API)                        |
| `src/library/library.js`           | OAuth message listener, onboarding trigger           |
| `src/lib/browser-compat.js`        | The only file allowed to touch `chrome.*`            |
| `docs/OPENAPI.yaml`                | The worker's contract — change it in the same commit |

## Troubleshooting

- **Sign-in returns 500** — `SESSION_SECRET` is not set on the worker. The state
  cookie cannot be signed without it.
- **`403 Resource not accessible by integration`** — the OAuth app is registered
  as a GitHub App. Client IDs start `Ov23li` for OAuth Apps, `Iv23li` (or the
  older `Iv1.`) for GitHub Apps.
- **Token not saving** — the worker's `postMessage` type must be exactly
  `CODELEDGER_AUTH`.
- **LeetCode not detecting** — selectors moved. Check
  `src/handlers/platforms/leetcode/dom-selectors.js` and the observer errors in
  the page console.
- **Commit failing** — the handler logs status, message and headers on every
  failure. Read the service worker console.

## See also

- [Git integration](../setup/git-integration-setup.md)
- [OAuth testing guide](../setup/oauth-testing-guide.md)
- [Handlers overview](handlers.md)
