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
  git/                   # Git provider adapters (github, gitlab, bitbucket)
  platforms/             # Platform handlers (leetcode, geeksforgeeks, codeforces)
```

## Verified vs Beta

As of this snapshot the following handlers are verified and working in local dev runs:

- **AI:** `gemini` — verified
- **Git:** `github` — verified (Trees API commit flow)
- **Platform:** `leetcode` — verified

Remaining handlers are under construction or beta and should be considered non-production until verified:

- **AI:** `claude`, `deepseek`, `ollama`, `openai`, `openrouter` (beta/under construction)
- **Git:** `gitlab`, `bitbucket` (beta/under construction)
- **Platform:** `geeksforgeeks`, `codeforces` (beta/under construction)

## How verification was determined

- `gemini`, `github`, and `leetcode` were exercised end-to-end in dev runs and confirmed to produce commits, AI reviews, and UI integration with the library dashboard.
- Other adapters compile and are wired but either lack live integration tests or require provider secrets for a full verification run.

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

If you'd like, I can add smoke-test scripts that run the verified handlers against a disposable test repo and publish results to CI.
