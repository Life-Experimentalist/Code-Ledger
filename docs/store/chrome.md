# Chrome Web Store — Submission Copy

## Short Description (132 chars max)

> Your DSA journey, committed. Auto-commit every accepted LeetCode solution to GitHub with AI review, analytics, and a live dashboard.

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

🔄 Cross-device sync
Your entire history synced via your own GitHub repo on every startup. Always current on every machine.

💾 Rolling backups
Automatic snapshots of your problems and settings committed to your repo. Full restore in one click.

🔒 Private by default
Out of the box your data goes to your GitHub repo and nowhere else. No sign-ups, no dashboards on our servers, no scraping. Everything past that is a choice you make and can see: Settings → Privacy lists every destination live, computed from your own configuration. You own everything — plain files, Apache 2.0.

---

**REPOSITORY LAYOUT (v3)**

problems/
lc-two-sum/
lc-two-sum.py ← your code
lc-two-sum.md ← description + AI review + stats
index.json ← machine-readable index
index.html ← live GitHub Pages dashboard

---

**SETUP (2 MINUTES)**

1. Click the CodeLedger icon → Connect GitHub (OAuth, no token stored on our servers)
2. Set a repo name — CodeLedger creates it automatically
3. Solve a problem. Check your GitHub. Done.

Optional: add an AI provider key under Settings → AI for code reviews.

---

**PRIVACY**

Your code and GitHub token are never stored on our servers. The OAuth exchange happens through a Cloudflare Worker proxy — the token is passed directly to your browser and stored only in the extension's local storage; the server does not log or retain it.

The extension includes **optional, opt-in anonymous usage telemetry** (disabled by default). If you enable it in Settings → Advanced → Anonymous telemetry, it sends only `{ event: "solve", platform: "leetcode", version: "x.y.z" }` to our self-hosted counter at `counter.vkrishna04.me`. No code, no tokens, no problem data, no identifiers. Full source at github.com/Life-Experimentalist/Code-Ledger.

---

## CWS Privacy Form — Exact Answers

### Single Purpose Description

_(paste as-is into the form)_

> CodeLedger automatically detects when a user solves a DSA problem on LeetCode, GeeksForGeeks, or Codeforces and commits their solution code to a GitHub repository they own. All other features (AI review, analytics, conflict sync, knowledge graph) exist solely to enrich that single commit workflow.

---

### Permission Justifications

**storage**

> Stores the user's GitHub repository settings, OAuth token reference, problem cache, AI provider configuration, and sync state locally in the browser. If the user opts in to anonymous usage stats (disabled by default), a solve-event counter `{ platform, version }` is sent to `counter.vkrishna04.me`. No other data leaves the browser.

**alarms**

> Schedules periodic background sync checks (every 30 minutes) to detect when new solutions need to be pushed to the user's GitHub repository, and to throttle AI review batches to avoid API rate limits.

**sidePanel**

> Hosts the CodeLedger Library panel, which lets users browse all saved solutions, view analytics, explore the knowledge graph, and manage sync settings — all without navigating away from the current coding platform tab.

**tabs**

> Required to detect changes to the browser tab URL during the GitHub OAuth login flow (on our secure domain codeledger.vkrishna04.me) and query active library tabs to automatically refresh the problem list when a solution is committed.

**Host permissions**

> • `*.leetcode.com`, `*.geeksforgeeks.org`, `*.codeforces.com` — content scripts detect accepted submissions and inject UI on these platforms.
> • `api.github.com` — commits solution files to the user's own repository via the GitHub Trees API.
> • `codeledger.vkrishna04.me` — starts the GitHub OAuth sign-in flow and serves the shared canonical problem-ID map.
> • `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`, `api.deepseek.com`, `openrouter.ai`, `localhost:11434` — AI code review providers; only contacted if the user has enabled AI review and entered their own API key for that provider.

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
| **User activity**                   | **Yes** | If the user opts in to "Anonymous Usage Stats" (off by default), a solve event `{ event: "solve", platform: "leetcode", version: "1.4.5" }` is sent to `counter.vkrishna04.me`. No clicks, scrolls, or keystrokes. Anonymous, no user identifier.                                                                               |
| Website content                     | **No**  | Submitted code is read from the platform DOM and committed to the user's own GitHub repo only — never sent to the developer.                                                                                                                                                                                                    |

**Certifications — all three apply:**

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** `https://codeledger.vkrishna04.me/privacy`

---

## CWS Reviewer Notes

No remote code. All libraries (Preact, Chart.js) are bundled in `src/vendor/`. No `eval()` used.
OAuth: Token is proxy-exchanged via `codeledger.vkrishna04.me`, saved only in local storage, and sent directly to `api.github.com`. Worker retains nothing.
Telemetry: Disabled by default (opt-in). If enabled, sends anonymous `{version, platform}` solve events to `counter.vkrishna04.me`. No code/IDs sent.

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

_(Paste into Privacy Policy text field if requested)_

```markdown
# Privacy Policy for CodeLedger

**Last updated**: 2026-06-22

CodeLedger is committed to protecting your privacy. The extension is designed so that your code, API keys, and access tokens belong entirely to you and stay on your device or in your own GitHub repository.

---

## 1. Data Collection & Local Storage

CodeLedger does not collect, store, or transmit any personal data to our own servers.

All extension data is stored **locally on your device** using your browser's IndexedDB and secure local storage:

- **Problem history**: Solved problem titles, code, runtime/memory stats, difficulty, and tags.
- **API Configuration**: GitHub repository settings, GitHub OAuth access tokens, and optional AI provider API keys.

---

## 2. Outbound Requests & Third-Party Services

CodeLedger communicates with external services only to perform its core functionalities, as described below:

### A. GitHub API (`api.github.com`)

- **Purpose**: Commits your solved problem files and updates your progress index directly in a repository you own.
- **Data Sent**: Your solution code, problem descriptions, and runtime statistics.
- **Privacy**: Governed by the [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement).

### B. Cloudflare Worker OAuth Proxy (`codeledger.vkrishna04.me`)

- **Purpose**: Temporary proxy used strictly to exchange your GitHub OAuth code for an access token.
- **Handling**: The token passes through the worker and is returned immediately to your browser. **No tokens, codes, or credentials are logged, saved, or retained** on our servers.
- **Privacy**: Governed by the [Cloudflare Privacy Policy](https://www.cloudflare.com/privacy/).

### C. Optional AI Code Review Providers

If you choose to enable AI reviews and provide your own API key, CodeLedger makes direct requests to your configured provider:

- **Supported Providers**: Google Gemini, OpenAI, Anthropic Claude, DeepSeek, and OpenRouter.
- **Data Sent**: The code and description of the solved problem.
- **Local Alternative**: You can use Ollama (`http://localhost:11434`) to run models locally on your machine, preventing any code from being sent to external AI servers.

### D. shields.io (Optional, Off by Default)

Streak and progress badges are generated as SVG files committed to your own repository, so by default no third party is involved in rendering them.

- **If you switch the badge style to shields** under **Settings → Streaks**, your README loads badge images from `shields.io`, which reads the numbers from a small JSON file in your repository.
- **Data Sent**: Your repository URL, and one request each time somebody views your README. No code, no tokens, no problem content.
- **Reversible**: Switching back to the self-hosted style stops it, and the SVG badges are always committed regardless of which style you use.

### E. mermaid.ink (Optional, One Click at a Time)

When an AI review contains a diagram, the extension displays its source together with a **Render diagram** button rather than drawing it automatically.

- **Purpose**: Turns a diagram's source into an image without loading any external script, which the extension's Content Security Policy would block in any case.
- **Data Sent**: The source of the single diagram you pressed Render on. It describes the shape of your solution but is not the solution code, and no token or account is involved.
- **Never automatic**: Nothing reaches `mermaid.ink` unless you press the button on that specific diagram.

---

## 2b. Public Repositories

If the ledger repository you commit to is **public** — which is what most people want, since it doubles as a portfolio — then your solutions, your solve history, your streak badges, and the generated GitHub Pages site can be read by anyone with the link. This is a property of the repository you chose, not something CodeLedger transmits anywhere extra. Making the repository private keeps all of it visible only to you and anyone you invite.

The extension shows this same list live under **Settings → Privacy**, computed from your actual configuration rather than written down, so it cannot fall out of date with what the extension does.

---

## 3. Telemetry (Optional, Opt-In Only)

CodeLedger includes anonymous usage telemetry which is **disabled by default** (`telemetryOptIn` is set to `false`).

If and only if you explicitly opt-in under **Settings → Advanced → Anonymous telemetry**:

- The extension sends a POST request to `https://counter.vkrishna04.me/api/v1/counter/solve/hit`.
- **Payload sent**: `{ event: "solve", platform: "leetcode", version: "x.y.z" }`
- **No identifiers, credentials, repository names, problem content, or code** are ever included in this telemetry payload.
- You can audit the implementation in our open-source codebase under `src/core/telemetry.js`.

---

## 4. User Rights & Data Deletion

- **Access**: You can view all stored data under the extension's "Sync" and "Settings" pages.
- **Deletion**: Uninstalling the extension completely purges all local storage and IndexedDB caches. You can also click **"Clear all data"** in the Settings tab to reset the extension.

---

## 5. Contact

For any questions regarding this policy, please email: **github@vkrishna04.me** or open an issue on our GitHub repository: **https://github.com/Life-Experimentalist/Code-Ledger/issues**.
```
