# Release Versioning Policy

This document defines version semantics and release policy.

For the procedural release steps, always use:
- [guides/release/release-guide.md](guides/release/release-guide.md)

## Semantic Versioning

CodeLedger follows Semantic Versioning:

- MAJOR: breaking changes
- MINOR: backward-compatible features
- PATCH: backward-compatible fixes

Format:

X.Y.Z

## Version Sources of Truth

Both files must match exactly before release:

- src/manifest.json
- package.json

If they differ, release must fail.

## Required Release Gates

Release is blocked unless all checks pass:

- CHANGELOG section exists for the target version in docs/archive/changelog.md
- Type-check passes
- Sync regression checks pass
- Build and packaging steps succeed

## Tagging Convention

- Tags use the format vX.Y.Z
- GitHub release workflow is triggered by pushing a matching tag

## Canonical Release Workflow

Use one of these:

- **`npm run release`** — Full automated release: validates, builds, commits, tags, and pushes all in one command. Requires version and changelog already updated.
- **`npm run release -- --dry-run`** — Preview mode: runs all checks and displays what would happen without making git changes or publishing.

Update the version before running either command. The canonical procedural steps live in [guides/RELEASE_GUIDE.md](guides/RELEASE_GUIDE.md).

CI will re-validate key guards, including sync regression checks.

## Notes on Redundancy

Release steps are intentionally centralized in one place:

- Canonical procedure: guides/release/release-guide.md
- This file: policy only
