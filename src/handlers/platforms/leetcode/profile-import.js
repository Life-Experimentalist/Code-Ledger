/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LeetCode profile/progress page import button and bulk import logic.
 */

import { CONSTANTS } from "../../../core/constants.js";
import { Storage } from "../../../core/storage.js";
import { createDebugger } from "../../../lib/debug.js";
import { runtime, tabs } from "../../../lib/browser-compat.js";
import { QUERIES } from "./graphql-queries.js";
import { gql as _gqlCall, fetchMetadata, buildBulkReadme } from "./file-builder.js";
import { resolveLang } from "./lang-utils.js";
import { resolvePrimaryTopic } from "../../../core/topic-resolver.js";
import { solutionPath, readmePath } from "../../../core/path-builder.js";
import { onTrustedClick } from "../../../lib/trusted-click.js";

const dbg = createDebugger("LCProfileImport");

/** Create the styled import button element. */
function createImportBtn(handler, pageUsername) {
  const btn = document.createElement("button");
  btn.id = "cl-profile-import";
  btn.style.cssText =
    "display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;" +
    "font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;" +
    "border:1px solid rgba(6,182,212,0.4);color:#67e8f9;" +
    "background:rgba(6,182,212,0.08);transition:background 0.2s;";
  btn.onmouseenter = () => {
    btn.style.background = "rgba(6,182,212,0.18)";
  };
  btn.onmouseleave = () => {
    btn.style.background = "rgba(6,182,212,0.08)";
  };
  btn.innerHTML =
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">` +
    `<path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm1 14H11v-4H8l4-4 4 4h-3v4z"/>` +
    `</svg> Import All Solves to CodeLedger`;
  onTrustedClick(btn, () => runProfileImport(handler, pageUsername, btn));
  return btn;
}

async function runProfileImport(handler, pageUsername, btn) {
  btn.disabled = true;
  const progressEl = document.getElementById("cl-import-progress");
  const show = (msg) => {
    dbg.log("[import]", msg);
    if (progressEl) {
      progressEl.textContent = msg;
      progressEl.style.display = "block";
    }
  };

  try {
    // ── Phase 1: Bulk problem index (difficulty + title from REST API) ──
    show("Building problem index…");
    const diffMap = {};
    const titleMap = {};
    const tagsMap = {};
    const descMap = {};
    const hintsMap = {};
    const acRateMap = {};
    const similarMap = {};

    try {
      const apiRes = await fetch(CONSTANTS.PLATFORMS.leetcode.apiBase + "/problems/all/", {
        credentials: "include",
      });
      if (apiRes.ok) {
        const apiData = await apiRes.json();
        const LEVEL = { 1: "Easy", 2: "Medium", 3: "Hard" };
        for (const pair of apiData.stat_status_pairs || []) {
          const slug = pair.stat?.question__title_slug;
          const level = pair.difficulty?.level;
          const title = pair.stat?.question__title;
          if (slug) {
            if (level) diffMap[slug] = LEVEL[level];
            if (title) titleMap[slug] = title;
          }
        }
        show(`Problem index: ${Object.keys(diffMap).length} entries.`);
      } else {
        show("Problem index unavailable — will fetch per-problem.");
      }
    } catch (_) {
      show("Problem index fetch failed — will fetch per-problem.");
    }

    // ── Phase 2: Paginate accepted submissions via REST API ──
    show("Fetching submission history…");
    const allSubs = [];
    let offset = 0;
    const PAGE = 20;
    let pageNum = 0;

    while (true) {
      show(`Fetching submissions page ${++pageNum}…`);
      let pageData;
      let lastErr;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await fetch(
            `${CONSTANTS.PLATFORMS.leetcode.apiBase}/submissions/?offset=${offset}&limit=${PAGE}`,
            { credentials: "include" },
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          pageData = await res.json();
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (attempt < 2) {
            show(`Page ${pageNum} failed (${e.message}) — retrying…`);
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      }
      if (lastErr) {
        throw new Error(
          `Submission fetch failed (page ${pageNum}): ${lastErr.message}. Make sure you are logged in to LeetCode.`,
        );
      }

      const raw = pageData.submissions_dump || pageData.submissions || [];
      for (const s of raw) {
        const titleSlug = s.title_slug || s.titleSlug || "";
        const langSlug = (s.lang || "").toLowerCase().replace(/\s+/g, "");
        const statusOk = s.status_display === "Accepted" || s.statusDisplay === "Accepted";
        if (!statusOk || !titleSlug) continue;
        const tsRaw = Number(s.timestamp || s.time || 0);
        const ts = tsRaw > 4_102_444_800 ? tsRaw : tsRaw * 1000;
        allSubs.push({
          titleSlug,
          title: s.title || titleSlug,
          lang: langSlug,
          langName: s.lang_name || s.langName || langSlug,
          runtime: s.runtime || "",
          memory: s.memory || "",
          timestamp: ts,
          id: s.id,
        });
      }

      if (!pageData.has_next) break;
      offset += PAGE;
      await new Promise((r) => setTimeout(r, 600));
    }

    if (allSubs.length === 0) {
      show("No accepted submissions found. Make sure you are logged in to LeetCode.");
      btn.disabled = false;
      return;
    }

    const picks = allSubs.slice();
    show(`Found ${picks.length} accepted submissions (preserving all languages).`);

    // ── Phase 4: Fetch metadata via QUESTION query ──
    const needMeta = [
      ...new Set(
        picks.filter((s) => !diffMap[s.titleSlug] || !tagsMap[s.titleSlug]).map((s) => s.titleSlug),
      ),
    ];

    if (needMeta.length > 0) {
      show(`Fetching tags & descriptions for ${needMeta.length} problems…`);
      for (let i = 0; i < needMeta.length; i++) {
        const slug = needMeta[i];
        try {
          const meta = await fetchMetadata(slug, QUERIES, handler._getCsrf());
          if (meta) {
            if (meta.difficulty) diffMap[slug] = meta.difficulty;
            if (meta.title) titleMap[slug] = meta.title;
            if (meta.topicTags?.length) tagsMap[slug] = meta.topicTags.map((t) => t.name);
            if (meta.content) descMap[slug] = meta.content;
            if (meta.hints?.length) hintsMap[slug] = meta.hints;
            if (meta.acRate != null) acRateMap[slug] = meta.acRate;
            if (meta.similarQuestionList?.length) similarMap[slug] = meta.similarQuestionList;
          }
        } catch (_) {}
        if (i < needMeta.length - 1) await new Promise((r) => setTimeout(r, 200));
        if ((i + 1) % 10 === 0) show(`Tags… ${i + 1}/${needMeta.length}`);
      }
    }

    // ── Phase 4b: Fetch submission code via GraphQL submissionDetails ──
    const BATCH = 3;
    let codeFailed = 0;
    show(`Fetching code for ${picks.length} submissions…`);
    for (let i = 0; i < picks.length; i += BATCH) {
      const batch = picks.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (sub) => {
          if (!sub.id) return;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const res = await _gqlCall(
                QUERIES.SUBMISSION_DETAIL,
                { submissionId: +sub.id },
                handler._getCsrf(),
              );
              const d = res.data?.submissionDetails;
              if (d) {
                if (d.code) sub.code = d.code;
                if (d.runtimeDisplay) sub.runtime = d.runtimeDisplay;
                if (d.memoryDisplay) sub.memory = d.memoryDisplay;
                if (d.runtimePercentile) sub.runtimePct = d.runtimePercentile;
                if (d.memoryPercentile) sub.memoryPct = d.memoryPercentile;
              }
              break;
            } catch (e) {
              if (attempt === 0) {
                await new Promise((r) => setTimeout(r, 1000));
              } else {
                dbg.warn(
                  `[import] code fetch failed for sub ${sub.id} (${sub.titleSlug}):`,
                  e?.message,
                );
                codeFailed++;
              }
            }
          }
        }),
      );
      if (i + BATCH < picks.length) await new Promise((r) => setTimeout(r, 400));
      if ((i / BATCH) % 5 === 0 || i + BATCH >= picks.length) {
        show(`Code ${Math.min(i + BATCH, picks.length)}/${picks.length}…`);
      }
    }

    const withCode = picks.filter((s) => !!s.code);
    const noCodeCount = picks.length - withCode.length;
    if (noCodeCount > 0) {
      show(
        `Note: ${noCodeCount} submission(s) had no code after retry and will be skipped.` +
          ` Use the Problem Modal "Recover Code" button to fetch them individually.`,
      );
      await new Promise((r) => setTimeout(r, 2500));
    }

    if (withCode.length === 0) {
      show("No submissions with code found — nothing to import.");
      btn.disabled = false;
      return;
    }

    // ── Phase 5: Send all problems as one atomic BULK_IMPORT ──
    show(
      `Importing ${withCode.length} submission(s)${noCodeCount > 0 ? ` (${noCodeCount} skipped, no code)` : ""}…`,
    );

    const settings = await Storage.getSettings();
    const bulkProblems = withCode.map((sub) => {
      const lang = resolveLang(sub.lang || sub.langName);
      const tags = tagsMap[sub.titleSlug] || [];
      const topic = resolvePrimaryTopic(tags);
      const title = titleMap[sub.titleSlug] || sub.title || sub.titleSlug;
      const difficulty = diffMap[sub.titleSlug] || "Unknown";
      const canonical = null;

      const files = [];
      if (sub.code) {
        files.push({
          path: solutionPath(sub.titleSlug, "leetcode", lang, canonical, settings),
          content: sub.code,
        });
      }

      const readmeContent =
        descMap[sub.titleSlug] || sub.code
          ? buildBulkReadme(sub, {
              title,
              difficulty,
              tags,
              acRate: acRateMap[sub.titleSlug] ?? null,
              similar: similarMap[sub.titleSlug] || [],
              descHtml: descMap[sub.titleSlug] || null,
            })
          : null;

      if (readmeContent) {
        files.push({
          path: readmePath(sub.titleSlug, canonical, settings, "leetcode"),
          content: readmeContent,
        });
      }

      return {
        id: handler.makeProblemId(`${sub.titleSlug}::${sub.id || Date.now()}`),
        submissionId: sub.id || null,
        platform: "leetcode",
        title,
        titleSlug: sub.titleSlug,
        difficulty,
        lang: { name: lang.verbose, ext: lang.ext, slug: lang.slug },
        tags,
        topic,
        code: sub.code || "",
        readmeContent: readmeContent || null,
        files,
        timestamp: sub.timestamp,
        runtime: sub.runtime || null,
        memory: sub.memory || null,
        runtimePct: sub.runtimePct || null,
        memoryPct: sub.memoryPct || null,
        problemStatement: descMap[sub.titleSlug] || null,
        hints: hintsMap[sub.titleSlug] || null,
        acRate: acRateMap[sub.titleSlug] ?? null,
        similar: similarMap[sub.titleSlug] || null,
        hasSimilar: similarMap[sub.titleSlug]?.length > 0 || null,
      };
    });

    const result = await new Promise((resolve) => {
      runtime.sendMessage({ type: "BULK_IMPORT", problems: bulkProblems }, (res) =>
        resolve(res || {}),
      );
    });
    const imported = result.saved ?? bulkProblems.length;

    const skippedMsg = noCodeCount > 0 ? ` (${noCodeCount} skipped — no code)` : "";
    show(`Done! Imported ${imported} submission(s)${skippedMsg}.`);
    btn.textContent = `✓ Imported ${imported} solves`;
    btn.style.color = "#34d399";
    btn.style.borderColor = "rgba(52,211,153,0.4)";

    if (imported > 0) {
      const commitBtn = document.createElement("button");
      commitBtn.style.cssText =
        "display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;" +
        "font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;margin-top:8px;" +
        "border:1px solid rgba(6,182,212,0.4);color:#67e8f9;background:rgba(6,182,212,0.08);transition:background 0.2s;";
      commitBtn.innerHTML =
        `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M4 12a8 8 0 018-8V2.5a.5.5 0 01.854-.354l3 3a.5.5 0 010 .708l-3 3A.5.5 0 0112 8.5V7a5 5 0 105 5h1.5a6.5 6.5 0 11-14.5 0z"/></svg>` +
        ` Commit ${imported} to GitHub`;
      commitBtn.onmouseenter = () => {
        commitBtn.style.background = "rgba(6,182,212,0.18)";
      };
      commitBtn.onmouseleave = () => {
        commitBtn.style.background = "rgba(6,182,212,0.08)";
      };
      onTrustedClick(commitBtn, async () => {
        commitBtn.disabled = true;
        commitBtn.textContent = "⏳ Committing…";
        show("Committing to GitHub…");
        try {
          const result = await new Promise((resolve) => {
            runtime.sendMessage(
              {
                type: "RESYNC_ALL",
                // Individual mode: one commit per problem, backdated to the
                // real submission time — bulk would flatten every date to now.
                mode: "individual",
                commitType: "comprehensive-update",
              },
              (res) => resolve(res || {}),
            );
          });
          if (result.ok) {
            show(`✓ Committed ${result.committed ?? imported} problems to GitHub.`);
            commitBtn.textContent = `✓ Committed ${result.committed ?? imported}`;
            commitBtn.style.color = "#34d399";
          } else {
            throw new Error(result.error || "Unknown error");
          }
        } catch (e) {
          dbg.error("Bulk commit failed", e);
          show(`Commit failed: ${e.message}`);
          commitBtn.textContent = "↺ Retry";
          commitBtn.disabled = false;
        }
      });
      btn.parentElement?.appendChild(commitBtn);

      try {
        runtime.sendMessage({ type: "SYNC_PREVIEW" }, (res) => {
          if (!res) return;
          const pending =
            res.pendingConflicts || res.pendingConflicts === 0
              ? res.pendingConflicts
              : (res.conflicts || []).length;
          if (pending > 0) {
            show(
              `Sync paused — ${pending} conflict${pending !== 1 ? "s" : ""} need review. Opening Settings…`,
            );
            try {
              tabs.create({
                url: runtime.getURL("library/library.html?tab=settings&settingsTab=git"),
              });
            } catch (_) {}
          } else if (res.pendingRemoteOnly) {
            show(
              `Imported ${imported} solves. ${res.pendingRemoteOnly} remote-only items detected.`,
            );
          }
        });
      } catch (e) {
        dbg.warn("SYNC_PREVIEW call failed", e);
      }
    }
  } catch (e) {
    dbg.error("Profile import failed", e);
    show(`Import failed: ${e.message}`);
    btn.disabled = false;
    btn.textContent = "↺ Retry Import";
  }
}

export async function injectProgressImportBtn(handler) {
  if (document.getElementById("cl-profile-import")) return;

  const MAX_ATTEMPTS = 16;
  const RETRY_MS = 500;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (document.getElementById("cl-profile-import")) return;

    const anchor =
      document.querySelector("[class*='progress-header']") ||
      document.querySelector("[class*='userProfile'], [class*='user-profile']") ||
      document.querySelector("h1, h2") ||
      document.querySelector("main");

    if (anchor) {
      const username = null;
      const container = document.createElement("div");
      container.style.cssText =
        "margin:12px 0;display:flex;align-items:center;justify-content:flex-end;gap:10px;width:100%;";

      const btn = createImportBtn(handler, username);
      const prog = document.createElement("div");
      prog.id = "cl-import-progress";
      prog.style.cssText = "font-size:12px;color:#94a3b8;display:none;";

      container.appendChild(btn);
      container.appendChild(prog);
      anchor.parentElement?.insertBefore(container, anchor) || document.body.appendChild(container);
      return;
    }

    await new Promise((r) => setTimeout(r, RETRY_MS));
  }

  if (!document.getElementById("cl-profile-import")) {
    const floater = document.createElement("div");
    floater.style.cssText =
      "position:fixed;bottom:80px;right:20px;z-index:9999;" +
      "display:flex;flex-direction:column;gap:6px;align-items:flex-end;";
    const btn = createImportBtn(handler, null);
    btn.style.boxShadow = "0 4px 24px rgba(6,182,212,0.12)";
    const prog = document.createElement("div");
    prog.id = "cl-import-progress";
    prog.style.cssText =
      "font-size:12px;color:#94a3b8;display:none;max-width:320px;text-align:right;";
    floater.appendChild(prog);
    floater.appendChild(btn);
    document.body.appendChild(floater);
  }
}

export function removeProgressImportButton() {
  document.getElementById("cl-profile-import")?.remove();
  document.getElementById("cl-import-progress")?.remove();
}
