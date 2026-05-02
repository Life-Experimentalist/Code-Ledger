/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Enhanced submission detection for LeetCode
 * Provides more robust "Accepted" status detection with multiple strategies
 */

/**
 * Enhanced version of _isAcceptedVisible that uses multiple strategies
 * to find the "Accepted" status on modern LeetCode interfaces
 */
export function isAcceptedStatusVisible() {
  // Strategy 1: Check ARIA attributes (accessibility first)
  const ariaStatus = document.querySelector('[role="status"], [role="alert"]');
  if (ariaStatus && /accepted/i.test(ariaStatus.textContent || "")) {
    const style = window.getComputedStyle(ariaStatus);
    if (style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0") {
      return true;
    }
  }

  // Strategy 2: Data attributes (LeetCode's standard markers)
  const dataSelectors = [
    '[data-e2e-locator="submission-result"]',
    '[data-e2e-locator="console-result"]',
    '[data-testid*="result"]',
    '[data-testid*="verdict"]',
  ];
  
  for (const selector of dataSelectors) {
    const el = document.querySelector(selector);
    if (el && /accepted/i.test(el.textContent || "")) {
      const style = window.getComputedStyle(el);
      if (style.display !== "none" && style.visibility !== "hidden") {
        return true;
      }
    }
  }

  // Strategy 3: Color-based indicators (green text for accept)
  const colorSelectors = [
    '.text-green-s',
    'span[class*="text-green"]',
    '[class*="success"]',
    '[class*="accepted"]',
  ];

  for (const selector of colorSelectors) {
    const el = document.querySelector(selector);
    if (el && /accepted/i.test(el.textContent || "")) {
      const style = window.getComputedStyle(el);
      if (style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0") {
        return true;
      }
    }
  }

  // Strategy 4: Comprehensive text node search
  // This is slower but works even if structure changes
  const searchContainers = [
    document.querySelector('[data-e2e-locator="submission-result"]'),
    document.querySelector('[class*="result"]'),
    document.querySelector('[class*="console"]'),
    document.querySelector('[role="status"]'),
    document.querySelector('[role="alert"]'),
    // Last resort: search from body if nothing else found
    document.body,
  ].filter(Boolean);

  for (const container of searchContainers) {
    if (!container) continue;
    
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node;
    while ((node = walker.nextNode())) {
      // Check for exact "Accepted" text (case-insensitive)
      if (/^\s*accepted\s*$/i.test(node.textContent)) {
        const parent = node.parentElement;
        if (!parent) continue;

        // Verify the element is actually visible
        const style = window.getComputedStyle(parent);
        if (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0"
        ) {
          return true;
        }
      }
    }

    // Stop after first container if it has results
    if (container !== document.body && container.textContent) break;
  }

  return false;
}

/**
 * Get submission result details from page
 * Returns the element containing submission result info or null
 */
export function getSubmissionResultElement() {
  const selectors = [
    '[data-e2e-locator="submission-result"]',
    '[data-e2e-locator="console-result"]',
    '[class*="result"]',
    '[class*="console"]',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }

  return null;
}

/**
 * Extract verdict text from submission result
 * Returns the verdict string (e.g., "Accepted", "Wrong Answer", etc.)
 */
export function getSubmissionVerdict() {
  const resultEl = getSubmissionResultElement();
  if (!resultEl) return null;

  // Try to extract just the verdict line
  const text = resultEl.textContent || "";
  const match = text.match(/Accepted|Wrong Answer|Time Limit Exceeded|Runtime Error|Memory Limit Exceeded|Compile Error|Output Limit Exceeded/i);
  return match ? match[0] : null;
}

/**
 * Check if submission details panel is visible
 * Used to determine if we should attempt to fetch submission details
 */
export function isSubmissionDetailsPanelVisible() {
  const resultEl = getSubmissionResultElement();
  if (!resultEl) return false;

  const style = window.getComputedStyle(resultEl);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}
