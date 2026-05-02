/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Enhanced selector support for LeetCode submission detection
 * This module provides additional selectors and matching strategies
 * for finding the "Accepted" status when the standard selectors fail
 */

import { SELECTORS } from "./dom-selectors.js";

/**
 * Extended list of selectors to find submission result indicators
 * Includes all original selectors plus additional ones for robustness
 */
export const ENHANCED_SELECTORS = {
  // Original LeetCode selectors
  ...SELECTORS,
  
  submission: {
    ...SELECTORS.submission,
    // Extended success indicator list
    successIndicatorExtended: [
      // Original selectors
      '[data-e2e-locator="submission-result"]',
      '[data-e2e-locator="console-result"]',
      '.text-green-s',
      'span[class*="text-green"]',
      '[class*="accepted"]',
      '[class*="Accepted"]',
      
      // Additional modern LeetCode UI patterns
      '[data-testid*="result"]',
      '[data-testid*="verdict"]',
      '[data-testid*="message"]',
      '[role="status"]',
      '[role="alert"]',
      
      // Common class patterns
      '[class*="success"]',
      '[class*="result"]',
      '[class*="verdict"]',
      '[class*="console"]',
      '[class*="message"]',
      '[class*="status"]',
      '[class*="output"]',
      
      // Color-based indicators (green for accept)
      '[class*="green"]',
      '[class*="text-green"]',
      '[class*="bg-green"]',
      '[style*="green"]',
      '[style*="0f5c2e"]', // Common green color hex
      '[style*="22c55e"]', // Tailwind green-500
      '[style*="16a34a"]', // Tailwind green-600
    ],
  },
};

/**
 * Query for submission result using extended selectors
 * @param {Element} context - DOM element to search within (default: document)
 * @returns {Element|null} - Found result element or null
 */
export function querySubmissionResult(context = document) {
  const selectors = ENHANCED_SELECTORS.submission.successIndicatorExtended;
  
  for (const selector of selectors) {
    try {
      const el = context.querySelector(selector);
      if (el) {
        // Verify element is visible
        const style = window.getComputedStyle(el);
        if (style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0") {
          return el;
        }
      }
    } catch (e) {
      // Skip invalid selectors
      continue;
    }
  }
  
  return null;
}

/**
 * Check if "Accepted" verdict is visible using extended selectors
 * @returns {boolean} - true if Accepted status is found and visible
 */
export function isAcceptedVisibleExtended() {
  const resultEl = querySubmissionResult();
  if (!resultEl) return false;
  
  // Check if element contains "Accepted" text
  const text = resultEl.textContent || "";
  return /accepted/i.test(text);
}

/**
 * Get verdict text from submission result
 * @returns {string|null} - The verdict text (e.g., "Accepted", "Wrong Answer") or null
 */
export function getSubmissionVerdict() {
  const resultEl = querySubmissionResult();
  if (!resultEl) return null;
  
  const text = resultEl.textContent || "";
  const match = text.match(/Accepted|Wrong Answer|Time Limit Exceeded|Runtime Error|Memory Limit Exceeded|Compile Error|Output Limit Exceeded/i);
  return match ? match[0] : null;
}

/**
 * Find all potential submission result elements on the page
 * Useful for debugging or understanding page structure
 * @returns {Element[]} - Array of found result elements
 */
export function findAllPotentialResultElements() {
  const selectors = ENHANCED_SELECTORS.submission.successIndicatorExtended;
  const results = [];
  const seen = new Set();
  
  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const key = el.outerHTML.slice(0, 100); // Use partial HTML as dedup key
        if (!seen.has(key)) {
          seen.add(key);
          results.push(el);
        }
      }
    } catch (e) {
      // Skip invalid selectors
      continue;
    }
  }
  
  return results;
}
