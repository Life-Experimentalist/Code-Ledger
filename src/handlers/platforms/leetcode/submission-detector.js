/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LeetCode submission detection: check, process, hook, and visibility helpers.
 */

import { CONSTANTS } from "../../../core/constants.js";
import { Storage } from "../../../core/storage.js";
import { createDebugger } from "../../../lib/debug.js";
import { QUERIES } from "./graphql-queries.js";
import { PAGE_TYPES, detectPage } from "./page-detector.js";
import { SELECTORS } from "./dom-selectors.js";
import { isAcceptedVisibleExtended } from "./enhanced-selectors.js";
import { resolveLang } from "./lang-utils.js";
import { normalizeDifficulty } from "../../../core/difficulty-map.js";
import { resolvePrimaryTopic } from "../../../core/topic-resolver.js";

const dbg = createDebugger("LCSubmissionDetector");

export async function checkSubmission(handler) {
  if (handler._processingLock) return;

  const page = detectPage(window.location.pathname);
  dbg.log("[checkSubmission] pageType=" + page.type + ", slug=" + page.slug);
  if (page.type !== PAGE_TYPES.PROBLEM && page.type !== PAGE_TYPES.SUBMISSION) {
    dbg.log("[checkSubmission] Not a problem/submission page, returning");
    return;
  }

  if (page.type === PAGE_TYPES.PROBLEM) {
    const visible = isAcceptedVisible(handler);
    dbg.log("[checkSubmission] Problem page, accepted visible=" + visible);
    if (!visible) return;
  } else {
    dbg.log("[checkSubmission] Submission detail page, will fetch");
  }

  await processSubmission(handler, page, false);
}

/**
 * Returns true when an "Accepted" result banner is visible on the current page.
 */
export function isAcceptedVisible(handler) {
  const bySelector = handler.safeQuery(SELECTORS.submission.successIndicator);
  if (bySelector && /accepted/i.test(bySelector.textContent || "")) return true;

  const roots = [
    document.querySelector('[data-e2e-locator="submission-result"]'),
    document.querySelector('[class*="result"]'),
    document.querySelector('[class*="verdict"]'),
    document.querySelector('[class*="console"]'),
    document.body,
  ].filter(Boolean);

  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (
        /\baccepted\b/i.test(node.textContent) &&
        !/submissions?\s+accepted/i.test(node.textContent)
      ) {
        const el = node.parentElement;
        if (!el) continue;
        const style = window.getComputedStyle(el);
        if (style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0") {
          return true;
        }
      }
    }
    if (root !== document.body) break;
  }

  return isAcceptedVisibleExtended();
}

/** Called immediately after the user triggers a submission. */
export function onSubmitFired(handler) {
  if (handler._resultPollTimer) {
    clearInterval(handler._resultPollTimer);
    handler._resultPollTimer = null;
  }

  const initialText =
    document.querySelector('[data-e2e-locator="submission-result"]')?.textContent?.trim() ?? null;

  let wasCleared = initialText === null;
  let attempts = 0;
  const MAX_ATTEMPTS = 60;

  handler._resultPollTimer = setInterval(() => {
    attempts++;
    if (attempts > MAX_ATTEMPTS) {
      clearInterval(handler._resultPollTimer);
      handler._resultPollTimer = null;
      dbg.log("onSubmitFired: result poll timed out");
      return;
    }

    const resultEl = document.querySelector('[data-e2e-locator="submission-result"]');

    if (!resultEl || !/\S/.test(resultEl.textContent || "")) {
      wasCleared = true;
      return;
    }

    const currentText = (resultEl.textContent || "").trim();

    if (/judging|running|pending|submitting/i.test(currentText)) {
      wasCleared = true;
      return;
    }

    if (!wasCleared) return;

    clearInterval(handler._resultPollTimer);
    handler._resultPollTimer = null;

    if (!/accepted/i.test(currentText)) {
      dbg.log("Submission result not Accepted — skipping", currentText);
      return;
    }

    dbg.log("Accepted result detected via submit hook");
    const page = detectPage(window.location.pathname);
    processSubmission(handler, page, false).catch((e) => dbg.error("processSubmission failed", e));
  }, 1000);
}

export async function processSubmission(handler, page, isManual) {
  handler._processingLock = true;
  let _emitted = false;
  try {
    const settings = await Storage.getSettings();
    if (!handler.isEnabled(settings) && !isManual) return false;

    let submission = null;
    let slug = page.slug;

    if (page.type === PAGE_TYPES.SUBMISSION && page.submissionId) {
      const res = await handler._gql(QUERIES.SUBMISSION_DETAIL, {
        submissionId: +page.submissionId,
      });
      submission = res.data?.submissionDetails;
      slug = submission?.question?.titleSlug || slug;
      if (!isManual && submission?.statusCode !== 10) return false;
    } else {
      const listRes = await handler._gql(QUERIES.SUBMISSION_LIST, {
        offset: 0,
        limit: 10,
        questionSlug: slug,
      });
      const subs = listRes.data?.questionSubmissionList?.submissions || [];
      const latest = subs.find((s) => /accepted/i.test(s.statusDisplay)) || subs[0];
      if (!latest) return false;

      const dedupKey = `cl_committed_${slug}`;
      const lastId = sessionStorage.getItem(dedupKey);
      // Also check IDB: sessionStorage is cleared on page reload (SPA cache), so a problem
      // already committed in a prior session could otherwise be resubmitted.
      const existingProblem = await Storage.getProblem(handler.makeProblemId(slug)).catch(() => null);
      const alreadyInDB = existingProblem && existingProblem.submissionId === String(latest.id);
      dbg.log(
        "[processSubmission] dedupKey=" +
          dedupKey +
          ", lastId=" +
          lastId +
          ", currentId=" +
          latest.id +
          ", alreadyInDB=" +
          alreadyInDB +
          ", isManual=" +
          isManual,
      );
      if (!isManual && (lastId === String(latest.id) || alreadyInDB)) {
        dbg.log("Skipping already-committed submission", slug, latest.id);
        return false;
      }

      const detailRes = await handler._gql(QUERIES.SUBMISSION_DETAIL, {
        submissionId: +latest.id,
      });
      submission = detailRes.data?.submissionDetails;
      if (!submission) return false;

      if (!submission.code) {
        const monacoCode = handler._getCodeFromMonaco();
        if (monacoCode) submission = { ...submission, code: monacoCode };
      }

      sessionStorage.setItem(dedupKey, String(latest.id));
    }

    const detectionId = `${slug}:${submission.timestamp || submission.id || Date.now()}`;
    dbg.log(
      "[processSubmission] detectionId=" +
        detectionId +
        ", lastDetectedId=" +
        handler.lastDetectedId,
    );
    if (!isManual && detectionId === handler.lastDetectedId) {
      dbg.log("Module-level dedup triggered, skipping");
      return;
    }
    handler.lastDetectedId = detectionId;

    const meta = await handler._fetchMetadata(slug);

    const canonical = await handler.resolveCanonical(slug);
    handler._canonical = canonical;

    const lang = resolveLang(submission.lang);
    const elapsedSeconds = handler._timer.getElapsedSeconds();

    const files = handler._buildFileSet(submission, meta, settings, slug, elapsedSeconds);
    const readmeFile = files.find((f) => f.path.endsWith("README.md"));

    const tsMs = submission.timestamp ? Number(submission.timestamp) * 1000 : Date.now();

    try {
      const existingProblem = await Storage.getProblem(handler.makeProblemId(slug)).catch(
        () => null,
      );
      if (existingProblem) {
        const existingCode = String(existingProblem.code || "").trim();
        const newCode = String(submission.code || "").trim();
        if (existingCode !== newCode) {
          submission._codeChanged = true;
          submission._requestAIReview = true;
        }
      } else {
        submission._requestAIReview = true;
      }
    } catch (e) {
      dbg.error("Code-diff detection failed", e);
    }

    handler.emitSolved({
      id: handler.makeProblemId(slug),
      forceCommit: isManual,
      submissionId: submission.id || null,
      title: meta?.title || submission.question?.title || slug,
      titleSlug: slug,
      difficulty: normalizeDifficulty(meta?.difficulty || submission.question?.difficulty || ""),
      topic: resolvePrimaryTopic(meta?.topicTags?.map((t) => t.name) || []),
      tags: meta?.topicTags?.map((t) => t.name) || [],
      canonical: canonical ? { id: canonical.canonicalId, title: canonical.canonicalTitle } : null,
      readmeContent: readmeFile?.content || null,
      code: submission.code || "",
      files,
      lang: { name: lang.verbose, ext: lang.ext, slug: lang.slug },
      runtime: submission.runtimeDisplay || submission.runtime || null,
      memory: submission.memoryDisplay || submission.memory || null,
      runtimePct: submission.runtimePercentile || null,
      memoryPct: submission.memoryPercentile || null,
      timestamp: tsMs,
      acRate: meta?.acRate || null,
      likes: meta?.likes || null,
      dislikes: meta?.dislikes || null,
      similar: (meta?.similarQuestionList || []).filter((q) => !q.isPaidOnly),
      problemStatement: meta?.content || null,
      elapsedSeconds,
      hasSimilar: meta?.hasSimilar ?? null,
      submissionsUrl: `${CONSTANTS.PLATFORMS.leetcode.problemsBase}${slug}/submissions/`,
      notes: "",
      methodTitle: "",
      isDuplicate: false,
      duplicateOf: null,
      _requestAIReview: submission._requestAIReview === true,
    });

    _emitted = true;
    dbg.log("Solve emitted", { slug, canonical: canonical?.canonicalId });
  } catch (err) {
    if (/extension context invalidated/i.test(err?.message || "")) {
      dbg.warn("Extension context invalidated — stopping all polling and observers");
      handler._stopSubmissionPolling();
      if (handler._resultPollTimer) {
        clearInterval(handler._resultPollTimer);
        handler._resultPollTimer = null;
      }
      if (handler.mutationObserver) {
        handler.mutationObserver.disconnect();
        handler.mutationObserver = null;
      }
      if (handler._submitHookObserver) {
        handler._submitHookObserver.disconnect();
        handler._submitHookObserver = null;
      }
    } else {
      dbg.error("Failed to process submission", err);
    }
  } finally {
    handler._processingLock = false;
  }
  return _emitted;
}
