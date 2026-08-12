# Firefox AMO — Submission Copy

## Add-on Name

Code Ledger

## Summary (250 chars max)

> Auto-commit solved LeetCode, GeeksForGeeks, Codeforces, NeetCode and takeuforward problems to your own GitHub repo — with AI code review, streaks, analytics, bulk history import, and cross-device sync. Zero extra steps.

---

## Description (AMO long description)

**Code Ledger — Your DSA grind, on your GitHub. Automatically.**

Solve a problem on LeetCode. The instant it's accepted, Code Ledger commits it to your GitHub repo — solution file, problem description, AI code review, and runtime stats — in a single atomic commit. Your contribution graph fills up with real work. No copy-pasting. No manual steps.

**FEATURES**

• Five platforms — LeetCode and GeeksForGeeks are stable; Codeforces, NeetCode and takeuforward are marked beta in the extension. On takeuforward the free A2Z and SDE sheets are marked up with what you have solved; its own code editor is part of TUF+, and the free sheets link out to other sites, so a solve is normally committed from wherever you actually solved it
• Zero-click commits — every accepted submission committed automatically via GitHub Trees API
• Bulk history import — bring your existing LeetCode, GeeksForGeeks or Codeforces history across in one run
• AI code review — 6 providers: Gemini (free), OpenAI, Claude, DeepSeek, Ollama, OpenRouter
• Live GitHub Pages dashboard — heatmap, topic radar, difficulty chart, solve velocity
• Knowledge graph — force-directed graph of all solves linked by topic
• AI chat panel — floating assistant on every problem page with /mycode, /problem, /errors commands
• AI Behaviour Bank — personal memory: insights, custom skills, learning roadmap
• Streaks — a daily target you set, difficulty-weighted points, freezes earned on heavy days, vacation mode, and SVG badges committed to your own repo (they work in a private repository)
• Party comparison — add a friend's public CodeLedger repo and compare side by side; one-sided, and nobody is notified
• Cross-device sync — history always current via your own GitHub repo
• Rolling backups — automatic snapshots with one-click restore
• Private by default — out of the box data goes to your repo only, and Settings → Privacy lists every optional destination live; open-source Apache 2.0

**SETUP**

1. Click the CodeLedger icon → Connect GitHub
2. Set a repo name
3. Solve a problem. Done.

**PRIVACY**

Your code and GitHub tokens are never stored on our servers. OAuth is handled via a Cloudflare Worker proxy (`codeledger.vkrishna04.me`) — the token passes through and is stored only in local extension storage; the server does not log or retain it.

The extension includes **optional, opt-in anonymous usage telemetry** (disabled by default). If you enable it in Settings → Advanced → Anonymous telemetry, it sends only `{ platform: "leetcode", version: "x.y.z" }` to `counter.vkrishna04.me` when a problem is solved — the event name is a path segment in the URL, not a field in the body. No code, no tokens, no problem data, no identifiers. You can verify this in the open source at github.com/Life-Experimentalist/Code-Ledger (`src/core/telemetry.js`).

---

## AMO Reviewer Notes

Thank you for reviewing CodeLedger.

### Quick Testing Steps:

1. Load extension as temporary add-on via `about:debugging`.
2. Click toolbar icon → Connect GitHub (OAuth flow via worker `codeledger.vkrishna04.me`).
3. Set a repository name in settings.
4. Navigate to leetcode.com, solve any Easy problem, and submit.
5. Verify an atomic commit containing code, description, and stats appears in your GitHub repo in ~3 seconds.

### Key Security & Compliance Disclosures:

- **No Remote Code:** All JS (Preact, htm, Chart.js) is bundled locally under `src/vendor/`. No CDNs, no `eval()`, and no `new Function()`.
- **OAuth Security:** GitHub OAuth token is exchanged via a Cloudflare Worker proxy (`codeledger.vkrishna04.me`) and returned directly to the browser. Tokens are saved only in local extension storage and never stored on the worker.
- **Strict Permission Scopes:**
  - `storage`: Persists settings, OAuth token, and IndexedDB solve cache locally.
  - `unlimitedStorage`: Local backup snapshots of the user's own solve history — up to sixteen, each holding the full source of every solution — outgrow the default `storage.local` cap past a few hundred solutions. Grants no access to any new data.
  - `alarms`: Schedules the 30-minute repository sync check and the 10-minute batched maintenance commit. Three further alarms drain the AI-review, code-recovery and self-heal queues; each is created only while its queue has work and cleared when it empties. One hourly alarm redraws the streak count on the toolbar icon from data already in local storage — it makes no network request. The streak SVG badges themselves are written into the user's own repository as part of each commit; the optional GitHub Action the extension can install there only refreshes them on days with no solve.
  - `tabs`: Detects the OAuth callback URL and refreshes open library tabs after a commit. The extension does not request `scripting`; content scripts are declared statically in the manifest.
  - Host permissions (`leetcode.com`, `geeksforgeeks.org`, `codeforces.com`, `neetcode.io`, `takeuforward.org`): Content scripts observe the DOM on these five coding platforms to detect an accepted submission and to inject the extension's own UI. NeetCode and takeuforward are single-page apps that render the verdict and discard it before a DOM watcher can read it, so on those two hosts — and only those two — a second content script wraps `fetch` and `XMLHttpRequest` and forwards a response body only when its URL matches a short fixed list: those sites' own judge endpoints, plus takeuforward's problem-metadata endpoint, whose API replaces `difficulty` and `topic_tags` with the literal string "Subscribe to TUF+" unless the page's own bearer token is attached. Every other request passes through untouched and is never read, request headers are never forwarded, and nothing is modified. The source is `src/content/net-tap.js`; the endpoint list is the `ENDPOINTS` array at the top of that file.
  - Host permission `api.github.com`: Commits files directly to the user's repo.
  - Host permission `codeledger.vkrishna04.me`: Starts the OAuth sign-in flow and serves the shared canonical problem-ID map.
  - Host permissions for AI providers (`api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`, `api.deepseek.com`, `openrouter.ai`, `localhost:11434`): Contacted only for the provider the user configured a key for.
  - The Firefox build declares only `storage`, `unlimitedStorage`, `alarms` and `tabs`; the Library uses `sidebar_action` rather than the Chromium `sidePanel` permission.
  - No host permission is declared for `raw.githubusercontent.com`. If the user adds a friend's repository to the optional party comparison, the extension reads that public repository's `badges/stats.json` with an anonymous `fetch`, which GitHub serves with `Access-Control-Allow-Origin: *`. Nothing is uploaded, no credential is attached, and an empty friend list makes no such request.
- **Opt-In Telemetry:** Disabled by default. If enabled under Settings → Advanced → Anonymous telemetry, it sends only `{ version: "x.y.z", platform: "leetcode" }` to `counter.vkrishna04.me`. No code, tokens, or identifiers are included. Reviewers can verify in `src/core/telemetry.js`.

---

## End-User License Agreement (EULA) Text

_(Paste into EULA text field)_

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

---

## Categories

Primary: **Developer Tools**
Secondary: **Productivity**

## Tags

leetcode, github, dsa, algorithms, automation, code-review, ai
