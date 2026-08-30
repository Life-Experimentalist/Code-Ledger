# Microsoft Edge Add-ons — Submission Copy

## Notes for Certification

_(paste into the "Notes for certification" field — must be under 2,000 characters)_

CodeLedger detects accepted DSA submissions on LeetCode, GeeksForGeeks, Codeforces, NeetCode and takeuforward and commits the solution code to the user's own GitHub repository via the GitHub Trees API.

**To test:**

1.  Load the extension and click the toolbar icon.
2.  Click "Connect GitHub" — this redirects to GitHub OAuth via our Cloudflare Worker proxy at codeledger.vkrishna04.me/api/auth/github. The worker exchanges the code for a token and passes it back to the extension; it does not store the token.
3.  Set a repository name in Settings. The repo is created automatically on first solve.
4.  Navigate to leetcode.com, solve an Easy problem (e.g. "Two Sum"), submit, and wait for the Accepted verdict.
5.  Within ~3 seconds a commit should appear in the configured GitHub repo.

**Permission notes:**

- storage: persists settings, OAuth token, and problem cache locally. Four destinations are reached without a host permission, each an anonymous CORS-permitted GET or POST: counter.vkrishna04.me (opt-in telemetry, off by default, { platform, version } only); raw.githubusercontent.com (a friend's public stats for the party comparison, a fallback read of the user's own index.json and of the canonical map, and the shields endpoint files); img.shields.io (opt-in badge style, embedded as an image URL in the user's README); mermaid.ink (one diagram's source, only when the user presses Render on an AI reply).
- unlimitedStorage: local backup snapshots of the user's own solve history exceed the 10 MB `storage.local` cap past a few hundred solutions. No new data is read.
- alarms: cross-device sync every 30 min, a batched maintenance commit every 10 min, an hourly local redraw of the toolbar streak badge, queue-drain alarms that exist only while a queue has work, and a one-shot alarm that resumes an interrupted bulk import.
- sidePanel: CodeLedger Library panel (solve history, analytics, knowledge graph).
- tabs: watches the tab URL during the GitHub OAuth redirect on codeledger.vkrishna04.me, and finds open Library tabs to refresh after a commit.
- Host permissions: leetcode/gfg/codeforces/neetcode.io/takeuforward.org for content scripts; api.github.com for commits; AI provider APIs only contacted when user has configured that provider with their own key; localhost:11434 for local Ollama only. NeetCode and takeuforward discard their verdict from the DOM before it can be read, so on those two hosts only, a second content script reads the page's own judge response to get the verdict, source and language.

**No remote code.** All JS (Preact, htm, Chart.js, vis-network) is bundled in src/vendor/ from npm, with BUILD.md giving the command that reproduces each file. No eval(), no external script tags.

Full source: github.com/Life-Experimentalist/Code-Ledger

---

## Extension Name

Code Ledger

## Short Description (150 chars max)

> Auto-commit solved LeetCode, GeeksForGeeks, Codeforces, NeetCode and takeuforward problems to your own GitHub — with AI review and streaks.

---

## Long Description

**CodeLedger — Your DSA grind, on your GitHub. Automatically.**

Every time you solve a LeetCode problem and it's accepted, CodeLedger commits it to your own GitHub repository — solution file, problem description, AI code review, and performance stats — in a single atomic git commit. Your GitHub contribution graph fills up with real work. No manual steps, no copy-pasting.

**KEY FEATURES**

**⚡ Zero-click commits**
Accepted submissions are committed the instant they're accepted via the GitHub Trees API. One commit, all files, atomic.

**🌐 Five platforms**
LeetCode, GeeksForGeeks, Codeforces, NeetCode and takeuforward. LeetCode and GeeksForGeeks are stable; the other three are marked beta in the extension. takeuforward is the least exercised of them: its judge is behind a TUF+ subscription we have not held, so the accepted-verdict shape there is inferred rather than observed, and the detector is written conservatively to match. The free sheets do work without a subscription — they are marked up with what you have already solved, and since they link out to other sites, a solve is normally committed from wherever you actually solved it.

**📥 Bulk history import**
Already have hundreds of solutions? Import your LeetCode, GeeksForGeeks or Codeforces history in one click, dated when you actually solved each problem. Codeforces publishes which problems you solved and when, but not the code, so those arrive as dated entries with an empty solution.

**🤖 AI code review**
Connect any AI provider and get complexity analysis, optimization hints, and suggestions committed alongside your code. Supports Google Gemini (free tier), OpenAI, Claude, DeepSeek, Ollama, and OpenRouter.

**📊 Live dashboard**
A GitHub-style heatmap, difficulty breakdown, and solve velocity chart, published to your own GitHub Pages and built from your own data. The topic radar sits with them in the extension's own Analytics view.

**🕸️ Knowledge graph**
A force-directed graph linking all your solves by topic. Spot coverage gaps instantly.

**💬 AI chat panel**
Floating AI assistant on every problem page with slash commands (/mycode, /problem, /errors).

**🔥 Streaks that survive real life**
A daily target you set, points weighted by difficulty, and freezes you earn on heavy days. Vacation mode holds the streak while you are away; a missed day can be taken back by solving a little extra. Badges are SVG files committed to your own repo, so they work in a private repository with no image service involved. A shields.io badge style is available as an opt-in; those are fetched by shields.io and so need a public repo.

**👥 Party comparison**
Add a friend's public CodeLedger repo and see your numbers side by side. One-sided by design — adding someone needs nothing from them, and nobody is notified. Your own streak card becomes a shareable link once your repo is public with GitHub Pages enabled; the card is a file in that repo, so a private repo has nothing to link to.

**🔒 Private by default**
Out of the box your code goes to your GitHub repo and nowhere else. No external dashboards, no scraping, open-source Apache 2.0.

**PRIVACY**

CodeLedger never stores your code or GitHub token externally. OAuth is handled via a transparent Cloudflare Worker proxy — the token goes directly to your browser. Everything beyond your own repo is a choice you make: AI review sends your solution to the provider you picked with your own key, and shields.io badges are an opt-in alternative to the self-hosted ones. Settings → Privacy lists every destination live, computed from your own configuration. Full source at github.com/Life-Experimentalist/Code-Ledger.

**SETUP (2 MINUTES)**

1. Click the CodeLedger icon → Connect GitHub
2. Set a repo name — created automatically
3. Solve a problem. Check your GitHub. Done.

---

## Category

**Developer Tools**

## Privacy Policy URL

https://codeledger.vkrishna04.me/privacy

## Website URL

https://codeledger.vkrishna04.me

## Support URL

https://github.com/Life-Experimentalist/Code-Ledger/issues

---

## Edge Add-ons Store — Privacy & Permissions Form

### Single Purpose Description

CodeLedger automatically detects accepted DSA problem submissions on LeetCode, GeeksForGeeks, Codeforces, NeetCode and takeuforward and commits the solution code, problem metadata, and optional AI review to the user's own GitHub repository via the GitHub Trees API.

---

### Permission Justifications

**storage**
Required to persist user settings (GitHub repository name and owner, AI provider preferences, OAuth tokens, and per-problem solve history in IndexedDB). This permission transmits nothing by itself. By default the data leaves the device only for the user's own GitHub repository; every further destination is one the user turns on, and each is listed under Host permissions below or in the storage note in the certification section. The one endpoint the developer operates is the opt-in telemetry counter, which is off by default and receives `{ platform, version }` and nothing else — no code, no tokens, no problem data, no identifier.

**unlimitedStorage**
Required so the local backups are not truncated by the 10 MB `storage.local` cap. The extension keeps up to sixteen snapshots of the user's own solve history on the device — ten manual, five automatic, one always-current — and each holds the full source of every solution. Past a few hundred solutions those writes begin to fail, which silently disables the recovery path. The permission grants no access to anything new; it only lets the user's existing data be stored whole.

**alarms**
Required to schedule periodic work via `chrome.alarms`: a cross-device sync check every 30 minutes that reads the user's own GitHub repository index for solutions committed from another device, and a maintenance commit every 10 minutes that batches pending writes into one commit. Three further alarms drain the AI-review, code-recovery and self-heal queues; each exists only while its queue has work and is cleared when it empties. One hourly alarm redraws the streak count on the toolbar icon from local data, with no network request. A seventh is a one-shot 45-second alarm that resumes a bulk history import the user started and that was interrupted when the service worker was suspended; it is created only when such an import is pending.

**tabs**
Required to observe the browser tab URL during the GitHub sign-in flow on `codeledger.vkrishna04.me`, so the extension knows when the OAuth redirect has completed, and to find open Library tabs in order to refresh the problem list after a commit. No browsing history is read and no other tab's URL is inspected.

**sidePanel**
Required to display the CodeLedger Library panel — a full-page view of the user's solve history, analytics dashboard (contribution heatmap, topic radar, difficulty charts), knowledge graph, and AI chat history — accessible as a side panel without leaving the current problem page.

**Host permissions**

- `*://*.leetcode.com/*`, `*://*.geeksforgeeks.org/*`, `*://*.codeforces.com/*`, `*://*.neetcode.io/*`, `*://*.takeuforward.org/*` — Content scripts observe DOM changes on these platforms to detect when a submission is accepted. The only data read from these pages is the user's own submitted code and problem metadata (title, difficulty, tags), which is then committed to the user's own GitHub repo.
- NeetCode and takeuforward need one extra mechanism, on those two hosts and nowhere else. Both are single-page apps that render the judge's verdict into a React tree and discard it on navigation, so there is no node for a DOM watcher to find. A second content script on those two hosts wraps `fetch` and `XMLHttpRequest` and forwards a response only when its URL matches a short fixed list: those two sites' own judge endpoints, plus takeuforward's problem-metadata endpoint — its API replaces `difficulty` and `topic_tags` with the literal text "Subscribe to TUF+" unless the page's own bearer token is attached, so reading the page's response is the only way to record a real difficulty. Every other request is passed through untouched and never read, request headers are never forwarded (that is where the session cookie and the bearer token are), and no request or response is modified. The source is `src/content/net-tap.js`, and the endpoint list is the `ENDPOINTS` array at the top of it.
- `https://api.github.com/*` — Required to commit solutions to the user's GitHub repository via the Trees API, read repository state for cross-device sync, and look up repository/user metadata during onboarding.
- `*://codeledger.vkrishna04.me/*` — Three things. The extension opens this page to start OAuth and listens for the resulting token message; it fetches the shared canonical problem-ID map from this origin; and a small content script on the landing page announces that the extension is installed, so the page can link into the library rather than offer an install button to somebody who already has it.
- `https://api.openai.com/*`, `https://api.anthropic.com/*`, `https://generativelanguage.googleapis.com/*`, `https://api.deepseek.com/*`, `https://openrouter.ai/*` — Required to call AI providers for optional AI code review. Each endpoint is only contacted if the user has explicitly configured and enabled that provider. The user's solution code forms part of that request, which is why AI review does nothing until a key is entered. API keys are stored locally via `chrome.storage.local` and never transmitted to the extension developer.
- `http://localhost:11434/*` — Required to call a locally-running Ollama instance for users who opt for a fully local AI provider. Only contacted when Ollama is selected and a local server is running.

Three origins are reached with no host permission, because each is an anonymous cross-origin `GET` the server answers with `Access-Control-Allow-Origin: *`. No credential is attached to any of them.

- `raw.githubusercontent.com` — four uses: a friend's public `badges/stats.json` for the party comparison (nothing is requested with an empty friend list); a fallback read of the user's own `index.json` during sync, used only when the authenticated API read returns nothing; a fallback source for the canonical problem-ID map when the worker is unreachable; and the shields endpoint files, when shields badges are enabled.
- `img.shields.io` — off by default. Enabling shields badges embeds `img.shields.io/endpoint?url=…` images in the user's README pointing at those public endpoint files. shields.io reads them; the extension embeds a URL and uploads nothing.
- `mermaid.ink` — off unless pressed. An AI reply containing a diagram is shown as source with a Render button; pressing it sends that one diagram's source, which describes the shape of a solution but not its code. Nothing is sent if the button is never pressed.

---

### Remote Code

**No** — the extension contains no remote code. All JavaScript (including Preact, htm, Chart.js and vis-network) is bundled inside the extension package under `src/vendor/`. Each generated file carries a header naming its generator script and npm version, and `BUILD.md` gives the command that reproduces it. No `<script>` tags reference external URLs, no `eval()` or `new Function()` is used, and no Wasm is fetched at runtime. Strict CSP is enforced.

_Justification (for the form field):_ All JavaScript is shipped inside the extension package. Preact, htm, Chart.js and vis-network are vendored locally under `src/vendor/` as esbuild bundles built from npm. No external scripts are referenced or evaluated at runtime.

---

### Data Usage

**What user data do you plan to collect from users now or in the future?**

Answer for each category in the Edge form:

| Category                            | Collected?            | Notes                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personally identifiable information | **No**                | No name, address, email, age, or ID number is collected or transmitted to the developer.                                                                                                                                                                                                                                        |
| Health information                  | **No**                | Not applicable.                                                                                                                                                                                                                                                                                                                 |
| Financial and payment information   | **No**                | No payment data is collected. CodeLedger is free and open-source.                                                                                                                                                                                                                                                               |
| Authentication information          | **Yes**               | The extension uses GitHub OAuth to commit solved problems to the user's repository. The access token is held in the browser's extension-local storage (`chrome.storage.local`), readable only by this extension and not additionally encrypted by it, and is sent only to the official GitHub API (`api.github.com`). No credentials or tokens are ever sent to or stored on the developer's servers. |
| Personal communications             | **No**                | Not applicable.                                                                                                                                                                                                                                                                                                                 |
| Location                            | **No**                | No region, IP, GPS, or proximity data is collected.                                                                                                                                                                                                                                                                             |
| Web history                         | **No**                | Content scripts run only on the five configured coding platforms (LeetCode, GeeksForGeeks, Codeforces, NeetCode, takeuforward). No browsing history outside those domains is accessed.                                                                                                                                          |
| User activity                       | **Yes (opt-in only)** | If the user explicitly enables "Anonymous Usage Stats" in Settings → Advanced (off by default), the extension sends `{ platform: "leetcode", version: "x.y.z" }` to `counter.vkrishna04.me` when a problem is solved. No clicks, scrolls, keystrokes, or other activity is tracked.                                             |
| Website content                     | **Yes**               | The extension reads the user's own submitted code from the platform page and commits it to the user's own GitHub repository. It is never sent to the developer. It does reach a third party in cases the user enables: turning on AI review with their own API key sends the solution to that provider, and pressing Render on an AI diagram sends that diagram's source to `mermaid.ink`.                                                    |

**Privacy policy URL:** https://codeledger.vkrishna04.me/privacy

The extension is open-source (Apache 2.0): `https://github.com/Life-Experimentalist/Code-Ledger`

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

The store form takes a URL, and the URL is the one to give:
`https://codeledger.vkrishna04.me/privacy`.

If a reviewer asks for the text inline, paste [`PRIVACY.md`](../../PRIVACY.md)
from the repository root. That file and the page at `/privacy` are the only two
copies, and they are kept in step with each other and with
`src/core/privacy-disclosure.js`, which is what the extension renders live under
**Settings → Privacy**. A third copy used to live here and had already drifted —
it still described a telemetry payload shape the code does not send — so it was
removed rather than maintained.
