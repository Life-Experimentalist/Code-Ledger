# GitHub repository metadata

Target: **`Life-Experimentalist/CodeLedger`**.

The repository currently lives at `Life-Experimentalist/Code-Ledger`. GitHub
serves permanent redirects after a rename, so links in the README, the landing
site and the worker's canonical-map fallback keep resolving either way — rename
first, then sweep them at leisure.

---

## About — description (≤ 350 chars)

> Auto-commit every accepted LeetCode, GeeksforGeeks and Codeforces solution to
> your own GitHub repo — with AI code review, a live analytics dashboard, a
> knowledge graph, bulk history import and cross-device sync. Zero extra steps.

## Website

`https://codeledger.vkrishna04.me`

## Topics (20)

```
leetcode  geeksforgeeks  codeforces  dsa  competitive-programming
browser-extension  chrome-extension  firefox-addon  manifest-v3
ai-code-review  analytics  knowledge-graph  leetcode-solutions
github-automation  code-tracker  preact  cloudflare-workers  hono
open-source  developer-tools
```

---

## Applying it

Rename first, in **Settings → General → Repository name**. Then, from a shell
authenticated with `gh auth login`:

```bash
gh repo edit Life-Experimentalist/CodeLedger --description "Auto-commit every accepted LeetCode, GeeksforGeeks and Codeforces solution to your own GitHub repo — with AI code review, a live analytics dashboard, a knowledge graph, bulk history import and cross-device sync. Zero extra steps." --homepage "https://codeledger.vkrishna04.me"
```

```bash
gh repo edit Life-Experimentalist/CodeLedger --add-topic leetcode --add-topic geeksforgeeks --add-topic codeforces --add-topic dsa --add-topic competitive-programming --add-topic browser-extension --add-topic chrome-extension --add-topic firefox-addon --add-topic manifest-v3 --add-topic ai-code-review --add-topic analytics --add-topic knowledge-graph --add-topic leetcode-solutions --add-topic github-automation --add-topic code-tracker --add-topic preact --add-topic cloudflare-workers --add-topic hono --add-topic open-source --add-topic developer-tools
```

Enable issues and discussions, and turn off the wiki and projects (nothing uses
them):

```bash
gh repo edit Life-Experimentalist/CodeLedger --enable-issues --enable-discussions --enable-wiki=false --enable-projects=false
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
