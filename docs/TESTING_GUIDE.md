# CodeLedger Testing Guide

Quick-reference for manually verifying the extension on each supported platform.

## ⚡ TL;DR Testing Flow

- **Setup**: `npm run build` → load `dist/chromium` as an unpacked extension → open popup → click **Connect GitHub** (OAuth) → enter a repo name in Settings.
- **LeetCode**: Open Two Sum → Submit solution → Verify commit appears on GitHub in ~3 seconds.
- **GeeksForGeeks**: Solve Reverse a Linked List → Submit → Verify commit appears.
- **Codeforces**: Solve Theatre Square → Submit → Verify commit appears.
- **NeetCode**: Solve any problem in the NeetCode editor → Submit → Verify commit appears.
- **takeuforward**: Solve a TUF+ problem → Submit → Verify commit appears.
- **AI Panel**: Set API key in Settings → AI → Open floating AI Review panel on any problem page → Ask for review.
- **Dashboard**: Go to Library side-panel → Verify Heatmap, Charts, and Knowledge Graph render correctly.

---

## Setup

1. Run `npm run build`, then load `dist/chromium` in `chrome://extensions` (Developer mode
   on) or `dist/firefox` in `about:debugging` (Firefox). `src/` cannot be loaded directly —
   it holds `manifest-chromium.json` and `manifest-firefox.json`, and the build is what
   emits one of them as `manifest.json`.
2. Open the extension popup → Settings → connect your GitHub account.
3. Keep the browser DevTools console open (`F12` → Console) to watch `[CodeLedger:*]` logs.

---

## LeetCode (Stable)

**Test page:** https://leetcode.com/problems/two-sum/

| What to check            | How                                                                       |
| ------------------------ | ------------------------------------------------------------------------- |
| Extension loads          | Console shows `✓ LeetCodeHandler initialized`                             |
| Floating timer appears   | Visit any problem page — stopwatch shows bottom-right                     |
| AI panel button appears  | `✦ AI Review` button in the editor toolbar                                |
| AI panel reads your code | Open AI panel, type "review my code" — it should include your editor code |
| Copy button works        | Click `📋 Copy Code` → paste somewhere, verify code is correct            |
| Submission captured      | Submit a correct solution → check your GitHub repo for a new commit       |

**Quick problem to accept:** https://leetcode.com/problems/two-sum/ — submit `return {}` with C++ (will WA), then submit the real solution.

---

## GeeksForGeeks (Alpha)

**Test page:** https://www.geeksforgeeks.org/problems/two-sum--150510/

| What to check                | How                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| Extension loads              | Console shows `✓ GFGHandler initialized`                                                        |
| Floating timer appears       | Visit a problem page — stopwatch shows                                                          |
| Copy code button appears     | `📋 Copy Code` button appears above the GFG editor                                              |
| AI panel button appears      | `✦ AI Review` button appears above the editor                                                   |
| AI panel reads code          | Open AI panel, ask for a review — your Ace editor code should appear                            |
| AI panel reads test failures | Submit wrong answer → open AI panel, ask about the error — it should include the failure output |
| Submission captured          | Submit a correct solution → check GitHub repo                                                   |

**Known alpha limitations:**

- Profile import is manual (click "Open Profile →" in Settings → Platforms).
- Some GFG problem page layouts may not inject QoL buttons; refresh the page if missing.

**Simple accepted problem:** https://www.geeksforgeeks.org/problems/reverse-a-linked-list/1

---

## Codeforces (Alpha)

**Test page:** https://codeforces.com/problemset/problem/1/A

| What to check                  | How                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| Extension loads                | Console shows `✓ CodeforcesHandler initialized`                                             |
| Copy button appears            | `📋 Copy Code` appears above the CF `<textarea>` editor                                     |
| AI panel button appears        | `✦ AI Review` appears above the editor                                                      |
| AI panel reads code            | Open AI panel → type anything → code should be included in context                          |
| Code captured at submit        | Click Submit on CF → check sessionStorage in DevTools: keys `cl_cf_pending_*` should be set |
| Submission captured (accepted) | Get an Accepted verdict → extension commits to GitHub with difficulty tag                   |

**Verify sessionStorage after submit:**
Open DevTools → Application → Session Storage → `codeforces.com` → look for `cl_cf_pending_code`.

**Simple problems for testing:**

- A-level (Easy): https://codeforces.com/problemset/problem/1/A (Theatre Square)
- Practice without contest: https://codeforces.com/problemset

**Known alpha limitations:**

- CF uses full page reloads; code is preserved across the problem → /my navigation via sessionStorage.
- Gym problems supported (`/gym/{id}/problem/{letter}`) but less tested.
- A live solve reads its metadata (rating, tags) from the DOM rather than the API, because the page
  already has it. The profile import does use the API (`user.status`, one request per two seconds).
- Imported problems have no code: Codeforces publishes the submission list, not the submission text.

**Profile import:** sign in, open `https://codeforces.com/profile/{your handle}` and click
"Import All Solves to CodeLedger". The button is not injected on anyone else's profile.

---

## NeetCode (Beta)

**Test page:** https://neetcode.io/problems/duplicate-integer

NeetCode runs its own judge, so nothing here is scraped to decide whether a submission
passed. `content/net-tap.js` sees the `POST /api/executeCodeFunctionHttp` the page makes,
and the verdict, source, language and timings all come out of that one exchange.

| What to check           | How                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Extension loads         | Console shows `✓ NeetCodeHandler initialized`                                                                |
| Net tap is live         | Console shows the tap subscribing before you submit — it must be installed at document_start, not on demand  |
| Wrong answer is ignored | Submit a failing solution → no commit, no `problem:solved`                                                   |
| Submission captured     | Submit a correct solution → check your GitHub repo                                                           |
| Canonical folding       | Solve a problem you have also solved on LeetCode → both land in one `problems/{canonicalId}/` folder         |
| AI panel reads code     | Open the floating panel, ask for a review — your editor code should appear                                   |

NeetCode slugs are its own (`duplicate-integer`, not `contains-duplicate`), so the
canonical lookup runs on the LeetCode slug derived from the title **as well as** the
NeetCode slug. That second lookup is what keeps one question out of two folders — if a
NeetCode solve files separately from its LeetCode twin, that is the path that broke.

---

## takeuforward (Beta)

**Test pages:** https://takeuforward.org/plus/dsa/problems/{slug} (TUF+) and
https://takeuforward.org/dsa/strivers-a2z-sheet-learn-dsa-a-to-z (free sheet)

The site is two products and the handler serves both differently:

| What to check                | How                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| Extension loads              | Console shows `✓ TakeUForwardHandler initialized`                                                     |
| Sheet rows get marked        | Open the A2Z sheet → problems already in your ledger show a marker. Nothing is ever committed here.   |
| Sheet commits nothing        | Click through a sheet row → it links out to LeetCode; no commit should originate from a sheet page    |
| TUF+ metadata is real        | On a TUF+ problem, difficulty and tags must be actual values, not the string `Subscribe to TUF+`      |
| TUF+ submission captured     | Submit an accepted solution in the TUF+ editor → check your GitHub repo                               |

**Known beta limitation — this one needs a real subscription to close:** the TUF+ judge's
verdict payload has never been observed, because it is behind the subscription.
`readVerdict` in `takeuforward/api.js` is deliberately written to **miss rather than
mis-commit**: an unrecognised response shape commits nothing. So the failure mode to
expect is a solve that is silently not recorded, not a wrong commit. If you have TUF+,
one accepted submission with the network tab open is all it takes to confirm the shape.

---

## Settings Panel

| What to check           | How                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| Status badges are right  | Open popup → Settings → Platforms. The badge on each card is driven by `status` in `CONSTANTS.PLATFORMS`: LeetCode and GeeksForGeeks carry none (stable), NeetCode and takeuforward show "Beta", Codeforces shows "Alpha". A card whose badge disagrees with `constants.js` is the bug. |
| Disabling a platform    | Toggle off → reload problem page → extension should not activate for that platform        |
| Difficulty aliases      | Set "Easy" → "Beginner" for LeetCode → solve an Easy → check commit for "Beginner" folder |

---

## AI Panel (all platforms)

The floating AI panel pulls context from the current page. Open it on any problem page and verify:

| Context                            | Prompt to test                          |
| ---------------------------------- | --------------------------------------- |
| Problem title + difficulty         | "What is this problem asking?"          |
| Editor code                        | "Review my code"                        |
| Problem statement                  | "Summarise the problem in one sentence" |
| Test failures (after wrong answer) | "Why is my solution failing?"           |

If AI responses don't include your code, check: Settings → AI → confirm an API key is set and a model is selected.

---

## Common Issues

**Extension not loading on CF/GFG:** Hard-reload the page (`Ctrl+Shift+R`). The handler is injected once at page load.

**QoL buttons not appearing:** The inject has a 1.5 s delay to wait for the editor to mount. If still missing after 5 s, check the console for errors.

**Commit not appearing in GitHub:** Check the popup → it shows the last commit status. Common causes: token expired (re-auth in Settings → GitHub), repo not set, or network error.

**Verdict not detected on CF:** CF sometimes shows "Accepted" only in the full `/contest/{id}/my` table. Navigate there manually — the observer will catch the DOM change.
