# CodeLedger — Agent Execution Guide

**Format:** Every patch is FIND → REPLACE against the live repo. Every command is copy-paste ready.
**Order:** M0 → M1 → M2 → M3 → M4 → M5. Do not skip. Each VERIFY section is a hard gate.

---

## PREREQUISITES

```bash
node --version        # must be >= 20
npx wrangler --version  # if missing: npm i -g wrangler
git clone https://github.com/Life-Experimentalist/Code-Ledger.git
cd Code-Ledger
npm install
cd worker && npm install && cd ..
```

Accounts needed: GitHub, Cloudflare (with `codeledger.vkrishna04.me` zone pointing to CF).

---

## MODULE 0 — Vendor Bundles

**Problem:** `src/vendor/preact-bundle.js` and `src/vendor/chart-bundle.js` exist but contain
bundled minified source with no clean named ESM exports matching what UI components expect.

**Time:** 5 min | **Deps:** None

### Step 0.1 — Replace src/vendor/preact-bundle.js

```bash
cat > src/vendor/preact-bundle.js << 'ENDOFFILE'
// src/vendor/preact-bundle.js — named ESM re-exports for all UI components
// All UI files import from this single path.

export {
  h,
  render,
  Component,
  Fragment,
  createContext,
  createRef,
  cloneElement,
  isValidElement,
  options,
  hydrate,
  toChildArray,
} from 'https://esm.sh/preact@10.22.0';

export {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useReducer,
  useContext,
  useLayoutEffect,
  useErrorBoundary,
  useId,
  useImperativeHandle,
  useDebugValue,
} from 'https://esm.sh/preact@10.22.0/hooks';

import _htm from 'https://esm.sh/htm@3.1.1';
import { h as _h } from 'https://esm.sh/preact@10.22.0';
export const htm = _htm.bind(_h);
ENDOFFILE
```

### Step 0.2 — Replace src/vendor/chart-bundle.js

```bash
cat > src/vendor/chart-bundle.js << 'ENDOFFILE'
// src/vendor/chart-bundle.js — Chart.js ESM re-export
export { default, default as Chart } from 'https://esm.sh/chart.js@4.4.4/auto';
ENDOFFILE
```

### Step 0.3 — Ensure icon files exist

```bash
ls src/assets/images/
# Must include: icon-transparent.png, icon-dark-bg.png, logo.png
# They already exist in the repo. If missing, run:
python3 -c "
import base64
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
for n in ['icon-transparent.png','icon-dark-bg.png','icon-16.png','icon-32.png','icon-48.png','icon-128.png','logo.png']:
    open(f'src/assets/images/{n}','wb').write(png)
print('Icons created')
"
```

### VERIFY M0

```bash
head -3 src/vendor/preact-bundle.js
# Must show: // src/vendor/preact-bundle.js — named ESM re-exports
grep "export const htm" src/vendor/preact-bundle.js
# Must find the line
grep "default as Chart" src/vendor/chart-bundle.js
# Must find the line
```

---

## MODULE 1 — Cloudflare Worker: GitHub App + OAuth Fix

**Bug 1:** `pemToArrayBuffer` only strips `-----BEGIN PRIVATE KEY-----` headers.
GitHub App downloads `.pem` files with `-----BEGIN RSA PRIVATE KEY-----` (PKCS#1 format).
`crypto.subtle.importKey` needs PKCS#8. The current code silently produces wrong bytes,
causing a `DOMException` on every JWT signing attempt.

**Bug 2:** OAuth callback posts `{ type: 'GITHUB_TOKEN' }`.
The extension's `handleOAuth` listener checks `data.type === 'CODELEDGER_AUTH'`.
These never match, so no token is ever saved.

**Bug 3:** No `/api/health` endpoint for smoke testing.

**Time:** 30 min | **Deps:** Cloudflare account + domain zone

---

### Step 1.1 — Create GitHub App

Go to: https://github.com/settings/apps/new

Fill in exactly:
- **GitHub App name:** `CodeLedger` (or `CodeLedger-YourUsername` if taken)
- **Homepage URL:** `https://codeledger.vkrishna04.me`
- **Callback URL:** `https://codeledger.vkrishna04.me/api/auth/github/callback`
- **Webhook URL:** `https://codeledger.vkrishna04.me/api/webhook/github`
- **Webhook secret:** run `openssl rand -hex 32`, paste here, save output as `WEBHOOK_SECRET`
- **Repository permissions:** Contents = Read+Write, Metadata = Read, Administration = Read+Write
- **Where installed:** Any account

After creating, on the app settings page:
- Note numeric **App ID** → `GITHUB_APP_ID`
- Note **Client ID** (starts `Iv1.`) → `GITHUB_CLIENT_ID`
- Click **Generate a new client secret** → save → `GITHUB_CLIENT_SECRET`
- Click **Generate a private key** → `.pem` downloads → `mv ~/Downloads/*.pem github-app.pem`

---

### Step 1.2 — Convert RSA key PKCS#1 → PKCS#8

```bash
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt \
  -in github-app.pem \
  -out github-app-pkcs8.pem

# Verify — MUST print exactly: -----BEGIN PRIVATE KEY-----
head -1 github-app-pkcs8.pem
```

If it still says `-----BEGIN RSA PRIVATE KEY-----`, re-run the command above.

---

### Step 1.3 — Create worker/wrangler.toml

```bash
cd worker

# Get your Cloudflare Account ID:
npx wrangler whoami
# Note the Account ID

# Create KV namespace:
npx wrangler kv:namespace create CANONICAL_MAP
# Note the "id" value in the output
```

Create `worker/wrangler.toml` (already in `.gitignore`):

```toml
name = "codeledger"
main = "src/index.js"
compatibility_date = "2026-04-24"
account_id = "PASTE_CF_ACCOUNT_ID_HERE"

[site]
bucket = "./public"

[[kv_namespaces]]
binding = "CANONICAL_MAP"
id = "PASTE_KV_NAMESPACE_ID_HERE"

[env.production]
route = "codeledger.vkrishna04.me/*"
```

---

### Step 1.4 — Upload secrets

```bash
cd worker

# 1. Private key — pipe from file (multi-line value)
npx wrangler secret put CODELEDGER_GH_APP_PRIVATE_KEY < ../github-app-pkcs8.pem

# 2. App ID
npx wrangler secret put CODELEDGER_GH_APP_ID
# paste: the numeric GITHUB_APP_ID

# 3. Client ID
npx wrangler secret put CODELEDGER_GH_APP_CLIENT_ID
# paste: GITHUB_CLIENT_ID

# 4. Client Secret
npx wrangler secret put CODELEDGER_GH_APP_CLIENT_SECRET
# paste: GITHUB_CLIENT_SECRET

# 5. Webhook Secret
npx wrangler secret put CODELEDGER_GH_APP_WEBHOOK_SECRET
# paste: WEBHOOK_SECRET from Step 1.1

# 6. Canonical upload token
CANONICAL_TOKEN=$(openssl rand -hex 32)
echo "SAVE THIS TOKEN: $CANONICAL_TOKEN"
echo "$CANONICAL_TOKEN" | npx wrangler secret put CANONICAL_UPLOAD_TOKEN

# 7. Session secret
echo "$(openssl rand -hex 32)" | npx wrangler secret put SESSION_SECRET

# Confirm all 7 secrets:
npx wrangler secret list
# Must show all 7 names
```

---

### Step 1.5 — Patch worker/src/index.js (3 surgical changes)

**Patch 1.5.A — Fix pemToArrayBuffer to handle PKCS#1 RSA keys**

FIND (exact text in worker/src/index.js, lines 21-30):
```javascript
function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
```

REPLACE WITH:
```javascript
function pemToArrayBuffer(pem) {
  const isPkcs1 = pem.includes("BEGIN RSA PRIVATE KEY");
  const b64 = pem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/, "")
    .replace(/-----END (RSA )?PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const pkcs1 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) pkcs1[i] = binary.charCodeAt(i);

  if (!isPkcs1) return pkcs1.buffer;

  // Wrap PKCS#1 in a PKCS#8 ASN.1 envelope so crypto.subtle.importKey accepts it
  const rsaOid = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09,
    0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
    0x05, 0x00,
  ]);
  const encodeLen = (n) =>
    n < 128
      ? new Uint8Array([n])
      : n < 256
      ? new Uint8Array([0x81, n])
      : new Uint8Array([0x82, (n >> 8) & 0xff, n & 0xff]);
  const concat = (...arrays) => {
    const out = new Uint8Array(arrays.reduce((s, a) => s + a.length, 0));
    let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
  };
  const octet = concat(new Uint8Array([0x04]), encodeLen(pkcs1.length), pkcs1);
  const inner = concat(rsaOid, octet);
  const pkcs8 = concat(new Uint8Array([0x30]), encodeLen(inner.length), inner);
  return pkcs8.buffer;
}
```

**Patch 1.5.B — Fix GitHub OAuth callback postMessage type**

FIND (around line 202 of worker/src/index.js):
```javascript
  return c.html(
    `<!DOCTYPE html><html><body><script>window.opener.postMessage({ type: 'GITHUB_TOKEN', token: '${data.access_token || ""}' }, '*'); window.close();</script></body></html>`,
  );
```

REPLACE WITH:
```javascript
  const _token = data.access_token || "";
  const _error = data.error_description || data.error || "";
  return c.html(
    `<!DOCTYPE html>
<html><head><title>CodeLedger Auth</title></head>
<body>
<p style="font-family:sans-serif;padding:20px">
  ${_token ? "Authentication successful. Closing..." : "Authentication failed: " + _error}
</p>
<script>
(function(){
  var msg = { type: 'CODELEDGER_AUTH', provider: 'github', token: ${JSON.stringify(_token)} };
  if (window.opener) { try { window.opener.postMessage(msg, '*'); } catch(e){} }
  if (${JSON.stringify(!!_token)}) setTimeout(function(){ try{window.close();}catch(e){} }, 1200);
})();
</script>
</body></html>`,
  );
```

**Patch 1.5.C — Add /api/health endpoint**

FIND the first `app.get` route in worker/src/index.js. It will be:
```javascript
app.get("./api/app/installations",
```

INSERT this block BEFORE that line (with a blank line separating):
```javascript
// Health check — used for smoke testing after deploy
app.get("./api/health", (c) =>
  c.json({ ok: true, version: "1.0.0", ts: Date.now() })
);

```

---

### Step 1.6 — Deploy and upload canonical map

```bash
cd worker
npx wrangler deploy
# Expected last line: "Published codeledger (N sec)"
# If "route not found": CF Dashboard → Workers → codeledger → Triggers → Add route: codeledger.vkrishna04.me/*

cd ..
curl -s -X POST https://codeledger.vkrishna04.me/api/admin/canonical \
  -H "Authorization: Bearer $CANONICAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d @src/data/canonical-map.json
# Expected: {"ok":true}
```

### VERIFY M1

All 5 must pass before M2:

```bash
# 1. Health
curl -sf https://codeledger.vkrishna04.me/api/health | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['ok']; print('✓ health')"

# 2. OAuth redirect
curl -sI https://codeledger.vkrishna04.me/api/auth/github | grep -i "^location:"
# Expected: location: https://github.com/login/oauth/authorize?...

# 3. Canonical map CORS
curl -sI https://codeledger.vkrishna04.me/api/data/canonical-map.json | grep -i "access-control-allow-origin"
# Expected: access-control-allow-origin: *

# 4. Webhook rejects bad sig
curl -s -o /dev/null -w "%{http_code}" -X POST \
  https://codeledger.vkrishna04.me/api/webhook/github \
  -H "x-hub-signature-256: sha256=bad" -H "Content-Type: application/json" -d '{}'
# Expected: 401

# 5. Admin rejects wrong token
curl -s -o /dev/null -w "%{http_code}" -X POST \
  https://codeledger.vkrishna04.me/api/admin/canonical \
  -H "Authorization: Bearer wrongtoken"
# Expected: 401
```

---

## MODULE 2 — Missing Core File: ai-prompts.js

**Problem:** `src/core/ai-prompts.js` does not exist. `src/ui/components/SettingsSchema.js`
already has this import at the top: `import { getDefaultAIPrompts, normalizeAIPrompts, PROMPT_PLACEHOLDERS } from "../../core/ai-prompts.js";`
— the settings page crashes on load until this file exists.

**Time:** 5 min | **Deps:** M0

### Step 2.1 — Create src/core/ai-prompts.js

```bash
cat > src/core/ai-prompts.js << 'ENDOFFILE'
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Default AI review prompt templates, keyed by platform slug. */
export const PROMPT_PLACEHOLDERS = Object.freeze({
  leetcode: `Review this {difficulty} {language} solution for LeetCode problem '{title}'.

Provide:
1. Time complexity (Big-O) and space complexity
2. Correctness — any edge cases that could fail?
3. One concrete optimisation if applicable
4. Key algorithmic pattern used

Be concise. Max 200 words.`,

  geeksforgeeks: `Review this {difficulty} {language} solution for GeeksForGeeks problem '{title}'.

Provide:
1. Time complexity (Big-O) and space complexity
2. Correctness — any edge cases that could fail?
3. One concrete optimisation if applicable
4. Key algorithmic pattern used

Be concise. Max 200 words.`,

  codeforces: `Review this {language} competitive programming solution for '{title}'.

Provide:
1. Time complexity (Big-O) and space complexity
2. Will it pass within typical CP constraints (10^8 ops/s)?
3. Potential TLE or MLE risks?
4. One optimisation if applicable

Be concise. Max 200 words.`,

  default: `Review this {difficulty} {language} solution for '{title}'.

Provide:
1. Time complexity (Big-O) and space complexity
2. Correctness — any edge cases that could fail?
3. One concrete optimisation if applicable

Be concise. Max 200 words.`,
});

/**
 * Returns a shallow copy of the default prompts object.
 * @returns {Record<string, string>}
 */
export function getDefaultAIPrompts() {
  return { ...PROMPT_PLACEHOLDERS };
}

/**
 * Merges raw stored prompts with defaults.
 * Ensures all platform keys always exist.
 * @param {Record<string,string>|null|undefined} raw
 * @returns {Record<string, string>}
 */
export function normalizeAIPrompts(raw) {
  const defaults = getDefaultAIPrompts();
  if (!raw || typeof raw !== "object") return defaults;
  const out = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (raw[key] && typeof raw[key] === "string" && raw[key].trim()) {
      out[key] = raw[key];
    }
  }
  return out;
}

/**
 * Fills {placeholder} tokens in a prompt template.
 * @param {string} template
 * @param {{ title?: string, difficulty?: string, language?: string, lang?: {name?:string} }} ctx
 * @returns {string}
 */
export function fillPromptTemplate(template, ctx = {}) {
  return template
    .replace(/\{title\}/g, ctx.title || "Unknown Problem")
    .replace(/\{difficulty\}/g, ctx.difficulty || "Unknown")
    .replace(/\{language\}/g, ctx.language || ctx.lang?.name || "Unknown");
}
ENDOFFILE
```

### VERIFY M2

```bash
node --input-type=module << 'EOF'
import { getDefaultAIPrompts, normalizeAIPrompts, fillPromptTemplate } from './src/core/ai-prompts.js';
const d = getDefaultAIPrompts();
console.assert(d.leetcode && d.codeforces && d.default, 'All keys present');
const n = normalizeAIPrompts(null);
console.assert(n.leetcode === d.leetcode, 'null returns defaults');
const n2 = normalizeAIPrompts({ leetcode: 'custom', extra: 'ignored' });
console.assert(n2.leetcode === 'custom', 'custom preserved');
console.assert(n2.geeksforgeeks === d.geeksforgeeks, 'missing keys filled');
console.log('✓ ai-prompts.js OK');
EOF
```

---

## MODULE 3 — GitHub OAuth Token Wiring

**Bug 1:** `handleOAuth` in SettingsSchema.js saves to `Storage.setAIKeys` (wrong table —
that's for API keys, not OAuth tokens). It also never checks `data.type`, so the new
`CODELEDGER_AUTH` message from the Worker is silently ignored.

**Bug 2:** `GitHubHandler.getToken()` prioritises `settings["github_token"]` (manual PAT)
over `Storage.getAuthToken("github")` (OAuth token). After clicking Connect, the OAuth
token is stored in `auth.tokens`, not `settings`, so it is never found.

**Bug 3:** Service-worker commit crashes when `data.lang` is undefined (e.g. when files
array is provided directly with no lang object).

**Time:** 20 min | **Deps:** M1 (Worker deployed), M2

### Step 3.1 — Fix handleOAuth in src/ui/components/SettingsSchema.js

FIND (exact current text):
```javascript
  const handleOAuth = useCallback(
    (provider, key) => {
      const backendUrl = `${CONSTANTS.URLS.AUTH_WORKER}/auth/${provider}`;
      const popup = window.open(backendUrl, "OAuth", "width=600,height=700");
      if (!popup) {
        alert("Please allow popups to connect your account.");
        return;
      }

      const receiveMessage = async (ev) => {
        try {
          const data = ev && ev.data;
          if (!data) return;
          if (data.provider !== provider) return;
          if (!data.token) return;
          const existing = await Storage.getAIKeys();
          existing[provider] = [data.token];
          await Storage.setAIKeys(existing);
          onChange(key, data.token);
          setTestResults((s) => ({ ...s, [key]: "OK" }));
        } catch (e) {
          // ignore
        } finally {
          window.removeEventListener("message", receiveMessage);
          try {
            popup.close();
          } catch (e) {
            // ignore
          }
        }
      };

      window.addEventListener("message", receiveMessage);
      const poll = setInterval(() => {
        if (popup.closed) {
          clearInterval(poll);
          window.removeEventListener("message", receiveMessage);
        }
      }, 500);
    },
    [onChange],
  );
```

REPLACE WITH:
```javascript
  const handleOAuth = useCallback(
    (provider, key) => {
      const workerBase = CONSTANTS.URLS.AUTH_WORKER;
      const backendUrl = `${workerBase}/auth/${provider}`;
      const popup = window.open(backendUrl, "OAuth", "width=600,height=700");
      if (!popup) {
        alert("Please allow popups to connect your account.");
        return;
      }

      const receiveMessage = async (ev) => {
        // Accept messages from the Worker origin or the extension itself
        const allowedOrigins = [
          new URL(workerBase).origin,
          window.location.origin,
        ];
        if (ev.origin !== "null" && !allowedOrigins.includes(ev.origin)) return;

        const data = ev && ev.data;
        if (!data) return;
        // Only accept the correct message type from our Worker
        if (data.type !== "CODELEDGER_AUTH") return;
        if (data.provider !== provider) return;
        if (!data.token) {
          if (data.error) alert(`OAuth error: ${data.error}`);
          return;
        }

        window.removeEventListener("message", receiveMessage);
        clearInterval(poll);
        try { popup.close(); } catch (_) {}

        try {
          // Save to correct storage path so GitHubHandler.getToken() finds it
          await Storage.setAuthToken(provider, data.token);
          onChange(key, data.token);
          setTestResults((s) => ({ ...s, [key]: "Connected ✓" }));
        } catch (e) {
          console.error("[CodeLedger] Failed to save auth token:", e);
          alert("Token received but failed to save. Check console.");
        }
      };

      window.addEventListener("message", receiveMessage);
      const poll = setInterval(() => {
        if (popup.closed) {
          clearInterval(poll);
          window.removeEventListener("message", receiveMessage);
        }
      }, 500);
    },
    [onChange],
  );
```

### Step 3.2 — Fix GitHubHandler.getToken() in src/handlers/git/github/index.js

FIND (exact current text):
```javascript
  async getToken() {
    const settings = await Storage.getSettings();
    return settings["github_token"] || (await Storage.getAuthToken("github"));
  }
```

REPLACE WITH:
```javascript
  async getToken() {
    // Priority 1: OAuth token saved by handleOAuth (correct path after Connect)
    const oauthToken = await Storage.getAuthToken("github");
    if (oauthToken && String(oauthToken).trim()) {
      return String(oauthToken).trim();
    }
    // Priority 2: Manually entered PAT in settings form
    const settings = await Storage.getSettings();
    const settingsToken =
      settings["github_token"] || settings["githubToken"];
    if (settingsToken && String(settingsToken).trim()) {
      return String(settingsToken).trim();
    }
    console.warn(
      "[CodeLedger] No GitHub token found. Connect via Settings → GitHub Integration."
    );
    return null;
  }
```

### Step 3.3 — Guard service-worker commit in src/background/service-worker.js

FIND (exact current text):
```javascript
      let filesToCommit = [];
      if (data.files && Array.isArray(data.files)) {
        filesToCommit = [...data.files];
      } else {
        const filePath = `topics/${data.topic || "Uncategorized"}/${data.titleSlug}/${data.lang.name}.${data.lang.ext || "js"}`;
        filesToCommit.push({ path: filePath, content: data.code });
      }
```

REPLACE WITH:
```javascript
      let filesToCommit = [];
      if (data.files && Array.isArray(data.files) && data.files.length > 0) {
        filesToCommit = [...data.files];
      } else {
        const langName = (data.lang?.name || "Solution").replace(/\s+/g, "_");
        const langExt = data.lang?.ext || "txt";
        const filePath = `topics/${data.topic || "Uncategorized"}/${data.titleSlug || data.id}/${langName}.${langExt}`;
        filesToCommit.push({
          path: filePath,
          content: data.code || "// No code captured",
        });
      }
```

### Step 3.4 — (Optional) Add Test button to OAuth field

In `src/ui/components/SettingsSchema.js`, find where the OAuth Connect button is rendered
(search for `onClick=${() => handleOAuth`). After the Connect button closing tag, add:

```javascript
              ${values[f.key] ? html`
              <button
                onClick=${async () => {
                  try {
                    const { GitHubHandler } = await import(
                      chrome.runtime.getURL("handlers/git/github/index.js")
                    );
                    const gh = new GitHubHandler();
                    const user = await gh.apiFetch("/user", await gh.getToken());
                    setTestResults((s) => ({
                      ...s,
                      [f.key + "_test"]: user.login ? "✓ @" + user.login : "Connected",
                    }));
                  } catch (e) {
                    setTestResults((s) => ({
                      ...s,
                      [f.key + "_test"]: "✗ " + e.message,
                    }));
                  }
                }}
                style="font-size:11px;padding:4px 8px;margin-left:8px"
              >Test</button>
              ` : ""}
              ${testResults[f.key + "_test"] ? html`
                <span style="font-size:11px;margin-left:6px;opacity:0.7">
                  ${testResults[f.key + "_test"]}
                </span>
              ` : ""}
```

### VERIFY M3

1. Reload extension: `chrome://extensions` → Load unpacked → select `src/` directory
2. Open popup → click "Open Dashboard"
3. Settings → GitHub Integration → click **Connect**
4. GitHub OAuth popup opens → authorize
5. Popup closes automatically
6. Click **Test** → shows `✓ @yourusername`
7. DevTools → Application → Extension Storage → confirm `auth.tokens` key contains `{"github":"ghp_..."}`

---

## MODULE 4 — LeetCode Handler: Dedup + Manifest Fixes

**Bug 1:** `setupMutationObserver` calls `checkSubmission()` on every DOM mutation —
LeetCode fires hundreds of mutations per page. The existing `lastDetectedId` guard resets
when the page navigates, causing double commits on subsequent solves.

**Bug 2:** `manifest.json` has `"run_at": "document_start"` — LeetCode React hasn't
mounted yet. Must be `"document_idle"`.

**Bug 3:** `web_accessible_resources` only lists 6 specific files. Dynamic imports for
platform handlers fail with `Failed to fetch` because the paths aren't whitelisted.

**Bug 4:** `handler-loader.js` uses `chrome.runtime.getURL('src/handlers/...')` but the
extension root IS `src/` — the correct path is `handlers/...` (no `src/` prefix).

**Time:** 15 min | **Deps:** M3

### Step 4.1 — Add debounce + dedup to src/handlers/platforms/leetcode/index.js

**Patch 4.1.A — Add module-level debounce timer before the class declaration**

Find the line:
```javascript
export class LeetCodeHandler
```

INSERT these two lines immediately BEFORE it:
```javascript
// Module-level debounce timer — prevents rapid-fire MutationObserver calls
let _checkDebounceTimer = null;

```

**Patch 4.1.B — Debounce the MutationObserver callback**

FIND:
```javascript
  setupMutationObserver() {
    this.mutationObserver = new MutationObserver(() => {
      this.checkSubmission();
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
```

REPLACE WITH:
```javascript
  setupMutationObserver() {
    this.mutationObserver = new MutationObserver(() => {
      // Debounce: wait 3 seconds after DOM settles before checking
      clearTimeout(_checkDebounceTimer);
      _checkDebounceTimer = setTimeout(() => this.checkSubmission(), 3000);
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
```

**Patch 4.1.C — Add sessionStorage dedup guard in checkSubmission()**

FIND (exact text, 3 lines):
```javascript
      const detectionId = `${slug}:${submissionDetail.timestamp || submissionDetail.id || Date.now()}`;
      if (detectionId === this.lastDetectedId) return;
      this.lastDetectedId = detectionId;
```

REPLACE WITH:
```javascript
      const detectionId = `${slug}:${submissionDetail.timestamp || submissionDetail.id || Date.now()}`;
      if (detectionId === this.lastDetectedId) return;
      this.lastDetectedId = detectionId;

      // Cross-navigation dedup: skip if this exact submission was already processed this session
      const dedupKey = `cl_processed_${slug}`;
      const lastProcessed = sessionStorage.getItem(dedupKey);
      if (lastProcessed === String(submissionDetail.id || detectionId)) {
        this.dbg?.log("Skipping already-processed submission:", detectionId);
        return;
      }
```

Then find the `eventBus.emit("problem:solved"` call. It opens a multi-line object.
Find the closing `);` of that emit call and add this line AFTER it:
```javascript
      sessionStorage.setItem(dedupKey, String(submissionDetail.id || detectionId));
```

### Step 4.2 — Fix src/manifest.json

**Patch 4.2.A — Change run_at from document_start to document_idle**

FIND:
```json
      "run_at": "document_start",
```

REPLACE WITH:
```json
      "run_at": "document_idle",
```

**Patch 4.2.B — Expand web_accessible_resources**

The entire `web_accessible_resources` array currently has 6 entries. Replace the whole array:

FIND:
```json
  "web_accessible_resources": [
```

Replace the complete `web_accessible_resources` value (everything from `[` to the matching `],`) with:
```json
  "web_accessible_resources": [
    {
      "resources": [
        "handlers/platforms/leetcode/*",
        "handlers/platforms/geeksforgeeks/*",
        "handlers/platforms/codeforces/*",
        "handlers/_base/*",
        "handlers/ai/*",
        "handlers/git/*",
        "handlers/init.js",
        "core/*",
        "lib/*",
        "vendor/*",
        "data/*",
        "library/*",
        "ui/*",
        "popup/*",
        "sidebar/*",
        "assets/*",
        "content/*"
      ],
      "matches": ["<all_urls>"]
    }
  ],
```

**Note:** The extension root is `src/`. Paths in WAR are relative to the extension root,
so `handlers/` maps to `src/handlers/` on disk. `chrome.runtime.getURL('handlers/...')` is correct.

**Patch 4.2.C — Add presence-marker content script**

In `src/manifest.json`, find the `content_scripts` array. The existing entry ends with `}`.
Change that closing `}` to `},` and add a second entry immediately after:

FIND (after applying Patch 4.2.A, the first content_scripts entry ends with):
```json
      "run_at": "document_idle",
      "all_frames": false
    }
  ],
```

REPLACE WITH:
```json
      "run_at": "document_idle",
      "all_frames": false
    },
    {
      "matches": [
        "*://codeledger.vkrishna04.me/*"
      ],
      "js": [
        "content/presence-marker.js"
      ],
      "run_at": "document_end",
      "all_frames": false
    }
  ],
```

### Step 4.3 — Fix src/content/handler-loader.js import paths

FIND (entire file — the current file content is exactly this):
```javascript
// This is the entry point for content scripts.
// In MV3, ES modules loaded by content scripts dynamically must use the chrome-extension:// URL.

async function loadHandler() {
  const hostname = window.location.hostname;

  try {
    if (hostname.includes('leetcode.com')) {
      console.log('[CodeLedger] Loading LeetCode handler...');
      const url = chrome.runtime.getURL('src/handlers/platforms/leetcode/index.js');
      const { LeetCodeHandler } = await import(url);
      const handler = new LeetCodeHandler();
      handler.init();
    }
    // GeeksForGeeks and CodeForces handlers follow the same pattern
  } catch (err) {
    console.error('[CodeLedger] Failed to load platform handler:', err);
  }
}

loadHandler();
```

REPLACE WITH:
```javascript
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Extension root is src/ — paths must NOT include 'src/' prefix.
async function loadHandler() {
  const hostname = window.location.hostname;

  try {
    if (hostname.includes("leetcode.com")) {
      console.log("[CodeLedger] Loading LeetCode handler...");
      const url = chrome.runtime.getURL("handlers/platforms/leetcode/index.js");
      const { LeetCodeHandler } = await import(url);
      const handler = new LeetCodeHandler();
      await handler.init();
      console.log("[CodeLedger] LeetCode handler active");

    } else if (hostname.includes("geeksforgeeks.org")) {
      console.log("[CodeLedger] Loading GFG handler...");
      const url = chrome.runtime.getURL(
        "handlers/platforms/geeksforgeeks/index.js"
      );
      const { GFGHandler } = await import(url);
      const handler = new GFGHandler();
      await handler.init();

    } else if (hostname.includes("codeforces.com")) {
      console.log("[CodeLedger] Loading Codeforces handler...");
      const url = chrome.runtime.getURL(
        "handlers/platforms/codeforces/index.js"
      );
      const { CodeforcesHandler } = await import(url);
      const handler = new CodeforcesHandler();
      await handler.init();
    }
  } catch (err) {
    console.error("[CodeLedger] Failed to load platform handler:", err);
  }
}

loadHandler();
```

### VERIFY M4

```bash
# Validate manifest JSON
node -e "
const m = JSON.parse(require('fs').readFileSync('src/manifest.json','utf8'));
console.assert(m.content_scripts[0].run_at === 'document_idle', 'run_at must be document_idle');
console.assert(m.content_scripts.length === 2, 'must have 2 content_scripts entries');
console.assert(m.web_accessible_resources[0].resources.includes('handlers/platforms/leetcode/*'), 'WAR must include leetcode handler');
console.log('✓ manifest.json OK');
"

# Verify handler-loader has no src/ prefix
grep "getURL" src/content/handler-loader.js
# Must show 'handlers/...' NOT 'src/handlers/...'
```

In Chrome:
1. Reload extension at `chrome://extensions`
2. Go to LeetCode, open DevTools Console
3. Must see: `[CodeLedger] LeetCode handler active`
4. Submit an accepted solution → service worker console shows commit log
5. Submit same problem again → NO second commit

---

## MODULE 5 — Landing Page: Config + Final Deploy

**Problem:** `worker/public/config.json` has `"<YOUR_APP_NAME>"` placeholder. The landing
page "Install Extension" button uses this URL — it currently links to a non-existent app.

**Time:** 5 min | **Deps:** M1 deployed, GitHub App slug known

### Step 5.1 — Find your GitHub App slug

Go to https://github.com/settings/apps → click your app. The URL shows:
`https://github.com/settings/apps/YOUR-SLUG-HERE`

### Step 5.2 — Update worker/public/config.json

FIND:
```json
    "github_app_install": "https://github.com/apps/<YOUR_APP_NAME>/installations/new",
    "notes": "If you have the extension IDs, append them to the store URLs above (e.g. chrome_store + EXTENSION_ID_CHROME). Update src/core/constants.js to persist these IDs in the repo. Replace <YOUR_APP_NAME> with your GitHub App slug."
```

REPLACE WITH (put your real slug):
```json
    "github_app_install": "https://github.com/apps/YOUR-REAL-SLUG/installations/new"
```

### Step 5.3 — Redeploy

```bash
cd worker && npx wrangler deploy
```

### VERIFY M5

```bash
# Config has real slug
curl -s https://codeledger.vkrishna04.me/config.json | python3 -c "
import json,sys
d=json.load(sys.stdin)
url=d.get('github_app_install','')
assert url and '<YOUR_APP_NAME>' not in url, 'Placeholder not replaced!'
print('✓ Install URL:', url)
"

# With extension loaded in Chrome:
# Visit https://codeledger.vkrishna04.me
# DevTools → Elements → Ctrl+F 'codeledger-present'
# Must find: <div id="codeledger-present" ...>
# The page button must show "Open Library" not "Get Extension"
```

---

## FULL SYSTEM SMOKE TEST

```bash
#!/bin/bash
set -e
echo "─── M0: Vendor bundles ───"
grep -q "export const htm" src/vendor/preact-bundle.js && echo "✓ preact-bundle"
grep -q "default as Chart" src/vendor/chart-bundle.js && echo "✓ chart-bundle"

echo "─── M1: Worker endpoints ───"
curl -sf https://codeledger.vkrishna04.me/api/health | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['ok']; print('✓ health')"
curl -sI https://codeledger.vkrishna04.me/api/auth/github 2>&1 | grep -iq "location: https://github.com" && echo "✓ OAuth redirect"
curl -sI https://codeledger.vkrishna04.me/api/data/canonical-map.json 2>&1 | grep -iq "access-control-allow-origin" && echo "✓ canonical-map CORS"

echo "─── M2: ai-prompts.js ───"
node --input-type=module << 'EOF'
import { getDefaultAIPrompts } from './src/core/ai-prompts.js';
const p = getDefaultAIPrompts();
console.assert(p.leetcode && p.codeforces, 'keys OK');
console.log('✓ ai-prompts, keys:', Object.keys(p).join(', '));
EOF

echo "─── M3: GitHub handler ───"
grep -q "Storage.getAuthToken" src/handlers/git/github/index.js && echo "✓ getToken uses OAuth path"
grep -q "CODELEDGER_AUTH" src/ui/components/SettingsSchema.js && echo "✓ handleOAuth checks correct type"

echo "─── M4: manifest ───"
node -e "
const m = JSON.parse(require('fs').readFileSync('src/manifest.json','utf8'));
console.assert(m.content_scripts[0].run_at==='document_idle','run_at');
console.assert(m.content_scripts.length===2,'CS count');
console.assert(!require('fs').readFileSync('src/content/handler-loader.js','utf8').includes(\"'src/handlers\"),'no src/ prefix');
console.log('✓ manifest + handler-loader OK');
"

echo "─── M5: config ───"
curl -s https://codeledger.vkrishna04.me/config.json | python3 -c "
import json,sys
d=json.load(sys.stdin)
url=d.get('github_app_install','')
assert url and '<YOUR_APP_NAME>' not in url
print('✓ config, install URL:', url)
"

echo ""
echo "════ ALL CHECKS PASSED ════"
```

---

## APPENDIX A — Files Modified

| Module | File                                       | Action                                                    |
| ------ | ------------------------------------------ | --------------------------------------------------------- |
| M0     | `src/vendor/preact-bundle.js`              | REPLACE with CDN re-exports                               |
| M0     | `src/vendor/chart-bundle.js`               | REPLACE with CDN re-export                                |
| M1     | `worker/wrangler.toml`                     | CREATE                                                    |
| M1     | `worker/src/index.js`                      | PATCH ×3: pemToArrayBuffer, postMessage type, /api/health |
| M2     | `src/core/ai-prompts.js`                   | CREATE                                                    |
| M3     | `src/ui/components/SettingsSchema.js`      | PATCH: handleOAuth + (optional) test button               |
| M3     | `src/handlers/git/github/index.js`         | PATCH: getToken priority order                            |
| M3     | `src/background/service-worker.js`         | PATCH: lang guard in commit block                         |
| M4     | `src/handlers/platforms/leetcode/index.js` | PATCH: debounce + sessionStorage dedup                    |
| M4     | `src/manifest.json`                        | PATCH: run_at + WAR expansion + presence CS               |
| M4     | `src/content/handler-loader.js`            | REPLACE: correct getURL paths                             |
| M5     | `worker/public/config.json`                | PATCH: real GitHub App slug                               |

---

## APPENDIX B — Secrets Reference

| Wrangler Secret                    | Source                                     |
| ---------------------------------- | ------------------------------------------ |
| `CODELEDGER_GH_APP_PRIVATE_KEY`    | `github-app-pkcs8.pem` piped with `< file` |
| `CODELEDGER_GH_APP_ID`             | GitHub App settings → numeric App ID       |
| `CODELEDGER_GH_APP_CLIENT_ID`      | GitHub App settings → Client ID            |
| `CODELEDGER_GH_APP_CLIENT_SECRET`  | GitHub App → Client secrets → Generate     |
| `CODELEDGER_GH_APP_WEBHOOK_SECRET` | `openssl rand -hex 32` (Step 1.1)          |
| `CANONICAL_UPLOAD_TOKEN`           | `openssl rand -hex 32` (Step 1.4)          |
| `SESSION_SECRET`                   | `openssl rand -hex 32` (Step 1.4)          |

---

## APPENDIX C — Common Failures

| Symptom                                                   | Root cause                                                           | Fix                                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Popup blank                                               | Vendor bundle has no named exports                                   | M0 — confirm `preact-bundle.js` starts with `export {`                            |
| `DOMException` in Worker JWT sign                         | PKCS#1 key, `pemToArrayBuffer` not patched                           | M1 Patch 1.5.A                                                                    |
| OAuth popup closes, nothing saved                         | Worker posts `GITHUB_TOKEN`, extension listens for `CODELEDGER_AUTH` | M1 Patch 1.5.B + M3 Step 3.1                                                      |
| Token saved but API returns 401                           | Token stored in AIKeys not AuthTokens                                | M3 Step 3.1 — check `Storage.setAuthToken` is called                              |
| LeetCode handler not loading                              | `chrome.runtime.getURL('src/handlers/...')` — extra `src/` prefix    | M4 Step 4.3                                                                       |
| Handler loads but `Failed to fetch` on import             | Handler path not in `web_accessible_resources`                       | M4 Patch 4.2.B                                                                    |
| Double commits                                            | Dedup guard not applied                                              | M4 Patch 4.1.C                                                                    |
| `wrangler deploy` says route not found                    | CF route not bound                                                   | CF Dashboard → Workers → codeledger → Triggers → Add `codeledger.vkrishna04.me/*` |
| `/api/admin/canonical` returns 200 but map shows old data | KV not updated                                                       | Re-run Step 1.6 curl command                                                      |
| Landing page button stays "Get Extension"                 | `presence-marker.js` not in manifest                                 | M4 Patch 4.2.C                                                                    |
