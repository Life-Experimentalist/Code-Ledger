# Debugging: LeetCode Commit on Accept Not Firing

## Problem
When submitting a solution on LeetCode and it gets "Accepted", the CodeLedger extension should automatically:
1. Detect the "Accepted" status
2. Fetch submission metadata
3. Emit a `problem:solved` event
4. Service worker receives it and creates a GitHub commit

**Current Issue**: The automatic commit is not firing.

---

## Debug Flow

### Step 1: Check if the handler is initialized

Open your browser's **DevTools Console** (F12) on a LeetCode problem page:

```javascript
// Check if the LeetCode handler is running
chrome.runtime.sendMessage({type: "DEBUG_GET_HANDLER_STATE", platform: "leetcode"}, (response) => {
  console.log("Handler state:", response);
});
```

Expected output: Should show the handler is active.

### Step 2: Manual trigger of submission check

In the console, trigger the manual submission check:

```javascript
// Get the current tab state
chrome.runtime.sendMessage({type: "DEBUG_CHECK_SUBMISSION"}, (response) => {
  console.log("Manual check result:", response);
});
```

### Step 3: Verify "Accepted" detection

Run this in the **LeetCode page console** to manually check if "Accepted" is visible:

```javascript
// Check using different selectors
const selectors = [
  '[data-e2e-locator="submission-result"]',
  '[data-e2e-locator="console-result"]',
  '.text-green-s',
  'span[class*="text-green"]',
  '[class*="accepted"]',
  '[class*="Accepted"]',
];

selectors.forEach(sel => {
  const el = document.querySelector(sel);
  console.log(`Selector "${sel}":`, el ? "✓ FOUND" : "✗ NOT FOUND", el?.textContent?.slice(0, 80));
});

// Also search for "Accepted" text in the DOM
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
let node;
const acceptedNodes = [];
while ((node = walker.nextNode())) {
  if (/^\s*accepted\s*$/i.test(node.textContent)) {
    acceptedNodes.push({
      text: node.textContent,
      parent: node.parentElement?.tagName,
      classList: node.parentElement?.className?.slice(0, 100),
      visible: window.getComputedStyle(node.parentElement).display !== 'none'
    });
  }
}
console.log(`Found ${acceptedNodes.length} "Accepted" text nodes:`, acceptedNodes);
```

### Step 4: Check service worker logs

The service worker logs are available in:
- **Chrome**: `chrome://serviceworkers/` → find CodeLedger → Click "inspect"
- **Firefox**: `about:debugging#/runtime/this-firefox` → Extensions → CodeLedger → Inspect

Look for messages like:
- `[_checkSubmission] Calling _processSubmission` (LeetCode handler)
- `[handleSolved] ✓ Event received` (Service worker)
- `[handleSolved] About to commit` (Service worker)

### Step 5: Check IndexedDB storage

In DevTools:
1. Go to **Application** tab
2. Navigate to **IndexedDB → codeledger-db → problems**
3. Check if the solved problem appears here

---

## Common Failure Points

| Issue | Symptom | Fix |
|-------|---------|-----|
| **Selectors outdated** | "Accepted" text not found via selectors | Update DOM selectors in `src/handlers/platforms/leetcode/dom-selectors.js` |
| **MutationObserver not triggered** | `_checkSubmission` never called | Check if mutations are happening on problem page |
| **eventBus emit not working** | Event is emitted but SW doesn't receive | Verify eventBus module is properly imported |
| **SW not listening** | SW initialized but event handler not registered | Check `eventBus.on("problem:solved")` in service-worker |
| **Incognito mode enabled** | Event received but silently ignored | Check settings - `incognitoMode` should be "off" |
| **Git disabled** | Event received but commit skipped | Check settings - `gitEnabled` should be true |

---

## Quick Test: Forced Submission Check

Add this debugging endpoint to verify the flow works manually:

```javascript
// In content/handler-loader.js or handlers/init.js
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.type === "DEBUG_FORCE_COMMIT") {
    const problemId = msg.problemId || "test-problem";
    eventBus.emit("problem:solved", {
      platform: "leetcode",
      titleSlug: problemId,
      title: "Test Problem",
      difficulty: "Medium",
      lang: { name: "JavaScript", ext: "js", slug: "js" },
      tags: ["test"],
      topic: "Testing",
      code: "// test code",
      timestamp: Date.now(),
      files: [{
        path: `topics/Testing/${problemId}/JavaScript.js`,
        content: "// test code"
      }]
    });
    respond({success: true, message: "Event emitted"});
  }
});
```

Then in console:
```javascript
chrome.runtime.sendMessage({type: "DEBUG_FORCE_COMMIT", problemId: "two-sum"}, (r) => {
  console.log("Force commit result:", r);
});
```

---

## LeetCode Page Structure (2025)

Recent changes to LeetCode:
- Result banner moved to a modal-like component
- Classes are heavily hashed/minified
- Data attributes like `data-e2e-locator` are more stable
- Text content search (slow path) is reliable fallback

If the issue persists, check:
1. `_isAcceptedVisible()` two-pass strategy (fast selectors + slow text-content scan)
2. Consider if LeetCode's result display timing has changed
3. MutationObserver debounce time (600ms) might be too short or too long

---

## Next Steps if Issue Persists

1. **Add temporary console.log** to LeetCode handler:
   - `_setupMutationObserver()` - log every mutation
   - `_checkSubmission()` - log entry and exit
   - `_isAcceptedVisible()` - log selector results

2. **Monitor network requests**:
   - Check if GraphQL SUBMISSION_DETAIL query is being sent
   - Verify response contains expected data

3. **Check extension permissions**:
   - Ensure `host_permissions` includes `*://leetcode.com/*`
   - Verify content script can communicate with service worker

4. **Test with other platforms**:
   - Try GeeksForGeeks or Codeforces to see if issue is platform-specific
   - If other platforms work, the issue is LeetCode-specific

---

## Branch for Investigation

For debugging,  create a branch specifically for adding verbose logging:
```bash
git checkout -b debug/commit-on-accept
```

This way you can safely add console logging without affecting production.
