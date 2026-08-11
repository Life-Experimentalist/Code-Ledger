# CodeLedger Documentation Index

The canonical entry point for project documentation. Every link below points at
a file tracked in this repository.

## Start here

- [Architecture overview](architecture/README.md) — how the extension, the
  worker and the ledger repository fit together
- [Queues and orchestration](queues/README.md) — the solve → commit pipeline
- [Debugging and logging](debugging/README.md)
- [Changelog](CHANGELOG.md)
- [Roadmap and recommendations](ROADMAP.md) — what to remove, change and add next
- [Feature backlog](reference/backlog.md)
- [OpenAPI contract for the Worker](OPENAPI.yaml)

## Setup and operations

- [GitHub OAuth App setup](guides/setup/github-oauth-app-setup.md) — registering the
  app and loading the Worker's secrets
- [Deployment guide](guides/setup/deployment-guide.md)
- [OAuth testing guide](guides/setup/oauth-testing-guide.md)
- [Git integration setup](guides/setup/git-integration-setup.md)

## Build and release

- [Release process](guides/release/release-guide.md)
- [Versioning policy](guides/release/release-versioning.md)
- [Store secrets setup](guides/release/store-secrets-setup.md)
- [Store submission checklist](store/README.md)

## Development

- [Adding a platform handler](guides/development/adding-platform-handler.md)
- [Handler contract](guides/development/handlers-spec.md)
- [Quick reference](guides/development/quick-reference.md)
- [Build system notes](guides/development/build-system-optimization.md)
- [Graphify workflow](guides/development/graphify-workflow.md)
- [Testing guide](TESTING_GUIDE.md)

## Reference

- [MCP tools](reference/mcp-tools.md)
- [Autonomous MCP system](reference/autonomous-mcp-system.md)
- [Prompt templates](reference/prompts/README.md)
- [Portfolio integration](reference/strategy/portfolio-integration.md)

## Design records

- [Code recovery and tag inference](superpowers/specs/2026-05-13-code-recovery-tag-inference-design.md)
- [Smart dedup on import](superpowers/specs/2026-05-13-smart-dedup-import-design.md)

## Conventions

- `docs/CHANGELOG.md` is the only changelog. `dev/release.js` and
  `dev/v2/tasks/extract-changelog.js` both read it, so an entry must exist for a
  version before that version can be tagged.
- Release instructions live in [guides/release/](guides/release/README.md) only.
  Other pages link there rather than restating the steps.
- `docs/archive/` holds historical working notes. It is git-ignored on purpose —
  nothing in the tracked tree should link into it.
