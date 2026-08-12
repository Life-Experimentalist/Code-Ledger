# GitHub repository metadata

Target: **`Life-Experimentalist/CodeLedger`**.

The repository currently lives at `Life-Experimentalist/Code-Ledger`. GitHub
serves permanent redirects after a rename, so links in the README, the landing
site and the worker's canonical-map fallback keep resolving either way — rename
first, then sweep them at leisure.

---

## About — description (≤ 350 chars)

> Auto-commit every accepted LeetCode, GeeksforGeeks, Codeforces, NeetCode and
> takeuforward solution to your own GitHub repo — with AI code review, a live
> analytics dashboard, a knowledge graph, streaks and badges, bulk history
> import and cross-device sync. No servers, no accounts, no payments.

## Website

`https://codeledger.vkrishna04.me`

## Topics (GitHub caps these at 20)

```
leetcode  geeksforgeeks  codeforces  neetcode  takeuforward
dsa  competitive-programming  browser-extension  chrome-extension
firefox-addon  manifest-v3  ai-code-review  analytics
knowledge-graph  github-automation  code-tracker  preact
cloudflare-workers  open-source  gfg
```

The ceiling is real: GitHub rejects the twenty-first topic rather than
truncating, so adding one means naming the one it replaces. `knowledge-graphs`,
`preactjs`, `library` and `github` were the four dropped to make room for the
two new platforms — the first two were plural/suffix duplicates of topics
already in the list, and the last two were too generic to bring any search
traffic.

---

## Applying it

The repository has **not** been renamed yet, so these commands name
`Code-Ledger`. After a rename, GitHub serves permanent redirects, so both spellings
keep working and the sweep can happen at leisure.

From a shell authenticated with `gh auth login`:

```bash
gh repo edit Life-Experimentalist/Code-Ledger --description "Auto-commit every accepted LeetCode, GeeksforGeeks, Codeforces, NeetCode and takeuforward solution to your own GitHub repo — with AI code review, a live analytics dashboard, a knowledge graph, streaks and badges, bulk history import and cross-device sync. No servers, no accounts, no payments." --homepage "https://codeledger.vkrishna04.me"
```

```bash
gh repo edit Life-Experimentalist/Code-Ledger --add-topic neetcode --add-topic takeuforward --add-topic github-automation --add-topic code-tracker --remove-topic knowledge-graphs --remove-topic preactjs --remove-topic library --remove-topic github
```

Enable issues and discussions, and turn off the wiki and projects (nothing uses
them):

```bash
gh repo edit Life-Experimentalist/Code-Ledger --enable-issues --enable-discussions --enable-wiki=false --enable-projects=false
```

## Social preview

`src/assets/images/social preview.png`, uploaded under **Settings → General →
Social preview**. There is no `gh` equivalent; this one is manual.

## Branch protection

Worth setting once CI is green on `main`, so the release tag can never be cut
from a failing tree:

```bash
gh api -X PUT repos/Life-Experimentalist/CodeLedger/branches/main/protection -f "required_status_checks[strict]=true" -f "required_status_checks[contexts][]=Lint, format, test" -f "enforce_admins=false" -f "required_pull_request_reviews=null" -f "restrictions=null"
```
