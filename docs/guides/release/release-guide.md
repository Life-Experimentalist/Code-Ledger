# Release Guide

How to cut a new release of CodeLedger.

## Prerequisites

- You have push access to the repository.
- Your git user is configured: `git config user.name` and `git config user.email`.
- You are on the `main` branch and your working directory is clean.

## Steps

### 1. Update the changelog

Add a new section at the top of `docs/CHANGELOG.md`:

```markdown
## [X.Y.Z] — YYYY-MM-DD

### Added

- Feature 1
- Feature 2

### Fixed

- Bug fix 1

### Changed

- Behavior change 1
```

Follow [Keep a Changelog](https://keepachangelog.com) format.

See the section landing page at [Release Guides](./README.md).

### 2. Bump version

Update `package.json` → `"version": "X.Y.Z"`, then run:

```bash
node dev/sync-manifests.js
```

which copies it into `src/manifest-chromium.json` and `src/manifest-firefox.json`.
All three must match or the release is refused.

### 3. Preview the release (optional)

```bash
npm run release -- --dry-run
```

This validates everything without making any git changes. You'll see:

- Version check (both manifests ↔ package.json)
- Changelog entry validation
- Sync regression check
- Working directory status
- Build commands that will run
- Git commands that will be executed

### 4. Cut the release

```bash
npm run release
```

This does **everything automatically**:

1. ✅ Validates versions match (`package.json` ↔ both platform manifests)
2. ✅ Checks `docs/CHANGELOG.md` has an entry for the version
3. ✅ Runs sync regression checks
4. ✅ Builds CSS + extension distributions
5. ✅ Packages `releases/X.Y.Z/` with 3 zips (chromium, firefox, source)
6. ✅ Commits the release artifacts
7. ✅ Creates tag: `vX.Y.Z`
8. ✅ Pushes to GitHub (triggers GitHub Actions)

### 5. Verify on GitHub

Once the push completes:

1. Go to [Releases](https://github.com/Life-Experimentalist/Code-Ledger/releases)
2. GitHub Actions job `release.yml` runs automatically
3. It creates a GitHub Release with:
   - Release notes extracted directly from the `## [X.Y.Z]` section in `docs/CHANGELOG.md`
   - 3 attached zips:
     - `codeledger-chromium-vX.Y.Z.zip`
     - `codeledger-firefox-vX.Y.Z.zip`
     - `codeledger-source-vX.Y.Z.zip`

> The zips are also committed to `releases/X.Y.Z/` in the repository itself for direct download without going through the GitHub Release UI.

## Troubleshooting

### "Working directory not clean"

```bash
git status
# Commit or stash any changes
```

### "Tag already exists"

The version tag already exists. Check if you already released this version:

```bash
git tag -l | grep vX.Y.Z
```

### "Commit failed"

Most likely a pre-commit hook issue. Run:

```bash
npm run lint
```

to fix any type errors, then try again.

### "Push failed"

Ensure you have push access and are on `main`:

```bash
git branch
git remote -v
```

### "Undo a release"

If the push succeeds but something is wrong, you can undo locally (before CI completes):

```bash
git reset --soft HEAD~1          # Undo commit
git tag -d vX.Y.Z               # Delete local tag
git push origin :vX.Y.Z         # Delete remote tag (if already pushed)
```

Then fix the issue and try again.

## Command reference

```bash
npm run release                    # Full automated release
npm run release -- --dry-run       # Preview without git changes
npm run publish                    # Just build + package zips locally (no git ops)
npm run build:css                  # Compile Tailwind only
npm run lint                       # Type-check before release
npm run test:sync-regression       # Sync regression safety check
```

## Architecture

The release process uses the v2 build system in `dev/v2/`:

- **`npm run publish`** (`dev/v2/cli.js publish`)
  - Validates `package.json` ↔ `manifest.json` versions match
  - Compiles Tailwind CSS
  - Builds extension distributions (`npm run build:dist`)
  - Packages 3 zips into `releases/X.Y.Z/`:
    - `codeledger-chromium-vX.Y.Z.zip` — Chrome/Chromium extension
    - `codeledger-firefox-vX.Y.Z.zip` — Firefox extension (side_panel removed from manifest)
    - `codeledger-source-vX.Y.Z.zip` — Full source snapshot (`src/`, `dev/`, `docs/`, `worker/`, root configs)

- **`npm run release`** (`dev/v2/cli.js release`)
  - All of the above, plus:
  - Validates `docs/CHANGELOG.md` has an entry for the version
  - Runs sync regression tests
  - `git add -A && git commit -m "chore: release vX.Y.Z"` (commits built zips)
  - `git tag vX.Y.Z`
  - `git push origin main vX.Y.Z`

- **`.github/workflows/release.yml`** — triggered by tag push (`v*.*.*`)
  - Validates manifest version matches the git tag
  - Runs `npm run publish` to build fresh artifacts in CI
  - Extracts the `## [X.Y.Z]` section from `docs/CHANGELOG.md` via `dev/v2/tasks/extract-changelog.js`
  - Creates a GitHub Release with the extracted notes
  - Attaches all 3 zips from `releases/X.Y.Z/` as release assets
