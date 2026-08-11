# Chrome Web Store — Submission Copy

## Short Description (132 chars max)

> Your DSA journey, committed. Auto-commit solved LeetCode, GFG and Codeforces problems to GitHub with AI review, streaks and stats.

---

## Category

**Developer Tools**

---

## Long Description (4000 chars max)

**CodeLedger — Your DSA grind, on your GitHub. Automatically.**

Solve a problem on LeetCode. The instant it's accepted, CodeLedger commits it to your GitHub repo — solution file, problem description, AI code review, runtime stats, and all. Your GitHub contribution graph fills up with real, attributed work. No manual steps. No copy-pasting.

---

**WHAT YOU GET**

⚡ Zero-click commits
Every accepted submission creates a single atomic git commit in your own GitHub repo — the moment it's accepted.

📥 Bulk LeetCode import
Already have hundreds of solutions? Import your entire LeetCode history from your Progress page in one click. All past accepted solutions committed with clean paths, problem descriptions, and stats.

🤖 AI code review
Connect any AI provider API key and get time/space complexity analysis, optimization suggestions, and hints committed alongside your code. Supports Google Gemini (free tier), OpenAI, Anthropic Claude, DeepSeek, Ollama (local), and OpenRouter.

📊 Live analytics dashboard
A GitHub-style contribution heatmap, topic radar, difficulty breakdown, and solve velocity chart — all hosted on your own GitHub Pages, built from your own data.

🕸️ Knowledge graph
A force-directed graph of everything you've solved, linked by topic. Spot your strengths and coverage gaps instantly.

💬 AI chat panel
A floating AI chat on every problem page. Ask about complexity, request hints, paste errors — with your code pre-loaded via /mycode. Supports slash-command autocomplete.

🧠 AI Behaviour Bank
Personal memory for your AI assistant. Save insights, define custom skills that trigger on command, and build a learning roadmap that auto-injects context into every conversation.

🔥 Streaks that survive real life
A daily target you set yourself, points weighted by difficulty, and freezes you earn on heavy days so one missed evening does not erase a month. Going away? Vacation mode holds the streak. Fell off anyway? Solve a little extra and take the day back. Badges are drawn as SVG files committed to your own repo — no third-party image service, and they work in a private repo.

👥 Party comparison
Add a friend's public CodeLedger repo and see your numbers side by side. It is one-sided by design: adding someone does not require them to add you, and nobody is notified. Share a link and it opens for anyone, extension or not.

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
problems/two-sum/leetcode/lc-two-sum.md ← description + AI review + stats
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

> CodeLedger automatically detects when a user solves a DSA problem on LeetCode, GeeksForGeeks, or Codeforces and commits their solution code to a GitHub repository they own. Every other feature — AI review, analytics, cross-device sync, the knowledge graph, streak badges, and the optional comparison against a friend's public ledger — reads from or writes to that same repository and exists only to serve that single commit workflow.

---

### Permission Justifications

**storage**

> Stores the user's GitHub repository settings, OAuth token reference, problem cache, AI provider configuration, and sync state locally in the browser. If the user opts in to anonymous usage stats (disabled by default), a solve-event counter `{ platform, version }` is sent to `counter.vkrishna04.me`. No other data leaves the browser.

**alarms**

> Schedules the periodic repository sync check (every 30 minutes) and the batched maintenance commit (every 10 minutes) that push new solutions to the user's own GitHub repository. Two further alarms drain the AI-review and code-recovery queues; they are created only while a queue actually has work and are cleared when it empties, so the extension does not wake in the background with nothing to do.

**sidePanel**

> Hosts the CodeLedger Library panel, which lets users browse all saved solutions, view analytics, explore the knowledge graph, and manage sync settings — all without navigating away from the current coding platform tab.

**tabs**

> Required to detect changes to the browser tab URL during the GitHub OAuth login flow (on our secure domain codeledger.vkrishna04.me) and query active library tabs to automatically refresh the problem list when a solution is committed.

**Host permissions**

> • `*.leetcode.com`, `*.geeksforgeeks.org`, `*.codeforces.com` — content scripts detect accepted submissions and inject UI on these platforms.
> • `api.github.com` — commits solution files to the user's own repository via the GitHub Trees API.
> • `codeledger.vkrishna04.me` — starts the GitHub OAuth sign-in flow and serves the shared canonical problem-ID map.
> • `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`, `api.deepseek.com`, `openrouter.ai`, `localhost:11434` — AI code review providers; only contacted if the user has enabled AI review and entered their own API key for that provider.
>
> No host permission is requested for `raw.githubusercontent.com`. If the user adds a friend's repository to the party comparison, the extension reads that repository's public `badges/stats.json` with an ordinary anonymous `fetch` — GitHub serves it with `Access-Control-Allow-Origin: *`, so no permission is needed and no credential is sent. An empty friend list makes no such request.

---

### Remote Code

**No, I am not using Remote code**

**Justification:**

> All JavaScript—including external libraries such as Preact, htm, and Chart.js—is bundled statically inside the extension package under `src/vendor/`. No `<script>` tags reference external URLs, and no dynamic evaluation functions (`eval()` or `new Function()`) are used.

---

### Data Usage Checkboxes

| Category                            | Check?  | Reason                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personally identifiable information | **No**  | No name, address, email, or ID is collected.                                                                                                                                                                                                                                                                                    |
| Health information                  | **No**  | Not applicable.                                                                                                                                                                                                                                                                                                                 |
| Financial and payment information   | **No**  | Not applicable. CodeLedger is free.                                                                                                                                                                                                                                                                                             |
| Authentication information          | **Yes** | The extension uses GitHub OAuth to commit solved problems to the user's repository. The access token is stored securely in the browser's local storage (`chrome.storage.local`) and is sent only to the official GitHub API (`api.github.com`). No credentials or tokens are ever sent to or stored on the developer's servers. |
| Personal communications             | **No**  | Not applicable.                                                                                                                                                                                                                                                                                                                 |
| Location                            | **No**  | No IP, GPS, or region data is collected.                                                                                                                                                                                                                                                                                        |
| Web history                         | **No**  | Content scripts run only on the three configured coding platforms; no general browsing history is accessed.                                                                                                                                                                                                                     |
| **User activity**                   | **Yes** | If the user opts in to "Anonymous Usage Stats" (off by default), a solve hit carrying only `{ platform: "leetcode", version: "1.7.0" }` is sent to `counter.vkrishna04.me`. No clicks, scrolls, or keystrokes. Anonymous, no user identifier.                                                                                   |
| Website content                     | **No**  | Submitted code is read from the platform DOM and committed to the user's own GitHub repo only — never sent to the developer.                                                                                                                                                                                                    |

**Certifications — all three apply:**

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** `https://codeledger.vkrishna04.me/privacy`

---

## CWS Reviewer Notes

No remote code. All libraries (Preact, htm, Chart.js) are committed under `src/vendor/` as esbuild bundles built from npm — they are readable source in the package, not minified CDN drops. No `<script src>` points off-origin, and no `eval()` or `new Function()` is used anywhere.
OAuth: this is a **classic OAuth App**, not a GitHub App. The token is proxy-exchanged via `codeledger.vkrishna04.me`, saved only in local storage, and sent directly to `api.github.com`. The worker retains nothing and signs the OAuth `state` into an `HttpOnly` cookie it verifies on the callback.
Repository creation: the extension calls `POST /user/repos` with the user's own OAuth token. Sign-in asks for `public_repo,workflow` — least privilege, and enough to create the public ledger that is the default. The "make it private" tick box is disabled unless the token actually carries `repo`; choosing private re-runs sign-in asking for `repo,workflow` rather than calling the API and letting GitHub answer a bare 403 several steps later. If sign-in ever returns a GitHub-App-shaped token (which cannot create repositories at all), the callback detects it and says so at sign-in rather than letting it surface later as a permission error.
Telemetry: disabled by default (opt-in). If enabled, POSTs `{ version, platform }` to `counter.vkrishna04.me`; the event name is a path segment, not a field. No code, IDs, repository names or problem data.
Party comparison: off until the user adds a repository. It then reads that public repository's `badges/stats.json` anonymously from `raw.githubusercontent.com`. Nothing is uploaded and the other person is not contacted.
Diagnosing a failed setup: **Settings → Advanced → Connection check** runs the same four steps a commit does — token stored, token accepted by GitHub and what it grants, repository visible and writable, last commit present — and reports each one separately with the action that fixes it. If a review of this build hits a repository-creation failure, that panel names the cause.

---

## Keywords / Tags

leetcode, github, dsa, competitive programming, code review, ai, automation, solutions, algorithms, developer tools

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
