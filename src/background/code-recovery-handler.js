/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDebugger } from "../lib/debug.js";
import { Storage } from "../core/storage.js";
import { tabs, runtime } from "../lib/browser-compat.js";
import { CONSTANTS } from "../core/constants.js";

const dbg = createDebugger("CodeRecovery");

const RECOVERY_TIMEOUT_MS = 30000;

/**
 * Open a hidden LeetCode tab to fetch the latest accepted submission code + tags.
 * Resolves with { ok: true, code, lang, tags, runtime, memory, runtimePct, memoryPct }
 * or { ok: false, error } on failure/timeout.
 *
 * @param {{ id: string, titleSlug: string }} problem
 * @returns {Promise<{ ok: boolean, code?: string, lang?: object, tags?: string[], error?: string }>}
 */
export async function triggerCodeRecovery(problem) {
  const { id: problemId, titleSlug, submissionId } = problem;
  if (!titleSlug) {
    return {
      ok: false,
      error: "Problem has no titleSlug — cannot open recovery tab",
    };
  }
  if (!problemId) {
    return {
      ok: false,
      error: "Problem has no id — cannot match recovery response",
    };
  }

  // Include problemId in both the query string AND the URL hash.
  // When a specific submissionId is known (bulk-imported problems), go directly to the
  // submissions page — this avoids reading from the editor cache (which for free LeetCode
  // users only persists in the browser and is not server-side retrievable).
  const encoded = encodeURIComponent(problemId);
  let url;
  if (problem.platform === "geeksforgeeks") {
    const gfgProblemsBase = CONSTANTS.PLATFORMS.geeksforgeeks.problemsBase;
    const base = `${gfgProblemsBase}${encodeURIComponent(titleSlug)}/1`;
    url = `${base}?codeledger_fetch=1&codeledger_code_fetch=1&codeledger_problemid=${encoded}#cl-pid=${encoded}`;
  } else {
    const lcProblemsBase = CONSTANTS.PLATFORMS.leetcode.problemsBase;
    const base = submissionId
      ? `${lcProblemsBase}${encodeURIComponent(titleSlug)}/submissions/${submissionId}/`
      : `${lcProblemsBase}${encodeURIComponent(titleSlug)}/`;
    url = `${base}?codeledger_code_fetch=1&codeledger_problemid=${encoded}#cl-pid=${encoded}`;
  }
  dbg.log(
    `triggerCodeRecovery(${titleSlug}): opening background tab (submissionId=${submissionId || "unknown"})`,
  );

  return new Promise((resolve) => {
    let tabId = null;
    let settled = false;

    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      dbg.warn(`triggerCodeRecovery(${titleSlug}): timed out after ${RECOVERY_TIMEOUT_MS}ms`);
      if (tabId != null) {
        tabs.remove?.(tabId)?.catch?.(() => {});
      }
      runtime.onMessage.removeListener?.(listener);
      resolve({
        ok: false,
        error: `Recovery timed out after ${RECOVERY_TIMEOUT_MS / 1000}s`,
      });
    }, RECOVERY_TIMEOUT_MS);

    function listener(msg) {
      // Fast-fail when URL redirect stripped the problemId — the content script
      // reports this separately so we don't silently wait the full 30 s timeout.
      if (msg?.type === "CODELEDGER_CODE_FETCH_ID_MISSING" && !settled) {
        settled = true;
        clearTimeout(timeoutHandle);
        runtime.onMessage.removeListener?.(listener);
        if (tabId != null) tabs.remove?.(tabId)?.catch?.(() => {});
        resolve({
          ok: false,
          error: "Recovery URL lost problemId in redirect — retry may help",
        });
        return;
      }
      if (msg?.type !== "CODELEDGER_CODE_FETCHED") return;
      if (msg.problemId !== problemId) return;
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      runtime.onMessage.removeListener?.(listener);
      if (tabId != null) {
        tabs.remove?.(tabId)?.catch?.(() => {});
      }
      if (msg.error) {
        dbg.warn(`triggerCodeRecovery(${titleSlug}): content script error: ${msg.error}`);
        resolve({ ok: false, error: msg.error });
      } else {
        dbg.log(
          `triggerCodeRecovery(${titleSlug}): ✓ received code (${(msg.code || "").length} chars)`,
        );
        // Save code + tags to storage immediately
        Storage.getProblem(problemId)
          .then((stored) => {
            if (!stored) return;
            const updated = {
              ...stored,
              code: msg.code || stored.code,
              lang: msg.lang || stored.lang,
              runtime: msg.runtime || stored.runtime,
              memory: msg.memory || stored.memory,
              runtimePct: msg.runtimePct ?? stored.runtimePct,
              memoryPct: msg.memoryPct ?? stored.memoryPct,
            };
            if (msg.tags?.length && (!stored.tags || !stored.tags.length)) {
              updated.tags = msg.tags;
              updated.topic = msg.tags[0];
            }
            if (msg.notes && !stored.notes) {
              updated.notes = msg.notes;
            }
            if (msg.timestamp && !stored.timestamp) {
              updated.timestamp = msg.timestamp;
            }
            return Storage.saveProblem(updated).then(async () => {
              // Mark for GitHub commit — problem now has code it lacked before
              const slug = String(updated.titleSlug || updated.id || "").trim();
              const langRaw = updated.lang?.name || updated.lang?.slug || updated.lang?.ext || "";
              const normLang = String(langRaw).toLowerCase().replace(/\s+/g, "");
              const key = slug ? (normLang ? `${slug}::${normLang}` : slug) : "";
              if (key) await Storage.markPendingProblemKey(key).catch(() => {});
              // Tell any open library page. Recovery outlives the modal that
              // asked for it, so the modal has to be told when it lands rather
              // than sitting on a promise it may no longer be waiting on.
              try {
                runtime.sendMessage?.({
                  type: "REFRESH_METADATA_DONE",
                  platform: updated.platform,
                  slug: updated.titleSlug,
                  problemId: updated.id,
                  fields: ["code"],
                });
              } catch (_) {}
            });
          })
          .then(() => {
            resolve({
              ok: true,
              code: msg.code,
              lang: msg.lang,
              tags: msg.tags || [],
              runtime: msg.runtime,
              memory: msg.memory,
              runtimePct: msg.runtimePct,
              memoryPct: msg.memoryPct,
              notes: msg.notes || null,
              timestamp: msg.timestamp || null,
            });
          })
          .catch((e) => {
            dbg.warn(`triggerCodeRecovery(): save failed:`, e?.message);
            resolve({ ok: false, error: `Save failed: ${e?.message}` });
          });
      }
    }

    runtime.onMessage.addListener(listener);
    tabs
      .create({ url, active: false })
      .then((tab) => {
        if (settled) {
          tabs.remove?.(tab.id)?.catch?.(() => {});
          return;
        }
        tabId = tab.id;
        dbg.log(`triggerCodeRecovery(${titleSlug}): ✓ opened tab ${tabId}`);
      })
      .catch((e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        runtime.onMessage.removeListener?.(listener);
        dbg.error(`triggerCodeRecovery(${titleSlug}): ✗ tab creation failed:`, e?.message);
        resolve({ ok: false, error: `Tab creation failed: ${e?.message}` });
      });
  });
}
