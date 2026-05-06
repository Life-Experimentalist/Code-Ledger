# Version Timing & Release Workflow

**Critical: When to Update Version**

## The Answer

**Update version BEFORE you release, not after.**

`
Timeline:
┌──────────────────────────────────────────────────────────┐
│ Your Code Changes                                         │
│ └─ git commit "feat: add feature"                        │
│    git commit "fix: bug"                                 │
├──────────────────────────────────────────────────────────┤
│ Step 1: Update CHANGELOG.md                              │
│ └─ Add new section at top with version and features      │
├──────────────────────────────────────────────────────────┤
│ Step 2: UPDATE VERSION (BEFORE RELEASE) ← HERE            │
│ ├─ src/manifest.json: "version": "X.Y.Z"                │
│ └─ package.json: "version": "X.Y.Z"                     │
├──────────────────────────────────────────────────────────┤
│ Step 3: Run Release Script                               │
│ └─ npm run release                                       │
│    ├─ Validates versions match (manifest = package.json) │
│    ├─ Checks CHANGELOG has this version                  │
│    ├─ Builds zips                                        │
│    ├─ Creates commit + tag                               │
│    └─ Pushes to GitHub                                   │
├──────────────────────────────────────────────────────────┤
│ Result: Version is RELEASED with matching manifest       │
│         No changes needed AFTER release                  │
└──────────────────────────────────────────────────────────┘
`

## Why BEFORE, Not AFTER?

The release script reads version from both files:
- ✅ If they match → release proceeds
- ❌ If they don't match → release STOPS with error

So you MUST update them BEFORE running npm run release.

## The Exact 3-Step Workflow

### Step 1: Update CHANGELOG.md (NOW)

Add to top of docs/CHANGELOG.md:

`markdown
## [1.2.0] — 2026-05-10

### Added
- GitLab support
- Bulk import from profile

### Fixed
- Syntax highlighting bug

### Changed
- Improved dashboard performance
`

**Timing**: Do this FIRST, before touching version numbers.

### Step 2: Bump Version (BEFORE RELEASE)

Update BOTH files (they MUST match):

**File 1**: src/manifest.json
`json
{
  "version": "1.2.0"
}
`

**File 2**: package.json
`json
{
  "version": "1.2.0"
}
`

**Timing**: Do this SECOND, after CHANGELOG is ready.

### Step 3: Release (FINAL)

`ash
npm run release
`

**Timing**: Do this LAST, after both version and CHANGELOG are updated.

---

## Common Mistakes

### ❌ Mistake 1: Update Version AFTER Release

`ash
npm run release        # Release with old version
# Oops, realized you should have bumped version
npm run release        # Already released! Tag v1.1.0 exists
`

**Fix**: Always bump version BEFORE release.

### ❌ Mistake 2: Forget to Update CHANGELOG

`ash
npm run release
# ERROR: docs/CHANGELOG.md missing entry for [1.2.0]
`

**Fix**: Add CHANGELOG section before running npm run release.

### ❌ Mistake 3: Versions Don't Match

`ash
# src/manifest.json: "version": "1.2.0"
# package.json: "version": "1.1.0"  ← Different!

npm run release
# ERROR: Version mismatch:
#   package.json: 1.1.0
#   src/manifest.json: 1.2.0
`

**Fix**: Make them both the same before releasing.

---

## Quick Checklist Before Release

Before running npm run release, verify:

- [ ] Code changes committed: \git commit -m "..."\
- [ ] CHANGELOG.md updated (new section at top with version)
- [ ] src/manifest.json version updated to X.Y.Z
- [ ] package.json version updated to X.Y.Z (MUST MATCH manifest)
- [ ] Versions match: \grep version src/manifest.json package.json\
- [ ] npm run lint passes (no TypeScript errors)
- [ ] npm run build succeeds
- [ ] \
pm run release -- --dry-run\ to preview (optional)
- [ ] Ready? \
pm run release\

---

**TL;DR**: 
1. Update CHANGELOG → 2. Bump version in manifest + package → 3. Run npm run release

Never update version after release. Always do it before.

---

Last updated: 2026-05-07
