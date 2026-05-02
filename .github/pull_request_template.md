## Summary

Describe the change and the user-facing outcome.

## Type of Change

- [ ] Bug fix
- [ ] Feature
- [ ] Refactor
- [ ] Docs
- [ ] Build/CI

## Handler-level Checklist

- [ ] Affected handler(s) identified (`platform`, `ai`, or `git`)
- [ ] Selector/API changes accounted for
- [ ] Detection and extraction logic validated on target pages
- [ ] No regressions in unrelated handlers

## Core-level Checklist

- [ ] Storage schema compatibility considered
- [ ] Sync/commit behavior validated (auto + manual paths)
- [ ] No forbidden direct `chrome.*`/`browser.*` usage outside `src/lib/browser-compat.js`
- [ ] OpenAPI/spec/docs updated when Worker/API behavior changes

## Canonical Mapping (if applicable)

- [ ] Related issue uses `canonical-mapping` label
- [ ] Canonical aliases and rationale provided
- [ ] Validator workflow expectations met

## Validation

- [ ] `npm run lint`
- [ ] Manual smoke checks performed

## Linked Issues

Closes #
