/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { registry } from "./handler-registry.js";
import { getProfileContext } from "./behavior-profile.js";
import { createDebugger } from "../lib/debug.js";

const dbg = createDebugger("AIDeduplication");

// Basic AI deduplication scaffold.
// Exports comparator utilities and a driver that tries an AI provider when available,
// falling back to a lightweight normalization equality test.

export function normalizeCode(code) {
  return String(code || "")
    .replace(/\/\*.*?\*\//gs, "") // remove block comments
    .replace(/\/\/.*$/gm, "") // remove line comments
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export async function compareSolutions(providerId, a, b) {
  // a and b: { id?, code, lang?, meta? }
  // Try provider comparator if available
  try {
    const prov = registry.getAIProvider(providerId);
    if (prov && typeof prov.compareSolutions === "function") {
      // provider may return { same: true/false, score: 0..1 }
      dbg.log(`compareSolutions(): using ${providerId} provider`);
      const res = await prov.compareSolutions(a, b);
      if (res && typeof res.same === "boolean") {
        dbg.log(`compareSolutions(): ✓ result from provider - same: ${res.same}`);
        return res;
      }
    }
  } catch (e) {
    // ignore provider errors and fallback
    dbg.warn(`compareSolutions(): provider ${providerId} failed, using fallback:`, e?.message);
  }

  // Fallback: normalized equality + length heuristic
  const na = normalizeCode(a.code || "");
  const nb = normalizeCode(b.code || "");
  const same =
    na === nb ||
    (na.length > 0 &&
      nb.length > 0 &&
      Math.abs(na.length - nb.length) / Math.max(na.length, nb.length) < 0.05 &&
      na.slice(0, 200) === nb.slice(0, 200));
  const score = same ? 0.98 : 0.0;
  dbg.log(`compareSolutions(): ✓ fallback - same: ${same}, score: ${score}`);
  return { same, score };
}

export async function findDuplicatesForProblem(problem, providerId) {
  // problem: may contain `solutions` array
  dbg.log(`findDuplicatesForProblem(): ${problem?.titleSlug} with ${providerId}`);
  const sols = problem?.solutions || [];
  const groups = [];
  const used = new Set();
  for (let i = 0; i < sols.length; i++) {
    if (used.has(i)) continue;
    const group = [i];
    used.add(i);
    for (let j = i + 1; j < sols.length; j++) {
      if (used.has(j)) continue;
      const res = await compareSolutions(providerId, sols[i], sols[j]);
      if (res?.same) {
        group.push(j);
        used.add(j);
      }
    }
    groups.push(group.map((idx) => sols[idx]));
  }
  dbg.log(
    `findDuplicatesForProblem(): ✓ found ${groups.length} groups from ${sols.length} solutions`,
  );
  return groups; // array of arrays of solutions
}

/**
 * Ask the AI provider to produce a merged/refined solution from multiple solutions.
 * Returns the merged source code string, or null on failure/no-result.
 */
export async function mergeSolutions(providerId, solutions = [], lang = null) {
  if (!Array.isArray(solutions) || solutions.length === 0) {
    dbg.log(`mergeSolutions(): no solutions provided`);
    return null;
  }
  dbg.log(`mergeSolutions(): merging ${solutions.length} solutions with ${providerId} in ${lang}`);
  try {
    const prov = registry.getAIProvider(providerId);
    const promptParts = [];
    promptParts.push(
      `You are given ${solutions.length} solutions in ${lang || "the target language"}.`,
    );
    promptParts.push(
      "Create a single canonical solution that is correct, idiomatic, and documents any important differences or assumptions. Return ONLY the merged source code, without extra explanation.",
    );
    // The merged version is what replaces the originals in the learner's own
    // repository, so it is worth spending the tokens to have it close the gaps
    // their reviews keep reopening. compareSolutions() deliberately gets none of
    // this: whether two solutions are the same approach is a fact about the
    // code, and colouring that judgement with who wrote it would only add noise.
    const profile = await getProfileContext().catch(() => "");
    if (profile) {
      promptParts.push(
        `${profile}\n\nWhere the solutions differ, prefer the variant that does not repeat a recurring flag above.`,
      );
    }
    promptParts.push("---");
    solutions.forEach((s, idx) => {
      promptParts.push(`// --- Solution ${idx + 1} ---`);
      promptParts.push(s.code || String(s.content || ""));
      promptParts.push("\n");
    });
    const prompt = promptParts.join("\n");
    if (prov && typeof prov.review === "function") {
      const merged = await prov.review(prompt, {
        mergedFrom: solutions.length,
        language: lang,
      });
      if (merged && typeof merged === "string") return merged.trim();
    }
  } catch (e) {
    dbg.warn("mergeSolutions failed:", e?.message || e);
  }
  return null;
}
