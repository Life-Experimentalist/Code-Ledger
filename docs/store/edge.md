# Microsoft Edge Add-ons — Submission Copy

## Notes for Certification
*(paste into the "Notes for certification" field — must be under 2,000 characters)*

CodeLedger detects accepted DSA submissions on LeetCode, GeeksForGeeks, and Codeforces and commits the solution code to the user's own GitHub repository via the GitHub Trees API.

**To test:**
 1. Load the extension and click the toolbar icon.
 2. Click "Connect GitHub" — this redirects to GitHub OAuth via our Cloudflare Worker proxy at codeledger.vkrishna04.me/api/auth/github. The worker exchanges the code for a token and passes it back to the extension; it does not store the token.
 3. Set a repository name in Settings. The repo is created automatically on first solve.
 4. Navigate to leetcode.com, solve an Easy problem (e.g. "Two Sum"), submit, and wait for the Accepted verdict.
 5. Within ~3 seconds a commit should appear in the configured GitHub repo.

**Permission notes:**
 - storage: persists settings, OAuth token, and problem cache locally. The only external call is opt-in anonymous telemetry (disabled by default) — sends { platform, version } to counter.vkrishna04.me only if user enables "Anonymous Usage Stats" in Settings → General.
 - alarms: periodic cross-device sync every 30 min and AI review rate-limiting.
 - sidePanel: CodeLedger Library panel (solve history, analytics, knowledge graph).
 - Host permissions: leetcode/gfg/codeforces for content scripts; api.github.com for commits; AI provider APIs only contacted when user has configured that provider with their own key; localhost:11434 for local Ollama only.

**No remote code.** All JS (Preact, Chart.js, htm) is bundled in src/vendor/. No eval(), no external script tags.

Full source: github.com/Life-Experimentalist/Code-Ledger

---

## Extension Name

Code Ledger

## Short Description (150 chars max)

> Auto-commit every accepted LeetCode solution to your GitHub — with AI review, live analytics, bulk import, and cross-device sync. Zero extra steps.

---

## Long Description

**CodeLedger — Your DSA grind, on your GitHub. Automatically.**

Every time you solve a LeetCode problem and it's accepted, CodeLedger commits it to your own GitHub repository — solution file, problem description, AI code review, and performance stats — in a single atomic git commit. Your GitHub contribution graph fills up with real work. No manual steps, no copy-pasting.

**KEY FEATURES**

**⚡ Zero-click commits**
Accepted submissions are committed the instant they're accepted via the GitHub Trees API. One commit, all files, atomic.

**📥 Bulk LeetCode import**
Already have hundreds of solutions? Import your entire LeetCode history from your Progress page in one click. Every accepted solution gets a clean path, problem description, and stats.

**🤖 AI code review**
Connect any AI provider and get complexity analysis, optimization hints, and suggestions committed alongside your code. Supports Google Gemini (free tier), OpenAI, Claude, DeepSeek, Ollama, and OpenRouter.

**📊 Live dashboard**
A GitHub-style heatmap, topic radar, difficulty breakdown, and solve velocity chart — hosted on your own GitHub Pages, built from your own data.

**🕸️ Knowledge graph**
A force-directed graph linking all your solves by topic. Spot coverage gaps instantly.

**💬 AI chat panel**
Floating AI assistant on every problem page with slash commands (/mycode, /problem, /errors).

**🔒 100% yours**
Data goes to your GitHub repo only. No external dashboards, no scraping, open-source Apache 2.0.

**PRIVACY**

CodeLedger never stores your code or GitHub token externally. OAuth is handled via a transparent Cloudflare Worker proxy — the token goes directly to your browser. Full source at github.com/Life-Experimentalist/Code-Ledger.

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

CodeLedger automatically detects accepted DSA problem submissions on LeetCode, GeeksForGeeks, and Codeforces and commits the solution code, problem metadata, and optional AI review to the user's own GitHub repository via the GitHub Trees API.

---

### Permission Justifications

**storage**
Required to persist user settings (GitHub repository name and owner, AI provider preferences, OAuth tokens, and per-problem solve history in IndexedDB). All data remains exclusively in local browser storage or the user's own GitHub repository. Nothing is transmitted to the extension developer.

**alarms**
Required to schedule periodic cross-device sync checks via `chrome.alarms`. The extension uses alarms to poll the user's own GitHub repository index for solutions committed from other devices, and to fire solve-streak reminder notifications if the user has enabled them.

**sidePanel**
Required to display the CodeLedger Library panel — a full-page view of the user's solve history, analytics dashboard (contribution heatmap, topic radar, difficulty charts), knowledge graph, and AI chat history — accessible as a side panel without leaving the current problem page.

**Host permissions**
- `*://*.leetcode.com/*`, `*://*.geeksforgeeks.org/*`, `*://*.codeforces.com/*` — Content scripts observe DOM changes on these platforms to detect when a submission is accepted. The only data read from these pages is the user's own submitted code and problem metadata (title, difficulty, tags), which is then committed to the user's own GitHub repo.
- `https://api.github.com/*` — Required to commit solutions to the user's GitHub repository via the Trees API, read repository state for cross-device sync, and look up repository/user metadata during onboarding.
- `https://api.gitlab.com/*` — Required for users who configure GitLab as their git provider instead of GitHub. Only contacted when the user has set up a GitLab repository.
- `https://api.openai.com/*`, `https://api.anthropic.com/*`, `https://generativelanguage.googleapis.com/*`, `https://api.deepseek.com/*` — Required to call AI providers for optional AI code review. Each endpoint is only contacted if the user has explicitly configured and enabled that provider. API keys are stored locally via `chrome.storage.local` and never transmitted to the extension developer.
- `http://localhost:11434/*` — Required to call a locally-running Ollama instance for users who opt for a fully local AI provider. Only contacted when Ollama is selected and a local server is running.

---

### Remote Code

**No** — the extension contains no remote code. All JavaScript (including Preact, Chart.js, and htm) is bundled inside the extension package under `src/vendor/`. No `<script>` tags reference external URLs, no `eval()` or `new Function()` is used, and no Wasm is fetched at runtime. Strict CSP is enforced.

*Justification (for the form field):* All JavaScript is shipped inside the extension package. Preact, Chart.js, and htm are vendored locally under `src/vendor/`. No external scripts are referenced or evaluated at runtime.

---

### Data Usage

**What user data do you plan to collect from users now or in the future?**

Answer for each category in the Edge form:

| Category                            | Collected?            | Notes                                                                                                                                                                                                                                                                                              |
| ----------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personally identifiable information | **No**                | No name, address, email, age, or ID number is collected or transmitted to the developer.                                                                                                                                                                                                           |
| Health information                  | **No**                | Not applicable.                                                                                                                                                                                                                                                                                    |
| Financial and payment information   | **No**                | No payment data is collected. CodeLedger is free and open-source.                                                                                                                                                                                                                                  |
| Authentication information          | **Yes**               | The extension uses GitHub OAuth to commit solved problems to the user's repository. The access token is stored securely in the browser's local storage (`chrome.storage.local`) and is sent only to the official GitHub API (`api.github.com`). No credentials or tokens are ever sent to or stored on the developer's servers. |
| Personal communications             | **No**                | Not applicable.                                                                                                                                                                                                                                                                                    |
| Location                            | **No**                | No region, IP, GPS, or proximity data is collected.                                                                                                                                                                                                                                                |
| Web history                         | **No**                | Content scripts run only on the three configured coding platforms (LeetCode, GeeksForGeeks, Codeforces). No browsing history outside those domains is accessed.                                                                                                                                    |
| User activity                       | **Yes (opt-in only)** | If the user explicitly enables "Anonymous Usage Stats" in Settings → General (off by default), the extension sends `{ event: "solve", platform: "leetcode", version: "1.4.5" }` to `counter.vkrishna04.me` when a problem is solved. No clicks, scrolls, keystrokes, or other activity is tracked. |
| Website content                     | **No**                | The extension reads the user's own submitted code from the platform DOM solely to commit it to the user's own GitHub repository. This data is never sent to the developer.                                                                                                                         |

**Privacy policy URL:** https://codeledger.vkrishna04.me/privacy

The extension is open-source (Apache 2.0): `https://github.com/Life-Experimentalist/Code-Ledger`

---

## End-User License Agreement (EULA) Text
*(Paste into EULA text field if requested)*

```markdown
# CodeLedger End-User License Agreement (EULA)

By installing or using the CodeLedger browser extension ("Software"), you agree to be bound by the terms of this End-User License Agreement.

## 1. Apache License 2.0
CodeLedger is open-source software distributed under the Apache License, Version 2.0 ("License"). 
You may obtain a copy of the License at:
http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

## 2. Preamble & Key Terms
*   **Ownership**: You retain full ownership and control of all code, API credentials, and data processed by CodeLedger. All problem solver history and settings are stored locally in your browser.
*   **Usage**: You are granted a non-exclusive, worldwide, royalty-free license to use, copy, modify, and distribute this Software in accordance with the Apache 2.0 License.

## 3. Disclaimer of Warranty
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## 4. Limitation of Liability
IN NO EVENT SHALL THE COPYRIGHT HOLDERS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

---

## Privacy Policy Text
*(Paste into Privacy Policy text field if requested)*

```markdown
# Privacy Policy for CodeLedger

**Last updated**: 2026-06-22

CodeLedger is committed to protecting your privacy. The extension is designed so that your code, API keys, and access tokens belong entirely to you and stay on your device or in your own GitHub repository.

---

## 1. Data Collection & Local Storage

CodeLedger does not collect, store, or transmit any personal data to our own servers. 

All extension data is stored **locally on your device** using your browser's IndexedDB and secure local storage:
*   **Problem history**: Solved problem titles, code, runtime/memory stats, difficulty, and tags.
*   **API Configuration**: GitHub repository settings, GitHub OAuth access tokens, and optional AI provider API keys.

---

## 2. Outbound Requests & Third-Party Services

CodeLedger communicates with external services only to perform its core functionalities, as described below:

### A. GitHub API (`api.github.com`)
*   **Purpose**: Commits your solved problem files and updates your progress index directly in a repository you own.
*   **Data Sent**: Your solution code, problem descriptions, and runtime statistics.
*   **Privacy**: Governed by the [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement).

### B. Cloudflare Worker OAuth Proxy (`codeledger.vkrishna04.me`)
*   **Purpose**: Temporary proxy used strictly to exchange your GitHub OAuth code for an access token.
*   **Handling**: The token passes through the worker and is returned immediately to your browser. **No tokens, codes, or credentials are logged, saved, or retained** on our servers.
*   **Privacy**: Governed by the [Cloudflare Privacy Policy](https://www.cloudflare.com/privacy/).

### C. Optional AI Code Review Providers
If you choose to enable AI reviews and provide your own API key, CodeLedger makes direct requests to your configured provider:
*   **Supported Providers**: Google Gemini, OpenAI, Anthropic Claude, DeepSeek, and OpenRouter.
*   **Data Sent**: The code and description of the solved problem.
*   **Local Alternative**: You can use Ollama (`http://localhost:11434`) to run models locally on your machine, preventing any code from being sent to external AI servers.

---

## 3. Telemetry (Optional, Opt-In Only)

CodeLedger includes anonymous usage telemetry which is **disabled by default** (`telemetryOptIn` is set to `false`).

If and only if you explicitly opt-in under **Settings → General → Anonymous Usage Stats**:
*   The extension sends a POST request to `https://counter.vkrishna04.me/api/v1/counter/solve/hit`.
*   **Payload sent**: `{ event: "solve", platform: "leetcode", version: "x.y.z" }`
*   **No identifiers, credentials, repository names, problem content, or code** are ever included in this telemetry payload.
*   You can audit the implementation in our open-source codebase under `src/core/telemetry.js`.

---

## 4. User Rights & Data Deletion
*   **Access**: You can view all stored data under the extension's "Sync" and "Settings" pages.
*   **Deletion**: Uninstalling the extension completely purges all local storage and IndexedDB caches. You can also click **"Clear all data"** in the Settings tab to reset the extension.

---

## 5. Contact
For any questions regarding this policy, please email: **github@vkrishna04.me** or open an issue on our GitHub repository: **https://github.com/Life-Experimentalist/Code-Ledger/issues**.
```
