# Release Guide

How to cut a new release of CodeLedger.

## Prerequisites

- You have push access to the repository.
- Your git user is configured: `git config user.name` and `git config user.email`.
- You are on the `main` branch and your working directory is clean.

## Steps

### 1. Update the changelog

Add a new section at the top of `docs/archive/changelog.md`:

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

Update **both** to the same version:

- `src/manifest.json` → `"version": "X.Y.Z"`
- `package.json` → `"version": "X.Y.Z"`

### 3. Preview the release (optional)

```bash
npm run release -- --dry-run
```

This validates everything without making any git changes. You'll see:
- Version check (manifest ↔ package.json)
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
1. ✅ Validates versions match
2. ✅ Checks CHANGELOG has entry
3. ✅ Runs sync regression checks
4. ✅ Builds zips (Chrome, Firefox, source)
5. ✅ Creates tag: `vX.Y.Z`
6. ✅ Pushes to GitHub (triggers GitHub Actions)

### 5. Verify on GitHub

Once the push completes:

1. Go to [Releases](https://github.com/Life-Experimentalist/Code-Ledger/releases)
2. GitHub Actions job `release.yml` runs automatically
3. It creates a GitHub Release with:
   - Release notes (extracted from CHANGELOG)
   - 3 attached zips:
     - `codeledger-chrome-vX.Y.Z.zip`
     - `codeledger-firefox-vX.Y.Z.zip`
     - `codeledger-source-vX.Y.Z.zip`

## Command reference

```bash
npm run release                    # Full automated release
npm run release -- --dry-run       # Preview without git changes
npm run publish                    # Just build zips (no git)
npm run build:css                  # Compile Tailwind only
npm run lint                       # Type-check before release
npm run test:sync-regression       # Sync keying regression safety check
```

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

## Architecture

The release process uses:

- **`npm run publish`** — builds the release artifacts (zips)
  - Runs `npm run clean && npm run build && node dev/package.js`
  - Produces `releases/codeledger-{chrome,firefox,source}-vX.Y.Z.zip`

- **`npm run release`** — orchestrator script (`dev/release.js`)
  - Validates versions and CHANGELOG
  - Runs `npm run publish`
  - Commits and tags
  - Pushes to GitHub

- **`.github/workflows/release.yml`** — GitHub Actions workflow
  - Triggered by tag push (`v*.*.*`)
  - Validates manifest version matches tag
  - Extracts CHANGELOG section
  - Creates GitHub Release
  - Attaches the 3 zips
