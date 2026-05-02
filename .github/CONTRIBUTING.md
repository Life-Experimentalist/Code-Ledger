# Contributing to CodeLedger

Thanks for contributing.

## Before You Start

1. Read the project architecture and setup docs in `docs/`.
2. Check open issues and feature requests before starting work.
3. For canonical mapping work, use the dedicated issue template and apply the `canonical-mapping` label.

## Local Setup

1. Install dependencies:
```powershell
npm install
```
2. Build styles when UI changes are made:
```powershell
npm run build:css
```
3. Type-check before opening a PR:
```powershell
npm run lint
```

## Branch & PR Flow

1. Create a branch from `main`.
2. Keep PRs focused and small when possible.
3. Add/update tests or validation steps where relevant.
4. Fill out the PR template, especially the handler/core checklist.

## Code Guidelines

- Follow existing architecture conventions:
  - Do not call `chrome.*` or `browser.*` outside `src/lib/browser-compat.js`.
  - Do not use raw storage key strings where constants exist.
  - Keep platform handlers in `src/handlers/platforms/{name}/`.
- Use `createDebugger()` instead of direct console logging where the project requires it.
- Avoid unrelated refactors in feature or bug-fix PRs.

## Canonical Mapping Contributions

If your change affects canonical mapping:
- Update `src/data/canonical-map.json` through the established process.
- Ensure the issue has `canonical-mapping` label.
- Include rationale and aliases clearly.
- Run relevant validation scripts/workflows.

## Commit Message Guidance

Use concise, descriptive commit messages. Example patterns:
- `fix: queue pending imported solves for next commit`
- `feat: add AI chats deep-link from floating panel`
- `docs: add canonical issue and PR templates`

## Security

Do not include secrets or API keys in commits, screenshots, or issue comments.
For security disclosures, use `SECURITY.md`.
