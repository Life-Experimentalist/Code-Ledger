# CodeLedger Testing Guide

Quick-reference for manually verifying the extension on each supported platform.

## ⚡ TL;DR Testing Flow

- **Setup**: Load `src/` as an unpacked extension → open popup → click **Connect GitHub** (OAuth) → enter a repo name in Settings.
- **LeetCode**: Open Two Sum → Submit solution → Verify commit appears on GitHub in ~3 seconds.
- **GeeksForGeeks**: Solve Reverse a Linked List → Submit → Verify commit appears.
- **Codeforces**: Solve Theatre Square → Submit → Verify commit appears.
- **AI Panel**: Set API key in Settings → AI → Open floating AI Review panel on any problem page → Ask for review.
- **Dashboard**: Go to Library side-panel → Verify Heatmap, Charts, and Knowledge Graph render correctly.

---

## Setup

1. Load the extension unpacked from `src/` in `chrome://extensions` (Developer mode on) or `about:debugging` (Firefox).
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
- CF API is CORS-blocked — metadata (rating, tags) is read from the DOM, not the API.

---

## Settings Panel

| What to check           | How                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| GFG shows "Alpha" badge | Open popup → Settings → Platforms → GeeksForGeeks card should show an amber "Alpha" badge |
| CF shows "Alpha" badge  | Same — Codeforces card should show "Alpha" badge                                          |
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
