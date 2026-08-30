# Chrome Web Store — Submission Copy

## Short Description (132 chars max)

> Your DSA journey, committed. Auto-commit solved LeetCode, GFG, Codeforces, NeetCode and takeuforward problems to your own GitHub.

---

## Category

**Developer Tools**

---

## Long Description (4000 chars max)

**CodeLedger — Your DSA grind, on your GitHub. Automatically.**

Solve a problem on LeetCode. The instant it's accepted, CodeLedger commits it to your GitHub repo — solution file, problem description, AI code review, runtime stats, and all. Your GitHub contribution graph fills up with real, attributed work. No manual steps. No copy-pasting.

---

**WORKS ON**

LeetCode, GeeksForGeeks, Codeforces, NeetCode and takeuforward. LeetCode and GeeksForGeeks are stable. Codeforces and NeetCode are marked beta in the extension — the flow is built and tested, with less exposure to real submissions than the two stable ones. takeuforward is beta for a stronger reason: its judge lives behind a TUF+ subscription that we have not held, so the shape of an accepted verdict there is inferred from the API's public behaviour rather than observed. The detector is written conservatively for that reason. What does work without a subscription is the free A2Z and SDE sheets, which are marked up with what you have already solved; the sheets link out to other sites, so a solve is normally committed from wherever you actually solved it.

---

**WHAT YOU GET**

⚡ Zero-click commits
Every accepted submission creates a single atomic git commit in your own GitHub repo — the moment it's accepted.

📥 Bulk history import
Already have hundreds of solutions? Import your LeetCode, GeeksForGeeks or Codeforces history in one click, dated when you actually solved each problem rather than today. Codeforces publishes which problems you solved and when, but not the code, so those arrive as dated entries with an empty solution.

🤖 AI code review
Connect any AI provider API key and get time/space complexity analysis, optimization suggestions, and hints committed alongside your code. Supports Google Gemini (free tier), OpenAI, Anthropic Claude, DeepSeek, Ollama (local), and OpenRouter.

📊 Live analytics dashboard
A GitHub-style contribution heatmap, difficulty breakdown, and solve velocity chart, published to your own GitHub Pages and built from your own data. The topic radar lives in the extension's own Analytics view alongside them.

🕸️ Knowledge graph
A force-directed graph of everything you've solved, linked by topic. Spot your strengths and coverage gaps instantly.

💬 AI chat panel
A floating AI chat on every problem page. Ask about complexity, request hints, paste errors — with your code pre-loaded via /mycode. Supports slash-command autocomplete.

🧠 AI Behaviour Bank
Personal memory for your AI assistant. Save insights, define custom skills that trigger on command, and build a learning roadmap that auto-injects context into every conversation.

🔥 Streaks that survive real life
A daily target you set yourself, points weighted by difficulty, and freezes you earn on heavy days so one missed evening does not erase a month. Going away? Vacation mode holds the streak. Fell off anyway? Solve a little extra and take the day back. Badges are drawn as SVG files committed to your own repo, so they work in a private repo with no third-party image service involved. If you would rather have shields.io-style badges, there is an opt-in that writes shields endpoint files instead; those are fetched by shields.io, so they need the repo to be public.

👥 Party comparison
Add a friend's public CodeLedger repo and see your numbers side by side. It is one-sided by design: adding someone does not require them to add you, and nobody is notified. Your own streak card can be shared as a link that opens for anyone, extension or not, once your repo is public and its GitHub Pages site is up — the card is a file in that repo, so a private repo has nothing to link to.

🔄 Cross-device sync
Your entire history synced via your own GitHub repo on every startup. Always current on every machine.

💾 Rolling backups
Automatic snapshots of your problems and settings committed to your repo. Full restore in one click.

🩺 A connection check that names the problem
When nothing is being committed, Settings → Advanced tells you which link in the chain is broken — the token, its permissions, the repository, or the push — and what to do about that one thing. No more "permission denied" for four different causes.

🔒 Private by default
Out of the box your data goes to your GitHub repo and nowhere else. No sign-ups, no dashboards on our servers, no scraping. Everything past that is a choice you make and can see: Settings → Privacy lists every destination live, computed from your own configuration. You own everything — plain files, Apache 2.0.

---

**REPOSITORY LAYOUT**

problems/two-sum/leetcode/lc-two-sum.py ← your code
problems/two-sum/leetcode/README.md ← description + AI review + stats
index.json ← machine-readable index
index.html ← live GitHub Pages dashboard
badges/ ← streak badges as plain SVG

The `two-sum` level is the canonical problem, so the same question solved on two
platforms lands under one folder. A problem with no canonical match uses its
platform id instead: `problems/lc-two-sum/lc-two-sum.py`.

---

**SETUP (2 MINUTES)**

1. Click the CodeLedger icon → Connect GitHub (OAuth, no token stored on our servers)
2. Set a repo name — CodeLedger creates it automatically
3. Solve a problem. Check your GitHub. Done.

Optional: add an AI provider key under Settings → AI for code reviews.

---

**PRIVACY**

Your code and GitHub token are never stored on our servers. The OAuth exchange happens through a Cloudflare Worker proxy — the token is passed directly to your browser and stored only in the extension's local storage; the server does not log or retain it.

The extension includes **optional, opt-in anonymous usage telemetry** (disabled by default). If you enable it in Settings → Advanced → Anonymous telemetry, it sends only `{ platform: "leetcode", version: "x.y.z" }` to our self-hosted counter at `counter.vkrishna04.me`. No code, no tokens, no problem data, no identifiers. Full source at github.com/Life-Experimentalist/Code-Ledger.

---

## CWS Privacy Form — Exact Answers

### Single Purpose Description

_(paste as-is into the form)_

> CodeLedger automatically detects when a user solves a DSA problem on LeetCode, GeeksForGeeks, Codeforces, NeetCode or takeuforward and commits their solution code to a GitHub repository they own. Every other feature — AI review, analytics, cross-device sync, the knowledge graph, streak badges, and the optional comparison against a friend's public ledger — reads from or writes to that same repository and exists only to serve that single commit workflow.

---

### Permission Justifications

**storage**

> Stores the user's GitHub repository settings, OAuth token reference, problem cache, AI provider configuration, and sync state locally in the browser. Nothing in local storage is transmitted by this permission itself. What the extension does send is listed under Host permissions below, and the live list for a given configuration is rendered in the extension under Settings → Privacy.

**unlimitedStorage**

> Lifts the 10 MB local-storage cap so the on-device backups fit. CodeLedger keeps up to sixteen local snapshots of the user's own solve history (ten they save by hand, five taken automatically, and one always-current copy), and each snapshot contains the full text of every solution they have written. A user with a few hundred solutions passes 10 MB, at which point the backups silently stop updating — the safety net they are relying on. No additional data is collected; the permission only allows the data the user already has to be stored in full.

**alarms**

> Schedules the periodic repository sync check (every 30 minutes) and the batched maintenance commit (every 10 minutes) that push new solutions to the user's own GitHub repository. Three further alarms drain the AI-review, code-recovery and self-heal queues; each is created only while its queue actually has work and is cleared when it empties, so the extension does not wake in the background with nothing to do. One hourly alarm redraws the streak count on the toolbar icon from data already in local storage, without any network request. A seventh fires once, 45 seconds out, to resume a bulk history import the user started and that was interrupted when the service worker was suspended; it is created only if such an import is actually pending.

**sidePanel**

> Hosts the CodeLedger Library panel, which lets users browse all saved solutions, view analytics, explore the knowledge graph, and manage sync settings — all without navigating away from the current coding platform tab.

**tabs**

> Required to detect changes to the browser tab URL during the GitHub OAuth login flow (on our secure domain codeledger.vkrishna04.me) and query active library tabs to automatically refresh the problem list when a solution is committed.

**Host permissions**

> • `*.leetcode.com`, `*.geeksforgeeks.org`, `*.codeforces.com`, `*.neetcode.io`, `*.takeuforward.org` — content scripts detect accepted submissions and inject UI on these platforms. NeetCode and takeuforward are single-page apps whose verdict is rendered and then discarded before a DOM watcher can read it, so on those two hosts — and only those two — a second content script wraps `fetch` and `XMLHttpRequest` and forwards a response only when its URL matches a short fixed list: those sites' own judge endpoints, plus takeuforward's problem-metadata endpoint, whose API replaces `difficulty` and `topic_tags` with the literal text "Subscribe to TUF+" unless the page's own bearer token is attached. Every other request is passed through untouched and never read, request headers are never forwarded, and nothing is modified. The source is `src/content/net-tap.js`; the endpoint list is the `ENDPOINTS` array at the top of it.
> • `api.github.com` — commits solution files to the user's own repository via the GitHub Trees API.
> • `codeledger.vkrishna04.me` — three things: it starts the GitHub OAuth sign-in flow, it serves the shared canonical problem-ID map, and a small content script on the landing page announces that the extension is installed so the page can link straight into the library instead of offering an install button to somebody who already has it.
> • `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`, `api.deepseek.com`, `openrouter.ai`, `localhost:11434` — AI code review providers; only contacted if the user has enabled AI review and entered their own API key for that provider. The user's solution code is part of that request, which is why AI review is off until a key is entered.
>
> Three destinations are reached without a host permission, because each is an anonymous cross-origin `GET` that the server answers with `Access-Control-Allow-Origin: *`. No credential is attached to any of them.
>
> • `raw.githubusercontent.com` — four uses. Reading a friend's public `badges/stats.json` for the party comparison (nothing happens with an empty friend list); a fallback read of the user's own `index.json` during sync, used only when the authenticated API read comes back empty; a fallback source for the canonical problem-ID map when the worker is unreachable; and, if the user turns on shields-style badges, the endpoint files shields.io itself fetches.
> • `img.shields.io` — off by default. Turning shields badges on embeds `img.shields.io/endpoint?url=…` images in the user's README, pointing at the endpoint files above. shields.io then reads those public files; the extension embeds a URL rather than uploading anything.
> • `mermaid.ink` — off unless pressed. An AI reply containing a diagram is shown as source with a Render button; pressing it sends that one diagram's source, which describes the shape of a solution but not its code, to be drawn. Nothing is sent if the button is never pressed.

---

### Remote Code

**No, I am not using Remote code**

**Justification:**

> All JavaScript—including the external libraries Preact, htm, Chart.js and vis-network—is bundled statically inside the extension package under `src/vendor/`. Each of those files carries a header naming the script that generated it and the npm version it came from, and `BUILD.md` gives the commands that reproduce them. No `<script>` tags reference external URLs, and no dynamic evaluation functions (`eval()` or `new Function()`) are used.

---

### Data Usage Checkboxes

| Category                            | Check?  | Reason                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personally identifiable information | **No**  | No name, address, email, or ID is collected.                                                                                                                                                                                                                                                                                    |
| Health information                  | **No**  | Not applicable.                                                                                                                                                                                                                                                                                                                 |
| Financial and payment information   | **No**  | Not applicable. CodeLedger is free.                                                                                                                                                                                                                                                                                             |
| Authentication information          | **Yes** | The extension uses GitHub OAuth to commit solved problems to the user's repository. The access token is held in the browser's extension-local storage (`chrome.storage.local`), which is readable only by this extension and is not additionally encrypted by it, and is sent only to the official GitHub API (`api.github.com`). No credentials or tokens are ever sent to or stored on the developer's servers. |
| Personal communications             | **No**  | Not applicable.                                                                                                                                                                                                                                                                                                                 |
| Location                            | **No**  | No IP, GPS, or region data is collected.                                                                                                                                                                                                                                                                                        |
| Web history                         | **No**  | Content scripts run only on the five configured coding platforms; no general browsing history is accessed.                                                                                                                                                                                                                      |
| **User activity**                   | **Yes** | If the user opts in to "Anonymous Usage Stats" (off by default), a solve hit carrying only `{ platform: "leetcode", version: "x.y.z" }` is sent to `counter.vkrishna04.me`. No clicks, scrolls, or keystrokes. Anonymous, no user identifier.                                                                                   |
| Website content                     | **Yes** | Submitted code is read from the platform page and committed to the user's own GitHub repo. It is never sent to the developer. It does go to a third party in one case the user turns on themselves: enabling AI review and entering an API key sends the solution to that provider for analysis. The optional Render button on an AI diagram likewise sends that diagram's source to `mermaid.ink`.                                                                        |

**Certifications — all three apply:**

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** `https://codeledger.vkrishna04.me/privacy`

---

## CWS Reviewer Notes

No remote code. All libraries (Preact, htm, Chart.js, vis-network) are committed under `src/vendor/` as esbuild bundles built from npm, each with a header naming its generator script and npm version; `BUILD.md` lists the command that reproduces every one of them. No `<script src>` points off-origin, and no `eval()` or `new Function()` is used anywhere.
OAuth: this is a **classic OAuth App**, not a GitHub App. The token is proxy-exchanged via `codeledger.vkrishna04.me`, saved only in local storage, and sent directly to `api.github.com`. The worker retains nothing and signs the OAuth `state` into an `HttpOnly` cookie it verifies on the callback.
Repository creation: the extension calls `POST /user/repos` with the user's own OAuth token. Sign-in asks for `public_repo,workflow` — least privilege, and enough to create the public ledger that is the default. The "make it private" tick box is disabled unless the token actually carries `repo`; choosing private re-runs sign-in asking for `repo,workflow` rather than calling the API and letting GitHub answer a bare 403 several steps later. If sign-in ever returns a GitHub-App-shaped token (which cannot create repositories at all), the callback detects it and says so at sign-in rather than letting it surface later as a permission error.
Telemetry: disabled by default (opt-in). If enabled, POSTs `{ version, platform }` to `counter.vkrishna04.me`; the event name is a path segment, not a field. No code, IDs, repository names or problem data.
Party comparison: off until the user adds a repository. It then reads that public repository's `badges/stats.json` anonymously from `raw.githubusercontent.com`. Nothing is uploaded and the other person is not contacted.
Diagnosing a failed setup: **Settings → Advanced → Connection check** runs the same four steps a commit does — token stored, token accepted by GitHub and what it grants, repository visible and writable, last commit present — and reports each one separately with the action that fixes it. If a review of this build hits a repository-creation failure, that panel names the cause.

---

## Keywords / Tags

leetcode, github, dsa, competitive programming, code review, ai, automation, solutions, algorithms, developer tools, neetcode, takeuforward, striver

---

## Screenshots Guidance

1. Before/after: empty GitHub profile vs. contribution graph full of solves
2. The auto-commit in action: accepted submission → GitHub commit appears
3. Live GitHub Pages dashboard (heatmap + charts)
4. Knowledge graph view
5. AI review committed alongside solution
6. Bulk import progress page

---

## End-User License Agreement (EULA) Text

_(Paste into EULA text field if requested)_

```markdown
# CodeLedger End-User License Agreement (EULA)

By installing or using the CodeLedger browser extension ("Software"), you agree to be bound by the terms of this End-User License Agreement.

## 1. Apache License 2.0

CodeLedger is open-source software distributed under the Apache License, Version 2.0 ("License").
You may obtain a copy of the License at:
http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

## 2. Preamble & Key Terms

- **Ownership**: You retain full ownership and control of all code, API credentials, and data processed by CodeLedger. All problem solver history and settings are stored locally in your browser.
- **Usage**: You are granted a non-exclusive, worldwide, royalty-free license to use, copy, modify, and distribute this Software in accordance with the Apache 2.0 License.

## 3. Disclaimer of Warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## 4. Limitation of Liability

IN NO EVENT SHALL THE COPYRIGHT HOLDERS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

---

## Privacy Policy Text

The Chrome Web Store form takes a URL, and the URL is the one to give:
`https://codeledger.vkrishna04.me/privacy`.

If a reviewer asks for the text inline, paste [`PRIVACY.md`](../../PRIVACY.md) from
the repository root. That file and the page at `/privacy` are the only two copies,
and they are kept in step with each other and with
`src/core/privacy-disclosure.js`, which is what the extension renders live under
**Settings → Privacy**. A third copy used to live here and had already drifted —
it still described a telemetry payload shape the code does not send — so it was
removed rather than maintained.
