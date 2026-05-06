# Contributing to CodeLedger

Thanks for taking the time to contribute! This guide covers everything you need to open a quality pull request.

---

## Table of Contents

1. [Before you start](#before-you-start)
2. [Local setup](#local-setup)
3. [Branch & PR flow](#branch--pr-flow)
4. [Code guidelines](#code-guidelines)
5. [Adding a platform handler](#adding-a-platform-handler)
6. [Adding an AI provider](#adding-an-ai-provider)
7. [Canonical mapping contributions](#canonical-mapping-contributions)
8. [Versioning & changelog](#versioning--changelog)
9. [Release & packaging](#release--packaging)
10. [Commit message format](#commit-message-format)
11. [Security](#security)

---

## Before you start

1. Read the architecture overview in `docs/ARCHITECTURE.md` and `CLAUDE.md`.
2. Check open issues and the feature requests file (`docs/FEATURE_REQUESTS.md`) before starting work.
3. For canonical mapping work, use the dedicated issue template and apply the `canonical-mapping` label.
4. For security vulnerabilities, do **not** open a public issue — see [`SECURITY.md`](SECURITY.md).

---

## Local setup

```bash
npm install
npm run build:css   # compile Tailwind → src/ui/styles/compiled.css
npm run lint        # tsc --noEmit type-check (run before every PR)
```

Load the extension unpacked from `src/` at `chrome://extensions` (Developer mode → Load unpacked).

For the Cloudflare Worker:

```bash
cd worker && npm install
npx wrangler dev    # local dev — requires wrangler.toml with secrets (see docs/guides/CODELEDGER_EXECUTION_GUIDE.md)
```

---

## Branch & PR flow

1. Fork the repo and create a feature branch from `main`.
2. Keep PRs focused — one logical change per PR.
3. Run `npm run lint` and ensure it passes before pushing.
4. Fill out the PR template, especially the checklist.
5. Add or update `docs/CHANGELOG.md` if your change is user-visible (see [Versioning & changelog](#versioning--changelog)).

---

## Code guidelines

### Core rules — never violate these

| Rule | Why |
|------|-----|
| No `chrome.*` or `browser.*` outside `src/lib/browser-compat.js` | Single cross-browser shim |
| No `console.log` — use `createDebugger()` from `src/lib/debug.js` | Preserves source location in DevTools |
| No storage key strings — use `CONSTANTS.SK.*` | Prevents key drift between reads and writes |
| OAuth tokens go through `Storage.setAuthToken()` only | Tokens must never land in settings |
| All UI uses Preact + htm — no JSX, no bundler | Extension CSP forbids eval/dynamic scripts |
| Only `src/lib/browser-compat.js` touches extension APIs | All other files import from this shim |

### Style

- Match existing indentation and formatting (2-space in JS, see `.prettierrc` in `package.json`).
- No unrelated refactors in feature or bug-fix PRs.
- Do not remove pre-existing dead code unless that's the stated purpose of the PR.
- Run `npm run build:css` after any Tailwind class changes.

---

## Adding a platform handler

1. Create `src/handlers/platforms/{name}/index.js` extending `BasePlatformHandler`
2. Create `dom-selectors.js` with versioned `SELECTORS`, `LEGACY_SELECTORS`, and `DOMAINS` export
3. Create `page-detector.js` with `detectPage()` and `isSolveCapablePage()`
4. Add hostname match in `src/content/handler-loader.js`
5. Run `node dev/generate-manifest-domains.js` to update `manifest.json` `host_permissions`
6. See `docs/ADDING_PLATFORM_HANDLER.md` for the full contract and checklist

---

## Adding an AI provider

1. Create `src/handlers/ai/{name}/index.js` extending `BaseAIHandler`
2. Create `model-fetcher.js` (fetch live models or export a static list)
3. Add provider config to `CONSTANTS.AI_PROVIDERS` in `src/core/constants.js`
4. Register settings schema in `src/handlers/init.js`
5. Wire into `ModelSelector.js` and `PanelAI.js`

---

## Canonical mapping contributions

If your change affects canonical mapping:

- Update `src/data/canonical-map.json` through the established process.
- Apply the `canonical-mapping` label to the issue.
- Include rationale and aliases clearly.
- Run `node dev/build-canonical-map.js` to validate.

---

## Versioning & changelog

CodeLedger follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`) and [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

**Version is stored in two canonical places — both must be kept in sync:**
- `src/manifest.json` → `"version"` field
- `package.json` → `"version"` field

### When to update the changelog

Update `docs/CHANGELOG.md` for any user-visible change: new features, bug fixes, breaking changes, deprecations, or security fixes. Internal refactors that don't affect users can omit a changelog entry.

### How to update

1. Add your entry under the appropriate section in the latest `## [Unreleased]` block at the top of `docs/CHANGELOG.md`.
2. Sections: **Added**, **Fixed**, **Changed**, **Removed**, **Security**.
3. Write entries in past tense from the user's perspective: _"Fixed copy of code with whitespace visualization characters"_ not _"changed cleanCode function"_.

---

## Release & packaging

Only maintainers cut releases, but contributors should be aware of the process:

```bash
# 1. Update CHANGELOG.md — move [Unreleased] items to a new [x.y.z] section
# 2. Bump version in BOTH src/manifest.json AND package.json
# 3. Run the publish command:
npm run publish
# Produces in releases/:
#   codeledger-chrome-vX.Y.Z.zip   ← load in Chrome/Edge/Brave
#   codeledger-firefox-vX.Y.Z.zip  ← submit to AMO / side-load in Firefox
#   codeledger-source-vX.Y.Z.zip   ← source tarball

# 4. Commit and tag:
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push origin main vX.Y.Z
# Pushing the tag triggers .github/workflows/release.yml which creates the GitHub Release
```

---

## Commit message format

Use [Conventional Commits](https://www.conventionalcommits.org/) style:

```
<type>: <short summary>

[optional body]
```

| Type | When to use |
|------|-------------|
| `feat` | New user-facing feature |
| `fix` | Bug fix |
| `chore` | Build, tooling, dependency updates |
| `docs` | Documentation only |
| `refactor` | Code restructuring (no behaviour change) |
| `perf` | Performance improvement |
| `test` | Test additions or fixes |
| `ci` | CI/CD changes |

Examples:
```
feat: add OpenRouter AI provider
fix: strip Monaco whitespace chars from copied code
chore: release v1.1.0
docs: add canonical mapping contribution guide
```

---

## Security

Do not include secrets, API keys, or OAuth tokens in commits, screenshots, or issue comments.

For security vulnerabilities, follow responsible disclosure — see [`SECURITY.md`](SECURITY.md). Do not open a public issue.
