/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GFG bulk profile import — reads solved problems from the GFG user profile
 * page (__NEXT_DATA__ JSON) and saves them to IndexedDB.
 */

import { createDebugger } from "../../../lib/debug.js";
import { Storage } from "../../../core/storage.js";
import { normalizeDifficulty } from "../../../core/difficulty-map.js";
import { resolvePrimaryTopic } from "../../../core/topic-resolver.js";
import { runtime } from "../../../lib/browser-compat.js";

const dbg = createDebugger("GFGProfileImport");

const DIFFICULTY_ORDER = ["school", "basic", "easy", "medium", "hard"];

/**
 * Parse the __NEXT_DATA__ script tag on the current GFG profile page.
 * @returns {{ username: string, submissions: Array<{slug, title, difficulty}> } | null}
 */
function parseProfileData() {
    try {
        const script = document.getElementById("__NEXT_DATA__");
        if (!script) return null;
        const json = JSON.parse(script.textContent || "{}");
        const props = json?.props?.pageProps;
        if (!props) return null;

        const username = props?.userInfo?.handle || props?.userInfo?.userName || "";
        const submissionsInfo = props?.userSubmissionsInfo || {};

        const submissions = [];
        for (const diff of DIFFICULTY_ORDER) {
            const bucket = submissionsInfo[diff] || {};
            for (const key of Object.keys(bucket)) {
                const entry = bucket[key];
                submissions.push({
                    slug: entry.slug || entry.pname?.toLowerCase().replace(/\s+/g, "-") || key,
                    title: entry.pname || key,
                    difficulty: normalizeDifficulty(diff),
                });
            }
        }

        dbg.log(`parseProfileData(): ${submissions.length} problems for user "${username}"`);
        return { username, submissions };
    } catch (e) {
        dbg.error("parseProfileData() failed", e);
        return null;
    }
}

/**
 * Inject the "Import All Solves" button on the GFG profile page.
 * @param {Function} makeProblemId - bound method from the handler
 */
export async function injectProfileImportBtn(makeProblemId) {
    if (document.getElementById("cl-gfg-profile-import")) return;

    const MAX_ATTEMPTS = 20;
    const RETRY_MS = 500;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (document.getElementById("cl-gfg-profile-import")) return;

        // Find a suitable anchor (profile header or stat card)
        const anchor =
            document.querySelector('[class*="profile_head"]') ||
            document.querySelector('[class*="scoreCard_head"]') ||
            document.querySelector('[class*="userHandle"]') ||
            document.querySelector("h1") ||
            document.querySelector("main");

        if (anchor) {
            const container = document.createElement("div");
            container.style.cssText = "margin:12px 0;display:flex;align-items:center;justify-content:flex-end;gap:10px;width:100%;";

            const btn = _createImportButton();
            const prog = document.createElement("div");
            prog.id = "cl-gfg-import-progress";
            prog.style.cssText = "font-size:12px;color:#94a3b8;display:none;";

            container.appendChild(btn);
            container.appendChild(prog);

            const parent = anchor.parentElement;
            if (parent) {
                parent.insertBefore(container, anchor);
            } else {
                document.body.appendChild(container);
            }

            btn.addEventListener("click", () => runProfileImport(makeProblemId, btn));
            return;
        }

        await new Promise((r) => setTimeout(r, RETRY_MS));
    }

    // Floating fallback
    if (!document.getElementById("cl-gfg-profile-import")) {
        const floater = document.createElement("div");
        floater.style.cssText = "position:fixed;bottom:80px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:6px;align-items:flex-end;";
        const btn = _createImportButton();
        btn.style.boxShadow = "0 4px 24px rgba(6,182,212,0.12)";
        const prog = document.createElement("div");
        prog.id = "cl-gfg-import-progress";
        prog.style.cssText = "font-size:12px;color:#94a3b8;display:none;max-width:320px;text-align:right;";
        floater.appendChild(prog);
        floater.appendChild(btn);
        document.body.appendChild(floater);
        btn.addEventListener("click", () => runProfileImport(makeProblemId, btn));
    }
}

function _createImportButton() {
    const btn = document.createElement("button");
    btn.id = "cl-gfg-profile-import";
    btn.style.cssText =
        "display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;" +
        "font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;" +
        "border:1px solid rgba(6,182,212,0.4);color:#67e8f9;" +
        "background:rgba(6,182,212,0.08);transition:background 0.2s;";
    btn.onmouseenter = () => { btn.style.background = "rgba(6,182,212,0.18)"; };
    btn.onmouseleave = () => { btn.style.background = "rgba(6,182,212,0.08)"; };
    btn.innerHTML =
        `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">` +
        `<path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm1 14H11v-4H8l4-4 4 4h-3v4z"/>` +
        `</svg> Import All Solves to CodeLedger`;
    return btn;
}

export function removeProfileImportBtn() {
    document.getElementById("cl-gfg-profile-import")?.remove();
    document.getElementById("cl-gfg-import-progress")?.remove();
}

async function runProfileImport(makeProblemId, btn) {
    btn.disabled = true;
    const progressEl = document.getElementById("cl-gfg-import-progress");
    const show = (msg) => {
        dbg.log("[import]", msg);
        if (progressEl) { progressEl.textContent = msg; progressEl.style.display = "block"; }
    };

    try {
        show("Reading profile data…");
        const profileData = parseProfileData();

        if (!profileData) {
            show("Could not read profile data. Make sure you are on your GFG profile page and logged in.");
            btn.disabled = false;
            return;
        }

        const { username, submissions } = profileData;
        if (submissions.length === 0) {
            show("No solved problems found in your profile.");
            btn.disabled = false;
            return;
        }

        show(`Found ${submissions.length} solved problems. Building import…`);

        const bulkProblems = submissions.map((sub) => {
            const tags = [];
            const topic = resolvePrimaryTopic(tags);

            return {
                id: makeProblemId(`${sub.slug}`),
                platform: "geeksforgeeks",
                title: sub.title,
                titleSlug: sub.slug,
                difficulty: sub.difficulty || "Unknown",
                lang: { name: "Unknown", ext: "txt", slug: "unknown" },
                tags,
                topic,
                code: "",
                files: [],
                timestamp: Date.now(),
                runtime: null,
                memory: null,
                problemStatement: null,
                _importedFromProfile: true,
                _needsCodeFetch: true,
            };
        });

        show(`Importing ${bulkProblems.length} problems to CodeLedger…`);

        const result = await new Promise((resolve) => {
            runtime.sendMessage(
                { type: "BULK_IMPORT", problems: bulkProblems },
                (res) => resolve(res || {})
            );
        });

        const imported = result.saved ?? bulkProblems.length;
        show(`Done! Imported ${imported} solved problem(s) (code will be fetched when you visit each problem).`);
        btn.textContent = `✓ Imported ${imported} solves`;
        btn.style.color = "#34d399";
        btn.style.borderColor = "rgba(52,211,153,0.4)";

    } catch (e) {
        dbg.error("GFG profile import failed", e);
        show(`Import failed: ${e.message}`);
        btn.disabled = false;
        btn.textContent = "↺ Retry Import";
    }
}
