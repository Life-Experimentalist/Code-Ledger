# Adding a New Platform Handler

CodeLedger is designed to be easily extensible. If you want to track solves from a new platform (e.g., HackerRank, AtCoder, CSES), you only need to create a new handler plugin.

The core architecture uses a unified `eventBus` to communicate between content scripts and background services. The background service handles all Git commits, AI reviews, and storage logic. Your platform handler simply needs to:

1. Detect a successful solution.
2. Extract the relevant metadata and code.
3. Emit a standardized `problem:solved` event.

---

## 1. Directory Structure

Create a new folder in `src/handlers/platforms/your-platform-name/`. The typical structure is:

```
src/handlers/platforms/hackerrank/
  ├── index.js             # Main handler class (extends BasePlatformHandler)
  ├── dom-selectors.js     # CSS Selectors for the platform
  ├── page-detector.js     # Logic to identify problem pages & slugs
```

## 2. Implementing the Handler (`index.js`)

Your handler must extend `BasePlatformHandler` and adhere to its core contract.

```javascript
import { BasePlatformHandler } from "../../_base/BasePlatformHandler.js";
import { SELECTORS } from "./dom-selectors.js";
import { detectPage } from "./page-detector.js";
import { eventBus } from "../../../core/event-bus.js";

export class HackerRankHandler extends BasePlatformHandler {
  constructor() {
    super("hackerrank", "HackerRank", {});
    this.mutationObserver = null;
    this.lastDetectedId = null;
  }

  async init() {
    this.dbg.log("Initializing HackerRank handler");
    this.setupMutationObserver();
  }

  setupMutationObserver() {
    // Observe the DOM for success messages
    this.mutationObserver = new MutationObserver(() => {
      this.checkSubmission();
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  async checkSubmission() {
    const successEl = this.safeQuery(SELECTORS.submission.successIndicator);
    if (!successEl || !successEl.innerText.includes("Congratulations")) return;

    const pageInfo = detectPage(window.location.pathname);
    if (pageInfo.slug === this.lastDetectedId) return; // Prevent duplicate triggers

    this.dbg.log("Solve detected!", pageInfo.slug);
    this.lastDetectedId = pageInfo.slug;

    // 1. Gather Code and Metadata
    const code = this.safeQuery(SELECTORS.submission.code)?.innerText;
    const title = this.safeQuery(SELECTORS.problem.title)?.innerText;

    // 2. Emit Standardized Event payload
    eventBus.emit("problem:solved", {
      platform: "hackerrank",
      id: pageInfo.slug, // Unique ID or SLUG
      title: title, // Human readable title
      titleSlug: pageInfo.slug, // URL slug
      difficulty: "Medium", // 'Easy', 'Medium', or 'Hard'
      topic: "Algorithms", // Primary topic category
      tags: [], // Additional string tags
      code: code, // The raw source code string
      lang: {
        name: "Python", // Human readable language
        ext: "py", // File extension for GitHub
      },
      runtime: "N/A",
      memory: "N/A",
      timestamp: Date.now(),
    });
  }
}
```

## 3. Registering the Handler

Once your module is created, register it so the extension loads it.

### A. Add it to `src/handlers/init.js`

`handler-registry.js` holds the registry itself; `init.js` is what fills it.
Import the class and add an instance to the `platforms` array —
`initializeHandlers()` registers it and records its `getSettingsSchema()` if it
defines one (the schema is descriptive only; the settings UI is the hand-written
panels under `src/library/settings-panels/`).

```javascript
// At the top of init.js, alongside the other platform imports
import { HackerRankHandler } from "./platforms/hackerrank/index.js";

// Inside initializeHandlers()
const platforms = [
  new LeetCodeHandler(),
  // …
  new HackerRankHandler(),
];
```

### B. Dynamically Inject the Content Script

In `src/content/handler-loader.js`, add your platform to the domain router:

```javascript
  try {
    if (hostname.includes('leetcode.com')) {
       // ... existing leetcode loader
    } else if (isHost('hackerrank.com', hostname)) {
      console.log('[CodeLedger] Loading HackerRank handler...');
      // NOTE: no `src/` prefix — the extension root IS `src/`, so a path that
      // starts with `src/` resolves to nothing and the import fails silently.
      const url = chrome.runtime.getURL('handlers/platforms/hackerrank/index.js');
      const { HackerRankHandler } = await import(url);
      const handler = new HackerRankHandler();
      handler.init();
    }
  }
```

### C. Update Manifest Permissions

Update **both** `src/manifest-chromium.json` and `src/manifest-firefox.json` to
allow content scripts to run on the platform and to whitelist it for dynamic
module resolution:

1. Add domain to `host_permissions`
2. Add domain to `content_scripts.matches`
3. Add domain to `web_accessible_resources.matches`
4. Add `handlers/platforms/your-platform/*` to `web_accessible_resources.resources`

In practice you export `DOMAINS` from the handler's `dom-selectors.js`, add the
domain to `PLATFORM_DOMAINS` in `dev/generate-manifest-domains.js`, and run it —
it writes the first three into both manifests for you. The **resources** list in
step 4 is not generated; add that line by hand, or the dynamic
`import()` in the loader is blocked at runtime.

```json
"host_permissions": [
  "*://*.leetcode.com/*",
  "*://*.hackerrank.com/*"
]
```

## 3.5 When the DOM cannot tell you about a solve

Some platforms are single-page apps that judge a submission over `fetch` and
never render a durable "Accepted" node — NeetCode and takeuforward both behave
this way. For those, `src/content/net-tap.js` runs in the page's **MAIN** world
(`"world": "MAIN"` on its own `content_scripts` entry) and mirrors matching
requests back over `window.postMessage`;
`src/lib/net-tap-client.js` validates and delivers them to the handler.

Reach for it only when the DOM genuinely cannot answer the question, and when
you do:

- Add your endpoint to the allow-list in `net-tap.js`. It mirrors nothing else.
- Add your host to `TAP_DOMAINS` in `dev/generate-manifest-domains.js`. The tap
  must stay scoped to the hosts that need it, never site-wide.
- Treat every tapped message as a **claim**, not a fact. The page shares that
  world and can post whatever it likes, so the detector has to satisfy itself
  that the payload describes a real accepted submission. See the header comment
  in `net-tap-client.js` for the exact boundary and the residual risk.

`world: "MAIN"` needs Chrome 111+ and Firefox 128+; the Firefox manifest already
declares `strict_min_version: "142.0"`, so both targets support it.

## 4. Required Event Payload Schema

Ensure your handler emits exactly this shape when calling `eventBus.emit('problem:solved', payload)`:

- `platform` (string): Lowercase provider ID ('leetcode', 'hackerrank').
- `id` (string|number): Unique ID of the problem.
- `title` (string): Title of problem.
- `titleSlug` (string): URL-friendly string.
- `difficulty` (string): `Easy`, `Medium`, or `Hard`.
- `topic` (string): Broad category folder name (e.g. `Arrays`, `Dynamic Programming`).
- `tags` (string[]): Descriptive tags.
- `code` (string): The actual solution.
- `lang` (object):
  - `name`: E.g., 'C++', 'Python3', 'Java'.
  - `ext`: E.g., 'cpp', 'py', 'java' (Used for git file extension).
- `timestamp` (number): Unix time in **milliseconds** (`Date.now()`), not seconds.
