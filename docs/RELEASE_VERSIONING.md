# Release & Versioning Guide

Complete guide to CodeLedger's release process, semantic versioning, and store submission.

---

## Semantic Versioning

CodeLedger follows [Semantic Versioning 2.0.0](https://semver.org/):

`
MAJOR.MINOR.PATCH
`

- **MAJOR**: Breaking changes (users must update, might need action)
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes (backwards compatible)

---

## Release Examples

### Current Version: 1.1.0

#### Scenario 1: Small Bug Fix (PATCH Release)

**Change**: Fix syntax highlighting not working in code blocks

**Version bump**: 1.1.0 → 1.1.1

**Example command**:
`ash
# 1. Update CHANGELOG.md
# Add at top:
## [1.1.1] — 2026-05-10
### Fixed
- Syntax highlighting in code blocks not rendering

# 2. Bump version in manifest.json and package.json
# "version": "1.1.1"

# 3. Run release
npm run release

# That's it! Git will handle commit, tag, and push automatically.
`

**What happens**:
- Creates commit: chore: release v1.1.1
- Creates tag: 1.1.1
- Pushes to GitHub
- GitHub Actions creates release with zips

---

#### Scenario 2: New Feature (MINOR Release)

**Change**: Add GitLab support (new platform handler)

**Version bump**: 1.1.0 → 1.2.0

**Example command**:
`ash
# 1. Update CHANGELOG.md
## [1.2.0] — 2026-05-20
### Added
- GitLab support (new platform handler)
- GitLab bulk import from profile

### Changed
- Updated dom-selectors generation to include gitlab.com

# 2. Bump version
# "version": "1.2.0"

# 3. Run release
npm run release
`

**What happens**: Same as PATCH, but MINOR signals "new features, all backwards compatible".

---

#### Scenario 3: Major Refactor (MAJOR Release)

**Change**: Rewrite storage layer from IndexedDB to SQLite (breaking change)

**Version bump**: 1.1.0 → 2.0.0

**Example command**:
`ash
# 1. Update CHANGELOG.md
## [2.0.0] — 2026-06-01
### Changed
- **BREAKING**: Storage migrated from IndexedDB to SQLite (local-only, requires data migration)
- Users upgrading from 1.x must run one-time migration on first load

### Added
- Better offline support (SQLite persists across browser updates)
- Faster queries on 1000+ problems

### Fixed
- Race conditions in concurrent storage writes

# 2. Bump version
# "version": "2.0.0"

# 3. Run release
npm run release
`

**What happens**: Users see this is a major version bump and should test before updating.

---

## Release Workflow

### Step 1: Prepare Changes

Make your code changes, commit them normally:

`ash
git commit -m "feat: add GitLab support"
git commit -m "fix: syntax highlighting in code blocks"
`

### Step 2: Update Changelog

Edit docs/CHANGELOG.md. Add a new section at the top:

`markdown
## [X.Y.Z] — YYYY-MM-DD

### Added
- Feature 1
- Feature 2

### Fixed
- Bug 1

### Changed
- Behavior change 1
`

**Keep a Changelog rules**:
- Date format: YYYY-MM-DD
- Sections (in order): Added, Changed, Deprecated, Removed, Fixed, Security
- Use present tense: "Add X", not "Added X"

### Step 3: Bump Version

Update **both** files to the same version (this is critical):

- src/manifest.json → "version": "X.Y.Z"
- package.json → "version": "X.Y.Z"

### Step 4: Preview (Optional)

Before committing, preview what will happen:

`ash
npm run release -- --dry-run
`

This validates without making any git changes. Output shows:
- Version check (manifest ↔ package.json)
- CHANGELOG entry validation
- Working directory status
- Build commands that will run
- Git commands that will be executed

Example output:

`
============================================================
CodeLedger Release: v1.2.0
============================================================

→ Validating...
   ✓ package.json and manifest.json both at 1.2.0
   ✓ CHANGELOG.md has entry for [1.2.0]

→ Checking git status...
   ✓ Working directory clean

→ Checking if tag exists...
   ✓ Tag v1.2.0 does not exist yet

→ Building release artifacts...
   (dry-run: skipped)

→ Committing...
   (dry-run) would run: git commit -m "chore: release v1.2.0"

→ Creating tag...
   (dry-run) would run: git tag v1.2.0

→ Pushing to origin...
   (dry-run) would run: git push origin main v1.2.0

============================================================
✨ Release v1.2.0 complete!
============================================================

Dry-run complete. Run without --dry-run to actually release.
`

### Step 5: Cut Release

`ash
npm run release
`

This does **everything automatically**:

1. ✅ Validates versions match (manifest ↔ package.json)
2. ✅ Checks CHANGELOG has entry
3. ✅ Builds zips (Chrome, Firefox, source)
4. ✅ Creates commit: chore: release vX.Y.Z
5. ✅ Creates tag: X.Y.Z
6. ✅ Pushes to GitHub (triggers GitHub Actions)

### Step 6: Verify on GitHub

Once the push completes:

1. Go to [Releases](https://github.com/Life-Experimentalist/Code-Ledger/releases)
2. GitHub Actions job elease.yml runs automatically
3. It creates a GitHub Release with:
   - Release notes (extracted from CHANGELOG)
   - 3 attached zips:
     - codeledger-chrome-vX.Y.Z.zip
     - codeledger-firefox-vX.Y.Z.zip
     - codeledger-source-vX.Y.Z.zip

4. Download zips and verify they're not corrupt:
   `ash
   unzip -t codeledger-chrome-vX.Y.Z.zip | tail -1  # "No errors" or "error"
   unzip -t codeledger-firefox-vX.Y.Z.zip | tail -1
   `

---

## Troubleshooting

### "Working directory not clean"

**Error**:
`
❌ Working directory not clean. Commit or stash changes:
M src/ui/styles/compiled.css
M src/manifest.json
`

**Fix**: Commit or stash changes before releasing:

`ash
git status                    # See what's uncommitted
git add .
git commit -m "your message"
npm run release
`

### "Tag already exists"

**Error**:
`
❌ Tag v1.2.0 already exists
`

**Reason**: You already released this version. Check:

`ash
git tag -l | grep v1.2.0     # Does it exist?
git log | head -5             # What's the latest commit?
`

**Fix**: Bump to a new version (1.2.1, 1.3.0, 2.0.0) and try again.

### "Version mismatch"

**Error**:
`
❌ Version mismatch:
   package.json: 1.1.0
   src/manifest.json: 1.2.0
`

**Fix**: Make them match:

`ash
# Option 1: Edit files manually
# src/manifest.json:  "version": "1.2.0"
# package.json:       "version": "1.2.0"

# Option 2: Use sed (if comfortable)
sed -i 's/"version": "1.1.0"/"version": "1.2.0"/g' src/manifest.json package.json

git add src/manifest.json package.json
npm run release
`

### "CHANGELOG missing entry"

**Error**:
`
❌ docs/CHANGELOG.md missing entry for [1.2.0]
   Add a section: ## [1.2.0] — YYYY-MM-DD
`

**Fix**: Add the missing section at the top of docs/CHANGELOG.md:

`markdown
## [1.2.0] — 2026-05-20

### Added
- Your feature

### Fixed
- Your bug fix
`

Then:

`ash
git add docs/CHANGELOG.md
npm run release
`

### "Commit failed" (pre-commit hook)

**Error**:
`
❌ Commit failed
`

**Likely cause**: Pre-commit hook ran 
pm run lint and found type errors.

**Fix**: Run linter, fix errors, try again:

`ash
npm run lint                  # See errors
# Fix type errors in code
npm run release
`

### "Push failed"

**Error**:
`
❌ Push failed
`

**Likely causes**:
- No push access to repo
- Remote changed while releasing (rare)
- Network issue

**Fix**: Check remote and access:

`ash
git branch                    # Confirm you're on main
git remote -v                 # Confirm origin points to correct repo
# If problems, manually push:
git push origin main v1.2.0
`

### "Undo a release" (if push succeeded but something is wrong)

If the push succeeded but you need to undo before CI completes:

`ash
# Undo the local commit
git reset --soft HEAD~1       # Undo commit, keep changes staged

# Delete the tag locally
git tag -d vX.Y.Z

# Delete the tag on GitHub (if already pushed)
git push origin :vX.Y.Z       # : deletes remote ref

# Fix the issue
# ...

# Try again
npm run release
`

---

## What Release Actually Does

### 
pm run release breakdown

The dev/release.js script:

`javascript
1. Read versions from src/manifest.json and package.json
2. Check they match
3. Check docs/CHANGELOG.md has entry for this version
4. Check git status (working directory must be clean)
5. Check tag doesn't already exist
6. Run npm run publish (builds zips)
7. Run git commit -m "chore: release vX.Y.Z"
8. Run git tag vX.Y.Z
9. Run git push origin main vX.Y.Z
`

### GitHub Actions elease.yml (auto-triggered by tag push)

When you push a tag X.Y.Z:

`javascript
1. Checkout code at tag
2. Validate manifest.json version matches tag
3. Extract CHANGELOG section for this version
4. Create GitHub Release
5. Download 3 zips from releases/ folder
6. Attach zips to GitHub Release
`

---

## Best Practices

### Commit messages

Use conventional commits for clarity:

- eat: add GitLab support (feature)
- ix: syntax highlighting bug (bug fix)
- docs: update ARCHITECTURE.md (docs only)
- efactor: simplify storage layer (code cleanup)
- chore: update dependencies (maintenance)

### Timing

Release frequently:
- **Critical bugs**: same day (PATCH)
- **Regular fixes**: weekly (PATCH or MINOR)
- **Feature sets**: every 2-4 weeks (MINOR)
- **Major refactors**: quarterly (MAJOR)

### Changelog entries

Be specific and user-focused:

`markdown
### Added
- Syntax highlighting for 8 languages (Python, JS, TS, Java, C++, C, Go, Rust)
- /mycode command in AI chat (reference your code in questions)

### Fixed
- Failed commits on problems with special characters in titles
- IndexedDB race condition during bulk imports

### Changed
- Improved dashboard load time by 40% (memoization + lazy loading)
- Renamed "Solve Time" to "Time Spent" for clarity
`

### Version bumping

Don't skip versions:
- ❌ 1.1.0 → 1.1.3 (skipped 1, 2) — confusing
- ✅ 1.1.0 → 1.1.1 → 1.1.2 → 1.1.3 — clear progression

Bump ONLY when releasing (not on every commit).

---

## Release Schedule Template

Use this as a checklist for each release cycle:

`markdown
# Release v1.2.0

**Target date**: 2026-05-20

### Pre-release (Week 1-2)

- [ ] Collect all merged features and fixes
- [ ] Update CHANGELOG.md
- [ ] Bump version in src/manifest.json and package.json
- [ ] Run npm run lint (fix any type errors)
- [ ] Run npm run release -- --dry-run (preview)

### Release Day

- [ ] Run npm run release (automated)
- [ ] Verify GitHub Release appears
- [ ] Download zips and spot-check (no corruption)
- [ ] Test extension locally from packaged zip

### Post-release

- [ ] Verify in Chrome Web Store (if uploaded)
- [ ] Verify in Firefox Add-ons (if uploaded)
- [ ] Share release notes in announcements
- [ ] Close related issues/PRs
`

---

**Last updated**: 2026-05-06  
**Version**: 1.1.0
