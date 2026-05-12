/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../lib/debug.js";
import { normalizeLang } from "./lang-utils.js";

const dbg = createDebugger("DuplicateDetector");

/**
 * Normalize code for comparison: trim whitespace, remove comments, minimize differences
 * @param {string} code
 * @returns {string}
 */
function normalizeCode(code = "") {
    return code
        .split("\n")
        .map((line) => line.trim())
        .filter(
            (line) => line && !line.startsWith("//") && !line.startsWith("#")
        )
        .join("\n")
        .toLowerCase();
}

/**
 * Check if new submission is a duplicate of existing solutions
 * @param {Object} newProblem - the problem to check
 * @param {Array<Object>} allProblems - all problems in library
 * @returns {Object|null} { isDuplicate: boolean, duplicateOf: string|null }
 */
export function detectDuplicate(newProblem, allProblems = []) {
    if (!newProblem?.code) {
        dbg.log(`detectDuplicate(): ${newProblem?.titleSlug} - no code`);
        return { isDuplicate: false, duplicateOf: null };
    }

    const newCode = newProblem.code;
    const newCodeNorm = normalizeCode(newCode);
    const newLang = normalizeLang(newProblem);
    const newTitle = newProblem.titleSlug || newProblem.title || "";

    if (!newLang || !newTitle) {
        dbg.log("Cannot detect duplicates: missing language or title slug");
        return { isDuplicate: false, duplicateOf: null };
    }

    // Look for exact code match in same language, same or different problem
    for (const existing of allProblems) {
        // Skip the problem itself (same ID)
        if (existing.id === newProblem.id) {
            continue;
        }

        // Only compare same language submissions
        const existingLang = normalizeLang(existing);
        if (existingLang !== newLang) {
            continue;
        }

        // Check for exact code match (after normalization)
        const existingCodeNorm = normalizeCode(existing.code);
        if (newCodeNorm && newCodeNorm === existingCodeNorm) {
            dbg.log(
                `Duplicate detected: ${newTitle} (${newLang}) matches ${existing.titleSlug}`
            );
            return {
                isDuplicate: true,
                duplicateOf:
                    existing.id || `${existing.platform}:${existing.titleSlug}`,
            };
        }
    }

    return { isDuplicate: false, duplicateOf: null };
}

/**
 * Batch detect duplicates for multiple problems
 * @param {Array<Object>} problems - problems to check
 * @param {Array<Object>} allProblems - reference library
 * @returns {Map<string, Object>} Map of problem.id -> { isDuplicate, duplicateOf }
 */
export function detectDuplicateBatch(problems = [], allProblems = []) {
    dbg.log(
        `detectDuplicateBatch(): checking ${problems.length} problems against ${allProblems.length} library items`
    );
    const results = new Map();
    for (const problem of problems) {
        const result = detectDuplicate(problem, allProblems);
        if (result.isDuplicate) {
            results.set(problem.id, result);
        }
    }
    dbg.log(`detectDuplicateBatch(): ✓ found ${results.size} duplicates`);
    return results;
}
