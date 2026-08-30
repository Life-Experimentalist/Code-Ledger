---
name: codeledger
description: Use when working with a CodeLedger ledger repository — reading a learner's solved-problem history, answering questions about their DSA progress, adding or correcting records, or diagnosing why the extension stopped committing. Covers the index.json schema, the repo layout, and what is safe to write by hand.
---

# Driving CodeLedger

CodeLedger is a browser extension that commits solved DSA problems to a
repository the learner owns. There is no server holding the data and no account:
**the repository is the database.** Anything you can do with a git checkout and
the GitHub API, you can do to a ledger.

This skill is about the _ledger repository_, not the extension's source. If you
are editing the extension itself, read `CLAUDE.md` in the extension repo instead.

## Ground rules

1. **`index.json` is derived, not authoritative — but it is what everything
   reads.** The extension rebuilds it from its own IndexedDB on every commit.
   Hand-edit it and your edit survives until the next solve, then vanishes. Edit
   it anyway when the goal is to fix the _published_ report; do not edit it when
   the goal is to fix the learner's local history.
2. **Never invent a solve.** Adding a problem record the learner did not solve
   corrupts every statistic they use to decide what to study, and there is no
   audit trail that distinguishes it later.
3. **Ask before pushing.** A push to a ledger repo may trigger a Pages rebuild
   and a public README update. Show the diff first.
4. **The repo may be public.** Check before writing anything derived from the
   learner's private notes or their chat history.

## Task → action

| The learner asks                            | What to actually do                                                                                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "How many problems have I solved?"          | Read `index.json` → `stats.total`. Do not count files — one problem can have several language files, and unsolved scaffolding is not committed.                                                                                 |
| "What am I weak at?"                        | `index.json` → `stats.byTopic`, then compare against `problems[].timestamp` for recency. A topic with a high count and a 6-month-old newest timestamp is rust, not strength.                                                    |
| "What should I study next?"                 | The extension already computes this (Analytics → What to fix first, and the Roadmap tab). Prefer reporting what it decided over re-deriving it — your ranking and its ranking disagreeing is worse than either alone.           |
| "Show me my solution to X"                  | `problems[]` entry → `_committedPaths` if present; otherwise the path is `problems/{canonicalId}/{platform}/{platformId}.{ext}` when a canonical match exists, and `problems/{platformId}/{platformId}.{ext}` when it does not. |
| "Fix a wrong difficulty / topic / tag"      | Fix it in the extension (library → problem → edit), not in the repo. The extension will re-commit. A repo-only fix is reverted by the next solve.                                                                               |
| "Why is my README showing the wrong count?" | The README is regenerated from `index.json` on each commit. A stale README means the last commit did not include it — see the failure playbook.                                                                                 |
| "Import my old solves"                      | `dev/import-profile/leetcode-importer.js` in the extension repo, or the extension's own "Import All Solves" button on a GFG profile page. Do not construct records by hand.                                                     |
| "Make the ledger public / private"          | GitHub repo setting. Note the Pages report and the badges stop working on a private repo.                                                                                                                                       |
| "What is the extension sending where?"      | Settings → Privacy renders this from `src/core/privacy-disclosure.js`. It is generated from the live settings, so it is accurate for that install; do not answer from memory.                                                   |

## Repository layout

```
index.json                     the whole ledger, machine-readable (see below)
index.html                     the GitHub Pages report; reads ./index.json at runtime
README.md                      regenerated each commit from index.json
LICENSE, .gitignore
problems/…                     the solution files themselves
.codeledger/config.json        { version, extension, layoutVersion, description } — stable, no timestamps
.codeledger/sync.json          cross-device sync state
.codeledger/behaviour-bank.json  the learner's recorded habits, if recording is on
.codeledger/roadmaps.json      saved study plans
.codeledger/knowledge.json     the knowledge bank, if in use
.github/workflows/deploy-pages.yml
.github/workflows/update-stats.yml
assets/images/…                extension branding, committed as blobs
```

`problems/` uses one of two shapes, decided per problem by whether the canonical
map matched:

```
problems/{canonicalId}/{platform}/{platformId}.{ext}     matched
problems/{platformId}/{platformId}.{ext}                 unmatched
```

A `topics/{topic}/…` path is the **pre-1.5 layout**. If you see one, the repo has
not been migrated; the extension migrates it on update. Do not write new paths in
that shape.

## `index.json` schema

```jsonc
{
  "updatedAt": "2026-08-30T11:02:44.118Z", // ISO 8601, rewritten every commit
  "layoutVersion": 3, // bump means the path layout changed
  "stats": {
    "total": 214,
    "easy": 88,
    "medium": 101,
    "hard": 25,
    "unknownDifficulty": 0, // platforms that expose no difficulty
    "byPlatform": { "leetcode": 190, "codeforces": 24 },
    "byLang": { "Python3": 150, "C++": 64 },
    "byTopic": { "Array": 61, "Dynamic Programming": 22, "uncategorized": 3 },
  },
  "meta": {
    "summary": "…", // periodic AI summary, or null
    "summaryUpdatedAt": "…", // ISO 8601, or null
    "commitsSinceLastSummary": 4,
  },
  "problems": [
    /* every record, see below */
  ],
}
```

`stats` is **entirely derived from `problems`** — `byTopic` keys off
`tags[0] || topic || "uncategorized"`, `byLang` off `lang.name || lang.slug`.
If you change a problem, recompute the stats or leave both alone; a mismatched
pair is worse than a stale one, because the report and the README disagree.

A problem record:

```jsonc
{
  "title": "Two Sum",
  "titleSlug": "two-sum",
  "platform": "leetcode", // a key of CONSTANTS.PLATFORMS
  "difficulty": "Easy", // "Easy" | "Medium" | "Hard", or absent
  "lang": { "name": "Python3", "ext": "py", "slug": "python3" },
  "tags": ["Array", "Hash Table"], // canonical topic names, title-cased
  "topic": "Array", // the folder-naming topic
  "timestamp": 1756550400000, // Unix ms
  "code": "…",
  "runtime": "52 ms",
  "memory": "16.4 MB",
  "runtimePct": 91.2,
  "memoryPct": 44.0,
  "elapsedSeconds": 412, // 0 when the solve timer was unused
  "aiReview": "…", // markdown, or absent
  "_aiProvider": "gemini",
  "_aiModel": "gemini-2.0-flash",
  "_committedPaths": ["problems/two-sum/leetcode/two-sum.py"],
}
```

Fields prefixed `_` are the extension's own bookkeeping. They are safe to read
and unsafe to invent.

**Tag vocabulary is exact.** Tags are the output of `normalizeTag`, which
title-cases and folds aliases: `Hash Table`, not `hash-table`; `Heap (Priority
Queue)`, not `Heap`; `Depth-First Search`, not `DFS`. A tag written in any other
spelling is a _different topic_ everywhere downstream — it will not match a
roadmap milestone, will not roll up into its parent in the hierarchy, and will
appear in `byTopic` as its own entry. When adding or correcting a tag, copy an
existing spelling from `stats.byTopic` rather than typing what looks right.

## Failure playbook

Work down this list; the order is by how often each one is the answer.

**Commits stopped entirely.**

1. Is a repo configured? `settings.github_repo || settings.gitRepo` and
   `settings.github_owner`. An empty owner is the most common cause and produces
   a 404 that reads like a missing repository.
2. Is the token still valid? OAuth tokens live at `auth.tokens.github`, a manual
   PAT at `settings.github_token`; the handler checks OAuth first. A 401 or a 403
   with `x-ratelimit-remaining` above zero means re-authenticate — do not retry.
3. 403 with `x-ratelimit-remaining: 0` is rate limiting. Wait until the reset
   header says; retrying sooner burns the same budget.
4. 5xx or 429: one retry with backoff, then fall through to the mirror repo if
   one is configured.
5. 422 means the tree or commit payload was malformed — usually a file entry
   missing `path` or `content`.

**Commits succeed but the repo looks empty.**
The repo had no `main` branch. An empty repository has no
`git/ref/heads/{branch}` to patch, so the first commit must be built as a _root_
commit — no `base_tree`, no `parents` — and the ref created rather than updated.
If a half-finished onboarding left the repo with no ref, re-running onboarding
fixes it.

**The Pages report is blank or shows an error.**
`index.html` fetches `./index.json` at runtime. A blank report means that fetch
failed: Pages not enabled on `main`, or `index.json` missing from the repo root.
Check the deploy workflow ran.

**The report renders but every number is zero.**
`index.json` parsed but `problems` is empty, or `stats` was written without being
recomputed. Compare `stats.total` against `problems.length` — if they disagree,
something wrote one without the other.

**A topic shows zero solves that the learner is sure they have done.**
Almost always the vocabulary trap above: the stored tag and the thing being
compared against are spelled differently. Read the exact string out of
`stats.byTopic` before concluding the data is missing.

**Two devices disagree about the history.**
`index.json` is unsigned. Sync can tell you two records differ; it cannot tell
you which is authentic. Reconcile by timestamp and tell the learner what you
chose — do not silently pick one.

## What this skill does not cover

Publishing, tagging, or releasing the extension; editing the extension's source;
anything requiring the learner's GitHub credentials. If a task needs a token, ask
the learner to run it themselves rather than requesting the token.
