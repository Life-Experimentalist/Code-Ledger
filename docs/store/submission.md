# Store submission

The process. The listing copy itself lives in one file per store — this document
does not repeat it, because a fourth copy is a fourth thing to keep true:

| Store            | Copy                                   |
| ---------------- | -------------------------------------- |
| Chrome Web Store | [chrome.md](chrome.md)                 |
| Microsoft Edge   | [edge.md](edge.md)                     |
| Firefox (AMO)    | [firefox-amo.md](firefox-amo.md)       |
| The GitHub repo  | [github-repo.md](github-repo.md)       |
| Launch posts     | [linkedin-posts.md](linkedin-posts.md) |

The privacy policy has exactly two copies: [`PRIVACY.md`](../../PRIVACY.md) and
the page at `https://codeledger.vkrishna04.me/privacy`. Both must agree with
`src/core/privacy-disclosure.js`, which is what the extension renders live under
**Settings → Privacy**. Give stores the URL.

Chrome and Edge are not yet published. Firefox is not yet published. The Chrome
listing was rejected once — see [Before you resubmit](#before-you-resubmit).

---

## Before you submit

### Build

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run format:check
```

```bash
npm run publish
```

`npm run publish` cleans, compiles the stylesheet, builds `dist/`, and writes the
Chrome, Firefox and source zips into `releases/`. Then confirm:

- [ ] `package.json`, `src/manifest-chromium.json` and `src/manifest-firefox.json`
      all carry the same version — `node dev/sync-manifests.js` is what makes that true
- [ ] `docs/CHANGELOG.md` has a dated section for this version
- [ ] `git status` is clean and the tag is pushed
- [ ] `unzip -t releases/*.zip` passes

### Security

- [ ] No credential anywhere in the tree. The OAuth client ID and secret live in
      Wrangler secrets and nowhere else — `npx wrangler secret list` from `worker/`
- [ ] OAuth tokens are in `auth.tokens`, never in `settings`
- [ ] AI keys are in `ai.keys`, never in `settings` and never in a committed file
- [ ] CSP is `script-src 'self'`; no inline script, no `eval`, no remote import
- [ ] The only outbound destinations are the ones listed in
      `src/core/privacy-disclosure.js`, and each is either required or user-enabled

### Functionality, against a real account

- [ ] Sign in with GitHub and let onboarding create a fresh repository
- [ ] Solve one problem on each of LeetCode, GeeksForGeeks and Codeforces; each
      lands as a commit
- [ ] Runtime and memory are captured
- [ ] An AI review runs when a key is present, and everything still works with no key
- [ ] The dashboard, the graph and the streak badges render from the committed data
- [ ] Settings survive a browser restart
- [ ] "Clear all data" empties local storage and IndexedDB

---

## Before you resubmit

The Chrome listing was rejected under **Inaccurate Description — Non functional**
after a reviewer hit a permission error creating the repository. The cause was
authentication registered as a **GitHub App** rather than a classic **OAuth App**:
GitHub Apps ignore the `scope` parameter and issue user-to-server tokens, which
get `403 Resource not accessible by integration` on `POST /user/repos`.

Check all of these before resubmitting:

- [ ] The client ID starts `Ov23li`. `Iv23li` (or `Iv1.`) means it is still a GitHub App
- [ ] `SESSION_SECRET` is set on the worker, or sign-in returns 500
- [ ] `curl -sf https://codeledger.vkrishna04.me/api/health` succeeds against the
      deployed worker, not a local one
- [ ] A brand-new GitHub account, with no prior authorisation, can sign in and
      have a repository created for it. That is the exact path the reviewer walked
- [ ] Every claim in the listing copy is true of the build being uploaded

---

## Legal and repository files

- [ ] `LICENSE.md` — Apache 2.0
- [ ] `PRIVACY.md` — linked from every store listing
- [ ] `SECURITY.md` — how to report a vulnerability
- [ ] `CODE_OF_CONDUCT.md`
- [ ] `README.md` — accurate about what ships
- [ ] No trademark use beyond nominative reference to LeetCode, GeeksForGeeks and
      Codeforces

## Store assets

Both stores want five screenshots and the icon set. `src/assets/images/` holds
the icons at 16, 32, 48 and 128 px, plus the social preview.

Suggested screenshots, in order: a contribution graph filled with real solves;
an accepted submission turning into a commit; the dashboard; the knowledge
graph; a streak badge in a README.

---

## After launch

- Watch both stores for reviews for the first week and answer them
- Ship security fixes ahead of anything else
- Keep `docs/CHANGELOG.md` current; the release workflow reads the tag, not the file
