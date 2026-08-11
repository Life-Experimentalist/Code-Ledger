# Changelog

All notable changes to CodeLedger are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- Every AI surface now sees an aggregate picture of how you solve, not just how the problem in front of it went. The behaviour bank has recorded solve times, resubmits, hint views and what reviews flagged since it shipped, but nothing ever read more than one problem back at a time — so the review of your fourth off-by-one bug knew nothing about the first three, and the library chat started from zero every session. Reviews, all three chat surfaces and the solution merger now receive which review flags recur across separate problems, which topics you needed help on, your median pace per difficulty, and your hint and resubmit rates. A flag has to appear on two different problems to count, unstarted timers are not read as fast solves, and below five recorded problems nothing is claimed at all.
- A **Behaviour** tab in the library's Behaviour Bank page — which until now showed insights, roadmap and skills, none of which is the behaviour bank. It shows the derived profile, the exact prompt text the model receives, and the raw per-problem records. Anything shaping the model's answers should be something you can read, and clear.
- Incomplete problems now repair themselves in the background. A solve can arrive without its description or its tags for reasons that have nothing to do with you — a profile import knows the slug and nothing else, a submission page renders the verdict before the tags load, a request times out — and until now the fix only happened if you found the button, pressed it, and sat there with the window open. A background sweep now takes a couple of incomplete problems every few minutes and asks LeetCode or GeeksForGeeks for what is missing, over plain HTTPS, with no tab opened and nothing on screen. It only ever fills gaps, so nothing you have written can be undone by it; a problem that fails backs off on a widening schedule and is left alone after five tries, because some problems genuinely have no description to fetch and retrying those forever is just traffic. Codeforces is excluded deliberately — it has no description endpoint, and the only alternative is opening the page behind your back. Off with one switch in Settings → Advanced.
- One **Refresh problem data** button in place of the separate "Fetch Description" and "Recover Code" buttons, which each repaired one part of a problem and left you to notice the other. It fetches the description, the tags and the missing code in a single press.
- Topics of your own, in Settings → Platforms → Tag & Topic Normalization. The target of a mapping was a dropdown of the forty-odd built-in topics, so a tag that belongs to something the list has never heard of — a contest series, a company set, a technique nobody has agreed a name for — could only be filed under an approximation. It is now a free-text field with the built-ins as suggestions: type a name and it becomes a topic like any other, with its own node on the graph, its own axis you can set, and its own line in the gap report. What you type goes through the same normaliser every stored tag does, so "arrays" links to the existing Array rather than standing a second one up beside it, and a catch-all like "dsa" is refused with the reason rather than accepted into a topic that could never hold anything. There is no separate list of your topics to curate: a topic exists because something maps to it, and goes away when the last mapping to it does.

### Changed

- Fetching a description or recovering code no longer requires the problem window to stay open. Both used to run inside the window that asked for them — the code path polled storage for thirty seconds and then reported "Refresh timeout", whether or not anything had failed, and closing the window abandoned the work. The service worker now owns the whole operation, saves the result whether or not anything is watching, and tells any open window when it lands. Close it, come back, the data is there.
- AI reviews now name what they flagged in their metadata block instead of leaving it to a keyword scan that recognised seven fixed phrases. A review that flagged an unnecessary sort or a mutated input used to write nothing back to the behaviour bank; now it does. The keyword scan remains as a fallback for models that drop the block.

### Fixed

- "⚠ 86 conflicts detected during background sync" sitting directly above "Repository is already in sync — no new problems found", with no way to tell which was true. Two separate faults. The comparison that decides what a conflict is treated every way of writing "nothing" as a different value, so a record saved before `tags` existed disagreed with the same record saved today (`[]` versus absent), and `isDuplicate: false` disagreed with no flag at all — enough to flag an entire untouched library for manual review. And the warning banner reads its count from settings the panel holds in memory, which the import path cleared in storage but never told the panel about, so a count that was already zero stayed on screen. Absent, empty and `false` now compare equal, whitespace no longer counts as a difference, and re-checking a stale warning says in words that the conflicts are gone.
- Importing a GeeksForGeeks profile dating every problem to the day you imported it. The profile lists what you solved but never when, and the importer filled the gap with the current time — so a back catalogue of 200 problems became 200 commits dated today, one solid block on the contribution graph, and 200 solves stacked on a single square of the heatmap. Solve dates now come from GFG's month-scoped submissions endpoint, earliest submission wins, and the walk stops as soon as every problem has a date. Anything it still cannot date is recorded as undated rather than guessed: it earns its points and counts as a solve, but belongs to no calendar day, and all of the undated problems land in one clearly-labelled commit instead of one commit each.
- Pressing "Fetch Description" on a LeetCode problem moving that solve to today's date and, if the fetch came back without tags, emptying the tags it already had. The refresh looked the problem up by its bare slug where the records are keyed `lc-two-sum`, so it never found the one it was about to overwrite and treated every field as new — including the date, which it stamped with the moment of the refresh. Same shape of fault as the GeeksForGeeks import dates above, in a different place: a repair that quietly rewrote history. The lookup now uses the real key, tags survive a fetch that returns none, and a solve with no recorded date keeps having no recorded date rather than claiming to have happened during the refresh.
- A solve whose stored timestamp was `null` or `0` being scored on 1 January 1970 — a real date, on the calendar, inside the heatmap range, and eligible to be your best day.
- Badge SVGs never appearing in the repository, and the streak reading 0 in the popup, on the toolbar icon and in the badge preview. All three read the solve list through `Storage.getProblems()`, which has never existed — the accessor is `getAllProblems()`. Each call sat inside a `try`/`catch` written for "badges are decoration, never cost someone a commit", so the resulting error was logged as non-fatal and the badges were silently skipped on every single commit. A test now checks that every `Storage` method called anywhere in the source actually exists.
- Easy / Medium / Hard reported as 0 on the published stats page, in the badges and in the popup, above a non-zero total. Four separate places counted difficulties by comparing to the literal string "Easy" — which misses every GeeksForGeeks School and Basic grade, every Codeforces numeric rating, and anything renamed through your difficulty map. They now share one counter that normalizes first and reports what it could not classify as `unknown` rather than quietly filing it under Easy. The published report also counts its own problem list in preference to the stored totals, so an existing repository corrects itself on the next page load instead of waiting for the next solve.
- The published stats page rendering as a wall of raw JavaScript below the charts. A comment explaining that commit data must not contain a closing `script` tag spelled that tag out literally; the HTML parser does not know what a JS comment is, so the element ended there and everything after it was painted onto the page as text. The escaping test only ever checked injected data, never the template's own prose, so it passed the whole time the page was broken — there is now a test that the script blocks open and close in strict alternation.
- The activity heatmap on the published report overflowing into a horizontal scrollbar. Sizing measured the padded card rather than the scroll area, so it handed the grid roughly 3rem that does not exist, and it counted one inter-column gap too many.
- The knowledge graph settling into a knot of overlapping circles with the labels smeared over each other. Three causes, all geometric. Link lengths were measured centre to centre, so a problem's resting place next to a busy topic — a hub is drawn up to 48px across, the rest length was 60 — was _inside_ the circle it belongs to; they are now measured rim to rim. Nothing ever guaranteed nodes stayed apart, because repulsion only ever makes overlap less likely, so a separation pass now resolves any remaining overlap on positions directly. And every label was drawn regardless of whether another one was already there; a label that would collide with one already placed is now dropped, with the selected node, the hovered node and its neighbours taking precedence. The layout arithmetic moved into its own module so those are properties a test can check rather than something you have to squint at.
- Backups that reported success without having run. `commitBackupToGitHub` caught every error and returned normally, so the "Backup now" button printed "Backup committed to GitHub." after an expired token, a rate limit or a repository that had been renamed — and the automatic backup that runs every N solves could fail for months while the panel looked exactly the same as if it were working. The commit now throws when it does not land, the button names the file it wrote and how many older ones it pruned, and the outcome of each route — the copies on this device and the ones in your repository — is recorded and shown at the top of Settings → Backups with the reason when it failed. A failed automatic attempt now retries on your next solve instead of waiting out another full interval.
- Local backups quietly stopping once your history outgrew 10MB. The extension keeps up to sixteen snapshots on the device — ten manual, five automatic, one always-current — and each holds the full text of every solution, so a few hundred problems is enough to exceed Chrome's default `storage.local` cap. The write then failed, the failure was logged to a console nobody has open, and the "backup" you were relying on was months old. The extension now requests `unlimitedStorage`, which grants access to nothing new and only lets the data you already have be stored whole, and a write that fails for any other reason now says so on screen.
- Every file read back out of your repository being decoded as if it were ASCII. Eleven places — the sync index, the settings and chat mirrors, the backup snapshots, the migration reader, the published-report builder — decoded GitHub's base64 with bare `atob`, which returns one character per byte. A problem title with an accent, a comment in a language other than English, or an emoji in a note came back as mojibake, and the mangled text was what got written on the next commit, so a single bad character became permanent and compounded on every round trip. They all now share one UTF-8 decoder.
- Two full snapshots of every problem, source code included, being built out of the database on each solve — one for the rolling backup and one for the scheduled copy, both of the same data. One build now serves both.
- Sign-in failing with "The client_id and/or client_secret passed are incorrect" after the credentials were set. Two causes: whitespace left by pasting a value into `wrangler secret put` survived into the stored secret, and the authorize step trimmed it while the token exchange did not — so sign-in appeared to work and then failed at the last step. And the client ID and the client secret resolve through separate lists of accepted variable names, so setting the ID under one name while an older secret remained under another paired two different applications' halves. Both values are trimmed now, and a rejected pair reports which variable supplied each half.

---

## [1.7.0] — 2026-08-11

First public release. Versions up to 1.4.7 were development and store-review
builds; see [Development history](#development-history) for those notes. The
version does not restart at 1.0.0 because a `v1.0.0` tag already exists and the
Chrome Web Store requires each upload to exceed the last.

### Added

**Solve capture**

- Platform handlers for LeetCode, GeeksForGeeks, and Codeforces that detect an accepted submission and capture the code, language, difficulty, tags, and runtime/memory figures.
- A floating stopwatch on problem pages; the elapsed time is recorded with the solve.
- Bulk import of past solves from a LeetCode or GeeksForGeeks profile you own.
- On-demand code recovery for solves whose source was not captured at submission time.
- Duplicate detection, so re-submitting the same solution updates the existing entry instead of creating a second one.

**GitHub**

- One atomic commit per solve through the Git Trees API — solution file, README, and the repository index land together or not at all.
- Repository setup wizard: create a new repository or link an existing one, then write the initial layout in a single commit.
- A generated GitHub Pages dashboard in the repository showing a solve heatmap, language and topic breakdowns, and a searchable problem table.
- Cross-device sync through the repository's `index.json`, with a conflict resolver for entries that changed in two places.
- Mirror repositories: a commit that fails against the primary target falls through to a configured mirror rather than being lost.
- A **Connection check** in Settings → Advanced that answers "why is nothing being committed?" in one press. It reports the four things that have to be true in the order they matter — a token is stored, GitHub still accepts it and says what it can do, the repository exists and this token can push to it, and something has actually landed there — and each line that is not green says what to do about it. It draws the distinctions the old error message could not: a token that reports no scopes is a GitHub App token or a fine-grained PAT, and only the first of those is unable to create a repository; a 404 on the repository means either it is missing or this token cannot see it, and it says both rather than guessing.

**AI**

- Code review from Gemini, OpenAI, Claude, DeepSeek, OpenRouter, or a local Ollama model, using your own API key.
- A review queue that retries with backoff and respects provider rate limits, so a burst of solves does not drop reviews.
- A floating chat panel on problem pages with `/` commands for pulling in your code, the problem statement, and your errors.
- Chat history stored locally and, optionally, synced to the repository as Markdown.
- A tool panel in the chat view that runs fifteen context tools against your own ledger on request — query your solves, find similar problems, analyse a trend, suggest what to practise next, and read and write the behaviour bank. You pick the tool; each one can be switched off. The model does not call them on its own.
- With no provider configured, every AI surface is gone rather than idle — no review panel on problem pages, no chat tab, no queue banner, and neither the AI Chats nor the Behaviour Bank tab in the library, the latter holding nothing but insights and skills written by and for a model. Reviews you already have stay readable and filterable, because that text is yours. Adding a provider brings the surfaces back without a reload.
- The chat reads the behaviour bank the same way the review does. How long you took, how many attempts it took, and what a previous review flagged were being recorded on every solve and then only ever shown to the reviewer; the assistant you are talking to now gets the same history for the problem in front of it.

**Library**

- A sidebar and full-page library listing every captured problem, with search, filters, and per-problem detail.
- Analytics: solve heatmap, topic radar, difficulty breakdown, solve velocity, and language distribution.
- A force-directed knowledge graph linking problems through shared topics.
- A canonical topic map so the same concept from three platforms lands under one name.
- Topics are split onto two axes — data structures and algorithms — everywhere they are counted, because ranking them together lets Array bury Dynamic Programming. Which axis a topic sits on is a judgement call — Binary Search is a technique, Binary Search Tree is a structure — so the canonical topic list in Settings → Platforms lets you overrule any of them, and everything that counts topics follows your call instead.
- A **Where the gaps are** panel in Analytics that ranks topics by how well you hold them rather than by how often they turn up: solve count saturates, time since the last solve decays, and the two multiply. Structures and algorithms are ranked in separate columns, well-known topics with no solves at all are listed as blind spots, and one number up top says what share of your solves needed a technique rather than just a structure. Any row opens the solves behind it.
- The knowledge graph can colour topics by mastery instead of by identity. Giving every topic its own hue makes a pretty picture of what you have tagged and answers nothing; the mastery colouring spends the same colour on how well you hold each topic, so the weak areas are the ones that stand out. Switching mode repaints in place — the layout stays exactly where you left it — and a selected topic now shows how many problems you actually solved under it, when you last did, and how solid that leaves it. That solve count no longer includes the unsolved suggestions hanging off the topic.
- Behaviour bank recording how you interact with problems, with a switch in Settings → Advanced that stops the recording.
- Backups: manual JSON export, scheduled snapshots, and a snapshot before any bulk import.

**Streaks and badges**

- Points per solve on a fixed scale — Easy 10, Medium 25, Hard 50 — so the number means the same thing in your ledger as in anybody else's. Re-solving a problem you already have earns 40% of the first solve, and only after a three-day cooldown, which pays for spaced repetition without making one easy problem farmable.
- A daily points target (25 by default, adjustable) closes the day and keeps the streak alive. Doubling the target banks a streak freeze, up to five; a missed day can be bought back the next day at 1.5× the target.
- Vacation mode, with a three-day ramp at half target afterwards rather than dropping you straight back onto the full one.
- Ten levels and a set of achievements, both derived from the ledger.
- The achievements now have a shelf in the library's Analytics tab, locked ones included, instead of only appearing in the README the extension writes. Two of them count reviewed solutions, so they show up once a review provider is configured; with none configured they stay out of the list rather than sitting there permanently unreachable, and any you already earned keep their place. Anything earned since your last visit to the shelf is marked; the first visit marks nothing, because a back catalogue is not news.
- Streaks start the day you install. An imported back catalogue contributes its points but does not invent a streak you never lived through.
- The toolbar icon carries the current streak, coloured by whether today's target is already in, and the tooltip spells out the rest. The popup shows the same numbers with today's progress and what a rescue would cost.
- Badges are generated as SVG files committed into your own repository, with a `badges/stats.json` beside them. Nothing is fetched from a badge service, so a private repository works the same as a public one, and there is nothing to pay for or keep running.
- The streak card is committed in a light and a dark cut, and the README block uses a `<picture>` element so GitHub serves whichever matches the theme the reader chose. The bar and the numbers animate once as the card loads, and not at all for a reader whose system asks for reduced motion.
- A **Share** button on the analytics streak card. It renders the same card to a PNG in the page — copy it to the clipboard or save it — alongside an editable sentence and one-click links to X, LinkedIn, and Reddit. The links are each site's own public composer URL, so nothing is uploaded anywhere and no account beyond the one you are posting from is involved. A private repository is not linked in the post, because that link is a 404 to everyone who reads it.
- An optional GitHub Actions workflow refreshes the badges once a day, at an hour you pick, so a streak reads correctly on a day you have not solved yet.
- The whole feature has one switch. Turned off, solves are captured and committed exactly as before and every streak surface disappears — including the toolbar badge. The welcome page offers the choice before the first streak exists.

**Party**

- A **Party** tab that lines your ledger up against other people's. You add somebody by writing down their public repository — `owner/repo` or a pasted link — and the extension reads the `badges/stats.json` their own copy commits. There is no server, no account, and no request to be accepted.
- Rank by points, current streak, longest streak, solves, or level. Opening one friend pulls their full ledger and shows platforms, difficulty spread, top topics, and — the part worth having — the topics they cover that you do not.
- A share button mints a `codeledger.vkrishna04.me/compare?repos=…` link. The link carries the list and nothing else, so whoever opens it sees exactly what you saw without installing anything.
- The tab says plainly what it is: one-sided, since adding somebody does not add you to their list and they are never told; and self-reported, since the file lives in a repository its owner controls.
- Your friend list travels with the rest of your settings, so a second device does not start from an empty list.

**Privacy**

- A **Settings → Privacy** page that names every destination your data can reach: your GitHub repository, the sign-in relay, anyone with the link if the repository is public, the badge SVGs, the generated Pages site, `shields.io` if you pick that badge style, each AI provider you have configured, `mermaid.ink` when you press Render on a diagram, the repositories you add to Party, and the anonymous solve counter.
- The page opens with the tier your current setup is actually in — Private, Shared, Public, or Code leaves — followed by what is live now and what is available but switched off. Every row says what leaves, where it goes, and links to the panel that turns it off.
- The list is computed from your settings rather than written down, so it cannot fall out of step with what the extension does. The welcome page shows the same summary during setup.

**Both browsers**

- Chrome and Firefox from one source tree, with every extension API call routed through a single compatibility shim.
- The download is 3.5 MB rather than 17 MB. The packager copied all of `assets/images/`, which is mostly store promo tiles, a social preview and a screenshot of every tab — none of it opened by anything the extension runs. It now ships the four icons the manifests declare and the three branding images that get committed into your repository, and nothing else. The unpacked build applies the same rule, so what you load locally is what ships.
- The release command refuses to cut a release over a failing check. It now runs the type gate, the full test suite and the sync regression script, and stops on the first failure; previously it ran only the last of the three, inside a `catch` that turned a failure into a printed warning. It also verifies the Firefox manifest's version, which nothing checked before, and pushes the branch you are actually on rather than whatever `main` happens to point at locally.

### Security

- All third-party HTML — problem statements scraped from platform pages, AI responses, model identifiers — is reduced to an attribute-free allowlist of formatting tags before it reaches the page. Statements render inside a content script, where markup would otherwise execute in the host page's context.
- The OAuth callback signs its `state` parameter, stores it in an `HttpOnly; Secure; SameSite=Lax` cookie with a ten-minute lifetime, and compares it in constant time.
- The authentication worker exposes no endpoint that mints GitHub App installation tokens.
- Repository paths built from scraped titles are constrained: no `..` segments, no leading dots, no path escapes.
- **AI provider API keys could be written into your repository.** Settings sync waves through every key belonging to a provider — `openai_enabled`, `claude_model` and so on — so that a second device gets the same setup. `openai_keys` is one of those keys, and it is where the provider card puts what you type while you type it, before you press Save. An API key entered and not saved could therefore be committed to `.codeledger/sync.json` and `.codeledger/config.json`, in plaintext, in a repository that is usually public. Anything ending in `_keys`, `_token`, `_secret`, `_apiKey`, `_api_key` or `_password` is now refused regardless of which provider it belongs to, both on the way out and on the way back in, and the next settings commit rewrites both files without it. **Git history is not rewritten by this: if you entered an API key in a previous version, rotate it.**
- Reading a sync file back applies the same test as writing one, so a file written by an older build cannot reintroduce a key this one would refuse to send.
- The API-key box no longer writes to storage while you type. It is a staging box — nothing has ever read your keys from there, the providers read them from where **Save** puts them — so keeping a plaintext copy in the settings map bought nothing and was the reason a key could travel anywhere at all. Keys left stranded in settings by an earlier version are moved to where Save would have put them, and then removed; you do not lose them.
- Mermaid diagrams in AI responses are shown as source with a **Render diagram** button. The diagram is only sent to `mermaid.ink` when you press it, because that source describes your problem and your solution.

### Changed

- The default OAuth scope is `public_repo,workflow`. Creating a private repository needs the wider `repo` scope, which the settings panel offers as an explicit one-click upgrade rather than requesting up front.
- The extension no longer wakes in the background when it has nothing to do. Two of its periodic timers existed only to notice an empty queue — one of them checking every minute, indefinitely, for work that only exists after a profile import. They are now started when something is queued and stopped when it drains.
- GitLab and Bitbucket are gone from the interface and from the package. Their handlers were stubs that threw on every call, so presenting them as options — as a provider, as a mirror target, as an `@gitlab` chat mention — meant offering something that could not commit.
- The privacy policy and the store listings now describe the party comparison and the shared `/compare` link, which had been shipped without appearing in either. The policy also stops claiming that local storage is encrypted at rest; browser extension storage is isolated from other sites and other extensions, but it is readable by anyone who already has the operating system profile, and it now says so.
- The privacy policy exists in two copies — `PRIVACY.md` and the page at `/privacy` — instead of five. The three copies embedded in the store-submission documents had drifted; each still described a telemetry payload shape the code does not send. They are replaced by pointers to the canonical text.

### Removed

- Eighteen modules that shipped in the package but that nothing imported, including an encryption helper with a hardcoded salt that no code path ever called. Every line in the package is now a line something runs.

### Known limitations

- GitHub is the only working repository provider.
- The library runs inside the extension. It is not currently served as a standalone web application.
- Telemetry is off unless you turn it on, and sends only the extension version and which platform a solve came from.

---

## Development history

The entries below cover builds released on GitHub during development, before
any public listing. They used their own `1.0.0`–`1.4.7` numbering, which the
public 1.0.0 above supersedes. They are kept because the reasoning in them is
still useful, not because they describe shipped releases.

### [1.4.7] — 2026-06-26

### Added

- **Compliance: Built-in Demo AI Assistant & Reviews** — If no AI API keys are configured (such as during Chrome Web Store review), the extension falls back to a built-in Demo model. This allows reviewers and new users to test AI reviews and chat functionality immediately without third-party setup.

### Fixed

- **CWS: Create Repository flow unblocked** — "Set up repository" button silently did nothing when no GitHub token was saved (user hadn't authenticated yet). It now triggers the OAuth popup immediately, so the full Create Repository flow is accessible without needing to go through Settings first. Additionally, the "Create Repository" button inside the onboarding modal was disabled while checking name availability; it now remains active (the 422 from GitHub handles the taken-name case) so reviewers and users are never stuck waiting on a background API check.
- **GeeksForGeeks: Actual Submission Time Import** — Fixed a bug where GFG on-demand code recovery would keep the profile-import timestamp (i.e. the import date) instead of updating it to the actual submission time scraped from GFG's submissions page. Problem timestamp now correctly matches the latest solve.
- **GeeksForGeeks: Backdated Git Commits** — Recovered GFG problems are now committed individually in the background with the correct backdated submission time as the commit time, matching LeetCode parity.
- **Library: Updated GeeksForGeeks Links** — Solutions panel page now links GFG Practice directly to `https://www.geeksforgeeks.org/explore` instead of the old URL. Added a direct link to `https://www.geeksforgeeks.org/profile` on the GFG card.
- **GeeksForGeeks: Secure Profile Import** — The "Import All Solves" button is now only injected if the profile page contains the "Edit Profile" button, preventing users from importing solves from profiles they do not own.
- **Compliance: Privacy Policy Clarified** — Rewrote `PRIVACY.md` to fully declare data collection, handling, storage, and sharing details to fully satisfy Chrome Web Store User Data Privacy requirements.
- **Build: Release zips no longer duplicated in releases root** — `packager.js`, `package-chrome.js`, and `package-firefox.js` were writing zips to both `releases/` (root) and `releases/{version}/`. Zips now go only to the versioned subdirectory. Existing stray `codeledger-chromium-v1.4.7.zip` and `codeledger-firefox-v1.4.7.zip` from the root have been removed.

### [1.4.6] — 2026-06-18

### Fixed

- **GitHub OAuth broken by COOP** — GitHub sets `Cross-Origin-Opener-Policy: same-origin`, which clears `window.opener` in the OAuth popup. The callback page now embeds auth data in a DOM element (`#codeledger-auth-result`); the `presence-marker.js` content script reads it at `document_end` and relays it to the background service worker via `CODELEDGER_AUTH_RELAY`, which then broadcasts `CODELEDGER_AUTH` to all open library tabs. A `tabs.onUpdated` background pull with a 15-attempt retry loop keeps the Chrome service worker alive for the full ~7.5 s window. This fixes both "cannot login" (v1.4.5) and "cannot create repo after login" (v1.4.4).
- **Conflict modal reappears after resolution** — Root cause fixed: `applyImport()` now stamps each resolved problem with `_conflictResolvedAt: Date.now()`. On the next import pass, `importFromRepo()` skips re-flagging any problem whose `_conflictResolvedAt > remote.timestamp`, preventing the modal from reappearing while the GitHub push is still pending. Additionally, `onCancel` previously discarded all partial resolutions (when the user closed the modal mid-way); it now immediately applies whatever the user already resolved via `applyImport()` and fires a best-effort RESYNC_ALL.
- **Conflict modal: partial resolutions lost on close** — The `_resolvedSoFar` list passed to `onCancel` was silently ignored. Closing the modal mid-session now saves all choices already made and updates `_pendingConflicts` to the remaining unresolved count.
- **Conflict push failure was silent** — A failed `RESYNC_ALL` after conflict resolution previously set `importMsg` (invisible once the modal closed) instead of calling `flash()`. The error now appears as a visible toast with an explanation that a retry will happen on the next solve.
- **Library not updated after LeetCode solve** — Service worker now broadcasts `PROBLEM_SAVED` to all open library tabs immediately after `Storage.saveProblem()`. Library listens and calls `reloadProblems()` so the new problem appears without a manual refresh.
- **AMO: Telemetry setting key mismatch** — `PanelAdvanced.js` was saving the toggle under key `telemetryEnabled` while `telemetry.js` reads `telemetryOptIn`, so the UI toggle had no effect. Key unified to `telemetryOptIn` with `defaultOn=false` (opt-in, off by default) to match `telemetry.js` runtime behaviour and AMO data-collection policy.
- **AMO: Third-party vendor files lacked source attribution** — `vendor/preact.js` and `vendor/htm.js` were copied from the `esm.sh` CDN (not the official npm release), which AMO reviewers flag as an unverifiable source. Both files now contain unmodified official npm package content (`preact@10.29.1`, `htm@3.1.1`) with version headers. `vendor/preact-bundle.js` is regenerated from official npm sources via esbuild (see `dev/generate-preact-vendor.js`). `vendor/chart-bundle.js` also gained a version/source header.
- **LeetCode auto-save not working** — `onSubmitFired` used a single hardcoded `[data-e2e-locator="submission-result"]` selector that silently fails when LeetCode changes its UI. The selector list is now an array of fallbacks (`data-e2e-locator`, `data-testid*=result`, `data-testid*=verdict`, `role=status`, `class*=result-state`). Additionally, a 1 500 ms delay is now inserted between detecting the "Accepted" banner and calling the GraphQL API — LeetCode's WebSocket pushes the DOM update ~1.5 s before the backend marks the submission as Accepted in the API, causing the dedup check to fetch the previous submission (already in DB → skip). The delay ensures the API returns the correct new submission ID.
- **Conflict modal: "Keep both" caused file-path collision on push** — `buildResolved` created a second problem record with a mutated `"-alt-"` ID for the remote copy. Because both records share the same `titleSlug`, RESYNC_ALL tried to write two entries with the same git file path, corrupting the commit. "Keep both" now saves the remote's code as a new method entry on the local problem (title: "Remote approach (date)", preserving the remote code, AI review, and runtime stats) instead of creating a duplicate problem record.
- **Methods tab shown twice in problem modal** — The global `modalTabRegistry` registration included "methods" and "notes" tabs, while the modal's `tabs` array also added them manually, producing two identical tabs. The registry registrations for "methods" and "notes" have been removed; the manually-built tabs and their custom JSX renderers are the sole source of truth.
- **Release zips included `desktop.ini` files** — Windows generates `desktop.ini` in every folder. All three packager methods (Chromium, Firefox, source) now filter files matching `desktop.ini` (case-insensitive) before adding to the zip.

### Added

- **Auto-import from existing repo** — When a user links a repository that already contains CodeLedger data (`index.json`) and their local library is empty, the Git settings panel automatically triggers an import pass, bringing in all existing solutions without requiring a manual click.
- **Welcome page: direct GitHub OAuth popup** — Clicking "Connect GitHub →" on the welcome page now opens the GitHub OAuth popup directly (same flow as the Settings panel). If the browser blocks the popup, it falls back to opening the settings tab. The welcome page also listens on `chrome.storage.onChanged` so the "Connect GitHub" step auto-checks as soon as the token is saved by the relay.
- **`npm run vendor:preact`** — New script (`dev/generate-preact-vendor.js`) to regenerate all three preact-family vendor files from official npm packages using esbuild. Required to regenerate these files after npm package updates.
- **Conflict modal: rich field-level diff** — Version cards now show a side-by-side metadata diff table: actual tag pills (unique-to-one-side tags highlighted in cyan), difficulty with colour coding, language, AI review presence, runtime/memory stats. For "different approach" conflicts the code diff panel additionally shows a runtime/memory bar above each pane. Tag counts have been replaced with the actual tag names.

### Changed

- **Welcome page on first install** — Extension now opens `welcome.html` automatically on first install (`chrome.runtime.onInstalled` with `reason === "install"`). The welcome page has a full guided checklist: GitHub login → repo setup → AI provider (Gemini recommended with link to Google AI Studio for free keys) → import past LeetCode solutions (skippable) → solve first problem (skippable). Optional steps can be skipped and are persisted locally.
- **Firefox manifest `data_collection_permissions`** — `optional` array updated from `[]` to `["interaction"]` to accurately declare the opt-in anonymous solve-count telemetry to AMO reviewers.
- **Methods tab: expandable code view + back navigation** — Method cards in the methods tab are now collapsible: clicking a card expands it to show the method's syntax-highlighted code and a truncated AI review inline. A "← Problem Code" button at the top of the tab navigates back to the first code tab.

---

### [1.4.5] — 2026-06-15

### Fixed

- **Telemetry: opt-in default was reversed** — `telemetryOptIn` defaulted to `true` in both `src/core/telemetry.js` (fallback) and `src/core/handler-registry.js` (settings schema), meaning anonymous usage data was sent to `counter.vkrishna04.me` without explicit user consent. Both now default to `false`. No data is sent until the user enables "Anonymous Usage Stats" in Settings → General.
- **Telemetry: install-event fired before settings loaded** — `Telemetry.track("install")` in `service-worker.js` ran inside `chrome.runtime.onInstalled` before user settings could be read, bypassing the opt-in check entirely. The call has been removed; install counts are obtained from store dashboards instead.
- **Store listings: false privacy claims** — The AMO and CWS privacy descriptions stated "no data is sent to our servers" while telemetry was active by default. All store listing docs (`firefox-amo.md`, `chrome.md`, `edge.md`) now accurately disclose the opt-in telemetry endpoint, payload, and default-off behaviour.
- **Firefox manifest: `strict_min_version` too low** — `browser_specific_settings.gecko.strict_min_version` was `112.0` but `data_collection_permissions` requires Firefox 140 (desktop) and 142 (Android). Bumped to `142.0`.

### Changed

- **Telemetry setting description** — Settings UI label updated to clarify "Off by default" and that only `{ platform, version }` is sent — no code, tokens, or identifiers.
- **Landing page FAQ** — "Does it upload my code?" answer updated to accurately mention the opt-in telemetry counter.
- **Store links** — `config.json`, `constants.js`, and `README.md` updated with the live Chrome Web Store URL (`chromewebstore.google.com/detail/codeledger/dpalidbhndcbppmjgmbloffehbhfchmb`) and AMO URL (`addons.mozilla.org/en-US/firefox/addon/code-ledger/`).
- **Landing page version badge** — Hero badge updated to `v1.4.5`.

---

### [1.4.4] — 2026-06-11 (resubmission)

### Fixed

- **CWS rejection: remotely-hosted code** — Chrome Web Store rejected v1.4.4 for referencing `cdn.jsdelivr.net/chart.js` inside `handlers/git/github/pages-template.js`. Chart.js 4.5.1 UMD minified source is now bundled in `src/vendor/chart-source.js` and inlined directly into the generated GitHub Pages dashboard HTML. No remote requests are made by the extension itself.

### Changed

- **Build: chart-source auto-regeneration** — `dev/build.js` now detects when `src/vendor/chart-source.js` is missing or version-mismatched against `node_modules/chart.js` and regenerates it automatically. Upgrading `chart.js` in `package.json` + `npm install` + `npm run build` is sufficient; no manual vendor step required.

### Removed

- **Dead vendor stubs** — `src/vendor/chart.js` and `src/vendor/preact-hooks.js` were broken `// Module not found` stubs from failed esm.sh downloads; nothing imported them.

---

### [1.4.4] — 2026-06-06

### Fixed

- **Manifest: `web_accessible_resources` missing UI modules** — `ui/floating-ai.js`, `ui/floating-timer.js`, and `ui/components/AIMarkdownRenderer.js` are loaded from web page context (platform handler → content script dynamic import chain) and must be declared web-accessible. They were incorrectly omitted in the v1.4.3 permission tightening pass, which would have broken the floating AI panel and timer overlay on all platforms.
- **CI: release workflow read deleted `src/manifest.json`** — Manifest version validation step now reads `src/manifest-chromium.json` (the split-manifest source introduced in v1.4.3).

### Changed

- **Manifest permissions tightened** — Removed unused `scripting`, `webRequest`, and `tabs` permissions (none are called in the codebase). Removed `https://bitbucket.org/api/*` host permission (Bitbucket handler is `UNDER_CONSTRUCTION`). `web_accessible_resources` matches narrowed from `<all_urls>` to only the three DSA platform domains plus the landing page.
- **Landing page** — Hero badge and "What's new" section updated to v1.4.3; footer now links to `/privacy`, `/terms`, and `/support`. Chrome Web Store URL in `config.json` now includes the full extension ID.
- **Prettier standardised** — All `src/**/*.js`, `dev/**/*.js`, and `worker/src/**/*.js` formatted with Prettier (printWidth 100, double quotes, trailing commas). `format` and `format:check` scripts added; `format:check` runs in CI on every release tag.

### Added

- **Landing pages: Privacy, Terms, Support** — `/privacy.html`, `/terms.html`, `/support.html` served from the Cloudflare Worker, matching the site dark theme. Each includes a consistent footer with links to all three pages.
- **CI: Chrome Web Store auto-publish** — `.github/workflows/publish-chrome.yml` triggers on `release: published` (after the GitHub Release is created), downloads the chromium zip from release assets, and publishes via the Chrome Web Store API. Requires `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` repository secrets. Edge and Firefox AMO publish workflows are stub stubs to be added once those listings are live.

---

### [1.4.3] — 2026-06-05

### Fixed

- **Conflict Resolution Modal: Banner persists after resolve** — After applying resolved conflicts, the amber "conflicts detected" banner now clears immediately. Previously `_pendingConflicts` was zeroed in storage but the React settings state was not updated, so the banner remained until the next full reload.

---

### [1.4.2] — 2026-06-02

### Added

- **Analytics: Monthly activity chart** — AnalyticsView now shows a rolling 12-month bar chart of solve activity alongside the existing weekly chart.
- **Analytics: Day-of-week heatmap** — New bar chart showing which day of the week you solve most; peak day is highlighted and surfaced as a "Best Day" stat.
- **Analytics: Rolling 7/30-day counts** — `last7Days` and `last30Days` replace the previous calendar-week/month counters so the numbers always reflect a true rolling window.
- **Floating AI: Guided (Socratic) mode** — Default panel mode now leads the learner through questions instead of handing over the answer. A "Guided / Direct" toggle chip in the panel header lets you switch modes; selection is persisted to storage.
- **Floating AI: Apply-code button** — AI-suggested code blocks now render an "Apply" button that writes the code directly into the active Monaco editor without copy-paste.
- **Floating AI: Alt+\` keyboard hint** — Keyboard shortcut hint displayed in the panel title bar.
- **Floating AI: Improved Monaco code extraction** — `getActiveCodeEditor()` is tried first, then `getEditors()`, then `getModels()`, then DOM view-lines sorted by `top` CSS value for correct ordering; covers all LeetCode editor states.
- **Conflict Resolution Modal: SameCodeStep** — When both versions have identical (normalised) code, the modal shows a compact three-way choice (local / remote / both) with an 8 s auto-resolve countdown and progress bar.
- **Conflict Resolution Modal: DiffApproachStep** — When code differs the modal shows a three-way choice with per-side metadata (difficulty, language, date, AI review status, tag count) and the fields that differ.
- **PanelAI: Queue management controls** — Settings → AI now polls and displays real-time review queue stats; exposes "Queue Missing Reviews", "Requeue All", and "Cancel" actions.
- **AIReviewPanel: QueueStatusCard** — Inline status card in the review panel shows queue depth, snail-mode pause state, and time-to-next-batch.
- **Service worker: Snail Mode state** — Persistent `snailMode` state (`lastBatch`, `consecutiveErrors`, `isPaused`, `pausedUntil`, `totalProcessed`, `totalErrors`) tracks AI review batch throttling across browser restarts.
- **Popup: settingsTab deep-link** — `openLibrary()` accepts a `settingsTab` parameter to deep-link directly to a Settings sub-panel from the popup.
- **DedupReviewQueue: "Let AI Decide" action** — Per-conflict button that requests an AI comparison and auto-resolves within 10 s timeout; default countdown reduced from 12 s to 5 s.

### Fixed

- **AI prompts: chatMode respected** — `buildConversationSystemPrompt()` now switches to the direct-answer prompt when `context.chatMode === "direct"`, preventing Socratic rules from leaking into Direct mode sessions.
- **Floating AI: DOM line sort** — View-lines are now sorted by `style.top` before joining, fixing incorrect line ordering when code spans the visible scroll window.

### [1.4.1] — 2026-05-21

### Added

- **Codeforces: Full platform handler (alpha)** — complete submission detection, code capture, language resolution, and GitHub commit for all CF problem types (`/contest`, `/gym`, `/problemset`). Uses sessionStorage to preserve code across CF's full-page reloads.
- **Codeforces: Floating AI panel** — AI chat injected on CF problem pages; reads editor code (`<textarea id="editor">`), language, problem statement, and test failure verdicts.
- **Codeforces: QoL buttons** — "Copy Code" and "AI Review" buttons injected above the CF editor.
- **Codeforces: Verdict detection** — MutationObserver on `span[submissionverdict="OK"]`; works on both inline problem table and `/my` page without any API calls.
- **Codeforces: Difficulty normalisation** — numeric CF ratings mapped to Easy (≤1200) / Medium (1201–1900) / Hard (≥1901) following community standard.
- **GFG: AI test-failure connector** — `readTestFailures()` now reads the GFG result/verdict container and error pre-elements, filtered to exclude success messages.
- **Platforms: Alpha/Beta status badges** — GFG and Codeforces platform cards in Settings → Platforms now show an amber "Alpha" badge.
- **Handler activation** — GFG and Codeforces handlers are now fully activated in `handler-loader.js` (previously logged "under construction" and exited).
- **Docs: Testing guide** — `docs/TESTING_GUIDE.md` with per-platform test steps and common issue resolutions.

### Fixed

- **Codeforces: Title prefix stripped** — CF problem titles like "A. Theatre Square" are stored as "Theatre Square" (letter prefix removed).
- **Codeforces: Language prefix matching** — verbose CF lang strings ("GNU G++17 7.3.0") resolved by keyword prefix so future compiler bumps don't break detection.

### [1.4.0] — 2026-05-21

### Added

- **GFG: Floating AI chat panel** — AI review/chat panel injected on GeeksForGeeks problem pages, matching LeetCode parity.
- **GFG: Copy code button** — copy-to-clipboard button injected into the GFG editor toolbar alongside the existing QoL buttons.
- **GFG: Bulk profile import** — import all accepted submissions from a GFG user profile page in one click (same flow as LeetCode profile import).
- **GFG: Hook-based submission detection** — hooks the submit button and polls the result panel to catch accepted submissions automatically.
- **GFG: Ace editor code extraction** — on-demand fetch now recovers the current editor code via script injection into the page context (GFG uses Ace, not CodeMirror).
- **GFG: PROFILE page type** — `detectPage()` now recognises `/user/{username}` as a distinct `PROFILE` page type.
- **GFG: `gfg_username` setting** — new settings key for specifying the GFG username used in profile import.
- **LeetCode: Handler split into focused modules** — `index.js` reduced from ~2 000 to ~740 lines by extracting `file-builder.js`, `lang-utils.js`, `profile-import.js`, `submission-detector.js`, and `ui-injection.js`.

### Fixed

- **AI: Stale default model names** — updated to `gemini-2.0-flash`, `gpt-4o-mini`, and the current OpenRouter free-tier model slug.
- **AI: Ollama model listing** — was parsing `data.tags` (wrong key); now correctly reads `data.models`.
- **AI: Claude model fetch** — added missing `anthropic-version` header to model-fetch and key-test requests.
- **AI: OpenRouter headers** — added required `HTTP-Referer` header to all OpenRouter API calls.
- **AI: OpenAI model filter** — filter now returns all models; previously excluded `o1`/`o3`/`o4` reasoning models unintentionally.
- **GFG: Timestamp in milliseconds** — timestamp was emitted in seconds; now correctly multiplied to milliseconds so the library sort order is correct.
- **GFG: browser-compat runtime** — replaced direct `chrome.runtime.sendMessage` call with `browser-compat.js` runtime for Firefox compatibility.
- **GFG: Lang slug field** — lang object now includes the `slug` field (was missing, causing path-builder failures).
- **GFG: Code extraction via Ace** — submission code is now read from the Ace editor model; the previous CodeMirror approach was a no-op on GFG.

---

### [1.3.1] — 2026-05-19

### Fixed

- **Auto AI review not triggering** — `_requestAIReview` flag was set on the local submission object but never included in the `emitSolved()` payload; the service worker always saw `undefined` and skipped the review. Flag is now forwarded correctly.
- **"Sync to Ledger" false positive** — clicking the button while auto-sync was in progress caused `_processSubmission` to exit early due to `_processingLock`, but `_manualSync` still showed "✓ Synced". The button now waits up to 8 s for the in-progress sync to finish before reporting "✓ Auto-synced", and only shows "✓ Synced" when `_processSubmission` actually emitted a solve event.
- **Floating AI panel position** — panel was anchored at `bottom: 110px`, sitting high above the window bottom. Moved to `bottom: 20px` to sit at the bottom edge.
- **AI system prompt context dropped** — `buildConversationSystemPrompt` had a dead `return base` statement that prevented the context hints array (problem title, difficulty, request-type behaviour modifiers like "Return useful tests" for `/test`) from ever reaching the system prompt.
- **QoL copy/paste buttons lost on React re-render** — LeetCode's React occasionally re-mounts the editor toolbar, silently removing injected buttons. A `_maybeReinjectQoL()` check is now wired to the existing MutationObserver so buttons are restored within ~600 ms of being removed.

### Added

- **Monaco language detection in AI panel** — `_getEditorLanguage()` reads the language from `monaco.editor.getModels()[0].getLanguageId()` and maps it to a human-readable name (e.g. `python3` → `Python3`). Language is now passed to the floating AI context so code blocks include the correct syntax identifier.
- **Problem statement auto-injected into AI panel context** — `_readProblemStatement()` reads the problem description from the DOM (`[data-track-load="description_content"]`) and passes it as `problemStatement` in the AI chat context, giving the AI full problem context without the user needing `/problem`.

---

### [1.3.0] — 2026-05-17

### Added

- **Per-method AI review** — each code approach in a multi-method problem gets its own AI review. `MethodCard` renders per-method code + AI review inline in the Methods tab of ProblemModal. Clicking "Generate Review" triggers an immediate on-demand review for that method alone.
- **Per-method AI review queue** — `handleQueueAllAIReviews` now enqueues `${problemId}::method::${index}` entries for methods without a review. `processAIReviewQueue` detects the `::method::` pattern and processes them separately from problem-level reviews.
- **MAINTENANCE_COMMIT alarm** — every 10 minutes the service worker batches all pending AI reviews, metadata edits, and notes updates into a single atomic chore commit instead of one commit per edit.
- **Bulk import resilience** — individual-mode sync (onboarding commit-per-problem) persists its state to `chrome.storage.local`. If the browser closes mid-import, a `BULK_IMPORT_RESUME` alarm fires 45 seconds after the next browser open to automatically resume.
- **Onboarding progress bar** — the "done" step of GitHubOnboardingModal now shows a live progress bar (current/total) streamed from the SW via a `sync-keepalive` port. "Start Coding" is always enabled; the user can close the modal and sync continues in the background.
- **Refresh README Stats button** — new button in Settings → Git that commits a fresh `index.json` and triggers a full infra rebuild (README + index.html) from current local data, without needing a new problem commit. Useful after repo recreation or when stats are stale.
- **Config backup in every commit** — every problem commit and every resync now bundles `.codeledger/sync.json` (portable settings), `.codeledger/behaviour-bank.json`, and `.codeledger/roadmaps.json` into the same atomic tree, keeping user configuration always in sync with the latest solve. GitHub's Trees API deduplicates unchanged blobs so there is no overhead when nothing changed.
- **Collapsible hints in problem README** — `buildProblemMarkdown()` now emits a `<details><summary>Hint N</summary>` block for each hint stored on the problem. Hints are collapsed by default and work in both GitHub's file view and raw markdown.
- **Canonical path resolution at commit time** — `_handleResyncAllInner` pre-loads the canonical map and enriches each problem with its canonical ID before building file paths. Problems previously committed without canonical (e.g., via bulk importer) are now placed under `problems/{canonicalId}/{platform}/` on resync.
- **Two-phase resync with stable commit history** — `_handleResyncAllInner` now categorises problems into `newProblems` (never committed) and `maintenanceItems` (committed but layout/content drifted). Phase A commits only new problems (individual backdated or bulk). Phase B issues a single maintenance commit that atomically writes new-layout files and deletes stale old paths via `opts.deletes` → GitHub Trees API `sha: null`. Each problem appears in history exactly once for its initial solve; all subsequent path renames or content updates land in a single maintenance commit per sync cycle — no duplicate commits, no orphaned files.
- **`_committedPaths` tracking** — after every commit (regular solve, resync, maintenance) the problem's committed file paths are stored in IndexedDB. Future resyncs use these to compute the exact deletion set instead of guessing.
- **Remote file tree inference** — on resync, `GET /git/trees/{sha}?recursive=1` fetches the full repo tree once. `_inferCommittedPaths()` matches problem directory prefixes (including `::submissionId`-style old paths) to locate all blobs belonging to a problem, enabling correct deletions even for problems committed before `_committedPaths` tracking started.
- **Landing page library links** — `data-cl-open` added to the nav Library link and the CTA button; `landing.js` already rewrites these to the extension URL when the extension is detected.
- **Landing page platform icons** — LeetCode, GeeksForGeeks, and Codeforces chips now use actual favicons instead of emoji.

### Changed

- **Problem description file renamed to README.md** — `descriptionPath()` now returns `{dir}/README.md` instead of `{dir}/{platformId}.md`. GitHub automatically renders this when browsing the problem directory.
- **Infra bundled into the last meaningful commit** — `index.json`, `README.md`, `index.html`, and `.codeledger/*` are included in whichever commit is already happening (last problem commit in individual mode, the bulk commit, the maintenance commit). No separate trailing infra commit is issued when problem commits are made. An infra-only commit is still issued when all problems are already up-to-date.
- **GitHub Pages "src" link uses v3 path** — `repoFileUrl()` now reconstructs the correct v3 path (`problems/{canonicalId}/{platform}/README.md` or `problems/{platformId}/README.md`) instead of the old v1 slug-based format.
- **Language label normalization on GitHub Pages** — `pythondata` → "Python (Pandas)", `mysql` → "MySQL", `postgresql` → "PostgreSQL", etc., for cleaner display in the Recent Solves table and badges.
- **Recent Solves date includes year** — dates in a prior year now display as "Jan 5, 2024" instead of "Jan 5" to avoid ambiguity.
- **Removed AI "Progress Summary" from README** — the AI-generated narrative block is no longer included in the generated repository README; it produced inconsistent output and added noise.
- **Welcome page** — removed the Diagnostics & Migration tab and `DiagnosticsPanel` component. Path fixes and the two-phase resync make manual layout repair tools unnecessary.

### Fixed

- **`::submissionId` suffix in problem paths** — `platformId()` now strips the `::number` suffix that the LeetCode bulk importer appended (e.g. `lc-best-time-to-buy-and-sell-stock::1427680302` → `lc-best-time-to-buy-and-sell-stock`). Affected paths are corrected on the next resync via the maintenance commit.
- **Stale README stats (one-commit-lag)** — `buildInfraFiles` now accepts an `indexMetaOverride` parameter. Callers pass the freshly-built `index.json` data so README stats reflect the new problem count in the same commit rather than the previous state.
- **Stale paths not deleted on layout change** — old problem files (`{slug}.md`, `::submissionId` dirs, pre-canonical paths) are now explicitly deleted in the maintenance commit via `opts.deletes`, eliminating orphaned files that accumulated across layout versions.
- **GitHub App `read:org` 401** — `/user/orgs` returns 401 for GitHub App tokens that lack `read:org` scope. The onboarding modal now silently treats this as an empty org list instead of clearing the valid auth token.
- **Avatar CORS failure** — removed the `Authorization` header from avatar CDN fetches in `library.js`; `avatars.githubusercontent.com` is a public CDN that blocks auth headers via CORS.
- **LaTeX rendering** — `\times`, `\leq`, `\geq`, `\neq`, `\rightarrow`, Greek letters, and other LaTeX symbols are now substituted to Unicode in AI review output via `substituteLatex()` in `katex-stub.js`. Applied in both `renderMath()` and inline `parseMarkdown()`.
- **ProblemModal null notes crash** — the Notes tab `show` guard now uses `p?.notes` safe navigation, preventing a crash when `p` is null during modal initialisation.
- **AI review batch size** — background queue processes 2 items per alarm tick (was 10) to avoid rate-limiting AI providers during backfill.
- **On-demand AI review no longer commits immediately** — `handleRegenerateAIReview` marks the problem as pending for the MAINTENANCE_COMMIT batch instead of making an individual commit per review.

### [1.2.0] — 2026-05-13

### Added

- **AI Review Queue — Queue Missing button** — dedicated button that queues only problems with no AI review yet, separate from the full re-queue action.
- **AI Review Queue — Requeue All button** — queues every problem for re-review (including those already reviewed); asks for confirmation before submitting.
- **AI Review Queue — Cancel Queue button** — gracefully cancels all pending reviews: any review currently processing finishes naturally, then the rest are removed. Button appears only when there are pending or processing items.
- **AI Review Queue — built-in dedup** — `enqueueReview()` now checks for an existing pending/processing entry before adding; duplicate submissions are silently skipped and reported as `skipped` in the response.
- **GitHub Pages heatmap full width** — activity heatmap now fills the full card width. Cell size is computed from available width via a `--hm-cell` CSS variable set by a `resizeHeatmap()` function (minimum 8 px); re-runs on every window resize.
- **User repo README — social banner, logo & badges** — generated `README.md` now opens with the CodeLedger social preview image, the extension logo, and four flat-square shields (total / easy / medium / hard counts) with difficulty colours, all using raw GitHub image links.
- **Auto-save settings to repo** — every settings change in the Library UI now calls `markSettingsPendingCommit()` so the next problem commit automatically includes `.codeledger/config.json` with the updated portable settings. Manual "Force Commit Settings" and "Backup Config" buttons continue to work as before.
- **AI Behaviour Bank** — personal memory layer for the AI assistant: Knowledge Bank (insights), user-defined Skills (trigger on command/difficulty/after-solve), and a learning Roadmap. All context is automatically injected into AI chat conversations. Accessible as a full Library tab.
- **MCP tools** — a tool panel in the chat view: save and recall Knowledge Bank insights, open problems, set roadmap goals, list and delete chats. Tools are invoked by you from the panel and configurable in Settings → AI. (This entry originally described the AI invoking them itself; that was never implemented.)
- **Cross-device AI chat sync** — every AI conversation is committed as `chats/YYYY-MM-DD-HH-mm-ss-{id}.md` with YAML frontmatter. Bidirectional sync via GitHub on every startup; deleted chats are tombstoned and removed from remote.
- **Rolling GitHub backups** — automatically snapshot local problems + settings to `backups/YYYY-MM-DD-HH-mm-ss.json` in the repo. Configurable interval (default every 20 commits) and retention count (default 10). Full restore from the Library Settings → Backups panel.
- **Deduplication engine** — `duplicate-detector.js` finds same-slug same-language duplicates; `ai-deduplication.js` generates AI merge proposals stored on the problem. A dedicated `DedupReviewQueue` modal lets users approve/reject proposed merges.
- **`MissingMetadataModal`** — review queue for problems missing tags or difficulty; supports individual refresh, per-problem ignore, and bulk ignore/unignore with persistent state.
- **Setup completion notification** — Library sidebar and main content area show a dismissable amber banner if GitHub is not connected or no repo is linked, with a direct link to the Welcome page.
- **GitHub handler refactor** — `commit-builder.js` (tree items + commit payload), `api-client.js` (REST wrappers), and `infra-builder.js` (README/index.html generation) extracted from the monolithic `github/index.js`.
- **Landing page v1.2** — dynamic "Open Library" links (extension URL when installed, web URL otherwise); "What's new in v1.2" features section; new FAQ entries for Behaviour Bank, MCP tools, sync, and migration.
- **Prettier formatter** — `.prettierrc` config; `npm run format` script formats all `src/**/*.js` and `worker/public/assets/**/*.js` files.
- **New repository path layout v2** — `problems/{slug}/{slug}.{ext}` (no platform subdir without canonical); `problems/{slug}/{platform}/{slug}.{ext}` when canonical is assigned. Solution files named after slug (`two-sum.py`) instead of verbose language name (`Python3.py`).
- **Commit taxonomy** — structured commit messages: `[solved]`, `[update]`, `[comprehensive-update]`, `[maintenance]`, `[chore]`, `[init]` via `src/core/commit-messages.js`.
- **Bulk progress-page import → GitHub** — imported problems now build proper v2 paths and READMEs; a "Commit N to GitHub" button appears after import that fires a `[comprehensive-update]` commit.
- **Migration manager** — `MIGRATE_REPO` message for layout v1→v2 migration, `RESET_REPO` for full repo rebuild (self-healing). Finds old `topics/` paths and replaces them atomically via GitHub Trees API.
- **Migration UI in Settings → GitHub** — "Check layout version", "Migrate to v2 layout", and "Full rebuild" buttons.
- **Extension update detection on startup** — compares `manifest.version` against stored version; sets `extensionUpdated` flag so UI can prompt user to run migration.
- **Slash-command autocomplete** in floating AI assistant — typing `/` shows a dropdown of available commands; clicking inserts the command.
- **`index.html` and root `README.md` always regenerated** on every GitHub commit (no longer "only if missing"). GitHub Trees API deduplicates unchanged blobs automatically.
- **`index.json` layout stats** — now includes `layoutVersion`, `byPlatform`, and `byLang` breakdown fields.
- **Root `README.md`** generated in user repos linking to their GitHub Pages stats dashboard (supports custom domains).
- **Under Construction badge** in settings section renderer — sections with `underConstruction: true` show an amber badge and are visually marked.
- **Missing Metadata review modal** — surfaces problems missing tags/difficulty and queues metadata refresh from the background.
- **Dedup review queue** — same-language duplicate candidates now appear in a dedicated review modal with approve/reject actions.
- **AI merge proposals** — same-language duplicates can generate an AI merge proposal that is stored on the problem and reviewed before applying.
- **Mirror repository settings** — a dedicated settings panel manages additional git mirrors alongside the primary repository.
- **Cross-device auto-sync** — periodic background sync is scheduled with `chrome.alarms` so remote changes are picked up automatically.
- **LeetCode: non-accepted submissions could auto-sync** — submission detail pages now check `statusCode === 10` (Accepted) before auto-committing; WA / TLE / Runtime Error submissions are silently skipped. Manual "Sync to Ledger" still works on any submission.
- **LeetCode: sync button appearance delay** — replaced the 1200 ms `setTimeout` retry with a `MutationObserver` that injects the button the instant the action button row enters the DOM; button now appears as soon as the page renders.
- **LeetCode: Monaco code extraction** — added `_getCodeFromMonaco()` fallback (`window.monaco.editor.getModels()[0].getValue()`) for cases where GraphQL returns an empty code field.
- **LeetCode: copy button only copied visible lines** — `qol.js` copy button now uses the Monaco model API as primary source, getting the full file regardless of scroll position; DOM `.view-line` scraping kept as fallback for edge cases.
- **LeetCode: copy button produced dirty code** — both the copy button and `_getCodeFromMonaco()` now strip whitespace-visualization characters Monaco injects (`U+00B7` middle dot, `U+200C` ZWNJ, `U+00A0` NBSP) so clipboard output is clean, runnable code.
- **Graph: scroll zoom snaps to min/max** — replaced binary 0.9/1.1 zoom step with `Math.exp(-deltaY * 0.001)`, making trackpad pinch-to-zoom smooth and proportional while keeping single mouse-wheel notch at ≈ 9.5 % per step.
- **Graph: zoom buttons** — `+` and `-` buttons in the toolbar for click-to-zoom (centered on canvas), grouped with the existing Fit view (▣) button.

### Fixed

- **`import()` banned in MV3 service workers** — all dynamic `await import(...)` calls inside `service-worker.js` removed and replaced with top-level static imports. Affected modules: `ai-review-queue.js`, `ai-deduplication.js`, `backup-manager.js`, `migration-manager.js`, `api-client.js`, and `path-builder.js`. Fixes "Queue AI Reviews" and "Backup" features that were silently failing in production.
- **AI Review Queue — IndexedDB version conflict** — `ai-review-queue.js` was opening a `"CodeLedger"` database at version 1 while the browser had an existing version 2, causing a hard error on every queue operation. Database renamed to `"codeledger-queue"` to open fresh at version 1.
- **`git.apiFetch` not a function in PanelGit.js** — two call sites replaced with a direct call to `ghGetCurrentUser(token)` from the statically imported `api-client.js`. Fixed the manual import preview and individual-sync path when `github_owner` was unset.
- **422 non-fast-forward on sequential commits** — `GitHubHandler.commit()` now retries up to 3 times (500 ms, then 1 000 ms back-off), fetching a fresh ref and rebuilding the tree on each retry.
- **Stale `index.json` showing 0 problems after full sync** — a repair commit is now issued when the remote index contains an empty `problems: []` but local problems are already committed.
- **Repo name forced to lowercase** — `GitHubOnboardingModal.js` `sanitize()` no longer calls `.toLowerCase()`; the allowed-character regex updated to `[^a-zA-Z0-9._-]` to match GitHub's actual rules.
- **`/errors` command in AI assistant always showed "no errors"** — raw error string from `readTestFailures()` now passed directly to `expandChatVariables`, bypassing `normalizeList()` which was converting the string to `[]`.
- **Manual sync blocked by submission dedup** — `forceCommit: isManual` now bypasses the `alreadyCommitted` session-storage dedup check so the Sync button always commits.
- **AI floating panel overlapping LeetCode's submit bar** — moved from `bottom: 70px` to `bottom: 110px`.
- **Bulk-imported problems had no READMEs and used old hardcoded `topics/` paths** — now uses `solutionPath()` + `readmePath()` from path-builder and builds a full README per problem.
- **GitHub avatar showed a placeholder instead of the real profile image** — avatar is now hydrated from saved settings on startup and stored as a data URL when OAuth can fetch it.
- **Console logging was noisy when debug was disabled** — `console.log` / `console.error` are now gated behind the debug flag and re-enabled cleanly after OAuth.
- **`index.json` could throw on malformed remote content** — remote sync now guards JSON parsing and falls back to an empty remote index.
- **`providerId` could be undefined in the AI review loop** — the provider id is now scoped before use and falls back safely.

### Changed

- **AI Review Queue stats display** — replaced verbose paragraph list with a compact inline pill row that only shows non-zero counts; processing count highlighted in cyan.
- **`handleQueueAllAIReviews` now accepts a `missingOnly` flag** — single function drives both "Queue Missing" and "Requeue All" to avoid duplicating logic.
- **`Shift+Enter` inserts newline** in AI assistant input (previously single-line `<input>` — replaced with auto-growing `<textarea>`).
- **Solution files named after problem slug** (`two-sum.py`) — `solutionPath()` no longer uses the verbose language name.
- **`buildIndexJson`** includes layout version and per-platform / per-language stats.
- **LeetCode import now preserves every accepted submission** — imports keep multiple languages and multiple accepted submissions instead of collapsing them too early.
- **Atomic chore commits include notes and AI chats** — maintenance sync commits now bundle `notes.md` and `ai-chats/*.json` alongside problem files.
- **AI review tags are ordered by importance** — tag presentation is now priority-based instead of alphabetical.

### Removed

- Old `topics/{topic}/{slug}/` path pattern — migrated by `MIGRATE_REPO`.

---

### [1.1.0] — 2026-05-07

### Added

- **Syntax highlighting** in the Code tab of ProblemModal — regex-based tokenizer for Python, JavaScript, TypeScript, Java, C++, C, Go, Rust, Kotlin, Swift; keywords in blue, strings in green, comments in gray, numbers in amber, types in purple.
- **`src/lib/syntax-highlight.js`** — new module with `highlightCode(code, lang)` and `cleanCode(code)` helpers; no external dependencies, works inside the extension's strict CSP.
- **Mermaid diagram rendering** via [mermaid.ink](https://mermaid.ink) — renders diagrams as images without loading external scripts (previously blocked by extension CSP). Includes a "View in Mermaid Live" fallback link.
- **Vertical-first Mermaid layout** — flowcharts and graph diagrams without an explicit direction, or with LR/RL, are automatically rewritten to TD (top-down) for more readable AI-generated diagrams.
- **Extension handshake v2** — `presence-marker.js` now dispatches a `CODELEDGER_HANDSHAKE` CustomEvent (in addition to the existing DOM marker) carrying the browser-specific `chrome-extension://` / `moz-extension://` library URL. Works on Chrome, Edge, Brave, and Firefox.
- **Session-persistent install detection** — `landing.js` caches the handshake in `sessionStorage` to avoid the "flash of install link" on page refresh.
- **Firefox + all Chromium support** for the handshake: `presence-marker.js` uses `browser.*` when available, falls back to `chrome.*`.
- **`AICommandPalette` scroll** — pressing ArrowDown/ArrowUp now scrolls the active item into view inside the dropdown list.
- **Landing page improvements**
  - Browser badges (Chrome/Brave/Edge, Firefox, GitHub Releases) dynamically linked from `config.json`
  - FAQ section (8 questions covering privacy, AI, platforms, BYOK)
  - Stats strip (platforms, AI providers, servers that see your code = 0)
  - JSON-LD structured data (`SoftwareApplication`) for better search indexing
  - Extended Open Graph and Twitter Card metadata
  - Extension-detected indicator ("Extension installed and ready") badge
  - Data attributes (`data-cl-show-when-installed`, `data-cl-hide-when-installed`) for dynamic UI based on install state
  - OpenRouter added to BYOK pills

### Fixed

- **Copy issue with whitespace visualization characters** — Monaco editor (LeetCode) injects U+00B7 (middle dot) and U+200C (zero-width non-joiner) as visible space indicators. `cleanCode()` strips these before display and before writing to clipboard, so copied code is clean.
- **Mermaid showed only raw code** — CDN script injection was blocked by extension CSP; replaced with `mermaid.ink` image approach; code-block fallback now also provides an external link.
- **Double-escaping in markdown tables** — fixed in previous sprint; tables now render properly.
- **KaTeX CSP violation** — fixed in previous sprint; math blocks render as styled code spans.

### Changed

- Extension version bumped to **1.1.0** in `manifest.json` and `package.json`.
- `mermaid-stub.js` — completely rewritten; no longer attempts CDN script injection.
- `presence-marker.js` — now dispatches both DOM marker and CustomEvent for maximum reliability.
- `landing.js` — extended with sessionStorage caching and CustomEvent listener.
- `index.html` — substantially expanded with FAQ, stats, browser badges, and SEO improvements.

---

### [1.0.0] — 2026-04 (Initial Release)

### Added

- Core extension: LeetCode, GeeksForGeeks, and Codeforces platform handlers
- GitHub integration via OAuth + Trees API (atomic multi-file commits)
- AI code review (Gemini, OpenAI, Claude, DeepSeek, Ollama, OpenRouter)
- Problem library (extension sidebar + standalone web app)
- Analytics dashboard: heatmap, topic radar, difficulty donut, solve velocity, drilldown
- Knowledge graph: force-directed, topic-linked problem network
- Floating AI panel and timer on problem pages
- AI chat with `/mycode`, `/problem`, `/errors` slash commands and `@platform` mentions
- Multi-language AI input with command palette dropdown
- Behavior bank for passive interaction tracking (opt-out)
- Settings UI: General, AI, Git, Platforms, Backups, Advanced panels
- Backup system: manual JSON export, scheduled snapshots, on-solve snapshots
- Service worker: solve event pipeline, sync engine, alarm manager
- Cross-device sync via GitHub `index.json`
- First-run defaults: all AI providers disabled until user adds keys
- Full Chrome + Firefox support via `browser-compat.js` shim

---

<!-- Add new releases above this line -->

Release tags and their attached builds: <https://github.com/Life-Experimentalist/CodeLedger/releases>
