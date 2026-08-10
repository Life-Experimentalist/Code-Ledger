# Firefox AMO — Submission Copy

## Add-on Name

Code Ledger

## Summary (250 chars max)

> Auto-commit every accepted LeetCode solution to your own GitHub repo — with AI code review, live analytics dashboard, bulk history import, and cross-device sync. Zero extra steps.

---

## Description (AMO long description)

**Code Ledger — Your DSA grind, on your GitHub. Automatically.**

Solve a problem on LeetCode. The instant it's accepted, Code Ledger commits it to your GitHub repo — solution file, problem description, AI code review, and runtime stats — in a single atomic commit. Your contribution graph fills up with real work. No copy-pasting. No manual steps.

**FEATURES**

• Zero-click commits — every accepted submission committed automatically via GitHub Trees API
• Bulk LeetCode import — bring your entire history from the Progress page in one click
• AI code review — 6 providers: Gemini (free), OpenAI, Claude, DeepSeek, Ollama, OpenRouter
• Live GitHub Pages dashboard — heatmap, topic radar, difficulty chart, solve velocity
• Knowledge graph — force-directed graph of all solves linked by topic
• AI chat panel — floating assistant on every problem page with /mycode, /problem, /errors commands
• AI Behaviour Bank — personal memory: insights, custom skills, learning roadmap
• Cross-device sync — history always current via your own GitHub repo
• Rolling backups — automatic snapshots with one-click restore
• 100% yours — data goes to your repo only, open-source Apache 2.0

**SETUP**

1. Click the CodeLedger icon → Connect GitHub
2. Set a repo name
3. Solve a problem. Done.

**PRIVACY**

Your code and GitHub tokens are never stored on our servers. OAuth is handled via a Cloudflare Worker proxy (`codeledger.vkrishna04.me`) — the token passes through and is stored only in local extension storage; the server does not log or retain it.

The extension includes **optional, opt-in anonymous usage telemetry** (disabled by default). If you enable it in Settings → General → Anonymous Usage Stats, it sends only `{ event: "solve", platform: "leetcode", version: "x.y.z" }` to `counter.vkrishna04.me` when a problem is solved. No code, no tokens, no problem data, no identifiers. You can verify this in the open source at github.com/Life-Experimentalist/Code-Ledger (`src/core/telemetry.js`).

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
  - `tabs` & `scripting`: Detects supported problem page URLs and checks solve status.
  - Host permissions (`leetcode.com`, `geeksforgeeks.org`, `codeforces.com`): Observes DOM on coding platforms.
  - Host permission `api.github.com`: Commits files directly to the user's repo.
- **Opt-In Telemetry:** Disabled by default. If enabled under Settings → General, it sends only `{ version: "x.y.z", platform: "leetcode" }` to `counter.vkrishna04.me`. No code, tokens, or identifiers are included. Reviewers can verify in `src/core/telemetry.js`.

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

_(Paste into Privacy Policy text field)_

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

---

## 3. Telemetry (Optional, Opt-In Only)

CodeLedger includes anonymous usage telemetry which is **disabled by default** (`telemetryOptIn` is set to `false`).

If and only if you explicitly opt-in under **Settings → General → Anonymous Usage Stats**:

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

---

## Categories

Primary: **Developer Tools**
Secondary: **Productivity**

## Tags

leetcode, github, dsa, algorithms, automation, code-review, ai
