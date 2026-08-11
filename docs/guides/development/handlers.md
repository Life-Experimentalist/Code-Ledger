# Handlers Overview

This document describes the three handler types in CodeLedger and the current verification status of each implementation.

## Handler types

- **AI providers:** under `src/handlers/ai/` — adapter classes that call external AI providers and normalize responses.
- **Git providers:** under `src/handlers/git/` — repository provider integrations and commit builders.
- **Platform handlers:** under `src/handlers/platforms/` — per-site content detectors and extractors (LeetCode, GFG, Codeforces).

## Repository layout (handlers)

```
src/handlers/
  _base/                 # base classes (BaseAIHandler, BaseGitHandler, BasePlatformHandler)
  ai/                    # AI provider adapters (gemini, openai, claude, ...)
  git/                   # Git provider adapter (github — the only one)
  platforms/             # Platform handlers (leetcode, geeksforgeeks, codeforces)
```

## What ships

Every handler listed here is registered in `src/handlers/init.js` and reachable
from the UI. There is no "beta" tier: a handler that could not do its job was
deleted rather than shipped behind a label.

- **Platform:** `leetcode`, `geeksforgeeks`, `codeforces`
- **Git:** `github` — the only one. The GitLab and Bitbucket adapters were
  removed in 1.7.0; every method on them threw.
- **AI:** `gemini`, `openai`, `claude`, `deepseek`, `ollama`, `openrouter`

## How far each is exercised

- `leetcode`, `github` and `gemini` have been run end to end — an accepted
  submission through to a commit with an AI review attached.
- `geeksforgeeks` and `codeforces` are exercised by the unit suite and by hand,
  but their DOM selectors are the part of the codebase most likely to rot; a
  platform refresh breaks detection before it breaks anything else.
- The other five AI adapters are covered by the suite against recorded
  responses. A live run needs that provider's key.

Nothing here is gated on a live integration test, because there isn't one — see
"An end-to-end test against a real repository" in `docs/ROADMAP.md`.

## Developer notes

- Run quick diagnostics that report handler health and status:

```powershell
Set-Location "V:\Code\ProjectCode\CodeLedger"
node dev/diagnose.js
```

- The diagnostic output helps pinpoint missing secrets, failing network calls, or selector mismatches for platform handlers.
- When adding or modifying handlers, extend the appropriate `Base*Handler` subclass in `src/handlers/_base/`.

## Best practices

- Keep vendor bundles out of handler detection logic; prefer explicit selectors and GraphQL when available.
- Use `createDebugger()` from `src/lib/debug.js` instead of `console.log` for all handler logging.
- Add unit tests for any new handler logic and a small end-to-end smoke test that exercises commit creation to a test repository.
