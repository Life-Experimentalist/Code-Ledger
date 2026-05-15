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
import { BasePlatformHandler } from '../../_base/BasePlatformHandler.js';
import { SELECTORS } from './dom-selectors.js';
import { detectPage } from './page-detector.js';
import { eventBus } from '../../../core/event-bus.js';

export class HackerRankHandler extends BasePlatformHandler {
  constructor() {
    super('hackerrank', 'HackerRank', {});
    this.mutationObserver = null;
    this.lastDetectedId = null;
  }

  async init() {
    this.dbg.log('Initializing HackerRank handler');
    this.setupMutationObserver();
  }

  setupMutationObserver() {
    // Observe the DOM for success messages
    this.mutationObserver = new MutationObserver(() => {
      this.checkSubmission();
    });

    this.mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  async checkSubmission() {
    const successEl = this.safeQuery(SELECTORS.submission.successIndicator);
    if (!successEl || !successEl.innerText.includes('Congratulations')) return;

    const pageInfo = detectPage(window.location.pathname);
    if (pageInfo.slug === this.lastDetectedId) return; // Prevent duplicate triggers

    this.dbg.log('Solve detected!', pageInfo.slug);
    this.lastDetectedId = pageInfo.slug;

    // 1. Gather Code and Metadata
    const code = this.safeQuery(SELECTORS.submission.code)?.innerText;
    const title = this.safeQuery(SELECTORS.problem.title)?.innerText;
    
    // 2. Emit Standardized Event payload
    eventBus.emit('problem:solved', {
      platform: 'hackerrank',
      id: pageInfo.slug,        // Unique ID or SLUG
      title: title,             // Human readable title
      titleSlug: pageInfo.slug, // URL slug
      difficulty: 'Medium',     // 'Easy', 'Medium', or 'Hard'
      topic: 'Algorithms',      // Primary topic category
      tags: [],                 // Additional string tags
      code: code,               // The raw source code string
      lang: {
        name: 'Python',         // Human readable language
        ext: 'py'               // File extension for GitHub
      },
      runtime: 'N/A',
      memory: 'N/A',
      timestamp: Math.floor(Date.now() / 1000)
    });
  }
}
```

## 3. Registering the Handler

Once your module is created, register it so the extension loads it.

### A. Add it to `src/core/handler-registry.js`

```javascript
// At the top of handler-registry.js
import { HackerRankHandler } from '../handlers/platforms/hackerrank/index.js';

// Inside the registry initialization or constructor
this.registerPlatform('hackerrank', HackerRankHandler);
```

### B. Dynamically Inject the Content Script

In `src/content/handler-loader.js`, add your platform to the domain router:

```javascript
  try {
    if (hostname.includes('leetcode.com')) {
       // ... existing leetcode loader 
    } else if (hostname.includes('hackerrank.com')) {
      console.log('[CodeLedger] Loading HackerRank handler...');
      const url = chrome.runtime.getURL('src/handlers/platforms/hackerrank/index.js');
      const { HackerRankHandler } = await import(url);
      const handler = new HackerRankHandler();
      handler.init();
    }
  }
```

### C. Update Manifest Permissions

Update `src/manifest.json` to allow content scripts to run on the platform and to whitelist it for dynamic module resolution:

1. Add domain to `host_permissions`
2. Add domain to `content_scripts.matches` 
3. Add domain to `web_accessible_resources.matches`

```json
"host_permissions": [
  "*://*.leetcode.com/*",
  "*://*.hackerrank.com/*" 
]
```

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
- `timestamp` (number): Unix timestamp.
