# 🚀 CodeLedger Release Quick Start

Everything you need to release CodeLedger to Chrome Web Store and Firefox Add-ons.

---

## Current Status

- **Current version**: 1.1.0 (in src/manifest.json and package.json)
- **Store**: Ready for submission
- **Documentation**: Complete (ARCHITECTURE.md, PRIVACY.md, store checklists)

---

## Release Command

One command does everything:

`ash
npm run release
`

That's it. No manual git commands needed.

---

## Before Each Release

1. **Make your code changes** and commit normally:
   `ash
   git commit -m "feat: add feature X"
   git commit -m "fix: bug in Y"
   `

2. **Update CHANGELOG.md** (at the top):
   `markdown
   ## [X.Y.Z] — 2026-MM-DD

   ### Added
   - Feature 1
   - Feature 2

   ### Fixed
   - Bug 1

   ### Changed
   - Behavior change 1
   `

3. **Bump version** in BOTH files:
   - src/manifest.json → "version": "X.Y.Z"
   - package.json → "version": "X.Y.Z"

4. **Preview** (optional):
   `ash
   npm run release -- --dry-run
   `

5. **Release**:
   `ash
   npm run release
   `

That's all. The script validates, builds zips, commits, tags, and pushes automatically.

---

## Example Releases

### Example 1: Bug Fix (PATCH Release: 1.1.0 → 1.1.1)

`ash
# Make fix in code
git commit -m "fix: syntax highlighting in code blocks"

# Update CHANGELOG
## [1.1.1] — 2026-05-10
### Fixed
- Syntax highlighting in code blocks not rendering

# Update version
# src/manifest.json: "version": "1.1.1"
# package.json: "version": "1.1.1"

# Preview
npm run release -- --dry-run

# Release
npm run release

# Result:
# ✓ Git commit: chore: release v1.1.1
# ✓ Git tag: v1.1.1
# ✓ Pushed to origin
# ✓ GitHub Actions creates release with zips
`

### Example 2: New Feature (MINOR Release: 1.1.0 → 1.2.0)

`ash
# Add feature
git commit -m "feat: add GitLab support"
git commit -m "feat: GitLab bulk import"

# Update CHANGELOG
## [1.2.0] — 2026-05-15
### Added
- GitLab support (new platform handler)
- GitLab bulk import from profile

### Changed
- Updated manifest domain generation

# Update version
# src/manifest.json: "version": "1.2.0"
# package.json: "version": "1.2.0"

# Release
npm run release
`

### Example 3: Major Release (MAJOR Release: 1.1.0 → 2.0.0)

`ash
# Big refactor
git commit -m "refactor: rewrite storage layer"
git commit -m "feat: SQLite-backed storage"

# Update CHANGELOG
## [2.0.0] — 2026-06-01
### Changed
- **BREAKING**: Storage migrated from IndexedDB to SQLite
  Users upgrading from 1.x must run one-time migration

### Added
- Better offline support (SQLite persists across updates)
- Faster queries on 1000+ problems

### Fixed
- Race conditions in concurrent storage writes

# Update version
# src/manifest.json: "version": "2.0.0"
# package.json: "version": "2.0.0"

# Release
npm run release
`

---

## Troubleshooting

### Working directory not clean

`ash
git status
# If files shown, commit them:
git add .
git commit -m "your message"
npm run release
`

### Version mismatch

`ash
# Make both files match:
# src/manifest.json: "version": "1.2.0"
# package.json: "version": "1.2.0"
npm run release
`

### CHANGELOG missing

`ash
# Add to docs/CHANGELOG.md at top:
## [1.2.0] — 2026-05-15
### Added
- Your feature

npm run release
`

### Tag already exists

`ash
# You already released this version
# Bump to new version and try again:
# "version": "1.2.1"  (or 1.3.0, 2.0.0)
npm run release
`

---

## What 
pm run release Does

1. ✅ Reads version from src/manifest.json
2. ✅ Validates version matches package.json
3. ✅ Checks CHANGELOG.md has entry
4. ✅ Validates git status (must be clean)
5. ✅ Checks tag doesn't exist
6. ✅ Builds zips: 
pm run publish
7. ✅ Creates commit: chore: release vX.Y.Z
8. ✅ Creates tag: X.Y.Z
9. ✅ Pushes to GitHub (both main and tag)

**GitHub Actions then**:
1. ✅ Validates manifest version matches tag
2. ✅ Extracts CHANGELOG section
3. ✅ Creates GitHub Release
4. ✅ Attaches 3 zips

**You then**:
1. Download zips from release (optional verification)
2. Upload to Chrome Web Store
3. Upload to Firefox Add-ons
4. Share announcement

---

## Store Submission

### Chrome Web Store

1. Go to [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole)
2. Click **+ Create new item**
3. Upload codeledger-chrome-vX.Y.Z.zip from releases/
4. Fill listing:
   - **Title**: CodeLedger
   - **Short description**: Track and commit all your solved DSA problems to GitHub automatically.
   - **Full description**: (see docs/STORE_SUBMISSION.md)
   - **Category**: Productivity
   - **Icons**: src/icons/icon-128.png
   - **Screenshots**: 5 recommended
5. Click **Submit for review**

**Timeline**: 1–7 days

### Firefox Add-ons

1. Go to [Mozilla Add-ons Developer Hub](https://addons.mozilla.org/developers/addons)
2. Click **Submit a New Add-on**
3. Upload codeledger-firefox-vX.Y.Z.zip from releases/
4. Fill listing (same as Chrome, see docs/STORE_SUBMISSION.md)
5. Click **Submit**

**Timeline**: 1–5 days

---

## Checklist: Ready to Release

Before you run 
pm run release:

- [ ] Code changes committed
- [ ] CHANGELOG.md updated with new version section
- [ ] Version bumped in src/manifest.json
- [ ] Version bumped in package.json (MUST match)
- [ ] 
pm run lint passes (no TypeScript errors)
- [ ] 
pm run build succeeds (CSS + extension builds)
- [ ] Tested extension locally (works as expected)
- [ ] Tested on Chrome, Firefox, Edge (optional but recommended)

Then:

`ash
npm run release -- --dry-run      # Preview
npm run release                    # Release!
`

---

## Files to Know

| File | Purpose |
|------|---------|
| src/manifest.json | Extension config (source of truth for version) |
| package.json | npm metadata (MUST match manifest version) |
| docs/CHANGELOG.md | Release notes (Keep a Changelog format) |
| dev/release.js | Release orchestrator script |
| docs/ARCHITECTURE.md | Technical documentation (for developers) |
| docs/RELEASE_VERSIONING.md | Semantic versioning guide |
| docs/STORE_SUBMISSION.md | Store submission requirements |
| PRIVACY.md | Privacy policy (for stores) |

---

## Next Steps

1. **Bump to 1.1.1** (patch) when you fix your first bug
   `ash
   # Fix bug in code
   git commit -m "fix: your fix"
   # Update CHANGELOG
   # Bump version to 1.1.1
   npm run release
   `

2. **Bump to 1.2.0** (minor) when you add a new platform or feature
   `ash
   # Add feature
   git commit -m "feat: new feature"
   # Update CHANGELOG
   # Bump version to 1.2.0
   npm run release
   `

3. **Upload to Chrome Web Store & Firefox Add-ons** (see STORE_SUBMISSION.md)

4. **Share release notes** on GitHub, social media, etc.

---

**Ready?** Start with a release:

`ash
npm run release -- --dry-run      # Preview
npm run release                    # Go live!
`

---

**Documentation**:
- Full versioning guide: docs/RELEASE_VERSIONING.md
- Store submission: docs/STORE_SUBMISSION.md
- Architecture: docs/ARCHITECTURE.md
- Privacy: PRIVACY.md

---

Last updated: 2026-05-07
